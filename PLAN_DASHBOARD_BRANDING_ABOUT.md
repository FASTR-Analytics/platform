# Dashboard branding & About features

## Context

The dashboard feature (editor + public viewer at `/api/d/:projectId/:slug`) currently exposes only
title, slug, public/private, and layout. We want to add three presentation features, mirroring how
slide decks already do logos:

1. **Logos** — add 1+ logos (built-in FASTR logos + uploaded image assets), rendered in the public
   viewer header bar (right side).
2. **About** (long) — markdown, revealed via an "About this dashboard" button in the public viewer.
3. **Summary** (short) — markdown, shown inline as a row directly below the heading bar. Edited as
   part of the same About section.

All three are dashboard-level config and ship in **one clean SQL migration** that adds a single
`config` JSON column to the `dashboards` table (project DB). Layout stays in its existing column.

Confirmed decisions: About = **Markdown** (reuse panther `MarkdownPresentationJsx`); logos = **header
bar, right**; editor UI = **expand the existing Dashboard settings modal**; storage = **single
`config` JSON column**.

## Data model

New stored shape on `dashboards.config` (project DB), validated by a new Zod schema.

```ts
// lib/types/_dashboard_config.ts  (add to existing file)
const dashboardLogosConfigSchema = z.object({
  availableCustom: z.array(z.string()), // uploaded image asset filenames
  selected: z.array(z.string()),        // FASTR built-in values + custom filenames, in order
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
});
const dashboardAboutConfigSchema = z.object({
  summary: z.string(), // inline markdown under heading ("" = hidden)
  body: z.string(),    // long markdown for the About modal ("" = button hidden)
});
export const dashboardConfigSchema = z.object({
  logos: dashboardLogosConfigSchema,
  about: dashboardAboutConfigSchema,
});
export type DashboardConfigFromSchema = z.infer<typeof dashboardConfigSchema>;
```

`getStartingDashboardConfig()` returns `{ logos: { availableCustom: [], selected: [] }, about: { summary: "", body: "" } }`.

## Files to change

### Schema / types (`lib/`)
- **`lib/types/_dashboard_config.ts`** — add the three schemas above + export.
- **`lib/types/dashboard.ts`**:
  - re-export `dashboardConfigSchema`; add `DashboardConfig` type + `getStartingDashboardConfig()`.
  - `Dashboard`: add `config: DashboardConfig`.
  - `DashboardUpdate`: add `config?: DashboardConfig`.
  - `PublicDashboardBundle`: add `logos: { selected: string[]; size?: "sm"|"md"|"lg"|"xl" }` and
    `about: { summary: string; body: string }`.
  - `buildPublicDashboardBundle()`: read `const cfg = dashboard.config ?? getStartingDashboardConfig();`
    (defensive `??` is REQUIRED — a browser holding a pre-deploy cached `DashboardDetail` will lack
    `config`; the detail cache is version-keyed on `last_updated`
    [`t2_dashboards.ts`] which the no-op transform does NOT bump, so stale entries persist). Pass
    `{ selected: cfg.logos.selected, size: cfg.logos.size }` and `cfg.about` into the returned bundle.
- **`lib/api-routes/project/dashboards.ts`** — no change needed; `updateDashboard` already takes
  `DashboardUpdate` as its body, so adding `config?` to that type is enough.

### Server DB (`server/db/`)
- **`server/db/migrations/project/022_dashboard_config.sql`** (NEW) — idempotent:
  `ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS config text NOT NULL DEFAULT '{"logos":{"availableCustom":[],"selected":[]},"about":{"summary":"","body":""}}';`
- **`server/db/.../_project_database.sql`** (base schema) — add the same `config` column to the live
  `dashboards` definition.
- **`server/db/project/_project_database_types.ts`** — `DBDashboard`: add `config: string`.
- **`server/db/project/dashboards.ts`**:
  - add `parseDashboardConfig(raw)` helper (null/empty → `getStartingDashboardConfig()`, else
    `dashboardConfigSchema.parse(parseJsonOrThrow(raw))`) — mirrors existing `parseLayout`.
  - map `config` in `getDashboardDetail` and `getDashboardBySlug` (both already `SELECT *`).
  - `createDashboard`: insert default config JSON.
  - `updateDashboard`: compute `nextConfig = update.config ? JSON.stringify(dashboardConfigSchema.parse(update.config)) : current.config;` and add `config = ${nextConfig}` to the UPDATE.

### Full DOC_MIGRATIONS treatment (validated + transformable over time)
`dashboards.config` is a stored JSON column, so it gets the complete pattern (same as
`slide_decks.config`), not just write-time validation. Three legs:
1. **Zod schema** — `dashboardConfigSchema` (above).
2. **Write-time validation** — `dashboardConfigSchema.parse` in `updateDashboard`/`createDashboard`.
3. **Startup data-transform** — NEW file
   `server/db/migrations/data_transforms/dashboard_config.ts` exporting
   `migrateDashboardConfigs(tx, projectId)`, modeled on
   `server/db/migrations/data_transforms/slide_deck_config.ts`:
   - `SELECT id, config FROM dashboards`; `if (!row.config) continue;`
   - `if (dashboardConfigSchema.safeParse(config).success) continue;` (skip already-current rows)
   - numbered, idempotent `// Block N:` transform blocks (none needed at v1 — file starts empty of
     blocks), then `const validated = dashboardConfigSchema.parse(config)` and
     `UPDATE dashboards SET config = ..., last_updated = ${now}`.
   - Register it in `PROJECT_DATA_TRANSFORMS` in `server/db_startup.ts` (~L98), e.g.
     `{ name: "dashboard_config", fn: migrateDashboardConfigs }`, and import the fn at top.
   - Initially a no-op (all rows carry the valid SQL default); future schema changes are made by
     adding a `// Block N:` here + updating the schema, per DOC_MIGRATIONS.
   - NB: the existing `dashboards.layout` column does NOT follow this pattern (no transform/registration) —
     a pre-existing gap; `config` is the first dashboard column done fully per the doc.

### Server route
- **`server/routes/project/dashboards.ts`** — NO change needed. The handler passes `body` straight
  through: `updateDashboard(c.var.ppk.projectDb, params.dashboard_id, body)` (L87). Adding `config?`
  to the `DashboardUpdate` type + handling it in the DB `updateDashboard` function is the whole
  server change. (Verified: only two `Dashboard` construction sites exist, both in
  `server/db/project/dashboards.ts` L133/L171 — both updated above — so `config` can be a REQUIRED
  field on the `Dashboard` type safely.)

### Client editor — `client/src/components/dashboards/dashboard_settings_modal.tsx`
- Add `initialConfig: DashboardConfig` to `Props`; thread it from the editor where the modal is
  opened (`dashboard_editor.tsx` / `dashboard_settings` invocation — pass `detail.config`).
- Add a `config` signal (use a SolidJS store/`createSignal`).
- **Logos section** — copy the slide-deck pattern from
  `client/src/components/slide_deck/slide_deck_settings.tsx` (L197–230): list `availableCustom` as
  `Select` rows populated from `instanceState.assets.filter(f => f.isImage)` via `getSelectOptions`,
  with Add/Remove. Then a single **`LogoSelector`** (reuse
  `client/src/components/slide_deck/slide_editor/LogoSelector.tsx`) bound to `config.logos.selected`
  with `customLogos = availableCustom.filter(Boolean)`, plus a size `Select` (S/M/L/XL). No
  cover/header/footer split — dashboards have one logo slot.
- **About section** — two `TextArea` inputs (note: panther export is `TextArea`, capital A):
  "Summary (shown under the title)" → `about.summary`, and "About this dashboard" → `about.body`.
  Both are markdown.
- Assets source is `instanceState.assets` from `~/state/instance/t1_store` (instance-level/shared —
  same source slide decks use; NOT projectState).
- Pass `config` through in the existing `serverActions.updateDashboard({...})` call.

### Client public viewer — `client/src/components/public_viewer/dashboard.tsx`
- Read `bundle.logos` and `bundle.about`.
- **Header bar (right side)**: the existing header (L98-111) is a plain
  `<div class="...flex items-center justify-between...">` (NOT a `HeadingBar`) holding the title on
  the left and the Download button on the right. Add the logos + About button into the right group:
  wrap the right side in a flex container with `[logos…] [About button] [Download]`. Render an
  `<img>` per `logos.selected` via a `resolveLogoUrl(logo)` helper — built-in →`/${logo}` (check
  `FASTR_LOGO_VALUES`), else custom asset →`${_SERVER_HOST}/${logo}` (confirmed against slide deck
  `loadLogos`). Height from a new small `DASHBOARD_LOGO_HEIGHT` map (e.g. sm 24 / md 32 / lg 40 /
  xl 56 px), defined locally in this file.
- **"About this dashboard" button** — shown only when `about.body.trim()`. On click open
  `openComponent` (preferred over `openAlert` so it's a real titled modal) rendering
  `<MarkdownPresentationJsx markdown={about.body} />`. `renderImage` is optional — the component
  falls back to a plain `<img>` for absolute URLs, so basic image support works without a handler.
- **Inline summary row** — when `about.summary.trim()`, render a row as the FIRST child of the
  `FrameTop` body (wrap the body in `<div class="flex h-full flex-col">`: summary row on top, then a
  `flex-1 min-h-0` wrapper around the existing layout `Switch`). Renders
  `<MarkdownPresentationJsx markdown={about.summary} />`.
- The in-editor preview path (`buildDashboardBundle` + `getDashboardDetailFromCacheOrFetch`, which
  now carries `config`) renders logos/about automatically — no extra editor preview wiring needed.

### Cross-cutting notes
- **i18n**: every new user-facing string (editor labels, "About this dashboard" button, modal title,
  section headers) must be wrapped in `t3({ en, fr })` — match the existing dashboard components.
- **Security (verified, no action)**: the public About markdown render path is XSS-safe — panther's
  markdown parser has no raw-HTML node type (drops/escapes HTML except `<br>`) and the JSX renderer
  uses SolidJS escaping with no `innerHTML`. Same renderer reports/slides already use.

### Reuse (do not rebuild)
- `LogoSelector` + `FASTR_LOGOS`/`FASTR_LOGO_VALUES` (`client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`).
- `getSelectOptions`, `Select`, `Textarea`, `Button`, `MarkdownPresentationJsx`, `openAlert` from panther.
- `instanceState.assets` for image asset picking; Uppy upload path already exists for adding assets.
- `parseJsonOrThrow`, `tryCatchDatabaseAsync` server-side.

## Verification

1. `deno task typecheck` (server + client).
2. `./validate_migrations` — NOTE this script only validates **instance** migrations
   (`MIGRATION_DIR=.../migrations/instance`), so it will NOT cover the new **project** migration
   `022_dashboard_config.sql`. Run it anyway (harmless), but actually validate 022 by booting against
   a project DB (step 3) and confirming the data-transform + new column load without error.
3. Restart server (no `--watch`) so the migration + new column load; client hot-reloads.
4. In the editor: open Dashboard settings → add a custom logo asset, select 1+ logos, set a size,
   type a Summary and an About body → save.
5. Open the public viewer: confirm logos render in the header right, the summary row appears under
   the heading, and the "About this dashboard" button opens the markdown modal. Toggle each off
   (clear fields / deselect logos) and confirm they hide.
6. Confirm an existing dashboard with no config (NULL→default) still loads (default empty config,
   nothing extra rendered).
