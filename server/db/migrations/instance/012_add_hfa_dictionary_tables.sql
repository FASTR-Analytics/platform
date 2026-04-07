CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_time_points (
  time_point text NOT NULL PRIMARY KEY,
  time_point_label text NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_vars (
  time_point text NOT NULL,
  var_name text NOT NULL,
  var_label text NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_values (
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  value_label text NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES dataset_hfa_dictionary_vars(time_point, var_name) ON DELETE CASCADE
);

DELETE FROM dataset_hfa_upload_attempts;
DELETE FROM dataset_hfa;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'dataset_hfa'::regclass
    AND confrelid = 'dataset_hfa_dictionary_vars'::regclass
  ) THEN
    ALTER TABLE dataset_hfa
      ADD FOREIGN KEY (time_point, var_name)
      REFERENCES dataset_hfa_dictionary_vars(time_point, var_name)
      ON DELETE RESTRICT DEFERRABLE;
  END IF;
END $$;
