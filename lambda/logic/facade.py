from __future__ import annotations

import json
from typing import Optional, Union

import pandas as pd

from .datasets import AIMDataLoggerDataset, BaseDataset
from .detectors import SpatialCornerDetector, TemporalCornerDetector
from .features import DrivingFeatureExtractor
from .formula_metrics import FormulaMetricsComputer
from .metrics import HybridIntensityComputer, TrackMetricsComputer
from .models import TrackMap
from .preprocess import TelemetryPreprocessor
from .result_builder import CornerResultBuilder
from .segmentation import HysteresisSegmenter
from .track_map import TrackMapGenerator


class CornerDetector:
    def __init__(self, source: Union[str, BaseDataset]):
        self.dataset: BaseDataset = source if isinstance(source, BaseDataset) else AIMDataLoggerDataset(str(source))
        self.df: Optional[pd.DataFrame] = None
        self.metadata = {}
        self.sampling_rate = 50.0

        self._segmenter = HysteresisSegmenter()

        self.load_data()

        self._preprocessor = TelemetryPreprocessor(self.sampling_rate)
        self._formula = FormulaMetricsComputer(self.sampling_rate)
        self._metrics = TrackMetricsComputer(self.sampling_rate)
        self._intensity = HybridIntensityComputer(self.sampling_rate, metrics_computer=self._metrics)
        self._features = DrivingFeatureExtractor(self.sampling_rate)
        self._result_builder = CornerResultBuilder(self._features)
        self._track_map_generator = TrackMapGenerator(
            sampling_rate=self.sampling_rate,
            metrics_computer=self._metrics,
            intensity_computer=self._intensity,
            segmenter=self._segmenter,
        )
        self._temporal_detector = TemporalCornerDetector(
            sampling_rate=self.sampling_rate,
            intensity_computer=self._intensity,
            segmenter=self._segmenter,
            result_builder=self._result_builder,
        )
        self._spatial_detector = SpatialCornerDetector(
            sampling_rate=self.sampling_rate,
            metrics_computer=self._metrics,
            intensity_computer=self._intensity,
            track_map_generator=self._track_map_generator,
            result_builder=self._result_builder,
        )

        self.preprocess()

    def load_data(self) -> None:
        loaded = self.dataset.load()
        self.df = loaded.df
        self.metadata = loaded.metadata
        self.sampling_rate = float(loaded.sampling_rate_hz)

    def preprocess(self) -> None:
        if self.df is None:
            return
        self._preprocessor.apply(self.df)
        self._formula.compute_boolean_channels(self.df)
        self._formula.compute_lean_angle(self.df)
        self._formula.compute_g_sum(self.df)

    def compute_metrics(self) -> None:
        if self.df is None:
            return
        self._metrics.compute(self.df)

    def compute_hybrid_intensity(self, percentile: int = 80):
        if self.df is None:
            return {"error": "No data loaded"}
        return self._intensity.compute(self.df, percentile=percentile)

    def detect_corners(self, percentile: int = 80, th_on: float = 0.6, th_off: float = 0.3, lap_id: Optional[int] = None):
        if self.df is None:
            return {"error": "No data loaded"}
        return self._temporal_detector.detect(self.df, percentile=percentile, th_on=th_on, th_off=th_off, lap_id=lap_id)

    def generate_track_map(
        self,
        reference_lap_id: int = None,
        method: str = "hybrid_segments",
        th_on: float = 0.6,
        th_off: float = 0.3,
    ) -> TrackMap:
        if self.df is None:
            return TrackMap()
        return self._track_map_generator.generate(
            self.df,
            reference_lap_id=reference_lap_id,
            method=method,
            th_on=th_on,
            th_off=th_off,
        )

    def detect_corners_spatial(self, track_map: Optional[TrackMap] = None, lap_id: Optional[int] = None):
        if self.df is None:
            return {"error": "No data loaded"}
        return self._spatial_detector.detect(self.df, track_map=track_map, lap_id=lap_id)

    def to_json(self, lap_id: Optional[int] = None) -> str:
        try:
            data = self.detect_corners_spatial(lap_id=lap_id)
            if "error" in data:
                data = self.detect_corners(lap_id=lap_id)
        except Exception as e:
            print(f"Spatial detection error: {e}, falling back.")
            data = self.detect_corners(lap_id=lap_id)
        return json.dumps(data, indent=2)
