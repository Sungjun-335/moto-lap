from __future__ import annotations

from typing import Any, Dict

import pandas as pd

from .features import DrivingFeatureExtractor


class CornerResultBuilder:
    def __init__(self, feature_extractor: DrivingFeatureExtractor):
        self.feature_extractor = feature_extractor

    def build(
        self,
        *,
        df: pd.DataFrame,
        corner_id: int,
        lap_id: int,
        start_idx: int,
        apex_idx: int,
        end_idx: int,
        direction: str,
        max_val: float,
        confidence: float,
    ) -> Dict[str, Any]:
        segment = df.loc[start_idx:end_idx]

        entry_speed = float(segment['speed_kph'].iloc[0]) if 'speed_kph' in segment.columns and len(segment) else None
        exit_speed = float(segment['speed_kph'].iloc[-1]) if 'speed_kph' in segment.columns and len(segment) else None
        min_speed = float(segment['speed_kph'].min()) if 'speed_kph' in segment.columns and len(segment) else None
        apex_speed = float(df.loc[apex_idx, 'speed_kph']) if 'speed_kph' in df.columns else None

        return {
            "corner_id": int(corner_id),
            "lap_id": int(lap_id),
            "start_time": float(df.loc[start_idx, 'time']),
            "apex_time": float(df.loc[apex_idx, 'time']),
            "end_time": float(df.loc[end_idx, 'time']),
            "direction": direction,
            "duration_s": float(df.loc[end_idx, 'time'] - df.loc[start_idx, 'time']),
            "metrics": {
                "entry_speed": float(entry_speed) if entry_speed is not None else None,
                "min_speed": float(min_speed) if min_speed is not None else None,
                "apex_speed": float(apex_speed) if apex_speed is not None else None,
                "exit_speed": float(exit_speed) if exit_speed is not None else None,
                "max_val": float(max_val),
            },
            "driving": self.feature_extractor.extract(df, start_idx, apex_idx, end_idx),
            "confidence": float(confidence),
        }

