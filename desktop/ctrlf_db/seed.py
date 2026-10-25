"""Add tracked items. Existing names are left alone.

python -m ctrlf_db.seed keys wallet remote
python -m ctrlf_db.seed --from-model        # every class in YOLO_WEIGHTS_PATH
"""

import argparse
import os
from collections.abc import Iterable

from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Item
from .session import make_engine


def add_items(session: Session, names: Iterable[str]) -> int:
    """Insert lowercase names that aren't tracked yet. Returns how many were added."""
    rows = [{"name": n.strip().lower()} for n in names if n.strip()]
    if not rows:
        return 0
    with session.begin():
        added = session.scalars(
            insert(Item)
            .values(rows)
            .on_conflict_do_nothing(index_elements=[Item.name])
            .returning(Item.id)
        ).all()
    return len(added)


def model_classes() -> list[str]:
    from ultralytics import YOLO  # only needed for --from-model

    return list(YOLO(os.environ.get("YOLO_WEIGHTS_PATH") or "yolov8n.pt").names.values())


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("names", nargs="*", help="item names, e.g. keys wallet")
    parser.add_argument("--from-model", action="store_true", help="use the model's classes")
    args = parser.parse_args()
    names = list(args.names) + (model_classes() if args.from_model else [])
    if not names:
        parser.error("give item names or --from-model")
    with Session(make_engine()) as session:
        print(f"added {add_items(session, names)} of {len(names)} items")


if __name__ == "__main__":
    main()
