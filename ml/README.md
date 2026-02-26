# Corner Duration Prediction ML

XGBoost model that predicts per-corner duration from driving features.
The trained model runs in-browser via ONNX Runtime Web for What-If analysis.

## Setup

```bash
pip install -r requirements.txt
```

## Training Pipeline

### 1. Export training data

```bash
# From API (requires running backend)
curl "http://localhost:8787/api/training-data?format=csv" -o training_data.csv

# Or download from production
curl "https://api.motolap.app/api/training-data?format=csv&venue=TanGa" -o training_data.csv
```

### 2. Train model

```bash
# From CSV file
python train.py --data-source training_data.csv --export-onnx

# From API directly
python train.py --data-source http://localhost:8787/api/training-data --export-onnx

# Custom output directory
python train.py --data-source data.csv --output-dir ./output --export-onnx
```

Output files:
- `model.json` — XGBoost native format (for retraining/inspection)
- `model_meta.json` — Feature names, normalization stats, CV metrics
- `corner_duration.onnx` — ONNX model for browser inference

### 3. Deploy to frontend

```bash
cp corner_duration.onnx ../frontend/public/models/
cp model_meta.json ../frontend/public/models/corner_duration_meta.json
```

## Feature Config

Features are defined in `feature_config.py` (single source of truth).
The same list must be mirrored in `frontend/src/utils/onnxInference.ts`.

## Model Details

- Algorithm: XGBoost Regressor
- CV: GroupKFold by session_id (prevents data leakage)
- ~35 features from braking, lean, throttle, G-dip, coasting profiles
- Target: corner duration in seconds
