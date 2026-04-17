CREATE TABLE IF NOT EXISTS hfa_indicators_snapshot (
  var_name text PRIMARY KEY NOT NULL,
  category text NOT NULL,
  definition text NOT NULL,
  type text NOT NULL,
  aggregation text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS hfa_indicator_code_snapshot (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators_snapshot(var_name) ON DELETE CASCADE
);
