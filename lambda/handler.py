from __future__ import annotations

import base64
import json
from io import StringIO
from typing import Any, Dict, Tuple


_logic_cache = None


def _load_logic():
    global _logic_cache
    if _logic_cache is None:
        from logic.detectors import SpatialCornerDetector, TemporalCornerDetector
        from logic.features import DrivingFeatureExtractor
        from logic.formula_metrics import FormulaMetricsComputer
        from logic.metrics import HybridIntensityComputer, TrackMetricsComputer
        from logic.preprocess import TelemetryPreprocessor
        from logic.result_builder import CornerResultBuilder
        from logic.segmentation import HysteresisSegmenter
        from logic.track_map import TrackMapGenerator

        _logic_cache = (
            SpatialCornerDetector,
            TemporalCornerDetector,
            DrivingFeatureExtractor,
            FormulaMetricsComputer,
            HybridIntensityComputer,
            TrackMetricsComputer,
            TelemetryPreprocessor,
            CornerResultBuilder,
            HysteresisSegmenter,
            TrackMapGenerator,
        )

    return _logic_cache


def _is_aim_data_header(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    parts = [p.strip().strip('"') for p in stripped.split(",")]
    return len(parts) >= 2 and parts[0] == "Time" and parts[1] == "Distance"


def _parse_aim_csv(csv_str: str) -> Tuple["pd.DataFrame", Dict[str, str], float]:
    import pandas as pd

    lines = csv_str.splitlines()
    metadata: Dict[str, str] = {}
    sampling_rate_hz = 50.0
    header_idx = -1

    for i, line in enumerate(lines):
        if _is_aim_data_header(line):
            header_idx = i
            break

        if not line.strip():
            continue

        parts = line.strip().split(",")
        if len(parts) < 2:
            continue

        key = parts[0].strip('"')
        val = ",".join(parts[1:]).strip().strip('"')
        metadata[key] = val

        if key == "Sample Rate":
            try:
                sampling_rate_hz = float(val)
            except Exception:
                pass

    if header_idx != -1:
        df = pd.read_csv(
            StringIO(csv_str),
            skiprows=header_idx,
            header=0,
            low_memory=False,
            on_bad_lines="skip",
        )
    else:
        df = pd.read_csv(StringIO(csv_str), low_memory=False, on_bad_lines="skip")

    if "Time" in df.columns:
        df["Time"] = pd.to_numeric(df["Time"], errors="coerce")
        df.dropna(subset=["Time"], inplace=True)
        df.reset_index(drop=True, inplace=True)

    if df.empty:
        return df, metadata, float(sampling_rate_hz)

    df["session_time"] = df.index / float(sampling_rate_hz)

    df["lap_id"] = 0
    if "Beacon Markers" in metadata:
        try:
            beacons = [float(x.strip()) for x in metadata["Beacon Markers"].split(",") if x.strip()]
            beacons.sort()
            if beacons:
                bins = [-1.0] + beacons + [float(df["session_time"].max()) + 1.0]
                if bins == sorted(bins):
                    labels = range(1, len(bins))
                    df["lap_id"] = pd.cut(df["session_time"], bins=bins, labels=labels, right=True).astype(int)
        except Exception as e:
            print(f"DEBUG: Beacon Markers parse failed: {e}")

    if not bool((df["lap_id"] > 0).any()):
        df["lap_id"] = 1

    return df, metadata, float(sampling_rate_hz)


def _decode_body(event: Dict[str, Any]) -> bytes:
    body = event.get("body")
    if body is None:
        return b""
    if event.get("isBase64Encoded"):
        return base64.b64decode(body)
    if isinstance(body, str):
        return body.encode("utf-8")
    if isinstance(body, (bytes, bytearray)):
        return bytes(body)
    return bytes(body)


def _get_method(event: Dict[str, Any]) -> str:
    ctx = event.get("requestContext") or {}
    http = ctx.get("http") or {}
    method = http.get("method") or event.get("httpMethod") or ""
    return str(method).upper()


def _response(status: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": int(status),
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def lambda_handler(event, context):
    try:
        method = _get_method(event)
        if method and method != "POST":
            return _response(405, {"error": "Method not allowed"})

        body_bytes = _decode_body(event)
        if not body_bytes:
            return _response(400, {"error": "Empty body"})

        try:
            csv_str = body_bytes.decode("utf-8")
        except UnicodeDecodeError:
            csv_str = body_bytes.decode("cp1252")

        (
            SpatialCornerDetector,
            TemporalCornerDetector,
            DrivingFeatureExtractor,
            FormulaMetricsComputer,
            HybridIntensityComputer,
            TrackMetricsComputer,
            TelemetryPreprocessor,
            CornerResultBuilder,
            HysteresisSegmenter,
            TrackMapGenerator,
        ) = _load_logic()

        df, metadata, sampling_rate = _parse_aim_csv(csv_str)
        if df.empty:
            return _response(400, {"error": "No valid telemetry rows found"})

        preprocessor = TelemetryPreprocessor(sampling_rate=sampling_rate)
        preprocessor.apply(df)

        formula = FormulaMetricsComputer(sampling_rate=sampling_rate)
        formula.compute_boolean_channels(df)
        formula.compute_lean_angle(df)
        formula.compute_g_sum(df)

        track_metrics = TrackMetricsComputer(sampling_rate=sampling_rate)
        intensity_computer = HybridIntensityComputer(sampling_rate=sampling_rate, metrics_computer=track_metrics)
        feature_extractor = DrivingFeatureExtractor(sampling_rate=sampling_rate)
        result_builder = CornerResultBuilder(feature_extractor=feature_extractor)
        segmenter = HysteresisSegmenter()
        track_map_gen = TrackMapGenerator(
            sampling_rate=sampling_rate,
            metrics_computer=track_metrics,
            intensity_computer=intensity_computer,
            segmenter=segmenter,
        )

        spatial_detector = SpatialCornerDetector(
            sampling_rate=sampling_rate,
            metrics_computer=track_metrics,
            intensity_computer=intensity_computer,
            track_map_generator=track_map_gen,
            result_builder=result_builder,
        )

        try:
            result = spatial_detector.detect(df)
        except Exception as e:
            print(f"DEBUG: Spatial detection exception: {e}")
            result = {"error": str(e)}

        if "error" in result:
            temporal_detector = TemporalCornerDetector(
                sampling_rate=sampling_rate,
                intensity_computer=intensity_computer,
                segmenter=segmenter,
                result_builder=result_builder,
            )
            result = temporal_detector.detect(df)

        if "error" in result:
            return _response(400, {"error": result["error"]})

        corners = result.get("corners", [])
        lap_metrics = formula.compute_all_lap_metrics(df)

        return _response(200, {"corners": corners, "lap_metrics": lap_metrics, "metadata": metadata})
    except Exception as e:
        return _response(500, {"error": str(e)})
