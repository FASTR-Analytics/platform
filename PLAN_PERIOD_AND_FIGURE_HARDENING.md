# Plan: Period & Figure Hardening (quarter_id YYYY0Q → YYYYQ)

> **Authoritative.** This consolidates and supersedes
> `PLAN_QUARTER_ID_FORMAT_MIGRATION.md` (the working notes). It covers the
> period-format migration end to end — Workstreams 1–3 below. Two things are
> **deliberately out of scope** and tracked elsewhere:
> - The panther-owned `figureInputs.data` schema that lets us delete the
>   forced-transform antipattern → `timeroberton-panther/PLAN_FIGURE_DATA_SCHEMA.md`.
> - Centralising / deleting the `figureInputs` PRE-VALIDATION force blocks → falls
>   out of the panther schema work above; not a period concern.

## Why this exists

`quarter_id` is stored as **YYYY0Q** (6 digits, e.g. `202304` = Q4 2023), which
collides exactly with `period_id` **YYYYMM**. That collision is the *only* reason
the `periodOption` tag exists — it's the sole disambiguator. Moving quarters to
**YYYYQ** (5 digits, `20234`) makes the three period formats range-disjoint:

| Format | Shape | Digits | Range |
|--------|-------|--------|-------|
| `year` | `YYYY` | 4 | 1900–2050 |
| `quarter_id` | `YYYYQ` | 5 | 19001–20504 |
| `period_id` | `YYYYMM` | 6 | 190001–205012 |

Disjoint ranges make `periodType` derivable from the value alone, which is what
lets Phase 2 drop `periodOption` entirely.

## The two-phase structure (and why the order is forced)

This is **one migration in three workstreams**, and the order is not negotiable:

1. **Transform stored data 6→5** — must run *while `periodOption` still exists*,
   because that tag is the only thing that tells a 6-digit quarter from a 6-digit
   `period_id`.
2. **Robust (tag-based) validation + the code flip** — ships **atomically** with
   step 1. The tightened validator is a tripwire; the data must already be clean.
3. **Phase 2 — self-identifying validation, drop `periodOption`** — only *after*
   1–2 are deployed and the data is clean, because self-identification by magnitude
   is only sound once no 6-digit quarter survives.

> **Hard constraint:** a 6-digit quarter can only be identified while the tag
> exists. Convert first, drop the tag second. **Never the reverse.** A tightened
> validator over un-migrated data is a boot failure (strict schema + stale value →
> `parse()` throws).

## Conversion formula (canonical — earlier drafts got this wrong)

```
YYYY0Q → YYYYQ:   new = Math.floor(old / 100) * 10 + (old % 100)
202304 → 2023*10 + 4 = 20234   ✓
```

- **NOT** `Math.floor(old / 10)` — that yields `20230` and drops the quarter.
- Inverse / validity: `quarter = v % 10`, `year = Math.floor(v / 10)`.
- **Idempotency guard: convert only when `old >= 100000`** (still 6-digit). NOT
  `> 9999` — a converted 5-digit `20234` is also `> 9999` and would re-convert.
- **Calendar-aware:** Gregorian quarters map months `1-3 / 4-6 / 7-9 / 10-12`;
  Ethiopian `11-1 / 2-4 / 5-7 / 8-10` (Nov/Dec roll into next year's Q1). Anything
  mapping months↔quarters must use `getCalendar()`.

---

# Workstream 1 — Transform stored data 6→5

Every place a 6-digit quarter is persisted, converted with the formula above
(guarded `>= 100000`, idempotent), **while `periodOption === "quarter_id"` still
tags it**.

### 1a. Config carriers — `transformConfigD` block

New block in `transformConfigD`
([po_config.ts:118](server/db/migrations/data_transforms/po_config.ts#L118)): for
each bounded filter (`custom` / `from_month`) **with `periodOption === "quarter_id"`**,
convert `min`/`max`. `transformConfigD` is the shared choke point reused by:

- **PO configs** ([po_config.ts:299](server/db/migrations/data_transforms/po_config.ts#L299))
- **slides** ([slide_config.ts:305](server/db/migrations/data_transforms/slide_config.ts#L305) via `transformPOConfigData`)
- **viz-presets** ([metric.ts:92](server/db/migrations/data_transforms/metric.ts#L92))
- **module-def default POs** ([module_definition.ts:102](server/db/migrations/data_transforms/module_definition.ts#L102))

One block covers all four.

### 1b. Dashboards — separate carrier, **boot-failure risk**

Dashboards embed a full PO config
([_dashboard_config.ts:15](lib/types/_dashboard_config.ts#L15),
`config: presentationObjectConfigSchema` → `configDStrict` → the refined
`periodFilterSchema`), but
[dashboard_config.ts](server/db/migrations/data_transforms/dashboard_config.ts) has
**no transform blocks** and never calls `transformConfigD`. Once Workstream 2
tightens the validator, a dashboard holding a 6-digit quarter fails `safeParse` → is
not skipped → `dashboardConfigSchema.parse()` throws → **boot fails with no repair
path**. **Fix:** add a block to `dashboard_config.ts` that walks each embedded
`.config` through `transformConfigD` (mirror how `slide_config.ts` handles
`node.data.source.config`).

### 1c. Physical `quarter_id` columns (natively-quarterly results objects)

Results objects whose CSV has a physical `quarter_id` column store it in YYYY0Q.
Two parts, both required:

- **Going forward — import-normalizer (no R-script edits).** In
  `run_module_iterator.ts`, `hasQuarterId` is computed at
  [:423](server/worker_routines/run_module/run_module_iterator.ts#L423); the COPY
  runs in a `projectDb.begin((sql) => [...])` transaction at
  [~:444](server/worker_routines/run_module/run_module_iterator.ts#L444) that
  returns an **array** of statements. Append one conditional statement after the
  COPY/ALTER (`baseColumnsToExclude` keeps `quarter_id`, so it's present to update):
  ```ts
  ...(hasQuarterId
    ? [sql.unsafe(
        `UPDATE ${tableName} SET quarter_id = (quarter_id/100)*10 + (quarter_id%100)
         WHERE quarter_id >= 100000`
      )]
    : [])
  ```
  Single choke point; R scripts keep emitting YYYY0Q; idempotent. Replaces editing
  N module R scripts.
- **Existing rows — startup project data-transform (not a manual script).** The
  normalizer only fires on (re-)runs. `db_startup.ts`
  ([:61-73](server/db_startup.ts#L61)) already loops **every project DB** and runs
  `runProjectDataTransforms(projectId, projectDb)` — add a transform there that
  discovers `ro_*` tables with a `quarter_id` column via
  `information_schema.columns` and runs the same guarded
  `UPDATE … WHERE quarter_id >= 100000`. Idempotent; runs at boot so physical data
  and code flip together (no window where new code reads 6-digit data). Verify on a
  copy first.

> The old "M007 already uses the correct formula" note is **misleading** — M007
> emits YYYY0Q. With the import-normalizer it needs no editing.

---

# Workstream 2 — Robust validation + the code flip (ships atomically with WS1)

### 2a. Validator — delegate to panther's predicates

`lib/types/_metric_installed.ts`: the three locals
`isValidPeriodIdNum` / `isValidQuarterIdNum` / `isValidYearNum`
([:54-68](lib/types/_metric_installed.ts#L54)) now exactly duplicate panther's
`isPeriodId` / `isQuarterId` / `isYear`. **Delete the three locals and the
`MIN_YEAR`/`MAX_YEAR` consts**, `import { isYear, isQuarterId, isPeriodId } from
"@timroberton/panther"`, and collapse `isValidPeriodValue` to a switch:

```ts
case "period_id":  return isPeriodId(v);
case "quarter_id": return isQuarterId(v);
case "year":       return isYear(v);
```

This is *why* the quarter range flips to YYYYQ automatically — the disjoint-range
definition lives in panther alone, not triplicated. After it, a stray `202304`
fails validation (`floor(202304/10) = 20230` is out of year range) — the **deliberate
tripwire** for any source still emitting YYYY0Q.

> The predicates aren't in the synced panther barrel until WS2's panther sync, so
> this couples zod validation to the panther sync — consistent with the mandated
> atomic panther+app deploy. Phase 2 deletes these locals when the `.refine`
> switches to `getPeriodTypeFromValue`.

### 2b. Panther — ✅ done in source, pending re-sync

All in `_000_utils/periods.ts` unless noted. The chart-axis subsystem enumerates
periods via `getPeriodIdFromTime` (`generate_axis_primitives.ts`,
`x_period/grid_lines.ts`), so fixing the encoder propagates YYYYQ to the renderers.

- **Encoder — `getPeriodIdFromTime`** year-quarter: `y * 100 + q` → `y * 10 + q`.
- **New `decodePeriod(v, periodType)`** — one numeric decoder; all readers
  (`getTimeFromPeriodId`, `formatPeriod`, `getSmallPeriodLabelIfAny`,
  `isLargePeriod`, `shouldShowYearBoundary`) route through it instead of
  `String(v).slice(4,6)`. `isLargePeriod` year-quarter is now `subPeriod === 1`
  (was `slice(4,6) === "01"`, which under YYYYQ would never match Q1 → year labels
  vanish from quarterly axes).
- **New predicates** — `isYear` / `isQuarterId` / `isPeriodId` /
  `getPeriodTypeFromValue` (`number | string`; strings must be canonical decimal).
  Only sound post-migration.

**Second tripwire (intentional):** `getTimeFromPeriodId` no longer tolerates a
6-digit quarter — `202304` → year `20230` → throws. A stale YYYY0Q value reaching
panther fails loud instead of slice-clamping to the right answer and masking an
incomplete migration. (Display readers stay lenient — `"?"`/`"???"`, no throw.)

**Constraints:** deploy atomically with the app; panther is shared, but the only
other consumer in the working set (`marker`) vendors panther and does **not**
exercise the `year-quarter` path, and stays on its pinned commit until re-synced.

### 2c. Derived-column SQL expressions

`server/server_only_funcs_presentation_objects/period_helpers.ts`:
- `getQuarterIdExpression()` ([:24-41](server/server_only_funcs_presentation_objects/period_helpers.ts#L24))
  derives `quarter_id` from `period_id` via **8 CASE arms** `(period_id/100)*100 + N`.
  Change `* 100` → `* 10` in **all 8**. (The `(period_id/100)` year-extraction stays.)
- `QUARTER_ID_COLUMN_EXPRESSIONS` ([:57](server/server_only_funcs_presentation_objects/period_helpers.ts#L57))
  derives from `quarter_id`: `.year` `(quarter_id/100)::int` → `(quarter_id/10)::int`.
  Audit the whole object for other `/100`/`%100`; fix the `// YYYYQQ` comment.
- **Do NOT touch** `year: "(period_id / 100)::int"` at
  [:20](server/server_only_funcs_presentation_objects/period_helpers.ts#L20) — that
  derives year from `period_id` (still YYYYMM).

### 2d. Client conversion / display arithmetic

- `_2_filters.tsx` — **two** functions: `periodIdToQuarterId`
  ([~:35-48](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L35),
  Gregorian `year*100 + ceil(m/3)` + Ethiopian branch → `year*10 + …`) **and**
  `reconcilePeriodFilterWithBounds`
  ([:60](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L60),
  `v*100` → `v*10`). Both die in Phase 2 but must be correct meanwhile.
- `build_config_from_metric.ts` `convertPeriodValue`
  ([:104-132](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts#L104),
  mults at :114/:126) — `year*100` → `year*10`. Covers the slide-AI callers
  (`format_metric_data_for_ai.ts`, `visualization_editor.tsx`) and the AI validator
  (`content_validators.ts:188`).
- `edit_common_properties_modal.tsx` — any quarter arithmetic.
- `normalize_po_config.ts` ([:58](lib/normalize_po_config.ts#L58)) — `singleYear`
  uses `floor(min/100)===floor(max/100)` for quarter too; with 5-digit quarters this
  conflates adjacent years (`floor(20234/100)===floor(20241/100)===202`). Branch to
  `/10` when the format is quarter.
- `content_validators.ts` ([:103-122](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L103))
  — digit-count validation handles only 6-digit and ≤4-digit; a 5-digit quarter
  currently falls through unvalidated. Add a 5-digit branch.

### 2e. AI prompt format string

[modules.ts:744](server/db/project/modules.ts#L744) documents the format as
`quarter_id (YYYYQQ): … 202301 (Q1 2023), 202404 (Q4 2024)`. Update to `YYYYQ` with
`20231 (Q1 2023), 20234 (Q4 2024)`, else the model emits 6-digit quarters that
`convertPeriodValue` misparses and the new validator rejects.

---

# Workstream 3 — Phase 2: self-identifying periods, drop `periodOption`

Tracked in `PLAN_SELF_IDENTIFYING_PERIODS.md`. Runs **only after** WS1+WS2 are
deployed and data is clean. In brief:

- Rework the `periodFilter` `.refine` to derive `periodType` from the value via
  panther's `getPeriodTypeFromValue` (already shipped, WS2b) instead of a
  wb-fastr-local range table.
- Drop the `periodOption` tag and delete the now-dead conversion helpers
  (`periodIdToQuarterId`, `reconcilePeriodFilterWithBounds`, `convertPeriodValue`).

---

# Verified safe — no change needed (recorded so it isn't re-investigated)

### Baked `figureInputs` are NOT a period carrier

Slides, dashboards (`dashboard_items`), and reports all build figure data through
the one shared builder `getFigureInputsFromPresentationObject`, store it via
`stripFigureInputsForStorage`, and **render from the baked value** (no rebuild):

- **Timeseries** bakes the **transformed** form
  ([get_figure_inputs_from_po.ts:82](client/src/generate_visualization/get_figure_inputs_from_po.ts#L82)
  — the sole `timeseriesData:` assignment; no raw-timeseries branch): periods become
  integer **time indices**; panther skips `getTimeFromPeriodId` (`isTransformed`
  early-return) and regenerates axis labels from indices → renders **identically**.
- **Table / ChartOV / ChartOH / Map** bake the **raw** form (`jsonArray` +
  `jsonDataConfig`) but are **category-based**: a quarter is an opaque `HeaderItem.id`
  (match key) whose label is baked into `labelReplacements` at build time. These
  modules carry no period-axis code and never call `getTimeFromPeriodId`/`formatPeriod`
  at render (only `_010_timeseries` imports `getTimeFromPeriodId`) → raw id inert,
  baked label frozen-correct.

The new `getTimeFromPeriodId` throw is reachable only by a raw timeseries, which the
builder never emits → **structurally unreachable from any baked figure**. The shared
`transformFigureInputs` ([_figure_block.ts:116](server/db/migrations/data_transforms/_figure_block.ts#L116))
normalizes only `isTransformed` blobs (scaleAxisLimits, headers) and **never touches
period values**. So baked `figureInputs` need **no** quarter conversion.

The quarter values that *do* live in a figure block are in its embedded
`source.config` — already covered: every sweep
([reports.ts:59](server/db/migrations/data_transforms/reports.ts#L59),
[dashboard_items.ts:51](server/db/migrations/data_transforms/dashboard_items.ts#L51),
[slide_config.ts:127](server/db/migrations/data_transforms/slide_config.ts#L127))
routes the block through `transformFigureBlock` → `transformPOConfigData` →
`transformConfigD` (the WS1a change). This is **gate-visible**: `source.config` is
the strict `presentationObjectConfigSchema`
([_slide_config.ts:47](lib/types/_slide_config.ts#L47)), so a stale 6-digit quarter
fails the sweep's `safeParse` → the row is not skipped → the transform self-heals.
This is *independent* of slides' `figureInputs` PRE-VALIDATION force block (which
exists for `z.unknown()` shape drift, not quarters; see the panther schema plan).

### Other verified-safe sites

- `get_fetch_config_from_po.ts` ([:208-234](lib/get_fetch_config_from_po.ts#L208))
  does `%100`/`/100` quarter math but only on **period_id** bounds — the four
  quarter+calendar paths return early at [:110-118](lib/get_fetch_config_from_po.ts#L110),
  so `getLastFullQuarterBounds` never receives a quarter.
- Label/format sites delegating to panther `formatPeriod` (now numeric; correct for
  migrated 5-digit input) or using static strings:
  `get_date_label_replacements.ts`, `get_figure_inputs_from_po.ts:380`,
  `get_data_config_from_po.ts:90`, `disaggregation_labels.ts`,
  `generate_visualization/conditional_formatting.ts`. Safe **post-migration**.

---

# Deploy ordering

0. **Pre-deploy census.** Run the drift census
   ([diagnostic_period_filter_drift.ts](diagnostic_period_filter_drift.ts)) across
   all instances and **every** config carrier (PO, slides, viz-presets, module-def
   POs, **dashboards**). WS2's validator + the throw-on-parse-failure transforms mean
   any uncovered 6-digit value is a **boot failure**. Confirm the WS1 blocks reach
   every row the census flags.
1. **WS1** — convert stored quarter filter/bounds (`transformConfigD` block + the
   `dashboard_config.ts` block) and physical `quarter_id` columns (import-normalizer
   + startup transform). All run at boot, so data and code flip together.
2. **WS2** — validator + SQL expressions + panther (re-sync) + client + AI string,
   shipped in **one atomic deploy** with WS1.
3. **WS3 (Phase 2)** — only after the above is live and verified.

# Testing

1. `deno task typecheck`.
2. Conversion unit tests: `202304→20234`, `202301→20231`; re-run is a no-op
   (`>=100000` guard); `20234` untouched.
3. Natively-quarterly viz renders; derived-quarter timeseries renders;
   Ethiopian-calendar quarters correct; year labels still appear on quarterly axes
   (the WS2b `isLargePeriod` fix).
4. Old-format `202304` now **fails** `isValidQuarterIdNum`.
5. Physical-column migration on a Nigeria-data copy: `ro_*` quarter columns become
   5-digit; idempotent re-run.
6. Panther (verified in source): `decodePeriod` round-trips every quarter 1900–2050;
   `formatPeriod`/`isLargePeriod` parity (incl. Ethiopian +8yr); a 6-digit quarter
   **throws** in `getTimeFromPeriodId`; predicates classify and reject malformed input.
7. **Dashboard with a quarter filter** survives boot and renders.
8. `singleYear` no longer hides the `year` disaggregator for a multi-year quarter
   range (`normalize_po_config.ts` `/10` fix).
9. Baked `figureInputs`: spot-render one baked timeseries (transformed → identical)
   and one baked ChartOV/Table with a quarter (category id inert, label baked) in an
   existing slide/dashboard/report.

# Out of scope (tracked elsewhere)

- **Panther-owned `figureInputs.data` schema** → deletes the forced-transform
  antipattern. See `timeroberton-panther/PLAN_FIGURE_DATA_SCHEMA.md`. Not a period
  concern; the quarter migration is already gate-visible via `source.config`.
- **`PLAN_PERIOD_FILTER_SCHEMA.md`** ("strictification prereq") does not exist and is
  not needed — the filter schema is already a discriminated union with a `.refine`;
  the only schema rework happens in Phase 2 (WS3).
