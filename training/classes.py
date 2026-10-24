"""The class list for datasets/personal. Order is the class index used in every label file.

Open Images supplies the first five. keys and wallet come from LeftInCAR (import_leftincar.py).
Add AirPods, AirPods case, and wires here once there is data for them.
"""
CLASSES = ["phone", "glasses", "remote", "watch", "headphones", "keys", "wallet"]


def yaml_text(source_note: str) -> str:
    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    return (
        f"# Generated. {source_note}\n"
        "path: ../datasets/personal\ntrain: images/train\nval: images/val\ntest: images/test\n\n"
        f"names:\n{names}\n"
    )
