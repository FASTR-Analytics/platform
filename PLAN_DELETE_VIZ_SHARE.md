# Plan: Delete the single-visualization share feature

> **Scope:** Remove the `share_tokens` system entirely (single-viz public share links).
> Do this **before** the FigureBundle work — it removes one figureInputs-storage surface
> and one consumer of the strip/hydrate path, de-scoping that refactor.
>
> **Decisions locked (2026-06-08):** hard delete; drop the table via migration; delete all
> ~23 existing tokens/links (real prod usage = kenya 10, nigeria 1 — accepted as broken).

## Why this is self-contained

- `share_tokens` is **viz-only** — every route is `/api/share/viz*`; `resource_type` is always
  `"visualization"` in production. No dashboard/report sharing uses it.
- **Public dashboards are a separate mechanism** (`dashboards.is_public` + `server/routes/public/
  dashboard.ts` + `buildPublicDashboardBundle`) and are **NOT touched** by this. (Note: public
  dashboards still bake `figureInputs`, so they remain a surface for the later FigureBundle work —
  deleting shares removes one anonymous-render surface, not all of them.)
- Shares bypass the `route-tracker`/`server_actions` typed system — the client modal calls
  `fetch(${_SERVER_HOST}/api/share/viz...)` directly. So there is nothing to remove from
  `route-tracker.ts` or `client/src/server_actions/`.

## The migration (the non-obvious part)

`validate_migrations` runs the **base schema** (`_main_database.sql`) on a fresh DB, then runs every
numbered migration in order (`ON_ERROR_STOP=1`), and **fails unless `base == base + migrations`** (all
migrations idempotent no-ops) AND no migration errors. At runtime, the base schema runs **only on a
new DB** (`db_startup.ts:44`), while numbered migrations re-run **every startup**.

Five migrations touch `share_tokens` — **leave every one of them exactly as it is.** DOC_MIGRATIONS:
*"Don't rewrite old migrations — fix forward."* The migration history is append-only; only the base
schema changes.

- `026_share_tokens.sql` — `CREATE TABLE IF NOT EXISTS share_tokens` + 2 indexes
- `027_share_tokens_text.sql` — `ALTER … data TYPE TEXT` (guarded)
- `038_share_tokens_slug.sql` — `ALTER … ADD COLUMN … slug` + unique index
- `039_share_tokens_password.sql` — `ALTER … ADD COLUMN password_hash`
- `040_share_tokens_plaintext_password.sql` — rename/drop + unguarded `UPDATE share_tokens …`

The drop is **two changes, zero deletions**:

1. **Remove** `CREATE TABLE share_tokens (…)` + its 3 indexes from
   `server/db/instance/_main_database.sql` (the `share_tokens` block, lines 492-506). Base = final
   state, and the final state has no table.
2. **Add** `server/db/migrations/instance/044_drop_share_tokens.sql`:
   ```sql
   DROP TABLE IF EXISTS share_tokens CASCADE;
   ```
   Drops the real table on existing instances at next startup; also deletes all ~23 existing tokens.
3. **Run `./validate_migrations`** — must pass. Fresh-DB replay: base has no table → `026` re-creates
   it (the migration owns the full `CREATE TABLE`, so it now executes for real instead of no-opping) →
   `027/038/039/040` reshape it → `044` drops it → `after == before` (neither has the table), no errors.

**Why nothing in the migration history is touched:** because `026` owns the entire `CREATE TABLE`,
removing the table from base is sufficient — `026` just runs for real on a fresh DB and the later
`ALTER`s have a table to work on. Nothing errors, so nothing needs editing or deleting. (Contrast the
`dashboards.slug` case in memory `reference_base_schema_vs_drop_migration`, where *base* owned the
table and a migration only indexed a base column — that one genuinely required touching the old
migration. Not so here.)

> **Cosmetic cost, accepted:** numbered migrations re-run every startup, so `026` re-creates an empty
> `share_tokens` that `044` immediately drops again — a few transient DDL ops on an always-empty table,
> gone before boot completes. Harmless, and the price of fix-forward. Do **not** delete `026` to
> "optimize" this away — that's rewriting history.

## Code to delete

**Server**
- `server/db/instance/share_tokens.ts` — delete (all `share_tokens` DB functions)
- `server/routes/instance/share.ts` — delete (authenticated `/viz` routes)
- `server/routes/public/share.ts` — delete (public `/viz/:token` routes)
- `main.ts` — remove the 6 share hooks:
  - import `routesPublicShare` (line 54) and `routesShare` (lines 57-58)
  - `app.use("/api/share/*", corsMiddleware)` (line 85)
  - `app.route("/", routesPublicShare)` (line 95)
  - SPA-HTML serve for `/share/viz/:token` (lines 98-101)
  - `app.route("/", routesShare)` (line 153)

**Shared (lib)**
- `lib/types/share.ts` — delete (`ShareVizBundle`, `ShareTokenInfo`)
- `lib/types/mod.ts` — remove `export * from "./share.ts";` (line 46)

**Client**
- `client/src/components/visualization/share_visualization_modal.tsx` — delete
- `client/src/components/visualization/all_share_links_modal.tsx` — delete (project-wide share-link
  manager; imports `ShareTokenInfo`, so leaving it **breaks `typecheck`** once `lib/types/share.ts` is gone)
- `client/src/components/public_viewer/visualization.tsx` — delete (**keep** `dashboard.tsx`,
  `dashboard_logos.tsx`, `about_dashboard_modal.tsx`, `download_dashboard_modal.tsx` — public
  dashboards)
- `client/src/app.tsx` — remove `import PublicVisualization` (line 5) and
  `<Route path="/share/viz/:token" …>` (line 11)
- `client/src/components/visualization/visualization_editor_inner.tsx` — remove the
  `ShareVisualizationModal` import (line 67), the `openShareModal` handler (~lines 466-484), and the
  Share button that calls it (~line 771)
- `client/src/components/project/project_visualizations.tsx` — remove the `AllShareLinksModal` import
  (line 14), the `openAllShareLinks` handler (lines 92-99), and the "Share links" button (lines 192-193)
- `client/src/components/PresentationObjectPanelDisplay.tsx` — remove the share-count UI: the
  `sharedVizCounts` signal + `onMount` POST to `/api/share/viz/all` (lines 84-105), the
  `sharedVizCounts`/`shareCount` prop threading (lines 471, 488, 704, 824), and the "{n} link(s)" badge
  (lines 960-963). (Wrapped in a silent `try/catch` today, so it degrades quietly rather than crashing —
  but it's dead code POSTing to a now-404 endpoint and a badge that can never show.)

## Verify

- [ ] `./validate_migrations` passes (covers the **fresh** main DB only)
- [ ] **Existing-instance path** (NOT covered by `validate_migrations`): in a throwaway postgres,
      seed a `share_tokens` table + a row, run `044`, confirm the table is dropped and a second run is
      a clean no-op. (Base-schema = final-state is firm here; deleting the five `026/027/038-040`
      create+alter migrations + forward `044` are the established drop pattern — see memory
      `reference_base_schema_vs_drop_migration`.)
- [ ] `deno task typecheck` passes (server + client) — catches any missed reference (notably
      `all_share_links_modal.tsx`'s `ShareTokenInfo` import)
- [ ] App boots; visualization editor shows **no** Share button; the project viz list shows **no**
      "Share links" button; the viz panel shows **no** share-count badges; `GET /share/viz/:token` 404s
- [ ] Public **dashboards** still work (separate feature, untouched)

## Not in scope

- Public dashboards (`is_public`) — separate mechanism, untouched (but still a FigureBundle surface).
- The FigureBundle refactor itself — this deletion just shrinks its surface from 4 to 3.
