-- Per range: show numbers to users with a leading "+" (on) or without it (off), whatever the imported format.
ALTER TABLE services ADD COLUMN show_plus TINYINT(1) NOT NULL DEFAULT 0;
