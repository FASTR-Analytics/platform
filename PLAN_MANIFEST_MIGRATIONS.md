# Plan: Run Manifest Data Transform

Make `manifest.json` inside a results package migratable at boot, so the
manifest schema can change without orphaning existing packages.

**This is not a new mechanism.** It is
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)'s JSON data transform,
applied to a file instead of a DB column. Anything this plan does not explicitly
override is that protocol, unchanged.

**Prequel to [PLAN_EFFECTIVE_FORMAT.md](PLAN_EFFECTIVE_FORMAT.md)**, which needs
a new manifest field (`indicators[]`) and supplies this mechanism's first real
transform block. Build this first; that plan's steps 1–6 do not depend on it.

## 0. Read before writing any code

1. [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — the "JSON Data
   Transforms" section is the pattern being applied. Read all of it.
2. [po_config.ts](server/db/migrations/data_transforms/po_config.ts) — the
   canonical example. Copy its file-header comment style, its numbered-block
   structure, and its `configNeedsForcedTransform` idea.
3. [module_definition.ts](server/db/migrations/data_transforms/module_definition.ts)
   — shorter, and carries the no-op-write guard this plan needs (lines 166-171).
4. [lib/types/run_manifest.ts](lib/types/run_manifest.ts) — the schema being
   transformed, and `RUN_MANIFEST_SCHEMA_VERSION` (currently `2`).
5. [server/runs/manifest_cache.ts](server/runs/manifest_cache.ts) — the read path
   being changed.
6. [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) §"The results
   package format (authoritative)" — what a package contains.

## 1. Orientation: the artifact

A **results package** (UI vocabulary; "run" internally) is an immutable
directory produced by one module-execution act, keyed by a `runId`:

```text
{SANDBOX_DIR_PATH}/{runId}/
├── manifest.json                       # the package describing itself
├── inputs/                             # dataset parquet, facilities parquet,
│                                       #   indicator/snapshot mirror JSONs,
│                                       #   pinned assets, the R script
└── outputs/{moduleId}/{roId}.csv        # raw R output
                      {roId}.parquet    #   + its normalized query sibling
```

Relevant facts:

- Paths come from [run_paths.ts](server/runs/run_paths.ts). `_RUNS_DIR_PATH` is
  an **alias of `_SANDBOX_DIR_PATH`** — packages land flat beside legacy
  `{projectId}` sandbox directories, which still exist until Phase 4.
- Writers build in `.tmp-{runId}` and atomically rename, so a crashed generation
  never leaves a readable package. Two writers:
  [synthesize_run.ts](server/runs/synthesize_run.ts) (backfill) and
  `server/worker_routines/generate_run/` (the wizard).
- The manifest is what the read path consults *instead of* probing. Its own
  header states the doctrine: *"Precomputed, never probed."* Stamped facts
  include each results object's parquet columns, `hasFacilityId`,
  `physicalTimeColumn`, `availableDisaggregationOptions`, `rowCount`,
  `periodBounds`; every module definition verbatim; the metric catalog; and
  captured instance semantics (`calendar`, `countryIso3`,
  `facilityColumnsConfig`) which the adapter reads from here, never from env.
- A project holds one pointer, `projects.run_id`. The instance-DB `runs` table is
  the catalogue; `runs.summary` holds a `RunSummary` for listing.
- **Layer rule:** the project plane reads only its attached package; a package
  reads nothing live; no `projectId` or other instance FK inside package files.

Current behavior being replaced —
[manifest_cache.ts:36-40](server/runs/manifest_cache.ts#L36-L40):

```ts
if (manifest.manifestSchemaVersion !== RUN_MANIFEST_SCHEMA_VERSION) {
  throw new Error(`… — regenerate the run (synthesize_run.ts or a new generation)`);
}
```

A version mismatch kills the package. The advertised remedy is "regenerate".

## 2. Why

**Post-Phase-4 "regenerate" stops being a real remedy.** Phase 4 (see
[PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md)) drops the project-DB tables
`synthesize_run.ts`'s `project_db` source reads, and a wizard package was built
from a `captured` source whose inputs exist nowhere but the package itself.
Re-finalizing is technically possible — a package carries its inputs and R
script verbatim — but it mints a **new runId**, and under Phase 4's
`capturedRunId ≠ attachedRunId` staleness badge that marks every stored figure in
the fleet stale. So the only forward path that **preserves run identity** is
transforming the manifest in place.

This is not theoretical: the manifest already went v1 → v2 and nothing migrated.
Seven `{projectId}` directories in the dev sandbox still carry
`manifestSchemaVersion: 1`, abandoned where they sat. That was free because
nothing had shipped. It stops being free at rollout.

**Do this before the fleet rollout**, while every package in existence is on dev.

## 3. Amendment to immutability

VISION_RESULTS_RUNS.md states *"a run is written once at generation and never
modified."* This plan contradicts that as written, so amend it **in that doc**,
explicitly:

> **Package outputs are immutable. The manifest is a derived descriptor and may
> be transformed forward.**

What is genuinely given up, to be recorded rather than glossed:

- **Rollback blast radius widens.** SYSTEM_08's "HFA variants rollback hazard"
  (§Open items) is bounded today because only packages generated since a deploy
  carry a new shape, so the remedy is detach/delete those. Once a sweep has
  rewritten every manifest on an instance, that remedy is gone.
  PROTOCOL_APP_MIGRATIONS' *"code can be rolled back safely — the data shape is
  still valid"* holds for additive changes and **fails for a widened enum**,
  where the new shape is invalid under old code. §10's retained pre-transform
  copy is the mitigation.
- `RunSummary.diskSizeBytes` is stamped once on the stated grounds that a package
  dir is immutable. A rewritten manifest makes it marginally wrong. Accepted.

## 4. The invariant a DB transform doesn't need

A DB transform only reshuffles fields within the row it is handed. A manifest
transform can open files, so it needs a rule the protocol never required:

> **A transform may only RECOMPUTE from files already in the package. It may
> never invent provenance.**

Corollaries, as rules:

- **A field knowable only at generation time is nullable forever.** Provenance:
  `createdAt`, `appVersion`, `rImageTag`, `label`, `provenance`, `calendar`,
  `countryIso3`, `facilityColumnsConfig`, `datasets[]`, `modules[]`, `metrics[]`,
  `inputKey`, `outputFileHashes`. A transform carries these forward untouched and
  leaves them null where they never existed. It never synthesizes a plausible
  value.
- Recomputable, therefore fair game: `runId` (the directory name),
  `assets[].sha256`, `facilitiesTables[].columns`, all of `resultsObjects[]`,
  `metricAvailability[]`, `inputFiles[]`, and the `indicators[]` catalog
  PLAN_EFFECTIVE_FORMAT adds.
- **Any input file a transform recomputes from becomes a permanent part of the
  package format.** This constrains PLAN_RESULTS_RUNS' deferred "drop raw CSVs
  from runs": whatever a transform reads can never be dropped.
- A recompute is a pure function of (package files × **app code**), not of the
  files alone — `getIndicatorMetadataFromRun` branches on
  `scriptGenerationType` and calls `composeHfaIndicatorLabel` /
  `getHfaIndicatorMeasure`. That is desirable (see §5.2) but means the rig cannot
  assert byte-stability of recomputed fields across app versions.

## 5. The four differences from a DB transform

Everything else is po_config.ts unchanged: one function per type, numbered blocks
appended at the end and never reordered, each block idempotent and checking its
own precondition, `structuredClone` → mutate → `.parse`, skip the write when
output equals input.

### 5.1 The forced gate is the version integer

A parse-only skip gate is wrong here. Verified by execution against a real dev
manifest:

```text
future v3 manifest parses under v2 schema: true
  version kept as: 3
  'indicators' survived: false        ← silently stripped
future v3 whose drift is a widened enum: false
```

So a package from a newer app either sails through the gate and gets served with
its new fields silently stripped, or dies with an uninformative Zod path dump.
The version integer is the only thing that distinguishes those two cases.

This is the protocol's **forced skip-gate** — the same mechanism as
`configNeedsForcedTransform`, reading a version field instead of scanning for
legacy keys:

```ts
if (
  runManifestSchema.safeParse(manifest).success &&
  manifest.manifestSchemaVersion === RUN_MANIFEST_SCHEMA_VERSION
) continue;
```

Carry module_definition.ts's no-op guard as well: skip the write when the
transformed output equals the stored bytes, so nothing churns per boot.

### 5.2 Blocks, not version-indexed steps — and that is the point

Blocks re-evaluate every boot, so **fixing a bad derivation takes effect on the
next deploy.** A version-indexed ladder would run each step exactly once, making
every derivation bug fix cost a new schema version forever. State this in the
protocol section; it is the reason the pattern is right and it is not obvious.

### 5.3 The transform reads the package

Signature is `(manifest, runDir)` and it performs file I/O — no DB transform
does. Note for the first block's author:
[getIndicatorMetadataFromRun](server/run_query/run_read.ts#L457) resolves paths
via `readRunInputJsonCached(runId, …)` → `runDirPath(runId)`, i.e. keyed by
runId, not by an arbitrary directory. It needs a runDir-based variant before a
transform block can call it, and before the rig can replay on copies.

### 5.4 A package can arrive from outside the app

A DB row can only enter through the app. A package directory arrives by rsync, by
backup restore, or copied from another instance. Two consequences:

- **Enumerate the `runs` catalogue, not the filesystem.** The sandbox directory
  is shared and heterogeneous: legacy `{projectId}` dirs, published-failed dirs
  (no manifest, kept deliberately so logs stay inspectable), `.tmp-{runId}` dirs
  (which *do* contain a manifest once finalize has written one, before the
  rename), `.duckdb-spill`, and loose `restore_*.sql.gz` files. Catalogue
  enumeration excludes all of them by construction, and preserves the ruling that
  justified sharing the directory in the first place: *every consumer addresses a
  NAMED entry.*

  The legacy `{projectId}` directories deserve a specific note, because a
  filesystem sweep would get them wrong in a way that looks safe. They are not
  packages — they are the pre-runs per-project execution sandboxes, and 7 of them
  on dev carry a `manifest.json` at `manifestSchemaVersion: 1` holding a
  `projectId` and no `runId`, with outputs at `{projectId}/m001/*.csv` rather
  than `outputs/{moduleId}/`. So "has no manifest" does **not** discriminate
  them, and a v1 manifest can never be transformed forward anyway (no `runId`,
  and the layer rule forbids deriving one from the directory name). **Leave them
  alone entirely.** They are `backfill_runs.ts`'s source until Phase 4, which
  owns their removal as part of the `sandbox` → `runs` rename.
- **Late arrivals still need transforming**, so `getRunManifestCached` transforms
  on load too, before `MANIFEST_CACHE.set` (that cache has no invalidation,
  because packages are immutable). Same function as the sweep — one code path.
  Call `evictRunFromManifestCache(runId)` after a sweep transform.

## 6. Failure policy

`getRunManifestCached` currently throws for four different reasons and every
caller treats them identically. The transform splits them, and the dividing line
is **operational fault vs code defect**:

| Case | Meaning | Policy |
| --- | --- | --- |
| 1. `manifest.json` absent | Directory missing, or a published-failed generation dir (those deliberately carry no manifest) | **Operational.** Sweep skips it, logged. Read path degrades as today. |
| 2. Present, not parseable JSON | Truncated write, half-finished rsync | **Operational.** Same as 1. |
| 3. Parses, fails `runManifestSchema` | Real shape drift — why this plan exists | Force the transform. Still invalid after → **fail-stop boot** (code defect). |
| 4. Version **below** current | Same drift, detectable without a parse failure | Same as 3. |
| 5. Version **above** current | Not invalid data — data *not for this server* | Refuse that package (unavailable). Boot continues. |

Cases 3 and 4 are PROTOCOL_APP_MIGRATIONS' principle 4 unchanged, including its
FAQ's fleet handling (each instance validates independently; fix the block,
redeploy).

**Cases 1 and 2 must not fail boot**, and the reason is concrete: backups are pg
dumps, so a restore brings back `runs` catalogue rows while the package
directories are absent until the deferred backup file channel exists. Failing
boot there would regress a documented, live-verified behavior — a missing package
degrades loudly through the typed "run unavailable" states. The existing degrade
paths are deliberate and stay:
[getRunReadContext](server/run_query/run_read.ts#L122-L127) returns
`"Results run unavailable: …"`, and
[projects.ts:68-74](server/db/project/projects.ts#L68-L74) degrades the project
shell to empty lists **on purpose**, so authored slide decks, reports and
dashboards stay reachable while the query routes carry the error. Do not "fix"
that catch.

Consequence to accept: on the **load** path (not the boot sweep), a case-3
failure also lands in that catch, so a code defect that only manifests on a
late-arriving package is visible only in the log. Acceptable for the same reason
the catch exists.

## 7. Caches

The protocol's model is that the transform invalidates what it affects
(po_config.ts clears `_PO_DETAIL_CACHE` per row). For manifests, in
[server/routes/caches/visualizations.ts](server/routes/caches/visualizations.ts):

- **Bump `PO_CACHE_VERSION`, not a cache prefix.** `_PO_ITEMS_CACHE`,
  `_METRIC_INFO_CACHE` and `_REPLICANT_OPTIONS_CACHE` all use
  `versionHashFromParams: () => PO_CACHE_VERSION`, and that constant exists for
  exactly this case — *"Bump when a code change alters the MEANING of a cached
  results payload… invalidates the stale entries exactly once, then the caches
  resume hitting normally."* A prefix bump would orphan every key until TTL.
- **`_PO_DETAIL_CACHE` does need a prefix bump** (`po_detail_v5` → `_v6`); its
  version hash is `presentationObjectLastUpdated|runId`, with no code dimension.
- **Audit the fourth persistence layer.** CLAUDE.md's rule names three; a
  manifest field can additionally be snapshotted into stored `FigureBundle`s
  (PLAN_EFFECTIVE_FORMAT §6 is a live example), which needs its own data
  transform with a forced skip-gate.

## 8. `runs.summary` is not touched

`RunSummary.manifestSchemaVersion` is written by both writers and **read by
nothing** (verified). Ruling: display-only provenance of how the package was
originally written, never a gate. The sweep does not update it.

A naive "refresh" would rebuild `RunSummary` from the manifest and silently wipe
three fields that are deliberately *not* in the manifest: `attachTargetProjectIds`
(read structurally by the launch concurrency guard via
`summary::jsonb -> 'attachTargetProjectIds'` in
[run_generation.ts](server/db/instance/run_generation.ts#L485)),
`backfillSourceProjectId` (the parity rig's gating key), and `diskSizeBytes`.
Leaving the catalogue alone also keeps the sweep and the load path identical
functions, and keeps the transform free of any DB dependency.

## 9. Atomic write

Transform in memory, `.parse`, **then** persist — there is nothing to restore
from if it fails. Write `.tmp-manifest-{crypto.randomUUID()}.json` in the package
dir and rename over `manifest.json`; a unique name, never a fixed one, so two
writers can never share a temp file.

Retain the pre-transform file as `manifest.v{n}.json` (measured cost: 166 KB
median, 761 KB max per package). This is what makes both a bad transform and an
image rollback recoverable, per §3.

`sweepAbandonedTmpRunDirs` matches *directories* only, so a leftover temp
manifest has no sweeper — clean up in a `finally`, or extend that function.

No lock is needed, and the reason is **not** byte-identity of concurrent
writers: `await dbStartUp()` is top-level at [main.ts:72](main.ts#L72), before any
serving begins, and
all eight `getRunManifestCached` callers are main-realm (no Web Worker reads a
manifest today). Record that as the premise so it gets re-checked if one ever
does.

## 10. What this unblocks deleting

PROTOCOL_APP_MIGRATIONS' "What NOT to Do" already forbids what the package read
path does today — *no runtime adapters, no permissive fallbacks.*
[run_read.ts:498-501](server/run_query/run_read.ts#L498-L501) is one:

```ts
// Absent from packages captured before the variant feature → readInputRows returns [].
```

A read-time tolerance branch standing in for a transform. Target state:

> **The read path parses the manifest only. Input mirrors are raw provenance.**

Each catalog moved into the manifest removes a file from the read path's compat
surface — the same argument run_manifest.ts's header already makes. Subject to
§4's permanence rule.

## 11. Build order

Items 1–4 are pre-rollout and change no behavior on a fleet with no packages
(the transform has no blocks yet). Item 5 belongs to PLAN_EFFECTIVE_FORMAT.

1. **`server/runs/manifest_transform.ts`** (new) — `transformRunManifest(manifest,
   runDir)` plus `manifestNeedsForcedTransform(manifest)`. po_config.ts's header
   comment style, with a numbered TRANSFORM BLOCKS list (empty initially). Export
   from [server/runs/mod.ts](server/runs/mod.ts). Then rewrite
   [manifest_cache.ts](server/runs/manifest_cache.ts): replace the version throw
   with transform-on-load + refuse-if-future (§6), transforming before
   `MANIFEST_CACHE.set`.
2. **Boot sweep** in [server/db_startup.ts](server/db_startup.ts) — over
   `SELECT id FROM runs`, placed **after** the existing `sweepAbandonedTmpRunDirs()`
   / `resetDuckDbSpillDir()` / `markInterruptedGeneratingRuns()` calls (~line
   143-145), so it never sees debris those lines remove.
3. **`validate_run_manifests.ts`** + a `./validate_run_manifests` bash wrapper at
   repo root, modelled on `./validate_migrations`. Standalone, **not** chained
   into `deno task typecheck`: every data-dependent rig in this repo is
   standalone (`./validate_migrations` spins its own Postgres,
   `./validate_queries` needs `PG_*`, `validate_results_runs_parity.ts` runs per
   instance via `docker exec`) while `typecheck` is static only. Needs
   `--env-file --allow-env --allow-read --allow-write`, because importing
   anything under `server/runs/` pulls in `exposed_env_vars.ts`, which throws
   without `SANDBOX_DIR_PATH`. It must:
   1. Replay the transform over **copies** of every dev package in a temp dir —
      never the instance directory, which would mutate the corpus and make every
      subsequent run vacuous.
   2. Assert each result parses at the current schema.
   3. Assert idempotency: a second pass is a no-op.
   4. Assert **provenance preservation** — every carried field in §4 is
      unchanged before/after. This is the check that catches an invented value
      and is the most valuable one. Structural deep-equal on those fields, not
      byte-comparison of the file: the writer emits `JSON.stringify(m, null, 2)`,
      so key order would cause false failures.
   5. **Exit non-zero on an empty corpus.** `_example_instance_dir/` is
      git-ignored, so elsewhere the rig would otherwise certify green having
      tested nothing.
4. **Docs**: a "Run manifest transforms" section in PROTOCOL_APP_MIGRATIONS.md
   (the four differences in §5, the invariant in §4, the failure policy in §6);
   a format note in SYSTEM_08; the §3 amendment in VISION_RESULTS_RUNS.md.
5. **First real block** — the `indicators[]` catalog, `RUN_MANIFEST_SCHEMA_VERSION`
   2 → 3. See PLAN_EFFECTIVE_FORMAT §4.2.

`server/runs/**` is already claimed in SYSTEM_08's `globs:`, and root-level `*.ts`
other than `main.ts` is outside `lint_systems.ts`'s file set, so neither the new
module nor the new validator needs a globs change.

## 12. Decided — do not re-litigate

- This is the protocol's data-transform pattern. Not a version ladder, not
  archived per-version schemas, not a full manifest rebuild, not a runtime
  adapter or nullable-and-tolerate fallback.
- Blocks re-evaluate every boot. Gate with `safeParse` **and** the version
  integer.
- Enumerate the `runs` catalogue, never the filesystem.
- Transform on load as well as at boot, with the same function.
- The sweep never writes `runs.summary`.
- Transform in memory → parse → atomic rename under a unique temp name; retain
  the pre-transform copy.
- Invalid after a transform ran = fail-stop boot. Version above current = that
  package is unavailable, boot continues. **Absent or unparseable files are
  operational, never fail boot** (§6) — a pg-dump restore brings catalogue rows
  back before the directories.
- The existing degrade paths stay: do not "fix" `projects.ts`'s catch or
  `getRunReadContext`'s typed error. They are deliberate and documented.
- The legacy `{projectId}` sandbox directories are left entirely alone. Phase 4
  owns removing them.
- `PO_CACHE_VERSION` bump for the three code-dimensioned caches; prefix bump for
  `_PO_DETAIL_CACHE`.
- Provenance is carried, never invented. Generation-only fields are nullable
  forever.
