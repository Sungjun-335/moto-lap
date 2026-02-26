from __future__ import annotations

import pandas as pd
from scipy.signal import savgol_filter


class TelemetryPreprocessor:
    def __init__(self, sampling_rate: float):
        self.sampling_rate = float(sampling_rate)

    def apply(self, df: pd.DataFrame) -> None:
        rename_map = {
            'GPS_Speed': 'speed_kph',
            'GPS_Latitude': 'lat',
            'GPS_Longitude': 'lon',
            'GPS_Gyro': 'gyro_z',
            'YawRate': 'yaw_rate',
            'PitchRate': 'pitch_rate',
            'RollRate': 'roll_rate',
            'GPS_LatAcc': 'accel_y',
            'GPS_LonAcc': 'accel_x',
            'Time': 'lap_time',
        }

        df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)

        if 'session_time' in df.columns:
            df['time'] = df['session_time']

        print("Columns after rename:", df.columns.tolist())

        if 'gyro_z' not in df.columns and 'yaw_rate' in df.columns:
            df['gyro_z'] = df['yaw_rate']

        window_size = int(self.sampling_rate * 0.2)
        if window_size % 2 == 0:
            window_size += 1
        window_size = max(5, window_size)

        smooth_cols = ['speed_kph', 'lat', 'lon', 'gyro_z', 'accel_y', 'accel_x', 'yaw_rate', 'pitch_rate', 'roll_rate']
        for col in smooth_cols:
            if col not in df.columns:
                continue
            try:
                df[col] = savgol_filter(df[col], window_length=window_size, polyorder=3)
            except Exception as e:
                print(f"Smoothing failed for {col}: {e}")

