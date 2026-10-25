"""Which named zone of the camera view a detection sits in. Pure geometry, no model.

Coordinates are fractions of the image (0..1), y grows downward.
"""

import uuid
from collections.abc import Sequence
from typing import Protocol

_EPS = 1e-9

Point = tuple[float, float]


class ZoneLike(Protocol):
    id: uuid.UUID
    polygon: list


def anchor(bbox: dict) -> Point:
    """Bottom-center of the box: where an object rests on a surface."""
    return (bbox["x"] + bbox["w"] / 2, bbox["y"] + bbox["h"])


def _on_segment(p: Point, a: Point, b: Point) -> bool:
    (px, py), (ax, ay), (bx, by) = p, a, b
    cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    if abs(cross) > _EPS:
        return False
    return (
        min(ax, bx) - _EPS <= px <= max(ax, bx) + _EPS
        and min(ay, by) - _EPS <= py <= max(ay, by) + _EPS
    )


def point_in_polygon(p: Point, polygon: Sequence[Sequence[float]]) -> bool:
    """Ray casting. A point on an edge or vertex counts as inside."""
    pts = [(float(x), float(y)) for x, y in polygon]
    n = len(pts)
    if n < 3:
        return False
    px, py = p
    inside = False
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        if _on_segment(p, a, b):
            return True
        (ax, ay), (bx, by) = a, b
        if (ay > py) != (by > py):
            x_cross = ax + (py - ay) * (bx - ax) / (by - ay)
            if px < x_cross:
                inside = not inside
    return inside


def assign_zone(bbox: dict, zones: Sequence[ZoneLike]) -> uuid.UUID | None:
    """First zone (in the given order) containing the box's bottom-center, else None.

    Callers pass zones ordered by created_at, then name.
    """
    p = anchor(bbox)
    for zone in zones:
        if point_in_polygon(p, zone.polygon):
            return zone.id
    return None
