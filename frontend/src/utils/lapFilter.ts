import type { Lap } from '../types';

/**
 * Returns a Set of lap indices that deviate more than 10% from the average duration.
 */
export function getOutlierLapIndices(laps: Lap[]): Set<number> {
    if (laps.length < 3) return new Set();
    const durations = laps.map(l => l.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const threshold = avg * 0.1;
    return new Set(
        laps.filter(l => Math.abs(l.duration - avg) > threshold).map(l => l.index)
    );
}

/**
 * Pick the best (fastest) non-outlier lap from a list of laps.
 * Falls back to the absolute fastest if all laps are outliers.
 */
export function pickBestLap(laps: Lap[]): Lap | undefined {
    if (!laps.length) return undefined;
    const sorted = [...laps].sort((a, b) => a.duration - b.duration);
    const outliers = getOutlierLapIndices(laps);
    return sorted.find(l => !outliers.has(l.index)) ?? sorted[0];
}
