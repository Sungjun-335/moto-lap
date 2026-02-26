import type { AnalysisPoint } from './analysis';

export interface KeyPoint {
    distance: number;
    value: number;
    type: 'max' | 'min';
    lineColor?: string;
}

export function formatKeyPointValue(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 100) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

/**
 * Find significant local peaks and valleys using prominence-based detection.
 * Returns local maxima ('max') and local minima ('min') that are prominent enough
 * relative to the overall data range.
 */
export function findKeyPoints(
    data: AnalysisPoint[],
    dataKey: keyof AnalysisPoint,
    lineColor?: string,
): KeyPoint[] {
    if (data.length < 10) return [];

    const values = data.map(d => Number(d[dataKey]) || 0);
    const distances = data.map(d => d.distance);
    const totalDist = distances[distances.length - 1] - distances[0];
    if (totalDist <= 0) return [];

    // Smooth data to reduce noise
    const windowSize = Math.max(5, Math.floor(data.length / 30));
    const smoothed = movingAverage(values, windowSize);

    // Find global range for prominence threshold
    let globalMax = -Infinity;
    let globalMin = Infinity;
    for (const v of smoothed) {
        if (v > globalMax) globalMax = v;
        if (v < globalMin) globalMin = v;
    }
    const range = globalMax - globalMin;
    if (range < 0.01) return [];

    // Prominence threshold: 8% of total range
    const prominenceThreshold = range * 0.08;
    // Minimum distance separation between key points: 2% of total distance
    const minSep = totalDist * 0.02;

    // Find all local maxima and minima
    const candidates: { idx: number; value: number; type: 'max' | 'min'; prominence: number }[] = [];

    for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const next = smoothed[i + 1];

        if (curr > prev && curr > next) {
            // Local maximum — compute prominence
            const prominence = computeProminence(smoothed, i, 'max');
            if (prominence >= prominenceThreshold) {
                candidates.push({ idx: i, value: values[i], type: 'max', prominence });
            }
        } else if (curr < prev && curr < next) {
            // Local minimum — compute prominence
            const prominence = computeProminence(smoothed, i, 'min');
            if (prominence >= prominenceThreshold) {
                candidates.push({ idx: i, value: values[i], type: 'min', prominence });
            }
        }
    }

    // Sort by prominence (most significant first)
    candidates.sort((a, b) => b.prominence - a.prominence);

    // Select top N non-overlapping points
    const maxPoints = 12;
    const selected: KeyPoint[] = [];

    for (const c of candidates) {
        if (selected.length >= maxPoints) break;
        const dist = distances[c.idx];
        const tooClose = selected.some(p => Math.abs(p.distance - dist) < minSep);
        if (!tooClose) {
            selected.push({
                distance: dist,
                value: c.value,
                type: c.type,
                lineColor,
            });
        }
    }

    return selected;
}

function movingAverage(values: number[], windowSize: number): number[] {
    const result: number[] = new Array(values.length);
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < values.length; i++) {
        let sum = 0;
        let count = 0;
        const start = Math.max(0, i - half);
        const end = Math.min(values.length - 1, i + half);
        for (let j = start; j <= end; j++) {
            sum += values[j];
            count++;
        }
        result[i] = sum / count;
    }
    return result;
}

function computeProminence(smoothed: number[], peakIdx: number, type: 'max' | 'min'): number {
    const peakVal = smoothed[peakIdx];

    // Search left for the nearest higher (for max) or lower (for min) point
    let leftBarrier = peakVal;
    for (let i = peakIdx - 1; i >= 0; i--) {
        if (type === 'max' && smoothed[i] > peakVal) { leftBarrier = smoothed[i]; break; }
        if (type === 'min' && smoothed[i] < peakVal) { leftBarrier = smoothed[i]; break; }
        // Track the deepest valley (for max) or highest peak (for min) on this side
        if (type === 'max') leftBarrier = Math.min(leftBarrier, smoothed[i]);
        else leftBarrier = Math.max(leftBarrier, smoothed[i]);
    }

    // Search right
    let rightBarrier = peakVal;
    for (let i = peakIdx + 1; i < smoothed.length; i++) {
        if (type === 'max' && smoothed[i] > peakVal) { rightBarrier = smoothed[i]; break; }
        if (type === 'min' && smoothed[i] < peakVal) { rightBarrier = smoothed[i]; break; }
        if (type === 'max') rightBarrier = Math.min(rightBarrier, smoothed[i]);
        else rightBarrier = Math.max(rightBarrier, smoothed[i]);
    }

    // Prominence = distance from peak to the higher of the two barriers
    if (type === 'max') {
        return peakVal - Math.max(leftBarrier, rightBarrier);
    } else {
        return Math.min(leftBarrier, rightBarrier) - peakVal;
    }
}
