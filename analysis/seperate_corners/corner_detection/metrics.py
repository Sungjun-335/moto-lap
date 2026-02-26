from __future__ import annotations

from typing import Dict, Optional

import numpy as np
import pandas as pd


def get_detail_metric_col(df: pd.DataFrame) -> str:
    acc_col = 'accel_y' if 'accel_y' in df.columns else None
    return 'gyro_z' if 'gyro_z' in df.columns else (acc_col if acc_col else 'curvature')


class TrackMetricsComputer:
    def __init__(self, sampling_rate: float):
        self.sampling_rate = float(sampling_rate)

    def compute(self, df: pd.DataFrame) -> None:
        if 'lat' not in df.columns or 'lon' not in df.columns:
            df['curvature'] = 0.0
            return

        R = 6371000
        lat0 = np.deg2rad(df['lat'].iloc[0])
        df['pos_x'] = R * np.deg2rad(df['lon'] - df['lon'].iloc[0]) * np.cos(lat0)
        df['pos_y'] = R * np.deg2rad(df['lat'] - df['lat'].iloc[0])

        dx = np.gradient(df['pos_x'])
        dy = np.gradient(df['pos_y'])
        ddx = np.gradient(dx)
        ddy = np.gradient(dy)

        denom = (dx**2 + dy**2)**(1.5)
        mask = df['speed_kph'] > 5.0 if 'speed_kph' in df.columns else pd.Series([True] * len(df))

        k = np.zeros_like(dx)
        np.divide(dx * ddy - dy * ddx, denom, out=k, where=(denom > 1e-6) & mask)

        df['curvature'] = k
        df['inv_radius'] = np.abs(k)
        df['turn_dir_geom'] = np.sign(k)


class HybridIntensityComputer:
    def __init__(self, sampling_rate: float, metrics_computer: Optional[TrackMetricsComputer] = None):
        self.sampling_rate = float(sampling_rate)
        self.metrics_computer = metrics_computer

    def compute(self, df: pd.DataFrame, percentile: int = 80) -> Dict:
        if self.metrics_computer and ('curvature' not in df.columns or 'pos_x' not in df.columns):
            self.metrics_computer.compute(df)

        candidates: Dict[str, Dict] = {}

        if 'gyro_z' in df.columns:
            candidates['gyro_z'] = {'data': df['gyro_z'].abs(), 'floor': 5.0}

        acc_col = 'accel_y' if 'accel_y' in df.columns else None
        if acc_col:
            candidates[acc_col] = {'data': df[acc_col].abs(), 'floor': 0.3}

        if 'curvature' in df.columns:
            df.loc[df['curvature'].abs() > 0.5, 'curvature'] = 0.5 * np.sign(df['curvature'])
            candidates['curvature'] = {'data': df['curvature'].abs(), 'floor': 0.005}

        if not candidates:
            return {"error": "No turning metric available"}

        active_mask = df['speed_kph'] > 10.0 if 'speed_kph' in df.columns else pd.Series([True] * len(df))

        caps = {
            'curvature': 0.02,
            'gyro_z': 15.0,
            'accel_y': 1.0,
        }

        normalized_metrics = []
        threshold_info: Dict[str, float] = {}

        for name, info in candidates.items():
            data = info['data']
            floor = float(info['floor'])
            cap = float(caps.get(name, 999.0))

            vals = data[active_mask]
            if len(vals) == 0:
                continue

            p_val = float(np.percentile(vals, percentile))
            th = min(max(floor, p_val), cap)

            threshold_info[name] = float(th)
            normalized_metrics.append(data / th)
            print(f"DEBUG: {name} threshold={th:.4f} (floor={floor}, cap={cap}, raw_p{percentile}={p_val:.4f})")

        if not normalized_metrics:
            return {"error": "No valid data for detection"}

        turning_metric = pd.concat(normalized_metrics, axis=1).max(axis=1)
        df['hybrid_intensity'] = turning_metric

        detail_metric_col = get_detail_metric_col(df)

        return {
            "turning_metric_col": "hybrid_intensity",
            "thresholds": threshold_info,
            "detail_metric_col": detail_metric_col,
        }

