from __future__ import annotations

from typing import List, Optional

import numpy as np

from .models import CornerSegment


class HysteresisSegmenter:
    def extract(
        self,
        *,
        idxs: np.ndarray,
        intensity: np.ndarray,
        speed_kph: np.ndarray,
        lap_ids: Optional[np.ndarray],
        th_on: float,
        th_off: float,
        min_speed_kph: float,
    ) -> List[CornerSegment]:
        if len(idxs) == 0:
            return []

        segments: List[CornerSegment] = []
        is_corner = False

        start_idx = 0
        end_idx = 0
        peak_idx = 0
        peak_val = -np.inf
        seg_lap_id = 0

        for local_i, real_idx in enumerate(idxs):
            speed = float(speed_kph[local_i])
            if speed < min_speed_kph:
                if is_corner:
                    end_idx = int(real_idx) - 1
                    if end_idx >= start_idx:
                        segments.append(
                            CornerSegment(
                                start_idx=int(start_idx),
                                end_idx=int(end_idx),
                                peak_idx=int(peak_idx),
                                peak_val=float(peak_val),
                                lap_id=int(seg_lap_id),
                            )
                        )
                    is_corner = False
                continue

            val = float(intensity[local_i])
            if not is_corner:
                if val > th_on:
                    is_corner = True
                    start_idx = int(real_idx)
                    end_idx = int(real_idx)
                    peak_idx = int(real_idx)
                    peak_val = val
                    seg_lap_id = int(lap_ids[local_i]) if lap_ids is not None else 0
            else:
                end_idx = int(real_idx)
                if val > float(peak_val):
                    peak_val = val
                    peak_idx = int(real_idx)

                if val < th_off:
                    if end_idx >= start_idx:
                        segments.append(
                            CornerSegment(
                                start_idx=int(start_idx),
                                end_idx=int(end_idx),
                                peak_idx=int(peak_idx),
                                peak_val=float(peak_val),
                                lap_id=int(seg_lap_id),
                            )
                        )
                    is_corner = False

        if is_corner and end_idx >= start_idx:
            segments.append(
                CornerSegment(
                    start_idx=int(start_idx),
                    end_idx=int(end_idx),
                    peak_idx=int(peak_idx),
                    peak_val=float(peak_val),
                    lap_id=int(seg_lap_id),
                )
            )

        return segments

    def merge_simple(self, segments: List[CornerSegment], *, gap_limit_frames: int) -> List[CornerSegment]:
        if not segments:
            return []

        merged: List[CornerSegment] = [segments[0]]
        for seg in segments[1:]:
            curr = merged[-1]
            gap = int(seg.start_idx) - int(curr.end_idx)
            if gap < gap_limit_frames:
                curr.end_idx = int(seg.end_idx)
                if float(seg.peak_val) > float(curr.peak_val):
                    curr.peak_val = float(seg.peak_val)
                    curr.peak_idx = int(seg.peak_idx)
            else:
                merged.append(seg)
        return merged

    def merge_directional(self, segments: List[CornerSegment], *, gap_limit_frames: int) -> List[CornerSegment]:
        if not segments:
            return []

        merged: List[CornerSegment] = [segments[0]]
        for seg in segments[1:]:
            curr = merged[-1]
            gap = int(seg.start_idx) - int(curr.end_idx) - 1
            same_dir = (curr.direction == seg.direction) or (not curr.direction) or (not seg.direction)
            if gap <= gap_limit_frames and same_dir:
                curr.end_idx = int(seg.end_idx)
                if float(seg.peak_val) > float(curr.peak_val):
                    curr.peak_val = float(seg.peak_val)
                    curr.peak_idx = int(seg.peak_idx)
            else:
                merged.append(seg)
        return merged

    def filter_by_duration(self, segments: List[CornerSegment], *, min_duration_frames: int) -> List[CornerSegment]:
        return [s for s in segments if (int(s.end_idx) - int(s.start_idx)) >= int(min_duration_frames)]

