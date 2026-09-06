# PLAN: Population level inferred from the store, import preview, grid view

Status: IMPLEMENTED 2026-09-06, then revised the same day: the UI follows
the facilities and weights pages (vertical type tabs, a `TableFromCsv` with
one column per admin level then one per year); the type vocabulary is
`POPULATION_TYPES` in the lib, no table; and ruling T1 is superseded: the
population level is an explicit instance setting (`population_level`),
required before the first import and locked while rows exist. Not
deleted because §8.4 (the end-to-end level-2 generation on dev) has not
run: the dev dictionary refuses every HMIS capture, because `anc1`, `wer`
and `aaaa` depend on `measles1`, which has no raw indicator mapped to it.
The fix is dev data, not code: map any raw indicator to `measles1` (or
create a throwaway raw indicator mapped to it, run, then delete it), then
run §8.4 and delete this file.

Repos: app `/Users/timroberton/projects/apps/wb-fastr` (this repo); modules
`/Users/timroberton/projects/apps/wb-fastr-modules` (m012 only); site
`/Users/timroberton/projects/apps/wb-fastr-site` (one sentence, en + fr).

Read first: [SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md)
"Population store", [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)
"population.csv", [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md),
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md), and the panther UI protocols
for the client work. The server has no `--watch`; restart after lib/server
edits. Release order: **push the modules repo first, then deploy the app**
(§9).

---

## 1. Why

Population figures are yearly counts per admin area per population type.
Derived indicators divide by them; generation expands them into monthly
person-years for m012. Today:

1. Generation reads the store only at the HMIS `adminDepth`
   (`prepare_inputs.ts:334`) and m012 stops if the population columns
   differ from the data's (`m012/script.R:89-96`). Coarser figures are never
   used, yet the page can show them as "Complete".
2. The page shows a coverage line and the raw rows. Which areas or years
   are missing is invisible until generation fails.
3. Import validates rows and upserts blind; nothing reports what the store
   looks like afterwards.

Dev DB (the verification fixture, §8): HMIS depth 3, 8 level-2 areas, 24
level-3 areas. Store: `total_population` at level 3, 2022–2025, 18 of 24
areas, 72 rows. HMIS data 201501–202606. `anc4` and `penta1` are base
indicators; `anc1` is derived.

---

## 2. Rulings

### 2.1 Ruled by Tim (2026-09-05, revised 2026-09-06)

- **T1.** The store holds ONE admin level (2, 3 or 4) at a time. The
  population level IS the level of the stored rows; null when the store is
  empty. There is no setting. The level is detected from a file's columns at
  import, as today; a file at another level than the stored rows is refused
  while any row exists (delete all figures first).
- **T2.** The population level is the analysis level for indicator values:
  population and indicator data are both held at that level in m012's
  output, for EVERY indicator, including ones whose formula never names a
  population. Coarser levels derive by summation. Nothing exists below it.
  Modules that do not use population are untouched. Confirmed 2026-09-06
  after the cost was stated: on a level-2 instance m12-01-01 offers no
  admin_area_3/4 disaggregation or filter.
- **T3.** Grain rule at generation: the store's level when the store has
  rows, else the HMIS `adminDepth`. If the data is coarser than the
  population level, m012's script fails. One check in R, no capture-side
  pre-check.
- **T4.** Import previews before it writes. An import that leaves any
  touched type incomplete needs an explicit "import anyway"; the server
  enforces it.
- **T5.** Stale rows (areas no longer in the structure) never affect
  completeness; they are counted and shown.
- **T6.** A grid replaces both tables on the Population page: tabs per type,
  structure areas down, years across, per-type summary and delete button in
  a header line.
- **T7.** No legacy concerns. No instance has been deployed with population
  figures; dev is deleted and re-imported. No sweep, no seeding, no
  transitional state.

### 2.2 Settled

- **R0.** No migration, no config key. The level lives in the rows'
  `admin_area_level`, which T1 keeps uniform. Lowering the HMIS `adminDepth`
  below the stored level gets no guard: T3 covers it ("or the script
  fails").
- **R1.** Keep the `admin_area_level` column (it is the level's home; dropping
  it would also recreate the PK and trip the base-schema replay trap — 080
  indexes it).
- **R2.** Completeness per type, per year, over in-structure rows: complete
  iff the structure at the level is non-empty, the type has an in-structure
  row, and every year with one has one for every structure area.
  `incompleteYears` lists the shortfalls.
- **R3.** The two HMIS structure write sites also emit the population
  summary, since coverage is computed against the structure:
  `deleteFamilyFacilities` (`server/routes/instance/structure.ts:97`, only
  when `family === "hmis"`) and `structureStep4_ImportData` (`:391`). The
  HFA facility-weight routes (`:154`, `:168`) do not touch admin areas and
  are left alone.
- **R4.** Interpolation, extrapolation and the ±1 year rule are unchanged.
- **R5.** Level-derived table names use `mainDb.unsafe` with `level` typed
  as `PopulationLevel` (the closed union). `listHmisStructureAreas`
  (`population.ts:325`) currently takes `number`; retype it.
- **R6.** Client strings are `{ en, fr, pt }`; server text stays English.
- **R7.** The person-years header sets m012's grain whether or not it has
  rows, so a level-2 instance gets a level-2 M12 for every indicator (T2).
- **R8.** The grid is panther `Table` (`TableFromCsv` caps at 100 rows),
  one item per structure area, a "Gaps only" checkbox defaulting on when
  the type is incomplete, and `HeadingBar` search.
- **R9.** The import preview names the file's level. When the store is
  empty it adds one sentence: this import sets the population level, and
  indicator values (m012) will be held at that level, with nothing below
  it. That is the only place the T2 consequence is stated to the user
  before it happens.
- **R10.** `admin_areas_hmis_<L>` tables below `adminDepth` may hold rows
  (dev's level-4 table has 24 with depth 3), so "structure non-empty" is
  never a depth proxy. The import's existing `level > adminDepth` refusal is
  the only depth guard.

---

## 3. Contracts

### 3.1 `lib/types/population.ts`

Delete `PopulationRow`. Replace `PopulationCoverage`, `PopulationImportResult`
(`adminAreaLevel` → `populationLevel`), `InstancePopulationSummary`. Add:

```ts
export type PopulationLevel = 2 | 3 | 4;

export type PopulationCoverage = {
  populationType: string;
  firstYear: number | null;      // over in-structure rows; null when yearCount is 0
  lastYear: number | null;
  yearCount: number;
  areaCount: number;             // distinct in-structure areas with any row
  structureAreaCount: number;
  staleRowCount: number;
  incompleteYears: number[];
  complete: boolean;
};

export type InstancePopulationSummary = {
  populationLevel: PopulationLevel | null;    // level of the stored rows; null = empty store
  populationTypes: PopulationTypeInfo[];
  populationCoverage: PopulationCoverage[];   // [] when populationLevel is null
  populationLastUpdated: string | undefined;
};

// One grid row. Server-sorted: structure order, then stale areas by path.
export type PopulationGridArea = {
  key: string;                   // populationAreaKey; identity only, never displayed
  path: string;                  // names from level 2 to the level, " > " joined
  stale: boolean;
  cells: Record<string, number>; // String(year) → count
};
export type PopulationTypeStore = {
  populationLevel: PopulationLevel | null;
  years: number[];
  areas: PopulationGridArea[];
};

export const POPULATION_PREVIEW_MISSING_AREAS_CAP = 50;
export type PopulationYearCoverage = { year: number; areasWithFigures: number; missingCount: number; missingAreas: string[] };
export type PopulationImportPreviewType = { populationType: string; structureAreaCount: number; years: PopulationYearCoverage[]; staleRowCount: number; complete: boolean };
export type PopulationImportPreview = {
  populationLevel: PopulationLevel;   // the file's level (= the store's after import)
  populationTypes: string[]; firstYear: number; lastYear: number;
  rowsInFile: number; rowsNew: number; rowsReplaced: number;
  types: PopulationImportPreviewType[];
  complete: boolean;             // every touched type complete after the upsert
};
export type PopulationImportResult = { rowsImported: number; populationLevel: PopulationLevel; populationTypes: string[]; firstYear: number; lastYear: number };
```

`InstanceState` in `lib/types/instance_sse.ts` gains `populationLevel` with
the same name (the summary is spread into it). "Has figures" everywhere =
`populationLevel !== null`.

### 3.2 `lib/population_coverage.ts` (new, pure)

`populationAreaKey(names)` moves here from `server/db/instance/population.ts:314`,
where it is written with a literal NUL byte (the file is binary to grep).
Write the separator as `String.fromCharCode(0)`. Add
`populationDisplayPath(names, level)` and
`populationCoverage({ structureAreas: Map<key, path>, rows: {areaKey, year}[], missingAreasCap })`
returning `{ years, areaCount, staleRowCount, incompleteYears, complete }`
per R2. Export from `lib/mod.ts`; add the file to SYSTEM_05's `globs`.

### 3.3 Routes (`lib/api-routes/instance/population.ts`)

| Key | Change |
| --- | --- |
| `getPopulationRows` | delete |
| `getPopulationTypeStore` | new, `POST /population/type_store`, body `{ populationType }`, response `PopulationTypeStore`, `can_view_data` |
| `previewPopulationCsv` | new, `POST /population/import/preview`, body `{ assetFileName }`, response `PopulationImportPreview`, no notify |
| `importPopulationCsv` | body gains `confirmIncomplete: z.boolean()` |
| `deletePopulationGroup` | becomes `deletePopulationTypeFigures`, body `{ populationType }` |
| `deleteAllPopulation` | unchanged |

---

## 4. Server

No migration (R0). Base schema unchanged.

**`population.ts`**:

- `getPopulationLevel(sql)`: `SELECT DISTINCT admin_area_level FROM
  population` → 0 rows = null, 1 row = the level; more than one throws
  (T1 invariant; the import is the only writer and enforces it).
- `getPopulationTypeStore`: rows of the type at the level + structure
  areas → `PopulationGridArea[]` in structure order, stale appended. Level
  null → `{ populationLevel: null, years: [], areas: [] }`.
- `getPopulationAnchors(mainDb, type, level)`: keeps the level filter.
- `getInstancePopulationSummary`: level from `getPopulationLevel`; when
  non-null, one per-year query per R5 (`LEFT JOIN admin_areas_hmis_<L>` on
  the name columns 1..L, `WHERE admin_area_level = L`, grouped by type and
  year → in-structure and stale counts) plus the structure count and a
  distinct in-structure area count per type; `complete` per R2.
- Import splits into `parsePopulationCsv(mainDb, filePath)` (level from
  the file's columns as today; refuse `level > adminDepth`; refuse
  `level !== storedLevel` when the store has rows, one line naming the
  stored level and "delete all figures first"; the existing row checks),
  `previewPopulationImport(mainDb, rows, level)` (store ∪ file by key, file
  wins; `populationCoverage` per touched type; read-only), and
  `importPopulationCsv(mainDb, assetFileName, confirmIncomplete)` = parse →
  preview → refuse if incomplete and not confirmed → the existing upsert +
  stamp.
- `deletePopulationTypeFigures(mainDb, type)`.
- CSV export: server-local rows query; column count from the store level.

**`prepare_inputs.ts`** `writePopulationPersonYears`: `level =
(await getPopulationLevel(mainDb)) ?? adminDepth` (T3); everything else
unchanged — an empty store with a population indicator in the catalog fails
through the existing per-area coverage check, naming the page. Fix the doc
comments here (314–324) and on `runPopulationSchema`
(`lib/types/run_manifest.ts:186-191`). Manifest shape unchanged; no
transform.

**`structure.ts`** routes: R3 at the two sites.

---

## 5. m012 (modules repo)

`script.R`: read `population.csv` before step 1 (keep the `col_types`);
`geo_cols = intersect(all_geo_cols, names(population))`; stop if empty;
stop if `setdiff(geo_cols, data_geo_cols)` is non-empty ("the population
level is deeper than the data"); step 1 groups by `geo_cols`; delete the
`identical()` block; keep the `nrow > 0` guard around the bind. Fix the
header comment (grain = the population file's level; slots are assigned in
order of appearance, not "eighth slot") and the step-1b comment. Comment
edits in `_core.ts` and `_results_objects.ts`; `disaggregationGuidance` in
`_metrics/m12-01-01.ts` (en/fr/pt): "down to the instance's population
level". `deno task build`; the `definition.json` diff is that string only.

---

## 6. Client

- **T2 cache** (`t2_population.ts`): new name `instance_population_type_store`,
  value `PopulationTypeStore`, uniqueness by type, version
  `${populationLastUpdated ?? "no-population"}_${structureLastUpdated ?? "no-structure"}`.
- **T1** (`t1_store.ts`): the new `populationLevel` field.
- **Population page** (`population_manager.tsx`): right panel unchanged in
  shape (Import CSV, Delete all, Edit types); Import CSV disabled without an
  HMIS structure; Download / Delete all gated on `populationLevel !== null`;
  body = the grid when a level exists, else a "no figures; the first import
  sets the population level" message (viewer variant without the import
  hint). Delete `CoverageTable` and `RowsTable`.
- **Grid** (`_population_grid.tsx`, new): `TabsNavigation` over the types
  (string label, `badge` = id, `dot` from coverage), active tab derived by
  memo; per tab a `FrameTop` whose `HeadingBar` carries the level, the
  coverage text, search, the "Gaps only" `Checkbox`, and the delete button
  (configurers only); panther `Table` in a `h-0 flex-1` wrapper, one column
  per year, no sorting; Variant A loading with a request-id guard.
- **Import form** (`_import_form.tsx`): `step` signal select → preview →
  done; "Check file" then "Import" or "Import anyway"; the preview shows the
  file's level and, when `instanceState.populationLevel === null`, R9's
  sentence; both action errors render in the select step; failure after the
  check returns to select.
- **Indicator editor legend** (`_edit_indicator_common.tsx:116`): per type;
  incomplete text names the short years; drop the `L<level>` prefix (there
  is one level).
- **Data card** (`instance_data.tsx:543`): "has figures" on
  `populationLevel !== null`; add the level line.

---

## 7. Docs

SYSTEM_05 "Population store" (rulings T1–T7, contracts, globs); SYSTEM_08
"population.csv" (level = store level else depth; header-only sets the
grain; T2 and T3; the attach-time compatibility report is what surfaces an
authored admin_area_3 disaggregation on m012 after a level-2 import);
PROTOCOL_APP_STATE rows 106 and 253; site `admin-guide/indicators.md:38`,
en and fr ("at the instance's population level").

---

## 8. Verification

1. `deno task typecheck`; `./validate_queries` (all cases pass, engine
   untouched); modules `deno task build`.
2. Coverage harness (scratchpad, absolute imports): 18 of 24 areas × 4
   years → incomplete, 6 missing per year; +24 rows → complete; +1 stale →
   still complete, `staleRowCount 1`; +12 rows for 2026 → only 2026
   incomplete; stale-only → not complete; empty structure → not complete;
   cap 3 of 6 → 3 listed, `missingCount 6`.
3. Dev DB (localhost:7001 only): preview on the store's rows minus one
   district → incomplete naming it; on all rows → complete, `rowsNew 0`,
   `rowsReplaced 72`; the summary agrees (`populationLevel 3`, `areaCount 18`,
   `structureAreaCount 24`); `parsePopulationCsv` on a level-2 file →
   refused naming level 3.
4. End to end on dev, level 2 (`FASTR_MODULES_LOCAL_DIR` at the edited
   checkout, R installed, server restarted): export the store in import
   format; `deleteAllPopulation`; import a level-2 CSV for
   `total_population`, all 8 areas, **2016–2025** (the capture covers the
   whole extract ±1 year); create `zz_test_rate = anc4 / [population:total_population]`;
   `POST /run_generation/launch` with `gitRef: "local"` and m001, m002,
   m012; assert the package's `population.csv` header is
   `admin_area_2,period_id,population_type,person_years`, M12 has no
   `admin_area_3`, and a national and a level-2 read of `zz_test_rate`
   equal `SUM(ing1)/SUM(ing2)` by hand (slots by order of appearance).
   Clean up: delete the indicator, `deleteAllPopulation`, re-import the
   level-3 export.
5. T3: local `Rscript` on a two-file fixture with a level-3 population
   header and level-2 data (frontmatter sets `INDICATOR_INGREDIENTS <- tibble::tribble(...)`,
   since `dplyr` is not loaded yet at the marker) → non-zero exit with
   "deeper than the data"; level-2 header → zero.
Green on all five = done; delete this file.

---

## 9. Release order

1. Push `wb-fastr-modules`. Old app + new R: the header is at the data
   grain, so the new R aggregates exactly as today.
2. Deploy the app. New app + old R would, on a level-2 instance with no
   population indicator, silently produce a level-3 M12 (the old R skips
   its check on a header-only file). The exposure is a wizard opened
   before the push and launched after the deploy.
3. Existing packages are immutable and unaffected.
