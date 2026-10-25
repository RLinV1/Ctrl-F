"""save_result against a real Postgres (see conftest.py)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ctrlf_db.models import Detection, Item, Job, Photo, Zone
from ctrlf_db.repo import Box, box_from_yolo, job_id_from_key, save_result
from ctrlf_db.seed import add_items

NINE = datetime(2026, 10, 24, 9, 0, tzinfo=UTC)
TEN = datetime(2026, 10, 24, 10, 0, tzinfo=UTC)
EIGHT = datetime(2026, 10, 24, 8, 0, tzinfo=UTC)

LEFT_HALF = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]
RIGHT_HALF = [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]


def on_left(label: str, conf: float = 0.9) -> Box:
    return Box(label, conf, {"x": 0.1, "y": 0.5, "w": 0.2, "h": 0.2})


def on_right(label: str, conf: float = 0.9) -> Box:
    return Box(label, conf, {"x": 0.6, "y": 0.5, "w": 0.2, "h": 0.2})


def save(session: Session, key: str, taken_at: datetime, boxes: list[Box], **kw):
    return save_result(
        session, s3_key=key, taken_at=taken_at, width=1280, height=720, boxes=boxes, **kw
    )


def setup_world(session: Session) -> dict[str, uuid.UUID]:
    add_items(session, ["keys", "wallet"])
    with session.begin():
        couch, desk = Zone(name="couch", polygon=LEFT_HALF), Zone(name="desk", polygon=RIGHT_HALF)
        session.add_all([couch, desk])
    return {"couch": couch.id, "desk": desk.id}


def item(session: Session, name: str) -> Item:
    session.expire_all()
    row = session.scalars(select(Item).where(Item.name == name)).one()
    session.commit()  # end the read so the next save_result can begin its own transaction
    return row


def test_ids_are_generated_uuids(session: Session) -> None:
    add_items(session, ["keys", "wallet"])
    ids = session.scalars(select(Item.id)).all()
    assert len(set(ids)) == 2 and all(isinstance(i, uuid.UUID) for i in ids)


def test_one_photo_links_to_two_items(session: Session) -> None:
    zones = setup_world(session)
    saved = save(session, "incoming/a.jpg", NINE, [on_left("keys"), on_right("Wallet")])

    dets = session.scalars(select(Detection).where(Detection.photo_id == saved.photo_id)).all()
    assert {d.item_id for d in dets} == {item(session, "keys").id, item(session, "wallet").id}
    keys, wallet = item(session, "keys"), item(session, "wallet")
    assert (keys.last_zone_id, keys.last_seen_at, keys.last_photo_id) == (
        zones["couch"],
        NINE,
        saved.photo_id,
    )
    assert wallet.last_zone_id == zones["desk"]


def test_photo_stores_key_not_url(session: Session) -> None:
    saved = save(
        session,
        "incoming/a.jpg",
        NINE,
        [],
        annotated_key="results/a_result.jpg",
        model_version="best.pt",
    )
    photo = session.get(Photo, saved.photo_id)
    assert (photo.s3_key, photo.annotated_key, photo.taken_at) == (
        "incoming/a.jpg",
        "results/a_result.jpg",
        NINE,
    )


def test_untracked_label_is_kept_without_item(session: Session) -> None:
    setup_world(session)
    save(session, "incoming/a.jpg", NINE, [on_left("person")])
    det = session.scalars(select(Detection)).one()
    assert det.label == "person" and det.item_id is None and det.seen_at == NINE


def test_alias_matches_item(session: Session) -> None:
    add_items(session, ["keys"])
    with session.begin():
        session.scalars(select(Item)).one().aliases = ["keychain"]
    save(session, "incoming/a.jpg", NINE, [on_left("keychain")])
    assert item(session, "keys").last_seen_at == NINE


def test_newer_photo_moves_item_older_does_not(session: Session) -> None:
    zones = setup_world(session)
    save(session, "incoming/nine.jpg", NINE, [on_left("keys")])
    ten = save(session, "incoming/ten.jpg", TEN, [on_right("keys")])
    assert item(session, "keys").last_zone_id == zones["desk"]

    save(session, "incoming/eight.jpg", EIGHT, [on_left("keys")])  # processed late
    keys = item(session, "keys")
    assert (keys.last_zone_id, keys.last_seen_at, keys.last_photo_id) == (
        zones["desk"],
        TEN,
        ten.photo_id,
    )


def test_most_confident_box_sets_location(session: Session) -> None:
    zones = setup_world(session)
    save(session, "incoming/a.jpg", NINE, [on_left("keys", 0.4), on_right("keys", 0.8)])
    assert item(session, "keys").last_zone_id == zones["desk"]


def test_no_zone_when_outside_all(session: Session) -> None:
    add_items(session, ["keys"])
    save(session, "incoming/a.jpg", NINE, [on_left("keys")])
    assert session.scalars(select(Detection)).one().zone_id is None


def test_missing_target_counts_as_lost_and_job_recorded(session: Session) -> None:
    setup_world(session)
    job = uuid.uuid4()
    save(session, f"incoming/{job}.jpg", NINE, [on_left("keys")], targets=["wallet"], job_id=job)

    assert item(session, "wallet").lost_count == 1
    assert item(session, "keys").lost_count == 0
    row = session.get(Job, job)
    assert (row.status, row.found, row.targets) == ("done", False, ["wallet"])
    assert row.finished_at is not None
    assert session.scalars(select(Photo.job_id)).one() == job


def test_found_target(session: Session) -> None:
    setup_world(session)
    job = uuid.uuid4()
    save(session, "incoming/x.jpg", NINE, [on_left("keys")], targets=["Keys"], job_id=job)
    assert session.get(Job, job).found is True
    assert item(session, "keys").lost_count == 0


def test_existing_pending_job_is_finished(session: Session) -> None:
    setup_world(session)
    job = uuid.uuid4()
    with session.begin():
        session.add(Job(id=job, status="pending", transcript="where are my keys"))
    save(session, "incoming/x.jpg", NINE, [on_left("keys")], targets=["keys"], job_id=job)
    session.expire_all()
    row = session.get(Job, job)
    assert (row.status, row.found, row.transcript) == ("done", True, "where are my keys")


def test_reprocessing_changes_nothing(session: Session) -> None:
    setup_world(session)
    first = save(session, "incoming/a.jpg", NINE, [on_left("keys")], targets=["wallet"])
    again = save(session, "incoming/a.jpg", NINE, [on_left("keys")], targets=["wallet"])

    assert again.photo_id == first.photo_id and first.created and not again.created
    assert session.scalar(select(func.count()).select_from(Detection)) == 1
    assert item(session, "wallet").lost_count == 1


def test_seed_skips_existing(session: Session) -> None:
    assert add_items(session, ["Keys", "wallet"]) == 2
    assert add_items(session, ["keys", "remote", " "]) == 1
    assert sorted(session.scalars(select(Item.name))) == ["keys", "remote", "wallet"]


def test_yolo_box_and_job_key_helpers() -> None:
    b = box_from_yolo({"name": "keys", "conf": 0.5, "box": [0.1, 0.2, 0.4, 0.6]})
    assert b.label == "keys" and b.confidence == 0.5
    assert b.bbox == {"x": 0.1, "y": 0.2, "w": 0.30000000000000004, "h": 0.39999999999999997}
    job = uuid.uuid4()
    assert job_id_from_key(f"incoming/{job}.jpg") == job
    assert job_id_from_key("incoming/webcam-photo.jpg") is None
