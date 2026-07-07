-- HFA sentinel Layer 3: per-variable sentinel classification snapshot.
-- Populated at HFA-export time from instance hfa_variable_values so the module
-- generator can emit per-variable missingness checks. Empty until the next
-- HFA export, at which point the generator falls back to the hardcoded
-- c(-99, -999999) set (see PLAN_HFA_SENTINEL_VALUES.md).
CREATE TABLE IF NOT EXISTS hfa_variable_values_snapshot (
  var_name text NOT NULL,
  value text NOT NULL,
  sentinel_class text NOT NULL,
  is_numeric boolean NOT NULL,
  PRIMARY KEY (var_name, value)
);
