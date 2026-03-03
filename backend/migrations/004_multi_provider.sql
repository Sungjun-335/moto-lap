-- Add multi-provider OAuth support (Kakao, Naver)
ALTER TABLE Users ADD COLUMN provider TEXT NOT NULL DEFAULT 'google';
ALTER TABLE Users ADD COLUMN kakao_id TEXT UNIQUE;
ALTER TABLE Users ADD COLUMN naver_id TEXT UNIQUE;
