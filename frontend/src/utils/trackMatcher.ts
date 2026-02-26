import type { LapData, Track } from '../types';
import { getAllTracks } from '../data/tracks';

/**
 * Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Match session GPS data against known tracks in the DB.
 *
 * Algorithm:
 *   1. Compute centroid of session GPS points
 *   2. Quick filter: tracks within 5km of centroid
 *   3. Precise check: average distance from sampled session points to nearest centerline point
 *   4. Best match wins if average distance < 100m
 */
export function matchTrack(dataPoints: LapData[]): Track | null {
    const tracks = getAllTracks();
    if (tracks.length === 0 || dataPoints.length === 0) return null;

    // 1. Session centroid (sample first 500 points for speed)
    const sample = dataPoints.slice(0, Math.min(500, dataPoints.length));
    let sumLat = 0, sumLon = 0;
    for (const p of sample) {
        sumLat += p.latitude;
        sumLon += p.longitude;
    }
    const centLat = sumLat / sample.length;
    const centLon = sumLon / sample.length;

    // 2. Quick filter: within 5km
    const candidates = tracks.filter(t =>
        haversineDistance(centLat, centLon, t.location.lat, t.location.lon) < 5000
    );

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 3. Precise matching: average min-distance to centerline
    // Sample ~50 evenly spaced session points
    const step = Math.max(1, Math.floor(sample.length / 50));
    const testPoints = sample.filter((_, i) => i % step === 0);

    let bestTrack: Track | null = null;
    let bestAvgDist = Infinity;

    for (const track of candidates) {
        const cl = track.centerline;
        let totalDist = 0;

        for (const tp of testPoints) {
            let minD = Infinity;
            // Sample centerline every 10 points for speed
            for (let i = 0; i < cl.length; i += 10) {
                const d = haversineDistance(tp.latitude, tp.longitude, cl[i].lat, cl[i].lon);
                if (d < minD) minD = d;
            }
            totalDist += minD;
        }

        const avgDist = totalDist / testPoints.length;
        if (avgDist < bestAvgDist) {
            bestAvgDist = avgDist;
            bestTrack = track;
        }
    }

    // Only accept if average distance < 100m
    return bestAvgDist < 100 ? bestTrack : null;
}
