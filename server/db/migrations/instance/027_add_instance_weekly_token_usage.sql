CREATE TABLE instance_weekly_token_usage (
  week_start date PRIMARY KEY,
  total_tokens integer NOT NULL DEFAULT 0
);
