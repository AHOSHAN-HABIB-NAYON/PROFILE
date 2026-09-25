-- Premium plans can have their own speed limits (NULL = use the global rate limits).
ALTER TABLE premium_plans
  ADD COLUMN hourly_limit INT UNSIGNED NULL AFTER resource_limit,
  ADD COLUMN daily_limit INT UNSIGNED NULL AFTER hourly_limit;
ALTER TABLE user_premium
  ADD COLUMN hourly_limit INT UNSIGNED NULL AFTER resource_limit,
  ADD COLUMN daily_limit INT UNSIGNED NULL AFTER hourly_limit;

-- Sensible defaults for the default plans (longer plans = faster).
UPDATE premium_plans SET hourly_limit = 100, daily_limit = 500  WHERE hourly_limit IS NULL AND duration_days <= 7;
UPDATE premium_plans SET hourly_limit = 150, daily_limit = 1000 WHERE hourly_limit IS NULL AND duration_days > 7 AND duration_days <= 15;
UPDATE premium_plans SET hourly_limit = 200, daily_limit = 1500 WHERE hourly_limit IS NULL AND duration_days > 15 AND duration_days <= 31;
UPDATE premium_plans SET hourly_limit = 500, daily_limit = 5000 WHERE hourly_limit IS NULL AND duration_days > 31;

-- Members already on a plan get that plan's limits.
UPDATE user_premium up JOIN premium_plans p ON p.id = up.plan_id
   SET up.hourly_limit = p.hourly_limit, up.daily_limit = p.daily_limit
 WHERE up.status = 'active' AND up.hourly_limit IS NULL;
