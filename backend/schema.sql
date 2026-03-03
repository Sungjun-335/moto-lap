DROP TABLE IF EXISTS LapMetrics;
DROP TABLE IF EXISTS Corners;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Tracks;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    picture_url TEXT,
    provider TEXT NOT NULL DEFAULT 'google',
    kakao_id TEXT UNIQUE,
    naver_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE Tracks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    country TEXT NOT NULL,
    location_lat REAL NOT NULL,
    location_lon REAL NOT NULL,
    total_length REAL NOT NULL,
    direction TEXT NOT NULL,
    centerline_json TEXT NOT NULL,
    corners_json TEXT NOT NULL,
    boundaries_json TEXT,
    editor_data_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by INTEGER REFERENCES Users(id)
);

CREATE TABLE Sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT,
    venue TEXT,
    vehicle TEXT,
    user_id INTEGER REFERENCES Users(id)
);

CREATE TABLE Corners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    corner_index INTEGER,
    lap_id INTEGER,
    start_time REAL,
    end_time REAL,
    duration_s REAL,
    direction TEXT,
    venue TEXT,
    min_speed REAL,
    entry_speed REAL,
    exit_speed REAL,
    apex_speed REAL,
    driving_json TEXT,
    FOREIGN KEY (session_id) REFERENCES Sessions(id)
);

CREATE TABLE LapMetrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    lap_id INTEGER,
    lap_time_s REAL,
    brk_time_s REAL,
    brk_pct REAL,
    brk_dist_m REAL,
    crn_time_s REAL,
    crn_pct REAL,
    crn_dist_m REAL,
    tps_time_s REAL,
    tps_pct REAL,
    tps_dist_m REAL,
    cst_time_s REAL,
    cst_pct REAL,
    cst_dist_m REAL,
    max_lean_deg REAL,
    mean_g_sum REAL,
    max_g_sum REAL,
    FOREIGN KEY (session_id) REFERENCES Sessions(id)
);
