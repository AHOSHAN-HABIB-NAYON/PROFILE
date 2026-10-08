-- QUIZ WAR: Bangladesh — core schema (MySQL 8.0+ / MariaDB 10.6+)
-- All tables use InnoDB + utf8mb4 so Bangla text, emoji and FKs work everywhere.

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(9) NOT NULL,
  email VARCHAR(190) NULL,
  email_verified_at DATETIME NULL,
  password_hash VARCHAR(255) NULL,
  google_sub VARCHAR(64) NULL,
  status ENUM('active','suspended','banned','deleted') NOT NULL DEFAULT 'active',
  suspended_until DATETIME NULL,
  moderation_reason VARCHAR(500) NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uid (uid),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_sub),
  KEY ix_users_status (status),
  KEY ix_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(20) NULL,
  bio VARCHAR(160) NULL,
  avatar_url VARCHAR(500) NULL,
  avatar_thumb_url VARCHAR(500) NULL,
  frame VARCHAR(40) NULL,
  title VARCHAR(40) NULL,
  badge VARCHAR(40) NULL,
  theme ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
  level INT UNSIGNED NOT NULL DEFAULT 1,
  coins BIGINT NOT NULL DEFAULT 0,
  rating INT NOT NULL DEFAULT 1000,
  peak_rating INT NOT NULL DEFAULT 1000,
  league VARCHAR(20) NOT NULL DEFAULT 'bronze',
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  draws INT UNSIGNED NOT NULL DEFAULT 0,
  total_games INT UNSIGNED NOT NULL DEFAULT 0,
  total_correct INT UNSIGNED NOT NULL DEFAULT 0,
  total_answered INT UNSIGNED NOT NULL DEFAULT 0,
  fast_answers INT UNSIGNED NOT NULL DEFAULT 0,
  best_score INT UNSIGNED NOT NULL DEFAULT 0,
  best_survival INT UNSIGNED NOT NULL DEFAULT 0,
  best_speed INT UNSIGNED NOT NULL DEFAULT 0,
  current_win_streak INT UNSIGNED NOT NULL DEFAULT 0,
  best_win_streak INT UNSIGNED NOT NULL DEFAULT 0,
  streak_days INT UNSIGNED NOT NULL DEFAULT 0,
  best_streak_days INT UNSIGNED NOT NULL DEFAULT 0,
  last_active_date DATE NULL,
  daily_reward_day INT UNSIGNED NOT NULL DEFAULT 0,
  last_daily_reward_date DATE NULL,
  daily_challenges_done INT UNSIGNED NOT NULL DEFAULT 0,
  available_for_battle TINYINT(1) NOT NULL DEFAULT 1,
  dnd TINYINT(1) NOT NULL DEFAULT 0,
  tutorial_done TINYINT(1) NOT NULL DEFAULT 0,
  onboarded_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_profiles_username (username),
  KEY ix_profiles_rating (rating),
  KEY ix_profiles_xp (xp),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  refresh_hash CHAR(64) NOT NULL,
  previous_hash CHAR(64) NULL,
  platform ENUM('web','android','ios','other') NOT NULL DEFAULT 'web',
  device_name VARCHAR(120) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  revoke_reason VARCHAR(40) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_refresh (refresh_hash),
  KEY ix_sessions_prev (previous_hash),
  KEY ix_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  method ENUM('password','google','passkey','refresh') NOT NULL,
  success TINYINT(1) NOT NULL,
  reason VARCHAR(60) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_login_user (user_id, created_at),
  KEY ix_login_ip (ip, created_at),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('verify','reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_tokens_hash (token_hash),
  KEY ix_email_tokens_user (user_id, type),
  CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE passkeys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  credential_id VARCHAR(512) NOT NULL,
  public_key VARBINARY(2048) NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports VARCHAR(120) NULL,
  device_type VARCHAR(20) NULL,
  backed_up TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_passkeys_cred (credential_id(255)),
  KEY ix_passkeys_user (user_id),
  CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webauthn_challenges (
  id CHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  purpose ENUM('register','login') NOT NULL,
  challenge VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_webauthn_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE device_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('android','web') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  token TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_token (token_hash),
  KEY ix_device_user (user_id),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(80) NOT NULL,
  name_bn VARCHAR(80) NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '🧠',
  description VARCHAR(300) NULL,
  color CHAR(7) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY ix_categories_order (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  perm_key VARCHAR(60) NOT NULL,
  description VARCHAR(200) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_perm_key (perm_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_arp_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_arp_perm FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_email (email),
  CONSTRAINT fk_admin_users_role FOREIGN KEY (role_id) REFERENCES admin_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NOT NULL,
  refresh_hash CHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_sessions_refresh (refresh_hash),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id VARCHAR(64) NULL,
  summary VARCHAR(300) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_admin_logs_admin (admin_id, created_at),
  KEY ix_admin_logs_target (target_type, target_id),
  KEY ix_admin_logs_created (created_at),
  CONSTRAINT fk_admin_logs_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  difficulty ENUM('easy','medium','hard','expert') NOT NULL DEFAULT 'medium',
  language ENUM('bn','en') NOT NULL DEFAULT 'bn',
  text TEXT NOT NULL,
  explanation TEXT NULL,
  hint VARCHAR(300) NULL,
  image_url VARCHAR(500) NULL,
  tags VARCHAR(400) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_admin_id INT UNSIGNED NULL,
  updated_by_admin_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_questions_pick (category_id, is_active, deleted_at, difficulty),
  KEY ix_questions_active (is_active, deleted_at, difficulty),
  CONSTRAINT fk_questions_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_questions_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  option_index TINYINT UNSIGNED NOT NULL,
  text VARCHAR(300) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_option (question_id, option_index),
  CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_stats (
  question_id BIGINT UNSIGNED NOT NULL,
  times_shown INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  wrong_count INT UNSIGNED NOT NULL DEFAULT 0,
  timeout_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_response_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id),
  CONSTRAINT fk_qstats_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seasons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('upcoming','active','ended') NOT NULL DEFAULT 'upcoming',
  rewards_json JSON NULL,
  soft_reset_factor DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_seasons_status (status, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE season_ratings (
  season_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  rating INT NOT NULL,
  peak_rating INT NOT NULL,
  league VARCHAR(20) NOT NULL,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  draws INT UNSIGNED NOT NULL DEFAULT 0,
  final_rank INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (season_id, user_id),
  KEY ix_season_ratings_rank (season_id, rating),
  CONSTRAINT fk_sr_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE matches (
  id CHAR(26) NOT NULL,
  mode VARCHAR(16) NOT NULL,
  match_type ENUM('pvp','ai','solo','daily') NOT NULL,
  ranked TINYINT(1) NOT NULL DEFAULT 0,
  category_id INT UNSIGNED NULL,
  season_id INT UNSIGNED NULL,
  status ENUM('lobby','active','finished','aborted') NOT NULL DEFAULT 'lobby',
  question_count INT UNSIGNED NULL,
  question_time_sec INT UNSIGNED NOT NULL,
  winner_team TINYINT NULL,
  end_reason VARCHAR(20) NULL,
  settings_json JSON NULL,
  flagged TINYINT(1) NOT NULL DEFAULT 0,
  flag_reason VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_matches_status (status, created_at),
  KEY ix_matches_type (match_type, created_at),
  KEY ix_matches_flagged (flagged, created_at),
  CONSTRAINT fk_matches_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_matches_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  bot_level ENUM('easy','normal','hard','expert') NULL,
  bot_name VARCHAR(40) NULL,
  team TINYINT UNSIGNED NOT NULL,
  score INT NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  answered_count INT UNSIGNED NOT NULL DEFAULT 0,
  best_combo INT UNSIGNED NOT NULL DEFAULT 0,
  avg_response_ms INT UNSIGNED NULL,
  result ENUM('win','loss','draw','abandoned','completed') NULL,
  xp_gained INT UNSIGNED NOT NULL DEFAULT 0,
  coins_gained INT UNSIGNED NOT NULL DEFAULT 0,
  rating_before INT NULL,
  rating_after INT NULL,
  disconnects INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_players (match_id, user_id),
  KEY ix_match_players_user (user_id, match_id),
  CONSTRAINT fk_mp_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_questions (
  match_id CHAR(26) NOT NULL,
  question_index SMALLINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  option_order VARCHAR(20) NOT NULL DEFAULT '0,1,2,3',
  PRIMARY KEY (match_id, question_index),
  KEY ix_mq_question (question_id),
  CONSTRAINT fk_mq_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_mq_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id CHAR(26) NOT NULL,
  match_player_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  question_index SMALLINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  option_index TINYINT UNSIGNED NULL,
  is_correct TINYINT(1) NOT NULL,
  response_ms INT UNSIGNED NULL,
  points INT NOT NULL DEFAULT 0,
  combo INT UNSIGNED NOT NULL DEFAULT 0,
  power_up VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_answer (match_id, match_player_id, question_index),
  KEY ix_answers_user_wrong (user_id, is_correct, created_at),
  CONSTRAINT fk_ma_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_ma_player FOREIGN KEY (match_player_id) REFERENCES match_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_ma_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id CHAR(26) NOT NULL,
  type VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  data JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_match_events_match (match_id, id),
  CONSTRAINT fk_me_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ratings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  season_id INT UNSIGNED NULL,
  match_id CHAR(26) NULL,
  rating_before INT NOT NULL,
  rating_after INT NOT NULL,
  delta INT NOT NULL,
  note VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ratings_user (user_id, created_at),
  CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE friend_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_fr_to (to_user_id, status),
  KEY ix_fr_from (from_user_id, status),
  CONSTRAINT fk_fr_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE friends (
  user_id BIGINT UNSIGNED NOT NULL,
  friend_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  KEY ix_friends_friend (friend_id),
  CONSTRAINT fk_friends_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friends_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blocks (
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  KEY ix_blocks_blocked (blocked_id),
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE battle_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'duel',
  category_id INT UNSIGNED NULL,
  question_count INT UNSIGNED NOT NULL,
  question_time_sec INT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','declined','expired','cancelled') NOT NULL DEFAULT 'pending',
  match_id CHAR(26) NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_br_to (to_user_id, status, expires_at),
  KEY ix_br_from (from_user_id, status, created_at),
  CONSTRAINT fk_br_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE squads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  tag VARCHAR(6) NOT NULL,
  logo_url VARCHAR(500) NULL,
  description VARCHAR(300) NULL,
  captain_id BIGINT UNSIGNED NULL,
  xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rank_points INT NOT NULL DEFAULT 0,
  member_limit INT UNSIGNED NOT NULL DEFAULT 30,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_squads_name (name),
  UNIQUE KEY uq_squads_tag (tag),
  KEY ix_squads_xp (xp),
  CONSTRAINT fk_squads_captain FOREIGN KEY (captain_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE squad_members (
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('captain','officer','member') NOT NULL DEFAULT 'member',
  contributed_xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (squad_id, user_id),
  UNIQUE KEY uq_squad_members_user (user_id),
  CONSTRAINT fk_sm_squad FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE squad_invites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  invited_by BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_si_user (user_id, status),
  CONSTRAINT fk_si_squad FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Period leaderboards (weekly / monthly / daily challenge / category). Global and season
-- boards read straight from user_profiles / season_ratings.
CREATE TABLE leaderboards (
  board VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  score BIGINT NOT NULL DEFAULT 0,
  games INT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (board, user_id),
  KEY ix_leaderboards_rank (board, score),
  CONSTRAINT fk_lb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE achievements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ach_key VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '🏅',
  metric VARCHAR(40) NOT NULL,
  threshold INT UNSIGNED NOT NULL,
  reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
  reward_xp INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_achievements_key (ach_key),
  KEY ix_achievements_metric (metric, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_achievements (
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_id INT UNSIGNED NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ua_ach FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reward definitions that are not part of game settings (season rewards, event rewards, …)
CREATE TABLE rewards (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reward_key VARCHAR(60) NOT NULL,
  name VARCHAR(80) NOT NULL,
  type ENUM('coins','xp','item','power_up','mystery') NOT NULL,
  amount INT UNSIGNED NOT NULL DEFAULT 0,
  data JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rewards_key (reward_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Granted rewards. (user_id, source, source_key) is unique so every reward is idempotent:
-- a daily reward / streak milestone / daily challenge payout can never be claimed twice.
CREATE TABLE user_rewards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(30) NOT NULL,
  source_key VARCHAR(60) NOT NULL,
  coins INT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  item_key VARCHAR(40) NULL,
  item_qty INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_rewards (user_id, source, source_key),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coin_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  amount INT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason VARCHAR(40) NOT NULL,
  ref VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_coin_tx_user (user_id, created_at),
  CONSTRAINT fk_coin_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shop_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_key VARCHAR(40) NOT NULL,
  type ENUM('avatar','frame','theme','title','effect','power_up') NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NULL,
  price INT UNSIGNED NOT NULL,
  data JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_items_key (item_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_inventory (
  user_id BIGINT UNSIGNED NOT NULL,
  item_key VARCHAR(40) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_key),
  CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_challenges (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  challenge_date DATE NOT NULL,
  question_ids JSON NOT NULL,
  question_count INT UNSIGNED NOT NULL,
  total_time_sec INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_date (challenge_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_challenge_entries (
  challenge_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  match_id CHAR(26) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  correct INT UNSIGNED NOT NULL DEFAULT 0,
  time_ms INT UNSIGNED NULL,
  status ENUM('started','completed') NOT NULL DEFAULT 'started',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (challenge_id, user_id),
  KEY ix_dce_rank (challenge_id, status, score),
  CONSTRAINT fk_dce_challenge FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_dce_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  data JSON NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notifications_user (user_id, created_at),
  KEY ix_notifications_unread (user_id, read_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  push TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_announcements_created (created_at),
  CONSTRAINT fk_announcements_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NULL,
  target_user_id BIGINT UNSIGNED NULL,
  match_id CHAR(26) NULL,
  reason ENUM('cheating','abuse','inappropriate_username','inappropriate_avatar','exploit','other') NOT NULL,
  details VARCHAR(1000) NULL,
  evidence JSON NULL,
  status ENUM('open','reviewing','dismissed','actioned') NOT NULL DEFAULT 'open',
  action ENUM('dismiss','warn','suspend','ban') NULL,
  admin_note VARCHAR(500) NULL,
  handled_by_admin_id INT UNSIGNED NULL,
  handled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_reports_status (status, created_at),
  KEY ix_reports_target (target_user_id),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_admin FOREIGN KEY (handled_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE moderation_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  admin_id INT UNSIGNED NULL,
  report_id BIGINT UNSIGNED NULL,
  action ENUM('warn','suspend','ban','unban','unsuspend','reset_username','reset_avatar','reset_stats') NOT NULL,
  reason VARCHAR(500) NULL,
  until_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_moderation_user (user_id, created_at),
  CONSTRAINT fk_mod_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mod_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_mod_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  setting_key VARCHAR(60) NOT NULL,
  value JSON NOT NULL,
  updated_by_admin_id INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_admin FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blocked_words (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blocked_words (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily aggregates for the admin dashboard (filled by a cron in the server).
CREATE TABLE daily_stats (
  stat_date DATE NOT NULL,
  new_users INT UNSIGNED NOT NULL DEFAULT 0,
  active_users INT UNSIGNED NOT NULL DEFAULT 0,
  matches_pvp INT UNSIGNED NOT NULL DEFAULT 0,
  matches_ai INT UNSIGNED NOT NULL DEFAULT 0,
  matches_solo INT UNSIGNED NOT NULL DEFAULT 0,
  peak_online INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
