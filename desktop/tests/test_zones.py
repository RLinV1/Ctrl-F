"""Unit tests for zone geometry. No services needed."""

import uuid
from dataclasses import dataclass, field

import pytest

from ctrlf_db.zones import anchor, assign_zone, point_in_polygon

SQUARE = [[0, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]]  # lower-left quarter
# U shape open at the top: the notch (0.4..0.6, 0..0.6) is outside.
U_SHAPE = [[0, 0], [0.4, 0], [0.4, 0.6], [0.6, 0.6], [0.6, 0], [1, 0], [1, 1], [0, 1]]


@dataclass
class Z:
    polygon: list
    id: uuid.UUID = field(default_factory=uuid.uuid4)


def box(x: float, y: float, w: float, h: float) -> dict:
    return {"x": x, "y": y, "w": w, "h": h}


def test_anchor_is_bottom_center() -> None:
    assert anchor(box(0.1, 0.2, 0.4, 0.3)) == pytest.approx((0.3, 0.5))


def test_inside_and_outside() -> None:
    assert point_in_polygon((0.25, 0.75), SQUARE)
    assert not point_in_polygon((0.75, 0.75), SQUARE)
    assert not point_in_polygon((0.25, 0.25), SQUARE)


def test_edge_and_vertex_count_as_inside() -> None:
    assert point_in_polygon((0.5, 0.75), SQUARE)  # right edge
    assert point_in_polygon((0.25, 1.0), SQUARE)  # bottom edge
    assert point_in_polygon((0.5, 0.5), SQUARE)  # vertex


def test_concave_polygon() -> None:
    assert not point_in_polygon((0.5, 0.3), U_SHAPE)  # in the notch
    assert point_in_polygon((0.5, 0.8), U_SHAPE)  # below the notch
    assert point_in_polygon((0.2, 0.3), U_SHAPE)  # left arm


def test_degenerate_polygon_is_never_inside() -> None:
    assert not point_in_polygon((0.1, 0.1), [[0, 0], [1, 1]])


def test_assign_uses_bottom_center() -> None:
    desk = Z(SQUARE)
    # Box top is above the zone, but its bottom-center (0.25, 0.8) rests inside.
    assert assign_zone(box(0.15, 0.3, 0.2, 0.5), [desk]) == desk.id
    # Bottom-center (0.25, 1.0) lies on the zone's bottom edge.
    assert assign_zone(box(0.15, 0.6, 0.2, 0.4), [desk]) == desk.id
    # Bottom-center at (0.75, 0.9): right of the zone.
    assert assign_zone(box(0.65, 0.5, 0.2, 0.4), [desk]) is None


def test_overlap_takes_first_zone() -> None:
    first, second = Z(SQUARE), Z([[0, 0], [1, 0], [1, 1], [0, 1]])
    b = box(0.2, 0.6, 0.1, 0.2)
    assert assign_zone(b, [first, second]) == first.id
    assert assign_zone(b, [second, first]) == second.id


def test_no_zones() -> None:
    assert assign_zone(box(0.1, 0.1, 0.1, 0.1), []) is None
