-- Each user's emails sent today through the product email routes, counted
-- against DAILY_EMAIL_LIMIT beside the AI token counters. The date resets the
-- count on the first send of a new day.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_email_count integer NOT NULL DEFAULT 0;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_email_count_date date NOT NULL DEFAULT CURRENT_DATE;
