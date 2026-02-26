-- Add structured fields to Corners for ML training data queries
-- These fields are already present in Lambda response but were only stored in driving_json

ALTER TABLE Corners ADD COLUMN lap_id INTEGER;
ALTER TABLE Corners ADD COLUMN duration_s REAL;
ALTER TABLE Corners ADD COLUMN direction TEXT;
ALTER TABLE Corners ADD COLUMN venue TEXT;
ALTER TABLE Corners ADD COLUMN apex_speed REAL;
