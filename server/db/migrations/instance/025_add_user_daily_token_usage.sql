ALTER TABLE users
  ADD COLUMN daily_token_usage integer NOT NULL DEFAULT 0,
  ADD COLUMN daily_token_usage_date date NOT NULL DEFAULT CURRENT_DATE;
