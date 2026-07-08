-- Persisted Yjs CRDT state for live visualization (presentation object) co-editing
-- in the visualization editor (mirrors slides 029 and reports 031).
-- crdt_state: base64 Y.encodeStateAsUpdate of the PO config doc.
-- crdt_state_last_updated: the presentation_objects.last_updated this state
-- corresponds to; valid only while equal (any non-collab write — label, folder,
-- sort — bumps last_updated alone, invalidating the state so the next room open
-- re-seeds from config, which is always safe).
ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS crdt_state text;
ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS crdt_state_last_updated text;
