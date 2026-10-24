"""Make a dataset yaml's `path:` absolute.

Ultralytics resolves a relative `path:` against its own datasets directory, not against the yaml file,
so the committed yamls (which use `../datasets/...`) would not be found. This writes a resolved copy.
"""
import tempfile
from pathlib import Path

import yaml


def resolved(data_yaml: Path) -> str:
    data_yaml = data_yaml.resolve()
    config = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    config["path"] = str((data_yaml.parent / config["path"]).resolve())
    out = Path(tempfile.mkdtemp()) / data_yaml.name
    out.write_text(yaml.safe_dump(config), encoding="utf-8")
    return str(out)
