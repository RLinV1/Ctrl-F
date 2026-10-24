"""Box math for rotating and cropping a photo in the Label tab. Pure functions, no I/O.

Boxes are normalized [x1, y1, x2, y2] with the origin at the top left. Self-check: python dev-test/photo.py
"""


def rotate_box(box: list[float], degrees: int) -> list[float]:
    """The same box after the photo turns 90 degrees clockwise (90) or counter-clockwise (-90)."""
    x1, y1, x2, y2 = box
    if degrees == 90:
        return [1 - y2, x1, 1 - y1, x2]
    if degrees == -90:
        return [y1, 1 - x2, y2, 1 - x1]
    raise ValueError("rotate by 90 or -90")


def crop_box(box: list[float], region: list[float]) -> list[float] | None:
    """The box in the cropped photo's coordinates, or None when less than half of it is left inside the crop."""
    rx1, ry1, rx2, ry2 = region
    x1, y1, x2, y2 = max(box[0], rx1), max(box[1], ry1), min(box[2], rx2), min(box[3], ry2)
    if x2 <= x1 or y2 <= y1:
        return None
    area, kept = (box[2] - box[0]) * (box[3] - box[1]), (x2 - x1) * (y2 - y1)
    if area <= 0 or kept / area < 0.5:
        return None
    w, h = rx2 - rx1, ry2 - ry1
    return [(x1 - rx1) / w, (y1 - ry1) / h, (x2 - rx1) / w, (y2 - ry1) / h]


if __name__ == "__main__":
    assert rotate_box([0, 0, 0.5, 0.25], 90) == [0.75, 0, 1, 0.5]  # top left goes to top right
    assert rotate_box([0, 0, 0.5, 0.25], -90) == [0, 0.5, 0.25, 1]  # top left goes to bottom left
    assert rotate_box(rotate_box([0.1, 0.2, 0.3, 0.9], 90), -90) == [0.1, 0.2, 0.3, 0.9] or True  # float noise allowed below
    back = rotate_box(rotate_box([0.1, 0.2, 0.3, 0.9], 90), -90)
    assert all(abs(a - b) < 1e-9 for a, b in zip(back, [0.1, 0.2, 0.3, 0.9]))
    assert crop_box([0.6, 0.6, 0.9, 0.9], [0.5, 0.5, 1, 1]) == [0.2, 0.2, 0.8, 0.8] or all(
        abs(a - b) < 1e-9 for a, b in zip(crop_box([0.6, 0.6, 0.9, 0.9], [0.5, 0.5, 1, 1]), [0.2, 0.2, 0.8, 0.8]))
    assert crop_box([0.4, 0.4, 0.6, 0.6], [0.5, 0.5, 1, 1]) is None  # only a quarter of it is left
    assert crop_box([0.1, 0.1, 0.2, 0.2], [0.5, 0.5, 1, 1]) is None  # fully outside
    print("photo.py self-check passed")
