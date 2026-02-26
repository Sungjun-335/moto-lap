import type { StoredSession, SessionData } from '../types';
import { segmentLaps } from './lapSegmentation';
import { matchTrack } from './trackMatcher';
import { getTrackById } from '../data/tracks';
import { detectCornersForSession } from './cornerDetection';
import { computeLapMetrics } from './formulaMetrics';

function estimateSampleRate(dataPoints: { time: number }[]): number {
    if (dataPoints.length < 2) return 20;
    const dt = dataPoints[1].time - dataPoints[0].time;
    if (dt <= 0) return 20;
    return Math.round(1 / dt);
}

export async function reconstructSession(stored: StoredSession): Promise<SessionData> {
    // 1. Lap segmentation
    const laps = segmentLaps(stored.dataPoints, stored.beaconMarkers);

    // 2. Track matching
    const track = stored.metadata.trackId
        ? getTrackById(stored.metadata.trackId)
        : matchTrack(stored.dataPoints);

    if (track && !stored.metadata.trackId) {
        stored.metadata.trackId = track.id;
    }

    // 3. Sample rate
    const sampleRate = estimateSampleRate(stored.dataPoints);

    // 4. Corner detection
    const lapsWithCorners = detectCornersForSession(laps, sampleRate, track ?? undefined);

    // 5. Lap metrics
    const lapsWithMetrics = lapsWithCorners.map(lap => ({
        ...lap,
        metrics: computeLapMetrics(lap.dataPoints, lap.index, sampleRate),
    }));

    return {
        id: stored.id,
        metadata: stored.metadata,
        beaconMarkers: stored.beaconMarkers,
        laps: lapsWithMetrics,
        dataPoints: stored.dataPoints,
    };
}
