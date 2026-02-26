import type { Corner, LapData, CornerGeometry, Track } from '../types';
import { haversineDistance } from './trackMatcher';

export function computeCornerGeometry(
    corner: Corner,
    dataPoints: LapData[],
    track?: Track
): CornerGeometry {
    const startIdx = corner.start_idx ?? 0;
    const endIdx = corner.end_idx ?? dataPoints.length - 1;
    const apexIdx = corner.apex_idx ?? Math.floor((startIdx + endIdx) / 2);

    // 1. Travel distance: 연속 GPS 포인트 간 haversine 거리 합산
    let travelDist = 0;
    for (let i = startIdx; i < endIdx; i++) {
        travelDist += haversineDistance(
            dataPoints[i].latitude, dataPoints[i].longitude,
            dataPoints[i + 1].latitude, dataPoints[i + 1].longitude
        );
    }

    // 2. Apex GPS 좌표
    const apexPt = dataPoints[apexIdx];

    // 3. Track DB apex와의 거리
    let cpOffsetTrack: number | null = null;
    if (track && corner.trackCornerId != null) {
        const tc = track.corners.find(c => c.id === corner.trackCornerId);
        if (tc) {
            cpOffsetTrack = haversineDistance(
                apexPt.latitude, apexPt.longitude,
                tc.apex.lat, tc.apex.lon
            );
        }
    }

    return {
        travel_distance_m: travelDist,
        apex_lat: apexPt.latitude,
        apex_lon: apexPt.longitude,
        cp_offset_track_m: cpOffsetTrack,
    };
}

/** 모든 코너에 geometry를 일괄 enrichment */
export function enrichCornersWithGeometry(
    corners: Corner[],
    dataPoints: LapData[],
    track?: Track
): Corner[] {
    return corners.map(c => ({
        ...c,
        geometry: computeCornerGeometry(c, dataPoints, track),
    }));
}
