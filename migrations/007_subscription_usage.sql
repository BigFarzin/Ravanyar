ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS usage_limit INTEGER;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

UPDATE subscriptions
SET usage_count = 0
WHERE usage_count IS NULL;

UPDATE subscriptions
SET usage_limit = CASE
    WHEN plan_id = 'silver' THEN 3
    WHEN plan_id = 'gold' THEN 9
    ELSE NULL
END
WHERE usage_limit IS NULL;