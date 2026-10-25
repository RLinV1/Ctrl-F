"""Postgres tables. `migrations/versions/` must match these.

Photos link to items through `detections` (one photo can show many items).
Media lives in S3; rows store the object key, never a URL (photos are private,
so readers sign the key when they show it).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    REAL,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


JOB_STATUSES = ("pending", "claimed", "done", "failed")


class Zone(Base):
    """A named area of the fixed camera view ("desk"). `polygon` is [[x, y], ...] in 0..1."""

    __tablename__ = "zones"

    id: Mapped[uuid.UUID] = _id()
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    polygon: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = _created()


class Job(Base):
    """One voice request. Columns follow the web-ui design (Decision 4)."""

    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending', 'claimed', 'done', 'failed')", name="ck_jobs_status"
        ),
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = _id()
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    audio_key: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[str | None] = mapped_column(Text)
    targets: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )
    found: Mapped[bool | None] = mapped_column(Boolean)
    corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    reply_text: Mapped[str | None] = mapped_column(Text)
    reply_audio_key: Mapped[str | None] = mapped_column(Text)
    reply_timings: Mapped[list | None] = mapped_column(JSONB)  # [{word, start, end}]
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Photo(Base):
    """One camera photo. The image is in S3 at `s3_key`."""

    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = _id()
    s3_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    annotated_key: Mapped[str | None] = mapped_column(Text)  # copy with boxes drawn
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    model_version: Mapped[str | None] = mapped_column(Text)
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = _created()


class Item(Base):
    """A tracked thing. `name` is lowercase and matches a model class.

    `last_*` cache the newest detection of this item (its last location).
    """

    __tablename__ = "items"

    id: Mapped[uuid.UUID] = _id()
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )
    lost_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("zones.id", ondelete="SET NULL")
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("photos.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = _created()


class Detection(Base):
    """One box YOLO found in a photo. `item_id` is null for classes we don't track."""

    __tablename__ = "detections"
    __table_args__ = (Index("ix_detections_item_seen", "item_id", text("seen_at DESC")),)

    id: Mapped[uuid.UUID] = _id()
    photo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"))
    label: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(REAL, nullable=False)
    bbox: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {x, y, w, h} in 0..1
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )  # copy of photos.taken_at


class DeviceHeartbeat(Base):
    """When the Pi or the desktop was last heard from."""

    __tablename__ = "device_heartbeats"
    __table_args__ = (
        CheckConstraint("device in ('pi', 'desktop')", name="ck_device_heartbeats_device"),
    )

    device: Mapped[str] = mapped_column(Text, primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
