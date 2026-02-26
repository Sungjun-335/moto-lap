DROP TABLE IF EXISTS LapMetrics;
DROP TABLE IF EXISTS Corners;
DROP TABLE IF EXISTS Sessions;

CREATE TABLE Sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT,
    venue TEXT,
    vehicle TEXT,
    user_id TEXT
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
