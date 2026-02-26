from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from logic.utils import savgol_filter

from .config import (
    DEFAULT_GAP_LIMIT_S,
    DEFAULT_MIN_DURATION_S,
    DEFAULT_MIN_SPEED_KPH,
    DEFAULT_TRACKMAP_RADIUS_M,
)
from .metrics import get_detail_metric_col
from .models import TrackMap
from .segmentation import HysteresisSegmenter


class TrackMapGenerator:
    def __init__(
        self,
        *,
        sampling_rate: float,
        metrics_computer,
        intensity_computer,
        segmenter: HysteresisSegmenter,
    ):
        self.sampling_rate = float(sampling_rate)
        self.metrics_computer = metrics_computer
        self.intensity_computer = intensity_computer
        self.segmenter = segmenter

    def _savgol_smooth_array(self, values: np.ndarray, *, window_s: float, polyorder: int = 3) -> np.ndarray:
        window_len = int(self.sampling_rate * float(window_s))
        if window_len % 2 == 0:
            window_len += 1
        window_len = max(5, window_len)
        if len(values) < window_len:
            return values
        try:
            return savgol_filter(values, window_length=window_len, polyorder=polyorder)
        except Exception:
            return values

    def generate(
        self,
        df: pd.DataFrame,
        *,
        reference_lap_id: Optional[int] = None,
        method: str = "hybrid_segments",
        th_on: float = 0.6,
        th_off: float = 0.3,
    ) -> TrackMap:
        if 'pos_x' not in df.columns:
            self.metrics_computer.compute(df)

        if reference_lap_id is None:
            lap_ids = sorted(df['lap_id'].unique()) if 'lap_id' in df.columns else []
            valid_laps = [int(L) for L in lap_ids if int(L) > 0]
            if not valid_laps:
                return TrackMap()
            reference_lap_id = 2 if 2 in valid_laps else valid_laps[0]

        reference_lap_id = int(reference_lap_id)
        ref_df = df[df['lap_id'] == reference_lap_id].copy() if 'lap_id' in df.columns else pd.DataFrame()
        if ref_df.empty:
            return TrackMap()

        if method != "hybrid_segments":
            raise ValueError(f"Unsupported TrackMap method: {method}")

        if "hybrid_intensity" not in df.columns:
            intensity_info = self.intensity_computer.compute(df, percentile=80)
            if "error" in intensity_info:
                return TrackMap()
            detail_metric_col = intensity_info.get("detail_metric_col", "curvature")
        else:
            detail_metric_col = get_detail_metric_col(df)

        idxs = ref_df.index.to_numpy()
        intensity = df.loc[idxs, 'hybrid_intensity'].to_numpy(dtype=float)
        intensity_smooth = self._savgol_smooth_array(intensity, window_s=0.5)

        speed = df.loc[idxs, 'speed_kph'].to_numpy(dtype=float) if 'speed_kph' in df.columns else np.ones_like(intensity_smooth) * 100.0
        lap_ids = np.full(len(idxs), reference_lap_id, dtype=int)

        segments = self.segmenter.extract(
            idxs=idxs,
            intensity=intensity_smooth,
            speed_kph=speed,
            lap_ids=lap_ids,
            th_on=float(th_on),
            th_off=float(th_off),
            min_speed_kph=DEFAULT_MIN_SPEED_KPH,
        )

        for seg in segments:
            seg_df = df.loc[int(seg.start_idx):int(seg.end_idx)]
            if detail_metric_col in seg_df.columns and len(seg_df) > 0:
                mean_val = float(seg_df[detail_metric_col].mean())
                seg.direction = "L" if mean_val > 0 else "R"
            else:
                seg.direction = ""

        gap_limit_frames = int(DEFAULT_GAP_LIMIT_S * self.sampling_rate)
        min_duration_frames = int(DEFAULT_MIN_DURATION_S * self.sampling_rate)

        segments = self.segmenter.merge_directional(segments, gap_limit_frames=gap_limit_frames)
        segments = self.segmenter.filter_by_duration(segments, min_duration_frames=min_duration_frames)

        if not segments:
            return TrackMap(reference_lap_id=reference_lap_id)

        track_map = TrackMap(reference_lap_id=reference_lap_id)
        for seg in segments:
            start = int(seg.start_idx)
            end = int(seg.end_idx)
            segment_df = df.loc[start:end]

            if detail_metric_col in segment_df.columns:
                segment_detail = segment_df[detail_metric_col]
                apex_idx = int(segment_detail.abs().idxmax())
                direction = "L" if float(segment_detail.mean()) > 0 else "R"
            else:
                apex_idx = int(seg.peak_idx)
                direction = seg.direction or ""

            center_x = float(df.loc[apex_idx, 'pos_x'])
            center_y = float(df.loc[apex_idx, 'pos_y'])
            ref_apex_time = float(df.loc[apex_idx, 'time']) if 'time' in df.columns else 0.0

            track_map.add_corner(
                center_x,
                center_y,
                float(DEFAULT_TRACKMAP_RADIUS_M),
                direction=direction,
                ref_apex_time=ref_apex_time,
            )

        print(f"DEBUG: Generated {len(track_map.corners)} spatial corners from Hybrid Segments (Lap {reference_lap_id}).")
        return track_map

