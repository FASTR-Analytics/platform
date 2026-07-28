-- Persisted Yjs CRDT state for live report co-editing (mirrors slides, 029).
-- crdt_state: base64 Y.encodeStateAsUpdate of the report doc.
-- crdt_state_last_updated: the reports.last_updated this state corresponds to;
-- valid only while equal (any non-collab write bumps last_updated alone,
-- invalidating the state so the next room open re-seeds from
-- body/figures/images, which is always safe).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS crdt_state text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS crdt_state_last_updated text;
