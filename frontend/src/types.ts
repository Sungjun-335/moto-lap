export interface LapData {
    time: number;
    distance: number;
    latitude: number;
    longitude: number;
    speed: number;
    rpm: number;
    latG: number;
    lonG: number;
    gyroX: number;
    gyroY: number;
    gyroZ: number;
    tps: number;
    brake: number;
    gear: number;
    originalTime?: string; // Keep string just in case
}

export interface CornerGeometry {
    travel_distance_m: number;
    apex_lat: number;
    apex_lon: number;
    cp_offset_track_m: number | null;
}

export interface Corner {
    id: number;
    lap_id: number;
    start_time: number;
    end_time: number;
    apex_time: number;
    duration: number;
    direction?: string;
    confidence?: number;
    metrics: {
        entry_speed?: number;
        min_speed?: number;
        exit_speed?: number;
        apex_speed?: number;
        max_val?: number;
        max_lat_g?: number;
    };
    driving?: DrivingFeatures;
    trackCornerId?: number;
    name?: string;
    start_idx?: number; // Optional helper
    end_idx?: number;
    apex_idx?: number;
    geometry?: CornerGeometry;
}

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

export interface Lap {
    index: number;
    startTime: number;
    endTime: number;
    duration: number;
    dataPoints: LapData[];
    corners?: Corner[]; // Optional as it comes from async analysis
    metrics?: LapMetrics;
}

export interface SessionData {
    id?: string;                    // UUID assigned on save
    beaconMarkers?: number[];       // For reconstruction on load
    metadata: {
        venue: string;
        vehicle: string;
        user: string;
        date: string;
        time: string;
        trackId?: string;
        bikeModel?: string;
        condition?: 'dry' | 'wet';
        tuning?: 'stock' | 'tuned';
        sessionType?: 'practice' | 'race' | 'warmup' | 'trackday';
        eventName?: string;
        fileName?: string;
        riderName?: string;
    };
    laps: Lap[];
    dataPoints: LapData[]; // Keep full session data available
}

export interface StoredSession {
    id: string;
    metadata: SessionData['metadata'];
    beaconMarkers: number[];
    dataPoints: LapData[];
    savedAt: number;
    bestLapTime?: number;
    userId?: string;
}

export interface SessionSummary {
    id: string;
    metadata: SessionData['metadata'];
    savedAt: number;
    lapCount: number;
    bestLapTime: number | null;
    userId?: string;
}

// ===== Driving Feature Types =====

export interface BrakingProfile {
    sob_offset_s: number | null;  sob_offset_m: number | null;
    cob_offset_s: number | null;  cob_offset_m: number | null;
    eob_offset_s: number | null;  eob_offset_m: number | null;
    total_brk_g_s: number;
    min_accel_x_g: number | null;
}

export interface LeanProfile {
    sol_offset_s: number | null;  sol_offset_m: number | null;
    col_offset_s: number | null;  col_offset_m: number | null;
    eol_offset_s: number | null;  eol_offset_m: number | null;
    max_lean_deg: number;
    min_vel_kph: number;
    min_vel_offset_s: number;     min_vel_offset_m: number | null;
}

export interface RateIntegrals {
    pitch_rate_integral: number | null;
    roll_rate_integral: number | null;
    yaw_rate_integral: number | null;
}

export interface ThrottleProfile {
    sot_offset_s: number | null;  sot_offset_m: number | null;
    cot_offset_s: number | null;  cot_offset_m: number | null;
    eot_offset_s: number | null;  eot_offset_m: number | null;
    total_tps_g_s: number;
    max_accel_x_g: number | null;
}

export interface GDip {
    g_dip_value: number;
    g_dip_offset_s: number;
    g_dip_offset_m: number | null;
    entry_mean_g_sum: number;
    g_dip_ratio: number | null;
}

export interface CoastingPenalty {
    cst_total_time_s: number;
    cst_speed_loss_kph: number;
    cst_segments: number;
}

export interface BrakeJerk {
    max_brake_jerk_g_per_s: number;
    brake_jerk_offset_s: number;
    mean_brake_jerk_g_per_s: number | null;
}

export interface DrivingFeatures {
    braking_profile: BrakingProfile | null;
    lean_profile: LeanProfile | null;
    rate_integrals: RateIntegrals | null;
    throttle_profile: ThrottleProfile | null;
    g_dip: GDip | null;
    coasting_penalty: CoastingPenalty | null;
    brake_jerk: BrakeJerk | null;
}

// ===== Track DB Types =====

export interface TrackPoint {
    lat: number;
    lon: number;
    dist: number;
}

export interface TrackCorner {
    id: number;
    name: string;
    direction: 'L' | 'R';
    type: 'hairpin' | 'sweeper' | 'chicane' | 'kink';
    entry: TrackPoint;
    apex: TrackPoint;
    exit: TrackPoint;
    radius_min?: number;
    radius_apex?: number;
    notes?: string;
}

export interface Track {
    id: string;
    name: string;
    shortName: string;
    country: string;
    location: { lat: number; lon: number };
    totalLength: number;
    direction: 'CW' | 'CCW';
    centerline: TrackPoint[];
    corners: TrackCorner[];
    boundaries?: {
        left: TrackPoint[];
        right: TrackPoint[];
    };
}
