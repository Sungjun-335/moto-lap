"""Standalone ONNX export script.

Usage:
    python export_onnx.py --model model.json --output corner_duration.onnx
    python export_onnx.py --model model.json --output ../frontend/public/models/corner_duration.onnx
"""

from __future__ import annotations

import argparse
from pathlib import Path

import xgboost as xgb
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

from feature_config import FEATURE_COLUMNS


def main():
    parser = argparse.ArgumentParser(description="Export XGBoost model to ONNX")
    parser.add_argument("--model", default="model.json", help="XGBoost model file")
    parser.add_argument("--output", default="corner_duration.onnx", help="ONNX output path")
    args = parser.parse_args()

    model = xgb.XGBRegressor()
    model.load_model(args.model)
    print(f"Loaded model: {args.model}")

    initial_type = [("features", FloatTensorType([None, len(FEATURE_COLUMNS)]))]
    onnx_model = convert_xgboost(model, initial_types=initial_type)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    print(f"ONNX model saved: {output_path} ({output_path.stat().st_size / 1024:.1f} KB)")
    print(f"Input: {len(FEATURE_COLUMNS)} features")


if __name__ == "__main__":
    main()
