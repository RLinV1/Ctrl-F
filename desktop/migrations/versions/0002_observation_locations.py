"""Add grounded location descriptions and allow observations without scores.

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("detections", sa.Column("location_description", sa.Text(), nullable=True))
    op.alter_column("detections", "confidence", existing_type=sa.REAL(), nullable=True)


def downgrade() -> None:
    # Unknown confidence must not be replaced by a fabricated numeric score.
    # Refuse downgrade when nullable rows exist; retain evidence instead.
    bind = op.get_bind()
    count = bind.scalar(sa.text("SELECT count(*) FROM detections WHERE confidence IS NULL"))
    if count:
        raise RuntimeError("Cannot downgrade unscored observations; restore the application without rolling back schema")
    op.alter_column("detections", "confidence", existing_type=sa.REAL(), nullable=False)
    op.drop_column("detections", "location_description")
