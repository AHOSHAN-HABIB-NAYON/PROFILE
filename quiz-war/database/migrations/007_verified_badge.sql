-- Verified badge for top players (earned automatically or claimed with coins when eligible).
ALTER TABLE user_profiles ADD COLUMN verified_at DATETIME NULL, ADD COLUMN verified_source VARCHAR(12) NULL;
