"""Download a Roboflow Universe dataset in YOLO format into its own folder under training/datasets/.

    python training/fetch_roboflow.py wallet-iiyy3 project-qysdi 1 --info      # license, size, classes; no download
    python training/fetch_roboflow.py wallet-iiyy3 project-qysdi 1 --out "training/datasets/Fourth Model"

Needs ROBOFLOW_API_KEY in .env (a free key from your Roboflow account settings). The key is sent only to
api.roboflow.com. The zip is untrusted data: each member is checked and written under the new folder, nothing in
it is executed. Only datasets under a free license (CC BY 4.0, CC0, public domain) are downloaded.
"""
import argparse
import io
import os
import sys
import time
import zipfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.roboflow.com"
FREE = {"cc by 4.0", "cc0 1.0", "public domain"}  # anything else (NC, ND, unknown) is refused


def load_key() -> str:
    env = ROOT / ".env"
    for line in env.read_text(encoding="utf-8").splitlines() if env.exists() else []:
        if line.startswith("ROBOFLOW_API_KEY="):
            os.environ.setdefault("ROBOFLOW_API_KEY", line.split("=", 1)[1].strip())
    return os.environ.get("ROBOFLOW_API_KEY") or sys.exit("ROBOFLOW_API_KEY is not set. Put it in .env.")


def version_info(project: str, workspace: str, version: int, key: str) -> dict:
    res = requests.get(f"{API}/{workspace}/{project}/{version}", params={"api_key": key}, timeout=30)
    if not res.ok:
        sys.exit(f"Roboflow returned {res.status_code} for {workspace}/{project}/{version}: {res.text[:200]}")
    return res.json()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("project")
    parser.add_argument("workspace")
    parser.add_argument("version", type=int)
    parser.add_argument("--out", type=Path, default=ROOT / "training" / "datasets")
    parser.add_argument("--format", default="yolov11")
    parser.add_argument("--info", action="store_true", help="print what the dataset is and stop")
    args = parser.parse_args()
    key = load_key()

    info = version_info(args.project, args.workspace, args.version, key)
    meta, proj = info.get("version", {}), info.get("project", {})
    print(f"{args.workspace}/{args.project} v{args.version}: license {proj.get('license')!r}, type {proj.get('type')!r}")
    print(f"  images {meta.get('images')}, splits {meta.get('splits')}, classes {list((proj.get('classes') or {}).keys())}")
    if args.info:
        return
    if str(proj.get("license")).lower() not in FREE:
        sys.exit(f"Refusing to download: license {proj.get('license')!r} is not one of {sorted(FREE)}.")

    for _ in range(40):  # Roboflow builds a fresh export in the background; it answers 202 until the zip is ready
        export = requests.get(f"{API}/{args.workspace}/{args.project}/{args.version}/{args.format}", params={"api_key": key}, timeout=120)
        link = export.json().get("export", {}).get("link") if export.ok else None
        if link or export.status_code != 202:
            break
        time.sleep(10)
    if not link:
        sys.exit(f"No {args.format} export available: {export.status_code} {export.text[:200]}")
    data = requests.get(link, timeout=600).content
    target = args.out / f"{args.project}.v{args.version}.{args.format}"
    if target.exists():
        sys.exit(f"{target} already exists; delete it first.")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in archive.namelist():
            path = (target / name).resolve()
            if name.endswith("/") or not path.is_relative_to(target.resolve()):
                continue  # skip folders and anything that would land outside the new folder
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.read(name))
    print(f"saved to {target}")


if __name__ == "__main__":
    main()
