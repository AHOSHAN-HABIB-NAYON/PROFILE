-- Reference data that every environment (including production) needs.
-- No users, questions or leaderboard data here — those come from real players / admins.

INSERT INTO categories (slug, name, name_bn, icon, description, sort_order) VALUES
('bangladesh', 'Bangladesh', 'বাংলাদেশ', '🇧🇩', 'History, geography and culture of Bangladesh', 1),
('bcs', 'BCS', 'বিসিএস', '🏛️', 'BCS preliminary style questions', 2),
('govt-jobs', 'Government Jobs', 'সরকারি চাকরি', '🏢', 'Government recruitment exam preparation', 3),
('diploma', 'Diploma', 'ডিপ্লোমা', '🎓', 'Polytechnic / diploma engineering', 4),
('bank', 'Bank', 'ব্যাংক', '🏦', 'Bank recruitment exams', 5),
('bangla', 'Bangla', 'বাংলা', '📖', 'Bangla language and literature', 6),
('english', 'English', 'ইংরেজি', '🇬🇧', 'English grammar and vocabulary', 7),
('math', 'Math', 'গণিত', '🔢', 'Mathematics and mental ability', 8),
('science', 'Science', 'বিজ্ঞান', '🔬', 'General science', 9),
('ict', 'ICT', 'আইসিটি', '💻', 'Information and communication technology', 10),
('international', 'International', 'আন্তর্জাতিক', '🌎', 'International affairs', 11),
('current-affairs', 'Current Affairs', 'সাম্প্রতিক', '📰', 'Recent events', 12),
('sports', 'Sports', 'খেলাধুলা', '🏏', 'Sports trivia', 13),
('general-knowledge', 'General Knowledge', 'সাধারণ জ্ঞান', '🧠', 'Mixed general knowledge', 14);

INSERT INTO admin_roles (role_key, name, is_system) VALUES
('super_admin', 'Super Admin', 1),
('admin', 'Admin', 1),
('moderator', 'Moderator', 1),
('question_manager', 'Question Manager', 1);

INSERT INTO admin_permissions (perm_key, description) VALUES
('dashboard.view', 'View dashboard and analytics'),
('users.view', 'View players, activity, matches and login history'),
('users.moderate', 'Warn, suspend, ban and unban players'),
('users.reset', 'Reset player values (username, avatar, stats)'),
('questions.view', 'View questions and categories'),
('questions.manage', 'Create, edit, delete, import and export questions'),
('categories.manage', 'Create, edit, reorder and delete categories'),
('matches.view', 'View live and past matches'),
('matches.manage', 'Abort live matches'),
('reports.view', 'View reports'),
('reports.handle', 'Resolve reports'),
('settings.game', 'Change game settings'),
('settings.app', 'Change app settings'),
('content.manage', 'Manage achievements, seasons, shop items and rewards'),
('announcements.send', 'Send announcements and push notifications'),
('admins.manage', 'Manage admin accounts and roles'),
('audit.view', 'View the admin audit log');

-- super_admin: everything
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.role_key = 'super_admin';

-- admin: everything except managing admins
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.role_key = 'admin' AND p.perm_key <> 'admins.manage';

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.role_key = 'moderator' AND p.perm_key IN ('dashboard.view','users.view','users.moderate','matches.view','reports.view','reports.handle','questions.view');

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.role_key = 'question_manager' AND p.perm_key IN ('dashboard.view','questions.view','questions.manage','categories.manage');

INSERT INTO achievements (ach_key, name, description, icon, metric, threshold, reward_coins, reward_xp, sort_order) VALUES
('first_victory', 'First Victory', 'Win your first battle', '🏅', 'wins', 1, 50, 50, 1),
('wins_10', '10 Wins', 'Win 10 battles', '⚔️', 'wins', 10, 150, 100, 2),
('wins_100', '100 Wins', 'Win 100 battles', '🛡️', 'wins', 100, 1000, 800, 3),
('correct_1000', '1,000 Correct Answers', 'Answer 1,000 questions correctly', '🎯', 'total_correct', 1000, 800, 600, 4),
('win_streak_10', '10 Match Streak', 'Win 10 battles in a row', '🔥', 'best_win_streak', 10, 600, 500, 5),
('matches_100', '100 Matches', 'Play 100 matches', '🎮', 'total_games', 100, 400, 300, 6),
('champion_league', 'Champion League', 'Reach the Champion league', '🏆', 'peak_rating', 2050, 2000, 1500, 7),
('speed_demon', 'Speed Demon', 'Give 100 lightning-fast correct answers', '⚡', 'fast_answers', 100, 300, 200, 8),
('quiz_master', 'Quiz Master', 'Reach level 50', '🧠', 'level', 50, 1500, 0, 9),
('daily_warrior', 'Daily Warrior', 'Complete 30 daily challenges', '📅', 'daily_challenges_done', 30, 700, 500, 10),
('streak_7', 'One Week Strong', 'Play 7 days in a row', '📆', 'best_streak_days', 7, 150, 100, 11),
('streak_30', 'Unstoppable', 'Play 30 days in a row', '💪', 'best_streak_days', 30, 800, 600, 12);

INSERT INTO shop_items (item_key, type, name, description, price, data, sort_order) VALUES
('frame_neon', 'frame', 'Neon Frame', 'Electric blue avatar frame', 400, '{"css":"neon"}', 1),
('frame_gold', 'frame', 'Golden Frame', 'A frame fit for champions', 1200, '{"css":"gold"}', 2),
('frame_flame', 'frame', 'Flame Frame', 'For players on fire', 900, '{"css":"flame"}', 3),
('title_scholar', 'title', 'Scholar', 'Profile title: Scholar', 300, '{"text":"Scholar"}', 4),
('title_bcs_warrior', 'title', 'BCS Warrior', 'Profile title: BCS Warrior', 500, '{"text":"BCS Warrior"}', 5),
('title_genius', 'title', 'জিনিয়াস', 'Profile title: জিনিয়াস', 800, '{"text":"জিনিয়াস"}', 6),
('theme_midnight', 'theme', 'Midnight Theme', 'Dark cosmetic theme accent', 600, '{"accent":"#38bdf8"}', 7),
('effect_confetti_gold', 'effect', 'Gold Confetti', 'Gold victory confetti', 700, '{"confetti":"gold"}', 8),
('pu_fifty_fifty', 'power_up', '50/50', 'Remove two wrong options (non-ranked matches)', 60, '{"powerUp":"fifty_fifty"}', 20),
('pu_time_boost', 'power_up', 'Time Boost', 'Extra seconds for one question (non-ranked matches)', 40, '{"powerUp":"time_boost"}', 21),
('pu_double_score', 'power_up', 'Double Score', 'Double points for one question (non-ranked matches)', 80, '{"powerUp":"double_score"}', 22),
('pu_hint', 'power_up', 'Hint', 'A small hint for one question (non-ranked matches)', 50, '{"powerUp":"hint"}', 23);
