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
numbered migration in order (`ON_ERROR_STOP=1`), and **fails unless `base == base + migrations`** (the
net schema is unchanged) AND no migration errors. At runtime, the base schema runs **only on a new DB**
(`db_startup.ts:44`); numbered migrations are tracked in a `schema_migrations` table and each runs
**exactly once** per instance (`server/db/migrations/runner.ts` filters out already-applied ids).

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
   `server/db/instance/_main_database.sql` — the whole `share_tokens` block **lines 488-506,
   including the `-- SHARE TOKENS` banner**. Base = final state, and the final state has no table.
2. **Add** `server/db/migrations/instance/044_drop_share_tokens.sql`:
   ```sql
   DROP TABLE IF EXISTS share_tokens CASCADE;
   ```
   On existing instances this is the **only** migration that runs (042-043 already applied); it drops
   the real table once, deleting all ~23 existing tokens. No FK/view/trigger `REFERENCES share_tokens`,
   so `CASCADE` is inert.
3. **Run `./validate_migrations`** — must pass. Fresh-DB replay: base has no table → `026` re-creates
   it (the migration owns the full `CREATE TABLE`, so it now executes for real instead of no-opping) →
   `027/038/039/040` reshape it → `044` drops it → `after == before` (neither has the table), no errors.

**Why nothing in the migration history is touched:** because `026` owns the entire `CREATE TABLE`,
removing the table from base is sufficient — `026` just runs for real on a fresh DB and the later
`ALTER`s have a table to work on. Nothing errors, so nothing needs editing or deleting. (Contrast the
`dashboards.slug` case in memory `reference_base_schema_vs_drop_migration`, where *base* owned the
table and a migration only indexed a base column — that one genuinely required touching the old
migration. Not so here.)

> **No runtime churn:** migrations run **once** (tracked in `schema_migrations`), so on existing
> instances only `044` executes — `026`-`040` already ran and never re-fire. The recreate-then-drop
> sequence happens **only inside `validate_migrations`' fresh-DB replay** (026 creates an empty table,
> 044 drops it → net no table), which is exactly why validation passes. Do **not** delete `026` to
> "tidy" the replay — that's rewriting history, and fix-forward is the rule.

## Code to delete

**Server**
- `server/db/instance/share_tokens.ts` — delete (all `share_tokens` DB functions)
- `server/routes/instance/share.ts` — delete (authenticated `/viz` routes)
- `server/routes/public/share.ts` — delete (public `/viz/:token` routes)
- `main.ts` — remove the share hooks:
  - import `routesPublicShare` (line 54) and `routesShare` (lines 57-58)
  - `app.use("/api/share/*", corsMiddleware)` (line 85)
  - `app.route("/", routesPublicShare)` (line 95)
  - **delete only line 101** — `app.get("/share/viz/:token", (c) => c.html(indexHtml))`. **KEEP** the
    surrounding `try { const indexHtml = …; app.get("/d/:slug", …) } catch {}` (lines 99-105): it
    serves the **public-dashboard** SPA and shares the `indexHtml` declaration. Reword the comment on
    line 98 (it currently says "public share routes").
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
  dashboards; **and keep `PasswordGate.tsx`** — see Not in scope)
- `client/src/app.tsx` — remove `import PublicVisualization` (line 5) and
  `<Route path="/share/viz/:token" …>` (line 11)
- `client/src/components/visualization/visualization_editor_inner.tsx` — remove the
  `ShareVisualizationModal` import (line 67), the **full `openShareModal` handler (lines 466-492**,
  through the closing `};`), and the Share button that calls it (~line 771)
- `client/src/components/project/project_visualizations.tsx` — remove the `AllShareLinksModal` import
  (line 14), the `openAllShareLinks` handler (lines 92-99), and the "Share links" button (lines 192-193)
- `client/src/components/PresentationObjectPanelDisplay.tsx` — remove the share-count UI: the
  `sharedVizCounts` signal + `onMount` POST to `/api/share/viz/all` (lines 84-105), the
  `sharedVizCounts`/`shareCount` prop threading (lines 471, 488, 704, 824), and the "{n} link(s)" badge
  (lines 960-963). Also drop the now-unused imports `onMount` (line 32) and `_SERVER_HOST` (line 41;
  keep `serverActions`). (The block is in a silent `try/catch` today, so it degrades quietly — but
  it's dead code POSTing to a now-404 endpoint and a badge that can never show.)

**Help (source is in the SIBLING repo `../wb-fastr-site`)**
- `build_help_buttons.ts` reads help docs from `WB_FASTR_SITE_DIR ?? "../wb-fastr-site"` (EN **and**
  FR), and **throws if an id exists in one language but not the other**. The `viz-share-link` entry is
  in **both** `src/content/docs/user-guide/visualizations.md` and `fr/user-guide/visualizations.md`
  (the `### Sharing a link` heading + `<!-- help#viz-share-link -->` tag + prose).
- Remove that entry from **both** files in `../wb-fastr-site`, then run `deno task build:help-buttons`
  (needs the sibling checkout) to regenerate `lib/help/help_targets.generated.ts` (committed; do not
  hand-edit). Editing only one language **crashes the generator**. Harmless to runtime if skipped, but
  leaves an unreachable help target.

**Docs / comments (cleanup)**
- `DOC_DB_ACCESS_LAYER.md:195` — drop the `share_tokens.ts` example from the raw-throwing-paths list
  (keep `ai_usage_logs.ts`); otherwise it points at a deleted file.
- `server/.../static.ts:6,18` — comments cite "share links" as an example asset use; optional trim.
  **Keep the asset-serving code** (shared with public-dashboard logos).

## Verify

- [ ] `./validate_migrations` passes (covers the **fresh** main DB only)
- [ ] **Existing-instance path** (NOT covered by `validate_migrations`): in a throwaway postgres,
      seed a `share_tokens` table + a row, run `044`, confirm the table is dropped and a second run is
      a clean no-op. (On real instances only `044` runs — once. Base-schema = final-state; the five
      `026/027/038-040` migrations stay untouched. See memory `reference_base_schema_vs_drop_migration`.)
- [ ] `deno task typecheck` passes (server + client) — catches any missed reference (notably
      `all_share_links_modal.tsx`'s `ShareTokenInfo` import)
- [ ] App boots; visualization editor shows **no** Share button; the project viz list shows **no**
      "Share links" button; the viz panel shows **no** share-count badges; `GET /share/viz/:token` 404s
- [ ] Public **dashboards** still work (separate feature, untouched) — `/d/:slug` still serves the SPA

## Not in scope

- `client/src/components/PasswordGate.tsx` — its only current caller (`public_viewer/visualization.tsx`)
  is deleted, so it becomes unreferenced. **Keep it** (decision 2026-06-08) as a reusable
  password-gate component for future use; do not let a dead-code sweep remove it.
- Public dashboards (`is_public`) — separate mechanism, untouched (but still a FigureBundle surface).
- Slide-deck **Share** (`share_slide_deck.tsx`) — unrelated; it emails the deck as a PDF, not a
  `share_tokens` link. Untouched.
- The FigureBundle refactor itself — this deletion just shrinks its surface from 4 to 3.
