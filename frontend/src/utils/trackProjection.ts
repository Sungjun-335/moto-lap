import type { Track, Lap, Corner, LapData } from '../types';

/**
 * Project GPS points onto the track centerline.
 * For each GPS point, find the nearest centerline point and return its `dist` value.
 *
 * Uses a sliding window approach: since GPS points are sequential,
 * the nearest centerline point moves forward monotonically (with some tolerance).
 */
export function projectLapOntoTrack(
    dataPoints: LapData[],
    track: Track
): number[] {
    const cl = track.centerline;
    const n = cl.length;
    const projectedDist = new Array<number>(dataPoints.length);

    let searchStart = 0;
    const searchWindow = 200; // look +/- 200 centerline points from last match

    for (let i = 0; i < dataPoints.length; i++) {
        const p = dataPoints[i];
        let bestIdx = searchStart;
        let bestDsq = Infinity;

        const lo = Math.max(0, searchStart - searchWindow);
        const hi = Math.min(n - 1, searchStart + searchWindow);

        for (let j = lo; j <= hi; j++) {
            const dlat = p.latitude - cl[j].lat;
            const dlon = p.longitude - cl[j].lon;
            const dsq = dlat * dlat + dlon * dlon;
            if (dsq < bestDsq) {
                bestDsq = dsq;
                bestIdx = j;
            }
        }

        // If we're near the end/start, also search the wrap-around zone
        if (bestIdx < 50 || bestIdx > n - 50) {
            for (let j = 0; j < 50; j++) {
                const dlat = p.latitude - cl[j].lat;
                const dlon = p.longitude - cl[j].lon;
                const dsq = dlat * dlat + dlon * dlon;
                if (dsq < bestDsq) {
                    bestDsq = dsq;
                    bestIdx = j;
                }
            }
            for (let j = Math.max(0, n - 50); j < n; j++) {
                const dlat = p.latitude - cl[j].lat;
                const dlon = p.longitude - cl[j].lon;
                const dsq = dlat * dlat + dlon * dlon;
                if (dsq < bestDsq) {
                    bestDsq = dsq;
                    bestIdx = j;
                }
            }
        }

        projectedDist[i] = cl[bestIdx].dist;
        searchStart = bestIdx;
    }

    return projectedDist;
}

/**
 * Detect corners using track DB corner definitions + speed-based metrics.
 *
 * 1. Project each GPS point onto the track centerline (get trackDist)
 * 2. For each TrackCorner, find dataPoints within [entry.dist, exit.dist]
 * 3. Compute speed metrics from those data points
 */
export function detectCornersFromTrack(
    lap: Lap,
    track: Track,
    sampleRate: number
): Corner[] {
    const points = lap.dataPoints;
    if (points.length < 20) return [];

    const projectedDist = projectLapOntoTrack(points, track);
    const trackCorners = track.corners;
    const timeStep = 1 / sampleRate;
    const corners: Corner[] = [];

    for (const tc of trackCorners) {
        const entryDist = tc.entry.dist;
        const exitDist = tc.exit.dist;

        // Find data point indices within this corner's distance range
        let startIdx = -1;
        let endIdx = -1;

        for (let i = 0; i < projectedDist.length; i++) {
            const d = projectedDist[i];
            // Handle wrap-around for corners near start/finish
            const inRange = entryDist < exitDist
                ? (d >= entryDist && d <= exitDist)
                : (d >= entryDist || d <= exitDist);

            if (inRange) {
                if (startIdx === -1) startIdx = i;
                endIdx = i;
            } else if (startIdx !== -1 && endIdx !== -1) {
                // We've passed the corner, stop looking
                break;
            }
        }

        if (startIdx === -1 || endIdx === -1 || endIdx - startIdx < 3) continue;

        // Compute metrics from the data points in this range
        let minSpeed = Infinity;
        let apexIdx = startIdx;
        let maxLatG = 0;

        for (let i = startIdx; i <= endIdx; i++) {
            if (points[i].speed < minSpeed) {
                minSpeed = points[i].speed;
                apexIdx = i;
            }
            maxLatG = Math.max(maxLatG, Math.abs(points[i].latG));
        }

        const entrySpeed = points[startIdx].speed;
        const exitSpeed = points[endIdx].speed;
        const apexSpeed = points[apexIdx].speed;
        const duration = (endIdx - startIdx) * timeStep;

        corners.push({
            id: tc.id,
            lap_id: lap.index,
            start_time: lap.startTime + startIdx * timeStep,
            end_time: lap.startTime + endIdx * timeStep,
            apex_time: lap.startTime + apexIdx * timeStep,
            duration,
            direction: tc.direction,
            confidence: 1.0,
            metrics: {
                entry_speed: entrySpeed,
                min_speed: minSpeed,
                exit_speed: exitSpeed,
                apex_speed: apexSpeed,
                max_val: entrySpeed - minSpeed,
                max_lat_g: maxLatG,
            },
            start_idx: startIdx,
            end_idx: endIdx,
            apex_idx: apexIdx,
            trackCornerId: tc.id,
            name: tc.name,
        });
    }

    return corners;
}
