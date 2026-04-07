CREATE TABLE IF NOT EXISTS hfa_indicator_code (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES dataset_hfa_dictionary_time_points(time_point) ON DELETE RESTRICT
);

INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
SELECT i.var_name, tp.time_point, i.r_code, i.r_filter_code
FROM hfa_indicators i
CROSS JOIN dataset_hfa_dictionary_time_points tp
WHERE i.r_code != ''
ON CONFLICT DO NOTHING;

ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS r_code;
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS r_filter_code;
