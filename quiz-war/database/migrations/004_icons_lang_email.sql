-- Professional SVG icons replace emoji: icons are now icon keys rendered by the apps.
UPDATE categories SET icon = CASE slug
  WHEN 'bangladesh' THEN 'flag-bd' WHEN 'bcs' THEN 'landmark' WHEN 'govt-jobs' THEN 'building'
  WHEN 'diploma' THEN 'graduation' WHEN 'bank' THEN 'banknote' WHEN 'bangla' THEN 'book'
  WHEN 'english' THEN 'languages' WHEN 'math' THEN 'calculator' WHEN 'science' THEN 'flask'
  WHEN 'ict' THEN 'cpu' WHEN 'international' THEN 'globe' WHEN 'current-affairs' THEN 'newspaper'
  WHEN 'sports' THEN 'sports' WHEN 'general-knowledge' THEN 'brain' ELSE 'book' END;

UPDATE categories SET color = CASE slug
  WHEN 'bangladesh' THEN '#006a4e' WHEN 'bcs' THEN '#1d4ed8' WHEN 'govt-jobs' THEN '#0f766e'
  WHEN 'diploma' THEN '#9333ea' WHEN 'bank' THEN '#15803d' WHEN 'bangla' THEN '#dc2626'
  WHEN 'english' THEN '#2563eb' WHEN 'math' THEN '#ea580c' WHEN 'science' THEN '#0891b2'
  WHEN 'ict' THEN '#4f46e5' WHEN 'international' THEN '#0284c7' WHEN 'current-affairs' THEN '#b45309'
  WHEN 'sports' THEN '#16a34a' WHEN 'general-knowledge' THEN '#7c3aed' ELSE color END
WHERE color IS NULL OR color = '';

UPDATE achievements SET icon = CASE ach_key
  WHEN 'first_victory' THEN 'medal' WHEN 'wins_10' THEN 'swords' WHEN 'wins_100' THEN 'shield-check'
  WHEN 'correct_1000' THEN 'target' WHEN 'win_streak_10' THEN 'fire' WHEN 'matches_100' THEN 'gamepad'
  WHEN 'champion_league' THEN 'trophy' WHEN 'speed_demon' THEN 'bolt' WHEN 'quiz_master' THEN 'brain'
  WHEN 'daily_warrior' THEN 'calendar' WHEN 'streak_7' THEN 'calendar' WHEN 'streak_30' THEN 'heart-pulse'
  ELSE 'award' END;

-- Language for notifications/emails and email preferences.
ALTER TABLE user_profiles
  ADD COLUMN lang ENUM('bn','en') NOT NULL DEFAULT 'bn',
  ADD COLUMN email_activity TINYINT(1) NOT NULL DEFAULT 1;

-- Welcome email is sent once per account.
ALTER TABLE users ADD COLUMN welcome_sent_at DATETIME NULL;
ALTER TABLE users ADD COLUMN last_activity_email_at DATETIME NULL;
