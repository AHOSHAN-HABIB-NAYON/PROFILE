-- Lost authenticator: a one-time code sent by email during the 2FA challenge.
ALTER TABLE user_security
  ADD COLUMN twofa_email_code_hash CHAR(64) NULL,
  ADD COLUMN twofa_email_expires_at DATETIME NULL,
  ADD COLUMN twofa_email_attempts INT UNSIGNED NOT NULL DEFAULT 0;
