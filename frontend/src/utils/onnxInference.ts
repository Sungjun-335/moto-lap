/**
 * ONNX Runtime Web inference service for corner duration prediction.
 *
 * Lazy-loads the ONNX model and runtime only when first needed.
 * Feature order must match ml/feature_config.py FEATURE_COLUMNS.
 */

import type { Corner } from '../types';

// Must match ml/feature_config.py FEATURE_COLUMNS exactly
export const FEATURE_NAMES = [
    'corner_index', 'entry_speed', 'min_speed', 'exit_speed', 'apex_speed',
    'sob_offset_s', 'cob_offset_s', 'eob_offset_s', 'total_brk_g_s', 'min_accel_x_g',
    'sol_offset_s', 'col_offset_s', 'eol_offset_s', 'max_lean_deg', 'min_vel_kph', 'min_vel_offset_s',
    'sot_offset_s', 'cot_offset_s', 'eot_offset_s', 'total_tps_g_s', 'max_accel_x_g',
    'g_dip_value', 'g_dip_ratio', 'entry_mean_g_sum',
    'cst_total_time_s', 'cst_speed_loss_kph', 'cst_segments',
    'max_brake_jerk_g_per_s', 'mean_brake_jerk_g_per_s',
    'time_to_apex_s', 'time_from_apex_to_exit_s',
    'max_decel_mps2', 'entry_brake_ratio', 'max_lat_g', 'mean_lat_g',
] as const;

export type FeatureName = typeof FEATURE_NAMES[number];

export interface ModelMeta {
    feature_names: string[];
    target: string;
    normalization: Record<string, { mean: number; std: number; min: number; max: number }>;
    metrics: Record<string, number>;
    feature_importance: Record<string, number>;
}

export interface PredictionResult {
    cornerDurations: { cornerId: number; predicted: number; actual: number | null }[];
    totalPredicted: number;
    totalActual: number | null;
}

// Feature groupings for the UI
export const FEATURE_GROUPS = {
    speed: ['entry_speed', 'min_speed', 'exit_speed', 'apex_speed'],
    braking: ['sob_offset_s', 'cob_offset_s', 'eob_offset_s', 'total_brk_g_s', 'min_accel_x_g'],
    lean: ['sol_offset_s', 'col_offset_s', 'eol_offset_s', 'max_lean_deg', 'min_vel_kph', 'min_vel_offset_s'],
    throttle: ['sot_offset_s', 'cot_offset_s', 'eot_offset_s', 'total_tps_g_s', 'max_accel_x_g'],
    gDip: ['g_dip_value', 'g_dip_ratio', 'entry_mean_g_sum'],
    coasting: ['cst_total_time_s', 'cst_speed_loss_kph', 'cst_segments'],
    brakeJerk: ['max_brake_jerk_g_per_s', 'mean_brake_jerk_g_per_s'],
    timing: ['time_to_apex_s', 'time_from_apex_to_exit_s'],
    dynamics: ['max_decel_mps2', 'entry_brake_ratio', 'max_lat_g', 'mean_lat_g'],
} as const;

// Lazy-loaded state
let session: import('onnxruntime-web').InferenceSession | null = null;
let modelMeta: ModelMeta | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize ONNX Runtime and load the model. Called lazily on first prediction.
 */
export async function initModel(): Promise<void> {
    if (session) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const ort = await import('onnxruntime-web');

        // Configure WASM backend
        ort.env.wasm.numThreads = 1;

        // Load model metadata
        const metaResp = await fetch('/models/corner_duration_meta.json');
        if (metaResp.ok) {
            modelMeta = await metaResp.json();
        }

        // Load ONNX model
        session = await ort.InferenceSession.create('/models/corner_duration.onnx', {
            executionProviders: ['wasm'],
        });
    })();

    return initPromise;
}

/**
 * Check if the ONNX model is available (exists on server).
 */
export async function isModelAvailable(): Promise<boolean> {
    try {
        const resp = await fetch('/models/corner_duration.onnx', { method: 'HEAD' });
        return resp.ok;
    } catch {
        return false;
    }
}

/**
 * Get model metadata (normalization stats, feature importance, etc.)
 */
export function getModelMeta(): ModelMeta | null {
    return modelMeta;
}

/**
 * Get normalization stats for a specific feature.
 */
export function getFeatureStats(name: FeatureName): { mean: number; std: number; min: number; max: number } | null {
    if (!modelMeta?.normalization?.[name]) return null;
    return modelMeta.normalization[name];
}

/**
 * Extract flat feature values from a Corner object.
 */
export function cornerToFeatures(
    corner: Corner,
    overrides?: Partial<Record<FeatureName, number>>,
): Float32Array {
    const d = corner.driving;
    const m = corner.metrics;

    // Build a flat feature dict from the corner
    const values: Record<string, number> = {
        corner_index: corner.id ?? 0,
        entry_speed: m?.entry_speed ?? 0,
        min_speed: m?.min_speed ?? 0,
        exit_speed: m?.exit_speed ?? 0,
        apex_speed: m?.apex_speed ?? 0,
        // Braking
        sob_offset_s: d?.braking_profile?.sob_offset_s ?? 0,
        cob_offset_s: d?.braking_profile?.cob_offset_s ?? 0,
        eob_offset_s: d?.braking_profile?.eob_offset_s ?? 0,
        total_brk_g_s: d?.braking_profile?.total_brk_g_s ?? 0,
        min_accel_x_g: d?.braking_profile?.min_accel_x_g ?? 0,
        // Lean
        sol_offset_s: d?.lean_profile?.sol_offset_s ?? 0,
        col_offset_s: d?.lean_profile?.col_offset_s ?? 0,
        eol_offset_s: d?.lean_profile?.eol_offset_s ?? 0,
        max_lean_deg: d?.lean_profile?.max_lean_deg ?? 0,
        min_vel_kph: d?.lean_profile?.min_vel_kph ?? 0,
        min_vel_offset_s: d?.lean_profile?.min_vel_offset_s ?? 0,
        // Throttle
        sot_offset_s: d?.throttle_profile?.sot_offset_s ?? 0,
        cot_offset_s: d?.throttle_profile?.cot_offset_s ?? 0,
        eot_offset_s: d?.throttle_profile?.eot_offset_s ?? 0,
        total_tps_g_s: d?.throttle_profile?.total_tps_g_s ?? 0,
        max_accel_x_g: d?.throttle_profile?.max_accel_x_g ?? 0,
        // G-dip
        g_dip_value: d?.g_dip?.g_dip_value ?? 0,
        g_dip_ratio: d?.g_dip?.g_dip_ratio ?? 0,
        entry_mean_g_sum: d?.g_dip?.entry_mean_g_sum ?? 0,
        // Coasting
        cst_total_time_s: d?.coasting_penalty?.cst_total_time_s ?? 0,
        cst_speed_loss_kph: d?.coasting_penalty?.cst_speed_loss_kph ?? 0,
        cst_segments: d?.coasting_penalty?.cst_segments ?? 0,
        // Brake jerk
        max_brake_jerk_g_per_s: d?.brake_jerk?.max_brake_jerk_g_per_s ?? 0,
        mean_brake_jerk_g_per_s: d?.brake_jerk?.mean_brake_jerk_g_per_s ?? 0,
        // Basic timing — these may not be in DrivingFeatures yet, default to computed
        time_to_apex_s: corner.apex_time ? corner.apex_time - corner.start_time : 0,
        time_from_apex_to_exit_s: corner.apex_time ? corner.end_time - corner.apex_time : 0,
        // Dynamics — from metrics
        max_decel_mps2: 0,
        entry_brake_ratio: 0,
        max_lat_g: m?.max_lat_g ?? 0,
        mean_lat_g: 0,
    };

    // Apply overrides
    if (overrides) {
        for (const [key, val] of Object.entries(overrides)) {
            if (val !== undefined) {
                values[key] = val;
            }
        }
    }

    // Build Float32Array in feature order
    const arr = new Float32Array(FEATURE_NAMES.length);
    for (let i = 0; i < FEATURE_NAMES.length; i++) {
        arr[i] = values[FEATURE_NAMES[i]] ?? 0;
    }
    return arr;
}

/**
 * Predict duration for a single corner.
 */
export async function predictCornerDuration(
    corner: Corner,
    overrides?: Partial<Record<FeatureName, number>>,
): Promise<number> {
    await initModel();
    if (!session) throw new Error('ONNX model not loaded');

    const ort = await import('onnxruntime-web');
    const features = cornerToFeatures(corner, overrides);
    const inputTensor = new ort.Tensor('float32', features, [1, FEATURE_NAMES.length]);

    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0];
    const output = results[outputName];

    return (output.data as Float32Array)[0];
}

/**
 * Predict lap time from an array of corners with optional per-corner overrides.
 */
export async function predictLapTime(
    corners: Corner[],
    overridesMap?: Map<number, Partial<Record<FeatureName, number>>>,
): Promise<PredictionResult> {
    await initModel();
    if (!session) throw new Error('ONNX model not loaded');

    const ort = await import('onnxruntime-web');
    const cornerDurations: PredictionResult['cornerDurations'] = [];
    let totalPredicted = 0;
    let totalActual: number | null = 0;

    // Batch all corners into a single inference call
    const batchSize = corners.length;
    const flatFeatures = new Float32Array(batchSize * FEATURE_NAMES.length);

    for (let i = 0; i < batchSize; i++) {
        const corner = corners[i];
        const overrides = overridesMap?.get(corner.id);
        const features = cornerToFeatures(corner, overrides);
        flatFeatures.set(features, i * FEATURE_NAMES.length);
    }

    const inputTensor = new ort.Tensor('float32', flatFeatures, [batchSize, FEATURE_NAMES.length]);
    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0];
    const predictions = results[outputName].data as Float32Array;

    for (let i = 0; i < batchSize; i++) {
        const corner = corners[i];
        const predicted = predictions[i];
        const actual = corner.duration ?? null;

        cornerDurations.push({
            cornerId: corner.id,
            predicted,
            actual,
        });

        totalPredicted += predicted;
        if (actual !== null && totalActual !== null) {
            totalActual += actual;
        } else {
            totalActual = null;
        }
    }

    return { cornerDurations, totalPredicted, totalActual };
}
