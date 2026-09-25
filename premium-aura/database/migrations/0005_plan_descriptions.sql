-- Default plan descriptions described total-number quotas; plans are now speed-based.
UPDATE premium_plans SET description = 'Faster access for one week' WHERE description = 'Starter VIP access for one week';
UPDATE premium_plans SET description = 'Two weeks of faster speed' WHERE description = 'Two weeks of boosted limits';
UPDATE premium_plans SET description = 'Top speed for a full year' WHERE description = 'Unlimited resources for a full year';
