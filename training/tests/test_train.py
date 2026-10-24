"""Offline CLI checks: no real model, downloads, or GPU required."""

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location("ctrlf_train", Path(__file__).parents[1] / "train.py")
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)


@pytest.fixture
def dataset(tmp_path):
    data = tmp_path / "data.yaml"
    data.write_text("train: images/train\nval: images/val\nnames: {0: keys}\n")
    return data


@pytest.fixture
def stub(monkeypatch, tmp_path):
    state = SimpleNamespace(calls=[], error=None, produce=True, run=tmp_path / "ctrlf2")

    class FakeYOLO:
        def __init__(self, weights):
            state.calls.append(weights)
            self.trainer = SimpleNamespace(save_dir=state.run)

        def train(self, **kwargs):
            state.options = kwargs
            if state.error:
                raise state.error
            if state.produce:
                best = state.run / "weights/best.pt"
                best.parent.mkdir(parents=True)
                best.write_bytes(b"stub weights")

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=FakeYOLO))
    return state


@pytest.mark.parametrize("option,value", [("--epochs", "0"), ("--epochs", "-1"),
    ("--imgsz", "0"), ("--batch", "-2"), ("--batch", "abc"), ("--name", "../old")])
def test_invalid_args_before_model(dataset, stub, option, value):
    with pytest.raises(SystemExit) as exc:
        train.main(["--data", str(dataset), option, value])
    assert exc.value.code == 2
    assert not stub.calls


def test_missing_data(tmp_path, stub, capsys):
    missing = tmp_path / "missing.yaml"
    with pytest.raises(SystemExit):
        train.main(["--data", str(missing)])
    assert str(missing) in capsys.readouterr().err
    assert not stub.calls


def test_help_without_dependencies(monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    with pytest.raises(SystemExit) as exc:
        train.main(["--help"])
    assert exc.value.code == 0
    assert "--data" in capsys.readouterr().out


def test_training_options_and_actual_output(dataset, stub, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    old = tmp_path / "ctrlf/weights/best.pt"
    old.parent.mkdir(parents=True)
    old.write_bytes(b"previous")
    assert train.main(["--data", "data.yaml", "--model", "custom.pt", "--epochs", "3",
                       "--imgsz", "320", "--batch", "2", "--device", "cpu",
                       "--project", str(tmp_path), "--name", "ctrlf"]) == 0
    assert stub.calls == ["custom.pt"]
    assert stub.options == dict(data=str(dataset), epochs=3, imgsz=320, batch=2,
        device="cpu", project=str(tmp_path), name="ctrlf", save=True, exist_ok=False)
    output = capsys.readouterr().out
    assert f'YOLO_WEIGHTS_PATH="{stub.run}/weights/best.pt"' in output
    assert old.read_bytes() == b"previous"


def test_defaults(dataset, stub):
    assert train.main(["--data", str(dataset)]) == 0
    assert stub.calls == ["yolo11n.pt"]
    assert "device" not in stub.options
    assert stub.options["epochs"] == 100
    assert stub.options["imgsz"] == 640
    assert stub.options["batch"] == 16
    assert stub.options["project"] == str(Path(train.__file__).resolve().parents[1] / "runs/detect")


@pytest.mark.parametrize("message", ["invalid YAML", "training images not found", "CUDA out of memory"])
def test_training_failure(dataset, stub, capsys, message):
    stub.error = RuntimeError(message)
    assert train.main(["--data", str(dataset)]) == 1
    captured = capsys.readouterr()
    assert message in captured.err
    assert "YOLO_WEIGHTS_PATH=" not in captured.out


def test_missing_best(dataset, stub, capsys):
    stub.produce = False
    assert train.main(["--data", str(dataset)]) == 1
    assert "did not produce best weights" in capsys.readouterr().err


def test_missing_dependencies(dataset, monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    assert train.main(["--data", str(dataset)]) == 1
    assert "pip install -r training/requirements.txt" in capsys.readouterr().err
