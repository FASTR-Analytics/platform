# Plan: Quarter ID Format Migration (YYYY0Q → YYYYQ)

## Status: Phase 1 of the period-format simplification. Do this FIRST, then
`PLAN_SELF_IDENTIFYING_PERIODS.md` (Phase 2) drops the now-redundant `periodOption`.

## Overview

Migrate `quarter_id` from **YYYY0Q** (6 digits) to **YYYYQ** (5 digits).

- **Current:** `202304` = Q4 2023 (6 digits — collides with `period_id` YYYYMM)
- **Proposed:** `20234` = Q4 2023 (5 digits — disjoint from everything)

## Rationale

Length alone identifies the type, which makes `periodOption` derivable from the
value (the whole point of Phase 2):

| Format | Shape | Digits | Range |
|--------|-------|--------|-------|
| `year` | `YYYY` | 4 | 1900–2050 |
| `quarter_id` | `YYYYQ` | 5 | 19001–20504 |
| `period_id` | `YYYYMM` | 6 | 190001–205012 |

These ranges are **disjoint**. Today `quarter_id` (`190001`–`205004`) and
`period_id` (`190001`–`205012`) overlap exactly — that overlap is the *only*
reason the `periodOption` tag exists.

## The conversion formula (this is where the old draft was wrong)

```
YYYY0Q → YYYYQ:   new = Math.floor(old / 100) * 10 + (old % 100)
```

- `202304 → floor(202304/100)*10 + 202304%100 = 2023*10 + 4 = 20234`  ✓
- **NOT** `Math.floor(old / 10)` — that yields `20230` and **drops the quarter**.

Inverse / validity: `quarter = v % 10`, `year = Math.floor(v / 10)`.

Idempotency guard: convert only when `old >= 100000` (still 6-digit). **NOT**
`> 9999` — a converted 5-digit `20234` is also `> 9999` and would be re-converted.

> Calendar-aware: Gregorian quarters are months `1-3 / 4-6 / 7-9 / 10-12`;
> Ethiopian quarters are `11-1 / 2-4 / 5-7 / 8-10` (Nov/Dec roll into the next
> year's Q1). Every place that maps months↔quarters must use `getCalendar()`.

---

## Changes (all verified against HEAD)

### 1. Validator — `lib/types/_metric_installed.ts` (delegate to panther's §3 predicates)

Don't hand-edit the quarter arithmetic — the three locals
`isValidPeriodIdNum`/`isValidQuarterIdNum`/`isValidYearNum`
([:54-68](lib/types/_metric_installed.ts#L54)) now exactly duplicate panther's new
`isPeriodId`/`isQuarterId`/`isYear` (§3). Delete the three locals **and** the
`MIN_YEAR`/`MAX_YEAR` consts, add `import { isYear, isQuarterId, isPeriodId } from
"@timroberton/panther"` (other `lib/types/*` files already import panther values),
and collapse `isValidPeriodValue` to a switch over the predicates:

```ts
case "period_id":  return isPeriodId(v);
case "quarter_id": return isQuarterId(v);
case "year":       return isYear(v);
```

This is *why* the quarter range flips to `YYYYQ` automatically — the disjoint-range
definition lives in panther alone, not triplicated across panther + lib + this doc's
table. After it, a stray old-format `202304` **fails validation**: a bounded filter
tagged `periodOption === "quarter_id"` routes it to `isQuarterId`, which rejects it
(`floor(202304/10) = 20230` is out of the year range). That is the deliberate
tripwire for any source still emitting `YYYY0Q`.

> Gating/behavior: the predicates aren't in the synced panther barrel until §3
> lands, so this couples zod validation to the panther sync — consistent with the
> mandated atomic panther+app deploy. Panther's predicates accept `number | string`
> and reject non-canonical strings; the app feeds numbers, so no behavior change.
> Phase 2 deletes these locals entirely when the `.refine` switches to
> `getPeriodTypeFromValue`.

### 2. Derived-column SQL expressions — `server/server_only_funcs_presentation_objects/period_helpers.ts`

- `getQuarterIdExpression()` ([:24-41](server/server_only_funcs_presentation_objects/period_helpers.ts#L24))
  derives `quarter_id` **from `period_id`**. It has **8 CASE arms** (4 Ethiopian,
  4 Gregorian) of the form `(period_id / 100) * 100 + N`. Change the multiplier
  `* 100` → `* 10` in **all 8**. (The `(period_id / 100)` year-extraction stays.)
- `QUARTER_ID_COLUMN_EXPRESSIONS` ([:57](server/server_only_funcs_presentation_objects/period_helpers.ts#L57))
  derives columns **from `quarter_id`**. `.year` is `(quarter_id / 100)::int` →
  `(quarter_id / 10)::int`. **Audit the whole object** for any other `/100` or
  `%100` that assumed `YYYY0Q`, and fix the `// quarter_id format: YYYYQQ` comment.
- **Do NOT touch** the `year: "(period_id / 100)::int"` at
  [:20](server/server_only_funcs_presentation_objects/period_helpers.ts#L20) — that
  derives year from `period_id` (still `YYYYMM`) and is unchanged.

### 3. Panther (external — fix in panther SOURCE, re-sync; never edit `panther/` directly) — ✅ done in source, pending sync

Implemented in panther source (`modules/…`), pending re-sync. The chart-axis
subsystem enumerates periods by calling `getPeriodIdFromTime`
(`generate_axis_primitives.ts`, `x_period/grid_lines.ts`), so fixing the encoder
propagates `YYYYQ` to the renderers. What was done (all in `_000_utils/periods.ts`
unless noted):

- **Encoder — `getPeriodIdFromTime`**, year-quarter branch: `return y * 100 + q`
  → `y * 10 + q`. The sole encoder; drives axis tick values.
- **New `decodePeriod(v, periodType)` — one numeric decoder** (`Math.floor(n/10)` /
  `n % 10` for quarters; `/100` / `%100` for months). Every period reader now routes
  through it instead of `String(v).slice(4,6)`. The slice only *coincidentally*
  worked across 5/6-digit values and silently mis-parsed off-length input; this
  removes that fragility and makes the format live in exactly one decode + one encode
  function. Readers updated: `getTimeFromPeriodId`, `formatPeriod`;
  `getSmallPeriodLabelIfAny`, `isLargePeriod`, `shouldShowYearBoundary`
  (`_007_figure_core/_axes/x_period/helpers.ts`).
  - `isLargePeriod` year-quarter is now `decodePeriod(v, "year-quarter").subPeriod
    === 1` (was the string `slice(4,6) === "01"`, which under `YYYYQ` would never
    match Q1 → year labels would silently vanish from quarterly chart axes). The
    year-month branch is the same `subPeriod === 1` (Jan), unchanged in meaning.
- **New self-identifying predicates** — `isYear` / `isQuarterId` / `isPeriodId` /
  `getPeriodTypeFromValue` (accept `number | string`; strings must be canonical
  decimal, so leading-zero/whitespace/decimal/exponent forms are rejected). These
  derive `periodType` from the value's magnitude — the disjoint-ranges property the
  format change unlocks — and are the concrete bridge Phase 2 uses to drop
  `periodOption` (call `getPeriodTypeFromValue` instead of re-deriving a range table).
  **They are only sound post-migration**: a surviving `202304` is numerically a valid
  `period_id` (Apr 2023), so they assume no `YYYY0Q` values remain.

**Second tripwire (intentional behavior change):** because the readers are now
numeric, `getTimeFromPeriodId` no longer tolerates a 6-digit quarter — `202304`
decodes to year `20230`, fails the range assert, and **throws**. That is a second
guard alongside §1's validator: a stale `YYYY0Q` value reaching panther fails loud
instead of slice-clamping to the right answer and masking an incomplete migration.
(Display readers stay lenient — out-of-range → `"?"`/`"???"` placeholder, no throw.)

**Two cross-cutting constraints:**
- **Deploy atomically** with the wb-fastr changes — a mismatch (panther `YYYYQ` vs
  app `YYYY0Q`) now *throws* on quarter parsing rather than silently coping.
- **Panther is shared across projects.** Verified the only other consumer in the
  working set (`marker`) vendors panther but does **not** exercise the `year-quarter`
  path (no quarter/`periodType` references in its app code) and stays on its pinned
  commit until explicitly re-synced — so it is unaffected. Still: version-bump panther
  and upgrade only wb-fastr, or re-confirm no other app exercises quarters before
  syncing them.

### 4. Physical `quarter_id` columns (natively-quarterly results objects)

Results objects whose CSV has a physical `quarter_id` column store it in `YYYY0Q`.
Two parts, both needed:

- **Going forward — import-normalizer (recommended; no R-script edits).** In
  `run_module_iterator.ts`, `hasQuarterId` is already computed at
  [:423](server/worker_routines/run_module/run_module_iterator.ts#L423) and the
  COPY runs in a `projectDb.begin((sql) => [...])` transaction at
  [~:444](server/worker_routines/run_module/run_module_iterator.ts#L444) that
  returns an **array** of statements. Append one conditional statement to that
  array, after the COPY/ALTER (when `hasQuarterId`, `baseColumnsToExclude` keeps
  `quarter_id`, so it is present to update):
  ```ts
  ...(hasQuarterId
    ? [sql.unsafe(
        `UPDATE ${tableName} SET quarter_id = (quarter_id/100)*10 + (quarter_id%100)
         WHERE quarter_id >= 100000`
      )]
    : [])
  ```
  Single choke point; R scripts keep emitting `YYYY0Q`; idempotent (the `>=100000`
  guard skips already-5-digit values). This replaces editing N module R scripts.
- **Existing rows — startup project data-transform (NOT a manual script).** The
  normalizer only fires on (re-)runs. `db_startup.ts`
  ([:61-73](server/db_startup.ts#L61)) already loops **every project DB** and runs
  `runProjectDataTransforms(projectId, projectDb)` — add a new transform there that
  discovers `ro_*` tables with a `quarter_id` column via
  `information_schema.columns` and runs the same guarded `UPDATE … WHERE
  quarter_id >= 100000`. Idempotent; runs automatically at boot so physical data
  and code flip together (no window where new code reads 6-digit data). Verify on a
  copy first; the per-boot `UPDATE … WHERE` re-scan is the one-time cost.

> The old "M007 already uses the correct formula" note is **misleading** — M007
> emits `YYYY0Q` (the old format). With the import-normalizer it doesn't need
> editing; without it, every module emitting a physical `quarter_id` must switch
> to `YYYYQ`.

### 5. Stored `quarter_id` values in config carriers — data transforms

New block in `transformConfigD`
([po_config.ts:118](server/db/migrations/data_transforms/po_config.ts#L118)): for
each bounded filter (`custom`/`from_month`) **with `periodOption === "quarter_id"`**
(the tag still exists in Phase 1, so targeting is unambiguous — this is *why* the
conversion must run here, before Phase 2 strips the tag), convert `min`/`max` with
the formula above (`floor(v/100)*10 + v%100`, guard `>= 100000`). Idempotent.

`transformConfigD` is the shared choke point reused by **PO configs**
([po_config.ts:299](server/db/migrations/data_transforms/po_config.ts#L299)),
**slides** ([slide_config.ts:305](server/db/migrations/data_transforms/slide_config.ts#L305)
via `transformPOConfigData`), **viz-presets**
([metric.ts:92](server/db/migrations/data_transforms/metric.ts#L92)), and
**module-def default POs**
([module_definition.ts:102](server/db/migrations/data_transforms/module_definition.ts#L102)).
One block covers all four.

**Dashboards are a separate carrier the block above does NOT reach — and this is a
boot-failure, not just a missed conversion.** Dashboards embed a full PO config
([_dashboard_config.ts:15](lib/types/_dashboard_config.ts#L15) `config:
presentationObjectConfigSchema` → `configDStrict` → the refined `periodFilterSchema`),
but [dashboard_config.ts](server/db/migrations/data_transforms/dashboard_config.ts)
has **no transform blocks** and never calls `transformConfigD`. Once §1 tightens
`isValidQuarterIdNum`, a dashboard holding a 6-digit quarter filter fails
`safeParse` → is not skipped → `dashboardConfigSchema.parse()` throws →
**boot fails with no repair path**. Add a block to `dashboard_config.ts` that walks
each embedded `.config` through `transformConfigD` (mirroring how
`slide_config.ts` handles `node.data.source.config`).

> **Baked `figureInputs` — traced across all three modalities; safe, no sweep needed.**
> Slides, dashboards (`dashboard_items`), and reports all build figure data through the
> **one** shared builder `getFigureInputsFromPresentationObject`, store it via
> `stripFigureInputsForStorage`, and **render from the baked value** (no rebuild). By
> figure type:
> - **Timeseries** bakes the **transformed** form
>   ([get_figure_inputs_from_po.ts:82](client/src/generate_visualization/get_figure_inputs_from_po.ts#L82)
>   — the sole `timeseriesData:` assignment; there is no raw-timeseries branch): periods
>   become integer **time indices**; panther skips `getTimeFromPeriodId` (`isTransformed`
>   early-return) and regenerates axis labels from indices → renders **identically**
>   pre/post-migration.
> - **Table / ChartOV / ChartOH / Map** bake the **raw** form (`jsonArray` +
>   `jsonDataConfig`) but are **category-based**: a quarter is an opaque `HeaderItem.id`
>   (match key) whose label is baked into `jsonDataConfig.labelReplacements` at build
>   time. These panther modules carry no period-axis code and never call
>   `getTimeFromPeriodId`/`formatPeriod` at render (only `_010_timeseries` imports
>   `getTimeFromPeriodId`) → the raw 6-digit id is inert, the baked label frozen-correct.
>
> The new `getTimeFromPeriodId` throw is reachable only by a **raw timeseries**, which
> the builder never emits → **structurally unreachable from any baked figure**. And the
> shared `transformFigureInputs`
> ([_figure_block.ts:116](server/db/migrations/data_transforms/_figure_block.ts#L116))
> normalizes only `isTransformed` blobs (scaleAxisLimits, headers) and **never touches
> period values** — so baked `figureInputs` need **no** quarter conversion.
>
> The quarter values that *do* live inside a figure block are in its embedded
> `source.config` snapshot — and those are already covered: every sweep
> ([reports.ts:59](server/db/migrations/data_transforms/reports.ts#L59),
> [dashboard_items.ts:51](server/db/migrations/data_transforms/dashboard_items.ts#L51),
> [slide_config.ts:127](server/db/migrations/data_transforms/slide_config.ts#L127))
> routes the block through the shared `transformFigureBlock`, which runs `source.config`
> through `transformPOConfigData` → `transformConfigD` (the §5 change). This works
> **gate-visibly**: `source.config` is the strict `presentationObjectConfigSchema`
> ([_slide_config.ts:47](lib/types/_slide_config.ts#L47)), so once §1 tightens the
> validator a stale 6-digit quarter there **fails the sweep's `safeParse`** → the row is
> not skipped → the transform fires and self-heals. (This is independent of slides'
> `figureInputs` PRE-VALIDATION force block, which only slides have — `reports`/
> `dashboard_items` carry TODOs for it — and which exists for `z.unknown()` `figureInputs`
> *shape* drift, not for quarters.) The only gap is `dashboard_config` (the embedded
> dashboard PO config above), which has no sweep at all — the boot-failure fixed by the
> §5 dashboard block. (The earlier "slice-clamp" rationale and the
> `diagnostic_figure_inputs_shapes.ts` check are now moot — the throw is structurally
> unreachable; that diagnostic script does not exist in the repo anyway.)

### 6. Client conversion / display

- `_2_filters.tsx` — **two** functions, both with quarter math:
  `periodIdToQuarterId` ([~:35-48](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L35),
  Gregorian `year*100 + ceil(m/3)` and Ethiopian branch → `year*10 + …`) **and**
  `reconcilePeriodFilterWithBounds` ([:60](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L60),
  `v*100` for year→quarter → `v*10`). Both die in Phase 2, but must be correct
  meanwhile. (The original draft listed only `periodIdToQuarterId`.)
- `build_config_from_metric.ts` `convertPeriodValue`
  ([:104-132, mults at :114/:126](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts#L104))
  — `year*100 + …` → `year*10 + …`. This is the helper used by the slide AI builders
  (`format_metric_data_for_ai.ts`, `visualization_editor.tsx`) and the AI validator
  (`content_validators.ts:188`), so fixing it here covers those call sites.
- `edit_common_properties_modal.tsx` — any quarter arithmetic.
- `normalize_po_config.ts` ([:58](lib/normalize_po_config.ts#L58)) — `singleYear`
  uses `Math.floor(min/100)===Math.floor(max/100)` for quarter as well as
  `period_id`; with 5-digit quarters this conflates adjacent years
  (`floor(20234/100)===floor(20241/100)===202`). Branch to `/10` when the format is
  quarter. (Not in the original draft.)
- `content_validators.ts` ([:103-122](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L103))
  — digit-count validation handles only 6-digit (`period_id`) and ≤4-digit (`year`);
  a 5-digit quarter currently falls through unvalidated. Add a 5-digit branch so AI
  quarter bounds are validated, not silently accepted. (Minor; not in the draft.)

### 7. AI prompt format string (server)

[modules.ts:744](server/db/project/modules.ts#L744) documents the quarter format to
the model as `quarter_id (YYYYQQ): … 202301 (Q1 2023), 202404 (Q4 2024)`. Update to
`YYYYQ` with examples `20231 (Q1 2023), 20234 (Q4 2024)`, else the model emits
6-digit quarters that `convertPeriodValue` misparses and the new validator rejects.
(Not in the original draft.)

### 8. Verified safe — no change (recorded so it isn't re-investigated)

- `get_fetch_config_from_po.ts` ([:208-234](lib/get_fetch_config_from_po.ts#L208))
  does `%100`/`/100` quarter math, but only ever on **period_id** bounds: the four
  quarter+calendar paths return early at
  [:110-118](lib/get_fetch_config_from_po.ts#L110), so `getLastFullQuarterBounds`
  never receives a quarter value.
- Label/format sites that delegate to panther `formatPeriod` (now decodes
  numerically — correct for the migrated 5-digit values; they forward whatever value
  they are given and no longer rely on slice-clamp tolerance) or use static strings:
  `get_date_label_replacements.ts`, `get_figure_inputs_from_po.ts:380`,
  `get_data_config_from_po.ts:90`, `disaggregation_labels.ts`,
  `generate_visualization/conditional_formatting.ts`. Safe **post-migration** (their
  input is 5-digit); they no longer tolerate a stray 6-digit quarter.

---

## Migration ordering & the bridge to Phase 2

0. **(pre-deploy gate)** Run the census ([diagnostic_period_filter_drift.ts](diagnostic_period_filter_drift.ts))
   across all instances and **every** config carrier (PO, slides, viz-presets,
   module-def POs, **dashboards**). §1's tightened validator is a tripwire and the
   data-transforms throw-on-parse-failure → **boot fails** on any uncovered 6-digit
   quarter value. Confirm the §5 blocks reach every row that the census flags before
   deploying.
1. **(this plan)** Convert stored quarter filter/bounds values `YYYY0Q→YYYYQ`
   **using the still-present `periodOption === "quarter_id"` tag** to find them
   (§5 `transformConfigD` block + the separate `dashboard_config.ts` block).
2. **(this plan)** Convert physical `quarter_id` columns: import-normalizer for
   re-runs + the startup project data-transform for existing rows (§4). Both run at
   boot, so physical data and code flip together.
3. Code (validators, expressions, panther, client, AI doc string) ships in the same
   atomic deploy.
4. **Only after the above** does `PLAN_SELF_IDENTIFYING_PERIODS.md` strip the tag —
   deriving `periodType` from the value via panther's `getPeriodTypeFromValue`
   (already shipped in source, §3) rather than a wb-fastr-local range table.

The hard constraint: a 6-digit quarter value can only be identified *while the
tag exists*. Convert first, drop the tag second. Never the reverse.

## Testing

1. `deno task typecheck`.
2. Conversion unit tests: `202304→20234`, `202301→20231`; re-run is a no-op
   (`>=100000` guard); `20234` (already 5-digit) untouched.
3. Natively-quarterly viz renders; derived-quarter timeseries renders;
   Ethiopian-calendar quarters correct; year labels still appear on quarterly chart
   axes (the §3 `isLargePeriod` fix).
4. Old-format `202304` now **fails** `isValidQuarterIdNum`.
5. Physical-column migration on a Nigeria-data copy: `ro_*` quarter columns become
   5-digit; idempotent re-run.
6. Panther (already verified in source): `decodePeriod` round-trips every quarter
   1900–2050; `formatPeriod`/`isLargePeriod` parity (incl. Ethiopian +8yr); a 6-digit
   quarter now **throws** in `getTimeFromPeriodId`; predicates classify
   year/quarter/period and reject malformed/old-format values.
7. **Dashboard with a quarter filter** survives boot and renders (the
   `dashboard_config.ts` block converts the embedded filter rather than throwing).
8. `singleYear` no longer hides the `year` disaggregator for a multi-year quarter
   range (`normalize_po_config.ts` `/10` fix).
9. Baked `figureInputs` (§5 caveat — closed by tracing, not just empirically): the
   builder emits only transformed timeseries, so the throw is structurally unreachable.
   Belt-and-suspenders: spot-render one baked timeseries (transformed → identical) and
   one baked ChartOV/Table with a quarter (category id inert, label baked) in an
   existing slide/dashboard/report.

## Out of scope (deliberately)

`PLAN_PERIOD_FILTER_SCHEMA.md` (the old "strictification prereq") **does not exist
and is not needed** — the filter schema is already a discriminated union with a
`.refine`. The only schema work is reworking that `.refine`, which happens in Phase 2.
