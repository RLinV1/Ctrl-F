"""initial: zones, jobs, photos, items, detections, device_heartbeats

Revision ID: 0001
Revises:
Create Date: 2026-10-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def _created() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "zones",
        _id(),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("polygon", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "jobs",
        _id(),
        sa.Column("status", sa.Text(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("audio_key", sa.Text(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("targets", sa.ARRAY(sa.Text()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("found", sa.Boolean(), nullable=True),
        sa.Column("corrected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("reply_text", sa.Text(), nullable=True),
        sa.Column("reply_audio_key", sa.Text(), nullable=True),
        sa.Column("reply_timings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        _created(),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status in ('pending', 'claimed', 'done', 'failed')", name="ck_jobs_status"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_status_created", "jobs", ["status", "created_at"])
    op.create_table(
        "photos",
        _id(),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("annotated_key", sa.Text(), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("model_version", sa.Text(), nullable=True),
        sa.Column("job_id", sa.UUID(), nullable=True),
        _created(),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("s3_key"),
    )
    op.create_index(op.f("ix_photos_job_id"), "photos", ["job_id"])
    op.create_table(
        "items",
        _id(),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("aliases", sa.ARRAY(sa.Text()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("lost_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_zone_id", sa.UUID(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_photo_id", sa.UUID(), nullable=True),
        _created(),
        sa.ForeignKeyConstraint(["last_zone_id"], ["zones.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["last_photo_id"], ["photos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "detections",
        _id(),
        sa.Column("photo_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("confidence", sa.REAL(), nullable=False),
        sa.Column("bbox", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("zone_id", sa.UUID(), nullable=True),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["zone_id"], ["zones.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_detections_photo_id"), "detections", ["photo_id"])
    op.create_index(
        "ix_detections_item_seen", "detections", ["item_id", sa.literal_column("seen_at DESC")]
    )
    op.create_table(
        "device_heartbeats",
        sa.Column("device", sa.Text(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("device in ('pi', 'desktop')", name="ck_device_heartbeats_device"),
        sa.PrimaryKeyConstraint("device"),
    )


def downgrade() -> None:
    op.drop_table("device_heartbeats")
    op.drop_index("ix_detections_item_seen", table_name="detections")
    op.drop_index(op.f("ix_detections_photo_id"), table_name="detections")
    op.drop_table("detections")
    op.drop_table("items")
    op.drop_index(op.f("ix_photos_job_id"), table_name="photos")
    op.drop_table("photos")
    op.drop_index("ix_jobs_status_created", table_name="jobs")
    op.drop_table("jobs")
    op.drop_table("zones")
