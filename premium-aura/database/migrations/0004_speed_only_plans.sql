-- Plans are limited by speed only (per hour / per day); total-number quotas are removed.
UPDATE premium_plans SET resource_limit = NULL;
UPDATE user_premium SET resource_limit = NULL WHERE status = 'active';
-- Free users: 50 per hour, 200 per day.
UPDATE rate_limits SET hourly_limit = 50, daily_limit = 200 WHERE scope = 'resource_assign';
