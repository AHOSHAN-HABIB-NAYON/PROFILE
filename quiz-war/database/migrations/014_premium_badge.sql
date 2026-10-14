-- Premium badge: a special gold badge only an admin can give (never bought or earned).
ALTER TABLE user_profiles ADD COLUMN premium_at DATETIME NULL DEFAULT NULL;
