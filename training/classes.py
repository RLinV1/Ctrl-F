"""The class list for training/datasets/personal. Order is the class index used in every label file.

Open Images supplies the first five. keys and wallet come from LeftInCAR (import_leftincar.py).
`airpods case`, `airpods` (loose earbuds) and `charger` come from Roboflow Universe (import_roboflow.py). Add wires here once there is data.
"""
CLASSES = ["phone", "glasses", "remote", "watch", "headphones", "keys", "wallet", "airpods case", "airpods", "charger"]


def yaml_text(source_note: str) -> str:
    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    return (
        f"# Generated. {source_note}\n"
        "path: datasets/personal\ntrain: images/train\nval: images/val\ntest: images/test\n\n"
        f"names:\n{names}\n"
    )
