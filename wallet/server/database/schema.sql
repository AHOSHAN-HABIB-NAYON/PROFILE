-- জমা ওয়ালেট — MySQL 5.7+ / MariaDB 10.3+ schema.
-- All money is stored as whole paisa (1 টাকা = 100 paisa) in BIGINT columns.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100)    NOT NULL,
    email           VARCHAR(190)    NOT NULL,
    password_hash   VARCHAR(255)    NULL,
    google_sub      VARCHAR(64)     NULL,
    avatar_url      VARCHAR(500)    NULL,
    webauthn_handle VARBINARY(32)   NOT NULL,
    balance_paisa   BIGINT          NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_google (google_sub),
    UNIQUE KEY uq_users_handle (webauthn_handle),
    CONSTRAINT chk_users_balance CHECK (balance_paisa >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id      BIGINT UNSIGNED NOT NULL,
    token_hash   CHAR(64)        NOT NULL,
    client       VARCHAR(16)     NOT NULL,
    user_agent   VARCHAR(255)    NULL,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_token (token_hash),
    KEY ix_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id              BIGINT UNSIGNED NOT NULL,
    type                 VARCHAR(16)     NOT NULL, -- deposit | withdraw | transfer_in | transfer_out
    amount_paisa         BIGINT          NOT NULL,
    balance_after_paisa  BIGINT          NOT NULL,
    counterparty_user_id BIGINT UNSIGNED NULL,
    method               VARCHAR(16)     NULL,
    note                 VARCHAR(120)    NULL,
    reference            VARCHAR(32)     NOT NULL,
    created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_tx_user (user_id, id),
    KEY ix_tx_reference (reference),
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_counterparty FOREIGN KEY (counterparty_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Remembers the response to a money request so a retried request is not applied twice.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id       BIGINT UNSIGNED NOT NULL,
    idem_key      VARCHAR(64)     NOT NULL,
    response_json TEXT            NOT NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, idem_key),
    CONSTRAINT fk_idem_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passkeys (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        BIGINT UNSIGNED NOT NULL,
    credential_id  VARCHAR(512)    NOT NULL, -- base64url
    public_key_pem TEXT            NOT NULL,
    sign_count     INT UNSIGNED    NOT NULL DEFAULT 0,
    name           VARCHAR(60)     NOT NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at   DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_passkeys_credential (credential_id(255)),
    KEY ix_passkeys_user (user_id),
    CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id         CHAR(32)        NOT NULL,
    user_id    BIGINT UNSIGNED NULL,
    purpose    VARCHAR(16)     NOT NULL, -- register | login
    challenge  VARCHAR(64)     NOT NULL, -- base64url
    expires_at DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY ix_challenges_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip         VARCHAR(45)     NOT NULL,
    email      VARCHAR(190)    NULL,
    created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_attempts_ip (ip, created_at),
    KEY ix_attempts_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
