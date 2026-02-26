import type { LapData, DrivingFeatures, BrakingProfile, LeanProfile, ThrottleProfile, GDip, CoastingPenalty, BrakeJerk } from '../types';

// Thresholds matching lambda/logic/config.py
const BRK_ON_THRESHOLD_G = -0.15;
const CRN_ON_THRESHOLD_G = 0.2;
const TPS_ON_THRESHOLD_G = 0.05;
const GRAVITY = 9.80665;

export interface LapMetrics {
    lap_id: number;
    lap_time_s: number;
    brk_time_s: number;
    brk_pct: number;
    brk_dist_m: number;
    crn_time_s: number;
    crn_pct: number;
    crn_dist_m: number;
    tps_time_s: number;
    tps_pct: number;
    tps_dist_m: number;
    cst_time_s: number;
    cst_pct: number;
    cst_dist_m: number;
    max_g_sum: number;
    mean_g_sum: number;
}

/**
 * Auto-detect if G values are in m/s² (max > 2.0) and calibrate to G.
 * Returns calibrated lonG and latG arrays.
 */
function calibrateG(dataPoints: LapData[]): { lonGs: number[]; latGs: number[] } {
    let maxAbsLonG = 0;
    let maxAbsLatG = 0;
    let sumLonG = 0;
    let sumLatG = 0;

    for (const p of dataPoints) {
        const absLon = Math.abs(p.lonG);
        const absLat = Math.abs(p.latG);
        if (absLon > maxAbsLonG) maxAbsLonG = absLon;
        if (absLat > maxAbsLatG) maxAbsLatG = absLat;
        sumLonG += p.lonG;
        sumLatG += p.latG;
    }

    const n = dataPoints.length;
    const isLonMps2 = maxAbsLonG > 2.0;
    const isLatMps2 = maxAbsLatG > 2.0;
    const meanLonG = sumLonG / n;
    const meanLatG = sumLatG / n;

    const lonGs: number[] = new Array(n);
    const latGs: number[] = new Array(n);

    for (let i = 0; i < n; i++) {
        let lon = dataPoints[i].lonG;
        let lat = dataPoints[i].latG;
        if (isLonMps2) lon /= GRAVITY;
        if (isLatMps2) lat /= GRAVITY;
        lonGs[i] = lon - (isLonMps2 ? meanLonG / GRAVITY : meanLonG);
        latGs[i] = lat - (isLatMps2 ? meanLatG / GRAVITY : meanLatG);
    }

    return { lonGs, latGs };
}

export function computeLapMetrics(
    dataPoints: LapData[],
    lapId: number,
    sampleRate: number
): LapMetrics {
    const n = dataPoints.length;
    if (n === 0) {
        return {
            lap_id: lapId,
            lap_time_s: 0,
            brk_time_s: 0, brk_pct: 0, brk_dist_m: 0,
            crn_time_s: 0, crn_pct: 0, crn_dist_m: 0,
            tps_time_s: 0, tps_pct: 0, tps_dist_m: 0,
            cst_time_s: 0, cst_pct: 0, cst_dist_m: 0,
            max_g_sum: 0, mean_g_sum: 0,
        };
    }

    const { lonGs, latGs } = calibrateG(dataPoints);
    const dt = 1 / sampleRate; // seconds per sample

    const lapTimeS = dataPoints[n - 1].time - dataPoints[0].time;

    let brkCount = 0, crnCount = 0, tpsCount = 0, cstCount = 0;
    let brkDist = 0, crnDist = 0, tpsDist = 0, cstDist = 0;
    let gSumSum = 0;
    let maxGSum = 0;

    for (let i = 0; i < n; i++) {
        const lonG = lonGs[i];
        const latG = latGs[i];
        const gSum = Math.sqrt(lonG * lonG + latG * latG);

        gSumSum += gSum;
        if (gSum > maxGSum) maxGSum = gSum;

        const isBrk = lonG < BRK_ON_THRESHOLD_G;
        const isCrn = Math.abs(latG) > CRN_ON_THRESHOLD_G;
        const isTps = lonG > TPS_ON_THRESHOLD_G;
        const isCst = !isBrk && !isTps && !isCrn;

        // Distance delta for this sample (meters)
        let dDist = 0;
        if (i > 0) {
            dDist = (dataPoints[i].distance - dataPoints[i - 1].distance) * 1000; // km -> m
        }

        if (isBrk) { brkCount++; brkDist += dDist; }
        if (isCrn) { crnCount++; crnDist += dDist; }
        if (isTps) { tpsCount++; tpsDist += dDist; }
        if (isCst) { cstCount++; cstDist += dDist; }
    }

    const brkTimeS = brkCount * dt;
    const crnTimeS = crnCount * dt;
    const tpsTimeS = tpsCount * dt;
    const cstTimeS = cstCount * dt;
    const totalTime = lapTimeS || (n * dt);

    return {
        lap_id: lapId,
        lap_time_s: lapTimeS,
        brk_time_s: brkTimeS,
        brk_pct: totalTime > 0 ? (brkTimeS / totalTime) * 100 : 0,
        brk_dist_m: brkDist,
        crn_time_s: crnTimeS,
        crn_pct: totalTime > 0 ? (crnTimeS / totalTime) * 100 : 0,
        crn_dist_m: crnDist,
        tps_time_s: tpsTimeS,
        tps_pct: totalTime > 0 ? (tpsTimeS / totalTime) * 100 : 0,
        tps_dist_m: tpsDist,
        cst_time_s: cstTimeS,
        cst_pct: totalTime > 0 ? (cstTimeS / totalTime) * 100 : 0,
        cst_dist_m: cstDist,
        max_g_sum: maxGSum,
        mean_g_sum: n > 0 ? gSumSum / n : 0,
    };
}

/**
 * Compute driving features for a corner segment.
 * Mirrors lambda/logic/features.py braking_profile, lean_profile, rate_integrals.
 *
 * @param dataPoints - LapData[] slice for the corner (start_idx..end_idx)
 * @param sampleRate - samples per second
 * @param lapDataPoints - full lap dataPoints for calibration context
 */
export function computeCornerDriving(
    dataPoints: LapData[],
    sampleRate: number,
    lapDataPoints: LapData[],
    apexLocalIdx?: number
): DrivingFeatures {
    const n = dataPoints.length;
    if (n < 3) {
        return { braking_profile: null, lean_profile: null, rate_integrals: null, throttle_profile: null, g_dip: null, coasting_penalty: null, brake_jerk: null };
    }

    // Calibrate G using full lap context for consistent bias removal
    const { lonGs: lapLonGs, latGs: lapLatGs } = calibrateG(lapDataPoints);

    // Find offset of corner slice within lap data
    let sliceOffset = 0;
    for (let i = 0; i < lapDataPoints.length; i++) {
        if (lapDataPoints[i] === dataPoints[0]) {
            sliceOffset = i;
            break;
        }
    }

    // Extract calibrated values for the corner segment
    const lonGs = lapLonGs.slice(sliceOffset, sliceOffset + n);
    const latGs = lapLatGs.slice(sliceOffset, sliceOffset + n);

    const dt = 1 / sampleRate;
    const tStart = dataPoints[0].time;
    const dStart = dataPoints[0].distance;

    // Determine apex index: use provided or fallback to argmin(speed)
    let apexIdx = apexLocalIdx ?? 0;
    if (apexLocalIdx == null) {
        let minSpeed = dataPoints[0].speed;
        for (let i = 1; i < n; i++) {
            if (dataPoints[i].speed < minSpeed) {
                minSpeed = dataPoints[i].speed;
                apexIdx = i;
            }
        }
    }
    apexIdx = Math.max(0, Math.min(apexIdx, n - 1));

    const braking_profile = computeBrakingProfile(dataPoints, lonGs, dt, tStart, dStart);
    const lean_profile = computeLeanProfile(dataPoints, latGs, tStart, dStart);

    // Entry/exit splits for new features
    const entryPoints = dataPoints.slice(0, apexIdx + 1);
    const entryLonGs = lonGs.slice(0, apexIdx + 1);
    const entryLatGs = latGs.slice(0, apexIdx + 1);
    const exitPoints = dataPoints.slice(apexIdx);
    const exitLonGs = lonGs.slice(apexIdx);

    const tApex = dataPoints[apexIdx].time;
    const dApex = dataPoints[apexIdx].distance;

    const throttle_profile = computeThrottleProfile(exitPoints, exitLonGs, dt, tApex, dApex);
    const g_dip = computeGDip(entryPoints, entryLonGs, entryLatGs, tStart, dStart);
    const coasting_penalty = computeCoastingPenalty(dataPoints, lonGs, latGs, dt);
    const brake_jerk = computeBrakeJerkFn(dataPoints, lonGs, sampleRate, tStart);

    return {
        braking_profile,
        lean_profile,
        rate_integrals: null,
        throttle_profile,
        g_dip,
        coasting_penalty,
        brake_jerk,
    };
}

function computeBrakingProfile(
    points: LapData[],
    lonGs: number[],
    dt: number,
    tStart: number,
    dStart: number
): BrakingProfile | null {
    const n = points.length;

    // brk_on = lonG < BRK_ON_THRESHOLD_G
    const brkOn: boolean[] = new Array(n);
    const absAx: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        brkOn[i] = lonGs[i] < BRK_ON_THRESHOLD_G;
        absAx[i] = brkOn[i] ? Math.abs(lonGs[i]) : 0;
    }

    if (!brkOn.some(Boolean)) return null;

    // Cumulative sum of |accel_x| where braking
    const cumsum = new Float64Array(n);
    cumsum[0] = absAx[0];
    for (let i = 1; i < n; i++) {
        cumsum[i] = cumsum[i - 1] + absAx[i];
    }
    const total = cumsum[n - 1];
    if (total <= 0) return null;

    // Find 10/50/90% thresholds
    const findPctIdx = (pct: number): number | null => {
        const target = pct * total;
        for (let i = 0; i < n; i++) {
            if (cumsum[i] >= target) return i;
        }
        return null;
    };

    const sobIdx = findPctIdx(0.1);
    const cobIdx = findPctIdx(0.5);
    const eobIdx = findPctIdx(0.9);

    const offsetS = (idx: number | null) => idx !== null ? Math.round((points[idx].time - tStart) * 10000) / 10000 : null;
    const offsetM = (idx: number | null) => idx !== null ? Math.round((points[idx].distance - dStart) * 1000 * 100) / 100 : null;

    // Total braking G*s
    const totalBrkGs = Math.round(absAx.reduce((a, b) => a + b, 0) * dt * 10000) / 10000;

    // Min accel_x during braking
    let minAccelX: number | null = null;
    for (let i = 0; i < n; i++) {
        if (brkOn[i]) {
            if (minAccelX === null || lonGs[i] < minAccelX) {
                minAccelX = lonGs[i];
            }
        }
    }
    if (minAccelX !== null) minAccelX = Math.round(minAccelX * 10000) / 10000;

    return {
        sob_offset_s: offsetS(sobIdx), sob_offset_m: offsetM(sobIdx),
        cob_offset_s: offsetS(cobIdx), cob_offset_m: offsetM(cobIdx),
        eob_offset_s: offsetS(eobIdx), eob_offset_m: offsetM(eobIdx),
        total_brk_g_s: totalBrkGs,
        min_accel_x_g: minAccelX,
    };
}

function computeLeanProfile(
    points: LapData[],
    latGs: number[],
    tStart: number,
    dStart: number
): LeanProfile | null {
    const n = points.length;

    // lean_angle = degrees(atan(speed_m/s * latG / GRAVITY))
    // Simplified: since latG is already in G, lean_angle ~ atan(latG) in degrees
    // More accurate: lean_angle = atan(v * omega / g), but we use latG directly
    // latG (in G) = v^2 / (R * g), lean ~ atan(latG)
    const absLean: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        absLean[i] = Math.abs(Math.atan(latGs[i]) * (180 / Math.PI));
    }

    // Cumulative sum
    const cumsum = new Float64Array(n);
    cumsum[0] = absLean[0];
    for (let i = 1; i < n; i++) {
        cumsum[i] = cumsum[i - 1] + absLean[i];
    }
    const total = cumsum[n - 1];
    if (total <= 0) return null;

    const findPctIdx = (pct: number): number | null => {
        const target = pct * total;
        for (let i = 0; i < n; i++) {
            if (cumsum[i] >= target) return i;
        }
        return null;
    };

    const solIdx = findPctIdx(0.1);
    const colIdx = findPctIdx(0.5);
    const eolIdx = findPctIdx(0.9);

    const offsetS = (idx: number | null) => idx !== null ? Math.round((points[idx].time - tStart) * 10000) / 10000 : null;
    const offsetM = (idx: number | null) => idx !== null ? Math.round((points[idx].distance - dStart) * 1000 * 100) / 100 : null;

    const maxLeanDeg = Math.round(Math.max(...absLean) * 10) / 10;

    // Min velocity
    let minVelIdx = 0;
    let minVel = points[0].speed;
    for (let i = 1; i < n; i++) {
        if (points[i].speed < minVel) {
            minVel = points[i].speed;
            minVelIdx = i;
        }
    }

    return {
        sol_offset_s: offsetS(solIdx), sol_offset_m: offsetM(solIdx),
        col_offset_s: offsetS(colIdx), col_offset_m: offsetM(colIdx),
        eol_offset_s: offsetS(eolIdx), eol_offset_m: offsetM(eolIdx),
        max_lean_deg: maxLeanDeg,
        min_vel_kph: Math.round(minVel * 10) / 10,
        min_vel_offset_s: Math.round((points[minVelIdx].time - tStart) * 10000) / 10000,
        min_vel_offset_m: offsetM(minVelIdx),
    };
}

// ------------------------------------------------------------------
// Throttle roll-on profile: SOT / COT / EOT (exit phase)
// ------------------------------------------------------------------
function computeThrottleProfile(
    exitPoints: LapData[],
    lonGs: number[],
    dt: number,
    tApex: number,
    dApex: number
): ThrottleProfile | null {
    const n = exitPoints.length;
    if (n < 3) return null;

    // tps_on = lonG > TPS_ON_THRESHOLD_G
    const tpsAx: number[] = new Array(n);
    let anyTps = false;
    for (let i = 0; i < n; i++) {
        const isTps = lonGs[i] > TPS_ON_THRESHOLD_G;
        tpsAx[i] = isTps ? Math.max(lonGs[i], 0) : 0;
        if (isTps) anyTps = true;
    }
    if (!anyTps) return null;

    const cumsum = new Float64Array(n);
    cumsum[0] = tpsAx[0];
    for (let i = 1; i < n; i++) {
        cumsum[i] = cumsum[i - 1] + tpsAx[i];
    }
    const total = cumsum[n - 1];
    if (total <= 0) return null;

    const findPctIdx = (pct: number): number | null => {
        const target = pct * total;
        for (let i = 0; i < n; i++) {
            if (cumsum[i] >= target) return i;
        }
        return null;
    };

    const sotIdx = findPctIdx(0.1);
    const cotIdx = findPctIdx(0.5);
    const eotIdx = findPctIdx(0.9);

    const offsetS = (idx: number | null) => idx !== null ? Math.round((exitPoints[idx].time - tApex) * 10000) / 10000 : null;
    const offsetM = (idx: number | null) => idx !== null ? Math.round((exitPoints[idx].distance - dApex) * 1000 * 100) / 100 : null;

    const totalTpsGs = Math.round(tpsAx.reduce((a, b) => a + b, 0) * dt * 10000) / 10000;

    let maxAccelX: number | null = null;
    for (let i = 0; i < n; i++) {
        if (lonGs[i] > TPS_ON_THRESHOLD_G) {
            if (maxAccelX === null || lonGs[i] > maxAccelX) {
                maxAccelX = lonGs[i];
            }
        }
    }
    if (maxAccelX !== null) maxAccelX = Math.round(maxAccelX * 10000) / 10000;

    return {
        sot_offset_s: offsetS(sotIdx), sot_offset_m: offsetM(sotIdx),
        cot_offset_s: offsetS(cotIdx), cot_offset_m: offsetM(cotIdx),
        eot_offset_s: offsetS(eotIdx), eot_offset_m: offsetM(eotIdx),
        total_tps_g_s: totalTpsGs,
        max_accel_x_g: maxAccelX,
    };
}

// ------------------------------------------------------------------
// G-Dip analysis: friction circle transition efficiency (entry phase)
// ------------------------------------------------------------------
function computeGDip(
    entryPoints: LapData[],
    lonGs: number[],
    latGs: number[],
    tStart: number,
    dStart: number
): GDip | null {
    const n = entryPoints.length;
    if (n < 3) return null;

    // Compute g_sum for entry
    const gSums: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        gSums[i] = Math.sqrt(lonGs[i] * lonGs[i] + latGs[i] * latGs[i]);
    }

    let dipIdx = 0;
    let dipVal = gSums[0];
    let sumG = gSums[0];
    for (let i = 1; i < n; i++) {
        if (gSums[i] < dipVal) {
            dipVal = gSums[i];
            dipIdx = i;
        }
        sumG += gSums[i];
    }

    const entryMean = sumG / n;
    const ratio = entryMean > 0 ? Math.round((dipVal / entryMean) * 10000) / 10000 : null;

    return {
        g_dip_value: Math.round(dipVal * 10000) / 10000,
        g_dip_offset_s: Math.round((entryPoints[dipIdx].time - tStart) * 10000) / 10000,
        g_dip_offset_m: Math.round((entryPoints[dipIdx].distance - dStart) * 1000 * 100) / 100,
        entry_mean_g_sum: Math.round(entryMean * 10000) / 10000,
        g_dip_ratio: ratio,
    };
}

// ------------------------------------------------------------------
// Coasting penalty: speed loss during CST segments
// ------------------------------------------------------------------
function computeCoastingPenalty(
    points: LapData[],
    lonGs: number[],
    latGs: number[],
    dt: number
): CoastingPenalty {
    const n = points.length;

    // Determine cst_on: NOT brk AND NOT tps AND NOT crn
    const cstOn: boolean[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const isBrk = lonGs[i] < BRK_ON_THRESHOLD_G;
        const isTps = lonGs[i] > TPS_ON_THRESHOLD_G;
        const isCrn = Math.abs(latGs[i]) > CRN_ON_THRESHOLD_G;
        cstOn[i] = !isBrk && !isTps && !isCrn;
    }

    // Find contiguous CST segments
    let totalTime = 0;
    let totalSpeedLoss = 0;
    let segCount = 0;
    let inSeg = false;
    let segStart = 0;

    for (let i = 0; i <= n; i++) {
        const cur = i < n ? cstOn[i] : false;
        if (cur && !inSeg) {
            inSeg = true;
            segStart = i;
        } else if (!cur && inSeg) {
            inSeg = false;
            const segEnd = i;
            const segLen = segEnd - segStart;
            totalTime += segLen * dt;
            totalSpeedLoss += points[segStart].speed - points[Math.min(segEnd, n - 1)].speed;
            segCount++;
        }
    }

    return {
        cst_total_time_s: Math.round(totalTime * 10000) / 10000,
        cst_speed_loss_kph: Math.round(totalSpeedLoss * 100) / 100,
        cst_segments: segCount,
    };
}

// ------------------------------------------------------------------
// Brake jerk: initial braking aggressiveness
// ------------------------------------------------------------------
const BRAKE_JERK_INITIAL_WINDOW_S = 0.5;

function computeBrakeJerkFn(
    points: LapData[],
    lonGs: number[],
    sampleRate: number,
    tStart: number
): BrakeJerk | null {
    const n = points.length;
    if (n < 5) return null;

    // Compute jerk = gradient(accel_x) * sampleRate  (G/s)
    const jerk: number[] = new Array(n);
    // Central differences for interior, forward/backward for edges
    jerk[0] = (lonGs[1] - lonGs[0]) * sampleRate;
    for (let i = 1; i < n - 1; i++) {
        jerk[i] = (lonGs[i + 1] - lonGs[i - 1]) * 0.5 * sampleRate;
    }
    jerk[n - 1] = (lonGs[n - 1] - lonGs[n - 2]) * sampleRate;

    // Find max negative jerk
    let maxNegIdx = -1;
    let maxNegVal = 0;
    for (let i = 0; i < n; i++) {
        if (jerk[i] < maxNegVal) {
            maxNegVal = jerk[i];
            maxNegIdx = i;
        }
    }

    if (maxNegIdx < 0) return null;

    const maxBrakeJerk = Math.round(Math.abs(maxNegVal) * 10000) / 10000;
    const brakeJerkOffsetS = Math.round((points[maxNegIdx].time - tStart) * 10000) / 10000;

    // Mean jerk in initial window from first brk_on
    let meanBrakeJerk: number | null = null;
    let firstBrkIdx = -1;
    for (let i = 0; i < n; i++) {
        if (lonGs[i] < BRK_ON_THRESHOLD_G) {
            firstBrkIdx = i;
            break;
        }
    }

    if (firstBrkIdx >= 0) {
        const windowSamples = Math.round(BRAKE_JERK_INITIAL_WINDOW_S * sampleRate);
        const windowEnd = Math.min(firstBrkIdx + windowSamples, n);
        if (windowEnd > firstBrkIdx) {
            let sumNeg = 0;
            let countNeg = 0;
            for (let i = firstBrkIdx; i < windowEnd; i++) {
                if (jerk[i] < 0) {
                    sumNeg += Math.abs(jerk[i]);
                    countNeg++;
                }
            }
            if (countNeg > 0) {
                meanBrakeJerk = Math.round((sumNeg / countNeg) * 10000) / 10000;
            }
        }
    }

    return {
        max_brake_jerk_g_per_s: maxBrakeJerk,
        brake_jerk_offset_s: brakeJerkOffsetS,
        mean_brake_jerk_g_per_s: meanBrakeJerk,
    };
}
