-- Sampling weights must be strictly positive: design weights are >= 1 for any
-- surveyed facility, and a weight of 0 silently excludes the facility from all
-- weighted estimates (NULLed group means, deflated totals). Purge any zero
-- rows at deploy time per DOC_MIGRATIONS, then tighten the CHECK.
DELETE FROM hfa_facility_weights WHERE weight <= 0;
ALTER TABLE hfa_facility_weights DROP CONSTRAINT IF EXISTS hfa_facility_weights_weight_check;
ALTER TABLE hfa_facility_weights ADD CONSTRAINT hfa_facility_weights_weight_check CHECK (weight > 0);
