from __future__ import annotations

from typing import Dict

import pandas as pd

from .base import BaseDataset, DatasetLoadResult


class AIMDataLoggerDataset(BaseDataset):
    """
    AIM Data Logger CSV (AIM Race Studio 계열) 로더.

    - 메타데이터 영역을 파싱해 sampling rate / beacon markers 등을 읽음
    - session_time 기반으로 lap_id 생성
    - 원본 컬럼은 그대로 두고, 후속 단계(preprocess)가 표준 컬럼으로 정리함
    """

    def __init__(self, csv_path: str):
        self.csv_path = csv_path

    def load(self) -> DatasetLoadResult:
        metadata: Dict[str, str] = {}
        sampling_rate_hz = 50.0

        with open(self.csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        start_row = 0
        for i, line in enumerate(lines):
            if line.strip() == '':
                continue
            if '"Time"' in line and '"Distance"' in line:
                start_row = i
                break

            parts = line.strip().split(',')
            if len(parts) < 2:
                continue

            key = parts[0].strip('"')
            val = ",".join(parts[1:]).strip().strip('"')
            metadata[key] = val

            if key == 'Sample Rate':
                try:
                    sampling_rate_hz = float(val)
                except Exception:
                    pass

        print(f"DEBUG: Found data header at row {start_row}")
        df = pd.read_csv(
            self.csv_path,
            skiprows=start_row,
            header=0,
            encoding='iso-8859-1',
            on_bad_lines='skip',
        )

        df['Time'] = pd.to_numeric(df['Time'], errors='coerce')
        df.dropna(subset=['Time'], inplace=True)
        df.reset_index(drop=True, inplace=True)

        df['session_time'] = df.index / sampling_rate_hz

        df['lap_id'] = 0
        if 'Beacon Markers' in metadata:
            try:
                beacons = [float(x.strip()) for x in metadata['Beacon Markers'].split(',')]
                beacons.sort()

                bins = [-1.0] + beacons + [df['session_time'].max() + 1.0]
                labels = range(1, len(bins))

                if sorted(bins) == bins:
                    df['lap_id'] = pd.cut(df['session_time'], bins=bins, labels=labels, right=True).astype(int)
                else:
                    print("Warning: Beacon markers are not monotonic or valid.")
            except Exception as e:
                print(f"Error parsing Beacon Markers: {e}")

        print("Lap counts:\n", df['lap_id'].value_counts().sort_index())

        return DatasetLoadResult(df=df, metadata=metadata, sampling_rate_hz=float(sampling_rate_hz))

