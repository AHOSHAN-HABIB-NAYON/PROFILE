-- AI question generation + review queue, no-repeat question rotation, missions and quests.

ALTER TABLE questions
  ADD COLUMN review_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved' AFTER is_active,
  ADD COLUMN source ENUM('manual','import','ai') NOT NULL DEFAULT 'manual' AFTER review_status,
  ADD COLUMN ai_job_id INT UNSIGNED NULL AFTER source,
  ADD COLUMN source_refs TEXT NULL AFTER ai_job_id,
  ADD KEY ix_questions_review (review_status, category_id, created_at);

-- Every question a player has been shown. A category's rotation ("cycle") restarts once the
-- player has seen all of it, so nothing repeats before the whole bank has been played.
CREATE TABLE user_seen_questions (
  user_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id),
  KEY ix_seen_user_cat (user_id, category_id, seen_at),
  CONSTRAINT fk_seen_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_seen_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_question_cycles (
  user_id BIGINT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  cycle INT UNSIGNED NOT NULL DEFAULT 1,
  cycle_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_cycles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_generation_jobs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NOT NULL,
  topic VARCHAR(300) NULL,
  difficulty VARCHAR(10) NOT NULL DEFAULT 'mixed',
  language ENUM('bn','en') NOT NULL DEFAULT 'bn',
  requested INT UNSIGNED NOT NULL,
  created_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('queued','running','done','failed','cancelled') NOT NULL DEFAULT 'queued',
  model VARCHAR(80) NOT NULL,
  web_search TINYINT(1) NOT NULL DEFAULT 1,
  auto_approve TINYINT(1) NOT NULL DEFAULT 0,
  instructions TEXT NULL,
  error VARCHAR(1000) NULL,
  input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_ai_jobs_created (created_at),
  CONSTRAINT fk_ai_jobs_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_ai_jobs_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE missions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(300) NULL,
  icon VARCHAR(30) NOT NULL DEFAULT 'target',
  period ENUM('daily','weekly','once') NOT NULL DEFAULT 'daily',
  metric VARCHAR(30) NOT NULL,
  target INT UNSIGNED NOT NULL,
  reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
  reward_xp INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_missions_active (is_active, deleted_at, metric)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_missions (
  user_id BIGINT UNSIGNED NOT NULL,
  mission_id INT UNSIGNED NOT NULL,
  period_key VARCHAR(16) NOT NULL,
  progress INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  claimed_at DATETIME NULL,
  PRIMARY KEY (user_id, mission_id, period_key),
  KEY ix_user_missions_claim (user_id, completed_at, claimed_at),
  CONSTRAINT fk_um_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_um_mission FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO missions (title, description, icon, period, metric, target, reward_coins, reward_xp, sort_order) VALUES
('আজকের যোদ্ধা', 'আজ যেকোনো ৩টি ম্যাচ খেলুন', 'swords', 'daily', 'matches', 3, 40, 30, 1),
('জয়ের স্বাদ', 'আজ ২টি ব্যাটল জিতুন', 'trophy', 'daily', 'battle_wins', 2, 60, 40, 2),
('জ্ঞানের ঝড়', 'আজ ৩০টি সঠিক উত্তর দিন', 'brain', 'daily', 'correct_answers', 30, 50, 50, 3),
('ডেইলি চ্যালেঞ্জার', 'আজকের ডেইলি চ্যালেঞ্জ শেষ করুন', 'calendar', 'daily', 'daily_challenge', 1, 40, 40, 4),
('বিদ্যুৎ গতি', 'আজ ১৫টি দ্রুত সঠিক উত্তর দিন', 'bolt', 'daily', 'fast_answers', 15, 40, 30, 5),
('সাপ্তাহিক চ্যাম্পিয়ন', 'এই সপ্তাহে ১৫টি ব্যাটল জিতুন', 'crown', 'weekly', 'battle_wins', 15, 300, 250, 10),
('অনলাইন লড়াকু', 'এই সপ্তাহে ১০টি অনলাইন (PvP) ব্যাটল জিতুন', 'globe', 'weekly', 'pvp_wins', 10, 350, 300, 11),
('বন্ধুর সাথে যুদ্ধ', 'এই সপ্তাহে বন্ধুদের সাথে ৫টি ম্যাচ খেলুন', 'users', 'weekly', 'friend_battles', 5, 200, 150, 12),
('পারফেক্ট স্কোর', 'একটি ম্যাচে সব প্রশ্নের সঠিক উত্তর দিন', 'star', 'weekly', 'perfect_match', 1, 250, 200, 13),
('প্রথম জয়', 'আপনার প্রথম ব্যাটল জিতুন', 'medal', 'once', 'battle_wins', 1, 100, 100, 20),
('শতকের মাইলফলক', 'মোট ১০০টি সঠিক উত্তর দিন', 'target', 'once', 'correct_answers', 100, 200, 150, 21);
