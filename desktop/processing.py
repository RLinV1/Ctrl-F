"""Photo processing independent of the S3 loop and concrete Hermes transport."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw
from sqlalchemy import select

from ctrlf_db import repo
from ctrlf_db.models import Item, Photo, Detection
from hermes import PhotoContext, Observation, Scene
from targets import item_name, MAX_TARGETS


@dataclass(frozen=True)
class PreparedPhoto:
    photo: PhotoContext
    pixels: Image.Image
    scene: Scene | None


def prepare_photo(image: bytes, key: str, taken_at: datetime, sessions) -> PreparedPhoto:
    """Decode the image and detach any persisted scene using a private session."""
    import io

    with Image.open(io.BytesIO(image)) as source:
        source.load()
        photo = PhotoContext(key, taken_at, *source.size)
        pixels = source.convert("RGB")
    with sessions() as session:
        existing = session.scalar(select(Photo).where(Photo.s3_key == key))
        if existing:
            photo = PhotoContext(key, existing.taken_at, existing.width, existing.height)
            saved = session.scalars(select(Detection).where(Detection.photo_id == existing.id)).all()
            scene = Scene(photo, existing.model_version or "legacy", tuple(
                Observation(d.label, d.bbox, d.location_description or "Recorded position in the photo", d.confidence)
                for d in saved if d.item_id is not None))
        else:
            scene = None
    return PreparedPhoto(photo, pixels, scene)


def process_photo(image: bytes, key: str, taken_at: datetime, targets: list[str], agent, sessions,
                  *, prepared: PreparedPhoto | None = None) -> tuple[dict, bytes]:
    """Validate, persist, and publish factual results; all writes stay application-owned."""
    import io

    prepared = prepared if prepared is not None else prepare_photo(image, key, taken_at, sessions)
    photo, scene = prepared.photo, prepared.scene
    if photo.key != key:
        raise ValueError("Prepared photo key does not match request")
    taken_at, width, height = photo.taken_at, photo.width, photo.height
    annotated = prepared.pixels.copy()
    # Resolve targets/catalog after transcription, retaining target-guided vision
    # and any aliases registered while independent image preparation was running.
    with sessions() as session:
        items = session.scalars(select(Item).order_by(Item.name)).all()
        catalog = {i.name: list(i.aliases) for i in items}
    aliases = {alias.lower(): name for name, names in catalog.items() for alias in [name, *names]}
    if len(targets) > MAX_TARGETS:
        raise ValueError("Too many requested items")
    targets = list(dict.fromkeys(aliases.get(item_name(t), item_name(t)) for t in targets))
    if scene is not None:
        scene = Scene(photo, scene.model, tuple(
            Observation(aliases.get(o.item.lower(), o.item), o.bbox, o.location_description, o.confidence)
            for o in scene.observations))
    if scene is None:
        scene = agent.analyze(image, photo, catalog, targets)
    # Register only bounded requested/validated observed categories, then load IDs
    # before history lookup. Exact aliases remain attached to their original item.
    with sessions() as session:
        with session.begin():
            repo.ensure_items(session, [*targets, *(o.item for o in scene.observations)])
        items = session.scalars(select(Item).order_by(Item.name)).all()
        catalog = {i.name: list(i.aliases) for i in items}
        ids = {i.name: i.id for i in items}
    detections = []
    draw = ImageDraw.Draw(annotated)
    for obs in scene.observations:
        x, y, w, h = (obs.bbox[k] for k in ("x", "y", "w", "h"))
        detections.append({"name": obs.item, "conf": obs.confidence, "box": [x, y, x+w, y+h],
                           "location_description": obs.location_description})
        draw.rectangle((x*width, y*height, (x+w)*width, (y+h)*height), outline="#b58b40", width=3)
    results = []
    for target in targets:
        matches = sorted([d for d in detections if d["name"] == target],
                         key=lambda d: (-(d["conf"] if d["conf"] is not None else -1), d["box"]))
        result = {"item": target, "status": "found" if matches else "not_visible", "matches": matches,
                  "history_status": "not_needed", "last_sighting": None}
        if not matches:
            try:
                with sessions() as session:
                    evidence = repo.lookup_last_sighting(session, ids[target], taken_at)
                if evidence is not None:
                    result.update(history_status="available", last_sighting=evidence)
                else:
                    result["history_status"] = "never_seen"
            except Exception:
                result["history_status"] = "unavailable"
        results.append(result)
    annotated_key = f"results/{Path(key).stem}_result.jpg"
    with sessions() as session:
        repo.save_result(session, s3_key=key, taken_at=taken_at, width=width, height=height,
                         boxes=[repo.Box(o.item, o.confidence, o.bbox, o.location_description) for o in scene.observations],
                         targets=targets, annotated_key=annotated_key, model_version=scene.model,
                         job_id=repo.job_id_from_key(key))
    first = next((r for r in results if r["matches"]), results[0] if results else None)
    facts = {"version": 2, "status": first["status"] if first else "no_target",
             "target": first["item"] if first else None, "matches": first["matches"] if first else [],
             "items": results, "detections": detections, "known": list(catalog),
             "width": width, "height": height, "captured_at": taken_at.isoformat(),
             "history_status": first["history_status"] if first else "not_needed",
             "last_sighting": first["last_sighting"] if first else None,
             "model": scene.model, "persisted": True}
    out = io.BytesIO()
    annotated.save(out, format="JPEG")
    return facts, out.getvalue()
