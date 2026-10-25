"""Write one processed photo to Postgres."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Detection, Item, Job, Photo, Zone
from .zones import assign_zone


@dataclass(frozen=True)
class Box:
    """One YOLO box. `bbox` is {x, y, w, h} as fractions of the image."""

    label: str
    confidence: float
    bbox: dict


def box_from_yolo(d: dict) -> Box:
    """`server.py` detections are {"name", "conf", "box": [x1, y1, x2, y2]} (normalized)."""
    x1, y1, x2, y2 = d["box"]
    return Box(d["name"], float(d["conf"]), {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1})


def job_id_from_key(key: str) -> uuid.UUID | None:
    """`incoming/<job uuid>.jpg` -> the job id, or None when the name isn't a UUID."""
    stem = key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    try:
        return uuid.UUID(stem)
    except ValueError:
        return None


@dataclass(frozen=True)
class Saved:
    photo_id: uuid.UUID
    created: bool  # False when this S3 key was stored before (nothing else changed)


def save_result(
    session: Session,
    *,
    s3_key: str,
    taken_at: datetime,
    width: int,
    height: int,
    boxes: Sequence[Box],
    targets: Sequence[str] = (),
    annotated_key: str | None = None,
    model_version: str | None = None,
    job_id: uuid.UUID | None = None,
) -> Saved:
    """Store a photo, its detections, each item's last location, lost counts and the job.

    Runs in one transaction, so `session` must not have one open. Re-saving an S3 key
    already stored changes nothing.
    """
    with session.begin():
        targets = [t.lower() for t in targets]
        items = session.scalars(select(Item)).all()
        by_name: dict[str, Item] = {}
        for item in items:
            by_name[item.name.lower()] = item
            for alias in item.aliases:
                by_name.setdefault(alias.lower(), item)
        seen = {by_name[b.label.lower()].id for b in boxes if b.label.lower() in by_name}
        found = any(t in by_name and by_name[t].id in seen for t in targets)

        if job_id is not None:
            # Upsert first: the photo row points to the job.
            values = {"status": "done", "targets": targets, "found": found}
            session.execute(
                insert(Job)
                .values(id=job_id, finished_at=func.now(), **values)
                .on_conflict_do_update(
                    index_elements=[Job.id],
                    set_={**values, "finished_at": func.now()},
                    # A reprocessed photo must not rewrite a finished job.
                    where=Job.finished_at.is_(None),
                )
            )

        photo_id = session.scalar(
            insert(Photo)
            .values(
                s3_key=s3_key,
                annotated_key=annotated_key,
                taken_at=taken_at,
                width=width,
                height=height,
                model_version=model_version,
                job_id=job_id,
            )
            .on_conflict_do_nothing(index_elements=[Photo.s3_key])
            .returning(Photo.id)
        )
        if photo_id is None:
            existing = session.scalar(select(Photo.id).where(Photo.s3_key == s3_key))
            return Saved(existing, created=False)

        zones = session.scalars(select(Zone).order_by(Zone.created_at, Zone.name)).all()
        best: dict[uuid.UUID, Detection] = {}  # most confident box per item
        for b in boxes:
            item = by_name.get(b.label.lower())
            det = Detection(
                photo_id=photo_id,
                item_id=item.id if item else None,
                label=b.label,
                confidence=b.confidence,
                bbox=b.bbox,
                zone_id=assign_zone(b.bbox, zones),
                seen_at=taken_at,
            )
            session.add(det)
            if item and (item.id not in best or b.confidence > best[item.id].confidence):
                best[item.id] = det

        for item_id, det in best.items():
            # Only a newer photo moves the item, so late photos can't go back in time.
            session.execute(
                update(Item)
                .where(
                    Item.id == item_id,
                    or_(Item.last_seen_at.is_(None), Item.last_seen_at < taken_at),
                )
                .values(last_seen_at=taken_at, last_photo_id=photo_id, last_zone_id=det.zone_id)
            )

        missing = {by_name[t].id for t in targets if t in by_name} - seen
        if missing:
            session.execute(
                update(Item).where(Item.id.in_(missing)).values(lost_count=Item.lost_count + 1)
            )
        return Saved(photo_id, created=True)
