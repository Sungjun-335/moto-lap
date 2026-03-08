-- Add report quota tracking to Users table
ALTER TABLE Users ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
-- plan: 'free' (3 reports), 'unlimited' (admin/paid)
