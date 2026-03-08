import type { Lap, LapData, Corner, Track } from '../types';
import { detectCornersFromTrack } from './trackProjection';
import { computeCornerDriving } from './formulaMetrics';
import { enrichCornersWithGeometry } from './cornerGeometry';

/**
 * Corner detection based on speed peaks (braking points).
 *
 * Definition of a corner:
 *   speed peak (braking start) → deceleration → apex (min speed) → acceleration → next speed peak
 *
 * Algorithm:
 *   1. Smooth speed signal
 *   2. Find local speed maxima (= braking start points)
 *   3. Each segment between consecutive peaks = one corner
 *   4. Filter out segments with negligible speed drop (straights)
 *   5. Extract metrics (entry/exit/min/apex speed, direction, duration)
 */

// --- Config ---
const MIN_PEAK_SPEED_KPH = 30;     // Ignore peaks below this (pit lane, etc.)
const MIN_SPEED_DROP_KPH = 5;      // Minimum (peak - min) to qualify as a corner
const MIN_CORNER_DURATION_S = 1.0; // Minimum corner duration in seconds
const PEAK_PROMINENCE_KPH = 5;     // Minimum prominence for a speed peak
const TOP_SPEED_MARGIN_KPH = 3;    // Extend Corner 1 start into top speed zone

// Lateral G auxiliary detection config
const LAT_G_THRESHOLD = 0.3;           // Minimum |latG| to qualify as a corner
const LAT_G_PROMINENCE = 0.15;         // Minimum prominence for a latG peak
const LAT_G_MIN_DURATION_S = 0.8;      // Minimum flat corner duration

// --- Helpers ---

function smoothArray(arr: Float64Array, windowSize: number): Float64Array {
    const n = arr.length;
    const out = new Float64Array(n);
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
            sum += arr[j];
            count++;
        }
        out[i] = sum / count;
    }
    return out;
}

/**
 * Find local maxima with minimum prominence.
 * Returns indices of peaks in the smoothed speed array.
 */
function findSpeedPeaks(
    speed: Float64Array,
    minHeight: number,
    minProminence: number,
    minDistanceFrames: number
): number[] {
    const n = speed.length;

    // Step 1: find all local maxima
    const candidates: number[] = [];
    for (let i = 1; i < n - 1; i++) {
        if (speed[i] >= speed[i - 1] && speed[i] >= speed[i + 1] && speed[i] >= minHeight) {
            candidates.push(i);
        }
    }

    // Step 2: filter by prominence
    // Prominence = how much the peak stands out from the surrounding valleys
    const prominent: number[] = [];
    for (const idx of candidates) {
        // Find the lowest valley on each side before hitting a higher peak
        let leftMin = speed[idx];
        for (let j = idx - 1; j >= 0; j--) {
            leftMin = Math.min(leftMin, speed[j]);
            if (speed[j] > speed[idx]) break;
        }

        let rightMin = speed[idx];
        for (let j = idx + 1; j < n; j++) {
            rightMin = Math.min(rightMin, speed[j]);
            if (speed[j] > speed[idx]) break;
        }

        const prominence = speed[idx] - Math.max(leftMin, rightMin);
        if (prominence >= minProminence) {
            prominent.push(idx);
        }
    }

    // Step 3: enforce minimum distance between peaks (keep higher peak)
    const filtered: number[] = [];
    for (const idx of prominent) {
        if (filtered.length === 0) {
            filtered.push(idx);
            continue;
        }
        const last = filtered[filtered.length - 1];
        if (idx - last < minDistanceFrames) {
            // Keep whichever is higher
            if (speed[idx] > speed[last]) {
                filtered[filtered.length - 1] = idx;
            }
        } else {
            filtered.push(idx);
        }
    }

    return filtered;
}

/**
 * Determine corner direction (L/R) using GPS trajectory curvature.
 */
function getDirection(points: LapData[], startIdx: number, endIdx: number): string {
    // Use lat/lon to compute a rough signed turning angle
    const mid = Math.floor((startIdx + endIdx) / 2);
    const i0 = Math.max(startIdx, mid - 5);
    const i1 = mid;
    const i2 = Math.min(endIdx, mid + 5);

    if (i0 === i1 || i1 === i2) return '';

    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];

    // Cross product of vectors (p0->p1) x (p1->p2)
    const ax = p1.longitude - p0.longitude;
    const ay = p1.latitude - p0.latitude;
    const bx = p2.longitude - p1.longitude;
    const by = p2.latitude - p1.latitude;
    const cross = ax * by - ay * bx;

    if (Math.abs(cross) < 1e-12) return '';
    return cross > 0 ? 'L' : 'R';
}

/**
 * Find peaks in |latG| signal with minimum prominence.
 */
function findLatGPeaks(
    absLatG: Float64Array,
    minHeight: number,
    minProminence: number,
    minDistanceFrames: number
): number[] {
    const n = absLatG.length;

    const candidates: number[] = [];
    for (let i = 1; i < n - 1; i++) {
        if (absLatG[i] >= absLatG[i - 1] && absLatG[i] >= absLatG[i + 1] && absLatG[i] >= minHeight) {
            candidates.push(i);
        }
    }

    const prominent: number[] = [];
    for (const idx of candidates) {
        let leftMin = absLatG[idx];
        for (let j = idx - 1; j >= 0; j--) {
            leftMin = Math.min(leftMin, absLatG[j]);
            if (absLatG[j] > absLatG[idx]) break;
        }
        let rightMin = absLatG[idx];
        for (let j = idx + 1; j < n; j++) {
            rightMin = Math.min(rightMin, absLatG[j]);
            if (absLatG[j] > absLatG[idx]) break;
        }
        const prominence = absLatG[idx] - Math.max(leftMin, rightMin);
        if (prominence >= minProminence) {
            prominent.push(idx);
        }
    }

    const filtered: number[] = [];
    for (const idx of prominent) {
        if (filtered.length === 0) {
            filtered.push(idx);
            continue;
        }
        const last = filtered[filtered.length - 1];
        if (idx - last < minDistanceFrames) {
            if (absLatG[idx] > absLatG[last]) {
                filtered[filtered.length - 1] = idx;
            }
        } else {
            filtered.push(idx);
        }
    }

    return filtered;
}

// --- Public API ---

export function detectCorners(lap: Lap, sampleRate: number): Corner[] {
    const points = lap.dataPoints;
    if (points.length < 20) return [];

    const n = points.length;

    // 1. Extract & smooth speed
    const rawSpeed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        rawSpeed[i] = points[i].speed;
    }

    const smoothWindow = Math.max(5, Math.round(sampleRate * 0.5)) | 1; // ~0.5s window
    const speed = smoothArray(rawSpeed, smoothWindow);

    // 2. Find speed peaks (braking start points)
    const minDistFrames = Math.round(sampleRate * MIN_CORNER_DURATION_S);
    const peaks = findSpeedPeaks(speed, MIN_PEAK_SPEED_KPH, PEAK_PROMINENCE_KPH, minDistFrames);

    if (peaks.length < 2) return [];

    // 3. Each segment between consecutive peaks = one corner
    const timeStep = 1 / sampleRate;
    const lapStartTime = lap.startTime;
    const corners: Corner[] = [];

    for (let p = 0; p < peaks.length - 1; p++) {
        let startIdx = peaks[p];
        const endIdx = peaks[p + 1];

        // For the first corner, extend start backwards to include the top speed zone
        if (p === 0 && startIdx > 0) {
            const topSpeedThreshold = speed[startIdx] - TOP_SPEED_MARGIN_KPH;
            while (startIdx > 0 && speed[startIdx - 1] >= topSpeedThreshold) {
                startIdx--;
            }
        }

        const duration = (endIdx - startIdx) * timeStep;

        if (duration < MIN_CORNER_DURATION_S) continue;

        // Find apex (minimum speed in this segment)
        let apexIdx = startIdx;
        let minSpd = speed[startIdx];
        for (let i = startIdx + 1; i <= endIdx; i++) {
            if (speed[i] < minSpd) {
                minSpd = speed[i];
                apexIdx = i;
            }
        }

        // Filter: must have significant speed drop (use peak speed, not extended start)
        const entrySpeed = speed[peaks[p]];
        const speedDrop = entrySpeed - minSpd;
        if (speedDrop < MIN_SPEED_DROP_KPH) continue;

        const exitSpeed = speed[endIdx];
        const apexSpeed = speed[apexIdx];

        // Direction from GPS
        const direction = getDirection(points, startIdx, endIdx);

        // Find max |latG| in this segment
        let maxLatG = 0;
        for (let i = startIdx; i <= endIdx; i++) {
            maxLatG = Math.max(maxLatG, Math.abs(points[i].latG));
        }

        corners.push({
            id: corners.length + 1,
            lap_id: lap.index,
            start_time: lapStartTime + startIdx * timeStep,
            end_time: lapStartTime + endIdx * timeStep,
            apex_time: lapStartTime + apexIdx * timeStep,
            duration,
            direction: direction || undefined,
            confidence: 0.9,
            metrics: {
                entry_speed: entrySpeed,
                min_speed: minSpd,
                exit_speed: exitSpeed,
                apex_speed: apexSpeed,
                max_val: speedDrop,
                max_lat_g: maxLatG,
            },
            start_idx: startIdx,
            end_idx: endIdx,
            apex_idx: apexIdx,
        });
    }

    // --- Lateral G auxiliary detection for flat corners ---
    const rawLatG = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        rawLatG[i] = Math.abs(points[i].latG);
    }
    const smoothedLatG = smoothArray(rawLatG, smoothWindow);

    const latGMinDist = Math.round(sampleRate * LAT_G_MIN_DURATION_S);
    const latGPeaks = findLatGPeaks(smoothedLatG, LAT_G_THRESHOLD, LAT_G_PROMINENCE, latGMinDist);

    for (const peakIdx of latGPeaks) {
        // Check if this peak is already inside an existing speed-peak corner
        const alreadyCovered = corners.some(c =>
            c.start_idx !== undefined && c.end_idx !== undefined &&
            peakIdx >= c.start_idx && peakIdx <= c.end_idx
        );
        if (alreadyCovered) continue;

        // Find the extent of the lateral G event (where |latG| > threshold/2)
        const halfThreshold = LAT_G_THRESHOLD * 0.5;
        let startIdx = peakIdx;
        while (startIdx > 0 && smoothedLatG[startIdx - 1] >= halfThreshold) {
            startIdx--;
        }
        let endIdx = peakIdx;
        while (endIdx < n - 1 && smoothedLatG[endIdx + 1] >= halfThreshold) {
            endIdx++;
        }

        const duration = (endIdx - startIdx) * timeStep;
        if (duration < LAT_G_MIN_DURATION_S) continue;

        // Find min speed in segment (apex)
        let apexIdx = startIdx;
        let minSpd = speed[startIdx];
        for (let i = startIdx + 1; i <= endIdx; i++) {
            if (speed[i] < minSpd) {
                minSpd = speed[i];
                apexIdx = i;
            }
        }

        const direction = getDirection(points, startIdx, endIdx);

        corners.push({
            id: corners.length + 1,
            lap_id: lap.index,
            start_time: lapStartTime + startIdx * timeStep,
            end_time: lapStartTime + endIdx * timeStep,
            apex_time: lapStartTime + apexIdx * timeStep,
            duration,
            direction: direction || undefined,
            confidence: 0.6, // Lower confidence for latG-only corners
            metrics: {
                entry_speed: speed[startIdx],
                min_speed: minSpd,
                exit_speed: speed[endIdx],
                apex_speed: speed[apexIdx],
                max_val: speed[startIdx] - minSpd,
                max_lat_g: smoothedLatG[peakIdx],
            },
            start_idx: startIdx,
            end_idx: endIdx,
            apex_idx: apexIdx,
        });
    }

    // Sort by start_time and re-assign IDs
    corners.sort((a, b) => a.start_time - b.start_time);
    corners.forEach((c, i) => { c.id = i + 1; });

    return corners;
}

/** Compute driving features for all corners in a lap. */
function enrichCornersWithDriving(corners: Corner[], lap: Lap, sampleRate: number): Corner[] {
    return corners.map(c => {
        if (c.start_idx === undefined || c.end_idx === undefined) return c;
        const slice = lap.dataPoints.slice(c.start_idx, c.end_idx + 1);
        if (slice.length < 3) return c;
        const apexLocal = c.apex_idx != null && c.start_idx != null ? c.apex_idx - c.start_idx : undefined;
        const driving = computeCornerDriving(slice, sampleRate, lap.dataPoints, apexLocal);
        return { ...c, driving };
    });
}

/** Detect corners for all laps in a session.
 *  If a Track is provided, uses track DB-based corner mapping.
 *  Otherwise falls back to speed-peak based detection.
 */
export function detectCornersForSession(laps: Lap[], sampleRate: number, track?: Track): Lap[] {
    // Track DB mode: use defined corner positions for consistent detection
    if (track) {
        return laps.map(lap => {
            const corners = detectCornersFromTrack(lap, track, sampleRate);
            const withDriving = enrichCornersWithDriving(corners, lap, sampleRate);
            const enriched = enrichCornersWithGeometry(withDriving, lap.dataPoints, track);
            return { ...lap, corners: enriched };
        });
    }

    // Fallback: speed-peak based detection
    // Find best reference lap: closest to median duration (= normal flying lap)
    const sortedDurations = [...laps].sort((a, b) => a.duration - b.duration);
    const medianDuration = sortedDurations[Math.floor(sortedDurations.length / 2)].duration;
    const refLap = [...laps].sort((a, b) =>
        Math.abs(a.duration - medianDuration) - Math.abs(b.duration - medianDuration)
    )[0];

    const refCorners = detectCorners(refLap, sampleRate);
    const refWithDriving = enrichCornersWithDriving(refCorners, refLap, sampleRate);
    const enrichedRefCorners = enrichCornersWithGeometry(refWithDriving, refLap.dataPoints);

    return laps.map(lap => {
        if (lap.index === refLap.index) {
            return { ...lap, corners: enrichedRefCorners };
        }

        const corners = detectCorners(lap, sampleRate);

        // 1:1 spatial matching to align corner IDs with reference lap
        if (enrichedRefCorners.length > 0 && corners.length > 0) {
            const refPoints = refLap.dataPoints;
            const lapPoints = lap.dataPoints;

            const getApexPoint = (c: Corner, pts: LapData[]) => {
                const idx = c.start_idx !== undefined && c.end_idx !== undefined
                    ? Math.min(c.start_idx + Math.round((c.end_idx - c.start_idx) / 2), pts.length - 1)
                    : 0;
                return pts[idx];
            };

            // Greedy 1:1 matching by GPS distance
            const usedRef = new Set<number>();
            const usedCorner = new Set<number>();
            const pairs: { ci: number; ri: number; dist: number }[] = [];

            for (let ci = 0; ci < corners.length; ci++) {
                const ap = getApexPoint(corners[ci], lapPoints);
                for (let ri = 0; ri < enrichedRefCorners.length; ri++) {
                    const rp = getApexPoint(enrichedRefCorners[ri], refPoints);
                    const dlat = ap.latitude - rp.latitude;
                    const dlon = ap.longitude - rp.longitude;
                    pairs.push({ ci, ri, dist: dlat * dlat + dlon * dlon });
                }
            }
            pairs.sort((a, b) => a.dist - b.dist);

            const idMap = new Map<number, number>();
            for (const { ci, ri } of pairs) {
                if (usedCorner.has(ci) || usedRef.has(ri)) continue;
                idMap.set(ci, enrichedRefCorners[ri].id);
                usedCorner.add(ci);
                usedRef.add(ri);
            }

            let nextId = enrichedRefCorners.length + 1;
            const matchedCorners = corners.map((c, ci) => ({
                ...c,
                id: idMap.get(ci) ?? nextId++,
            }));

            const matchedWithDriving = enrichCornersWithDriving(matchedCorners, lap, sampleRate);
            const enrichedMatched = enrichCornersWithGeometry(matchedWithDriving, lap.dataPoints);
            return { ...lap, corners: enrichedMatched };
        }

        const cornersWithDriving = enrichCornersWithDriving(corners, lap, sampleRate);
        const enrichedCorners = enrichCornersWithGeometry(cornersWithDriving, lap.dataPoints);
        return { ...lap, corners: enrichedCorners };
    });
}
