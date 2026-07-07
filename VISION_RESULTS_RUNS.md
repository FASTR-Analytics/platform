# Vision: Instance → Results Runs → Projects

> The durable architectural direction; successor to VISION_PROJECT_SNAPSHOT.md
> (which reached the same end-state via incremental project-DB snapshotting —
> this vision jumps to the end-state with a file-based unit instead).
> [PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md) is the how and the when. When
> they disagree, this doc states intent; the plan states the current tactical
> path.

## Essence

The app splits into three planes with one-way data flow:

1. **Instance plane — data in.** Ingestion (HMIS/HFA/ICEH uploads, DHIS2),
   structure master (facilities, admin areas, indicators, geojson), instance
   config, and default module settings. Current systems S4–S7. Live, mutable,
   admin-owned.
2. **Results plane — compute.** A wizard-like flow: (a) choose data, (b)
   configure and run modules (current S8). Each execution produces a **results
   run** — a fully encapsulated, immutable, file-based directory keyed by a
   **run ID**, containing everything the modules consumed *and* everything
   they produced. Runs are generated and catalogued at instance level.
3. **Project plane — meaning.** A project points at a run and is purely an
   authoring space: visualizations, slide decks, reports, dashboards, AI
   (current S9–S13). Nothing a project renders reads outside its attached run.

## The problem it ends

Today analytical script-running is entangled with projects: datasets are
snapshotted *into* each project's Postgres DB, modules run *inside* the
project, and results are ingested into per-project `ro_*` tables that are
dropped and rebuilt in place under stable names. Because identity is stable
while content mutates, every layer needs freshness stamps travelling alongside
identity — the dirty-state cascade, `moduleLastRun`/`datasetsVersion` cache
dimensions, the dependent-PO `last_updated` sweep on every run, and the
standing "every mutation must stamp and notify" audit burden. A forgotten
stamp is a silent-staleness bug (the facility-columns N1 gap is a live one).
Results also exist twice (CSV on disk + Postgres copy), projects are heavy to
copy and impossible to move, and one project's results cannot serve another.

## The unit: a results run

A run is a frozen **`(results inputs, results outputs)` pair** — the whole
module-execution closure at one version, as files in one directory:

- **inputs** — dataset extracts, module definitions + parameters, structure
  subset (facilities), indicator dictionaries/snapshots, config that gates
  query shape (facility columns), locale/calendar, pinned assets, boundary
  geometry (eventually).
- **outputs** — the module result files, plus a **manifest** describing every
  results object's actual schema, precomputed query metadata (disaggregation
  options, time granularity, bounds), the metric catalog, and provenance.

Artifacts read **outputs for data, inputs for labels/structure/filters** —
both halves from the run, never from live instance state.

## The engine: query the files, don't ingest them

Results are **not ingested into Postgres**. The viz query layer (S9) runs its
generated SQL through **DuckDB directly over the run's files** (normalized
Parquet built at run-finalize from the raw module CSVs). Verified empirically:
the entire generated-SQL surface ports (the dialect is deliberately tiny), and
queries over real 192k-row outputs return in ~4 ms. This is what makes runs
swappable — pointing a project at a different run is a pointer write, not a
re-ingestion.

## The one hard rule (carried forward, unchanged)

*The project plane reads only from its attached run; a run depends on nothing
live at read time.* No viz / report / deck / dashboard reads instance data,
period. (FigureBundle already enforces this one layer up for *figures* —
stored artifacts are self-contained snapshots of a render. One known
exception remains open: authored **image binaries** in slides/reports/
dashboards are fetched live by name from the instance assets dir; they are
project-plane content, not run content, and need their own capture before
the transportability end-state — tracked as SNAP-5 in the plan's §8.)

## End-state properties of a run

- **Immutable** — a run is written once at generation and never modified. New
  data or new config means a new run. Immutability is what collapses cache
  versioning: cache keys are `runId + query hash`, with no data-version
  dimension left to go stale.
- **Self-contained** — carries every input the query/render layer needs; no
  reach-back into the instance at read time.
- **Identity-independent** — no instance foreign keys inside run files;
  references are stable domain values (metric ids, facility ids, names).
  Honest caveat: this property is *held from the first commit* but only
  fully *achieved* once the geojson snapshot-local-id work (WS-KEY) lands —
  bare-name admin-area keys are today's unsolved cross-instance blocker.
- **Self-describing** — `manifest.json` carries schema version + provenance
  (source dataset versions, module git refs, parameters, generation time,
  engine versions). Provenance is metadata, never read at render time.
- **Transportable** — a run is a directory: copyable, archivable, syncable,
  attachable to any project (eventually any instance).

## Production & distribution

Instance hosts the **run factory + catalogue**: generate a run via the wizard,
label it, list it, retire it. A project **attaches** a run from the catalogue
and can **detach/swap**; one run may serve many projects. Regeneration is a
deliberate act ("new data arrived → generate a new run → repoint projects"),
replacing the implicit dirty-state machine. This unblocks scheduled DHIS2
imports (generation can be automated because it no longer mutates projects)
and makes "compare two runs" a first-class future possibility.

**Trajectory:** per-project mutable results (today) → per-project immutable
runs (transition) → instance-generated, catalogued, attachable runs
(end-state).

## Why it's worth it

- **Correctness** — deletes the stamp-propagation bug class outright; a cache
  keyed on an immutable run cannot serve stale data.
- **Simplicity** — no ingest step, no dirty cascade, no dual storage, one
  versioning model (the run ID), far fewer moving parts in S8/S9/S3.
- **Reproducibility & provenance** — a project shows exactly what its run
  contains, regardless of later instance churn; the manifest says where every
  number came from.
- **Portability & sharing** — runs move across projects (and eventually
  instances); projects become lightweight authoring spaces.
- **Storage & operations** — results stored once (Parquet, ~12× smaller than
  CSV); project DBs shrink to authored content; backups and project-copy get
  cheap.
