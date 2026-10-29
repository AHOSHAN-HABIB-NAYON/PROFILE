-- Creates the admin panel's MySQL user with NO access to location-bearing tables.
-- Run once per environment as a DB administrator, after migrations, and again after any
-- migration that adds a table (new tables are NOT granted automatically - deny by default).
-- Replace the password and database name.
--
-- Location-bearing tables (never granted): locations, places, trips, sos_events,
-- timeline_events, nearby_cache, place_presence. Keep in sync with LOCATION_TABLES in
-- server/migrations/20261028_0001_initial_schema.js (a test checks this file).

-- email_codes: 6-digit codes could be brute-forced from their hashes, so admin gets no access at all.
-- DENY: email_codes

CREATE USER IF NOT EXISTS 'nirapod_admin'@'localhost' IDENTIFIED BY 'CHANGE_ME';

GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.users TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.sessions TO 'nirapod_admin'@'localhost';
-- Retired refresh-token hashes (reuse detection). Admin never reads them; DELETE only, for account deletion.
GRANT DELETE ON nirapod.refresh_token_history TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.admin_users TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.families TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.family_members TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.consents TO 'nirapod_admin'@'localhost';
GRANT SELECT, UPDATE ON nirapod.child_devices TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.join_codes TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.invites TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.sos_deliveries TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.emergency_contacts TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.plans TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.plan_prices TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.subscriptions TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.redeem_codes TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.redemptions TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.grants TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.support_tickets TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.chat_conversations TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.chat_messages TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.chat_attachments TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.agents TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.kb_articles TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.ai_settings TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.ai_usage TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.emergency_numbers TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.app_settings TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nirapod.changelog TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT ON nirapod.audit_logs TO 'nirapod_admin'@'localhost';
-- notifications.params can contain place names ("Rafi reached School"): admin reads only safe columns.
GRANT SELECT (id, user_id, family_id, category, type, title_key, read_at, created_at), INSERT ON nirapod.notifications TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.email_logs TO 'nirapod_admin'@'localhost';
GRANT SELECT, UPDATE ON nirapod.abuse_reports TO 'nirapod_admin'@'localhost';
GRANT SELECT, INSERT, UPDATE ON nirapod.data_requests TO 'nirapod_admin'@'localhost';
GRANT SELECT ON nirapod.job_runs TO 'nirapod_admin'@'localhost';
FLUSH PRIVILEGES;
