CREATE TABLE ai_limit_hits (
  user_email text NOT NULL,
  limit_type text NOT NULL CHECK (limit_type IN ('daily_user', 'weekly_instance')),
  hit_date date NOT NULL,
  PRIMARY KEY (user_email, limit_type, hit_date)
);
