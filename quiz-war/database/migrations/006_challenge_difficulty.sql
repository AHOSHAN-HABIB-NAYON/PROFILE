-- Challenges can pick a difficulty (harder questions get less time per question).
ALTER TABLE battle_requests ADD COLUMN difficulty VARCHAR(10) NULL AFTER question_time_sec;
