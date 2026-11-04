-- The HFA indicator verification: each indicator's latest check by the
-- model and the findings it raised, which users dismiss or fix over many
-- sessions. A finding's rule is checked against the rules list at the route,
-- not here, since the list lives in code. A finding about a deleted round is
-- void, so it goes with the round.
CREATE TABLE IF NOT EXISTS hfa_indicator_verifications (
  indicator_id TEXT PRIMARY KEY NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  verified_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hfa_verification_findings (
  id TEXT PRIMARY KEY NOT NULL,
  indicator_id TEXT NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  time_point TEXT REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  message TEXT NOT NULL,
  suggestion TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hfa_verification_findings_indicator ON hfa_verification_findings(indicator_id);
