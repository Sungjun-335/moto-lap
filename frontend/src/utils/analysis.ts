import type { LapData, Lap } from '../types';

export interface AnalysisPoint {
    distance: number;
    refTime: number;
    anaTime: number;
    timeDelta: number; // refTime - anaTime (Positive = Ana is Faster? No. Ref - Ana. If Ref=100, Ana=99, Delta=+1 (Ana is faster by 1s?))
    // Standard: Delta = Current - Reference.
    // If Current (Ana) = 99, Ref = 100. Delta = -1 (1s faster).
    // Let's use: timeDelta = anaTime - refTime.
    // If Result < 0, Ana is ahead (faster).

    refSpeed: number;
    anaSpeed: number;
    speedDelta: number; // anaSpeed - refSpeed

    refTps: number;
    anaTps: number;

    refBrake: number;
    anaBrake: number;

    refGear: number;
    anaGear: number;

    refRpm: number;
    anaRpm: number;

    refLatG: number;
    anaLatG: number;
    refLonG: number;
    anaLonG: number;
    refGSum: number;
    anaGSum: number;
    refLean: number;
    anaLean: number;
    refGyroX: number;
    anaGyroX: number;
    refGyroY: number;
    anaGyroY: number;
    refGyroZ: number;
    anaGyroZ: number;
    isCoasting: boolean;
    // Formula boolean channels (0 or 1, computed post-calibration)
    anaBrkOn: number;
    anaCrnOn: number;
    anaTpsOn: number;
    anaCstOn: number;
    refBrkOn: number;
    refCrnOn: number;
    refTpsOn: number;
    refCstOn: number;
    lat: number;
    lon: number;
    refLat: number;
    refLon: number;
}

export const interpolateValue = (
    targetDist: number,
    p1: LapData,
    p2: LapData,
    key: keyof LapData
): number => {
    const d1 = p1.distance;
    const d2 = p2.distance;
    const v1 = Number(p1[key]) || 0;
    const v2 = Number(p2[key]) || 0;

    if (d1 === d2) return v1;

    const ratio = (targetDist - d1) / (d2 - d1);
    return v1 + (v2 - v1) * ratio;
};

export const alignLaps = (refLap: Lap, anaLap: Lap): AnalysisPoint[] => {
    // We normalize distances to start at 0 for both loops just in case
    const refStart = refLap.dataPoints[0]?.distance || 0;
    const anaStart = anaLap.dataPoints[0]?.distance || 0;

    const refPoints = refLap.dataPoints.map(p => ({ ...p, distance: p.distance - refStart }));
    const anaPoints = anaLap.dataPoints.map(p => ({ ...p, distance: p.distance - anaStart }));

    // Auto-detect and fix distance unit mismatch (km vs meters).
    // A typical track lap is 1–6 km. If max distance > 100, it's likely in meters.
    const refMaxDist = refPoints.length > 0 ? refPoints[refPoints.length - 1].distance : 0;
    const anaMaxDist = anaPoints.length > 0 ? anaPoints[anaPoints.length - 1].distance : 0;

    if (refMaxDist > 100 && anaMaxDist < 100 && anaMaxDist > 0) {
        // REF in meters, ANA in km → convert REF to km
        for (const p of refPoints) p.distance /= 1000;
    } else if (anaMaxDist > 100 && refMaxDist < 100 && refMaxDist > 0) {
        // ANA in meters, REF in km → convert ANA to km
        for (const p of anaPoints) p.distance /= 1000;
    }

    // We base our X-axis on the Analysis Lap
    const aligned: AnalysisPoint[] = [];

    // Helper to find ref index
    let lastRefIdx = 0;

    for (const anaP of anaPoints) {
        const d = anaP.distance;

        // Find surrounding points in Ref Lap
        // Optimization: Ref points are sorted by distance
        while (lastRefIdx < refPoints.length - 1 && refPoints[lastRefIdx + 1].distance < d) {
            lastRefIdx++;
        }


        const p1 = refPoints[lastRefIdx];
        const p2 = refPoints[lastRefIdx + 1];

        if (!p1 || !p2) {
            // Out of bounds (Ref lap shorter?), just push nulls or hold last value?
            // For now, skip or clamp.
            continue;
        }

        // Interpolate
        const iTime = interpolateValue(d, p1, p2, 'time');
        const iSpeed = interpolateValue(d, p1, p2, 'speed');
        const iTps = interpolateValue(d, p1, p2, 'tps');
        const iBrake = interpolateValue(d, p1, p2, 'brake');
        const iGear = p1.gear; // Don't interpolate gear, take previous
        const iRpm = interpolateValue(d, p1, p2, 'rpm');
        const iLatG = interpolateValue(d, p1, p2, 'latG');
        const iLonG = interpolateValue(d, p1, p2, 'lonG');
        const iGyroX = interpolateValue(d, p1, p2, 'gyroX');
        const iGyroY = interpolateValue(d, p1, p2, 'gyroY');
        const iGyroZ = interpolateValue(d, p1, p2, 'gyroZ');
        const iLat = interpolateValue(d, p1, p2, 'latitude');
        const iLon = interpolateValue(d, p1, p2, 'longitude');

        // Calculate time delta
        // We need all times to be RELATIVE to lap start
        // anaP.time is from session start. refLap.startTime is Ref Lap Start.
        // We need: (anaP.time - anaLap.startTime) - (iTime - refLap.startTime)

        const anaRelativeTime = anaP.time - anaLap.startTime;
        const refRelativeTime = iTime - refLap.startTime;

        const timeDelta = anaRelativeTime - refRelativeTime;
        const speedDelta = anaP.speed - iSpeed;

        // Coasting Logic: TPS < 5% AND LonG > -0.2g
        const isCoasting = anaP.tps < 5 && anaP.lonG > -0.2;

        aligned.push({
            distance: d,
            refTime: iTime,
            anaTime: anaP.time,
            timeDelta,
            refSpeed: iSpeed,
            anaSpeed: anaP.speed,
            speedDelta,
            refTps: iTps,
            anaTps: anaP.tps,
            refBrake: iBrake,
            anaBrake: anaP.brake,
            refGear: iGear,
            anaGear: anaP.gear,
            refRpm: iRpm,
            anaRpm: anaP.rpm,
            refLatG: iLatG,
            anaLatG: anaP.latG,
            refLonG: iLonG,
            anaLonG: anaP.lonG,
            refGSum: 0, // Calibrated later
            anaGSum: 0, // Calibrated later
            refLean: 0, // Calibrated later
            anaLean: 0, // Calibrated later
            refGyroX: iGyroX,
            anaGyroX: anaP.gyroX,
            refGyroY: iGyroY,
            anaGyroY: anaP.gyroY,
            refGyroZ: iGyroZ,
            anaGyroZ: anaP.gyroZ,
            isCoasting,
            anaBrkOn: 0, // Calibrated later
            anaCrnOn: 0,
            anaTpsOn: 0,
            anaCstOn: 0,
            refBrkOn: 0,
            refCrnOn: 0,
            refTpsOn: 0,
            refCstOn: 0,
            lat: anaP.latitude,
            lon: anaP.longitude,
            refLat: iLat,
            refLon: iLon
        });
    } // End of main interpolation loop

    // Post-process calibration
    const latGs = aligned.map(p => p.anaLatG);
    const lonGs = aligned.map(p => p.anaLonG);
    const refLatGs = aligned.map(p => p.refLatG);
    const refLonGs = aligned.map(p => p.refLonG);

    // Helper statistics
    const getStats = (arr: number[]) => {
        const sum = arr.reduce((a, b) => a + b, 0);
        const mean = sum / arr.length;
        const max = Math.max(...arr.map(Math.abs));
        return { mean, max };
    };

    const anaLatStats = getStats(latGs);
    const anaLonStats = getStats(lonGs);
    const refLatStats = getStats(refLatGs);
    const refLonStats = getStats(refLonGs);

    // Heuristic: If max absolute value > 2.0, assume m/s^2 and divide by 9.81
    const GRAVITY = 9.80665;
    const isAnaLatMps2 = anaLatStats.max > 2.0;
    // const isAnaLonMps2 = anaLonStats.max > 2.0; // Wait, if offset is huge (e.g. +9.8g), assume G? No.
    // If unit is G, max should be < 2.0. If max > 2.0, likely m/s^2.
    // Exception: Crash (50g). But normal riding < 2.0g.
    const isAnaLonMps2 = anaLonStats.max > 2.0;
    const isRefLatMps2 = refLatStats.max > 2.0;
    const isRefLonMps2 = refLonStats.max > 2.0;

    const calibrate = (val: number, stats: { mean: number, max: number }, isMps2: boolean) => {
        let v = val;
        if (isMps2) v /= GRAVITY;
        const meanScaled = isMps2 ? stats.mean / GRAVITY : stats.mean;
        return v - meanScaled;
    };

    for (const p of aligned) {
        p.anaLatG = calibrate(p.anaLatG, anaLatStats, isAnaLatMps2);
        p.anaLonG = calibrate(p.anaLonG, anaLonStats, isAnaLonMps2);
        p.refLatG = calibrate(p.refLatG, refLatStats, isRefLatMps2);
        p.refLonG = calibrate(p.refLonG, refLonStats, isRefLonMps2);

        // Re-evaluate Coasting Logic with Calibrated Values!
        p.isCoasting = p.anaTps < 5 && p.anaLonG > -0.2;

        // Calculate G-Sum (Scalar Grip)
        p.refGSum = Math.sqrt(p.refLatG * p.refLatG + p.refLonG * p.refLonG);
        p.anaGSum = Math.sqrt(p.anaLatG * p.anaLatG + p.anaLonG * p.anaLonG);

        // Formula boolean channels (0/1, thresholds from config.py)
        p.anaBrkOn = p.anaLonG < -0.15 ? 1 : 0;
        p.anaCrnOn = Math.abs(p.anaLatG) > 0.2 ? 1 : 0;
        p.anaTpsOn = p.anaLonG > 0.05 ? 1 : 0;
        p.anaCstOn = (!p.anaBrkOn && !p.anaTpsOn && !p.anaCrnOn) ? 1 : 0;

        p.refBrkOn = p.refLonG < -0.15 ? 1 : 0;
        p.refCrnOn = Math.abs(p.refLatG) > 0.2 ? 1 : 0;
        p.refTpsOn = p.refLonG > 0.05 ? 1 : 0;
        p.refCstOn = (!p.refBrkOn && !p.refTpsOn && !p.refCrnOn) ? 1 : 0;
    }

    // Lean angle: gyro-based (with latG fallback)
    // lean = degrees(atan(speed_m/s × gyroZ_rad/s / GRAVITY))
    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;
    const hasGyro = aligned.some(p => p.anaGyroZ !== 0);

    for (let i = 0; i < aligned.length; i++) {
        const p = aligned[i];
        if (hasGyro) {
            const anaSpeedMps = p.anaSpeed / 3.6;
            const anaGyroRad = p.anaGyroZ * DEG2RAD;
            p.anaLean = Math.atan(anaSpeedMps * anaGyroRad / GRAVITY) * RAD2DEG;

            const refSpeedMps = p.refSpeed / 3.6;
            const refGyroRad = p.refGyroZ * DEG2RAD;
            p.refLean = Math.atan(refSpeedMps * refGyroRad / GRAVITY) * RAD2DEG;
        } else {
            // Fallback: latG-based (no left/right distinction possible with abs)
            p.anaLean = Math.atan(p.anaLatG) * RAD2DEG;
            p.refLean = Math.atan(p.refLatG) * RAD2DEG;
        }
    }

    return aligned;
};
