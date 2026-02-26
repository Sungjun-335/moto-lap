"""Single source of truth for ML feature definitions.

This module defines which driving features are used for corner duration prediction.
Both train.py and export_onnx.py import from here.
The same feature list is mirrored in frontend/src/utils/onnxInference.ts.
"""

# Features used for training (order matters — must match ONNX input)
# Excluded: *_offset_m (high correlation with *_offset_s), rate_integrals (often null)
FEATURE_COLUMNS = [
    # Metadata / basic
    "corner_index",
    "entry_speed",
    "min_speed",
    "exit_speed",
    "apex_speed",
    # Braking profile
    "sob_offset_s",
    "cob_offset_s",
    "eob_offset_s",
    "total_brk_g_s",
    "min_accel_x_g",
    # Lean profile
    "sol_offset_s",
    "col_offset_s",
    "eol_offset_s",
    "max_lean_deg",
    "min_vel_kph",
    "min_vel_offset_s",
    # Throttle profile
    "sot_offset_s",
    "cot_offset_s",
    "eot_offset_s",
    "total_tps_g_s",
    "max_accel_x_g",
    # G-dip
    "g_dip_value",
    "g_dip_ratio",
    "entry_mean_g_sum",
    # Coasting penalty
    "cst_total_time_s",
    "cst_speed_loss_kph",
    "cst_segments",
    # Brake jerk
    "max_brake_jerk_g_per_s",
    "mean_brake_jerk_g_per_s",
    # Basic timing / dynamics
    "time_to_apex_s",
    "time_from_apex_to_exit_s",
    "max_decel_mps2",
    "entry_brake_ratio",
    "max_lat_g",
    "mean_lat_g",
]

TARGET_COLUMN = "duration_s"

# Metadata columns (not used as features but kept in dataset)
META_COLUMNS = ["session_id", "lap_id", "venue", "direction"]
