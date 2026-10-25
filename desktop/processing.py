"""Photo processing independent of the S3 loop and concrete Hermes transport."""

from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw
from sqlalchemy import select

from ctrlf_db import repo
from ctrlf_db.models import Item, Photo, Detection
from hermes import PhotoContext, Observation, Scene
from targets import item_name, MAX_TARGETS


def process_photo(image: bytes, key: str, taken_at: datetime, targets: list[str], agent, sessions) -> tuple[dict, bytes]:
    """Validate, persist, and publish factual results; all writes stay application-owned."""
    import io

    with Image.open(io.BytesIO(image)) as source:
        source.load()
        width, height = source.size
        annotated = source.convert("RGB")
    photo = PhotoContext(key, taken_at, width, height)
    with sessions() as session:
        items = session.scalars(select(Item).order_by(Item.name)).all()
        catalog = {i.name: list(i.aliases) for i in items}
        ids = {i.name: i.id for i in items}
    aliases = {alias.lower(): name for name, names in catalog.items() for alias in [name, *names]}
    if len(targets) > MAX_TARGETS:
        raise ValueError("Too many requested items")
    targets = list(dict.fromkeys(aliases.get(item_name(t), item_name(t)) for t in targets))
    # A DB commit can succeed before S3 publication fails. Rebuild that exact
    # persisted scene on retry, instead of publishing a different agent answer.
    with sessions() as session:
        existing = session.scalar(select(Photo).where(Photo.s3_key == key))
        saved_detections = session.scalars(select(Detection).where(Detection.photo_id == existing.id)).all() if existing else []
        if existing:
            photo = PhotoContext(key, existing.taken_at, existing.width, existing.height)
            taken_at = existing.taken_at
            scene = Scene(photo, existing.model_version or "legacy", tuple(
                Observation(aliases.get(d.label.lower(), d.label), d.bbox, d.location_description or "Recorded position in the photo", d.confidence)
                for d in saved_detections if d.item_id is not None))
        else:
            scene = None
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
                    supplied = repo.lookup_last_sighting(session, ids[target], taken_at)
                recalled = agent.recall(str(ids[target]), taken_at, supplied)
                # Recheck after the network call in case an older photo arrived meanwhile.
                with sessions() as session:
                    evidence = repo.lookup_last_sighting(session, ids[target], taken_at)
                # Agent-supplied evidence must match the authoritative newest DB record.
                if recalled.get("status") == "available" and evidence and recalled.get("detection_id") == evidence["detection_id"]:
                    result.update(history_status="available", last_sighting=evidence)
                elif recalled.get("status") == "never_seen" and evidence is None:
                    result["history_status"] = "never_seen"
                else:
                    result["history_status"] = "unavailable"
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
