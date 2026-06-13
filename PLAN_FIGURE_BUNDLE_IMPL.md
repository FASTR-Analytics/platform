# Plan — FigureBundle Implementation

> **Status: NOT STARTED** (2026-06-12). The executable plan for the vision in
> [PLAN_FIGURE_BUNDLE.md](PLAN_FIGURE_BUNDLE.md) (read it first — this assumes its
> §1–§12 vocabulary and rationale). Systems touched: **S9** (viz query), **S10**
> (figure render/export), **S12** (documents), **S2** (migration transform). This
> work *is* the visualization core's first review cycle (PLAN_SYSTEMS §5); on
> completion, port the S9/S10/S12 prose against the now-settled architecture.
>
> **Implementation conformance:** all code written under this plan follows
> `panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md` (no dynamic imports, undefined
> not null, no `any`, no silent catch, brace all `if`s, etc.) — read it before
> writing.

## Decisions locked (2026-06-12, with Tim)

1. **Scope = the architecture refactor only.** Two phases here: P1 `buildFigureInputs`
   refactor, P2 the cutover (bundle storage + backfill + delete old). Capture only the
   **free** provenance fields. **Out of scope → separate plans:** import-timestamp
   wiring + stale-badge/"Update data" UI (vision Phase 4), and the Visualization
   rename (vision Phase 5).
2. **Single boot-time cutover**, gated by a **mandatory pre-deploy dry-run** across all
   29 instances. No dual-read window: the strict `FigureBlock` schema + the in-sweep
   reverse-transform land in one deploy. (This merges the vision's Phases 2+3.)
3. **Fail-fast backfill.** A figure that fails the self-validating reverse-transform
   round-trip aborts boot (PROTOCOL_APP_MIGRATIONS-conformant). The dry-run catches
   these before prod, so no instance is surprised; no silent data loss.
4. **Locale is a captured input: capture it into the bundle, and use the bundle's locale
   for ALL rendering — every surface, never an ambient read.** Locale (`localization`) is
   frozen in the bundle exactly like `config` and `items`, and `buildFigureInputs` reads
   it only from there. (Refined with Tim 2026-06-12; supersedes vision §9 and any
   "host sets the singleton" idea.)
   - **What is captured:** the figure's locale = `{language, calendar, countryIso3}`. A
     figure renders in the **instance** locale (`instanceLanguage` — `lib/types/instance.ts`
     — + instance calendar + instance country): figures are instance-language artifacts,
     and the per-user EN/FR UI toggle is chrome-only and never enters a figure — so capture
     reads those instance values. (There is no "session locale" for a figure to capture;
     that distinction is moot, not a rule to enforce.)
   - **Render (every surface — live editor, stored figure, public, export):**
     `buildFigureInputs(bundle, deckStyle?)` resolves **all** figure text/dates from
     `bundle.localization` **explicitly** and must **never read or write** the global
     `t3`/`getCalendar` singleton. The **21 `t3({en,fr})` calls in the build path** (legend
     labels in `conditional_formatting.ts`, `"No data"`/`"to"` in `get_figure_inputs_from_po.ts`,
     area labels in `get_data_config_from_po.ts`) become explicit `bundle.localization.language`
     picks (add a tiny `pickLang(language, {en, fr})` helper). `countryIso3`
     (`withReplicant`) and `calendar` (`formatPeriod`) already take explicit args — pass
     them from `bundle.localization`, not `instanceState.countryIso3`/`getCalendar()`.
   - **Result (Tim's two requirements):** rendering a figure consults no UI setting and
     mutates none; a French-instance figure renders French even when the viewer's UI is
     English. The per-user EN/FR toggle drives **app chrome only** (menus/buttons), never
     figures.
   - **Behavior change (deliberate — a bugfix).** Today those 21 `t3` calls follow the
     session toggle, so a Senegal figure shows English legends if the author toggled
     English. After: figures are always instance-language. The **live editor preview uses
     instance language too** (WYSIWYG — preview == what is captured == what every viewer
     sees); its transient bundle's `localization.language` = `instanceLanguage`, not the
     session toggle.
   - **The render-side residual is resolved (verified 2026-06-12): no panther change
     needed.** panther draws the build's pre-resolved strings; the only thing panther
     formats itself is the **timeseries period axis**, and it reads its calendar from the
     **figure style** (`style.xPeriodAxis.calendar: CalendarType`, default `"gregorian"`),
     not a singleton. The app already sets it per-figure via `getCalendar()` in the four
     style builders (`get_style_from_po/_{1_standard,2_coverage,3_percent_change,4_disruptions}.ts`).
     panther's period formatting is calendar-only (no language). So the period axis is a
     **calendar** concern, handled by the same bundle thread as everything else — not a
     new `TimeseriesInputs` prop and not a `FigureInputs`-shape change (vision non-goal
     intact).
   - **Concrete P1 work — thread every ambient locale read from `bundle.localization`:**
     | field | ambient read today | → |
     |---|---|---|
     | language | 21 `t3({en,fr})` (get_figure_inputs_from_po, conditional_formatting, get_data_config_from_po) | `pickLang(bundle.localization.language, …)` |
     | country | `instanceState.countryIso3` (~6 `withReplicant` sites) | `bundle.localization.countryIso3` |
     | calendar (chart/table) | `getDateLabelReplacements` + `withDateRange` `getCalendar()` | `bundle.localization.calendar` |
     | calendar (timeseries axis) | 4 style builders `xPeriodAxis:{calendar:getCalendar()}` | `bundle.localization.calendar` |
   - The field the vision sketched as `renderContext` is named `localization`.

## The bundle shape (finalizes vision §6, amended by decision 4)

`lib/types/_figure_bundle.ts` (new; underscore = stored shape):

```ts
const figureBundleSchema = z.strictObject({
  config: presentationObjectConfigSchema,        // already migrated/validated
  items: z.array(z.record(z.string(), z.string())), // FROZEN queried rows (post replicant-resolution)
  resultsValue: resultsValueForVisualizationSchema, // == the EXISTING ResultsValueForVisualization type
                                                  // (lib/types/modules.ts) — {formatAs, valueProps,
                                                  // valueLabelReplacements?}. Proven sufficient (gate below).
  indicatorMetadata: z.array(indicatorMetadataSchema), // existing IndicatorMetadata type, 8 fields
  dateRange: periodBoundsSchema.optional(),       // existing PeriodBounds {min,max}: caption text + data range
  geo: geoRefSchema.optional(),                   // ONLY the baked variant stores data; {kind:'level'} in-app
                                                  // derives level from config + getGeoJsonSync (stores nothing)
  localization: z.strictObject({                  // decision 4 — REQUIRED, env is in the bundle
    language: z.enum(["en", "fr"]),
    calendar: z.enum(["gregorian", "ethiopian"]),
    countryIso3: z.string(),
  }),
  metricId: z.string(),                           // re-query pointer for "Update data" only (never render)
  snapshotAt: z.string(),
  provenance: z.strictObject({
    moduleLastRun: z.string(),                    // FREE — in ItemsHolder
    datasetsVersion: z.string(),                  // FREE — in ItemsHolder
    // instanceDataImportedAt / projectDataAddedAt — DEFERRED (out of scope, vision Phase 4)
  }),
});
export type FigureBundle = z.infer<typeof figureBundleSchema>;
```

`FigureBlock` becomes strict (this is what lets the migration skip-gate catch legacy
blocks and makes deleting the force-run safe):

```ts
const figureBlockSchema = z.strictObject({
  type: z.literal("figure"),
  bundle: figureBundleSchema.optional(),          // absent = empty placeholder
});
```

> **Investigation gate — RESOLVED 2026-06-12 (PASS, proven by the type system).**
> `getFigureInputsFromPresentationObject` already takes `resultsValue:
> ResultsValueForVisualization` (`lib/types/modules.ts`), which **is exactly**
> `{formatAs, valueProps, valueLabelReplacements?}`. Every downstream consumer — the
> four `get*JsonDataConfig` builders and `getDisaggregatorDisplayProp` — is typed to
> that same 3-field type, so the build *cannot* read a 4th metric field. The
> projection is not a new invention: **the bundle stores the existing
> `ResultsValueForVisualization` type verbatim** (author `resultsValueForVisualizationSchema`
> to match). `IndicatorMetadata` (8 fields), `PeriodBounds` (`{min,max}`), and the
> three `resultsValue` fields are all existing lib types — reuse them, don't redefine.
> Verified field-reads across the whole build: from `resultsValue` only
> `formatAs`/`valueProps`/`valueLabelReplacements`; from the ItemsHolder only
> `items`/`indicatorMetadata`/`dateRange` (all captured); ambient only
> country/calendar/language (decision 4).

---

## Phase 1 — `buildFigureInputs` refactor (ships alone, no storage change, ~zero risk)

Goal: one transform `(bundle, deckStyle?) → FigureInputs`, wired to the **live**
visualization first. Storage unchanged; delete nothing yet. Shippable and verifiable
on its own.

1. **Define the schema** — `lib/types/_figure_bundle.ts` per above (+ the strict
   `FigureBlock`, but don't yet swap the stored schemas to it — that's P2).
2. **Build the transform** — in `client/src/generate_visualization/`, create
   `buildFigureInputs(bundle, deckStyle?)` that folds in what is today three steps:
   the data transform (`getTimeseriesDataTransformed` + the `get*JsonDataConfig`
   builders), style derivation (today in `hydrateFigureInputsForRendering`), and geo
   resolution. Env comes from `bundle.localization` (not ambient). This **supersedes**
   `getFigureInputsFromPresentationObject` + `hydrateFigureInputsForRendering*` +
   `stripFigureInputsForStorage` — but keep the old functions alive in P1; only the
   live path moves.
3. **Wire the live visualization path** — `client/src/state/project/t2_presentation_objects.ts`
   (the FigureInputs memo, ~:193). The editor assembles a **transient** bundle from
   `config` + live `items` + `resultsValue` projection + the **instance** locale
   (`instanceLanguage` + instance calendar + instance country — **NOT** the per-session
   language toggle; per decision 4), then calls `buildFigureInputs`. Verify the transform
   is byte-identical to the old derivation **with the session language == the instance
   language** (the common case — isolates transform correctness); the session≠instance
   case is the deliberate behavior change from decision 4 (figures stay instance-language
   when the author has toggled their UI), not a regression.
4. **Fold in the bridge-pass resolver move** (manifest already assigns these to S10):
   `git mv client/src/components/slide_deck/slide_ai/resolve_figure_from_{visualization,metric}.ts`
   → `client/src/generate_visualization/`. Rework them to **produce a `FigureBundle`**
   (capture build inputs) rather than a stripped `FigureInputs` + `FigureSource`. Clean
   `resolve_figure_from_metric`'s AI coupling here (the `AiFigureFromMetric` input /
   `ai_tools` validator): the resolver takes plain inputs; the AI-specific adapter stays
   in S13 and calls the S10 resolver. Update importers (dashboards add-item, report
   editor, the slide flows, project_ai).

**Verify P1:** live editor renders byte-identically to today across chart/table/map/
timeseries (spot-check several real POs incl. a scorecard and an Ethiopian-calendar
instance); `deno task typecheck` green both tiers; no storage or wire-format change
(diff the DB-write paths — untouched).

---

## Phase 2 — the cutover (one deploy, dry-run gated)

Goal: the three document surfaces store `FigureBundle`; everything renders via
`buildFigureInputs`; all existing snapshots backfill at boot; old shape + scaffolding
deleted. Lands as a single deploy after the dry-run (below) is clean on every instance.

### 2a. Swap the stored schemas to the strict `FigureBlock`
- `lib/types/_slide_config.ts`, `lib/types/_dashboard_config.ts`, `lib/types/reports.ts`:
  replace the `figureInputs?`/`source?` FigureBlock with the strict `{type, bundle?}`.
- Drop `figureInputsSchema = z.unknown()` and the `FigureSource` union (delete `custom`,
  fold its fields into the bundle — vision §5).
- **Carry-forward from P1 review (finding #4) — harden the bundle's inner sub-schemas
  now that the bundle becomes the *stored* shape and the migration skip-gate validates
  against it.** In `lib/types/_figure_bundle.ts`, `periodBoundsSchema`,
  `indicatorMetadataSchema`, and `resultsValueForVisualizationSchema` are currently
  `z.object` (strip) and hand-redefined: (a) change them to `z.strictObject` — strip mode
  lets a drifted/legacy key *inside* an `indicatorMetadata` item or `resultsValue` pass
  the skip-gate (transform skipped) and then be silently dropped on read (the
  PROTOCOL_APP_MIGRATIONS skip-gate gotcha; harmless in P1 because the bundle is never
  persisted, a trap once it is); (b) tie each to its source type (`IndicatorMetadata` in
  `lib/types/indicators.ts`, `ResultsValueForVisualization` in `lib/types/modules.ts`,
  `PeriodBounds`) via `satisfies z.ZodType<…>` or by inferring the type from the schema, so
  they can't silently diverge. Also **decide** `geo`'s `data: z.unknown()` arm — the one
  remaining un-validated surface (same blind spot as the old stored `figureInputs`); accept
  + document (GeoJSON is an external stable spec, low drift risk) or validate the shape
  minimally.

### 2b. Capture-to-bundle on write
- Slides (`server/db/project/slides.ts` write path + the client capture in
  `slide_deck/`), dashboards (`dashboards.ts` + `build_dashboard_bundle.ts` +
  add-item modal), reports (`reports.ts` + report editor). Each capture assembles a
  bundle: `config` + frozen `items` (the live-queried rows at capture time) +
  `resultsValue` projection + `indicatorMetadata` + `dateRange` + `geo` +
  **`localization` = the instance locale** (`instanceLanguage` + instance calendar +
  instance country — NOT the session language toggle; decision 4), plus
  `metricId`/`snapshotAt` and `provenance` (`moduleLastRun`/`datasetsVersion`, both
  already in the ItemsHolder — read them off it).
- **Produce undefined-free JSON.** The bundle must be structured-clone/JSON-safe with
  no `undefined`-valued keys (use *absent*, not `undefined` — consistent with the
  protocol's undefined-not-null rule, where absent optional fields simply don't appear).
  This is what lets 2e delete the sentinel layer. Add a dev assertion at capture.

### 2c. Build-from-bundle on render / export / public
- `client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`, `client/src/exports/**`,
  `client/src/components/public_viewer/**` + `routes/public/dashboard.ts` +
  `buildPublicDashboardBundle` (`lib/types/dashboard.ts`): render each figure via
  `buildFigureInputs(bundle, deckStyle?)`. The public/export path now "just works" — the
  bundle carries its own `localization`; **delete** the old
  `hydrateFigureInputsForPublicRendering` special-casing.

### 2d. Boot-time backfill transform (the §10 sweep)
Rewrite `server/db/migrations/data_transforms/_figure_block.ts` as the bundle backfill,
invoked by the per-surface transforms (`slide_config.ts`, `dashboard_config.ts`,
`dashboard_items.ts`, `reports.ts`). Per figure block:
1. **Sentinel-decode first, slide/report surfaces only** — run `deepRestoreUndefined`
   (`lib/json_slide_serialize.ts`) on the stored blob *before* reshaping (the server
   blob still holds `"@@__UNDEFINED__@@"`; the decode lives only on the client receive
   path today). Gate on surface — PO/dashboard figures are not sentinel-encoded.
2. **chart/table/map → in-place** from `figureInputs.{tableData|chartData|chartOHData|mapData}.jsonArray`
   (+ `valueProps` from `jsonDataConfig`). Value-exact reshape to a bundle.
3. **timeseries → reverse-transform the stored grid → items.** Emit one row per
   non-empty cell, keyed by header `id` + period id; handle the `--v` wide-format
   convention, uncertainty `bounds`, and pre-2026 `string[]` headers (normalize headers
   first). **Self-validating:** reverse → re-run the forward transform → compare grid;
   **fail-fast** (decision 3) if it doesn't round-trip.
4. Synthesize `localization` from the instance's fixed env (calendar/country from
   instance config; language from instance default) and `provenance`/`snapshotAt` from
   the old `FigureSource` fields where present (`snapshotAt`, `moduleLastRun`/
   `datasetsVersion` if captured; else best-effort/empty — these are non-render metadata).
5. **Orphans dissolve** — timeseries figures whose metric is uninstalled convert
   exactly like any other from their stored grid (no re-query, no blank placeholders).

### 2e. Delete the old machinery (same deploy)
`stripFigureInputsForStorage` / `hydrateFigureInputsForRendering*`;
`getFigureInputsFromPresentationObject`; `transformFigureInputs` + the
`configNeedsForcedTransform`/`rawJsonNeedsForcedTransform` force-run; `FigureSource`;
the `lib/json_slide_serialize.ts` sentinel layer + its `server_actions/index.ts`
wrappers (`prepare*ForTransmit`/`restore*AfterReceive`).

### 2f. Follow-on cleanup (note, not blocking)
With the sentinel layer gone, the slides/reports route bodies that PLAN_API_ZOD batch 6
left at `z.unknown()` can be schema'd against `figureBlockSchema`. Flag for a ZOD
follow-up; not part of this deploy.

---

## The pre-deploy dry-run (decision 2 — mandatory gate)

A standalone script (repo root, e.g. `validate_figure_bundle_backfill.ts`) run against
each instance's DBs **before** the cutover deploy. It executes the §10 reshape +
round-trip in **read-only, report-only** mode:
- counts per outcome (in-place ok / timeseries round-trip ok / **round-trip FAIL** /
  already-empty), per instance;
- dumps the identity (project, surface, figure id) of every failure so they can be fixed
  or hand-converted before the real boot-time transform (which fails fast on them);
- reconciles against the 2026-06-08 sweep baseline (16,689 figures; 12,421 ts / 4,261
  raw / 7 empty / 0 missing `source.config`) — a large drift from that baseline is itself
  a signal to investigate before deploying.

Cutover deploys only when the dry-run is clean (zero round-trip failures) on all 29.

---

## Files touched (by system — for the review-cycle close)

- **S9** (lib viz/query): `lib/types/_figure_bundle.ts` (new); `resultsValue` projection;
  the `buildFigureInputs` data-transform inputs.
- **S10** (figure render/export): `generate_visualization/**` (the transform, the moved
  resolvers), `generate_slide_deck/convert_slide_to_page_inputs.ts`, `exports/**`,
  the deleted strip/hydrate.
- **S12** (documents): `_slide_config`/`_dashboard_config`/`reports` schemas, the three
  capture paths + their `db/project/*` writers, `public_viewer/**` +
  `routes/public/dashboard.ts` + `buildPublicDashboardBundle`, the deleted
  `json_slide_serialize` sentinel layer.
- **S2** (persistence): `data_transforms/_figure_block.ts` (rewritten) + the four
  per-surface transforms; the deleted force-run.
- **S13** (AI): the thin AI adapter that now calls the S10-owned `resolve_figure_from_metric`.

Custody files in the blast radius (PLAN_SYSTEMS §4.1): `t2_presentation_objects.ts`
(S9, live build path), `_figure_block.ts` (S2 owns, S10/S12 schema knowledge).

## Verification (per phase + final)

- **P1:** byte-identical live render; typecheck; no write-path diff.
- **P2 pre-deploy:** dry-run clean on all instances; `deno task typecheck`; boot a local
  instance with real seeded data → all figures backfill, boot succeeds, schema validates
  strict.
- **P2 functional:** screen/export/public parity for a deck, a report, and a dashboard
  (incl. a scorecard, a map, and an Ethiopian-calendar instance); "no figureInputs in any
  stored row" (grep the DB JSON); the undefined-free assertion never trips; PLAN_API_ZOD
  batch-6 bodies are now schemable (note only).
- **Empirical, per PROTOCOL_APP_MIGRATIONS:** run the boot transform against a copy of a
  large prod instance before the real deploy.

## Risks & rollback

- **Scale (16,689 figures × 29 instances).** Mitigated by the read-only dry-run gate and
  the first-boot-only cost (valid rows skip on subsequent boots).
- **Round-trip edge cases** (`--v` wide format, uncertainty bounds, legacy `string[]`
  headers). Mitigated by self-validation + fail-fast + the dry-run surfacing them by id.
- **Single-cutover rollback.** Code rolls back safely (data shape stays valid — it's
  forward-only per PROTOCOL_APP_MIGRATIONS); if a deploy aborts on an instance, fix the
  transform and redeploy (already-converted instances skip).
- **P1 is independently revertable** — it changes no storage and ships first, de-risking
  the transform before any data moves.

## Not in this plan (explicit)

- Import-timestamp provenance (`instanceDataImportedAt`/`projectDataAddedAt`) and the
  stale-badge + "Update data" UI — vision Phase 4, separate plan. (The bundle reserves
  room: the two fields are simply absent for now.)
- The Visualization rename — vision Phase 5, separate mechanical PR.
- The §7.1 fetch-config injection residual — separate S9 item; the membership-validation
  fix already shipped, and FigureBundle does not by itself close it (the re-query path
  still derives fetchConfig the same way). Do not conflate.
