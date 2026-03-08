import Papa from 'papaparse';
import type { LapData, SessionData } from '../types';
import { segmentLaps } from './lapSegmentation';
import { filterOutlierLaps } from './filterOutlierLaps';

export class MissingColumnError extends Error {
    missingColumns: string[];
    allHeaders: string[];

    constructor(missingColumns: string[], allHeaders: string[]) {
        super(`Missing required columns: ${missingColumns.join(', ')}`);
        this.name = "MissingColumnError";
        this.missingColumns = missingColumns;
        this.allHeaders = allHeaders;
    }
}

const COLUMN_ALIASES = {
    // Required
    time: ['Time', 'Log_Time', 'Time_s', 'Time (s)'],
    distance: ['Distance', 'Dist', 'Distance_km', 'Distance (km)'],
    lat: ['GPS_Latitude', 'Latitude', 'Lat', 'GPS_Lat', 'PosLat'],
    lon: ['GPS_Longitude', 'Longitude', 'Lon', 'GPS_Lon', 'PosLon'],
    speed: ['GPS_Speed', 'Speed', 'Velocity', 'Spd', 'GPS_Spd'],

    // Optional
    rpm: ['RPM', 'Engine_RPM', 'EngineSpeed', 'Rev'],
    latG: ['GPS LatAcc', 'GPS_LatAcc', 'LateralAcc', 'LatG', 'G_Lat', 'Lateral_G', 'G_Lateral'],
    lonG: ['GPS LonAcc', 'GPS_LonAcc', 'InlineAcc', 'LonG', 'LongG', 'G_Lon', 'Longitudinal_G', 'G_Longitudinal', 'BrakingG', 'AccG'],
    gyroX: ['PitchRate', 'GyroX', 'Gyro_X', 'Pitch_Rate', 'GPS_GyroX'],
    gyroY: ['RollRate', 'GyroY', 'Gyro_Y', 'Roll_Rate', 'GPS_GyroY'],
    gyroZ: ['GPS_Gyro', 'YawRate', 'GyroZ', 'Gyro_Z', 'Yaw_Rate'],
    tps: ['TPS', 'Throttle', 'ThrottlePos', 'Throttle_Pos', 'Throttle Position', 'PedalPos', 'Accel_Pedal_Pos'],
    brake: ['Engine Brake', 'Brake_Pos', 'Brake', 'BrakePos', 'Brake Position', 'F_Brake', 'BrakePressure', 'Brake_Press'],
    gear: ['Gear', 'GearPos', 'CurrentGear'],
};

export const parseAimCsv = (file: File, customMapping?: Record<string, string>): Promise<SessionData> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            complete: (results) => {
                try {
                    const rawData = results.data as string[][];

                    // 1. Extract Metadata
                    const metadata: any = {};
                    let headerRowIndex = -1;
                    let beaconMarkers: number[] = [];

                    for (let i = 0; i < 50; i++) { // Search first 50 lines
                        const row = rawData[i];
                        if (row && row.length >= 2) {
                            if (row[0] === 'Venue' || row[0] === 'Session') metadata.venue = row[1];
                            if (row[0] === 'Vehicle') metadata.vehicle = row[1];
                            if (row[0] === 'User' || row[0] === 'Racer') metadata.user = row[1];
                            if (row[0] === 'Date') metadata.date = row[1];
                            if (row[0] === 'Sample Rate') metadata.sampleRate = parseInt(row[1], 10);
                            if (row[0] === 'Time' && !row[1].startsWith('Distance')) {
                                metadata.time = row[1];
                            }
                            if (row[0] === 'Beacon Markers') {
                                // Papa.parse may split values into separate fields (row[1], row[2], ...)
                                // or keep them as a single comma-separated string in row[1].
                                if (row.length > 2) {
                                    // Already split by Papa.parse
                                    beaconMarkers = row.slice(1).map(s => parseFloat(s)).filter(n => !isNaN(n));
                                } else if (row[1]) {
                                    // Single comma-separated string
                                    beaconMarkers = row[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                                }
                            }

                            // Try to detect header row: must contain Time and (Distance or Speed or Lat)
                            // Relaxed check: just 'Time' might be too common, so check for one other key
                            const rowStr = row.join(' ').toLowerCase();
                            if (
                                (row.includes('Time') && (row.includes('Distance') || row.includes('GPS_Speed') || row.includes('Speed'))) ||
                                (rowStr.includes('time') && (rowStr.includes('dist') || rowStr.includes('lat') || rowStr.includes('spd')))
                            ) {
                                headerRowIndex = i;
                                break;
                            }
                        }
                    }

                    if (headerRowIndex === -1) {
                        reject(new Error("Could not find a valid header row. Expected 'Time' and 'Distance/Speed/Lat' in the same row."));
                        return;
                    }

                    const sampleRate = metadata.sampleRate || 20; // Default to 20 if missing for generic CSV
                    const timeStep = 1.0 / sampleRate;

                    // 2. Parse Data
                    const headerRow = rawData[headerRowIndex];

                    // Smart Column Detection
                    const findColumnIndex = (key: keyof typeof COLUMN_ALIASES): number => {
                        // 1. Try Custom Mapping first
                        if (customMapping && customMapping[key]) {
                            const exactIdx = headerRow.indexOf(customMapping[key]);
                            if (exactIdx !== -1) return exactIdx;
                        }

                        // 2. Try Aliases
                        const aliases = COLUMN_ALIASES[key] || [];
                        for (const alias of aliases) {
                            // Exact match first (case insensitive)
                            let idx = headerRow.findIndex(h => h && h.toLowerCase() === alias.toLowerCase());
                            if (idx !== -1) return idx;

                            // Partial match logic (be careful with short words like 'lat')
                            idx = headerRow.findIndex(h => h && h.toLowerCase().includes(alias.toLowerCase()));
                            if (idx !== -1) return idx;
                        }

                        return -1;
                    };

                    const colMap = {
                        time: findColumnIndex('time'),
                        distance: findColumnIndex('distance'),
                        lat: findColumnIndex('lat'),
                        lon: findColumnIndex('lon'),
                        speed: findColumnIndex('speed'),
                        // Optional
                        rpm: findColumnIndex('rpm'),
                        latG: findColumnIndex('latG'),
                        lonG: findColumnIndex('lonG'),
                        gyroX: findColumnIndex('gyroX'),
                        gyroY: findColumnIndex('gyroY'),
                        gyroZ: findColumnIndex('gyroZ'),
                        tps: findColumnIndex('tps'),
                        brake: findColumnIndex('brake'),
                        gear: findColumnIndex('gear'),
                    };

                    // Check for required columns
                    const missing: string[] = [];
                    if (colMap.time === -1) missing.push('time');
                    // if (colMap.distance === -1) missing.push('distance'); // Distance can be calculated if speed exists, but let's require it for now to simplify
                    if (colMap.lat === -1) missing.push('lat');
                    if (colMap.lon === -1) missing.push('lon');
                    if (colMap.speed === -1) missing.push('speed');

                    if (missing.length > 0) {
                        throw new MissingColumnError(missing, headerRow);
                    }

                    const dataPoints: LapData[] = [];
                    let dataRowStartIndex = headerRowIndex + 1;

                    // Verify data starts
                    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                        const row = rawData[i];
                        if (!row || row.length <= colMap.time || row.length <= colMap.speed) continue;
                        const t = parseFloat(row[colMap.time]);
                        if (!isNaN(t)) {
                            dataRowStartIndex = i;
                            break;
                        }
                    }

                    let distanceOffset = 0;
                    let lastCsvDistance = 0;
                    const needDistanceIntegration = colMap.distance === -1;
                    let integratedDistanceKm = 0;

                    for (let i = dataRowStartIndex; i < rawData.length; i++) {
                        const row = rawData[i];
                        if (!row) continue;

                        const csvTime = parseFloat(row[colMap.time] || '0');
                        if (isNaN(csvTime)) continue;

                        const index = i - dataRowStartIndex;
                        const calculatedTime = index * timeStep;

                        const lat = parseFloat(row[colMap.lat] || '0');
                        const lon = parseFloat(row[colMap.lon] || '0');
                        const speedKph = parseFloat(row[colMap.speed] || '0');

                        let sessionDistance: number;

                        if (needDistanceIntegration) {
                            // No Distance column — integrate from speed (km/h → km)
                            if (index > 0) {
                                integratedDistanceKm += (speedKph / 3600) * timeStep;
                            }
                            sessionDistance = integratedDistanceKm;
                        } else {
                            let csvDistance = parseFloat(row[colMap.distance]);
                            if (isNaN(csvDistance)) csvDistance = 0;

                            // Robust Distance Accumulation (handle rollovers if any)
                            if (lastCsvDistance > 0.5 && csvDistance < 0.1) {
                                distanceOffset += lastCsvDistance;
                            }
                            lastCsvDistance = csvDistance;
                            sessionDistance = distanceOffset + csvDistance;
                        }

                        dataPoints.push({
                            time: calculatedTime,
                            distance: sessionDistance,
                            latitude: lat,
                            longitude: lon,
                            speed: parseFloat(row[colMap.speed] || '0'),
                            rpm: colMap.rpm !== -1 ? parseFloat(row[colMap.rpm] || '0') : 0,
                            latG: colMap.latG !== -1 ? parseFloat(row[colMap.latG] || '0') : 0,
                            lonG: colMap.lonG !== -1 ? parseFloat(row[colMap.lonG] || '0') : 0,
                            gyroX: colMap.gyroX !== -1 ? parseFloat(row[colMap.gyroX] || '0') : 0,
                            gyroY: colMap.gyroY !== -1 ? parseFloat(row[colMap.gyroY] || '0') : 0,
                            gyroZ: colMap.gyroZ !== -1 ? parseFloat(row[colMap.gyroZ] || '0') : 0,
                            tps: colMap.tps !== -1 ? parseFloat(row[colMap.tps] || '0') : 0,
                            brake: colMap.brake !== -1 ? parseFloat(row[colMap.brake] || '0') : 0,
                            gear: colMap.gear !== -1 ? parseFloat(row[colMap.gear] || '0') : 0,
                            originalTime: row[colMap.time]
                        });
                    }

                    // 3. Slice Laps & filter outliers (>20% from median)
                    const rawLaps = segmentLaps(dataPoints, beaconMarkers);
                    const laps = filterOutlierLaps(rawLaps);

                    resolve({
                        metadata: {
                            venue: metadata.venue || 'Unknown',
                            vehicle: metadata.vehicle || 'Unknown',
                            user: metadata.user || 'Unknown',
                            date: metadata.date || 'Unknown',
                            time: metadata.time || 'Unknown'
                        },
                        laps,
                        dataPoints,
                        beaconMarkers,
                    });

                } catch (err) {
                    reject(err);
                }
            },
            error: (err) => {
                reject(err);
            }
        });
    });
};
