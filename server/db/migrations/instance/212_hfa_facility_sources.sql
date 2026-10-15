-- Who set each HFA registry cell's current value: the round whose import set
-- it, or the user, per facility and column group ('admin' is the whole admin
-- tuple). A cell with no row is of unknown origin, which is every cell of a
-- registry imported before this table. time_point is NULL once its round is
-- deleted.

CREATE TABLE IF NOT EXISTS hfa_facility_sources (
  facility_id text NOT NULL,
  column_group text NOT NULL CHECK (column_group IN ('admin', 'facility_name',
    'facility_type', 'facility_ownership', 'facility_custom_1',
    'facility_custom_2', 'facility_custom_3', 'facility_custom_4',
    'facility_custom_5')),
  kind text NOT NULL CHECK (kind IN ('round', 'user')),
  time_point text,
  CHECK (kind = 'round' OR time_point IS NULL),
  PRIMARY KEY (facility_id, column_group),
  FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hfa_facility_sources_time_point ON hfa_facility_sources(time_point);
