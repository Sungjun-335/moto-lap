import type { Lap, LapData } from '../types';

type SegmentLapsOptions = {
    minLapDuration?: number;          // 너무 짧은 랩(중복 비콘) 제거 (seconds)
    includeIncompleteLastLap?: boolean; // 마지막 남은 데이터도 partial lap으로 추가
    epsilon?: number;                 // float 비교 보정
};

export const segmentLaps = (
    dataPoints: LapData[],
    beaconMarkers: number[],
    opts: SegmentLapsOptions = {}
): Lap[] => {
    const laps: Lap[] = [];
    if (dataPoints.length === 0) return laps;

    const eps = opts.epsilon ?? 1e-6;
    const minLap = opts.minLapDuration ?? 0;

    // 데이터가 시간순이라고 가정하지만, 깨질 수 있으면 정렬 고려
    // dataPoints = [...dataPoints].sort((a,b)=>a.time-b.time);

    const sessionStart = dataPoints[0].time;
    const sessionEnd = dataPoints[dataPoints.length - 1].time;

    // 1) 마커 정제: finite + 정렬 + 중복/너무짧은간격 제거 + 데이터 범위로 클립
    const markers = [...beaconMarkers]
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b)
        .filter((t) => t > sessionStart + eps && t <= sessionEnd + eps);

    const cleaned: number[] = [];
    for (const t of markers) {
        const last = cleaned[cleaned.length - 1];
        if (last == null) {
            cleaned.push(t);
            continue;
        }
        // 같은 비콘이 여러 샘플로 들어온 경우(혹은 중복 마커) 제거
        if (Math.abs(t - last) <= eps) continue;
        // 비정상적으로 짧은 랩 제거(중복 detection 방지)
        if (minLap > 0 && (t - last) < minLap) continue;
        cleaned.push(t);
    }

    // 2) 세그먼트: 포인터로 한 번만 스캔 (lap 구간을 (start, end]로 처리)
    let startTime = sessionStart;
    let startIdx = 0;
    let i = 0;
    let lapIndex = 1;

    const pushLap = (endTime: number, endIdxExclusive: number) => {
        if (endIdxExclusive <= startIdx) return;

        const lapPoints = dataPoints.slice(startIdx, endIdxExclusive);
        if (lapPoints.length === 0) return;

        laps.push({
            index: lapIndex++,
            startTime,
            endTime,
            duration: endTime - startTime,
            dataPoints: lapPoints,
        });
    };

    for (const markerTime of cleaned) {
        // markerTime까지 포함(<=)하고, 다음 랩은 markerTime 초과(>)부터 시작 → 중복 제거
        while (i < dataPoints.length && dataPoints[i].time <= markerTime + eps) i++;
        pushLap(markerTime, i);

        startTime = markerTime;
        startIdx = i;
    }

    // 3) 마지막 남은 데이터 (in-lap / cooldown lap)
    if (opts.includeIncompleteLastLap) {
        const endTime = sessionEnd;
        pushLap(endTime, dataPoints.length);
    }

    // 마커가 없으면 전체 1랩
    if (laps.length === 0) {
        return [{
            index: 1,
            startTime: sessionStart,
            endTime: sessionEnd,
            duration: sessionEnd - sessionStart,
            dataPoints,
        }];
    }

    return laps;
};