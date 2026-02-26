"""Local FastAPI server for corner detection.

Usage:
    python server.py
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from handler import _parse_aim_csv, _load_logic

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.post("/api/sessions")
async def analyze_session(request: Request):
    body_bytes = await request.body()
    if not body_bytes:
        return JSONResponse(status_code=400, content={"error": "Empty body"})

    try:
        csv_str = body_bytes.decode("utf-8")
    except UnicodeDecodeError:
        csv_str = body_bytes.decode("cp1252")

    (
        SpatialCornerDetector,
        TemporalCornerDetector,
        DrivingFeatureExtractor,
        HybridIntensityComputer,
        TrackMetricsComputer,
        TelemetryPreprocessor,
        CornerResultBuilder,
        HysteresisSegmenter,
        TrackMapGenerator,
    ) = _load_logic()

    df, metadata, sampling_rate = _parse_aim_csv(csv_str)
    if df.empty:
        return JSONResponse(status_code=400, content={"error": "No valid telemetry rows found"})

    preprocessor = TelemetryPreprocessor(sampling_rate=sampling_rate)
    preprocessor.apply(df)

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
        print(f"Spatial detection failed: {e}")
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
        return JSONResponse(status_code=400, content={"error": result["error"]})

    corners = result.get("corners", [])
    return {"corners": corners, "metadata": metadata}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
