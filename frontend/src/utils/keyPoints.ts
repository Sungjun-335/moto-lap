import type { AnalysisPoint } from './analysis';
import type { CornerRange } from '../components/Analysis/AnalysisChartWrapper';

export interface KeyPoint {
    distance: number;
    value: number;
    type: 'max' | 'min';
    lineColor?: string;
    labelPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export function formatKeyPointValue(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 100) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

/**
 * Resolve label positions to avoid overlapping.
 * Default: max→top, min→bottom. When two labels are close in distance,
 * alternate positions to prevent overlap.
 */
export function resolveKeyPointPositions(points: KeyPoint[]): KeyPoint[] {
    if (points.length === 0) return points;

    // Deep copy to avoid mutating originals, sorted by distance
    const sorted = points
        .map(p => ({ ...p, labelPosition: p.labelPosition ?? (p.type === 'max' ? 'top' : 'bottom') as KeyPoint['labelPosition'] }))
        .sort((a, b) => a.distance - b.distance);

    // Detect conflicts: check all previous nearby points, not just adjacent
    const totalDist = sorted[sorted.length - 1].distance - sorted[0].distance;
    const conflictThreshold = totalDist > 0 ? totalDist * 0.015 : 0.001;

    for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const hasConflict = sorted.slice(0, i).some(prev =>
            Math.abs(curr.distance - prev.distance) < conflictThreshold &&
            curr.labelPosition === prev.labelPosition
        );
        if (hasConflict) {
            // Flip vertically if same side
            if (curr.labelPosition === 'top') curr.labelPosition = 'bottom';
            else if (curr.labelPosition === 'bottom') curr.labelPosition = 'top';
        }
    }

    return sorted;
}

/**
 * Find max/min key points within each corner range.
 * Label positions are auto-determined based on clearance from other lines.
 */
export function findCornerKeyPoints(
    data: AnalysisPoint[],
    cornerRanges: CornerRange[],
    lines: { dataKey: keyof AnalysisPoint; color: string; type?: string }[],
): KeyPoint[] {
    if (data.length < 10 || !cornerRanges.length) return [];

    const points: KeyPoint[] = [];
    const continuousLines = lines.filter(l => l.type !== 'stepAfter');

    for (const cr of cornerRanges) {
        // Get data slice for this corner
        const slice = data.filter(p => p.distance >= cr.startDist && p.distance <= cr.endDist);
        if (slice.length < 3) continue;

        for (const line of continuousLines) {
            let maxVal = -Infinity;
            let minVal = Infinity;
            let maxPt: AnalysisPoint | null = null;
            let minPt: AnalysisPoint | null = null;

            for (const p of slice) {
                const v = Number(p[line.dataKey]) || 0;
                if (v > maxVal) { maxVal = v; maxPt = p; }
                if (v < minVal) { minVal = v; minPt = p; }
            }

            if (maxPt && maxVal !== minVal) {
                points.push({
                    distance: maxPt.distance,
                    value: maxVal,
                    type: 'max',
                    lineColor: line.color,
                    // Will be adjusted by adjustKeyPointsForLines
                });
            }
            if (minPt && maxVal !== minVal) {
                points.push({
                    distance: minPt.distance,
                    value: minVal,
                    type: 'min',
                    lineColor: line.color,
                });
            }
        }
    }

    return points;
}

/**
 * Adjust key point label positions to avoid overlapping with graph lines.
 * For each key point, checks all other lines' values at the same distance
 * and places the label on the side (top/bottom) with more clearance.
 */
export function adjustKeyPointsForLines(
    points: KeyPoint[],
    data: AnalysisPoint[],
    lines: { dataKey: keyof AnalysisPoint }[],
): KeyPoint[] {
    if (!points.length || data.length < 2 || lines.length < 2) return points;

    return points.map(kp => {
        // Binary search for nearest data point
        const dp = bsearchNearest(data, kp.distance);
        if (!dp) return kp;

        // Find closest other line above and below this key point's value
        let nearestAbove = Infinity;
        let nearestBelow = Infinity;

        for (const line of lines) {
            const v = Number(dp[line.dataKey]) || 0;
            const diff = v - kp.value;
            if (Math.abs(diff) < 0.001) continue; // skip own line
            if (diff > 0 && diff < nearestAbove) nearestAbove = diff;
            if (diff < 0 && -diff < nearestBelow) nearestBelow = -diff;
        }

        // No other lines found — keep default
        if (nearestAbove === Infinity && nearestBelow === Infinity) return kp;

        // Place label on the side with more clearance
        const pos: KeyPoint['labelPosition'] = nearestAbove >= nearestBelow ? 'top' : 'bottom';
        return { ...kp, labelPosition: pos };
    });
}

function bsearchNearest(data: AnalysisPoint[], distance: number): AnalysisPoint | null {
    if (!data.length) return null;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (data[mid].distance < distance) lo = mid + 1;
        else hi = mid;
    }
    if (lo > 0 && Math.abs(data[lo - 1].distance - distance) < Math.abs(data[lo].distance - distance)) {
        return data[lo - 1];
    }
    return data[lo];
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

    // Prominence threshold: 6% of total range
    const prominenceThreshold = range * 0.06;
    // Minimum distance separation between same-type key points: 2.5% of total distance
    const minSep = totalDist * 0.025;

    // Find all local maxima and minima
    const candidates: { idx: number; value: number; type: 'max' | 'min'; prominence: number }[] = [];

    for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const next = smoothed[i + 1];

        if (curr > prev && curr > next) {
            const prominence = computeProminence(smoothed, i, 'max');
            if (prominence >= prominenceThreshold) {
                candidates.push({ idx: i, value: values[i], type: 'max', prominence });
            }
        } else if (curr < prev && curr < next) {
            const prominence = computeProminence(smoothed, i, 'min');
            if (prominence >= prominenceThreshold) {
                candidates.push({ idx: i, value: values[i], type: 'min', prominence });
            }
        }
    }

    // Sort by prominence (most significant first)
    candidates.sort((a, b) => b.prominence - a.prominence);

    // Select top N non-overlapping points with per-type limit
    const maxPoints = 20;
    const maxPerType = 12;
    const selected: KeyPoint[] = [];
    const countByType = { max: 0, min: 0 };

    for (const c of candidates) {
        if (selected.length >= maxPoints) break;
        if (countByType[c.type] >= maxPerType) continue;
        const dist = distances[c.idx];
        // Only reject if same type is too close (allow max+min to be near each other)
        const tooClose = selected.some(p =>
            p.type === c.type && Math.abs(p.distance - dist) < minSep
        );
        if (!tooClose) {
            selected.push({
                distance: dist,
                value: c.value,
                type: c.type,
                lineColor,
            });
            countByType[c.type]++;
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
