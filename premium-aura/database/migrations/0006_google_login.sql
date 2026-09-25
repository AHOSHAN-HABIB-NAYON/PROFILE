-- Sign in with Google: link a Google account (stable "sub" id) to a user.
ALTER TABLE users ADD COLUMN google_id VARCHAR(64) NULL AFTER password_hash;
ALTER TABLE users ADD UNIQUE KEY uq_users_google (google_id);
