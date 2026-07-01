-- The slide CRDT doc now stores root title/header text fields (cover title,
-- subtitle, presenter, date; section title/subtitle; content header, sub-header,
-- date, footer) as Y.Text instead of scalar strings, so those fields carry
-- remote cursors. Any crdt_state persisted under the previous model would break
-- when reloaded, so clear it — rooms re-seed from slides.config (whose shape is
-- unchanged) with the new model. crdt_state is a restart-survival cache;
-- re-seeding from config is always correct.
UPDATE slides SET crdt_state = NULL, crdt_state_last_updated = NULL;
