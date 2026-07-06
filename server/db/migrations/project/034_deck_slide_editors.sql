-- Per-slide attribution for deck versions (JSON DeckSlideEditors: which user
-- edited/added/removed each slide during the session, plus deck-level ops).
-- Maintained in memory per session by server/collab/deck_session_ledger.ts
-- and frozen here when the version is written. Null = pre-feature version or
-- ledger lost (restart) — the UI falls back to the session's editor set.
ALTER TABLE deck_versions ADD COLUMN IF NOT EXISTS slide_editors text;
