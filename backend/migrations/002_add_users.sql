CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    picture_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE Sessions ADD COLUMN user_id INTEGER REFERENCES Users(id);
