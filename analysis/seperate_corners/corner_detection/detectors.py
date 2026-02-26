from __future__ import annotations

from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from .config import DEFAULT_GAP_LIMIT_S, DEFAULT_MIN_DURATION_S, DEFAULT_MIN_SPEED_KPH, DEFAULT_TH_OFF, DEFAULT_TH_ON
from .metrics import get_detail_metric_col
from .models import CornerSegment, TrackMap
from .result_builder import CornerResultBuilder
from .track_map import TrackMapGenerator


def _segment_detail_stats(segment: pd.DataFrame, *, detail_metric_col: str) -> Optional[Dict[str, Any]]:
    if segment is None or len(segment) == 0 or detail_metric_col not in segment.columns:
        return None

    segment_detail = segment[detail_metric_col]
    apex_idx = int(segment_detail.abs().idxmax())
    mean_val = float(segment_detail.mean())
    direction = "L" if mean_val > 0 else "R"
    max_val = float(segment_detail.abs().max())

    return {"apex_idx": apex_idx, "direction": direction, "max_val": max_val}


class TemporalCornerDetector:
    def __init__(self, *, sampling_rate: float, intensity_computer, segmenter, result_builder: CornerResultBuilder):
        self.sampling_rate = float(sampling_rate)
        self.intensity_computer = intensity_computer
        self.segmenter = segmenter
        self.result_builder = result_builder

    def detect(
        self,
        df: pd.DataFrame,
        *,
        percentile: int = 80,
        th_on: float = DEFAULT_TH_ON,
        th_off: float = DEFAULT_TH_OFF,
        lap_id: Optional[int] = None,
    ) -> Dict:
        intensity_info = self.intensity_computer.compute(df, percentile=percentile)
        if "error" in intensity_info:
            return intensity_info

        threshold_info = intensity_info.get("thresholds", {})
        detail_metric_col = intensity_info.get("detail_metric_col", "curvature")

        if lap_id is not None:
            if 'lap_id' not in df.columns:
                return {"error": "lap_id column missing"}
            lap_id = int(lap_id)
            lap_mask = df['lap_id'] == lap_id
            if not bool(lap_mask.any()):
                return {"error": f"No data for lap_id={lap_id}"}
            idxs = df.index[lap_mask].to_numpy()
        else:
            idxs = np.arange(len(df))

        intensity = df.loc[idxs, 'hybrid_intensity'].to_numpy(dtype=float)
        if 'speed_kph' in df.columns:
            speed_kph = df.loc[idxs, 'speed_kph'].to_numpy(dtype=float)
        else:
            speed_kph = np.ones(len(idxs), dtype=float) * 100.0
        lap_ids = df.loc[idxs, 'lap_id'].to_numpy(dtype=int) if 'lap_id' in df.columns else None

        segments = self.segmenter.extract(
            idxs=idxs,
            intensity=intensity,
            speed_kph=speed_kph,
            lap_ids=lap_ids,
            th_on=float(th_on),
            th_off=float(th_off),
            min_speed_kph=DEFAULT_MIN_SPEED_KPH,
        )

        gap_limit_frames = int(DEFAULT_GAP_LIMIT_S * self.sampling_rate)
        min_duration_frames = int(DEFAULT_MIN_DURATION_S * self.sampling_rate)

        segments = self.segmenter.merge_simple(segments, gap_limit_frames=gap_limit_frames)
        segments = self.segmenter.filter_by_duration(segments, min_duration_frames=min_duration_frames)

        results = []
        for i, seg in enumerate(segments):
            segment_df = df.loc[seg.start_idx:seg.end_idx]
            stats = _segment_detail_stats(segment_df, detail_metric_col=detail_metric_col)
            if stats:
                apex_idx = int(stats["apex_idx"])
                direction = str(stats["direction"])
                max_val = float(stats["max_val"])
            else:
                apex_idx = int(seg.peak_idx)
                direction = ""
                max_val = float(seg.peak_val)

            results.append(
                self.result_builder.build(
                    df=df,
                    corner_id=i + 1,
                    lap_id=int(seg.lap_id),
                    start_idx=int(seg.start_idx),
                    apex_idx=int(apex_idx),
                    end_idx=int(seg.end_idx),
                    direction=direction,
                    max_val=float(max_val),
                    confidence=0.8,
                )
            )

        return {
            "assumptions": {
                "time_unit": "s",
                "speed_unit": "kph",
                "turning_metric_used": "hybrid_intensity",
                "thresholds": threshold_info,
                "primary_detail_metric": detail_metric_col,
            },
            "corners": results,
        }


class SpatialCornerDetector:
    def __init__(
        self,
        *,
        sampling_rate: float,
        metrics_computer,
        intensity_computer,
        track_map_generator: TrackMapGenerator,
        result_builder: CornerResultBuilder,
    ):
        self.sampling_rate = float(sampling_rate)
        self.metrics_computer = metrics_computer
        self.intensity_computer = intensity_computer
        self.track_map_generator = track_map_generator
        self.result_builder = result_builder

    def _expand_bounds_from_peak(
        self,
        *,
        df: pd.DataFrame,
        peak_idx: int,
        lap_start_idx: int,
        lap_end_idx: int,
        used_mask: pd.Series,
        th_off: float,
    ) -> Optional[CornerSegment]:
        start_idx = int(peak_idx)
        while start_idx > int(lap_start_idx):
            next_idx = start_idx - 1
            if bool(used_mask.get(next_idx, False)):
                break
            if float(df.loc[next_idx, 'hybrid_intensity']) < th_off:
                break
            start_idx = next_idx

        end_idx = int(peak_idx)
        while end_idx < int(lap_end_idx):
            next_idx = end_idx + 1
            if bool(used_mask.get(next_idx, False)):
                break
            if float(df.loc[next_idx, 'hybrid_intensity']) < th_off:
                break
            end_idx = next_idx

        if end_idx <= start_idx:
            return None

        return CornerSegment(start_idx=int(start_idx), end_idx=int(end_idx), peak_idx=int(peak_idx), peak_val=0.0)

    def detect(
        self,
        df: pd.DataFrame,
        *,
        track_map: Optional[TrackMap] = None,
        lap_id: Optional[int] = None,
    ) -> Dict:
        if 'pos_x' not in df.columns:
            self.metrics_computer.compute(df)

        if track_map is None:
            track_map = self.track_map_generator.generate(df)

        if not track_map.corners:
            return {"error": "No track map defined"}

        if "hybrid_intensity" not in df.columns:
            intensity_info = self.intensity_computer.compute(df, percentile=80)
            if "error" in intensity_info:
                return intensity_info
            detail_metric_col = intensity_info.get("detail_metric_col", "curvature")
        else:
            detail_metric_col = get_detail_metric_col(df)

        th_on = DEFAULT_TH_ON
        th_off = DEFAULT_TH_OFF
        min_duration_frames = int(DEFAULT_MIN_DURATION_S * self.sampling_rate)

        corner_defs = track_map.corners
        if any(getattr(c, "ref_apex_time", 0.0) for c in corner_defs):
            corner_defs = sorted(corner_defs, key=lambda c: c.ref_apex_time)
        else:
            corner_defs = sorted(corner_defs, key=lambda c: c.id)

        results = []
        lap_ids = df['lap_id'].unique() if 'lap_id' in df.columns else []
        lap_ids.sort()
        if 'lap_id' in df.columns:
            if lap_id is not None:
                lap_id = int(lap_id)
                lap_ids = [lap_id]
                if not bool((df['lap_id'] == lap_id).any()):
                    return {"error": f"No data for lap_id={lap_id}"}

        for lap in lap_ids:
            lap_df = df[df['lap_id'] == lap]
            if lap_df.empty or len(lap_df) < 50:
                continue

            lap_start_idx = int(lap_df.index.min())
            lap_end_idx = int(lap_df.index.max())
            used_mask = pd.Series(False, index=lap_df.index)

            for corner_def in corner_defs:
                dist_sq = (lap_df['pos_x'] - corner_def.center_x) ** 2 + (lap_df['pos_y'] - corner_def.center_y) ** 2
                window_mask = (dist_sq <= corner_def.radius ** 2) & (~used_mask)
                in_window = lap_df[window_mask]
                if in_window.empty:
                    continue

                window_intensity = in_window['hybrid_intensity']
                if float(window_intensity.max()) < th_on:
                    continue

                peak_idx_abs = int(window_intensity.idxmax())
                bounds = self._expand_bounds_from_peak(
                    df=df,
                    peak_idx=peak_idx_abs,
                    lap_start_idx=lap_start_idx,
                    lap_end_idx=lap_end_idx,
                    used_mask=used_mask,
                    th_off=th_off,
                )
                if bounds is None:
                    continue

                start_idx = int(bounds.start_idx)
                end_idx = int(bounds.end_idx)

                duration_frames = end_idx - start_idx
                if duration_frames < min_duration_frames:
                    continue

                segment = df.loc[start_idx:end_idx]
                stats = _segment_detail_stats(segment, detail_metric_col=detail_metric_col)
                if stats:
                    apex_idx = int(stats["apex_idx"])
                    direction = str(stats["direction"])
                    max_val = float(stats["max_val"])
                else:
                    apex_idx = int(peak_idx_abs)
                    direction = corner_def.direction or ""
                    max_val = float(segment['hybrid_intensity'].max()) if 'hybrid_intensity' in segment.columns else 0.0

                results.append(
                    self.result_builder.build(
                        df=df,
                        corner_id=int(corner_def.id),
                        lap_id=int(lap),
                        start_idx=int(start_idx),
                        apex_idx=int(apex_idx),
                        end_idx=int(end_idx),
                        direction=str(direction),
                        max_val=float(max_val),
                        confidence=0.9,
                    )
                )

                used_mask.loc[start_idx:end_idx] = True

        results.sort(key=lambda x: x['start_time'])
        window_radii = [float(c.radius) for c in track_map.corners] if track_map.corners else []

        return {
            "mode": "spatial_track",
            "track_map_source": f"Lap {track_map.reference_lap_id}",
            "corner_count": len(track_map.corners),
            "assumptions": {
                "time_unit": "s",
                "speed_unit": "kph",
                "turning_metric_used": "hybrid_intensity",
                "thresholds": {
                    "on": th_on,
                    "off": th_off,
                    "window_radius_median_m": float(np.median(window_radii)) if window_radii else None,
                },
                "primary_detail_metric": detail_metric_col,
            },
            "corners": results,
        }
