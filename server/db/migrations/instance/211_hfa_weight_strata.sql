-- Each weight row can carry the facility's sampling stratum for that round,
-- imported from the same file as the weight. NULL is "no stratum given",
-- never an empty string.

ALTER TABLE hfa_facility_weights ADD COLUMN IF NOT EXISTS stratum text CHECK (stratum <> '');
