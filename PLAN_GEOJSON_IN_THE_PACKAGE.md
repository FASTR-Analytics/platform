# PLAN_GEOJSON_IN_THE_PACKAGE: boundaries become part of the package

Geometry is the one generation input the results-runs build never captured.
Every map figure resolves its boundaries from the live instance tables at build
time, so re-importing a boundary file silently changes or breaks figures already
authored, a package copied to another instance renders with that instance's
boundaries or none, and a bundle frozen before the boundaries loaded freezes a
live pointer instead of data. Around that leak sit five smaller defects in the
same surface, each pinned below: a duplicate-name trap the UI hides, two copies
of an unnormalized name matcher, a serving path that serializes 20 MB twice and
cannot be cached, a dead `[INFO]` string convention users now read verbatim, and
no coverage figure anywhere a map renders. This plan fixes all six. It does not
change the admin-area key, which is a name everywhere in the system and cannot
be qualified from inside this repo (§1.3, §5).

**Next step:** `Do 1`

- **Branch:** `main`
- **Repos:** this app only.
- **Read first:** [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), then §1, §2
  and §3 of this file.
- **Start when:** no condition. Migration 076 (per-family structure) and the
  products restructure are both deployed: `products.run_id` is `NOT NULL`
  ([200_products.sql:23](server/db/migrations/instance/200_products.sql#L23))
  and `geojson_maps` is keyed `(facility_family, admin_area_level)`.

---

## §0 How to work this plan

- **Instruction:** "Do the next step of PLAN_GEOJSON_IN_THE_PACKAGE.md."
- **Branch:** `main`, confirmed with `git branch --show-current`. Never create a
  branch. The tree is shared: confirm `git status` is clean before starting and
  stage only the step's own files.
- **Repo of every step:** this app.
- **Floor** (the four commands under "The floor" in
  [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md)), green at the end of every
  step.
- **A step reads, in order:** `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file each
  step names, §2 and §3 of this plan, the step's own section in §4, and §6.
- **Last step:** 5.
- **Log:** §6.
- **Vocabulary, defined once:**
  - **the area key** - the string that joins a boundary to a value. On the
    geometry side it is `properties.area_id`, written by `processFeatures`
    ([process_geojson.ts:123-133](server/geojson/process_geojson.ts#L123-L133));
    on the data side it is `row[areaProp]`, where `areaProp` is
    `admin_area_2|3|4`
    ([get_data_config_for_map.ts:22-27](client/src/generate_visualization/get_data_config_for_map.ts#L22-L27)).
    Both are bare leaf admin-area names. The join is exact-string
    ([get_map_data.ts:62-89](panther/_010_maps/get_map_data.ts#L62-L89)).
  - **the source name** - the value of the chosen match property on an uploaded
    or DHIS2 feature (`properties.source_name` once stored). What the wizard
    maps FROM.
  - **the instance plane** - `geojson_maps` and everything that reads it for
    administration: the maps manager, the upload wizard, `t2_geojson`.
  - **the product plane** - a figure's render path, which reads a package.
  - **captured geometry** - `inputs/geojson/{family}_level_{N}.geojson.gz`
    inside a run package, written at generation from the instance plane.
  - **unavailable** - a figure that cannot render for a reason the user can act
    on (no boundaries uploaded, no values for the replicant), as opposed to a
    bug. §1.7.

---

## §1 The problem

### 1.1 Geometry never enters the package

`prepare_inputs` captures datasets, facilities, indicators, population, assets
and the calendar into `inputs/`
([prepare_inputs.ts:158-306](server/worker_routines/generate_run/prepare_inputs.ts#L158-L306)).
Geometry is absent. The render path reads it live instead: `resolveGeoJson`
returns the bundle's own `geo.data` when it has one and otherwise reads the
instance store
([build_figure_inputs.ts:491-503](client/src/generate_visualization/build_figure_inputs.ts#L491-L503)),
whose entries come from `/geojson-maps/level/:family/:level`
([t2_geojson.ts:83-110](client/src/state/instance/t2_geojson.ts#L83-L110)).

Three consequences, none of which a regeneration or a cache key can reach,
because nothing records which boundaries a figure was built from:

- An admin re-importing or editing a boundary file changes every figure that
  re-resolves, with no version bump and no staleness signal. Figure staleness
  keys on `(runId, scope definitionHash)`; boundaries are in neither.
- A package that arrives from elsewhere renders against the receiving instance's
  boundaries. Packages do travel: `manifest_cache.ts` documents a package
  arriving "by rsync, by backup restore, or copied from another instance"
  ([manifest_cache.ts:22-24](server/runs/manifest_cache.ts#L22-L24)).
- The package is not self-describing. Everything else a figure needs is in it.

### 1.2 Capture can freeze a live pointer

`makeFigureBundleFromFetchedData` is the one place a stored bundle is assembled.
When the boundaries for the map's family and level are not in the sync cache
yet, it stores `{kind:"level", level, family}` instead of the data
([resolve_figure_from_metric.ts:157-162](client/src/generate_visualization/resolve_figure_from_metric.ts#L157-L162)).
That bundle then resolves live forever after, which is 1.1 with no frozen copy
at all. One producer, one branch.

### 1.3 The area key is a bare leaf name on both sides, and this plan cannot change it

`admin_areas_{family}_3` has primary key
`(admin_area_3, admin_area_2,
admin_area_1)`
([076_structure_family_split.sql:84-90](server/db/migrations/instance/076_structure_family_split.sql#L84-L90)),
so a leaf name does not identify an area. The area key is that leaf name on both
sides of the join, so duplicate leaf names under different parents collapse to
one key and get one value.

Qualifying the geometry side alone would turn every level-3 and level-4 map
grey, and the data side cannot be qualified from inside this repo:

- The data side is package parquet written by the R modules. m004, m005 and m006
  drop `admin_area_2` from their admin3 outputs, which is why the scoped read
  has a derived-filter branch at all
  ([run_read.ts:896-930](server/run_query/run_read.ts#L896-L930)).
- [SYSTEM_08:577-584](SYSTEM_08_results_packages.md#L577-L584) already rules the
  resulting fold an accepted latent, "measured nil in prod today", whose fix is
  "stopping the m005 and m006 R scripts dropping `admin_area_2`, a modules
  lockstep this design otherwise avoids". That lockstep is its own proposed plan
  in `wb-fastr-modules` (`PLAN_ADMIN_AREA_2_ON_ADMIN3_OUTPUTS.md`, not started).
- Packages are immutable, so packages already generated can never gain the
  parent column. A qualified key would need the bare key kept alongside it for
  every existing package.
- The name-keyed model is system-wide, not a geojson detail:
  [SYSTEM_05:230-240](SYSTEM_05_facilities_indicators.md#L230-L240) states that
  `admin_areas_{hmis,hfa}_1..4` rows are names and "the name is the join key
  everywhere", which includes facilities rows, scope definitions and the
  population store.

So the key stays a name here (ruling 1), and what this plan can do about
duplicates is make them visible (1.4).

### 1.4 The duplicate-name trap is invisible in the wizard

`getAdminAreaOptionsForLevel` returns, for level 2,
`SELECT DISTINCT
admin_area_2`
([geojson_maps.ts:167-174](server/db/instance/geojson_maps.ts#L167-L174)): two
departments with the same name under different parents appear as ONE option, so
the second one's geometry cannot be mapped at all and renders as a hole. For
levels 3 and 4 the option's `label` is parent-qualified but its `value` is the
bare leaf name
([geojson_maps.ts:175-199](server/db/instance/geojson_maps.ts#L175-L199)), so
two options that read differently save the same `area_id`: the picker looks like
it distinguishes them and does not.

Nothing warns. There is no duplicate-name check in the structure import, its
summary ([structure.ts:286-291](lib/types/structure.ts#L286-L291) carries only
orphan counts), or the geojson wizard.
[SYSTEM_05:235-237](SYSTEM_05_facilities_indicators.md#L235-L237) claims "The
wizard warns but cannot fix", which is not true of the code.

### 1.5 Two copies of an unnormalized matcher

The auto-mapper is written twice in one file, once per branch: the file branch
at
[step_2.tsx:36-47](client/src/components/data/geojson/upload_wizard/step_2.tsx#L36-L47)
and the DHIS2 branch at
[step_2.tsx:133-143](client/src/components/data/geojson/upload_wizard/step_2.tsx#L133-L143).
Both match on `toLowerCase()` only, so a leading space, an NFD-composed accent
or a trailing non-breaking space leaves the area unmapped with no reason given.
The raw feature types are also declared twice
([process_geojson.ts:3-12](server/geojson/process_geojson.ts#L3-L12) and
[goal4_geojson/types.ts:6-15](server/dhis2/goal4_geojson/types.ts#L6-L15)).

### 1.6 The serving path serializes 20 MB twice and cannot be cached

`getGeoJsonForLevel` reads a `text` column
([geojson_maps.ts:32-54](server/db/instance/geojson_maps.ts#L32-L54)) and the
route returns it inside the JSON envelope
([geojson_maps.ts:217-230](server/routes/instance/geojson_maps.ts#L217-L230)),
so the whole GeoJSON string is re-escaped as a JSON string field and the client
parses the envelope and then parses the string
([t2_geojson.ts:100-104](client/src/state/instance/t2_geojson.ts#L100-L104)).
Cameroon level 3 is ~20 MB.

Nothing compresses it: there is no compression middleware in `main.ts`. Nothing
caches it either: the path is not under `/api/` and does not end in `.json`, so
no branch of `cacheMiddleware` matches and the response carries no
`Cache-Control` at all ([cache.ts:38-67](server/middleware/cache.ts#L38-L67)).

### 1.7 `[INFO]` is a dead convention and users read it

Four strings carry an `[INFO]` prefix: the map-missing throw
([build_figure_inputs.ts:339](client/src/generate_visualization/build_figure_inputs.ts#L339))
and three localized no-values strings
([t2_figure_data.ts:216-220](client/src/state/products/t2_figure_data.ts#L216-L220)).
Nothing consumes the prefix. The consumers that once stripped it
(`t2_presentation_objects`, `PresentationObjectMiniDisplay`, the dashboard
export's `prepareFigures`) went with the project layer. The throw's message is
now rendered verbatim
([report_figure_embed.tsx:97-99](client/src/components/products/_shared/report_figure_embed.tsx#L97-L99)),
so a reader sees
`[INFO] Map files not yet uploaded for the HMIS registry at
Admin Area 2`.
[SYSTEM_11:374](SYSTEM_11_viz_authoring.md#L374) documents the prefix as the
contract.

Underneath the prefix is the real defect: an expected, actionable state is
carried as a thrown `Error` with a human string, so no caller can tell it from a
bug, and the one export path that handles it does so by matching text.

### 1.8 No coverage figure anywhere a map renders

`getMapDataTransformed` builds the value maps and the feature list and returns
no tally ([get_map_data.ts:98-107](panther/_010_maps/get_map_data.ts#L98-L107)).
The save side counts matched and unmatched features; the render side counts
nothing, so a map with boundaries for 8 of 40 districts looks like a map with 32
missing values.

---

## §2 The model

1. **The package carries the geometry.** Generation writes
   `inputs/geojson/{family}_level_{N}.geojson.gz` from the instance plane and
   stamps the manifest with what it wrote: family, level, feature count, and the
   instance row's `uploaded_at`. A package generated before this exists carries
   `null`, forever.
2. **The product plane reads the package.** A product-scoped route resolves
   `products.run_id`, serves the captured file, and is immutable-cached. The
   client keys its run-geo store by `runId`, which every bundle carries as
   `provenance.runId`.
3. **A bundle never freezes a pointer.** The `{kind:"level"}` branch of bundle
   assembly goes; a bundle either carries the geometry or carries no `geo`.
4. **A package without captured geometry falls back to the instance plane**,
   which is today's behaviour, and the next regeneration heals it.
5. **The instance plane serves bytes, not an envelope**: a content-addressed URL
   per `uploaded_at`, a raw gzipped body, `private, immutable`.
6. **Unavailable is a value, not a thrown string.** `buildFigureInputs` returns
   a typed result for the states a user can act on and throws only on bugs.
7. **Duplicate leaf names are stated where they are created and where they
   bite**: the structure import's summary and the geojson wizard both name the
   colliding areas and say what the consequence is.
8. **Coverage is shown where a figure is authored**: how many data areas have a
   boundary, how many boundaries have no data.

---

## §3 Rulings

1. **The area key stays the bare leaf admin-area name.** Qualifying it is a
   change to the system-wide name-keyed admin-area model (§1.3) and is gated on
   the modules repo emitting `admin_area_2` on the admin3 and admin4 outputs. No
   step in this plan introduces a second key shape, a key-shape flag, or a
   dual-key join: there is one key and today's code is written for it.
2. **Captured geometry is a verbatim copy of the instance rows at generation
   time.** No re-keying, no normalization, no simplification on the way in. A
   package is a record of what the instance held, including its defects.
3. **The in-package copy is gzipped** (`.geojson.gz`). Cameroon level 3 is ~20
   MB plain and the no-links rule copies it into every package; gzip is 8-12x on
   GeoJSON and nothing reads it except this app's own route.
4. **The manifest's geojson stamp is nullable forever.** It is a generation-time
   fact, which [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) ("Run
   Manifest Transforms", rule 1) forbids a transform block from inventing. Step
   4 bumps `RUN_MANIFEST_SCHEMA_VERSION` and its block only stamps.
5. **The instance serving URL carries `uploaded_at` and is served
   `private, max-age=31536000, immutable`.** The client already knows
   `uploaded_at` from the map summaries before it fetches, so a boundary edit is
   a new URL rather than a revalidation of 20 MB. `private` because the payload
   is permission-gated and shared caches must not store it.
6. **The IDB cache stays.** It holds the parsed object, so it saves a 20 MB
   `JSON.parse` that an HTTP cache hit does not.
7. **Coverage is an authoring-surface fact**: the figure editor and the explore
   view. It never appears on a rendered product page or in an export, which
   would change what a deck or report shows.
8. **A map with zero matched areas is unavailable; any other coverage renders.**
   The count is shown, and shown prominently below 70%. Mid-rollout partial
   coverage is legitimate.
9. **Unavailability is typed at the source and localized at the display.**
   `buildFigureInputs` returns a reason, not a sentence; the component that
   shows it writes the words. The three `t2_figure_data` strings are already
   localized display strings and only lose the dead prefix.
10. **Nothing ships.** No step runs `./deploy_testing` or `./deploy`.
11. _(proposed)_ **The duplicate-name warning is informational, not blocking.**
    An import that creates duplicate leaf names still commits: the names come
    from the facility file and refusing them would block the import of a real
    country. The wizard's warning likewise does not prevent a save.

---

## §4 Steps

### Step 1 - unavailable is a typed result, and `[INFO]` is gone

**Reads:**
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md),
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

**Surface.** `client/src/generate_visualization/build_figure_inputs.ts`,
`client/src/generate_visualization/mod.ts`,
`client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`,
`client/src/state/products/t2_figure_data.ts`,
`client/src/generate_report/report_figure_raster.ts`,
`client/src/exports/export_report_as_html.ts`,
`client/src/components/products/_shared/report_figure_embed.tsx`,
`client/src/components/explore/data_table/data_table.tsx`,
`client/src/components/_shared/figure_preview.ts`,
`client/src/components/_shared/figure_editor/figure_editor.tsx`,
`lib/types/_figure_bundle.ts`,
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md).

**Deliverable.**

- A `FigureUnavailable` discriminated union in `lib/types/_figure_bundle.ts`
  beside the bundle it describes, with the one state that exists today:
  `{ kind: "no_boundaries", family: FacilityFamily, level: number }`. Reasons
  carry data, never a sentence.
- `buildFigureInputs` returns
  `{ ok: true; inputs: FigureInputs } | { ok: false; unavailable: FigureUnavailable }`.
  The map branch returns the `no_boundaries` reason instead of throwing. Every
  other throw in the function stays a throw: those are bugs.
- All nine call sites handle the result. The three that display a message
  (`report_figure_embed.tsx`, `figure_preview.ts`, `figure_editor.tsx`) render a
  localized line from the reason, in the three languages the repo uses, with the
  registry and level interpolated. `report_figure_raster.ts` and
  `export_report_as_html.ts` degrade on `ok: false` explicitly rather than by
  catching a string.
- The `[INFO]` prefix is deleted from the three `t2_figure_data.ts` strings.
  Nothing keys off the prefix, so this is the whole change there.
- No string in the repo matches `[INFO]`.
- SYSTEM_10 states the typed result as the render path's contract. SYSTEM_11's
  paragraph on the preview's error state is rewritten to the typed reason; the
  `[INFO] Map files not yet uploaded` sentence goes.

**Not in this step.** Coverage (step 5), which adds a second thing the render
path reports and belongs after the source of truth moves in step 4. The
`no_values_for_replicant` state, which reaches the UI through the generic cache
envelope and not through `buildFigureInputs`.

**Gates.** The floor. No test: every file but `lib/types/_figure_bundle.ts` is a
client file, and `deno task test` runs `server/tests/` and
`report-forge/tests/`, which cannot import the `~` alias.

**Ends with** one commit.

### Step 2 - one normalizing matcher, and duplicates are visible

**Reads:**
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md),
[SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md).

**Surface.** `lib/geojson_area_match.ts` (new), `lib/mod.ts`,
`server/geojson/types.ts` (new), `server/geojson/process_geojson.ts`,
`server/dhis2/goal4_geojson/types.ts`, `server/db/instance/geojson_maps.ts`,
`server/routes/instance/structure.ts`, `lib/types/geojson_maps.ts`,
`lib/types/structure.ts`, `lib/api-routes/instance/geojson_maps.ts`,
`client/src/components/data/geojson/upload_wizard/step_2.tsx`,
`client/src/components/data/geojson/upload_wizard/step_3.tsx`,
`client/src/components/data/geojson/upload_wizard/wizard.tsx`,
`server/tests/geojson_area_match_test.ts` (new),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md).

**Deliverable.**

- `lib/geojson_area_match.ts` exports `normalizeAreaName` (NFC, trim, collapse
  internal whitespace including non-breaking space, case-fold, strip combining
  marks) and `autoMapAreaNames(sourceNames, adminAreaNames)` returning the
  mapping plus the source names it could not place. It lives in `lib/` because
  the save path and the wizard must normalize identically.
- Both branches of `step_2.tsx` call `autoMapAreaNames`. The two inline loops
  are gone.
- The raw parsed feature types are declared once, in `server/geojson/types.ts`;
  `process_geojson.ts` and `server/dhis2/goal4_geojson/types.ts` import them.
  The dhis2 module depends on the geojson module, not the reverse.
- `getAdminAreaOptionsForLevel` returns, alongside the options, the duplicate
  groups for that family and level: each repeated leaf name with the parent
  paths that carry it. Level 2 stops using `SELECT DISTINCT`, so a name shared
  by two level-1 parents is reported rather than silently folded; the options
  themselves stay one per distinct name, because the area key cannot distinguish
  them (ruling 1).
- The wizard shows those groups above the mapping table: the names, their
  parents, and the consequence stated plainly, that one boundary and one value
  are all these areas can have until they are renamed.
- The structure import summary carries the same duplicate count per level, and
  step 4 of the structure wizard shows it.
- SYSTEM_05's "The wizard warns but cannot fix" becomes a description of what
  the code now does, and names where the warning is raised.

**Not in this step.** Qualifying the area key (ruling 1). Persisting the DHIS2
UID (§5). Changing what a save stores: `processFeatures` still writes the
mapping it is handed.

**Gates.** The floor, plus `server/tests/geojson_area_match_test.ts`: the
normalizer's cases (NFD accent, non-breaking space, mixed case, Turkish dotless
i left unmatched rather than mismatched), and a duplicate-group read against
seeded `admin_areas_hmis_2` and `admin_areas_hmis_3` rows, which must fail
before the read exists.

**Ends with** two commits: the shared matcher and the type unification, then the
duplicate-name surfacing.

### Step 3 - the instance plane serves bytes

**Reads:** [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md),
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

**Surface.** `lib/api-routes/instance/geojson_maps.ts`,
`server/routes/instance/geojson_maps.ts`, `server/db/instance/geojson_maps.ts`,
`client/src/state/instance/t2_geojson.ts`,
`client/src/generate_report/_report_export_maps.ts`,
`server/tests/geojson_serving_test.ts` (new),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md).

**Deliverable.**

- `/geojson-maps/level/:family/:level/:uploaded_at` returns the stored text as
  the response body, `Content-Type: application/geo+json`,
  `Cache-Control: private, max-age=31536000, immutable`, and
  `Content-Encoding: gzip` when the request accepts it, compressed from the
  stored text in the handler. A request whose `:uploaded_at` does not match the
  row's is a 404, not a redirect: the client always has the current value.
- The envelope route is gone, not kept alongside. `t2_geojson.loadMap` fetches
  the new URL directly, with the transport's credentials, and parses once.
  `_report_export_maps.ts` follows the same URL shape.
- The database read for the serving path returns the text and `uploaded_at`
  without building an envelope around a 20 MB string.
- SYSTEM_01 records the raw-body route as an exception to the envelope contract
  and why. SYSTEM_05 records the content-addressed URL and that the IDB cache
  stays for the parse (ruling 6).

**Not in this step.** Storing the column gzipped, which changes the column type
and needs a migration. Off-main-thread parsing and polygon simplification (§5).
The product-scoped route, which is step 4.

**Gates.** The floor, plus `server/tests/geojson_serving_test.ts`: a seeded
`geojson_maps` row served at its `uploaded_at` returns the exact stored bytes,
the immutable header and, with `Accept-Encoding: gzip`, a gzipped body that
inflates to those bytes; a stale `uploaded_at` 404s.

**Ends with** one commit.

### Step 4 - the package carries the geometry

**Reads:** [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md),
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

**Surface.** `lib/types/run_manifest.ts`,
`server/worker_routines/generate_run/prepare_inputs.ts`,
`server/runs/build_run_package.ts`, `server/runs/manifest_transform.ts`,
`server/runs/run_paths.ts`, `lib/types/run_authoring_context.ts`,
`server/run_query/authoring_context.ts`, `lib/api-routes/products/products.ts`,
`server/routes/products/products.ts`,
`client/src/state/instance/t2_run_authoring_context.ts`,
`client/src/state/products/t2_run_geojson.ts` (new),
`client/src/generate_visualization/build_figure_inputs.ts`,
`client/src/generate_visualization/resolve_figure_from_metric.ts`,
`lib/types/_figure_bundle.ts`, `server/tests/run_manifest_transform_test.ts`,
`server/tests/geojson_capture_test.ts` (new),
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md),
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md).

**Deliverable.**

- `prepare_inputs` writes one `inputs/geojson/{family}_level_{N}.geojson.gz` per
  `geojson_maps` row, gzipped from the stored text, and records each in
  `extraInputFiles`.
- `RUN_MANIFEST_SCHEMA_VERSION` is 15 and the manifest carries
  `geojsonMaps: { family, adminAreaLevel, featureCount, uploadedAt }[] | null`:
  a list for a package generated with capture, `null` for every earlier package
  (ruling 4). A transform block appended at the end of `manifest_transform.ts`
  stamps 15 and carries the field forward as `null`, checking its own
  precondition and idempotent.
- The capture does not disturb module memoization: reuse keys hash each module's
  own declared sources
  ([resolve_reuse.ts:150-209](server/worker_routines/generate_run/resolve_reuse.ts#L150-L209)),
  and a geojson file is nobody's declared source. The step asserts this in its
  test rather than claiming it.
- `GET /products/:product_id/geojson/:family/:level` resolves `products.run_id`,
  streams the captured file with `Content-Encoding: gzip`,
  `Content-Type: application/geo+json` and
  `Cache-Control: private, max-age=31536000, immutable`, and 404s when the
  package has no such file. `access: "view"`, like every other product route, so
  package geometry follows the package's own access rule.
- `RunAuthoringContext` carries the manifest's `geojsonMaps` stamp verbatim, and
  the client cache name bumps to `run_authoring_context_v5`, which that file's
  own comment requires on a shape change.
- A run-geo store keyed `(runId, family, level)` preloads from that stamp when a
  product's authoring context loads, and mirrors `t2_geojson`'s shape: memory
  plus IDB, a version signal so a tracked read re-runs when the data lands.
- `resolveGeoJson` reads the run-geo store with `bundle.provenance.runId`, which
  every bundle carries, and falls back to the instance store when the package's
  stamp is `null`. The fallback is the documented behaviour for pre-capture
  packages, not a transitional state.
- `makeFigureBundleFromFetchedData` loses the `{kind:"level"}` branch: a bundle
  carries `geo.data` or no `geo`. `geoRefSchema` keeps the `level` variant,
  because bundles already stored carry it and a stored bundle is never
  rewritten.
- SYSTEM_08 records the new input files, the v15 stamp and its block, and the
  product-scoped serving route. SYSTEM_10 records that the product plane reads
  the package and the instance plane is the fallback. SYSTEM_01 records the new
  route.

**Not in this step.** Re-capturing geometry into stored bundles, which no step
does (ruling 1 and §5). Deleting the `level` variant from `geoRefSchema`.
Coverage, which is step 5.

**Gates.** The floor, plus `server/tests/geojson_capture_test.ts`: a generation
over seeded `geojson_maps` rows writes one gzipped file per row whose inflated
bytes equal the stored text, stamps the manifest, and leaves every module's
`inputKey` unchanged from a run without the rows. Plus
`server/tests/run_manifest_transform_test.ts` extended: a v14 manifest
transforms to v15 with `geojsonMaps: null`, and the block is idempotent.

**Ends with** three commits: capture plus the manifest version, the serving
route plus the authoring-context stamp, then the client repoint and the deletion
of the freeze branch.

### Step 5 - coverage where a figure is authored

**Reads:**
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md).

**Surface.** `client/src/generate_visualization/build_figure_inputs.ts`,
`client/src/generate_visualization/map_coverage.ts` (new),
`client/src/components/_shared/figure_editor/figure_editor.tsx`,
`client/src/components/explore/figure_view.tsx`,
`client/src/generate_visualization/mod.ts`,
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md).

**Deliverable.**

- `map_coverage.ts` computes, from the transformed map data, how many distinct
  data areas have a matching boundary, how many boundaries carry no value, and
  the matched share. It reads panther's output and adds no panther edit.
- A map with zero matched areas returns the `no_boundaries`-style unavailable
  result rather than rendering an empty country; every other share renders
  (ruling 8). The reason union gains
  `{ kind: "no_area_matches", dataAreas,
  boundaries }`.
- The figure editor and the explore view show the counts under the figure, and
  below 70% matched the line is prominent.
- Nothing in a rendered product page, an export or a raster path shows the
  counts (ruling 7).
- SYSTEM_10 records where coverage is computed and SYSTEM_11 records where it is
  shown and the 70% threshold.

**Not in this step.** A panther counter in `_010_maps`. Any blocking behaviour
other than zero matches.

**Gates.** The floor. No test, for the reason step 1 gives: these are client
files.

**Ends with** one commit, and the close commit deletes this file.

---

## §5 Out of scope

- **A qualified area key**, and with it the Haiti and Cameroun duplicate-name
  class. §1.3 and ruling 1: it is a change to the system-wide name-keyed admin
  model and is gated on `wb-fastr-modules` emitting `admin_area_2` on the admin3
  and admin4 outputs. Step 2 makes the collisions visible instead.
- **Persisting the chosen DHIS2 UID.** The wizard shows UID and parent to
  disambiguate same-named org units
  ([step_3.tsx:160-170](client/src/components/data/geojson/upload_wizard/step_3.tsx#L160-L170))
  and the save sends a mapping keyed by source name
  ([step_4.tsx:52-91](client/src/components/data/geojson/upload_wizard/step_4.tsx#L52-L91)),
  so both duplicates get one `area_id`. Persisting the UID would let the user
  map them separately and both would still store the same `area_id` and receive
  the same value, because the area key is a name. It delivers nothing until the
  key changes, and belongs to that work.
- **Rewriting stored bundles.** A frozen bundle carries its items and its
  geometry together and renders consistently; there is nothing to re-key (ruling
  1). Reaching them would mean a transform over `slides.config`,
  `reports.figures`, `report_versions.figures`, `slide_deck_versions.slides` and
  two Yjs `crdt_state` documents, where `geo` sits inside the opaque `figData`
  half ([slide_crdt.ts:64-68](lib/collab/slide_crdt.ts#L64-L68)), plus a
  `content_hash` recompute on both version tables.
- **Storing `geojson_maps.geojson` compressed**, which changes the column type.
- **Off-main-thread parsing, polygon simplification, the AA4 background worker
  with SSE progress, and `step_3` row virtualization** (measured: DRC 10,325
  level-4 areas, Cameroon 2,219).
- **An audit row on boundary save, remap and delete, and a delete warning
  listing dependent figures.**
- **A panther coverage counter.** Step 5 computes app-side; panther is not
  edited and not resynced by this plan.

---

## §6 Log

Departures, one line each, written when they happen.
