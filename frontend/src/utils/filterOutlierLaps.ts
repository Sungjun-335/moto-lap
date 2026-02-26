import type { Lap } from '../types';

/**
 * Filter out outlier laps whose duration differs more than `threshold` (default 20%)
 * from the median lap duration. Removes in-laps, out-laps, and incident laps.
 * Returns at least 1 lap (the median lap) even if all laps are outliers.
 */
export function filterOutlierLaps(laps: Lap[], threshold = 0.2): Lap[] {
    if (laps.length <= 1) return laps;

    const durations = laps.map(l => l.duration).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median = durations.length % 2 === 0
        ? (durations[mid - 1] + durations[mid]) / 2
        : durations[mid];

    const filtered = laps.filter(lap => {
        const ratio = Math.abs(lap.duration - median) / median;
        return ratio <= threshold;
    });

    // Always return at least the lap closest to median
    if (filtered.length === 0) {
        const closest = laps.reduce((best, lap) =>
            Math.abs(lap.duration - median) < Math.abs(best.duration - median) ? lap : best
        );
        return [closest];
    }

    return filtered;
}
