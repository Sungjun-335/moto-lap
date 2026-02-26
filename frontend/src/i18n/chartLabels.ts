import type { Translations } from './types';

const CHART_LABEL_MAP: Record<string, keyof Translations['charts']> = {
    delta: 'timeDelta',
    speed: 'speed',
    input: 'rpm',
    throttle_brake: 'throttleBrake',
    gsum: 'gSum',
    activity: 'activityChannel',
    lat_g: 'lateralG',
    lon_g: 'longitudinalG',
    lean: 'leanAngle',
    gear: 'gear',
    speed_delta: 'speedDelta',
    brk: 'brkChart',
    crn: 'crnChart',
    tps: 'tpsChart',
    cst: 'cstChart',
    pitch_rate: 'pitchRate',
    roll_rate: 'rollRate',
    yaw_rate: 'yawRate',
    driving_events: 'drivingEvents',
};

const CHART_TITLE_MAP: Record<string, keyof Translations['charts']> = {
    delta: 'timeDelta',
    speed: 'speed',
    input: 'rpm',
    throttle_brake: 'throttleBrake',
    gsum: 'gSum',
    activity: 'activityChannel',
    lat_g: 'lateralG',
    lon_g: 'longitudinalG',
    lean: 'leanAngle',
    gear: 'gear',
    speed_delta: 'speedDeltaTitle',
    brk: 'brkChartTitle',
    crn: 'crnChartTitle',
    tps: 'tpsChartTitle',
    cst: 'cstChartTitle',
    pitch_rate: 'pitchRateTitle',
    roll_rate: 'rollRateTitle',
    yaw_rate: 'yawRateTitle',
    driving_events: 'drivingEvents',
};

export function getChartLabel(chartId: string, t: Translations): string {
    const key = CHART_LABEL_MAP[chartId];
    if (key) return t.charts[key];
    return chartId;
}

export function getChartTitle(chartId: string, t: Translations): string {
    const key = CHART_TITLE_MAP[chartId];
    if (key) return t.charts[key];
    return getChartLabel(chartId, t);
}
