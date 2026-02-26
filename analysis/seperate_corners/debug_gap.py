import os
import pandas as pd
from corner_detector import CornerDetector

# Define path
curr_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(curr_dir, 'no3.csv')

# Load detector
detector = CornerDetector(csv_path)
print("Columns:", detector.df.columns.tolist())
if 'gyro_z' in detector.df.columns:
    print("Gyro Z Max:", detector.df['gyro_z'].max())

# Run detection to populate 'hybrid_intensity'
res = detector.detect_corners()
if 'error' in res:
    print("Error:", res['error'])
    exit()

thresholds = res['assumptions']['thresholds']
print("Thresholds:", thresholds)

# Focus on Lap 10 Gap: 594s to 605s
start_t = 594.0
end_t = 605.0

df = detector.df
mask = (df['time'] >= start_t) & (df['time'] <= end_t)
segment = df[mask]

print(f"\n--- Data Analysis ({start_t}s - {end_t}s) ---")
print(segment[['time', 'gyro_z', 'accel_y', 'hybrid_intensity']].describe())

# Check peaks
max_int = segment['hybrid_intensity'].max()
max_gyro = segment['gyro_z'].abs().max()
max_acc = segment['accel_y'].abs().max() if 'accel_y' in df.columns else None

print("\n--- Peaks in Gap ---")
print(f"Max Hybrid Intensity: {max_int:.4f} (Threshold 1.0 needed)")
print(f"Max Gyro Z: {max_gyro:.4f} (Threshold {thresholds.get('gyro_z'):.4f})")
if max_acc:
    print(f"Max Accel Y: {max_acc:.4f}  (Threshold {thresholds.get('accel_y'):.4f})")
