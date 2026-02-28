import type { AnalysisPoint } from './analysis';

/**
 * Gaussian kernel smoothing for G-force data.
 * Uses a weighted moving average with Gaussian weights.
 */

function gaussianKernel(windowSize: number): number[] {
    const sigma = windowSize / 4;
    const half = Math.floor(windowSize / 2);
    const weights: number[] = [];
    let sum = 0;
    for (let i = -half; i <= half; i++) {
        const w = Math.exp(-(i * i) / (2 * sigma * sigma));
        weights.push(w);
        sum += w;
    }
    // Normalize
    for (let i = 0; i < weights.length; i++) {
        weights[i] /= sum;
    }
    return weights;
}

function smoothArray(values: number[], kernel: number[]): number[] {
    const half = Math.floor(kernel.length / 2);
    const n = values.length;
    const result = new Float64Array(n);

    for (let i = 0; i < n; i++) {
        let sum = 0;
        let wSum = 0;
        for (let k = 0; k < kernel.length; k++) {
            const idx = i - half + k;
            if (idx >= 0 && idx < n) {
                sum += values[idx] * kernel[k];
                wSum += kernel[k];
            }
        }
        result[i] = sum / wSum;
    }

    return Array.from(result);
}

const G_FIELDS = ['anaLatG', 'refLatG', 'anaLonG', 'refLonG'] as const;
const GYRO_FIELDS = ['anaGyroX', 'refGyroX', 'anaGyroY', 'refGyroY', 'anaGyroZ', 'refGyroZ'] as const;

/**
 * Generic Gaussian smoothing for specified fields in AnalysisPoint[].
 */
function smoothFields(data: AnalysisPoint[], fields: readonly string[], windowSize: number): AnalysisPoint[] {
    if (data.length < windowSize) return data;

    const kernel = gaussianKernel(windowSize);

    const smoothed: Record<string, number[]> = {};
    for (const field of fields) {
        const raw = data.map(p => p[field as keyof AnalysisPoint] as number);
        smoothed[field] = smoothArray(raw, kernel);
    }

    return data.map((p, i) => {
        const updated: Record<string, number> = {};
        for (const field of fields) {
            updated[field] = smoothed[field][i];
        }
        return { ...p, ...updated };
    });
}

/**
 * Apply Gaussian smoothing to G-force fields in AnalysisPoint[].
 * Window size 15 ≈ moderate smoothing for typical 10-20Hz data.
 */
export function smoothGData(data: AnalysisPoint[], windowSize = 15): AnalysisPoint[] {
    return smoothFields(data, G_FIELDS, windowSize);
}

/**
 * Apply Gaussian smoothing to Gyro (Pitch/Roll/Yaw) fields in AnalysisPoint[].
 */
export function smoothGyroData(data: AnalysisPoint[], windowSize = 15): AnalysisPoint[] {
    return smoothFields(data, GYRO_FIELDS, windowSize);
}
