import type { LapData, SessionData } from '../types';
import { segmentLaps } from './lapSegmentation';
import { filterOutlierLaps } from './filterOutlierLaps';

// XRK binary tag markers
const TAG_H_CHS = '<hCHS';   // Channel header
const TAG_H_GPS = '<hGPS';   // GPS data point
const TAG_H_LAP = '<hLAP';   // Lap marker
const TAG_GPS   = '<GPS';    // GPS closing/channel data
// metadata uses >value<TAG pattern (TAG_RCR marker = '>')

// WGS84 constants for ECEF → LLA conversion
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const GRAVITY = 9.80665;

interface GpsPoint {
    timestamp: number;
    lat: number;
    lon: number;
    vE: number;  // East velocity (m/s)
    vN: number;  // North velocity (m/s)
    speed: number; // kph
    distL: number; // Distance lap (m) from channel data
}

interface ChannelDef {
    index: number;
    shortName: string;
    longName: string;
}

interface LapEntry {
    lapNumber: number;
    durationMs: number; // in milliseconds (ticks)
    startTimestamp: number;
}

interface XrkMetadata {
    racer: string;
    vehicle: string;
    competition: string;
    venueType: string;
    track: string;
    date: string;
    time: string;
}

// Find all occurrences of a byte pattern in an ArrayBuffer (optimized with first-byte check)
function findAll(buf: Uint8Array, pattern: string): number[] {
    const enc = new TextEncoder();
    const pat = enc.encode(pattern);
    const results: number[] = [];
    const first = pat[0];
    const pLen = pat.length;
    for (let i = 0, end = buf.length - pLen; i <= end; i++) {
        if (buf[i] !== first) continue;
        let match = true;
        for (let j = 1; j < pLen; j++) {
            if (buf[i + j] !== pat[j]) { match = false; break; }
        }
        if (match) results.push(i);
    }
    return results;
}

// Read little-endian uint32
function readU32(buf: DataView, offset: number): number {
    return buf.getUint32(offset, true);
}

// Read little-endian int32
function readI32(buf: DataView, offset: number): number {
    return buf.getInt32(offset, true);
}

// Read little-endian uint16
function readU16(buf: DataView, offset: number): number {
    return buf.getUint16(offset, true);
}

// Read little-endian float32
function readF32(buf: DataView, offset: number): number {
    return buf.getFloat32(offset, true);
}

// Read null-terminated ASCII string from buffer
function readString(buf: Uint8Array, offset: number, maxLen: number): string {
    let str = '';
    for (let i = 0; i < maxLen; i++) {
        const b = buf[offset + i];
        if (b === 0) break;
        str += String.fromCharCode(b);
    }
    return str;
}

// Convert ECEF (cm) to latitude/longitude (degrees)
function ecefToLLA(xCm: number, yCm: number, zCm: number): { lat: number; lon: number } {
    const x = xCm / 100, y = yCm / 100, z = zCm / 100;
    const lon = Math.atan2(y, x);
    const p = Math.sqrt(x * x + y * y);
    let lat = Math.atan2(z, p * (1 - WGS84_E2));
    for (let i = 0; i < 10; i++) {
        const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) * Math.sin(lat));
        lat = Math.atan2(z + WGS84_E2 * N * Math.sin(lat), p);
    }
    return {
        lat: lat * 180 / Math.PI,
        lon: lon * 180 / Math.PI,
    };
}

// Convert ECEF velocity (cm/s) to ENU velocity (m/s) given a reference lat/lon
function ecefVelToENU(
    vxCm: number, vyCm: number, vzCm: number,
    latDeg: number, lonDeg: number
): { vE: number; vN: number; vU: number } {
    const lat = latDeg * Math.PI / 180;
    const lon = lonDeg * Math.PI / 180;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
    // Convert cm/s to m/s
    const vx = vxCm / 100, vy = vyCm / 100, vz = vzCm / 100;
    return {
        vE: -sinLon * vx + cosLon * vy,
        vN: -sinLat * cosLon * vx - sinLat * sinLon * vy + cosLat * vz,
        vU: cosLat * cosLon * vx + cosLat * sinLon * vy + sinLat * vz,
    };
}

// Parse channel definitions from <hCHS> blocks
function parseChannels(buf: Uint8Array, dv: DataView): ChannelDef[] {
    const channels: ChannelDef[] = [];
    const offsets = findAll(buf, TAG_H_CHS);

    for (const pos of offsets) {
        // <hCHS\x00 + uint32 size + version + > = 12 bytes header
        const dataSize = readU32(dv, pos + 6);
        if (dataSize < 56) continue;

        const blockStart = pos + 12;
        const chIdx = readU16(dv, blockStart);
        const shortName = readString(buf, blockStart + 24, 8);
        const longName = readString(buf, blockStart + 32, 24);

        channels.push({ index: chIdx, shortName, longName });
    }

    return channels;
}

// Parse GPS points from <hGPS> blocks
function parseGpsPoints(buf: Uint8Array, dv: DataView): GpsPoint[] {
    const points: GpsPoint[] = [];
    const offsets = findAll(buf, TAG_H_GPS);

    // Also find <GPS closing tags to read channel data ((S) records)
    const gpsCloseOffsets = findAll(buf, TAG_GPS);
    // Filter out <hGPS matches (preceded by 'h')
    const gpsDataOffsets = gpsCloseOffsets.filter(o => o === 0 || buf[o - 1] !== 0x68); // 0x68 = 'h'

    // Build a map: hGPS offset → next GPS close offset for channel data lookup
    let closeIdx = 0;

    for (let i = 0; i < offsets.length; i++) {
        const pos = offsets[i];
        const dataSize = readU32(dv, pos + 6);
        if (dataSize < 56) continue;

        const blockStart = pos + 12;
        const timestamp = readU32(dv, blockStart);
        const ecefX = readI32(dv, blockStart + 16);
        const ecefY = readI32(dv, blockStart + 20);
        const ecefZ = readI32(dv, blockStart + 24);
        // ECEF velocity components (cm/s) at offsets 32, 36, 40
        const velX = readI32(dv, blockStart + 32);
        const velY = readI32(dv, blockStart + 36);
        const velZ = readI32(dv, blockStart + 40);

        const { lat, lon } = ecefToLLA(ecefX, ecefY, ecefZ);
        const { vE, vN } = ecefVelToENU(velX, velY, velZ, lat, lon);
        const speed = Math.sqrt(vE * vE + vN * vN) * 3.6; // m/s → kph

        // Find channel data from (S records after <GPS closing tag
        let distL = 0;
        // Advance closeIdx to find the <GPS tag for this GPS point
        while (closeIdx < gpsDataOffsets.length && gpsDataOffsets[closeIdx] < pos) {
            closeIdx++;
        }
        // The <GPS close tag should be right after our data block
        if (closeIdx < gpsDataOffsets.length) {
            const closePos = gpsDataOffsets[closeIdx];
            // Parse (S records after the <GPS tag header (8 bytes)
            const searchStart = closePos + 8;
            const searchEnd = (i + 1 < offsets.length) ? offsets[i + 1] : Math.min(searchStart + 200, buf.length);

            for (let j = searchStart; j < searchEnd - 12; j++) {
                if (buf[j] === 0x28 && buf[j + 1] === 0x53) { // (S
                    const chId = readU16(dv, j + 6);
                    if (chId === 14) { // DistL channel
                        distL = readF32(dv, j + 8);
                        break;
                    }
                }
            }
        }

        points.push({ timestamp, lat, lon, vE, vN, speed, distL });
    }

    return points;
}

// Parse LAP entries from <hLAP> blocks
function parseLaps(buf: Uint8Array, dv: DataView): LapEntry[] {
    const laps: LapEntry[] = [];
    const offsets = findAll(buf, TAG_H_LAP);

    for (const pos of offsets) {
        const dataSize = readU32(dv, pos + 6);
        if (dataSize < 20) continue;

        const blockStart = pos + 12;
        // Fields: u32[0]=combined, u16 at +2 = lapNumber, u32 at +4 = durationTicks, u32 at +16 = startTimestamp
        const lapNumber = readU16(dv, blockStart + 2);
        const durationTicks = readU32(dv, blockStart + 4);
        const startTimestamp = readU32(dv, blockStart + 16);

        laps.push({ lapNumber, durationMs: durationTicks, startTimestamp });
    }

    return laps;
}

// Parse metadata from end of file (>value<TAG pattern)
function parseMetadata(buf: Uint8Array): XrkMetadata {
    const meta: XrkMetadata = {
        racer: 'Unknown', vehicle: 'Unknown', competition: '',
        venueType: '', track: 'Unknown', date: 'Unknown', time: 'Unknown',
    };

    // Search for metadata tags near end of file
    // Pattern: >value<TAG where TAG is RCR, VEH, CMP, VTY
    const decoder = new TextDecoder('ascii');

    // Find >...< patterns in last 1000 bytes
    const searchStart = Math.max(0, buf.length - 1000);
    const tail = decoder.decode(buf.slice(searchStart));

    const rcrMatch = tail.match(/>([^<]+)<RCR/);
    if (rcrMatch) meta.racer = rcrMatch[1].replace(/\0/g, '').trim();

    const vehMatch = tail.match(/>([^<]+)<VEH/);
    if (vehMatch) meta.vehicle = vehMatch[1].replace(/\0/g, '').trim();

    const cmpMatch = tail.match(/>([^<]+)<CMP/);
    if (cmpMatch) meta.competition = cmpMatch[1].replace(/\0/g, '').trim();

    const vtyMatch = tail.match(/>([^<]+)<VTY/);
    if (vtyMatch) meta.venueType = vtyMatch[1].replace(/\0/g, '').trim();

    // Track, date, time — search both start and end of file
    const searchAreas = [
        decoder.decode(buf.slice(0, Math.min(buf.length, 20000))),
        tail, // already decoded above (last 1000 bytes)
    ];
    // Also search a broader tail area for TRK
    if (buf.length > 5000) {
        searchAreas.push(decoder.decode(buf.slice(Math.max(0, buf.length - 5000))));
    }

    const invalidTrackNames = /^(GPS|Speed|RPM|TPS|Brake|Throttle|Gear|DistL|Time|idn)/i;

    for (const text of searchAreas) {
        if (meta.track === 'Unknown') {
            // Match >TrackName<TRK — only printable ASCII (0x20-0x7E)
            const trkMatch = text.match(/>([^\x00-\x1f<]{2,40}?)\s*<TRK/);
            if (trkMatch) {
                const cleaned = trkMatch[1].replace(/[\x00-\x1f]/g, '').trim();
                if (cleaned && !invalidTrackNames.test(cleaned)) {
                    meta.track = cleaned;
                }
            }
        }
        if (meta.date === 'Unknown') {
            const tmdMatch = text.match(/>(\d{2}\/\d{2}\/\d{4})/);
            if (tmdMatch) meta.date = tmdMatch[1];
        }
        if (meta.time === 'Unknown') {
            const tmtMatch = text.match(/>(\d{2}:\d{2}:\d{2})/);
            if (tmtMatch) meta.time = tmtMatch[1];
        }
    }

    return meta;
}

// Compute GPS-derived channels (acceleration, gyro) from GPS points
function computeDerivedChannels(points: GpsPoint[], sampleInterval: number): {
    latG: number[];   // lateral acceleration (G)
    lonG: number[];   // longitudinal acceleration (G)
    gyroZ: number[];  // yaw rate (deg/s)
} {
    const n = points.length;
    const latG = new Array(n).fill(0);
    const lonG = new Array(n).fill(0);
    const gyroZ = new Array(n).fill(0);

    if (n < 3) return { latG, lonG, gyroZ };

    // Compute heading array from velocity
    const headings = points.map(p => Math.atan2(p.vE, p.vN)); // radians

    const dt = sampleInterval;

    for (let i = 1; i < n - 1; i++) {
        const speedMs = points[i].speed / 3.6;

        // Heading rate (yaw rate)
        let dHeading = headings[i + 1] - headings[i - 1];
        // Normalize to [-PI, PI]
        while (dHeading > Math.PI) dHeading -= 2 * Math.PI;
        while (dHeading < -Math.PI) dHeading += 2 * Math.PI;
        const headingRate = dHeading / (2 * dt); // rad/s

        gyroZ[i] = headingRate * 180 / Math.PI; // deg/s

        // Lateral acceleration: v * dHeading/dt / g
        latG[i] = (speedMs * headingRate) / GRAVITY;

        // Longitudinal acceleration: dv/dt / g
        const dSpeed = (points[i + 1].speed - points[i - 1].speed) / 3.6; // m/s
        lonG[i] = (dSpeed / (2 * dt)) / GRAVITY;
    }

    // Copy edge values
    latG[0] = latG[1];
    lonG[0] = lonG[1];
    gyroZ[0] = gyroZ[1];
    latG[n - 1] = latG[n - 2];
    lonG[n - 1] = lonG[n - 2];
    gyroZ[n - 1] = gyroZ[n - 2];

    return { latG, lonG, gyroZ };
}

export const parseXrk = (file: File): Promise<SessionData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            try {
                const arrayBuf = reader.result as ArrayBuffer;
                const buf = new Uint8Array(arrayBuf);
                const dv = new DataView(arrayBuf);

                // 1. Parse channel definitions
                parseChannels(buf, dv);

                // 2. Parse GPS points (ECEF → lat/lon + velocity → speed)
                const gpsPoints = parseGpsPoints(buf, dv);

                if (gpsPoints.length < 10) {
                    reject(new Error('XRK file contains insufficient GPS data'));
                    return;
                }

                // 3. Parse LAP entries
                const lapEntries = parseLaps(buf, dv);

                // 4. Parse metadata
                const meta = parseMetadata(buf);

                // 5. Calculate timing parameters
                const firstTs = gpsPoints[0].timestamp;
                const lastTs = gpsPoints[gpsPoints.length - 1].timestamp;
                const avgTicksPerSample = (lastTs - firstTs) / (gpsPoints.length - 1);

                // Auto-detect ticksPerSec from hLAP data:
                // For complete laps: tickInterval (ticks) ≈ durationMs (ms)
                // So: ticksPerSec = tickInterval / (durationMs / 1000)
                // Use median of middle laps (skip first/last which may be out-lap/in-lap)
                let ticksPerSec = 1000; // default: millisecond resolution
                const sortedLaps = [...lapEntries].sort((a, b) => a.startTimestamp - b.startTimestamp);
                if (sortedLaps.length >= 3) {
                    const estimates: number[] = [];
                    // Skip first and last lap (out-lap/in-lap have mismatched durations)
                    for (let li = 1; li < sortedLaps.length - 1; li++) {
                        const tickInterval = sortedLaps[li + 1].startTimestamp - sortedLaps[li].startTimestamp;
                        const durMs = sortedLaps[li].durationMs;
                        if (durMs > 10000 && tickInterval > 0) { // duration > 10 seconds
                            estimates.push(tickInterval / (durMs / 1000));
                        }
                    }
                    if (estimates.length > 0) {
                        estimates.sort((a, b) => a - b);
                        const median = estimates[Math.floor(estimates.length / 2)];
                        // Round to nearest common tick rate (100, 200, 400, 500, 1000, 2000)
                        const commonRates = [100, 200, 400, 500, 1000, 2000];
                        ticksPerSec = commonRates.reduce((best, rate) =>
                            Math.abs(rate - median) < Math.abs(best - median) ? rate : best
                        );
                    }
                }

                const sampleInterval = avgTicksPerSample / ticksPerSec;

                // 6. Compute derived channels
                const { latG, lonG, gyroZ } = computeDerivedChannels(gpsPoints, sampleInterval);

                // 7. Build LapData array + detect lap boundaries from DistL resets
                let totalDistance = 0;
                let lastDistL = gpsPoints[0].distL;
                const distLResetTimes: number[] = []; // beacon markers from DistL channel

                const dataPoints: LapData[] = gpsPoints.map((gp, i) => {
                    const time = (gp.timestamp - firstTs) / ticksPerSec;

                    // Distance accumulation: DistL resets each lap
                    if (gp.distL < lastDistL - 100) {
                        // Lap rollover detected → this is a start/finish crossing
                        totalDistance += lastDistL;
                        distLResetTimes.push(time);
                    }
                    lastDistL = gp.distL;
                    const sessionDistance = totalDistance + gp.distL;

                    return {
                        time,
                        distance: sessionDistance / 1000, // meters → km
                        latitude: gp.lat,
                        longitude: gp.lon,
                        speed: gp.speed,
                        rpm: 0,
                        latG: latG[i],
                        lonG: lonG[i],
                        gyroX: 0,
                        gyroY: 0,
                        gyroZ: gyroZ[i],
                        tps: 0,
                        brake: 0,
                        gear: 0,
                    };
                });

                // 8. Compute beacon markers
                // Primary: use DistL resets (same GPS timebase, guaranteed correct)
                // Fallback: use hLAP startTimestamp if no DistL resets found
                let beaconMarkers: number[];

                if (distLResetTimes.length > 0) {
                    beaconMarkers = distLResetTimes;
                } else {
                    // Fallback to hLAP timestamps
                    const completeLaps = lapEntries
                        .filter(l => l.lapNumber > 0)
                        .sort((a, b) => a.startTimestamp - b.startTimestamp);
                    beaconMarkers = completeLaps
                        .map(l => (l.startTimestamp - firstTs) / ticksPerSec);
                }

                // 9. Segment into laps and filter outliers
                const rawLaps = segmentLaps(dataPoints, beaconMarkers);
                const laps = filterOutlierLaps(rawLaps);

                // Determine venue: prefer track name from metadata
                // Filter out garbage binary data and channel names
                const invalidVenue = /^(GPS|Speed|RPM|TPS|Unknown|idn)$/i;
                const hasControlChars = /[\x00-\x1f]/;
                const rawVenue = meta.track !== 'Unknown' ? meta.track : (meta.competition || 'Unknown');
                const venue = (invalidVenue.test(rawVenue) || hasControlChars.test(rawVenue)) ? 'Unknown' : rawVenue;

                resolve({
                    metadata: {
                        venue,
                        vehicle: meta.vehicle,
                        user: meta.racer,
                        date: meta.date,
                        time: meta.time,
                    },
                    laps,
                    dataPoints,
                    beaconMarkers,
                });

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read XRK file'));
        reader.readAsArrayBuffer(file);
    });
};
