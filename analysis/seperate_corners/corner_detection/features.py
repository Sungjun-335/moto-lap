from __future__ import annotations

from typing import Dict, Optional

import numpy as np
import pandas as pd


class DrivingFeatureExtractor:
    def __init__(self, sampling_rate: float):
        self.sampling_rate = float(sampling_rate)

    def extract(self, df: pd.DataFrame, start_idx: int, apex_idx: int, end_idx: int) -> Dict:
        if df is None or len(df) == 0:
            return {}

        start_idx = int(start_idx)
        apex_idx = int(apex_idx)
        end_idx = int(end_idx)

        if start_idx < 0 or end_idx >= len(df) or start_idx >= end_idx:
            return {}

        if 'time' not in df.columns or 'speed_kph' not in df.columns:
            return {}

        lap_id = int(df.loc[start_idx, 'lap_id']) if 'lap_id' in df.columns else 0
        lap_df = df[df['lap_id'] == lap_id] if lap_id else df
        lap_start_idx = int(lap_df.index.min())

        pre_frames = int(3.0 * self.sampling_rate)
        approach_start_idx = max(lap_start_idx, start_idx - pre_frames)

        segment_df = df.loc[start_idx:end_idx]
        entry_df = df.loc[start_idx:apex_idx]
        exit_df = df.loc[apex_idx:end_idx]
        approach_df = df.loc[approach_start_idx:start_idx]

        t_start = float(df.loc[start_idx, 'time'])
        t_apex = float(df.loc[apex_idx, 'time'])
        t_end = float(df.loc[end_idx, 'time'])

        speed_seg_mps = segment_df['speed_kph'].to_numpy(dtype=float) / 3.6
        acc_long_mps2 = np.gradient(speed_seg_mps) * float(self.sampling_rate)

        braking_threshold = -1.0
        brake_start_offset_s: Optional[float] = None
        brake_release_offset_s: Optional[float] = None
        max_decel_mps2 = float(np.min(acc_long_mps2)) if len(acc_long_mps2) else None

        if len(approach_df) >= 3:
            speed_app_mps = approach_df['speed_kph'].to_numpy(dtype=float) / 3.6
            acc_app = np.gradient(speed_app_mps) * float(self.sampling_rate)
            braking_idxs = np.where(acc_app < braking_threshold)[0]
            if len(braking_idxs):
                brake_start_idx_local = int(braking_idxs[0])
                brake_start_time = float(approach_df['time'].iloc[brake_start_idx_local])
                brake_start_offset_s = brake_start_time - t_start

        if len(entry_df) >= 3:
            speed_ent_mps = entry_df['speed_kph'].to_numpy(dtype=float) / 3.6
            acc_ent = np.gradient(speed_ent_mps) * float(self.sampling_rate)
            braking_idxs = np.where(acc_ent < braking_threshold)[0]
            if len(braking_idxs):
                brake_release_idx_local = int(braking_idxs[-1])
                brake_release_time = float(entry_df['time'].iloc[brake_release_idx_local])
                brake_release_offset_s = brake_release_time - t_start

        entry_brake_ratio = None
        trail_braking = None
        if len(entry_df) >= 5:
            speed_ent_mps = entry_df['speed_kph'].to_numpy(dtype=float) / 3.6
            acc_ent = np.gradient(speed_ent_mps) * float(self.sampling_rate)
            entry_brake_ratio = float(np.mean(acc_ent < braking_threshold))
            trail_braking = bool(entry_brake_ratio > 0.2)

        throttle_at_apex = None
        throttle_pickup_delay_s = None
        if 'TPS' in df.columns:
            tps_seg = segment_df['TPS'].to_numpy(dtype=float)
            if len(tps_seg):
                throttle_at_apex = float(df.loc[apex_idx, 'TPS'])
                post_apex = exit_df['TPS'].to_numpy(dtype=float)
                above = np.where(post_apex > 0.3)[0]
                if len(above):
                    pickup_idx_local = int(above[0])
                    pickup_time = float(exit_df['time'].iloc[pickup_idx_local])
                    throttle_pickup_delay_s = pickup_time - t_apex

        max_lat_g = None
        mean_lat_g = None
        if 'accel_y' in df.columns:
            lat = segment_df['accel_y'].to_numpy(dtype=float)
            if len(lat):
                max_lat_g = float(np.max(np.abs(lat)))
                mean_lat_g = float(np.mean(np.abs(lat)))

        max_yaw_deg_s = None
        if 'gyro_z' in df.columns:
            yaw = segment_df['gyro_z'].to_numpy(dtype=float)
            if len(yaw):
                max_yaw_deg_s = float(np.max(np.abs(yaw)))

        braking_profile = self._compute_braking_profile(segment_df, t_start)
        lean_profile = self._compute_lean_profile(segment_df, t_start)
        rate_integrals = self._compute_rate_integrals(segment_df)
        throttle_profile = self._compute_throttle_profile(exit_df, t_apex)
        g_dip = self._compute_g_dip(entry_df, t_start)
        coasting_penalty = self._compute_coasting_penalty(segment_df)
        brake_jerk = self._compute_brake_jerk(df, approach_start_idx, start_idx, apex_idx, t_start)

        return {
            "time_to_apex_s": float(t_apex - t_start),
            "time_from_apex_to_exit_s": float(t_end - t_apex),
            "brake_start_offset_s": brake_start_offset_s,
            "brake_release_offset_s": brake_release_offset_s,
            "max_decel_mps2": max_decel_mps2,
            "entry_brake_ratio": entry_brake_ratio,
            "trail_braking": trail_braking,
            "throttle_at_apex": throttle_at_apex,
            "throttle_pickup_delay_s": throttle_pickup_delay_s,
            "max_lat_g": max_lat_g,
            "mean_lat_g": mean_lat_g,
            "max_yaw_deg_s": max_yaw_deg_s,
            "braking_profile": braking_profile,
            "lean_profile": lean_profile,
            "rate_integrals": rate_integrals,
            "throttle_profile": throttle_profile,
            "g_dip": g_dip,
            "coasting_penalty": coasting_penalty,
            "brake_jerk": brake_jerk,
        }

    # ------------------------------------------------------------------
    # Braking profile: SOB / COB / EOB
    # ------------------------------------------------------------------
    def _compute_braking_profile(self, seg_df: pd.DataFrame, t_start: float) -> Optional[Dict]:
        if "brk_on" not in seg_df.columns or "accel_x" not in seg_df.columns:
            return None

        brk = seg_df["brk_on"].to_numpy(dtype=bool)
        if not np.any(brk):
            return None

        ax = seg_df["accel_x"].to_numpy(dtype=float)
        times = seg_df["time"].to_numpy(dtype=float)
        has_dist = "Distance" in seg_df.columns
        dists = seg_df["Distance"].to_numpy(dtype=float) if has_dist else None
        d_start = float(dists[0]) if dists is not None else 0.0
        dt = 1.0 / self.sampling_rate

        brk_ax = np.where(brk, np.abs(ax), 0.0)
        cumsum = np.cumsum(brk_ax)
        total = cumsum[-1]

        if total <= 0:
            return None

        sob_offset_s = cob_offset_s = eob_offset_s = None
        sob_offset_m = cob_offset_m = eob_offset_m = None
        for pct, name in [(0.1, "sob"), (0.5, "cob"), (0.9, "eob")]:
            idx_arr = np.where(cumsum >= pct * total)[0]
            if len(idx_arr):
                i = idx_arr[0]
                t = float(times[i])
                d = round(float(dists[i]) - d_start, 2) if dists is not None else None
                if name == "sob":
                    sob_offset_s = round(t - t_start, 4)
                    sob_offset_m = d
                elif name == "cob":
                    cob_offset_s = round(t - t_start, 4)
                    cob_offset_m = d
                else:
                    eob_offset_s = round(t - t_start, 4)
                    eob_offset_m = d

        total_brk_g_s = round(float(np.sum(brk_ax)) * dt, 4)
        min_accel_x_g = round(float(np.min(ax[brk])), 4) if np.any(brk) else None

        return {
            "sob_offset_s": sob_offset_s,
            "sob_offset_m": sob_offset_m,
            "cob_offset_s": cob_offset_s,
            "cob_offset_m": cob_offset_m,
            "eob_offset_s": eob_offset_s,
            "eob_offset_m": eob_offset_m,
            "total_brk_g_s": total_brk_g_s,
            "min_accel_x_g": min_accel_x_g,
        }

    # ------------------------------------------------------------------
    # Lean profile: SOL / COL / EOL
    # ------------------------------------------------------------------
    def _compute_lean_profile(self, seg_df: pd.DataFrame, t_start: float) -> Optional[Dict]:
        if "lean_angle" not in seg_df.columns or "speed_kph" not in seg_df.columns:
            return None

        la = np.abs(seg_df["lean_angle"].to_numpy(dtype=float))
        times = seg_df["time"].to_numpy(dtype=float)
        speed = seg_df["speed_kph"].to_numpy(dtype=float)
        has_dist = "Distance" in seg_df.columns
        dists = seg_df["Distance"].to_numpy(dtype=float) if has_dist else None
        d_start = float(dists[0]) if dists is not None else 0.0

        cumsum = np.cumsum(la)
        total = cumsum[-1]

        if total <= 0:
            return None

        sol_offset_s = col_offset_s = eol_offset_s = None
        sol_offset_m = col_offset_m = eol_offset_m = None
        for pct, name in [(0.1, "sol"), (0.5, "col"), (0.9, "eol")]:
            idx_arr = np.where(cumsum >= pct * total)[0]
            if len(idx_arr):
                i = idx_arr[0]
                t = float(times[i])
                d = round(float(dists[i]) - d_start, 2) if dists is not None else None
                if name == "sol":
                    sol_offset_s = round(t - t_start, 4)
                    sol_offset_m = d
                elif name == "col":
                    col_offset_s = round(t - t_start, 4)
                    col_offset_m = d
                else:
                    eol_offset_s = round(t - t_start, 4)
                    eol_offset_m = d

        max_lean_deg = round(float(np.max(la)), 1)

        min_vel_kph = round(float(np.min(speed)), 1)
        min_vel_idx = int(np.argmin(speed))
        min_vel_offset_s = round(float(times[min_vel_idx]) - t_start, 4)
        min_vel_offset_m = round(float(dists[min_vel_idx]) - d_start, 2) if dists is not None else None

        return {
            "sol_offset_s": sol_offset_s,
            "sol_offset_m": sol_offset_m,
            "col_offset_s": col_offset_s,
            "col_offset_m": col_offset_m,
            "eol_offset_s": eol_offset_s,
            "eol_offset_m": eol_offset_m,
            "max_lean_deg": max_lean_deg,
            "min_vel_kph": min_vel_kph,
            "min_vel_offset_s": min_vel_offset_s,
            "min_vel_offset_m": min_vel_offset_m,
        }

    # ------------------------------------------------------------------
    # Rate integrals: pitch / roll / yaw
    # ------------------------------------------------------------------
    def _compute_rate_integrals(self, seg_df: pd.DataFrame) -> Optional[Dict]:
        dt = 1.0 / self.sampling_rate
        result = {}
        has_any = False

        for col, key in [("pitch_rate", "pitch_rate_integral"),
                         ("roll_rate", "roll_rate_integral"),
                         ("yaw_rate", "yaw_rate_integral")]:
            if col in seg_df.columns:
                vals = np.abs(seg_df[col].to_numpy(dtype=float))
                result[key] = round(float(np.sum(vals) * dt), 4)
                has_any = True
            else:
                result[key] = None

        return result if has_any else None

    # ------------------------------------------------------------------
    # Throttle roll-on profile: SOT / COT / EOT (exit phase)
    # ------------------------------------------------------------------
    def _compute_throttle_profile(self, exit_df: pd.DataFrame, t_apex: float) -> Optional[Dict]:
        if "tps_on" not in exit_df.columns or "accel_x" not in exit_df.columns:
            return None

        if len(exit_df) < 3:
            return None

        tps = exit_df["tps_on"].to_numpy(dtype=bool)
        if not np.any(tps):
            return None

        ax = exit_df["accel_x"].to_numpy(dtype=float)
        times = exit_df["time"].to_numpy(dtype=float)
        has_dist = "Distance" in exit_df.columns
        dists = exit_df["Distance"].to_numpy(dtype=float) if has_dist else None
        d_apex = float(dists[0]) if dists is not None else 0.0
        dt = 1.0 / self.sampling_rate

        tps_ax = np.where(tps, ax, 0.0)
        tps_ax = np.maximum(tps_ax, 0.0)  # only positive accel
        cumsum = np.cumsum(tps_ax)
        total = cumsum[-1]

        if total <= 0:
            return None

        sot_offset_s = cot_offset_s = eot_offset_s = None
        sot_offset_m = cot_offset_m = eot_offset_m = None
        for pct, name in [(0.1, "sot"), (0.5, "cot"), (0.9, "eot")]:
            idx_arr = np.where(cumsum >= pct * total)[0]
            if len(idx_arr):
                i = idx_arr[0]
                t = float(times[i])
                d = round(float(dists[i]) - d_apex, 2) if dists is not None else None
                if name == "sot":
                    sot_offset_s = round(t - t_apex, 4)
                    sot_offset_m = d
                elif name == "cot":
                    cot_offset_s = round(t - t_apex, 4)
                    cot_offset_m = d
                else:
                    eot_offset_s = round(t - t_apex, 4)
                    eot_offset_m = d

        total_tps_g_s = round(float(np.sum(tps_ax)) * dt, 4)
        max_accel_x_g = round(float(np.max(ax[tps])), 4) if np.any(tps) else None

        return {
            "sot_offset_s": sot_offset_s,
            "sot_offset_m": sot_offset_m,
            "cot_offset_s": cot_offset_s,
            "cot_offset_m": cot_offset_m,
            "eot_offset_s": eot_offset_s,
            "eot_offset_m": eot_offset_m,
            "total_tps_g_s": total_tps_g_s,
            "max_accel_x_g": max_accel_x_g,
        }

    # ------------------------------------------------------------------
    # G-Dip analysis: friction circle transition efficiency (entry phase)
    # ------------------------------------------------------------------
    def _compute_g_dip(self, entry_df: pd.DataFrame, t_start: float) -> Optional[Dict]:
        if "g_sum" not in entry_df.columns:
            return None

        if len(entry_df) < 3:
            return None

        g_sum = entry_df["g_sum"].to_numpy(dtype=float)
        times = entry_df["time"].to_numpy(dtype=float)
        has_dist = "Distance" in entry_df.columns
        dists = entry_df["Distance"].to_numpy(dtype=float) if has_dist else None
        d_start = float(dists[0]) if dists is not None else 0.0

        dip_idx = int(np.argmin(g_sum))
        g_dip_value = round(float(g_sum[dip_idx]), 4)
        g_dip_offset_s = round(float(times[dip_idx]) - t_start, 4)
        g_dip_offset_m = round(float(dists[dip_idx]) - d_start, 2) if dists is not None else None

        entry_mean = float(np.mean(g_sum))
        g_dip_ratio = round(g_dip_value / entry_mean, 4) if entry_mean > 0 else None

        return {
            "g_dip_value": g_dip_value,
            "g_dip_offset_s": g_dip_offset_s,
            "g_dip_offset_m": g_dip_offset_m,
            "entry_mean_g_sum": round(entry_mean, 4),
            "g_dip_ratio": g_dip_ratio,
        }

    # ------------------------------------------------------------------
    # Coasting penalty: speed loss during CST segments
    # ------------------------------------------------------------------
    def _compute_coasting_penalty(self, seg_df: pd.DataFrame) -> Optional[Dict]:
        if "cst_on" not in seg_df.columns or "speed_kph" not in seg_df.columns:
            return None

        cst = seg_df["cst_on"].to_numpy(dtype=bool)
        if not np.any(cst):
            return {"cst_total_time_s": 0.0, "cst_speed_loss_kph": 0.0, "cst_segments": 0}

        speed = seg_df["speed_kph"].to_numpy(dtype=float)
        dt = 1.0 / self.sampling_rate

        # Detect contiguous CST segments via diff
        cst_int = cst.astype(int)
        diff = np.diff(cst_int, prepend=0)
        starts = np.where(diff == 1)[0]
        ends_diff = np.where(diff == -1)[0]

        # Build segment pairs
        segments = []
        for s in starts:
            matching_ends = ends_diff[ends_diff > s]
            e = int(matching_ends[0]) if len(matching_ends) else len(cst)
            segments.append((s, e))

        total_time = 0.0
        total_speed_loss = 0.0
        for s, e in segments:
            seg_len = e - s
            total_time += seg_len * dt
            total_speed_loss += float(speed[s]) - float(speed[min(e, len(speed) - 1)])

        return {
            "cst_total_time_s": round(total_time, 4),
            "cst_speed_loss_kph": round(total_speed_loss, 2),
            "cst_segments": len(segments),
        }

    # ------------------------------------------------------------------
    # Brake jerk: initial braking aggressiveness
    # ------------------------------------------------------------------
    def _compute_brake_jerk(self, df: pd.DataFrame, approach_start_idx: int,
                            start_idx: int, apex_idx: int, t_start: float) -> Optional[Dict]:
        if "accel_x" not in df.columns:
            return None

        from .config import BRAKE_JERK_INITIAL_WINDOW_S

        region = df.loc[approach_start_idx:apex_idx]
        if len(region) < 5:
            return None

        ax = region["accel_x"].to_numpy(dtype=float)
        times = region["time"].to_numpy(dtype=float)

        jerk = np.gradient(ax) * float(self.sampling_rate)  # G/s

        # Max negative jerk (strongest braking onset)
        neg_jerk = np.where(jerk < 0, jerk, 0.0)
        if not np.any(neg_jerk < 0):
            return None

        max_neg_idx = int(np.argmin(neg_jerk))
        max_brake_jerk = round(float(np.abs(neg_jerk[max_neg_idx])), 4)
        brake_jerk_offset_s = round(float(times[max_neg_idx]) - t_start, 4)

        # Mean jerk in initial window from first brk_on
        mean_brake_jerk = None
        if "brk_on" in region.columns:
            brk = region["brk_on"].to_numpy(dtype=bool)
            brk_idxs = np.where(brk)[0]
            if len(brk_idxs):
                first_brk = brk_idxs[0]
                window_samples = int(BRAKE_JERK_INITIAL_WINDOW_S * self.sampling_rate)
                window_end = min(first_brk + window_samples, len(jerk))
                if window_end > first_brk:
                    window_jerk = jerk[first_brk:window_end]
                    neg_window = window_jerk[window_jerk < 0]
                    if len(neg_window):
                        mean_brake_jerk = round(float(np.mean(np.abs(neg_window))), 4)

        return {
            "max_brake_jerk_g_per_s": max_brake_jerk,
            "brake_jerk_offset_s": brake_jerk_offset_s,
            "mean_brake_jerk_g_per_s": mean_brake_jerk,
        }
