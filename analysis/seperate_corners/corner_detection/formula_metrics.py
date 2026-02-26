from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

from .config import (
    BRK_ON_THRESHOLD_G,
    CRN_ON_THRESHOLD_G,
    GRAVITY_MPS2,
    TPS_ON_THRESHOLD_G,
)


class FormulaMetricsComputer:
    def __init__(self, sampling_rate: float):
        self.sampling_rate = float(sampling_rate)
        self.dt = 1.0 / self.sampling_rate

    # ------------------------------------------------------------------
    # 2-1. Boolean channels (in-place on DataFrame)
    # ------------------------------------------------------------------
    def compute_boolean_channels(self, df: pd.DataFrame) -> None:
        has_x = "accel_x" in df.columns
        has_y = "accel_y" in df.columns

        df["brk_on"] = (df["accel_x"] < BRK_ON_THRESHOLD_G) if has_x else False
        df["crn_on"] = (df["accel_y"].abs() > CRN_ON_THRESHOLD_G) if has_y else False
        df["tps_on"] = (df["accel_x"] > TPS_ON_THRESHOLD_G) if has_x else False
        df["cst_on"] = ~df["brk_on"] & ~df["tps_on"] & ~df["crn_on"]

    # ------------------------------------------------------------------
    # 2-2. Lean angle (in-place)
    # ------------------------------------------------------------------
    def compute_lean_angle(self, df: pd.DataFrame) -> None:
        if "speed_kph" not in df.columns or "gyro_z" not in df.columns:
            df["lean_angle"] = 0.0
            return

        speed_mps = df["speed_kph"].to_numpy(dtype=float) / 3.6
        gyro_rad = np.radians(df["gyro_z"].to_numpy(dtype=float))
        arg = speed_mps * gyro_rad / GRAVITY_MPS2
        df["lean_angle"] = np.degrees(np.arctan(arg))

    # ------------------------------------------------------------------
    # 2-2b. G-sum (in-place)
    # ------------------------------------------------------------------
    def compute_g_sum(self, df: pd.DataFrame) -> None:
        ax = df["accel_x"].to_numpy(dtype=float) if "accel_x" in df.columns else np.zeros(len(df))
        ay = df["accel_y"].to_numpy(dtype=float) if "accel_y" in df.columns else np.zeros(len(df))
        df["g_sum"] = np.sqrt(ax ** 2 + ay ** 2)

    # ------------------------------------------------------------------
    # 2-3. Lap-level integration metrics
    # ------------------------------------------------------------------
    def compute_lap_metrics(self, df: pd.DataFrame, lap_id: int) -> Dict[str, Any]:
        lap_df = df[df["lap_id"] == lap_id] if "lap_id" in df.columns else df
        if lap_df.empty:
            return {}

        n = len(lap_df)
        total_time = n * self.dt

        speed_mps = lap_df["speed_kph"].to_numpy(dtype=float) / 3.6 if "speed_kph" in lap_df.columns else np.zeros(n)

        result: Dict[str, Any] = {"lap_id": int(lap_id), "lap_time_s": round(total_time, 3)}

        for channel in ("brk", "crn", "tps", "cst"):
            col = f"{channel}_on"
            if col not in lap_df.columns:
                continue
            mask = lap_df[col].to_numpy(dtype=bool)
            time_s = float(np.sum(mask)) * self.dt
            pct = time_s / total_time * 100.0 if total_time > 0 else 0.0
            dist_m = float(np.sum(mask * speed_mps)) * self.dt
            result[f"{channel}_time_s"] = round(time_s, 3)
            result[f"{channel}_pct"] = round(pct, 1)
            result[f"{channel}_dist_m"] = round(dist_m, 1)

        if "lean_angle" in lap_df.columns:
            la = lap_df["lean_angle"].to_numpy(dtype=float)
            result["max_lean_angle_deg"] = round(float(np.max(np.abs(la))), 1)

        if "g_sum" in lap_df.columns:
            gs = lap_df["g_sum"].to_numpy(dtype=float)
            result["mean_g_sum"] = round(float(np.mean(gs)), 3)
            result["max_g_sum"] = round(float(np.max(gs)), 3)

        return result

    def compute_all_lap_metrics(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        if "lap_id" not in df.columns:
            return [self.compute_lap_metrics(df, 0)]

        lap_ids = sorted(df["lap_id"].unique())
        return [self.compute_lap_metrics(df, lid) for lid in lap_ids if lid > 0]
