-- Figure blocks in slide and report CRDT docs now store a DECOMPOSED figure:
-- a co-editable figConfig (Y.Map) + an opaque figData, instead of one opaque
-- bundle. Any crdt_state persisted under the previous (whole-bundle) model would
-- restore the old shape when reloaded, so clear it — rooms re-seed from the
-- stored config/body+figures (whose stored JSON shapes are UNCHANGED) with the
-- new model. crdt_state is a restart-survival cache; re-seeding from content is
-- always correct. (Precedent: migration 030 did the same for the slide text-field
-- Y.Text change.)
UPDATE slides  SET crdt_state = NULL, crdt_state_last_updated = NULL;
UPDATE reports SET crdt_state = NULL, crdt_state_last_updated = NULL;
