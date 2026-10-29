# PLAN_GEOJSON_IN_THE_PACKAGE: boundaries become part of the package

Geometry is the one generation input the results-runs build never captured, so a
stored figure has only two ways to hold it and both are wrong. Cache-warm, it
embeds a verbatim copy of the instance's whole boundary file, 10,009,310 bytes
for this dev instance's admin-area-3 map, into `reports.figures` and into the
slide CRDT every collaborator syncs. Cache-cold, it stores a pointer into the
live instance tables, which re-resolves forever after, so re-importing a
boundary file changes those figures with no version bump and a package copied to
another instance renders with the receiving instance's boundaries or none.
Around that leak sit five smaller defects in the same surface, each pinned
below: a duplicate-name trap the UI hides, two copies of an unnormalized name
matcher, a serving path that serializes 20 MB twice and cannot be cached, a dead
`[INFO]` string convention users now read verbatim, and no coverage figure
anywhere a map renders. This plan fixes all six by putting the geometry in the
package and having a bundle name it there instead of carrying it or pointing
live. It does not change the admin-area key, which is a name everywhere in the
system and cannot be qualified from inside this repo (§1.3, §5).

**Next step:** `Do 4`

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
- **A new file is claimed in the same step.** `lint:systems` fails until the new
  file appears in exactly one SYSTEM file's `globs` manifest, and the manifests
  list `lib/`, `client/src/state/` and `server/tests/` files one by one rather
  than by wildcard. Seven files are new across this plan, each with its owner:
  `lib/geojson_area_match.ts`, `server/geojson/types.ts` and
  `server/tests/geojson_area_match_test.ts` in SYSTEM_05 (step 2);
  `server/tests/geojson_serving_test.ts` in SYSTEM_05 (step 3);
  `client/src/state/instance/t2_run_geojson.ts` in SYSTEM_09, beside the
  run-keyed cache it mirrors, `t2_run_authoring_context.ts`, and
  `server/tests/geojson_capture_test.ts` in SYSTEM_08 (step 4);
  `client/src/generate_visualization/map_coverage.ts` in SYSTEM_10 (step 5).
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

`prepare_inputs` captures datasets, facilities, indicators and population into
`inputs/`
([prepare_inputs.ts:140-308](server/worker_routines/generate_run/prepare_inputs.ts#L140-L308)),
and the package builder pins the declared assets beside them
([build_run_package.ts:184-228](server/runs/build_run_package.ts#L184-L228)).
Geometry is absent. The render path reads it live instead: `resolveGeoJson`
returns the bundle's own `geo.data` when it has one and otherwise reads the
instance store
([build_figure_inputs.ts:491-503](client/src/generate_visualization/build_figure_inputs.ts#L491-L503)),
whose entries come from `/geojson-maps/level/:family/:level`
([t2_geojson.ts:83-110](client/src/state/instance/t2_geojson.ts#L83-L110)).

The package is therefore not self-describing: everything else a figure needs is
in it. What the render path does instead is 1.2.

### 1.2 A bundle holds geometry two ways, and both are wrong

`makeFigureBundleFromFetchedData` is the one place a stored bundle is assembled,
and it has one branch
([resolve_figure_from_metric.ts:168-172](client/src/generate_visualization/resolve_figure_from_metric.ts#L168-L172)):

- **Cache-warm it writes `{kind:"data", data}`**, the instance's whole boundary
  file copied into the bundle. Measured on the dev instance: `geojson_maps`
  holds 235,283 bytes at admin area 2 and 10,009,310 bytes at admin area 3, per
  family. A bundle is stored verbatim, with no pruning, into `reports.figures`
  ([reports.ts:156-163](server/db/products/reports.ts#L156-L163)) and into the
  slide CRDT's opaque `figData` half, which is the bundle minus `config`
  ([slide_crdt.ts:74-80](lib/collab/slide_crdt.ts#L74-L80)), so one admin-area-3
  map figure puts ten megabytes in a Postgres text column, in every version row
  that snapshots it, and in the Yjs document every collaborator syncs. `geo` is
  the one field the constructor does not even deep-copy, for exactly this reason
  ([SYSTEM_10:344-347](SYSTEM_10_figure_render_export.md#L344-L347)).
- **Cache-cold it writes `{kind:"level", level, family}`**, no geometry at all.
  That bundle re-resolves from the live instance store on every render
  ([build_figure_inputs.ts:491-503](client/src/generate_visualization/build_figure_inputs.ts#L491-L503))
  forever after. The window is real: `preloadGeoJson` runs on SSE connect
  ([t1_sse.tsx:197](client/src/state/instance/t1_sse.tsx#L197)) and a
  ten-megabyte file does not land instantly.

Neither shape records which boundaries the figure was built from, so no
regeneration and no cache key can reach what follows. Two of these are the
cache-cold shape's:

- An admin re-importing or editing a boundary file changes every `level` figure,
  with no version bump and no staleness signal. Figure staleness keys on
  `(runId, scope definitionHash)`; boundaries are in neither.
- A package that arrives from elsewhere renders its `level` figures against the
  receiving instance's boundaries. Packages do travel: `manifest_cache.ts`
  documents a package arriving "by rsync, by backup restore, or copied from
  another instance"
  ([manifest_cache.ts:22-24](server/runs/manifest_cache.ts#L22-L24)).

And one is the cache-warm shape's, which freezing does not cure:

- Two figures on one package disagree. A `data` figure authored before a
  boundary re-import holds the old geometry and one authored after holds the
  new, and a deck shows both side by side with nothing saying why.

Neither shape names the package. Capturing the geometry into the run directory
(§2.1) makes a third shape available that is wrong in neither way, because a
ready run directory never changes: a bundle that names `(family, level)` and
resolves against its own `provenance.runId` is frozen without carrying ten
megabytes. That is the shape this plan moves to, and it is why step 4 deletes
the `data` branch rather than the `level` branch (ruling 12).

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
- [SYSTEM_08:581-590](SYSTEM_08_results_packages.md#L581-L590) already rules the
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

Nothing warns at level 2, and nothing warns at import. The wizard's save step
counts repeated option values and lists them
([step_4.tsx:39-48](client/src/components/data/geojson/upload_wizard/step_4.tsx#L39-L48)),
which catches levels 3 and 4, but at level 2 `SELECT DISTINCT` has already
folded the duplicates into one option, and the warning comes after the mapping
it concerns. There is no duplicate-name check in the structure import or its
summary ([structure.ts:286-291](lib/types/structure.ts#L286-L291) carries only
orphan counts).
[SYSTEM_05:235-237](SYSTEM_05_facilities_indicators.md#L235-L237) claims "The
wizard warns but cannot fix", which is true only at levels 3 and 4.

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
([t2_geojson.ts:100-105](client/src/state/instance/t2_geojson.ts#L100-L105)).
Cameroon level 3 is ~20 MB.

Nothing compresses it: there is no compression middleware in `main.ts`. Nothing
caches it either: `cacheMiddleware` is registered after every registry router
([main.ts:220](main.ts#L220) against [:163](main.ts#L163)), so a registry
handler's response ends the chain before the middleware runs, and the response
carries no `Cache-Control` at all.

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
bug. Nothing in the repo matches the prefix, so no caller tries: every call site
either catches the exception and degrades
([report_figure_raster.ts:173-175](client/src/generate_report/report_figure_raster.ts#L173-L175),
[:285](client/src/generate_report/report_figure_raster.ts#L285),
[convert_slide_to_page_inputs.ts:570](client/src/generate_slide_deck/convert_slide_to_page_inputs.ts#L570)),
or catches it and shows `e.message` verbatim
([figure_preview.ts:65-71](client/src/components/_shared/figure_preview.ts#L65-L71),
[figure_editor.tsx:1076-1082](client/src/components/_shared/figure_editor/figure_editor.tsx#L1076-L1082)),
or does not catch at all
([export_report_as_html.ts:50](client/src/exports/export_report_as_html.ts#L50)).
A string is the whole contract.

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
2. **The product plane reads the package by run.** Two run-keyed routes beside
   the other package reads serve the manifest's geojson stamp and the captured
   file, the file immutable-cached. The client keys its run-geo store by
   `runId`, which every bundle carries as `provenance.runId`, so a figure
   reaches its own package whether or not that package is still its product's.
3. **A bundle names its geometry, it does not carry it.** The `{kind:"data"}`
   branch of bundle assembly goes; a new bundle stores
   `{kind:"level", level,
   family}` and resolves it against its own
   `provenance.runId`. That is not the live pointer of 1.2, because a ready run
   directory never changes. Bundles already stored keep whatever they hold and
   are never rewritten (§5), so the ten-megabyte copies drain only as their
   figures are re-resolved.
4. **Resolution asks the run-geo store, which answers in four states**, and the
   fallback is conditional on the answer, never unconditional: an unconditional
   instance read would render the instance's boundaries during the window before
   the package's arrive, which is the live pointer again, silently and for a
   frame. The store fetches a run's stamp itself, keyed by `runId`, the first
   time anything asks about that run, so no state depends on which page asked or
   on whether a product's authoring context has landed. Keyed by the bundle's
   own `provenance.runId`:
   - **ready** - the data is in the store. Render it.
   - **loading** - the run's stamp is in flight, or it lists `(family, level)`
     and the bytes are in flight. Unavailable for now; the version signal
     re-runs the read when either lands, exactly as `getGeoJsonSync` does today.
     Every transition from here is forward: a figure never draws one plane and
     then the other.
   - **not in this package** - the run's stamp is loaded and does not list
     `(family, level)`. The geometry was not there at generation; the action is
     to regenerate, not to upload (§2.6, ruling 14).
   - **run unknown** - the stamp read has completed and found nothing to resolve
     against: the manifest's stamp is `null`, because the package predates
     capture, or the read fails, because the run is gone. A stale bundle's run
     can be gone: `isFigureBundleStale` compares `provenance.runId` against the
     container's, reattach never blocks
     ([products.ts:69-78](lib/api-routes/products/products.ts#L69-L78)), and
     `deleteRun` refuses a run only while it is generating, pinned, or a product
     points at it
     ([run_generation.ts:121-123](server/db/instance/run_generation.ts#L121-L123)).
     Read the instance plane, which is today's behaviour for a `level` bundle,
     and the next regeneration or re-resolve heals it.

   The store owns this because it holds both the stamps it fetched and the data.
   `buildFigureInputs` cannot answer it: it takes a bundle, a deck style and a
   palette, and never the container's scope, so a rule phrased as "is this the
   product's current run" would have to be plumbed through ten call sites to say
   what the store already knows.
5. **The instance plane serves bytes, not an envelope**: a content-addressed URL
   per `uploaded_at`, a raw gzipped body, `private, immutable`.
6. **Unavailable is a value, not a thrown string, and it names the plane it
   asked.** `buildFigureInputs` returns a typed result for the states a user can
   act on and throws only on bugs. A missing boundary is one of two different
   facts with two different actions: the instance has no file for this registry
   and level (upload one), or the package was generated without it (regenerate),
   and after §2.4 the second can be true while the instance holds a file
   uploaded since. The reason carries which, so the display can say which.
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
   `buildFigureInputs` returns a reason, not a sentence; the display path that
   shows it, a component or the preview helper, writes the words. The three
   `t2_figure_data` strings are already localized display strings and only lose
   the dead prefix.
10. **Nothing ships.** No step runs `./deploy_testing` or `./deploy`.
11. _(proposed)_ **The duplicate-name warning is informational, not blocking.**
    An import that creates duplicate leaf names still commits: the names come
    from the facility file and refusing them would block the import of a real
    country. The wizard's warning likewise does not prevent a save.
12. **A new bundle names the geometry; `{kind:"data"}` is what goes.** The
    reverse (keeping `data`, deleting `level`) would leave the ten-megabyte
    per-figure copies of 1.2 in place and make the capture dead weight for every
    figure authored on the authoring instance. Deleting `data` instead costs
    this: a new bundle is no longer readable outside this app, and a map figure
    needs the run-geo store populated to render, which is the same condition
    `getGeoJsonSync` already imposes on a `level` bundle today, with the same
    version-signal re-render behind it. A stale map figure, one whose
    `provenance.runId` is not its product's current run, draws its own package's
    boundaries for as long as that package exists, because the store and the
    routes are keyed by run and not by product (§2.2); only once the run is
    deleted does it draw the instance's current boundaries until it is
    re-resolved (§2.4, "run unknown"), where a stale `data` bundle today draws
    its own frozen copy. That deleted-run case is the one place this ruling is a
    behaviour loss, and it is bounded by the stale badge the figure already
    carries. Nothing server-side is affected: `buildFigureInputs` has no caller
    under `server/` or `report-forge/`, and the PDF path prints client-produced
    HTML ([reports.ts:80-92](lib/api-routes/products/reports.ts#L80-L92)).
13. **A bundle records the geojson family in its own right.** `geo.family` is
    today the only record of which registry's boundaries a figure draws:
    `FigureBundle.resultsValue` carries `formatAs`, `valueProps` and
    `valueLabelReplacements` and drops `datasetFamily`
    ([_figure_bundle.ts:67-77](lib/types/_figure_bundle.ts#L67-L77)). Ruling 12
    keeps `geo` as the carrier, so the family stays where it is and no stored
    shape gains a field. A design that dropped `geo` entirely would have to add
    `datasetFamily` to the stored `resultsValue` subset; this plan does not.
14. **An unavailable reason says which plane came up empty.** Before step 4
    there is one plane, so step 1's reason is always `source: "instance"` and
    the wording is today's. Step 4 adds the package plane and the "not in this
    package" state of §2.4, whose action is a regeneration; wording that case as
    "not yet uploaded" would send the user to the maps page to upload a file
    that may already be there. The display reads the field; the resolver never
    writes a sentence (ruling 9).

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
`client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`,
`client/src/components/products/_shared/report_figure_embed.tsx`,
`client/src/components/explore/data_table/data_table.tsx`,
`client/src/components/_shared/figure_preview.ts`,
`client/src/components/_shared/figure_editor/figure_editor.tsx`,
`lib/types/_figure_bundle.ts`,
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md).

**Deliverable.**

- A `FigureUnavailable` discriminated union in `lib/types/_figure_bundle.ts`
  beside the bundle it describes, with two members:
  `{ kind: "no_boundaries", family: FacilityFamily, level: number, source:
  "instance" | "package" }`
  and `{ kind: "boundaries_loading", family: FacilityFamily, level: number }`.
  Reasons carry data, never a sentence. This step only ever constructs
  `no_boundaries` with `source: "instance"`, because there is no package plane
  until step 4 and nothing here can tell bytes in flight from no file; the
  `package` source and the `boundaries_loading` member are declared here rather
  than added there so the three display sites are written once, against all
  three wordings (ruling 14). `family` is read the way the thrown string reads
  it today, from `geo.family` defaulting to `hmis`
  ([build_figure_inputs.ts:335-337](client/src/generate_visualization/build_figure_inputs.ts#L335-L337));
  ruling 13 is why that carrier survives step 4.
- `buildFigureInputs` returns
  `{ ok: true; inputs: FigureInputs } | { ok: false; unavailable: FigureUnavailable }`.
  The map branch returns the `no_boundaries` reason instead of throwing. Every
  other throw in the function stays a throw: those are bugs.
- All ten call sites handle the result. They are, by file: two in
  `report_figure_raster.ts` (150, 268), one each in `export_report_as_html.ts`
  (50), `convert_slide_to_page_inputs.ts` (570), `report_figure_embed.tsx` (68),
  `data_table.tsx` (250), `figure_preview.ts` (65) and
  `resolve_bundle_from_metric_and_config.ts` (138), and two in
  `figure_editor.tsx` (665, 1070). The three that display a message
  (`report_figure_embed.tsx`, `figure_preview.ts`, `figure_editor.tsx`) render a
  localized line from the reason, in the three languages the repo uses, with the
  registry and level interpolated: the `instance` wording says the files are not
  uploaded for that registry and level, the `package` wording says this results
  package was generated without them and a regeneration captures them, and the
  `boundaries_loading` wording is a neutral loading line that names no action.
  `report_figure_raster.ts`, `export_report_as_html.ts` and
  `convert_slide_to_page_inputs.ts` degrade on `ok: false` explicitly: the first
  two have no unavailable branch at all today, and the third returns
  `makePlaceholderTextItem` from a bare `catch`.
  `resolve_bundle_from_metric_and_config.ts` raises its `AIToolFailure` from the
  reason rather than from `e.message`.
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
`client/src/components/data/geojson/edit_modal.tsx`,
`client/src/components/data/facilities/import/step_5_import.tsx`,
`server/tests/geojson_area_match_test.ts` (new),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md),
[SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md).

**Deliverable.**

- `lib/geojson_area_match.ts` exports `normalizeAreaName` (NFD, strip combining
  marks, trim, collapse internal whitespace including non-breaking space,
  case-fold: in that order, so an accented and an unaccented spelling match,
  which is the repo's rule for matching names, the one scope labels and the
  indicator search already apply) and
  `autoMapAreaNames(sourceNames,
  adminAreaNames)` returning the mapping plus
  the source names it could not place. The mapping is a proposal the wizard
  shows before anything is saved, so folding accents can only add a candidate
  the user then sees. It lives in `lib/` so the test below can reach it:
  `deno task test` runs `server/tests/` and `report-forge/tests/`, which cannot
  import the `~` alias. The save path does not call it and does not change:
  `processFeatures` looks the raw source name up in the mapping it was handed
  ([process_geojson.ts:123](server/geojson/process_geojson.ts#L123)), so
  normalization is an authoring-time concern and only new saves and remaps see
  the better matching.
- Both branches of `step_2.tsx` call `autoMapAreaNames`. The two inline loops
  are gone.
- The raw parsed feature types are declared once, in `server/geojson/types.ts`;
  `process_geojson.ts` and `server/dhis2/goal4_geojson/types.ts` import them.
  The dhis2 module depends on the geojson module, not the reverse. SYSTEM_07
  describes the adapter as self-contained
  ([SYSTEM_07:17-21](SYSTEM_07_dhis2.md#L17-L21)); one line there names this
  type import as the exception. `GeoJsonFeature` is identical in both and moves
  as is; the two `GeoJsonFeatureCollection`s are not (the dhis2 one is strict
  because its fetcher has already checked `type` and `features`), so the shared
  file declares the loose one and the dhis2 file keeps its checked alias over
  the shared feature type.
- `getAdminAreaOptionsForLevel` returns, alongside the options, the duplicate
  groups for that family and level: each repeated leaf name with the parent
  paths that carry it. Level 2 stops using `SELECT DISTINCT` and dedupes in
  TypeScript instead, so a name shared by two level-1 parents is reported rather
  than silently folded; the options themselves stay one per distinct name at
  every level, because the area key cannot distinguish them (ruling 1).
- Its response shape therefore changes from `Array<{value, label}>` to the
  options plus the groups, which `edit_modal.tsx` consumes as well as the wizard
  ([edit_modal.tsx:84](client/src/components/data/geojson/edit_modal.tsx#L84)).
  The modal shows the same groups above its remap table.
- The wizard shows those groups above the mapping table: the names, their
  parents, and the consequence stated plainly, that one boundary and one value
  are all these areas can have until they are renamed.
- The structure import summary carries the same duplicate count per level, added
  in `server/routes/instance/structure.ts` beside the orphan count it already
  attaches after the commit
  ([structure.ts:454-459](server/routes/instance/structure.ts#L454-L459)), and
  the structure wizard's import step shows it where it shows the orphan count:
  `step_5_import.tsx`, the client's step 5 for the server's step 4
  ([step_5_import.tsx:272-274](client/src/components/data/facilities/import/step_5_import.tsx#L272-L274)).
- SYSTEM_05's "The wizard warns but cannot fix" becomes a description of what
  the code now does, and names where the warning is raised.

**Not in this step.** Qualifying the area key (ruling 1). Persisting the DHIS2
UID (§5). Changing what a save stores: `processFeatures` still writes the
mapping it is handed.

**Gates.** The floor, plus `server/tests/geojson_area_match_test.ts`: the
normalizer's cases (an NFD and an NFC spelling of one accented name match each
other, `Boké` matches `Boke`, non-breaking space, mixed case, Turkish dotless i
left unmatched rather than mismatched), and a duplicate-group read against
seeded `admin_areas_hmis_2` and `admin_areas_hmis_3` rows on a throwaway
database, which must fail before the read exists.

**Ends with** two commits: the shared matcher and the type unification, then the
duplicate-name surfacing.

### Step 3 - the instance plane serves bytes

**Reads:** [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md),
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

**Surface.** `lib/api-routes/instance/geojson_maps.ts`,
`server/routes/instance/geojson_maps.ts`, `server/db/instance/geojson_maps.ts`,
`lib/server_actions/try_catch_server.ts`,
`client/src/state/instance/t2_geojson.ts`,
`client/src/components/data/geojson/edit_modal.tsx`,
`server/tests/geojson_serving_test.ts` (new),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md),
[SYSTEM_17_logging.md](SYSTEM_17_logging.md).

**Deliverable.**

- `/geojson-maps/level/:family/:level/:uploaded_at` returns the stored text as
  the response body, `Content-Type: application/geo+json`,
  `Cache-Control: private, max-age=31536000, immutable`, and
  `Content-Encoding: gzip` when the request accepts it, compressed from the
  stored text in the handler. A request whose `:uploaded_at` does not match the
  row's is a 404, not a redirect: the client always has the current value.
  `cacheMiddleware` never sees a route registered on a router
  ([main.ts:163](main.ts#L163) against [:220](main.ts#L220)), so the handler's
  header is what the client receives. The response is built by a pure function
  of the stored text, the row's stamp, the request's `:uploaded_at` segment and
  its `Accept-Encoding`, which is what the gate exercises. The segment is
  compared against `uploaded_at.toISOString()`, the string the summaries hand
  the client ([geojson_maps.ts:28](server/db/instance/geojson_maps.ts#L28)),
  never against the `timestamptz` value: Postgres keeps microseconds and the
  client's string is millisecond-truncated.
- The route is registered raw on `routesGeoJsonMaps`, guarded by
  `requireGlobalPermission()` and unlogged, registered the way the CSV exports
  in `structure.ts` and `population.ts` are
  ([structure.ts:588-592](server/routes/instance/structure.ts#L588-L592)) but
  without their `log()`: `preloadGeoJson` runs on every SSE connect
  ([t1_sse.tsx:197](client/src/state/instance/t1_sse.tsx#L197)) and fetches it
  for every map level its memory and IDB caches miss
  ([t2_geojson.ts:88-100](client/src/state/instance/t2_geojson.ts#L88-L100)),
  and SYSTEM_17 names `getGeoJsonForLevel` among the per-render fetches whose
  logging was removed for that reason
  ([SYSTEM_17:89-94](SYSTEM_17_logging.md#L89-L94)). It joins SYSTEM_01's
  off-registry inventory
  ([SYSTEM_01:264-283](SYSTEM_01_api_contract.md#L264-L283)) with its reason: a
  raw GeoJSON body, not an envelope. The `getGeoJsonForLevel` registry entry is
  deleted rather than redeclared: `isStreaming: true` is the NDJSON protocol
  ([SYSTEM_01:223-244](SYSTEM_01_api_contract.md#L223-L244)) and would generate
  a client action that runs `consumeStream` over a GeoJSON body.
- `t2_geojson.loadMap` fetches the new URL through a raw-response variant of
  `tryCatchServer`'s request loop, extracted in
  `lib/server_actions/try_catch_server.ts` so both share one policy:
  `refreshSession()` before each attempt, the same two retries with backoff for
  a `GET`, the same 401 handling
  ([try_catch_server.ts:20-70](lib/server_actions/try_catch_server.ts#L20-L70)).
  A direct `fetch` would lose that, and `preloadGeoJson` only logs a failure
  ([t2_geojson.ts:53-58](client/src/state/instance/t2_geojson.ts#L53-L58)), so
  one transient error on a 20 MB fetch would leave the map "not uploaded" until
  the next push or reconnect. It parses once. It encodes the `uploaded_at`
  segment itself with `encodeURIComponent`, which `buildRequestParams` used to
  do
  ([create_server_action.ts:80](lib/server_actions/create_server_action.ts#L80)):
  the value is an ISO timestamp and carries `:`.
- `edit_modal.tsx` follows the same URL for both of its reads: the remap table's
  feature grouping
  ([edit_modal.tsx:83](client/src/components/data/geojson/edit_modal.tsx#L83))
  and the download button
  ([edit_modal.tsx:215](client/src/components/data/geojson/edit_modal.tsx#L215)),
  which blobs the response text instead of `res.data.geojson`. Both need the
  `uploaded_at`, and the modal reads it itself from `instanceState.geojsonMaps`
  for its own family and level, the way the manager does
  ([manager.tsx:63](client/src/components/data/geojson/manager.tsx#L63)). No new
  prop: `Props` stays `family`, `adminAreaLevel`, `close`
  ([edit_modal.tsx:18-22](client/src/components/data/geojson/edit_modal.tsx#L18-L22))
  and `manager.tsx` is not in this step's surface because it does not change.
- The database read for the serving path returns the text and `uploaded_at`
  without building an envelope around a 20 MB string.
- SYSTEM_01's off-registry inventory gains the route's row ("guarded,
  unlogged"), and its client section names the shared raw-response loop.
  SYSTEM_05 records the content-addressed URL and that the IDB cache stays for
  the parse (ruling 6). SYSTEM_17's per-render list names the raw route in place
  of `getGeoJsonForLevel`.

**Not in this step.** Storing the column gzipped, which changes the column type
and needs a migration. Off-main-thread parsing and polygon simplification (§5).
The run-keyed routes, which are step 4.

**Gates.** The floor, plus `server/tests/geojson_serving_test.ts`, on a
throwaway database built the way `hfa_import_facilities_test.ts` builds its own:
the serving read over a seeded `geojson_maps` row returns its text and stamp,
and the response builder over that read returns the exact stored bytes, the
three headers and, with `Accept-Encoding: gzip`, a gzipped body that inflates to
those bytes; a stale `uploaded_at` is a 404. The route is not driven through a
Hono app: every guard binds `c.var.mainDb` to the dev database
([userPermission.ts:47-50](server/middleware/userPermission.ts#L47-L50)), and
the dev instance's `geojson_maps` is not a fixture.

**Ends with** one commit.

### Step 4 - the package carries the geometry

**Reads:** [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md),
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md),
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md),
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

**Surface.** `lib/types/run_manifest.ts`,
`server/worker_routines/generate_run/prepare_inputs.ts`,
`server/runs/build_run_package.ts`, `server/runs/manifest_transform.ts`,
`server/runs/run_paths.ts`, `server/runs/package_internals.ts`,
`server/runs/mod.ts`, `server/worker_routines/generate_run/pipeline.ts`,
`lib/api-routes/instance/run_generation.ts`,
`server/routes/instance/run_generation.ts`,
`client/src/state/instance/t2_run_geojson.ts` (new),
`client/src/state/instance/t2_run_authoring_context.ts`,
`client/src/state/instance/t1_sse.tsx`, `client/src/state/clear_caches.ts`,
`client/src/generate_visualization/build_figure_inputs.ts`,
`client/src/generate_visualization/resolve_figure_from_metric.ts`,
`client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`,
`client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`,
`client/src/generate_report/report_figure_raster.ts`,
`client/src/exports/export_report_as_html.ts`,
`client/src/components/_shared/figure_preview.ts`,
`client/src/components/explore/figure_view.tsx`,
`client/src/components/_shared/figure_editor/figure_editor.tsx`,
`lib/ai_tools/build_system_prompt.ts`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`server/mcp/context_cache.ts`, `server/tests/copilot_prompt_test.ts`,
`lib/types/_figure_bundle.ts`, `server/tests/run_manifest_transform_test.ts`,
`server/tests/run_input_transform_test.ts`,
`server/tests/geojson_capture_test.ts` (new),
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md),
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md),
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md),
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md).

**Deliverable.**

- `prepare_inputs` writes one `inputs/geojson/{family}_level_{N}.geojson.gz` per
  `geojson_maps` row, gzipped from the stored text, and records each in
  `extraInputFiles`. Measured cost on the dev instance's four rows: 20.5 MB
  plain, so roughly 2 MB gzipped added to every run package from here on,
  permanently, since a package is never pruned. `input_transform.ts` reads
  mirrors by exact file name
  ([input_transform.ts:126](server/runs/input_transform.ts#L126)), so a new
  `inputs/` entry it does not name is inert to it.
- `RUN_MANIFEST_SCHEMA_VERSION` is 15 and the manifest carries
  `geojsonMaps: { family, adminAreaLevel, featureCount, uploadedAt }[] | null`:
  a list for a package generated with capture, `null` for every earlier package
  (ruling 4). A transform block appended at the end of `manifest_transform.ts`
  stamps 15 and carries the field forward as `null`, checking its own
  precondition and idempotent. `geojson_maps` has no `feature_count` column
  ([010_add_geojson_maps.sql](server/db/migrations/instance/010_add_geojson_maps.sql),
  [076:267](server/db/migrations/instance/076_structure_family_split.sql#L267)),
  so the count comes from one `JSON.parse` of the stored text per row during the
  capture that already reads it. No new column: the stamp is a generation-time
  fact and belongs in the manifest. The stamp exists only in
  `PreparedRunInputs`, so `pipeline.ts` passes it into `RunBuildOptions` beside
  `extraInputFiles`
  ([pipeline.ts:171-183](server/worker_routines/generate_run/pipeline.ts#L171-L183))
  and `build_run_package.ts` writes it into the manifest literal
  ([build_run_package.ts:249-282](server/runs/build_run_package.ts#L249-L282)).
  The `RunManifest`-typed scratch manifests in `run_manifest_transform_test.ts`
  and `run_input_transform_test.ts`
  ([run_input_transform_test.ts:17-40](server/tests/run_input_transform_test.ts#L17-L40))
  gain `geojsonMaps: null`, or the server check in the typecheck gate fails.
- The capture does not disturb module memoization: reuse keys hash each module's
  own declared sources
  ([resolve_reuse.ts:150-209](server/worker_routines/generate_run/resolve_reuse.ts#L150-L209)),
  and a geojson file is nobody's declared source. The step asserts this in its
  test rather than claiming it.
- Two run-keyed routes beside the other package reads in
  `lib/api-routes/instance/run_generation.ts`, both `requireApprovedUser()` like
  `getRunAuthoringContext`
  ([run_generation.ts:366-369](server/routes/instance/run_generation.ts#L366-L369)).
  That is stricter than today's instance route by `approved`, which its
  `requireGlobalPermission()` never checks
  ([userPermission.ts:58-60](server/middleware/userPermission.ts#L58-L60)), and
  affects no caller: every product surface already requires an approved user,
  and the SSE preload stays on the instance route. Neither route takes a scope:
  geometry carries no data values, and `getRunModuleWithConfigSelections` is the
  precedent for a scope-less manifest read
  ([run_generation.ts:223-238](server/routes/instance/run_generation.ts#L223-L238)).
  - `GET /run_generation/run/:run_id/geojson` returns the manifest's
    `geojsonMaps` stamp verbatim, `null` included, through
    `getRunManifestForRun`
    ([run_read.ts:150-164](server/run_query/run_read.ts#L150-L164)), whose
    `isRunIdShape` check and manifest-cache read it inherits; a run that is gone
    is that function's failure envelope.
  - `GET /run_generation/run/:run_id/geojson/:family/:level` streams the
    captured file with `Content-Encoding: gzip`,
    `Content-Type: application/geo+json` and
    `Cache-Control: private, max-age=31536000, immutable`, and 404s when the run
    or the file is absent. It is registered raw on `routesRunGeneration`,
    guarded by `requireApprovedUser()` and unlogged for step 3's reason (a
    per-page-load fetch is never logged), exactly as step 3's instance route is
    on its router, and joins SYSTEM_01's off-registry inventory beside it; the
    stamp route stays a registry entry because it returns an envelope and the
    store calls its generated action. The file read lives in
    `server/runs/package_internals.ts`, which owns path safety for every
    caller-supplied run id, and is exported through `server/runs/mod.ts`.
- `RunAuthoringContext` is unchanged, so its type, its server builder and the
  client cache name stay as they are. `getRunAuthoringContextFromCacheOrFetch`
  awaits the store's stamp read for the pair's `runId` alongside its own read
  (`Promise.all`) and resolves only once both are held, so every surface that
  authors against a package (a deck, a report, explore, the package page, the
  copilot) holds the stamp before it builds a prompt, and the deck's editor
  before it builds a figure; the deck's rail thumbnails
  ([slide_card.tsx:59-63](client/src/components/products/slide_deck/slide_card.tsx#L59-L63))
  and a report's embeds
  ([report.tsx:410-414](client/src/components/products/report/report.tsx#L410-L414))
  build off their bundles with no context gate and take the store's `loading`
  state until the stamp lands. The stamp read resolves to its state on a failed
  fetch (§2.4, "run unknown") and never rejects: the deck, the report and the
  copilot await this call inside `void (async` with no catch
  ([slide_deck.tsx:463-467](client/src/components/products/slide_deck/slide_deck.tsx#L463-L467)),
  and a generated action never rejects either. Starting the stamp read without
  awaiting it would not do: the copilot marks its package loaded the moment the
  context resolves and builds the package block per message from it
  ([panel.tsx:95-99](client/src/components/instance/copilot/panel.tsx#L95-L99),
  [:134-144](client/src/components/instance/copilot/panel.tsx#L134-L144)), so a
  context served from IDB would ground the first message on the instance's
  levels and the next message on the package's, and the block rides again
  whenever its text changes
  ([:127-133](client/src/components/instance/copilot/panel.tsx#L127-L133)).
- A run-geo store in `client/src/state/instance/t2_run_geojson.ts`, keyed
  `(runId, family, level)`, mirrors `t2_geojson`'s shape: memory plus IDB, a
  version signal so a tracked read re-runs when the stamp or the data lands. Its
  IDB keys are `run_geojson:{runId}:{family}:{level}`, a prefix of its own,
  because `evictDeletedGeoJsonLevels` deletes every `geojson:` key it does not
  list on each maps push
  ([t2_geojson.ts:128-136](client/src/state/instance/t2_geojson.ts#L128-L136)).
  It holds each run's stamp with its fetch state beside the data, because the
  stamp is what tells "this package has no boundaries at that level" from "they
  have not arrived yet" and from "I have never heard of this run", and it
  fetches that stamp itself the first time any read names a `runId` it does not
  hold (§2.4). A fetched stamp, `null` included, is written to IDB under
  `run_geojson:{runId}:stamp` and read from there first, immutable for the
  reason the authoring context is
  ([t2_run_authoring_context.ts:12-16](client/src/state/instance/t2_run_authoring_context.ts#L12-L16)),
  so a page load on a known run never waits a round trip for it; a failed read
  is not cached, and eviction drops the stamp with the run's data. It exposes
  `ensureRunGeoJson(runId, family, level)`, an awaitable read that resolves once
  the sync read would answer anything but `loading`, for the callers below that
  build after an await; on `run_unknown` it also awaits `preloadGeoJson([map])`
  for the instance's listed `(family, level)` before resolving, the call
  `assertMapBoundariesAvailable` makes today
  ([resolve_bundle_from_metric_and_config.ts:125](client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts#L125)),
  so on a pre-capture package, which is every package until it is regenerated,
  the fallback plane's bytes are in hand too and an export does not build
  placeholders. Its eviction mirrors `evictDeletedGeoJsonLevels` and runs where
  the ready-packages list is actually stored: in the effect of `t1_sse.tsx` that
  fetches it after a `runs_catalog_updated` push, right after
  `updateInstanceReadyPackages` lands, in the approved branch and in the
  unapproved one that stores `[]`
  ([t1_sse.tsx:387-397](client/src/state/instance/t1_sse.tsx#L387-L397)). The
  SSE case itself ([:256-258](client/src/state/instance/t1_sse.tsx#L256-L258))
  only bumps the nonce that effect follows, so at the case the deleted run is
  still listed. It drops every entry whose `runId` is not in the list just
  stored, memory and IDB together. That is exactly a deleted run: a run that
  backs no product but is open in explore, on the package page, or behind a
  stale figure is still ready and keeps its entry. Without the rule a user who
  opens five packages accumulates five parsed copies, ten megabytes each at
  admin area 3, on top of the instance store's own. `clearDataCache` in
  `clear_caches.ts` clears the store's memory the way it clears `t2_geojson`'s;
  its IDB keys are already swept there.
- Its sync read, the one `resolveGeoJson` calls with `bundle.provenance.runId`,
  returns the four states of §2.4: `ready` with the data, `loading`,
  `not_in_package`, `run_unknown`. `resolveGeoJson` renders on `ready`; returns
  `boundaries_loading` on `loading`, so the frames before the bytes land never
  tell the user to upload or regenerate; returns `no_boundaries` with
  `source: "package"` on `not_in_package`; and reads the instance store on
  `run_unknown`, returning `no_boundaries` with `source: "instance"` when that
  comes up empty too (ruling 14). A `data` geo still returns its own `geo.data`
  first, as today
  ([build_figure_inputs.ts:496](client/src/generate_visualization/build_figure_inputs.ts#L496));
  only the constructor's branch goes. The states live in the store and not in
  the caller because `buildFigureInputs` never sees the container's scope
  (§2.4).
- `makeFigureBundleFromFetchedData` loses the `{kind:"data"}` branch (ruling
  12): a new bundle stores `{kind:"level", level, family}` whenever the config
  has a map level, and no `geo` otherwise. The `getGeoJsonSync` call and the
  cache-warm-versus-cache-cold split in that constructor go with it, so the
  function no longer reads the sync cache. Its `t2_geojson` import stays, for
  `geoJsonFamilyFor`
  ([resolve_figure_from_metric.ts:18](client/src/generate_visualization/resolve_figure_from_metric.ts#L18)),
  which is what stamps the family the `level` ref now carries
  ([:142](client/src/generate_visualization/resolve_figure_from_metric.ts#L142)).
  `geoRefSchema` keeps the `data` variant, because bundles already stored carry
  it and a stored bundle is never rewritten.
- `assertMapBoundariesAvailable` asserts against the package, not the instance:
  it awaits the store's stamp for `scope.runId` and then `ensureRunGeoJson` for
  the figure's family and level, where today it reads
  `instanceState.geojsonMaps` and awaits `preloadGeoJson`
  ([resolve_bundle_from_metric_and_config.ts:95-131](client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts#L95-L131)).
  Its two `AIToolFailure` messages keep their wording, with the alternative
  levels read from the stamp. A pre-capture package (stamp `null`) keeps the
  instance read, the same fallback `resolveGeoJson` takes.
- The consumers that build a figure after an await, where a sync read tracks
  nothing, await `ensureRunGeoJson` for each map bundle before they build: the
  figure branch of `convertSlideToPageInputs`
  ([convert_slide_to_page_inputs.ts:569-573](client/src/generate_slide_deck/convert_slide_to_page_inputs.ts#L569-L573)),
  the one path behind slide thumbnails, the presenter, the three deck exports,
  the editor's page build and the copilot's drafts; `rasterize` and `measure` in
  `report_figure_raster.ts`
  ([:147-150](client/src/generate_report/report_figure_raster.ts#L147-L150),
  [:265-268](client/src/generate_report/report_figure_raster.ts#L265-L268)), the
  second because a failed measure is stored as `false` for the content key and
  never re-measured
  ([:285-303](client/src/generate_report/report_figure_raster.ts#L285-L303));
  `rasterizeFigure` in `export_report_as_html.ts`
  ([:46-50](client/src/exports/export_report_as_html.ts#L46-L50));
  `fetchFigureInputs` in `figure_preview.ts`, which builds the transient bundle
  after the items await
  ([figure_preview.ts:24-65](client/src/components/_shared/figure_preview.ts#L24-L65))
  and whose two consumers besides explore, the insert wizard's preset cards and
  the package page's preset gallery, track nothing; and the editor's download
  path
  ([figure_editor.tsx:665](client/src/components/_shared/figure_editor/figure_editor.tsx#L665)).
  Today a `data` bundle carries its geometry into those paths; with `level` the
  only shape, a deck exported before the bytes land would otherwise export every
  map as a placeholder, a thumbnail would stay one until its slide next changed,
  a report would lay its new maps out as unmeasurable until the editor
  remounted, and every map preset card on a cold package would show the loading
  line and never rebuild.
- `figure_view.tsx` tracks the run-geo store's read for `p.scope.runId` in the
  preview's source, where it tracks `getGeoJsonSync` today
  ([figure_view.tsx:32-40](client/src/components/explore/figure_view.tsx#L32-L40)),
  so the explore preview still rebuilds when the boundaries land.
  `figure_editor.tsx` loses its `getGeoJsonSync` read, the `geoJson` it writes
  into the items holder and the `geoJson?` field
  ([figure_editor.tsx:264-274](client/src/components/_shared/figure_editor/figure_editor.tsx#L264-L274),
  [:199](client/src/components/_shared/figure_editor/figure_editor.tsx#L199),
  [:83](client/src/components/_shared/figure_editor/figure_editor.tsx#L83)):
  nothing reads that field, and the editor's preview memo builds through
  `buildFigureInputs`, which tracks the resolver's version signal on its own.
- The copilot's map-level line becomes a package fact. `PackageGrounding`
  ([build_system_prompt.ts:229-242](lib/ai_tools/build_system_prompt.ts#L229-L242))
  gains a required `mapLevels: GeoJsonMapSummary[]`, and
  `buildPackageGroundingSections` emits `buildMapCoverageLines` from it;
  `buildInstanceContextSections` stops emitting it
  ([:170](lib/ai_tools/build_system_prompt.ts#L170) goes), since that function
  feeds both the SPA prompt and the MCP prompt
  ([mcp_tools.ts:95](server/mcp/mcp_tools.ts#L95)) and the SPA would otherwise
  carry the line twice. One rule fills it on both surfaces: the package's stamp
  when non-null, else the instance's `geojsonMaps`. The SPA fills it in
  `buildCopilotPackageBlock`
  ([build_system_prompt.ts:65-85](client/src/components/instance/copilot/build_system_prompt.ts#L65-L85))
  from the store's stamp for `scope.runId`; the MCP fills it in
  `context_cache.ts` ([:295-300](server/mcp/context_cache.ts#L295-L300)) from
  `manifest.geojsonMaps`, falling back to the instance state it already
  resolves. The two `PackageGrounding` literals in
  `server/tests/copilot_prompt_test.ts`
  ([:146](server/tests/copilot_prompt_test.ts#L146),
  [:184](server/tests/copilot_prompt_test.ts#L184)) gain the field.
- SYSTEM_08 records the new input files, the v15 stamp and its block, and the
  two run-keyed routes. SYSTEM_10 records the four resolve states and what each
  renders, next to the staleness contract they interact with, because the
  deleted-run case of ruling 12 applies to every bundle resolved after this
  step; no bundle stored before it changes what it draws, since a `data` bundle
  keeps its copy and a `level` bundle sits on a pre-capture package whose `null`
  stamp takes the `run_unknown` fallback, which is today's read. It also records
  the awaited read the after-await consumers make. SYSTEM_10's "Geo" section is
  rewritten: a new bundle names its geometry and resolves it against its own
  package, the `data` variant is read-only history, and the "A bundle owns its
  data" paragraph loses its `geo` exception, because there is no longer a
  megabyte-scale field held by reference. SYSTEM_11's paragraph on the explore
  preview's boundary read names the run-geo store. SYSTEM_13 records that the
  map-level line rides the package block. SYSTEM_03's list of
  `runs_catalog_updated` consumers and its `clearDataCache` paragraph gain the
  store ([SYSTEM_03:202-210](SYSTEM_03_realtime_cache.md#L202-L210),
  [:462-466](SYSTEM_03_realtime_cache.md#L462-L466)). SYSTEM_09 claims the store
  in its manifest and describes it beside `t2_run_authoring_context.ts`
  ([SYSTEM_09:852](SYSTEM_09_viz_query_cache.md#L852)). SYSTEM_01 records the
  stamp route and adds the bytes route to the off-registry inventory.

**Not in this step.** Re-capturing geometry into stored bundles, or stripping
`geo.data` out of the ones that carry it (§5). Deleting the `data` variant from
`geoRefSchema`. Coverage, which is step 5.

**Gates.** The floor, plus `server/tests/geojson_capture_test.ts`, in two parts.
On a throwaway database built the way `hfa_import_facilities_test.ts` builds its
own: `prepareRunInputs` over seeded `geojson_maps` rows with no family selected
writes one gzipped file per row whose inflated bytes equal the stored text and
lists each in `extraInputFiles`, and `inputHashes` and `scriptInputs` from two
`prepareRunInputs` calls, one over the seeded rows and one over none, are
deep-equal: those are the only two fields of `PreparedRunInputs` that reach a
reuse key, `inputHashes` through `computeModuleInputs`
([pipeline.ts:122](server/worker_routines/generate_run/pipeline.ts#L122)) and
`scriptInputs` through the `scriptText` that `resolveRunModules` generates
([resolve_modules.ts:91-96](server/worker_routines/generate_run/resolve_modules.ts#L91-L96))
and `computeModuleKey` hashes
([resolve_reuse.ts:212-218](server/worker_routines/generate_run/resolve_reuse.ts#L212-L218)),
so the capture is outside every reuse key. `computeModuleInputs` itself cannot
run here: with no family selected `inputHashes.datasets` is empty and it throws
for any module declaring a dataset source
([resolve_reuse.ts:176-182](server/worker_routines/generate_run/resolve_reuse.ts#L176-L182)).
The `.tmp-{runId}` directories `prepareRunInputs` writes under `_RUNS_DIR_PATH`
([prepare_inputs.ts:109](server/worker_routines/generate_run/prepare_inputs.ts#L109),
[run_paths.ts:24-26](server/runs/run_paths.ts#L24-L26)) are removed in
`finally`. Through a Hono app carrying the clerk leg of
`products_routes_test.ts` against the dev database, because every guard binds
`c.var.mainDb` there
([userPermission.ts:47-50](server/middleware/userPermission.ts#L47-L50)), with
the approved `users` row created and removed as that test does, over a scratch
package written under `_RUNS_DIR_PATH` (the only root `runDirPath` resolves,
[run_paths.ts:20-22](server/runs/run_paths.ts#L20-L22); precedent
[hfa_round_reimport_test.ts:496](server/tests/hfa_round_reimport_test.ts#L496))
and removed in `finally`: the bytes route serves the captured file with the
three headers and 404s for a level the package lacks, and the stamp route
returns the list for that package and `null` for one written at v14 and
transformed. Plus `server/tests/run_manifest_transform_test.ts` extended: a v14
manifest transforms to v15 with `geojsonMaps: null`, and the block is
idempotent.

**Ends with** four commits: capture plus the manifest version; the two run-keyed
routes; the store, the client repoint and the deletion of the embed branch; the
awaits in the after-await consumers and the copilot's package-level line.

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
- The transform runs ONCE. `buildFigureInputs`' map branch calls
  `getMapDataTransformed` itself and puts the `MapDataTransformed` in
  `FigureInputs.data`, which the map variant already accepts
  ([types.ts:25](panther/_010_maps/types.ts#L25)), and panther's own call
  short-circuits on `isTransformed`
  ([get_map_data.ts:16-19](panther/_010_maps/get_map_data.ts#L16-L19)).
  Computing coverage over `MapDataJson` and handing panther the JSON form would
  walk every feature and every row twice per build, and `buildFigureInputs`
  re-runs on every keystroke in the editor over up to 10,325 level-4 areas.
- A map with zero matched areas returns the `no_boundaries`-style unavailable
  result rather than rendering an empty country; every other share renders
  (ruling 8). The reason union gains
  `{ kind: "no_area_matches", dataAreas,
  boundaries }`. This is the one change
  this step makes to a rendered product: a stored map figure, of either geo
  shape, whose areas match no boundary shows the unavailable line in decks,
  reports and exports where it drew an empty country, which ruling 8 sanctions
  and ruling 7 does not cover, because it is not the count that shows but the
  figure that stops. SYSTEM_10 records it beside the resolve states.
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
- **Rewriting stored bundles**, including stripping the `geo.data` copies that
  1.2 measures. A bundle that carries its geometry renders consistently and
  there is nothing to re-key (ruling 1), so the copies are dead weight, not a
  defect in what renders, and they drain as their figures are re-resolved under
  ruling 12. Reaching them deliberately would mean a transform over
  `slides.config`, `reports.figures`, `report_versions.figures`,
  `slide_deck_versions.slides` and two Yjs `crdt_state` documents, where `geo`
  sits inside the opaque `figData` half
  ([slide_crdt.ts:64-68](lib/collab/slide_crdt.ts#L64-L68)), plus a
  `content_hash` recompute on both version tables. It is its own plan, and it is
  only worth writing once ruling 12 has stopped new ones arriving.
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

- Step 1: `describeFigureUnavailable` is exported through
  `client/src/components/_shared/mod.ts`, outside the Surface, because
  `report_figure_embed.tsx` reaches the preview helper only through that entry.
- Step 2: `server/dhis2/goal4_geojson/fetch_geojson.ts` and
  `server/dhis2/goal4_geojson/mod.ts`, outside the Surface, changed: the fetcher
  held a third copy of the loose collection type, and the module re-exported the
  feature type the dhis2 `types.ts` no longer declares.
- Step 2: `upload_wizard/step_4.tsx`, outside the Surface, changed: its warning
  counted repeated option values, which the one-option-per-name read no longer
  carries, so it moved to step 3 with the groups. The shared warning is a new
  file, `data/geojson/_shared/admin_area_duplicates_warning.tsx` with its
  `_shared/mod.ts`, because the wizard and the edit modal both show it.
- Step 4: the stamp route returns `{ found: true, geojsonMaps }` or
  `{ found: false }` instead of the manifest read's failure envelope, so the
  store tells a run that is gone (`run_unknown`) from a failed request, which it
  does not cache and retries rather than drawing the instance's boundaries for
  the session.
- Step 4: `SYSTEM_05_facilities_indicators.md`, outside the Surface, changed:
  its geojson caching paragraph said bundles snapshot geometry as
  `{kind:"data"}`, which the deleted embed branch made false.
- Step 4: `t2_run_authoring_context.ts` is unchanged and
  `client/src/components/instance/copilot/panel.tsx`, outside the Surface,
  awaits `ensureRunGeoJsonStamp` beside the authoring context instead: the
  copilot is the one reader that needs the stamp before it counts a package
  loaded, and awaiting it inside the shared read would hold the scope editor,
  explore and six other callers on a fetch they never use.
- Step 4: `client/src/generate_visualization/mod.ts`, outside the Surface,
  changed: it exports `awaitFigureBoundaries`, the entry every after-await
  caller imports it through.
