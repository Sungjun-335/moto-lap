-- Add profile/registration fields to Users table
ALTER TABLE Users ADD COLUMN username TEXT UNIQUE;
ALTER TABLE Users ADD COLUMN password_hash TEXT;
ALTER TABLE Users ADD COLUMN phone TEXT;
ALTER TABLE Users ADD COLUMN real_name TEXT;
ALTER TABLE Users ADD COLUMN team_name TEXT;
ALTER TABLE Users ADD COLUMN bike_name TEXT;
ALTER TABLE Users ADD COLUMN racing_experience TEXT;
ALTER TABLE Users ADD COLUMN primary_track TEXT;
ALTER TABLE Users ADD COLUMN registration_complete INTEGER NOT NULL DEFAULT 0;
