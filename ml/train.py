"""Train XGBoost model for corner duration prediction.

Usage:
    python train.py --data-source http://localhost:8787/api/training-data
    python train.py --data-source training_data.csv
    python train.py --data-source training_data.csv --export-onnx
"""

from __future__ import annotations

import argparse
import json
import sys
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

from feature_config import FEATURE_COLUMNS, TARGET_COLUMN, META_COLUMNS


def load_data(source: str) -> pd.DataFrame:
    """Load training data from CSV file or API URL."""
    if source.startswith("http://") or source.startswith("https://"):
        import requests
        sep = "&" if "?" in source else "?"
        url = f"{source}{sep}format=csv&limit=100000"
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return pd.read_csv(StringIO(resp.text))
    else:
        return pd.read_csv(source)


def preprocess(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """Extract features, target, and group IDs. Fill nulls with 0."""
    # Keep only rows with valid target
    df = df.dropna(subset=[TARGET_COLUMN])
    df = df[df[TARGET_COLUMN] > 0].copy()

    # Extract available feature columns (some may be missing)
    available = [c for c in FEATURE_COLUMNS if c in df.columns]
    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        print(f"Warning: {len(missing)} features missing from data: {missing}")
        for c in missing:
            df[c] = 0.0

    X = df[FEATURE_COLUMNS].fillna(0.0).astype(np.float32)
    y = df[TARGET_COLUMN].astype(np.float32)

    # Group by session_id for GroupKFold
    groups = df["session_id"] if "session_id" in df.columns else pd.Series(range(len(df)))

    return X, y, groups


def compute_normalization_stats(X: pd.DataFrame) -> dict:
    """Compute mean/std for each feature (for frontend normalization display)."""
    stats = {}
    for col in X.columns:
        stats[col] = {
            "mean": float(X[col].mean()),
            "std": float(X[col].std()) if X[col].std() > 0 else 1.0,
            "min": float(X[col].min()),
            "max": float(X[col].max()),
        }
    return stats


def train_model(
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    n_splits: int = 5,
) -> tuple[xgb.XGBRegressor, dict]:
    """Train XGBoost with GroupKFold CV. Returns best model and metrics."""
    unique_groups = groups.nunique()
    actual_splits = min(n_splits, unique_groups)

    if actual_splits < 2:
        print(f"Only {unique_groups} group(s), training on full data without CV.")
        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
        )
        model.fit(X, y)
        preds = model.predict(X)
        metrics = {
            "mae": float(mean_absolute_error(y, preds)),
            "rmse": float(np.sqrt(mean_squared_error(y, preds))),
            "r2": float(r2_score(y, preds)),
            "n_samples": len(y),
            "cv_folds": 0,
        }
        return model, metrics

    gkf = GroupKFold(n_splits=actual_splits)
    fold_metrics = []
    best_model = None
    best_mae = float("inf")

    for fold, (train_idx, val_idx) in enumerate(gkf.split(X, y, groups)):
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
        )
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )

        preds = model.predict(X_val)
        mae = mean_absolute_error(y_val, preds)
        rmse = float(np.sqrt(mean_squared_error(y_val, preds)))
        r2 = r2_score(y_val, preds)

        fold_metrics.append({"fold": fold, "mae": mae, "rmse": rmse, "r2": r2})
        print(f"  Fold {fold}: MAE={mae:.4f}s  RMSE={rmse:.4f}s  R2={r2:.4f}")

        if mae < best_mae:
            best_mae = mae
            best_model = model

    # Retrain on full data
    final_model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    final_model.fit(X, y)

    avg_metrics = {
        "mae": float(np.mean([m["mae"] for m in fold_metrics])),
        "rmse": float(np.mean([m["rmse"] for m in fold_metrics])),
        "r2": float(np.mean([m["r2"] for m in fold_metrics])),
        "n_samples": len(y),
        "cv_folds": actual_splits,
        "fold_details": fold_metrics,
    }

    return final_model, avg_metrics


def export_onnx(model: xgb.XGBRegressor, output_path: str, feature_names: list[str]):
    """Convert XGBoost model to ONNX format."""
    from onnxmltools import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType

    initial_type = [("features", FloatTensorType([None, len(feature_names)]))]
    onnx_model = convert_xgboost(model, initial_types=initial_type)

    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    print(f"ONNX model saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Train corner duration prediction model")
    parser.add_argument("--data-source", required=True, help="CSV file path or API URL")
    parser.add_argument("--output-dir", default=".", help="Directory for output files")
    parser.add_argument("--export-onnx", action="store_true", help="Also export ONNX model")
    parser.add_argument("--cv-folds", type=int, default=5, help="Number of CV folds")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load
    print(f"Loading data from: {args.data_source}")
    df = load_data(args.data_source)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    # Preprocess
    X, y, groups = preprocess(df)
    print(f"Training data: {X.shape[0]} samples, {X.shape[1]} features")
    print(f"Target stats: mean={y.mean():.2f}s, std={y.std():.2f}s, min={y.min():.2f}s, max={y.max():.2f}s")

    # Train
    print(f"\nTraining with GroupKFold (k={args.cv_folds})...")
    model, metrics = train_model(X, y, groups, n_splits=args.cv_folds)
    print(f"\nCV Results: MAE={metrics['mae']:.4f}s  RMSE={metrics['rmse']:.4f}s  R2={metrics['r2']:.4f}")

    # Feature importance
    importance = dict(zip(FEATURE_COLUMNS, model.feature_importances_.tolist()))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
    print("\nTop 10 features:")
    for feat, imp in top_features:
        print(f"  {feat}: {imp:.4f}")

    # Save model
    model_path = output_dir / "model.json"
    model.save_model(str(model_path))
    print(f"\nXGBoost model saved: {model_path}")

    # Save metadata
    norm_stats = compute_normalization_stats(X)
    meta = {
        "feature_names": FEATURE_COLUMNS,
        "target": TARGET_COLUMN,
        "normalization": norm_stats,
        "metrics": metrics,
        "feature_importance": importance,
    }
    meta_path = output_dir / "model_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Model metadata saved: {meta_path}")

    # Export ONNX
    if args.export_onnx:
        onnx_path = output_dir / "corner_duration.onnx"
        export_onnx(model, str(onnx_path), FEATURE_COLUMNS)

    print("\nDone!")


if __name__ == "__main__":
    main()
