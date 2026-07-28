-- Per-character authorship of report bodies (JSON run-length encoding:
-- [{len, email|null}]). reports.body_authors is the live ledger persisted at
-- each collab checkpoint — like crdt_state it is trusted only while
-- crdt_state_last_updated equals last_updated (a non-collab write invalidates
-- both). report_versions.body_authors freezes the ledger per version so diff
-- views can attribute each inserted span to its actual author.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS body_authors text;
ALTER TABLE report_versions ADD COLUMN IF NOT EXISTS body_authors text;
