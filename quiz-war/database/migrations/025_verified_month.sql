-- Blue verified badge lasts one month when claimed or won (admin-given ones stay).
ALTER TABLE user_profiles ADD COLUMN verified_until DATETIME NULL;
UPDATE user_profiles SET verified_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY) WHERE verified_at IS NOT NULL AND verified_source IN ('purchase', 'auto');
