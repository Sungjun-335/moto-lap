-- Migration: Add Tracks table for storing track/circuit definitions
CREATE TABLE IF NOT EXISTS Tracks (
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
