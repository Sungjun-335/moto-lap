from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class SpatialCorner:
    id: int
    center_x: float
    center_y: float
    radius: float = 50.0
    name: str = ""
    direction: str = ""
    ref_apex_time: float = 0.0


@dataclass
class TrackMap:
    corners: List[SpatialCorner] = field(default_factory=list)
    reference_lap_id: int = -1

    def add_corner(
        self,
        x: float,
        y: float,
        radius: float = 50.0,
        direction: str = "",
        ref_apex_time: float = 0.0,
    ) -> None:
        corner_id = len(self.corners) + 1
        self.corners.append(
            SpatialCorner(
                id=corner_id,
                center_x=x,
                center_y=y,
                radius=radius,
                name=f"T{corner_id}",
                direction=direction,
                ref_apex_time=ref_apex_time,
            )
        )


@dataclass
class CornerSegment:
    start_idx: int
    end_idx: int
    peak_idx: int
    peak_val: float
    lap_id: int = 0
    direction: str = ""

