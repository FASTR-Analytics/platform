-- Persisted Yjs CRDT state for live slide co-editing (Milestone 2.2b).
-- Lets an active editing room survive a server restart: on restart the room
-- reloads the SAME Yjs doc from crdt_state instead of re-seeding a fresh doc
-- (which would duplicate content when clients reconnect and resync).
--
-- crdt_state            : base64-encoded Yjs document update (Y.encodeStateAsUpdate)
-- crdt_state_last_updated: the slides.last_updated this crdt_state corresponds to.
--   If a later non-collab edit (manual Save, AI tools) bumps last_updated past
--   this, the crdt_state is stale and the room re-seeds from config instead.
ALTER TABLE slides
  ADD COLUMN IF NOT EXISTS crdt_state text;
ALTER TABLE slides
  ADD COLUMN IF NOT EXISTS crdt_state_last_updated text;
