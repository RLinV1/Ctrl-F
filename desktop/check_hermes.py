"""Explicit one-photo smoke check. Never runs from tests or at module import."""

import argparse
import os
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

from hermes import HermesClient, HermesConfig, HermesError, PhotoContext

ITEMS = ["phone", "glasses", "remote", "watch", "headphones", "keys", "wallet", "airpods case", "airpods", "charger"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    try:
        config = HermesConfig.from_env(os.environ)
        photo = PhotoContext(args.image.name, datetime.now(UTC), args.width, args.height)
        scene = HermesClient(config).analyze(args.image.read_bytes(), photo, {name: [] for name in ITEMS})
    except (HermesError, OSError) as error:
        # OSError text can include operator paths; keep the diagnostic generic.
        print(str(error) if isinstance(error, HermesError) else "Could not read the image file")
        return 1
    print(f"Hermes returned a valid scene with {len(scene.observations)} tracked-object observations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
