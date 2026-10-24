"""Check that every dataset under training/datasets/ is free to use. Exits 1 if anything fails.

    python training/audit_licenses.py

Roboflow exports: the license is read from Roboflow itself (the project's own page data, via the API), not just from the
export's data.yaml, and the two must agree. Open Images: every credit row must be a CC BY license (no NC, ND or SA).
Free here means CC BY 4.0, CC0, public domain (CC BY 2.0 for Open Images photos). Needs ROBOFLOW_API_KEY in .env.
"""
import csv
import sys
from pathlib import Path

import requests
import yaml
from fetch_roboflow import API, FREE, load_key

DATASETS = Path(__file__).resolve().parent / "datasets"


def main() -> None:
    key = load_key()
    failures = 0
    print(f"{'dataset':58} {'data.yaml':14} {'Roboflow API':14} verdict")
    for data_yaml in sorted(DATASETS.rglob("data.yaml")):
        config = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}
        info = config.get("roboflow") or {}
        if not info.get("project"):
            continue
        folder = data_yaml.parent
        local = str(info.get("license"))
        res = requests.get(f"{API}/{info['workspace']}/{info['project']}", params={"api_key": key}, timeout=30)
        remote = str(res.json().get("project", {}).get("license")) if res.ok else f"HTTP {res.status_code}"
        ok = local.lower() in FREE and remote.lower() in FREE
        failures += not ok
        print(f"{folder.relative_to(DATASETS).as_posix()[:58]:58} {local:14} {remote:14} {'OK' if ok else 'NOT FREE or unverified'}")

    attribution = DATASETS / "personal" / "ATTRIBUTION.csv"
    if attribution.exists():
        with open(attribution, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        oi = [r for r in rows if not r["image_id"].startswith(("rf_", "lic_", "own_"))]
        bad = [r for r in oi if "/by/" not in r["license"] or any(x in r["license"] for x in ("-nc", "-nd", "-sa", "/by-"))]
        failures += bool(bad)
        print(f"{'Open Images V7 (' + str(len(oi)) + ' photos)':58} {'CC BY':14} {'per photo':14} {'OK' if not bad else f'{len(bad)} photos NOT plain CC BY'}")
        print(f"{'Your own photos':58} {'yours':14} {'-':14} OK ({sum(r['image_id'].startswith('own_') for r in rows)} in the training set)")
    print("\nAll datasets are free to use." if not failures else f"\n{failures} problem(s) found: remove those datasets before training.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
