# Plan: Results Runs — file-based immutable results + DuckDB query layer

> **START HERE (continuing this plan).**
>
> **What this plan is, in four lines.** Module results stop living in
> per-project Postgres. Each generation act produces an immutable **run
> directory** keyed by a run id; the viz query layer queries its parquet via
> **DuckDB**; caches key on the run id; a project holds a pointer
> (`projects.run_id`) to the one run it serves from; generation is an
> instance-level wizard. Projects become pure authoring spaces. All of that
> is BUILT and green on this branch, INCLUDING the whole user-model surface.
> What remains is one item — a rig outcome, a docs sweep and the exit gate —
> then Tim's rollout, which is his to run, not an agent's.
>
> **Your next action is Phase 3 core item 5 (rig `foreign_run` + the closing
> docs sweep + the exit gate) — the LAST item.** The work list is "**Phase 3
> core — work items**", inside the Status section's "Phase 3 re-cut"
> subsection: **items 0, 1, 2, 3, 3b and 4 are DONE; only item 5 remains.**
>
> **Standing design rule for anything touching a results package (Tim,
> 2026-07-30).** **If the answer to a question lives inside the run package
> directory, a project user attached to that package can see it.** What a
> package contains does not depend on who is asking — only the chrome around
> it does. So exploring a package is ONE capability rendered from
> `_shared/results_package/` on both the instance catalogue and a project's
> package tab; when you need something new there, decide first whether it
> belongs to the PACKAGE (shared component, both surfaces get it) or to a
> SURFACE's relationship with the package (that surface's own chrome). The
> same rule made the AI tools host-agnostic: they take a run RESOLVER, never
> a runId from the model. This rule replaced an earlier "debug vs content"
> split that item 3 shipped and item 3b removed — do not reintroduce it.
>
> **Read, in this order — nothing outside these four is required reading:**
> (1) the Status block down through "Phase 3 re-cut" — the decided model,
> the fork rulings, and the signed-off design, where each item's FULL SPEC
> is the matching bullet in "Phase 3 core — design"; (2) "**How to work a
> Phase 3 item**" immediately above the work-item list — operating rules,
> the two gate commands verbatim, where the code lives, dev setup, known
> traps; (3) your item's entry in "Phase 3 core — work items"; (4) "Binding
> implementation decisions" + "Empirical gotchas" (closed — do not
> re-derive). Everything the design settles is settled: build it, don't
> re-litigate it.
>
> **Definition of done for an item:** both gates green (`deno task
> typecheck`, then re-backfill + the parity rig `--run`), live-verified on
> the dev instance by a throwaway harness, the item's own new files claimed
> in a `SYSTEM_NN_*.md` `globs:` list, a build record written INTO that
> item's entry here, and ONE commit — then a SECOND, doc-only commit that
> writes that commit's own hash into the repo-state note below (a hash cannot
> record itself; every item so far did exactly this, e.g. `17996969` then
> `dfc77fe0`). The exact commands are in the operating
> rules. Then stop — one item per session. **Item 5 adds one thing on top:
> it closes with the EXIT GATE, a single live pass over the whole user model
> rather than one item's slice — see its entry.**
>
> **Repo state.** Branch is `results-runs`; do NOT touch `main` and do NOT
> merge this branch into it. Each item is one commit (item 0 = `aef409ea`,
> item 1 = `92cce0ba`, item 2 = `823d6575`, item 3 = `5d7d6b90`, item 3b =
> `676a83a8`, item 4 = `17996969`). Still, do not assume the tree is clean: always run
> `git status` first, and expect files outside your scope — parallel
> workstreams are normal here, and their errors are not yours to fix without
> asking. Never create a branch.
>
> **How to read the old sections.** Everything above "Phase 3 re-cut" is a
> BUILD RECORD of work that already shipped on this branch (the wizard
> deploy's items 1–8, the identity read plane, the post-merge review). It is
> history, kept deliberately; it describes the code AS OF ITS OWN DATE and
> is NOT a description of the current tree. Where Phase 3 superseded it, the
> newer section wins and usually says so. Do not "correct" a build record,
> and do not treat a closed item's description as a to-do. **Two LIVE
> exceptions sit above that line and are not history — "Deploy phasing" and
> "The modules repo rides the deploy" are Tim's current rollout runbook, and
> item 5's entry points back at them.**
>
> **The "DESIGN QUESTIONS" block just above the work-item list is CLOSED.**
> Every question (Q-A run identity, Q-B progress SSE, Q-C reuse base, Q-D
> cache GC, Q-E rig gating, Q-F viewer permissions, Q-G the under-guarded
> static mount, and the `createProject` oddity) was ruled by Tim on
> 2026-07-29; read them as decided and build them. Q-C also amended §3.7's
> reuse and storage bullets. **One exception: Q-F was partly RE-RULED by
> item 3b** — its UI half ("the viewers live only on the instance surface")
> is dead, and its route guard became the deferred question below; the Q-F
> entry says so in place. **Nothing in this plan needs a decision before it
> can be built.** If you hit a real hole the design does not cover, raise it
> with Tim rather than inventing a ruling.
>
> **One open question, deliberately deferred — it did NOT block item 4 and
> does not block item 5.** What permission governs a package's INTERNALS
> (script, log, raw output files)? Item 3 made them `can_configure_data`; Tim then ruled the
> governing principle is "**if the answer lives inside the run package
> directory, a project user attached to that package can see it**", which
> points at any member of an attached project (§2.6's original wording).
> Item 3b restructured the code so this is a one-expression change when
> settled, and explicitly left it unsettled — **do not decide it yourself,
> and do not wait on it.** Full context in item 3b's build record.
>
> **After item 5** the Phase 3 core is done and the branch is ready for
> Tim's rollout (see "Deploy phasing"): trial prod instance → backfill →
> rig there → fleet, Ethiopia early. **Do not deploy — that is Tim's call
> and Tim's runbook.** Three preconditions and two Tim-only decisions sit in
> the pre-deploy checklist, and one of them is easy to get wrong: the
> wb-fastr-modules repo is a shared single-HEAD dependency that rides the
> deploy AND must ride any rollback ("The modules repo rides the deploy",
> under Deploy phasing). Demolition (Phase 4) stays gated on
> fleet verification and is NOT part of this build.

## Status: Phase 3 core IN PROGRESS — items 0, 1, 2, 3, 3b and 4 DONE (both gates green), item 5 is the last one

The wizard-deploy build is DONE and CLOSED; main has been MERGED INTO this
branch (never the reverse — `results-runs` has NOT been merged to `main`); the
post-merge adversarial review is FIXED, with the exit gate PARITY GREEN on the
merged+reviewed tree 2026-07-28 (719 checks, extended corpus; branch HEAD
`675b63be` at that date). RE-CUT 2026-07-29 (Tim): the Phase 3 USER-MODEL CORE
now ships BEFORE the deploy (see "Phase 3 re-cut") so users get ONE big change
(instance-based packages), not two. Phase 3 core progress: **item 0
(dual-write deletion) DONE, item 1 (defaults store + instance-shell wizard
entry + run identity + catalog-wide reuse + createProject cleanup) DONE, item 2
(attach-at-launch: confirm-step multi-select + launch-time target eligibility)
DONE, item 3 (catalogue + disk size + guarded hard delete + Q-B/Q-D/Q-F/Q-G)
DONE, item 3b (shared package explorer + host-agnostic AI tools, Tim's
correction to item 3's debug-vs-content split) DONE 2026-07-30, item 4
(project picker + compatibility report + repoint + the client cache guard)
DONE 2026-07-30 — rig PARITY GREEN 719 checks after a full dev re-backfill;
only item 5 remains.** After item 5 comes Tim's rollout (trial instance → backfill + rig there → fleet,
Ethiopia early as the Ethiopian-quarter gate). Everything below this line is
the build record

**This section is the authoritative statement of what is decided and how it
deploys.** Re-cut with Tim on 2026-07-12 after the adversarial pre-deploy review
([REVIEW_RESULTS_RUNS_DEPLOY1.md](REVIEW_RESULTS_RUNS_DEPLOY1.md)): **the
two-deploy structure is collapsed to ONE deploy.** The interim mutable
sandbox-package serving plane (the old Deploy 1) is CANCELLED and never deploys;
the wizard + run identity (the old Deploy 2) ship together as the single
cutover. This supersedes the 2026-07-10 two-deploy cut and the original phasing
wherever they disagree (§1–§3 and §5–§11 remain the technical grounding and
end-state spec).

**Why:** 9 of the review's 27 confirmed findings — including the one critical
(mid-run partial CSVs snapshotted into the serving plane) — are artifacts of the
interim plane's consistency machinery (eager finalize + stamp-match self-heal),
which only exists because per-module rerun keeps the package mutable. Whole-DAG
generation into `runs/.tmp-{runId}` with abort-on-any-fail kills the class by
construction: no mid-run file is ever in a serving location, a failed generation
never replaces the serving run, nothing mutates so there is no self-heal to be
blind, and runId cache keys end the version-hash blindness (review findings 1,
2, 4, 7, 8, 9, 10, 13, 14 — dissolved). Hardening a consistency machine whose
entire purpose was to be deleted by the next deploy was rejected; rollback is
SIMPLER without the interim deploy (the dual-write keeps Postgres current, so
the previous image just works).

### The decided model

1. **The run package.** Every project reads ONE immutable run: a directory at
   `runs/{runId}` holding everything generation consumed and produced. Contents
   (§2.1 layout):
   - module output CSVs + normalized query parquet (`{roId}` + `{roId}.parquet`,
     the four ingest normalizations applied)
   - `inputs/` — dataset extracts, indicator/snapshot mirror JSONs, facilities
     parquet (later: pinned assets, geojson)
   - `manifest.json` (schema-versioned, `lib/types/run_manifest.ts`) —
     module/metric/RO catalog verbatim; per-RO query metadata (columns +
     declared types, physical time column, bounds, row count, available
     disaggregation options); per-metric availability stamps with reasons;
     CAPTURED instance config (facility columns, calendar, countryIso3); dataset
     version stamps. Identity is in the artifact from the first shipped
     manifest: `runId` required, and **no `projectId` or any other instance FK
     inside run files** (review finding 24; §9 layer rule) — the branch's
     manifest schema is reworked accordingly.

2. **One writer: the wizard.** Whole-DAG generation into `runs/.tmp-{runId}` →
   ONE finalize at the end (wholesale manifest + inputs rewrite, §2.3/§3.8) →
   atomic rename → `projects.run_id` repoint. No eager-finalize hooks, no
   per-request self-heal, no mutable serving state — that machinery is deleted
   from the branch, not hardened. Instance config is captured into the manifest
   at generation (the SNAP-1/N1 capture semantics, unchanged).

3. **Reads consult only the attached run**: manifest for ALL metadata (zero live
   probes, zero mirror-table SQL), DuckDB over the run's parquet for ALL data
   queries, shared generated SQL via the engine seam. Caches key on runId (§2.5
   — restore the re-key from the branch's pre-re-fit commits); client T1 gains
   `attachedRunId`, and a typed "no run attached" state replaces the `"unknown"`
   sentinel. The Postgres read functions stay in-tree ONLY as the parity rig's
   baseline until demolition — routes never branch.

4. **Dual-write is the rollback path.** **SUPERSEDED 2026-07-29 (Tim, Phase 3
   re-cut ruling 5): the dual-write is DELETED from the branch before the
   deploy — no backwards compat. Rollback = hosting-level restore of the
   pre-deploy instance volume. The pg read wrappers + `ro_*` stay FROZEN
   solely as the rig's oracle until Phase 4. See the Phase 3 re-cut section.**
   (Original text, kept as the build record:) Wizard execution keeps ingesting
   into the project's legacy `ro_*` tables (today's COPY, unchanged) until the
   fleet is verified. Rollback = redeploy the previous image: the pg read path
   serves current data because the dual-write kept it current, and the parity
   rig keeps its pg baseline the same way. After fleet verification, the
   dual-write, pg read path, and legacy ingest are deleted (Phase 3 entry).

5. **The backfill migration synthesizes each project's initial run**: mint a
   runId, build `runs/{runId}` from the project's current sandbox CSVs +
   project-DB catalog + current instance config (the branch's package-builder
   machinery re-targeted from `sandbox/{projectId}`), set `projects.run_id`.
   Copy, not move — sandbox and Postgres are untouched, so the migration is
   additive and the old image still functions. Two review-driven requirements:
   per-project isolation (one unparseable project must not block the others —
   finding 14), and serving must start BEFORE the backfill finishes (finding 3):
   projects without a run show the typed "no run attached" state until their
   synthesis completes.

6. **No runtime cutover flag.** One read path in the build; staging = trial prod
   instance + rig; rollback = hosting-level volume restore (ruling 5 replaced
   the previous-image rollback stated here); cache correctness via the standard
   knobs (`PO_CACHE_VERSION`, key prefixes) plus runId keys after this deploy.

7. **Killed in the same deploy**: per-module rerun, the dirty-state cascade,
   per-project dataset re-export UX, the project Data tab attach and module-card
   install/params/update/rerun surfaces — replaced by the wizard. Memoized
   generation (§3.7) ships WITH the wizard so regeneration cost doesn't regress;
   the §6.1/§6.5 hermeticity fixes are its prerequisites and land first.

### Deploy phasing

**Phase 0 — engine adapter + parity rig: DONE** (commit `c9750cf2`). DuckDB
adapter (`server/run_query/`), golden-diff rig
(`validate_results_runs_parity.ts`), and ingest shadow-writing the normalized
`{roId}.parquet` beside every raw CSV on every module run.

**THE deploy (= old Phase 2, absorbing the old Deploy 1's read path) — wizard +
identity + backfill. ALL BUILD ITEMS DONE + its own exit gate passed
2026-07-14.** Scope note, because this sentence predates the Phase 3 re-cut:
"the rollout is what remains" was true of THIS list only — the re-cut then put
the Phase 3 user-model core in front of the deploy, so the build that remains
is Phase 3 item 5, and item 5 has an exit gate of its own (they are two
different gates). Full spec: §4 Phase 2 plus the model above.
Pre-deploy checklist (each recorded where cited): ~~re-run the prod-image
binding smoke for `@duckdb/node-api@1.4.5-r.1`~~ DONE 2026-07-29, PASS (Phase 0
bullet addendum); push
wb-fastr-modules (local HEAD `004fdc2` — contains both the pinned-asset and
showNValues workstreams, 4 unpushed commits ride the deploy — **and read
"The modules repo rides the deploy" below before pushing**); add
the runs volume to the POSTGRES container in each instance's compose (item 7
notes + Dockerfile comment). **Two decisions for Tim, neither blocking a
build:** (1) whether to gate the copilot's `get_module_r_script` /
`get_module_log` out of a non-admin's toolset — after item 3's permission move
they answer a non-instance-admin project member with a typed permission
failure, and the static "Results Package" view instructions still name both
tools (item 3's build record, "AI tools — flagged, not ruled"); (2) the
deferred package-internals permission (START HERE). Rollout: deploy to one
trial prod instance → serve
starts, the backfill synthesizes runs (docker-exec runbook in item 7) → run the
rig there (pg vs run read path — the pg plane is FROZEN at deploy, so only
each project's backfill-provenance run is gateable; rulings 4/5) → green → roll
the fleet with Ethiopia early (its rig run is the Ethiopian-quarter gate; it
cannot run pre-flip — accepted, mitigated by trial-first ordering and volume
restore). Rollback: hosting-level restore of the pre-deploy instance volume
(ruling 5, which supersedes model point 4's previous-image rollback) — **plus a
modules-repo revert, see below**.

### The modules repo rides the deploy — and must ride the rollback too

**Authoritative statement of the wb-fastr-modules coupling (Tim, 2026-07-30);
verified against both images' schemas the same day. Ruling 5's volume restore
is NOT a complete rollback on its own.**

The modules repo is a **shared, single-HEAD dependency**: both images fetch
`definition.json` from the same GitHub HEAD, and nothing versions it per
deploy. `installModule` pins no gitRef (only the wizard's per-generation
resolve does), so "which definitions does prod see" is simply "whatever HEAD
is" for both the new image and a rolled-back one.

So **treat every wb-fastr-modules change from here until the results-runs
image is confirmed keeper-status at prod as provisional, and know its revert
target**: the last pushed commit before this deploy's batch is
**`babd30d` ("hfa carry-forward")**. There are no tags in that repo — tag or
write down `babd30d` before pushing, because a rollback needs it and the
4-commit batch will bury it.

What actually breaks if you restore the volume and the old image but leave
the modules repo at the new HEAD:

- **Restored data is fine.** Installed module rows in the restored project DBs
  are stored blobs read with the INSTALLED schema; nothing re-fetches them, so
  the old image serves restored projects normally. The coupling is latent, not
  immediate — which is exactly why it is easy to miss.
- **It bites on the next act that FETCHES from GitHub.** On main those are
  `installModule` (which on main also runs at PROJECT CREATION) and the
  update/reinstall path — both call `getModuleDefinitionDetail` →
  `load_module.ts`'s `moduleDefinitionGithubSchema.safeParse`.
- **And for one change already unpushed it is a HARD failure, not a silent
  degrade.** `assetsToImport` widened from `z.array(z.string())` to
  `z.array(z.union([z.string(), repoAssetToImportGithub]))` (the pinned-asset
  workstream), and **m004/m005's `definition.json` now carry object pins**.
  The old schema rejects those outright — invalid `definition.json` fails at
  fetch time with a Zod path dump, by design (S8: "no silent normalization").
  On a rolled-back image, creating a project or touching m004/m005 errors.
- **`s.showNValues` is the softer, latent case.** It is an OPTIONAL key added
  to the app's schema; Zod strip mode means an old image would silently DROP
  it rather than fail — the CLAUDE.md silent-drop trap. No `definition.json`
  authors it yet, so it costs nothing today and would cost a lost setting
  later.

**Therefore the rollback runbook is: restore the instance volume + previous
image AND reset wb-fastr-modules to `babd30d`** (or whatever the pre-deploy
pushed HEAD is at that time). Rolling back one without the other leaves prod
in a state neither image was tested against.

**Phase 3 — instance-level factory + catalogue + attach**: RE-CUT 2026-07-29 —
its user-model core now ships BEFORE this deploy (see "Phase 3 re-cut" below);
§4's Phase 3 entry is annotated accordingly. **Phase 4 — demolition + docs**:
unchanged from the original spec (§4 below), still gated on fleet verification.

### What is on the branch — salvage map (EXECUTED 2026-07-12)

The old Deploy 1 was built to code-complete (re-fit `d81ac24d`) before the
collapse decision; the branch was re-fit again, not restarted. **This map was
executed by the identity read plane re-fit (see the DONE section below) — kept
as the record of what moved where.** The one future-facing remainder:
`synthesize_run.ts`'s finalize also becomes (a) the wizard's once-per-generation
finalize at the wizard build. Disposition as ruled:

- **Kept as-is**: `server/run_query/` — `duckdb_executor.ts` (cold instance per
  call, integer_division, BigInt→number), `csv_to_parquet.ts` (declared types,
  `allow_quoted_nulls=false`), `pg_type_map.ts`,
  `write_results_object_parquet.ts` (the four ingest normalizations + shared
  `computeResultsObjectColumnsToExclude` drop rule; stays as the ingest
  shadow-write until the wizard owns parquet), and `run_read.ts` minus the
  self-heal; the parity rig (all three modes); the engine seam + pg wrapper
  split (wrappers stay solely as the rig baseline); migration 056 + the `runs`
  table + `projects.run_id` (dormant → live); the SQL→JSON mirror-table rewrite
  surface (§2.4); `PO_CACHE_VERSION` "6" + `po_detail_v3`. (Since renumbered/
  rebumped at the merge: migrations 056/057/030 → **065/066/038** onto main's
  tail, cache knobs → "10"/v5 — see Binding decision 2.)
- **Restored from branch history**: the runId cache re-key (§2.5), the `runId`
  payload fields, and client `attachedRunId` from the original Phase-1 cut
  (reverted in the `d81ac24d` re-fit; comes back now), with `po_detail` folding
  runId.
- **Re-targeted**: `server/runs/` — `package_builder.ts`'s finalize (wholesale
  manifest+inputs rewrite, per-file tmp+rename, per-RO parquet build) becomes
  (a) the wizard's once-per-generation finalize and (b) the backfill
  synthesizer, both writing `runs/{runId}`, minting runId, no projectId in the
  manifest (review finding 24); `run_paths.ts` re-points to `RUNS_DIR_PATH`;
  root `build_results_packages.ts` becomes the operator backfill runner.
- **Deleted from the branch — never ships**: the eager-finalize hooks at every
  project-level act (`set_module_clean`, dataset routes, module routes, project
  create/copy); the per-request stamp-mismatch self-heal
  (`getPackageReadContext`'s sandbox resolution → `projects.run_id` resolution);
  the mtime-keyed `manifest_cache.ts` (immutable runs key by runId); the boot
  sandbox-package migration in `db_startup.ts`.

### Pre-deploy work items from the review (= work item 8's spec — EXECUTED 2026-07-14, see item 8's build notes)

The review findings that survive the collapse (report buckets 2–3) and must ship
with or gate this deploy. **Ops findings 3/18/20 are DONE (work item 7).**
Everything below was RE-VERIFIED against the current branch on 2026-07-14 — the
review's file:line citations predate items 2–7, so use THESE locations, not the
review's. Full evidence per finding:
[REVIEW_RESULTS_RUNS_DEPLOY1.md](REVIEW_RESULTS_RUNS_DEPLOY1.md).

- **Engine** — finding 11: `DUCKDB_MEMORY_LIMIT = "512MB"`
  ([duckdb_executor.ts:14](server/run_query/duckdb_executor.ts#L14), applied
  :37) OOMs on ordinary Nigeria-scale disaggregations (60M rows ×
  `facility_name`); size it deliberately AND set an explicit `temp_directory`
  (nothing sets one today — the default spills to the process CWD). Finding 12:
  `executeSqlOverParquet` pins no result order; DuckDB group-by output order is
  nondeterministic and charts with `sortIndicatorValues: "none"` (a shipped
  default) render raw order — pin a deterministic order at the executor boundary
  (the option-LIST ordering is already handled separately by the
  `getPossibleValuesCore` TS re-sort, binding decision 2 — this finding is about
  ITEMS row order).
- **Rig gates** (all in
  [validate_results_runs_parity.ts](validate_results_runs_parity.ts); its gate
  today is `diffs.length === 0` at :745-746 — nothing else fails it). Findings
  5/6: GREEN must fail on skips and duck-side exceptions. Current skip sinks
  that must become gating: NO RUN ATTACHED project skip (:655), per-PO skips
  (:447 detail-failed, :467 module-not-run, :505/:510 fetch-config, :702), and
  `both_error` outcomes (:535/:566/:618) which can hide a duck-side regression
  behind any pg-side error (finding 27's half — the other half, gating
  option-ORDER divergence currently reported as warnings, also lands here).
  Finding 15: the rig never diffs the raw-rows preview —
  `getResultsObjectItemsFromRun`
  ([run_read.ts:771](server/run_query/run_read.ts#L771)) vs the pg baseline.
  Finding 25: the rig never reads `metricAvailability` — diff the manifest
  stamps (via `getMetricsWithStatusFromManifest`,
  [run_read.ts:504](server/run_query/run_read.ts#L504)) against the pg
  baseline's metric statuses; this deploy made the stamps authoritative (item
  5), so a wrong stamp is now user-visible. Finding 16: corpus breadth — the
  stored-PO corpus underexercises rollup, facility-column groupBys, some
  periodFilter types, and non-default replicant panes; add synthetic configs for
  the gaps (the virtual-defaults enumeration from item 5b already widened the
  corpus 129→214). Finding 26 is PARTIALLY DISSOLVED: `--run` mode now resolves
  each project's attached run through `getRunReadContext` (the real
  composition); what remains of it is covered by findings 15/25 above (the two
  flipped surfaces the rig still doesn't touch).
- **Hygiene** — finding 19 MORPHED: the ingest shadow-write (and its stale
  comment) died with item 5's worker deletion, but
  [write_results_object_parquet.ts:11](server/run_query/write_results_object_parquet.ts#L11)
  now cites `storeResultsObject in run_module_iterator.ts` — a DELETED file;
  re-point it to `generate_run/legacy_store_results_object.ts`. Finding 21: the
  SYSTEM_09 header banner still describes a `RESULTS_READ_PATH` flag that never
  shipped ([SYSTEM_09_viz_query_cache.md:24-27](SYSTEM_09_viz_query_cache.md)) —
  correct the banner text only (the full S9 rewrite is Phase 4). Finding 22:
  `columnExistsFor` ([run_read.ts:178](server/run_query/run_read.ts#L178)) still
  swallows EVERY duck error as "column absent" in its catch — only a
  missing-column error may mean false; infra errors must throw.

### Identity read plane: DONE (2026-07-12)

Every dev project now serves from a synthesized immutable `runs/{runId}`
resolved via `projects.run_id`; runId-keyed caches; rig green against that
composition. Exit gates passed: `deno task typecheck` (server + client + systems
lint) and PARITY GREEN in `--run` mode on the dev instance (8/8 projects, 129
checks, 0 diffs, 0 skips). What landed:

1. Manifest schema reworked: `runId`/`label`/`provenance`/`rImageTag` required,
   `projectId` removed (no instance FKs in run files); `RunSummary` (with
   `sourceProjectId` — DB-side only) restored for the catalog row.
2. `package_builder.ts` → `server/runs/synthesize_run.ts`
   (`synthesizeRunForProject`): builds `runs/.tmp-{runId}` from sandbox CSVs
   (copying the ingest shadow-write parquet when fresh) → atomic rename →
   catalog row + `projects.run_id` repoint in one transaction; root runner is
   `backfill_runs.ts` (per-project isolation).
3. `run_read.ts`: `getRunReadContext(mainDb, projectId)` resolves
   `projects.run_id` (null → typed "No results run attached" error); self-heal
   and stamp-matching deleted; manifest/input caches keyed by runId (immutable,
   no mtime stats).
4. Cache re-key: `po_items`/`metric_info`/`replicant_opts` uniqueness = runId
   (version = `PO_CACHE_VERSION` only); `po_detail` folds runId into its
   version; holders carry `runId` (absent only in the rig's pg baseline, which
   is never stored). Client: `ProjectState.attachedRunId` (from
   `projects.run_id` via ProjectDetail/SSE `starting`), `runVersionKey` replaces
   `moduleDataVersionKey`/`datasetsVersionKey`; client `po_detail` folds the run
   key too.
5. Eager-finalize hooks (module-run completion, dataset add/remove, module
   install/uninstall/param/definition, project create) and the boot
   sandbox-package migration deleted; project copy now clones the run POINTER
   (§2.8); `RUNS_DIR_PATH` revived (Deno namespace only — the
   `_EXTERNAL`/`_POSTGRES_INTERNAL` namespaces + docker-compose volume ride the
   wizard deploy); boot ensures the runs dir + sweeps `.tmp-` debris;
   `migrateMetricsColumns`' metric_info cache clear removed (immutable runs make
   it meaningless).
6. Rig `--package` → `--run`: resolves each project's attached run. (Skipping
   unattached projects was the behavior AT THIS DATE; item 8 later made every
   skip — including NO RUN ATTACHED — a gating RED result. See item 8.)

Known interim behavior: superseded run dirs/rows accumulate. (Resolved by the
Phase 3 re-cut ruling 3: there is NO automatic GC — reclamation is the
catalogue's guarded hard delete, an explicit operator act, built by Phase 3
core item 3.) Wizard publishes push `run_attached`, but backfill-script
repoints emit no SSE — after `backfill_runs.ts`, clients learn the new
`attachedRunId` on reconnect. (The original note about module reruns not
updating the served run is void since item 5 — the per-module rerun surface no
longer exists; the wizard and `backfill_runs.ts` are the only generation paths.)

### Next milestone: the wizard deploy (everything below ships in THE deploy)

Rulings landed 2026-07-12 (see §10): generation is **instance-admin only**; the
choose-data step reuses the **per-project dataset windowing UI verbatim**
(pre-scoped-runs trade accepted); UI label = **"Results package"** ("run" stays
the internal/code/DB name); **raw CSVs stay in runs until R emits parquet
natively**, then drop. No §10 blockers remain for this milestone (Q1/Q4/Q8 are
Phase 3 design).

**How to work this list** (the CLOSED wizard-deploy list; the live Phase 3
rules are in "How to work a Phase 3 item", which supersedes this paragraph and
repeats everything still current): execute items in order, ONE item per
session, each gated by `deno task typecheck` (which itself runs server +
client + `lint:systems`) + the rig green. NOTE ON NUMBERING: this paragraph and the items it refers to
are the CLOSED wizard-deploy list; the live Phase 3 list is separately
numbered 0–5. Unqualified "item N" in THIS section and in build records dated
2026-07-14 or earlier means the wizard-deploy item N; inside the Phase 3
re-cut section, references to the closed list say "wizard-deploy item N"
explicitly. Rig invocation:
`deno run --allow-all --unstable-broadcast-channel --env-file -c
deno.json validate_results_runs_parity.ts --run`
(same flags for `backfill_runs.ts`). Dev setup: `./pg_run` starts Postgres
(mounts sandbox AND runs volumes — since item 7, dataset extracts COPY straight
into run tmp dirs), `backfill_runs.ts [--project <id>]` re-synthesizes runs;
server/lib code has no --watch, harness-execute functions directly
(`deno run --allow-all --env-file -c deno.json <harness>.ts` with absolute-path
imports). Known rig trap (hit 2026-07-13): a browser- driven wizard generation
that selected a SUBSET of modules leaves that project attached to a legitimately
narrower package than the pg baseline — the rig reports diffs like "duck=Unknown
results object" / "Metric not found" on ONE project while pg is ok. That is not
a code bug; remedy = re-backfill that project (synthesizes a full-catalog run)
and re-run the rig. Everything decided is decided — the binding decisions, §10
rulings, and empirical gotchas sections are closed; do not re-derive or improve
them. An item too large for one session stops at a clean seam with gates green
and records the stopping point inside the item — nowhere else. Items 1 and 2
span wb-fastr-modules (CLAUDE.md three-repo lockstep rule: commit that repo
locally; the push stays deploy-gated — its local HEAD was `6ba142e` at that
date; CURRENT local HEAD is `004fdc2`, 4 unpushed commits riding the deploy). ALL items
are DONE (1–5b, 7, 8; item 6 RETIRED — details inside each item) and the exit
gate below has PASSED (2026-07-14). **This wizard-deploy list is CLOSED. The
live work is now the "Phase 3 core — work items" list in the Status section's
"Phase 3 re-cut" (items 0–2 DONE, items 3–5 remain), worked under the same
operating rules stated in this paragraph — one item per session, gated by
`deno task typecheck` + the rig green, same rig/dev invocations.** After items
3–5 the
dev app exercised the full new UX end-to-end (generate → progress → repoint →
all read surfaces from the run); wizard-deploy items 6–8 were
export/deploy/hardening.

Work items, in order:

1. **§6 hermeticity fixes — DONE 2026-07-12** (gates green: typecheck + PARITY
   GREEN 8/8 projects, 129 checks, 0 diffs/skips). §6.1: m004/m005 scripts read
   the pinned local copies; `assetsToImport` trimmed to the 2 files the scripts
   actually read (the 4 never-read declarations dropped — with hard errors they
   would fail every run for nothing); `importAsset` now throws (module run fails
   loudly on a missing asset). §6.5: m001's undeclared
   `M1_output_consistency_facility.csv` writes removed (no consumer anywhere).
   §6.2: synthesis captures the union of declared assets into `inputs/assets/` +
   manifest `assets` (name+sha256; missing asset at synthesis degrades loudly —
   the module already ran; the wizard finalize inherits the capture). §6.4:
   `rImageTag` stamped from the shared `R_DOCKER_IMAGE_TAG`
   (`server/worker_routines/run_module/
   r_docker_image.ts`). Modules-repo
   commit is LOCAL — the push rides the deploy, and instances must have
   `survey_data_unified.csv` + `population_estimates_only.csv` uploaded as
   assets BEFORE updating m004/m005 (dev seeded already).
2. **The wizard — DONE 2026-07-13 (design signed off by Tim, built over 3
   sessions — see Build progress below).** Two surfaces (Tim's re-cut, replacing
   the single wizard-owns-execution shape): a LAUNCH wizard that is
   configuration only, and a run listing/progress view — the run owns its whole
   lifecycle after launch, so progress is dismissable/returnable by
   construction.
   - **Launch wizard**: project-entered from the "Results package" surface,
     instance-admin gated
     (`requireGlobalPermission
     ("can_configure_data")`, the dataset-attempt
     guard). A fourth `ImportWizardShell` descriptor instance (the ICEH
     descriptor form,
     `client/src/components/_import_wizard/import_wizard_shell.tsx`). Steps: (1)
     choose data — family checkboxes + per-family windowing reusing the
     per-project settings editors verbatim (`WindowingSelector` etc.) against a
     temp store, pre-filled from the attached run's manifest `datasets` info;
     (2) configure modules — definitions resolved from the modules repo at
     latest commit (git ref recorded; pinned repo assets fetched here),
     DAG-aware selection (auto-include prerequisites, block deselect while a
     dependent is selected, disable modules whose data sources aren't in step
     1), params inline via the `ModuleConfigSelections` input rendering,
     pre-filled from the attached run's manifest via
     `getMergedModuleConfigSelections` else definition defaults; (3) confirm —
     label (default "Results package {date}") + selection summary → **Launch**.
     No async work inside the wizard; no pre-launch reuse preview (§3.7 UX
     bullet amended 2026-07-13).
   - **Attempt record**: instance-DB `run_generation_attempts` keyed
     `source_project_id` PRIMARY KEY (the `structure_upload_attempts` pattern —
     one configuring attempt per project), columns
     `date_started/step/status/status_type/step_1_result/step_2_result`;
     `status_type` is only ever `configuring` — execution state never touches
     the attempt. Deleted at launch (and by discard). Resume = re-fetch the row,
     server-driven `step`.
   - **Run pipeline** (post-launch, one worker in
     `server/worker_routines/generate_run/`, shipped worker/docker
     teardown/claim contracts verbatim): catalog row `status='generating'` →
     prepare inputs (mint `runs/.tmp-{runId}`, dataset extracts + parquet twins
     via the item-4 re-targeted COPY TO, asset copies) → resolve reuse (generate
     scripts, compute §3.7 inputKeys, diff vs base run = attached run else
     latest `ready`) → execute stale nodes in dependency order (docker
     containers named `{runId}-{moduleId}`) / copy reused outputs, with
     per-module legacy dual-write (ro_* COPY + project-DB catalog upserts —
     rollback path, model point 4) → ONE finalize (§3.8, extending
     `synthesize_run.ts`'s builder; provenance `"wizard"`, real
     inputKey/outputFileHashes) → atomic rename → `ready` plus `projects.run_id`
     repoint in one transaction → SSE.
   - **Progress — parity with today, push not poll**: new `runs.progress` JSON
     column (module order; per-module `pending|reused|running|done|
     error`;
     current module; error detail) updated by the worker; new project-SSE
     messages `run_progress {runId, progress}` on every state change and
     `run_attached {attachedRunId, projectModules, metrics}` at repoint (also
     fixes the interim reconnect-only gap); `r_script` stream unchanged (live R
     line under the running module; full logs from the run dir via the item-5
     viewer re-point).
   - **Run listing**: on the project "Results package" surface — attached
     package + this project's runs (`sourceProjectId` filter) generating/
     ready/failed + the generate button; the Phase-3 instance-catalogue
     precursor.
   - **Concurrency**: cross-project concurrent generations allowed; ONE
     generating run per project (auto-repoint + base-run diff race guard —
     launch blocked with a clear message); one attempt per project. Ruled
     2026-07-13: the design must include **def-declared pinned repo assets** —
     `assetsToImport` entries become a union: plain string (instance-uploaded
     asset, unchanged) or `{name, repoPath, commit,
   sha256}` — modules-repo
     path + full commit SHA pin, `sha256` computed by the modules-repo build
     from the working-tree file (build fails if `repoPath` missing; authoring =
     two commits: land the data file, then bump the pin to that SHA). The Deno
     server (which already fetches `definition.json` from GitHub) fetches the
     pinned raw file at wizard definition-resolution, verifies sha256, caches
     content-addressed (`repo_assets/{sha256}`); generation copies both asset
     kinds into `inputs/assets/` + manifest identically; module containers stay
     network-free. Repo data updates (survey/population CSVs) thus distribute
     via ordinary module updates instead of per-instance uploads; a pin bump
     surfaces via the existing `compare_definitions` assetsToImport diff and
     changes the module's inputKey → correctly forces a re-run. Supersedes item
     1's interim "upload the two CSVs on every instance before updating
     m004/m005" prerequisite (dev-seeded copies remain valid meanwhile). **Build
     progress (session 1, 2026-07-13 — gates green: typecheck + PARITY GREEN,
     129 checks, 0 diffs/skips; migration + attempt CRUD live-verified on
     dev):**
   - DONE — pinned repo assets end-to-end: `assetsToImport` union in both
     schemas (github + installed; authoring shape `RepoAssetPin`, the
     modules-repo build injects sha256 and fails on missing repoPath or non-full
     SHA); m004/m005 pins authored (survey @ `19f1bf7`, population @ `4d5ffa0`,
     both pushed commits, blob == working tree verified); server resolver
     `server/module_loader/repo_assets.ts` (content-addressed
     `{ASSETS_DIR}/repo_assets/{sha256}`, sha-verified, warmed at definition
     resolution in `fetchModuleFiles`, cache-miss fallback at module run; dev
     reads the local checkout); `importAsset` and the synthesizer's §6.2 capture
     handle both kinds. Executed live: m004 resolution cached both files
     sha-checked. Item 1's per-instance upload prerequisite is now void.
   - DONE — migration `057_run_generation.sql` (`run_generation_attempts`, PK
     `source_project_id` FK CASCADE + `runs.progress`), base schema +
     `DBRunGenerationAttempt`; wire types `lib/types/run_generation.ts`
     (step-1/step-2 result schemas, attempt detail, `RunProgress`; windowing Zod
     schemas promoted to `lib/types/dataset_hmis.ts` as the single source — both
     duplicating registries re-pointed); registry
     `lib/api-routes/instance/run_generation.ts` + routes + DB layer (attempt
     CRUD create/get/step1/step2/delete, `can_configure_data`). Full lifecycle
     exercised over HTTP: create → resume read → step advance/downstream-null →
     discard, plus family/module validation and Zod 400s.
   - DONE (session 2, 2026-07-13 — gates green: typecheck + worker-graph check +
     PARITY GREEN 129 checks 0 diffs; live-verified on dev, see below) — launch
     route + the whole `server/worker_routines/
     generate_run/` pipeline:
     - **Launch** (`launchRunGeneration` route → `generate_run/launch.ts`):
       consumes the attempt (deleted at launch), mints the `runs` row
       (`generating`, provenance `wizard`, initial summary carries
       `sourceProjectId`), spawns the worker. One generating run per project:
       synchronous in-memory claim + catalog check
       (`summary::jsonb->>'sourceProjectId'`); host owns teardown (error
       listener marks run failed, sweeps tmp, `docker rm -f` by the
       deterministic `fastr-genrun-{runId}-{moduleId}` name); worker broadcasts
       on `run_generation_ended` and never self-closes. Boot recovery:
       `markInterruptedGeneratingRuns` in db_startup beside the tmp sweep.
     - **Prepare** (`prepare_inputs.ts`): the LEGACY attach functions are the
       dataset dual-write (sandbox CSV via today's COPY TO + mirror/ snapshot
       rewrite + datasets rows; deselected families detached), then the run gets
       its own `inputs/datasets/{type}.csv` copies + explicit-schema parquet
       twins (per-family type maps — identifiers VARCHAR, no inference) and
       extract sha256s. Item 4 re-targets the COPY TO into the run dir;
       `RUNS_DIR_PATH_EXTERNAL` env added now (R-container mount namespace),
       `_POSTGRES_INTERNAL` stays item 7.
     - **Resolve** (`resolve_modules.ts`): re-fetches definitions at the step-2
       pinned gitRef (`fetchModuleFiles`/`getModuleDefinitionDetail` grew an
       explicit `pinnedGitRef` param; local source ignores pins), validates
       prereq closure + dataSources ⊆ selection, freezes selections via
       `getMergedModuleConfigSelections`, generates scripts (post-prepare
       snapshots), Kahn-orders by prerequisites with registry-order tie-break.
     - **Execute** (`execute_module.ts`): workspace = the run's own
       `outputs/{moduleId}` (R container mounts the tmp run dir, workdir there;
       dev = local Rscript), r_script SSE stream + `___logs___.txt` kept;
       declared-RO existence enforced, undeclared outputs warned + excluded;
       §3.7 inputKey (script text + dataset extract hashes + ALL upstream output
       hashes + asset hashes + R image tag, streamed sha256) and per-RO output
       hashes recorded — every node forced to "run" (item 3 turns on reuse).
       Dual-write per module: outputs copied to the sandbox,
       `upsertModuleCatalogForGeneratedRun` (install-shaped
       modules/results_objects/metrics upsert, dirty 'ready', NO default-PO
       creation and NO orphaned-PO purge — POs must survive for typed not-in-run
       resolution), then today's `storeResultsObject` COPY unchanged.
     - **Finalize/publish**: `synthesize_run.ts` refactored into the shared
       `buildRunPackageIntoTmp` (options: label/provenance/module filter/
       memo/CSV-source dir/extra input files; synthesizer behavior
       byte-identical) → atomic rename → `publishReadyRun` (status flip +
       summary/progress + `projects.run_id` repoint in ONE tx) → SSE.
     - **SSE**: `run_progress {runId, progress}` on every state change
       (`runs.progress` updated first) and
       `run_attached {attachedRunId,
       projectModules, metrics}` at
       repoint, plus legacy
       `datasets_updated`/`module_dirty_state`/`modules_updated` so today's
       client surfaces stay live until item 5.
     - **Live-verified on dev** (harnesses, not routes-only): full launch →
       worker → failure path (R fails at `../datasets/` as expected until item
       4's script re-point: run `failed`, errorDetail + module error stamped,
       tmp swept, guard blocks duplicate launch); prepare stage (extract copies
       byte-from-sandbox, parquet twins DESCRIBE-verified schemas, dual-write
       freshened datasets rows); success path with extracts staged at the legacy
       read location (real m001 run: 5 ROs hashed, ro_* COPY 161k rows, wizard
       manifest with real inputKey/outputFileHashes + availability stamps,
       publish + repoint verified) — then the project re-backfilled to a
       full-catalog run, rig re-run GREEN.
   - DONE (session 3, 2026-07-13 — gates green: typecheck + lint:systems +
     PARITY GREEN 129 checks 0 diffs/skips; the three server reads
     harness-executed live on dev with all prefill parse paths exercised across
     the 8 backfilled projects; client typechecked, not yet browser-driven) —
     the client + the wizard-support server reads. **Item 2 build is complete**
     (reuse = item 3, script re-point = item 4, surface kills = item 5).
     - Server reads (`server/runs/generation_wizard_reads.ts`, routes in the
       run_generation registry, all `can_configure_data`):
       `getRunGenerationPrefill` (attached-run manifest → step-1 shape +
       per-module parameterSelections; no-run degrades to typed empty),
       `getRunGenerationModuleOptions` (definitions at the repo HEAD — ONE
       gitRef for the whole selection via
       `fetchCommits(owner, repo, "", "main")`, because per-path last-touch SHAs
       can predate one another; local source → sentinel `"local"`, pins ignored
       in dev; per module: prerequisites, dataSources split into
       datasetTypes/moduleDependencies, translated params), `listRunsForProject`
       (summary sourceProjectId filter, newest first). `getRunGenerationAttempt`
       response became `| null` (the ICEH attempt-GET pattern; launch handles
       null explicitly).
     - Client SSE: `run_progress` short-circuits to a listener registry
       (`addRunProgressListener`, the r_script pattern — ephemeral, never
       touches T1); `run_attached` lands in the T1 store (attachedRunId +
       projectModules + metrics reconcile + module-map rebuild) so T2 caches
       re-key live at repoint.
     - Wizard `components/results_package_wizard/` (second ImportWizardShell
       descriptor; `getStatus: null`, no status arms; shell grew optional
       `discardLabel`/`errorBackLabel`): step 1 = family checkboxes gated on
       `instanceState.datasetsWithData` + `WindowingSelector` verbatim + HFA
       scope + ICEH; step 2 = DAG-aware selection (closure auto-include,
       deselect blocked while a dependent is checked, modules whose CLOSURE
       needs unchosen families disabled — m004/m005 have no direct dataset
       source, their HMIS need arrives via m002→m001), inline params, seeding =
       resume beats manifest prefill beats defaults via
       `getMergedModuleConfigSelections`; step 3 = label (default "Results
       package {date}") + summary + Launch → close. Resume is server-driven
       step; discard deletes the attempt.
     - Shared extractions (both existing consumers repointed): module param
       input grid → `_shared/module_parameter_inputs.tsx` (settings_generic uses
       it), HMIS windowing validate+normalize →
       `_shared/hmis_windowing_validation.ts` (per-project HMIS settings editor
       uses it).
     - "Results package" surface: new project tab `results_package` (visible to
       global admin / can_configure_data, matching the server guard),
       `components/project/project_results_package.tsx` — runs listing (status
       badges, in-use marker on the attached run, backfill-provenance note),
       live per-module progress chips + current-module r_script line on
       generating runs, failed-run errorDetail, generate/resume entry
       (create-attempt → openEditor, the ICEH host-page pattern); refetches on
       attachedRunId change, unknown-runId progress, and failure. SYSTEM_08
       globs claim the new files. **Placement**: client
       `components/results_package_wizard/` (ICEH-shaped: `index.tsx`
       descriptor + `step_*.tsx`) + the run listing/progress components on the
       project surface; server routes `server/routes/instance/run_generation.ts`
       (route-tracker registered, Zod bodies); worker dir claimed in SYSTEM
       globs. Client work (design and build, here and in item 5) follows the
       panther UI protocols:
       [PROTOCOL_UI_COMPONENTS.md](panther/protocols/PROTOCOL_UI_COMPONENTS.md),
       [PROTOCOL_UI_SOLIDJS.md](panther/protocols/PROTOCOL_UI_SOLIDJS.md),
       [PROTOCOL_UI_STATE.md](panther/protocols/PROTOCOL_UI_STATE.md),
       [PROTOCOL_UI_STRUCTURE.md](panther/protocols/PROTOCOL_UI_STRUCTURE.md),
       [PROTOCOL_UI_STYLING.md](panther/protocols/PROTOCOL_UI_STYLING.md).
3. **Memoized generation — DONE 2026-07-13** (§3.7 = the spec; gates green:
   typecheck + PARITY GREEN 129 checks 0 diffs/skips, re-run after the live
   test). Reuse is on:
   - `resolve_reuse.ts` (new): `resolveBaseRun` (attached `projects.run_id` else
     latest `ready` for the project; unreadable manifest → no reuse, logged);
     `computeModuleInputs` (asset hashes from SOURCE — repo pins use their
     declared sha256, instance assets hashed in the Assets dir, memoized per
     generation — plus dataset extract hashes and ALL upstream output hashes) +
     `computeModuleKey`; `baseEntryForReuse` (non-null matching inputKey AND a
     recorded hash for every declared RO); `planReuse` — the §3.7 UX first
     stage, a pessimistic walk (reused only if all upstreams reused) pushed as
     per-module `reused`/`pending` progress before execution starts.
   - `pipeline.ts`: the loop makes the AUTHORITATIVE per-module decision from
     actual upstream hashes (plan can only upgrade — a re-executed upstream with
     byte-identical outputs still lets downstream reuse); key computation moved
     out of `execute_module.ts` (which now takes the precomputed `inputKey`).
   - `execute_module.ts`: `reuseRunModule` copies the base run's raw RO CSVs
     (all-or-nothing lstat first; `ReuseSourceMissingError` → the pipeline falls
     back to a run, and the run path now STARTS from an emptied workspace so a
     partial copy can never mask a missing R write); finalize stays fresh
     (parquet rebuilt under current config, never copied from base). The legacy
     dual-write (sandbox copy + catalog upsert + ro_* COPY) runs for REUSED
     modules too — pg may have drifted via a legacy rerun, and the rig diffs pg
     vs the run. Shared `dualWriteModuleToLegacyPlane`/`openModuleLog`
     extracted; imported assets added to declaredFiles (they were spuriously
     warned as undeclared outputs).
   - **Deterministic dataset extracts** (discovered gap, required for §3.7 to
     ever hit at scale): the HMIS/HFA export `COPY (…) TO` had no ORDER BY —
     parallel hash aggregation makes row order vary run to run, which would
     change extract hashes and silently defeat reuse of every DAG root.
     Total-order ORDER BY added to the HMIS export (its GROUP BY key), the HFA
     export, and the ICEH export's tie (`source` added). Behavior-compatible
     (row order was never a contract; R aggregates regardless); one extra sort
     per generation, admin-gated.
   - Live-verified on dev (Test project, m001): generation A executed R (~10
     min), generation B with identical config completed in **2.3 s** — progress
     `reused`, identical inputKeys, all 5 output CSVs byte-identical, dual-write
     freshened (`modules.last_run_at`, ro_* COPY 161k rows), fresh finalize
     parquet, publish + repoint; project then re-backfilled, rig re-run GREEN.
     Test runs deleted.
4. **Dataset export re-target — DONE 2026-07-13** (gates green: typecheck +
   lint:systems + PARITY GREEN 129 checks 0 diffs/skips; live-verified on dev).
   The script re-point, per this item's seams — no modules-repo change (the
   dataset path is injected app-side):
   - `getScriptWithParameters` (+ its HFA and calculated-indicators variants)
     takes a required `datasetsDirPath`, per-caller: the legacy `run_module`
     iterator and the module-card script preview route pass `"../datasets"`
     (sandbox layout — both die at item 5); `generate_run/resolve_modules.ts`
     passes `"../../inputs/datasets"` (§2.1 run layout, from the module
     workspace `outputs/{moduleId}`).
   - The COPY TO stays sandbox-staged + file-copied into the run (the
     byte-identical intermediate and the dataset dual-write, model point 4).
     Re-targeting it to write INTO the run tmp dir needs the runs volume mounted
     into the Postgres container (`RUNS_DIR_PATH_POSTGRES_INTERNAL`, binding
     decision 4 — dev `pg_run` mounts only the sandbox) — DEFERRED to item 7
     with the docker-compose change, as this item's seams allowed.
   - Live-verified on dev (Test project, m001, full pipeline harness): generated
     script reads `../../inputs/datasets/hmis.csv` (zero `../datasets/`
     occurrences), R ran against the run's own extract and wrote all 5 declared
     ROs with no symlink workaround (the item-3 trick is obsolete), dual-write +
     fresh finalize parquet + publish + repoint all green. The script-text
     change flipped m001's §3.7 inputKey as predicted — identical config re-ran
     R instead of reusing (the expected one-time full re-run on the first
     post-item-4 generation; fails closed). Project then re-backfilled, verify
     run deleted, rig re-run GREEN.
5. **Surface kills + client — DONE 2026-07-13** (gates green: typecheck +
   lint:systems + PARITY GREEN 129 checks 0 diffs/skips; server boots with the
   trimmed route registry; T1-from-manifest harness-verified live across all 8
   dev projects, availability reasons surfacing).
   - **Server kills**: per-module rerun + dirty cascade + runToken/claim machine
     deleted wholesale (`set_module_dirty/clean.ts`,
     `trigger_runnable_tasks.ts`, `running_tasks_map.ts`, `get_dependents.ts`,
     the whole `worker_routines/run_module/` worker); shared survivors moved
     into `generate_run/` (`import_asset.ts`, `legacy_store_results_object.ts` —
     the dual-write ingest, named for its Phase-3 deletion — and
     `r_docker_image.ts`). Routes killed + registry entries:
     install/uninstall/updateDefinition/updateParams/
     rerun/getAllMetrics/previewModuleUpdate, addDatasetToProject/
     removeDatasetFromProject/setAllModulesDirty, instance checkModuleUpdates,
     the uninvoked getVisualizationsListForAI (whole ai-tools registry) + dead
     db funcs (getAllModulesForProject, getMetricsWithStatus, getModuleDetail,
     getMetricsForModule, the AI list functions, compare_definitions.ts). Health
     `hasRunningModules` re-pointed to the runs catalog; the old attach route's
     `checkSpaceForDataset` guard re-pointed into the generation launch.
   - **T1 catalog = the manifest** (binding decision 5 executed):
     `getModuleSummariesFromManifest`, `getMetricsWithStatusFromManifest`, and
     `getModuleWithConfigSelectionsFromManifest` in `run_read.ts`;
     `getProjectDetail` and the publish `run_attached` payload read them (no-run
     → typed empty; unreadable run degrades loudly-logged so authored content
     stays reachable). `MetricStatus` shrank to `ready | unavailable` +
     `statusReason` (the stamped reason); `InstalledModuleSummary` shrank to
     manifest fields (dirty/staleness fields gone). `run_attached` now carries
     the FULL catalog (modules, metrics, projectDatasets, common/iceh
     indicators) — the
     `modules_updated`/`datasets_updated`/`module_dirty_state`/ `any_running`
     messages and their emitters are deleted; `ProjectDirtyStates` →
     `getProjectLastUpdatedState` (`project_last_updated.ts`, stamps only).
   - **Viewer re-point**: getScript/getLogs serve the run's captured
     `___script___.R`/`___logs___.txt` by `(run_id, module_id)` (new
     `runReadableByProject` guard: ready + sourceProjectId, or the attached
     run); new `listRunModuleFiles` (readdir) + downloads via the runs static
     mount (`/{runId}/outputs/{moduleId}/{file}` — replaced the sandbox static
     mount); viewers hosted per-module on the ready RunCard; synthetic-backfill
     runs answer script/logs with a typed "not in this package" message (they
     carry only parquet, by design).
   - **Client kills**: project_data/project_modules tabs + hosts (settings
     editors, update modals, DirtyStatus, staleness_checks,
     project_module_settings) deleted; tab enum shrank with a stored-pref
     fallback guard; AI viewing_data/viewing_modules modes deleted; AI module
     tools re-pointed (script/logs via attachedRunId, get_module_settings now
     manifest-backed); ViewResultsObject download re-pointed to the run URL;
     PresentationObjectMiniDisplay dirty arms removed. Vocabulary: remaining
     user-facing strings say "results package" (EN/FR/PT inline t3, per the PT
     rollout). 5b. **Virtual default visualizations — DONE 2026-07-13** (gates
     green: typecheck + lint:systems + PARITY GREEN `--run`, corpus grew 129 →
     214 checks with the virtual defaults included, 0 diffs/skips; migration 030
     applied at dev boot on all 8 registered projects — 131 default rows
     deleted; 4 orphaned project DBs outside `projects` untouched, as with every
     project migration; live harness on dev). Build notes:
   - One derivation in `lib/derive_default_visualizations.ts`
     (`deriveConfigFromVizPreset` + `deriveDefaultVisualizationsForModule`,
     per-module sortOrder counter exactly as installModule materialized). Client
     `buildConfigFromPreset` re-pointed: AI figures now take the derived config
     (including preset sub-caption/footnote, previously dropped) with only their
     own caption on top.
   - `server/run_query/virtual_defaults.ts`: per-runId memoized derivation
     (immutable runs, capped map like the manifest cache);
     `getAllPresentationObjectsWithVirtualDefaults(mainDb, projectId,
     projectDb)`
     is THE listing seam — all 11 raw call sites re-pointed (7 PO routes, 2
     folder routes, cache_status, getProjectDetail); dead
     `getAllPresentationObjectsForModule` / `getPresentationObjectLastUpdated`
     deleted.
   - Detail fallback in `getPresentationObjectDetailFromRun`: no row → manifest
     preset by default id (`isDefault: true`, `folderId: null`,
     `lastUpdated = "virtual_default"` sentinel, runId). The detail route
     resolves run ctx first and versions `po_detail` with the sentinel + runId;
     the client `po_detail` version already degrades to `"unknown"|runKey` for
     row-less ids — no client cache change.
   - Duplicate-to-customize: `duplicatePresentationObject` takes a
     `virtualDefaultSource` the route resolves from the manifest; write guards
     (label, config, delete, batch period filter, folder move) refuse virtual
     ids with the legacy row-guard messages. The client already opened defaults
     in create-mode ("Copy of …") — unchanged. `createPresentationObject`'s
     `makeDefault` dropped (registry + both client callers; rows can never claim
     is_default again).
   - `run_attached` now carries `visualizations` (server-built via the
     wrapper) + a one-line t1 reconcile — the across-repoint listing surface.
   - installModule's default-PO delete/insert blocks gone;
     `defaultPresentationObjects` removed from the installed schema and
     `ModuleDefinitionDetail`. **Rollback-window compat**:
     `prepareModuleDefinitionForStorage` still writes an empty
     `defaultPresentationObjects: []` key into stored blobs because the PREVIOUS
     image's schema requires it and the dual-write plane is the rollback path
     (model point 4) — delete with the legacy plane in Phase 3.
   - Rig `--run` enumerates virtual defaults (detail via the manifest
     projection, same fetch config to both engines) so the corpus keeps its
     default-viz coverage after the rows are gone.
   - cache_status decision: virtual defaults included via the wrapper — their
     cache states are visible like any visualization's.
   - Live-verified (harness, Test project): 32 virtual defaults exactly replace
     the 32 deleted rows (ids/labels/sortOrders match); detail by an old default
     row id resolves (the stored deck/report-reference path); unknown id
     rejects; duplicate → editable user copy (verified, cleaned up).
     DOC_MODULE_EXECUTION.md's derivation sentence corrected. Original spec
     (decided with Tim 2026-07-13, rulings inline): Context: default
     visualizations were only ever materialized by the legacy `installModule`
     path (project creation), which the wizard deliberately does not call — so a
     module that first enters a project via a results-package generation has
     metrics but no default visualizations. Rather than adding wizard-time
     seeding, defaults stop being rows at all.
   - **The model.** A default visualization is a pure projection of the ATTACHED
     run's manifest: for each manifest metric preset carrying
     `createDefaultVisualizationOnInstall`, derive the config exactly as
     `deriveDefaultPresentationObjects`
     ([load_module.ts:24](server/module_loader/load_module.ts#L24)) does today
     (label `resolveTS`, `DEFAULT_S_CONFIG`/`DEFAULT_T_CONFIG` merges, sortOrder
     by catalog order). Attach a different run → that run's defaults; a preset
     change reaches every project at its next generation (today it only landed
     on reinstall); `presentation_objects` becomes user-authored content only.
   - **Identity is already solved**: `createDefaultVisualizationOnInstall` IS
     the stable authored poId. Every id-keyed flow (PO detail route, `po_detail`
     cache, duplicate, create-slides, stored deck/report references to default
     ids) keeps working via a detail-resolution fallback: no
     `presentation_objects` row with this id → look up the manifest preset by
     default-id and derive `PresentationObjectDetail` (`isDefault: true`).
     Virtual defaults' `po_detail` version = runId + `PO_CACHE_VERSION` only (no
     `last_updated` row exists — use a constant sentinel; the run is immutable
     so this is strictly correct).
   - **Rulings (Tim 2026-07-13)**: defaults ALWAYS show (matches pre-runs
     behavior — reinstall resurrected them anyway): no delete, no
     move-to-folder, no tombstones. Not editable in place — "edit" on a default
     becomes duplicate-to-customize (new user PO id via the existing duplicate
     flow). Consequence: no row ever shadows a projection, so there is no
     precedence rule to maintain.
   - **Migration**: plain SQL project migration (next number: 030,
     PROTOCOL_APP_MIGRATIONS.md) —
     `DELETE FROM presentation_objects WHERE is_default_visualization = TRUE`.
     No JSON shape changes, so no data transform and no skip-gate. In-place
     edits users made to default rows are discarded (accepted — they are
     re-creatable as duplicates). Rendering of existing decks/reports/dashboards
     is unaffected (FigureBundles are self-contained); figure re-query flows
     resolve default ids via the detail fallback.
   - **One derivation function**: move the pure preset→config derivation to
     `lib/` (its deps `resolveTS`/`DEFAULT_S_CONFIG` are already lib-level) and
     re-point BOTH consumers — the server detail fallback and the client deck-AI
     path (`buildConfigFromPreset` in `slide_ai/build_config_from_metric.ts`) —
     so the projection cannot drift from the AI figure path. `installModule`'s
     default-PO insert block and `defaultPresentationObjects` on
     `ModuleDefinitionDetail` die with this item.
   - **Listing seam (the one real trap)**: virtual defaults must appear in EVERY
     surface that serves the visualizations list — the initial
     `getProjectDetail`, every `visualizations_updated` emission, and across
     repoint. Today all of those call `getAllPresentationObjectsForProject` (7
     call sites: 3 route files + detail assembly). Route through ONE wrapper
     that appends manifest-derived `PresentationObjectSummary` entries (id,
     metricId, label, `isDefault: true`,
     type/disaggregateBy/filterBy/replicateBy/ isFiltered from the derived
     config, `folderId: null`, sortOrder, `lastUpdated` = a constant —
     versioning rides runId) — a call site that keeps using the raw row function
     silently drops defaults. Client `run_attached`/T1 need no change (the list
     arrives server-built). Check `cache_status.ts`'s PO iteration and decide
     whether cache warming covers virtual defaults (optional, note the choice).
   - **Gates**: `deno task typecheck` + rig `--run` GREEN + migration applied on
     dev (`validate_migrations` passes; default rows gone) + live dev checks:
     defaults render for a generated package including a wizard-added module,
     detail opens by preset id, duplicate produces an editable user copy, a deck
     figure referencing an old default id still resolves.
6. **`export_central` — RETIRED 2026-07-13 (Tim's ruling), route deleted, gates
   nothing.** The central reporting hub is a WIP prototype; rather than flip the
   route to run files or let it gate Phase 3/4 demolition,
   `server/routes/instance/export_central.ts` (+ its main.ts mount and the
   unused `CENTRAL_SERVER_SECRET` env var) was deleted outright. The
   project-settings "central reporting" designation toggle stays (main-DB flag
   only, no `ro_*` dependency). When the hub matures, rebuild the export against
   run files: manifest for the catalog endpoints +
   `inputs/calculated_indicators_snapshot
   .json`; DuckDB-over-parquet COPY
   TEXT stream for rows.
7. **Deploy machinery — DONE 2026-07-13** (gates green: typecheck +
   lint:systems + PARITY GREEN `--run`; live-verified on dev, see below). The
   item as speced: serve-before-backfill wiring (finding 3); ship the rig +
   backfill runner in the image (finding 18); the `_POSTGRES_INTERNAL` runs
   namespace + volume (finding 20, binding decision 4) with the item-4-deferred
   COPY TO re-target; missing-run loud degrade (§5). Build notes:
   - **COPY TO re-target**: the three attach functions
     (`addDataset{Hmis,Hfa,Iceh}ToProject`) take a required
     `DatasetCsvTarget {postgresPath, denoPath}` (the item-4 per-caller pattern;
     type + `sandboxDatasetCsvTarget` + `ensureDatasetCsvTargetDir` in
     `datasets_in_project_hmis.ts`). `createProject` passes the sandbox pair
     (legacy plane, byte-identical behavior); `prepare_inputs.ts` passes the
     run-tmp pair — Postgres now COPY-writes each extract DIRECTLY into
     `runs/.tmp-{runId}/inputs/datasets/` through the runs volume — then mirrors
     the extract back into the sandbox (the mirror IS the data dual-write;
     direction reversed, bytes identical, rollback R contract `../datasets/`
     stays current). `prepareRunInputs` takes `runId` (derives the tmp dir), the
     internal sandbox path helpers are absorbed.
   - **Env/mounts**: `RUNS_DIR_PATH_POSTGRES_INTERNAL` added (exposed_env_vars +
     `.env.example` + Dockerfile `ENV /app/runs`); dev `pg_run` mounts
     `_example_instance_dir/runs:/app/runs`; `.env.example`'s stale
     sandbox-internal path fixed to `/app/sandbox`. **Fleet compose change (the
     one manual op per instance)**: the Postgres container must mount the SAME
     host runs dir at `/app/runs` (noted in the Dockerfile ENV comment).
   - **Rollout gate shipped (finding 18)**: `backfill_runs.ts` +
     `validate_results_runs_parity.ts` now COPY into the image. **Deploy runbook
     (finding 3 — serve starts first by construction: boot only sweeps `.tmp-`
     debris + marks interrupted runs, never synthesizes)**: deploy image → boot
     serves, projects without runs show the typed no-run state →
     `docker exec <server> deno run -A -c
     deno.json backfill_runs.ts`
     (per-project isolation; re-runnable, `--project <id>` for one) →
     `docker exec <server> deno run -A -c
     deno.json validate_results_runs_parity.ts --run`
     → green → next instance (Ethiopia early, per Deploy phasing).
   - **Missing-run loud degrade (§5)**: verified (not newly built — harness on
     dev, ghost runs row with no dir): `getRunReadContext` → typed "Results run
     unavailable: Run {id} is not readable"; `getProjectDetail` degrades to
     empty catalog with authored content reachable + loud
     `[runs] attached run … unreadable` log per touch; PO listing serves user
     rows, loudly logged; no raw throws.
   - **Live-verified on dev** (m001 on Test, full launch→worker harness): tmp
     extract observed mid-run as a direct Postgres COPY product (14.1 MB),
     sandbox mirror byte-identical, manifest inputFiles carry csv+parquet
     extract pairs, real R execution (5 ROs, GOOD-CLOSE log), dual-write
     freshened (ro_* counts + `modules.last_run_at`), published and repointed.
     Verify run deleted, project re-backfilled, rig re-run GREEN (214 checks;
     one pre-existing RED first — a browser-driven wizard run had left HFA Test
     attached to an m010-only package, legitimately narrower than the pg
     baseline — resolved by re-backfilling that project, the standard dev
     remedy).
8. **Pre-deploy review work items — DONE 2026-07-14** (gates green: typecheck +
   HARDENED rig PARITY GREEN 8/8 projects, 668 checks — items 103,
   items_synthetic 319, metric_info 50, replicant_options 61, raw_preview 65,
   metric_availability 70 — 0 diffs/both_error/skips). The spec was the
   "Pre-deploy work items from the review" subsection above. What landed:
   - **Hygiene 19/21/22**: parquet-writer comment re-pointed to
     `legacy_store_results_object.ts`; SYSTEM_09 banner corrected (one read
     path, no flag); `columnExistsFor` now rethrows every duck error except the
     exact missing-column signature
     (`Binder Error:
     Referenced column "X" not found` — verified against
     live DuckDB error strings; Catalog/IO/Parser errors throw).
   - **Engine 11**: `DUCKDB_MEMORY_LIMIT` 512MB→4GB, sized empirically — the
     review's repro shape (59.5M rows, facility_name × period ≈ 1.92M groups)
     OOMs at 512MB AND at 2GB (grouped aggregates do not spill), completes at
     4GB in-memory in ~2s. Shared `applyDuckDbSessionSettings` now configures
     BOTH the serving executor and the parquet writer: memory_limit +
     `temp_directory` at `{RUNS_DIR_PATH}/.duckdb-spill` (DuckDB does NOT create
     a missing temp dir — the helper mkdirs it; boot wipes stale spill via
     `resetDuckDbSpillDir`, db_startup).
   - **Engine 12**: `executeSqlOverParquet` pins a deterministic total order
     (all columns, code-unit compare, post-LIMIT) on every result set;
     meaningful ordering stays the caller's job. Verified identical order across
     repeated runs; rig diff outcomes unchanged (green).
   - **DuckDB version bump 1.3.2-alpha.25 → 1.4.5-r.1 (LTS), forced by a REAL
     crash**: the hardened rig segfaulted (SIGSEGV) mid-fleet. Isolated with a
     bare harness: pure `DuckDBInstance.create`/close churn crashes the alpha
     after ~750–1250 cycles — no app code, no parquet, even `SELECT 1` — so the
     long-lived server was a ticking landmine under the cold-instance-per-call
     serving model. 1.4.5-r.1 survives 3000-cycle churn in all modes; all engine
     behaviors re-verified on it (512MB still OOMs, 4GB green, order pin, full
     parity).
   - **Rig gates (5/6/27)**: the verdict is now `every check ok` — diffs,
     one-engine errors, both_error (detail carries BOTH errors), and skips of
     any kind (incl. NO RUN ATTACHED projects, which now record a gating result
     instead of a silent skip) all turn RED; option-ORDER divergence is a diff,
     not a warning (both engines run the same TS re-sort — divergence is a
     regression). The warnings channel is gone.
   - **Rig 15 (raw_preview)**: per manifest RO in --run mode, the real
     `getResultsObjectItemsFromRun` vs the pg baseline — status, totalCount
     (Number() both sides: pg count(*) arrives as a bigint string), column sets,
     and full row-multiset content up to 300k rows (numeric-literal
     canonicalization; raw rows are unaggregated so values match exactly);
     larger ROs compare count+schema with the cap logged. `hasParquet=false` ROs
     assert the pg side is also empty.
   - **Rig 25 (metric_availability)**: manifest stamps vs the same availability
     rules recomputed from live pg facts (information_schema columns, row probe,
     value_props/PAE ingredients, deriveAvailableDisaggregationOptions with live
     facility config), per metric, set-diffed both directions.
   - **Rig 16 (synthetic corpus, in-rig only, never stored)**: per metric,
     mutations of a real PO config — admin-area rollup (eligibility-gated), up
     to 2 facility-column disaggregations, every periodFilter type the metric's
     granularity supports (custom/ from_month minted from manifest
     periodBounds), and a non-default replicant pane. Extended at the merge
     (2026-07-28) with a blank-value filter (`BLANK_SENTINEL` fold +
     predicate, seeded with a real value from pg possible-values), a
     multi-membership filter (`hfa_service_category`, string_to_array
     overlap), and the plain-values HFA n path (PAE stripped to its
     ingredients so `COUNT(DISTINCT facility_id) FILTER` runs — every shipped
     HFA metric carries a PAE, so no stored config reaches that branch); the
     items differ additionally compares every `__n_*` column either engine
     emits. Unbuildable fetch configs drop the variant (counted + logged).
     Composition is printed in TOTALS; merged-tree run: rollup=30 facility=17
     replicant=12 blankfilter=49 multimember=1 nvalues=1 + all 7 periodFilter
     kinds (custom=38, from_month=25, last_n_months=33, quarter×2=66,
     year×2=98).

Exit gate — PASSED 2026-07-14 pre-merge (668 checks) and RE-PASSED 2026-07-28
on the MERGED tree (`deno task typecheck` + rig PARITY GREEN in `--run` mode,
719 checks, 0 diffs/both_error/skips, extended corpus). The merged-tree run
caught and fixed one real cross-engine defect: main's blank-fold SQL used
Postgres-only `btrim(col, chars)` — now the portable two-arg `trim(col,
chars)` (verified by execution on both engines; `E'…'` strings work on both).
(What came next was re-cut on 2026-07-29: the Phase 3 core ships before the
rollout — see "Phase 3 re-cut".)

### Post-merge adversarial review — DONE 2026-07-28, all findings fixed

Three review agents (merge resolutions, semantic-batch diff, cache
composition) swept the surfaces the rig cannot gate. All actionable findings
fixed in `0014d455` + `675b63be`; gates re-run green (typecheck + rig 719
checks, hardened: extended-variant runtime crashes now gate, and zero-count
blankfilter/multimember/nvalues kinds turn the verdict RED in `--run` mode).
Fixed: **HIGH** — the collab viz-list rebroadcast used the raw row function,
erasing virtual defaults from every connected client during collab sessions
(now `getAllPresentationObjectsWithVirtualDefaults`); `PO_CACHE_VERSION` →
**"10"**, `po_detail` → **v5** (the semantic batch changed payload semantics
after "9"/v4 were minted); the po_items route derives `firstPeriodOption`
from the manifest, never the client (a stale cross-run value could poison
the run-keyed shared cache entry, which no longer self-heals); client batch
delete/edit-common-properties filter out defaults with a single-select
delete gate (server refuses them, item 5b ruling); AI module tools throw
`AIToolFailure` on no-attached-package; `getRunManifestCached` pins
`manifestSchemaVersion` explicitly; AI `switch_tab` gained
`results_package` with a permission-gated soft refusal (Tim's ruling).

Accepted LOWs, recorded here, not fixed: the virtual-default write guard
fails OPEN when an attached run's manifest is unreadable (operational edge);
the client reactive cache stores under the optimistic pre-fetch key with no
response-side runId check (latent until an attach-old-run control exists —
add the guard when Phase 3 builds one); dead `lastUpdated.modules/datasets`
tables still queried and shipped per SSE connection; the results-package tab
has no presence-cursor markup; AI prompt drift (module "status" promised but
no longer returned; "Installed analysis modules" wording).

### Phase 3 re-cut: user-model core ships BEFORE the deploy (Tim's ruling 2026-07-29)

**Why:** project-entered generation at the deploy followed by a later move to
instance-level packages would be two large user-facing changes; Tim ruled to
deploy the end-state user model once. The engineering risk is contained because
the system was built end-state already: no projectId in manifests (review
finding 24 was decided FOR multi-project attachment), caches run-keyed, `runs`
table instance-level — this re-cut is UI + routes + a repoint surface, not
architecture.

**In scope (the core, builds on `results-runs` before the rollout). ALL FOUR
BUILT — items 1–4; kept as the statement of what the core was meant to be,
with each bullet's build record in its item:**

- Wizard entry moves to the instance shell (generation stays
  `can_configure_data`).
- Runs catalogue UI: list, disk usage, retire. (`label` is a DISPLAYED
  column, set once at wizard confirm — per-run rename is deferred as luxury
  below.)
- Project attach/swap with the §2.6 compatibility report before any repoint;
  attach = project editor (permissions split per §4 Phase 3). (No detach
  control — deferred as luxury below; a null `projects.run_id` still renders
  the typed no-run state, it just has no button.)
- **Mandatory (was an accepted LOW):** the client reactive cache's
  response-side runId guard — the LOW was accepted as "latent until an
  attach-old-run control exists"; this re-cut builds that control, so the
  guard ships with it.

**Deferred out (post-deploy, purely additive, no user-model change):**
queryable-run-inputs UI; scheduled generation (§10 Q4). **Luxury deferrals
(Tim, 2026-07-29 — "get it working properly, focus on robustness"):** the
project-level "Regenerate" shortcut; "newer run available" surfacing;
detach control (attach/swap covers real use; the typed no-run state stays
for null pointers); per-run rename in the catalogue (label set once at
wizard confirm). None of these leave a silent failure behind — typed render
states cover every gap.

**Hard carve-out — demolition does NOT ride this.** Deleting the dual-write,
the pg read path, and legacy ingest remains gated on FLEET VERIFICATION
(model point 4), which cannot happen pre-deploy. The dual-write, pg wrappers,
rig baseline, backfill, and the entire rollout runbook are unchanged.

**Accepted implications (recorded, not to re-litigate; amended by ruling 5):**

- The pg oracle is FROZEN at deploy time (no dual-write): only
  backfill-provenance runs are rig-gateable (ruling 4). Rollout gating is
  unaffected — backfill gives every project a 1:1 run and the rig runs
  before anyone regenerates or swaps.
- Rollback is hosting-level volume restore only (ruling 5): deploy-window
  authored work is lost on rollback; the previous image is never redeployed
  against a post-deploy database.

**Fork rulings (Tim, 2026-07-29 design session):**

1. **Prefill = the §3.5 instance defaults store, designed and built NOW** (Q8
   resolved as originally specced, not dissolved — Tim overruled the
   base-run-anchor alternative).
2. **Attach-at-launch**: the wizard confirm step gains an explicit "attach
   to project(s)" multi-select repointed in the publish tx. (The
   project-level "Regenerate" shortcut was DROPPED later the same session —
   luxury deferral, see below; generation is entered ONLY from the instance
   shell.) Launch-attach shows no pre-launch compat report (the run doesn't
   exist yet) — robustness is covered by the typed `not_in_run` /
   unavailable render states, which are never silent.
3. **Retire = guarded hard delete** (Q1 resolved; BUILT in item 3): ONE act — delete the
   catalog row + run dir, refused while any `projects.run_id` references the
   run OR the run is still `generating` (sub-fork e). No archived state, no
   automatic GC. §5 backup-reachability accepted (backups don't carry run
   dirs yet; restore already degrades loudly). CONSEQUENCE, honoured by item
   3: the `retired` value in §2.6's `generating|ready|failed|retired` status
   enum is dead — nothing ever sets it. The column type was left alone (no
   migration), nothing writes it, and there is no retired filter; the status
   badge keeps a `retired` arm only because it switches over the type.
4. **Rig**: typed non-gating outcome (`foreign_run`) in `--run` mode when a
   project's attached run has no pg oracle — counted and printed in TOTALS,
   never a silent skip, never RED. Under ruling 5 the rule is simple: **gate
   iff the attached run is the project's backfill run** (the only runs with a
   pg counterpart once the dual-write is gone); every wizard-generated
   attachment is `foreign_run`. Gating stays strict exactly where parity is
   defined; the rollout gate (freshly backfilled 1:1 projects, Ethiopia
   early) is unchanged.
5. **NO backwards compat — the dual-write is deleted before the deploy**
   (Tim's ruling, 2026-07-29). Writing a legacy plane purely for a
   temporary rollback window is waste; commit to the new design. Deleted
   from the branch as pre-deploy work: the per-module legacy dual-write
   (`legacy_store_results_object.ts` ro_* COPY, sandbox output copies,
   `upsertModuleCatalogForGeneratedRun`), the dataset sandbox mirror-back in
   `prepare_inputs.ts` and legacy project-DB dataset/mirror-row upkeep whose
   only consumer was the legacy plane, and the `defaultPresentationObjects:
   []` rollback-window shim in `prepareModuleDefinitionForStorage`. The pg
   READ wrappers, `ro_*` tables, and project-DB catalog tables stay FROZEN,
   untouched, solely as the rig's oracle until Phase 4 drops them.
   **Rollback = hosting-level restore of the pre-deploy instance volume**
   (Postgres data dir + sandbox + runs + assets restored together as one
   consistent set; work authored in the deploy window is lost — accepted).
   There is no partial rollback: the previous image is never redeployed
   against a post-deploy database. **A rollback must ALSO reset the
   wb-fastr-modules repo** — it is a shared single-HEAD dependency the volume
   restore does not touch; see "The modules repo rides the deploy" under
   Deploy phasing for the revert target and what breaks without it. This supersedes model point 4 and
   dissolves sub-fork (b) — attach is pointer-only everywhere, launch-target
   dual-writes never existed.
6. **Second design session (Tim, 2026-07-29, after item 0 landed)** — Q-A (run
   identity: `sourceProjectId` deleted, backfill-only
   `backfillSourceProjectId`), Q-C (reuse is a catalog-wide inputKey search;
   storage gets hardlink dedup, superseding §3.7's "copy, never link"), Q-E
   (re-backfill before every rig gate) and the `createProject` legacy-write
   deletion are RULED. Their authoritative statements are the
   Q-A/Q-C/Q-E/oddity entries in the "DESIGN QUESTIONS" block below and the
   amended §2.1/§3.7 bullets — deliberately not restated here. Later in the
   same session Q-B (instance-SSE `run_progress`, filtered per user), Q-D
   (targeted cache purge, `po_detail` to TTL), Q-F (viewer permission move
   accepted) and the new Q-G (the under-guarded runs static mount) were ruled
   too, all item-3 work. **No design question in this plan is open.**

#### Phase 3 core — design (SIGNED OFF by Tim 2026-07-29; do not re-derive)

All sub-forks are ruled: (a) windowing lives in the defaults store alongside
module params; (b) DISSOLVED by ruling 5 (there are no dual-write targets —
attach is pointer-only everywhere); (c) the generation attempt is keyed per
admin user; (d) launch is blocked while any selected attach target is already
a target of a generating run; (e) delete is refused for `generating` runs as
well as referenced ones.

- **Instance defaults store (Q8)** — BUILT in item 1: `instance_config` key
  `run_generation_defaults` (the existing key/value pattern in
  `server/db/instance/config.ts`; no migration), Zod-validated:
  per-module `ModuleConfigSelections` + per-family dataset windowing. Flat —
  one-country-per-instance makes per-country presets meaningless. Edit
  surface v1 = a "Save these selections as instance defaults" action on the
  wizard confirm step (admin-gated by construction); no separate settings
  editor page. Merge order: resume > entry-anchor manifest (shortcut entry
  only) > instance defaults > definition defaults, via
  `getMergedModuleConfigSelections` semantics; unknown moduleIds in the
  store are tolerated (modules evolve). The merge order is exactly
  **resume > instance defaults > definition defaults** — an earlier draft
  carried an "entry-anchor manifest" tier for the deferred Regenerate
  shortcut, so that tier does NOT exist.
- **Instance shell surface** — BUILT: item 1 created the tab and the
  generate/resume entry, item 3 added everything else (catalogue, disk size,
  guarded delete, live progress, re-hosted viewers). New
  "Results packages" area
  (`can_configure_data`): catalogue table (label, status, created at/by,
  provenance/source, disk size, attached-projects list), generate → wizard,
  per-run guarded delete, live progress on generating runs (reuse
  `run_progress` — but as an INSTANCE-SSE message filtered to
  `can_configure_data`, per the Q-B ruling; the existing progress-chip
  components are unchanged), and the per-module script/log/file viewers
  (the routes move to a `can_configure_data` instance mount and the runs
  static mount is tightened to the same guard — Q-F/Q-G rulings, superseding
  this bullet's original "routes unchanged"). **Item 3b superseded the
  "re-hosted HERE from the project tab" part**: exploring a package is one
  capability rendered on both surfaces from `_shared/results_package/`, not
  something the catalogue took away from the project tab. Disk size
  stamped into the run summary at finalize AND by the backfill synthesizer —
  at rollout every prod run is backfill-born, so no lazy `du` fallback is
  needed. Dev runs minted before the stamp existed have no size: item 3
  re-backfilled the dev instance (`backfill_runs.ts`) rather than adding a
  fallback path.
- **Wizard re-entry** — BUILT in item 1, with the confirm-step attach
  multi-select in item 2: instance-entered ONLY (no project context; the
  Regenerate shortcut is deferred): prefill = resume > instance defaults >
  definition defaults; family availability from instance datasets (already
  instance-level). `run_generation_attempts` re-keyed PK
  `source_project_id` → created-by user id (one in-flight configuration per
  admin) — migration. §3.7 reuse = catalog-wide inputKey search, no base run
  at all (Q-C ruling 2026-07-29; pessimistic reuse fails closed, so a miss
  only costs a re-run, never correctness). Confirm step: "attach to project(s)"
  multi-select (defaults to none); `publishReadyRun` repoints ALL selected
  targets in the one tx + `run_attached` SSE per target.
- **Dual-write deletion (ruling 5, pre-deploy work item)** — BUILT in item 0
  (the concurrency-guard re-cut in this bullet landed in item 1): the generation
  pipeline sheds the per-module `ro_*` COPY, sandbox output copies, legacy
  catalog upserts, dataset sandbox mirror-back, and the
  `defaultPresentationObjects: []` shim. Attach is pointer-only everywhere.
  pg read wrappers + `ro_*` + project catalog tables stay frozen as the rig
  oracle. Concurrency guard re-cut: launch blocked while any selected
  attach target is a target of a generating run (in-memory claim + catalog
  check, the existing pattern re-keyed to targets).
- **Attach (project surface) — Tim's re-cut 2026-07-29: the project-level
  results_package tab IS the picker, nothing more.** It lists the instance's
  ready packages with the attached one marked; an editor picks another →
  the §2.6 compatibility report (project's USER POs resolved against the
  candidate manifest — `not_in_run` metrics + unavailable-dimension counts,
  by PO label; virtual defaults excluded — they are projections of whatever
  run is attached; no data queries) → confirm → `projects.run_id` UPDATE +
  `run_attached` SSE (the publish machinery minus the status flip).
  Read-only for non-editor members. No runs-in-progress view and no detach
  control. (This bullet's "no viewers here" is SUPERSEDED by item 3b: the
  per-module viewers are part of what a package contains and render on both
  surfaces from `_shared/results_package/`.) `listRunsForProject` is
  obsoleted by the catalogue listing and is deleted by this item. **BUILT in
  item 4 — read its build record for what the permission split actually
  became and why the candidate LISTING ended up editor-gated too.**
- **Client cache guard (mandatory)** — BUILT in item 4: response-side runId check in the
  reactive caches — a response is stored only under the runId it was
  computed for (the accepted-LOW, now live because attach-old-run exists).
  The caches are the `~/state/_infra/reactive_cache.ts` instances that key
  on `runVersionKey(pds)` — `t2_presentation_objects.ts` (three of them) and
  `t2_replicant_options.ts`. Today they compute a version key when the
  request goes out; the hole is an in-flight response landing after a
  repoint and being stored under the NEW key.
- **Rig**: implement ruling 4 — `foreign_run` typed outcome, non-gating,
  printed. THE RULE (ruling 5 removed the dual-write, so there is no
  "targeted" notion): **gate a project iff its attached run is that project's
  own backfill-provenance run**; every wizard-generated attachment is
  `foreign_run`. Rollout gating is unchanged because backfill gives every
  project a 1:1 run before anyone regenerates.
- **Vocabulary**: all new UI strings "Results package(s)" (EN/FR/PT inline
  t3). **Each item claims its OWN new files in the SYSTEM globs** — the lint
  gate runs inside `deno task typecheck`, so a new dir left unclaimed fails
  that item's own gate (the gate only sees TRACKED files, so a new file
  passes until committed, then orphans). Item 5's "sweep" is prose/doc
  reconciliation only, not glob catch-up.

#### How to work a Phase 3 item (operating rules — these govern every item below)

**One item per session, in order.** An item too large for one session stops at
a clean seam with the gates green and records its stopping point INSIDE that
item — nowhere else. Do not start the next item early, and do not fold a later
item's deliverable into an earlier one; when the work forces an exception (as
item 1 did, because Q-A's guard re-key IS item 2's attach-target list), say so
in both items' text.

**Both gates must pass before an item is DONE:**

1. `deno task typecheck` — runs the server check, the client `tsc`, AND
   `lint:systems`. The systems lint only sees TRACKED files, so a new file
   passes until it is committed and then orphans: **claim every new file in
   the owning `SYSTEM_NN_*.md` `globs:` list as part of the item that creates
   it** (`git add -N` a new file to make the lint see it early). Item 5's
   "sweep" is prose reconciliation only, never glob catch-up.
2. The parity rig, GREEN:
   `deno run --allow-all --unstable-broadcast-channel --env-file -c deno.json
   validate_results_runs_parity.ts --run`
   **Re-backfill first (the Q-E standing rule)** so every dev project is
   attached to its own backfill-provenance run at gate time:
   `deno run --allow-all --unstable-broadcast-channel --env-file -c deno.json
   backfill_runs.ts [--project <id>]` (same flags for both).

**Client work follows the panther UI protocols**, not the surrounding code —
`PROTOCOL_UI_STYLING.md` above all
([panther/protocols/](panther/protocols/PROTOCOL_UI_STYLING.md), with
`PROTOCOL_UI_COMPONENTS`/`_SOLIDJS`/`_STATE`/`_STRUCTURE`). Two token rules
this plan's own surfaces broke and item 2 swept: a written border color is an
exception marker (`border` alone already paints the token — never
`border-base-300`), and the muted foreground ramp is
`text-base-content-muted`, never `text-neutral` (`neutral` is a FILL intent —
`bg-neutral text-neutral-content` badges are correct). Read the protocol
before styling anything new rather than copying a neighbouring file.

**Verify by executing, not by reading.** Every item so far was live-verified
on the dev instance with a throwaway harness:
`deno run --allow-all --env-file -c deno.json <harness>.ts` with
absolute-path imports (add `--unstable-broadcast-channel` when the code path
touches SSE/worker channels). Put harnesses in a scratch dir, use disposable
fixtures (never write to a real named row), and delete everything they create.
A barrel trap that has cost real time: `deno check` follows source imports, so
a symbol missing from a `mod.ts` re-export list typechecks clean and fails only
at runtime.

**Dev environment.** `./pg_run` starts Postgres with BOTH the sandbox and runs
volumes mounted (dataset extracts `COPY` straight into run tmp dirs — a `pg`
container started before that change must be restarted). Instance migrations
run at server boot, or call `runInstanceMigrations` from a harness. The server
has no `--watch`: restart it manually after server/lib edits; the client
hot-reloads.

**Known rig trap.** A generation that selected a SUBSET of modules leaves its
attached project on a legitimately narrower package than the pg baseline, and
the rig reports diffs like "duck=Unknown results object" / "Metric not found"
on that one project. That is not a code bug — re-backfill that project and
re-run. (This is the same remedy as the Q-E rule above.)

**Where the results-package code lives** (as of item 4 — verify, don't
assume, but this is the map):

| Concern | File |
| --- | --- |
| Run dir layout + tmp/rename paths | `server/runs/run_paths.ts` |
| Shared package builder (both writers) + backfill synthesizer | `server/runs/synthesize_run.ts` |
| Manifest + input-JSON read cache | `server/runs/manifest_cache.ts` |
| Guarded hard delete (row → dir → caches) | `server/runs/delete_run.ts` |
| Repoint + the `run_attached` event (BOTH emitters: publish and picker) | `server/runs/attach_run.ts` |
| §2.6 compatibility report (authored POs vs a candidate manifest) | `server/runs/package_compatibility.ts` |
| Generation pipeline, launch, execute/reuse, inputs | `server/worker_routines/generate_run/**` |
| Dual-channel generation telemetry | `server/worker_routines/generate_run/notify_run.ts` |
| Catalog rows, attempts, listings, publish tx | `server/db/instance/run_generation.ts` |
| Wizard + catalogue + viewer routes (all `can_configure_data`) | `server/routes/instance/run_generation.ts` |
| Project picker routes (`can_view_data` read / `can_configure_visualizations` pick) | `server/routes/project/results_package.ts` |
| Run-output downloads (`/:run_id/outputs/*`) | `server/middleware/static.ts` |
| Instance SSE endpoint + the per-user message filter | `server/routes/instance/instance-sse.ts` |
| Read plane over the attached run (DuckDB) | `server/run_query/**` |
| PO caches + `PO_CACHE_VERSION` | `server/routes/caches/visualizations.ts` |
| Run/manifest/summary types | `lib/types/run_manifest.ts`, `lib/types/run_generation.ts` |
| Route registries | `lib/api-routes/instance/run_generation.ts`, `lib/api-routes/project/results-package.ts` |
| **What a package CONTAINS** — rendered identically on BOTH surfaces (item 3b): module list + per-module script/log/file viewers, generating progress + live R line, failed state, provenance line, status badge | `client/src/components/_shared/results_package/**` |
| Instance catalogue chrome (run list, generate, guarded delete, disk size, attached projects) | `client/src/components/instance_results_packages/index.tsx` |
| Project package tab chrome (in-use marker + the attach picker) | `client/src/components/project/project_results_package.tsx`, `results_package_compatibility_modal.tsx` |
| Launch wizard | `client/src/components/results_package_wizard/**` |
| AI tools over a package (run RESOLVER, host-agnostic) | `client/src/components/project_ai/ai_tools/tools/modules.ts` |
| Client SSE listener registries | `client/src/state/instance/t1_sse.tsx`, `client/src/state/project/t1_sse.tsx` |
| Run-keyed client caches + the response-side runId guard | `client/src/state/_infra/reactive_cache.ts`, `state/project/t2_presentation_objects.ts`, `t2_replicant_options.ts`, `runVersionKey`/`responseRunIdMatches` in `t1_store.ts` |
| Backfill script / parity rig | `backfill_runs.ts`, `validate_results_runs_parity.ts` |

Owning system docs: **S8** (module system — the pipeline, routes and client
surfaces), **S9** (viz query & cache), **S3** (SSE + cache invalidation).

#### Phase 3 core — work items (execute in order, one per session, each gated by `deno task typecheck` + rig `--run` green)

Each item below is a checklist; **its full spec is the matching bullet in the
"Phase 3 core — design" subsection directly above** (item 1 ↔ "Instance
defaults store" and "Wizard re-entry", item 2 ↔ "Wizard re-entry" confirm-step
and concurrency, item 3 ↔ "Instance shell surface", item 4 ↔ "Attach (project
surface)" and "Client cache guard", item 5 ↔ "Rig"). Read both before starting.
A DONE item carries its own build record; that record, not the checklist above
it, describes the current tree.

**DESIGN QUESTIONS — ALL RULED (Tim, 2026-07-29). Nothing here is open.**
Surfaced by an adversarial read of this design on 2026-07-29; each was a real
hole, not a documentation gap. Q-A/Q-C/Q-E and the `createProject` oddity were
ruled first, then Q-B/Q-D/Q-F/Q-G in the same session. **Three of them were
stated WRONG in the original question and are corrected in place** (Q-D: TTLs
and the actual cache primitive; Q-F: the viewers were never member-readable;
Q-G: found while verifying Q-F) — read the RULED text, not the premise it
replaced. Do not re-litigate any of them.

- **Q-A (item 1/2) — what is `sourceProjectId` for an instance-generated run?
  RULED: it does not make sense any more — DELETE it from `RunSummary`.** A
  run generated at instance level has no source project, so the field goes
  rather than becoming a nullable everything-field. The mechanisms that key on
  it are re-cut with it:
  - launch concurrency guard (`summary::jsonb->>'sourceProjectId'`) → re-keys
    to the ATTACH TARGET list (sub-fork d already ruled it that way);
  - viewer auth guard `runReadableByProject` (today: ready + sourceProjectId,
    OR the attached run) → item 1 drops the FIRST arm, leaving the attached-run
    arm, which is end-state-correct for the project surface; the move to an
    instance-admin surface is item 3 (per the Q-F and Q-G rulings);
  - `listRunsForProject` (sourceProjectId filter) → narrows to the attached run
    in item 1 and is deleted in item 4 when the project tab becomes a picker;
    the catalogue listing (item 3) obsoletes it;
  - the §3.7 reuse-base lookup → dissolved by Q-C's catalog-wide search.

  ONE thing still needs a project link: ruling 4's rig rule gates iff a
  project's attached run is **that project's own backfill run**. So the
  backfill synthesizer — and ONLY it — stamps a nullable
  `backfillSourceProjectId` on the catalog row. DB summary only, never in
  `manifest.json` (the no-instance-FK-in-run-files rule, review finding 24 —
  unchanged). Wizard runs carry null, which is exactly the point.
- **Q-B (item 3, BUILT) — `run_progress` and the viewers are project-scoped,
  but the catalogue is an instance surface. RULED: instance SSE, filtered per
  user.**
  `run_progress` is a project-SSE message consumed by the project store's
  listener registry, and the viewer routes sit behind `runReadableByProject`
  on a project-scoped mount. A run launched with zero attach targets has no
  project channel at all, so item 3's "reuse `run_progress` SSE" and "routes
  unchanged" were not achievable as written. Item 3 therefore:
  - adds `run_progress` to `InstanceSseMessage` (the `instance_updates`
    BroadcastChannel + `notifyInstanceUpdate`, the shipped pattern);
  - **filters it in the route**: `routesInstanceSSE` is guarded by
    `requireGlobalPermission()` — every logged-in user — but has `globalUser`
    in context, so it drops `run_progress` for callers without
    `can_configure_data`. Run labels, module ids and R error details must not
    fan out to every connected user just because the catalogue is admin-only.
  - keeps the project-SSE `run_progress` copy for attached projects
    (unchanged emitter; both fire).
- **Q-C (item 1) — the §3.7 reuse base for instance entry. RULED: DISSOLVED —
  reuse searches the whole catalogue by inputKey.** There is no "base run" any
  more: a module reuses iff ANY readable `ready` run's manifest records the
  same non-null `inputKey` with a recorded hash for every declared results
  object. This is the direct answer to "each component has its own hash, so
  search all past runs", and it removes the concept the question was about.
  §3.7's "single base, no catalog-wide search in v1" is SUPERSEDED. Still
  fails closed: no match, an unreadable manifest, or a since-deleted source
  only ever costs a re-run. Ruled in the same breath: **hardlink dedup**
  replaces "copy, never link" — see the amended §3.7 bullets, which are
  authoritative for both.
- **Q-D (item 3, BUILT) — cache GC on run deletion. RULED: targeted purge of the
  three runId-prefixed caches; `po_detail` is left to TTL.** The question's
  original framing was wrong on two counts, corrected here (verified
  2026-07-29): (1) this is **disk reclamation, not correctness** —
  `TimCacheC` entries carry a 15–30 day TTL
  ([cache_class_C.ts:3-5](server/valkey/cache_class_C.ts#L3-L5)) and a
  stale-version entry is never served, because `get` compares version hashes;
  (2) `clearEntriesWithPrefix` does not exist — the real primitive is
  `scanUniquenessHashes(hashPrefix)` +
  `clear` ([cache_class_C.ts:161-195](server/valkey/cache_class_C.ts#L161)).
  So the guarded hard delete also scans + deletes `po_items`, `metric_info`
  and `replicant_opts`, whose uniqueness hashes START with runId.
  **`po_detail` cannot be prefix-purged** — it folds runId into its VERSION
  hash, not its uniqueness hash — and is deliberately left to expire: its
  entries are version-dead the moment the run goes. Re-keying it to fold runId
  into uniqueness was considered and rejected (it would need a cache-prefix
  bump v5 → v6 for pure disk reclamation of already-dead entries). §2.5's
  `clearEntriesWithPrefix` wording is superseded by this bullet.
- **Q-E (items 2 and 4) — how do they pass their own rig gate? RULED: the
  standing rule is re-backfill before the gate.** Run `backfill_runs.ts` on
  the dev projects before running the rig, so every project is attached to its
  own backfill-provenance run at gate time. No re-ordering of the item list,
  no new code — and it is the same remedy the wizard build already used for
  the "narrower package" rig trap (see "How to work this list"). Applies to
  EVERY Phase 3 item, not just 2 and 4.
- **Q-F (items 3/4, BUILT in item 3 — then PARTLY RE-RULED by item 3b; read
  that entry with this one) — permission change on the debug viewers.
  RULED: accept the move as designed.** _Item 3b's ruling: the UI is NOT
  admin-only — exploring a package renders on both surfaces. What survives
  of Q-F is only the route GUARD, and that guard is now the deferred open
  question, not a settled ruling._ The question's premise was wrong and is corrected
  here: the viewer routes are guarded by
  `requireProjectPermission("can_configure_modules")`
  ([modules.ts:71/115/157](server/routes/project/modules.ts#L71)), and
  `can_configure_modules` is **false in BOTH the Viewer and Editor presets**
  ([permissions.ts:129-215](lib/types/permissions.ts#L129)) — only full-access
  project admins reach them today, not ordinary members. §2.6's "readable by
  any project member of an attached project" was never true of these routes.
  So the real effect of the move is that **project admins who are not instance
  admins lose the viewers**. Accepted at the time as "debug surfaces are
  admin-shaped" — the framing item 3b then rejected, since script/log/files
  all live inside the run package directory and are therefore package
  contents. Recorded here rather than discovered post-deploy.
- **Q-G (item 3, BUILT) — the runs static mount is under-guarded. RULED:
  tighten it to `can_configure_data` in item 3.** Found 2026-07-29 while verifying Q-F:
  the actual file-download surface, `/{runId}/outputs/{moduleId}/{file}`, is
  served by `serveStatic({ root: _RUNS_DIR_PATH })` behind only
  `requireGlobalPermission()`
  ([static.ts:26-33](server/middleware/static.ts#L26)) — ANY authenticated
  instance user who knows a runId can download any run's raw output CSVs,
  regardless of project membership or module permissions. It gets the same
  guard the viewers move to, in item 3, which is already in this code. (The
  per-project-readability alternative was rejected: more machinery, and it
  re-introduces exactly the project-scoped guard Q-A deletes.)

**Known live oddity — RULED (Tim, 2026-07-29): delete it in item 1, server AND
form.** `createProject` still calls `addDataset{Hmis,Hfa}ToProject` +
`installModule`
([projects.ts:367-411](server/db/project/projects.ts#L367-L411)), so creating a
project exports a full dataset extract into its sandbox and writes project
catalog rows that **nothing reads any more** (T1 and the virtual defaults both
come from the attached run's manifest). It survives only because project
creation predates the wizard. Item 1 deletes the server-side writes AND the
create-project form's dataset/module pickers: a new project starts with no
package attached (the typed no-run state) and gets one via the item-4 attach
picker. That also removes a multi-GB-scale wasted export per project creation
on big instances. `addDataset*ToProject` dies with its last caller.

0. **Dual-write deletion (ruling 5) — DONE 2026-07-29** (gates green:
   `deno task typecheck` + lint:systems + rig PARITY GREEN `--run`, 719
   checks 0 diffs/both_error/skips; live-verified on dev). A generation now
   writes ONLY into its run; no project DB and no sandbox are touched. What
   landed:
   - **Dataset attach split** (the double-duty trap, resolved by
     construction): `computeDataset{Hmis,Hfa,Iceh}RunCapture` do every
     instance read, validation and the `COPY … TO` and RETURN the captured
     rows; `addDataset*ToProject` are thin appliers over the same capture and
     survive only for `createProject`'s legacy plane. The per-family
     remove-then-write is gone from the capture half (the run tmp dir is
     always fresh), and the redundant `projectId` params went with it.
   - **prepare_inputs** writes the captures into the run as its own inputs —
     `indicators.json`, `calculated_indicators_snapshot.json`, the four HFA
     mirror JSONs, `iceh_indicators_snapshot.json`, plus
     `facilities_{hmis,hfa}.parquet` via the new `exportRowsToParquet`
     (in-memory sibling of `exportPgTableToParquet`) — and returns the
     manifest `datasets` entries and the script-generation inputs. No
     sandbox mirror-back, no project writes, no detach calls.
   - **resolve_modules** takes those script inputs instead of re-reading
     project snapshot tables. ORDERING TRAP CAUGHT: the old snapshot reader
     ordered HFA indicators by category → sub-category → indicator sort
     order, while the instance query orders by (sort_order, var_name); the
     order reaches generated R script text (hence the module inputKey), so
     it is reproduced explicitly in prepare_inputs.
   - **execute_module**: `dualWriteModuleToLegacyPlane` and
     `legacy_store_results_object.ts` deleted; both the run and reuse paths
     end at the run. `upsertModuleCatalogForGeneratedRun` and the
     `defaultPresentationObjects: []` rollback shim deleted from
     `db/project/modules.ts` (`prepareModuleDefinitionForStorage` exported).
   - **Builder** gained a `RunBuildSource` discriminator: `project_db` (the
     backfill synthesizer, unchanged behavior) vs `captured` (the wizard —
     modules/metrics/datasets/facilitiesTables handed in, zero project-DB
     round trips). `sourceProjectId` is now an explicit build option.
     `pipeline.ts` builds the manifest catalog from the resolved definitions
     and frozen selections directly.
   - **Read re-points** (surfaces that would otherwise have served frozen
     pre-cutover rows): `getProjectDetail`'s projectDatasets /
     commonIndicators / icehIndicators / hfaTaxonomy now come from the
     attached run (`getProjectDatasetsFromManifest`,
     `get{Common,Iceh}IndicatorsFromManifestInputs`,
     `getHfaTaxonomyFromManifestInputs` in run_read.ts; time points stay
     instance-wide via `getHfaTimePointsForAI`); `getAllDatasetsForProject`
     and `getHfaTaxonomyForAI` deleted; the publish `run_attached` payload
     reads the same helpers; `cache_status`'s metric→RO map comes from the
     manifest; the admin `compareProjects` route reads each project's
     attached manifest, and `CompareProjectsModule` shed the dirty-state and
     per-half definition stamps (dead concepts) with the client table
     updated to match.
   - **Live dev verification** (harness, Test project): full pipeline both
     ways — real R execution AND a §3.7 reuse (0.9 s, `reused` not re-run) —
     each asserting the manifest is complete (real inputKey/output hashes,
     datasets info with totalRows, facilities columns, every input file
     present on disk, availability stamps) AND that the legacy plane is
     byte-untouched: all 7 catalog/mirror tables and all 14 `ro_*` tables
     unchanged, `modules` rows (incl. `last_run_at`) and `datasets` rows
     identical, sandbox files identical. T1 verified served from the run
     (commonIndicators = 9 from run inputs on a project whose legacy
     `indicators` table holds 0 rows — the re-point demonstrably matters).
     Harness runs deleted and the original backfill run reattached.
   - **Env note**: the dev `pg` container predated item 7's runs mount and
     had to be restarted via `./pg_run` (which mounts
     `_example_instance_dir/runs:/app/runs`) before Postgres could COPY
     extracts into run tmp dirs — the same per-instance compose change the
     fleet rollout needs.
   - **Barrel trap** (cost two harness runs): `deno check` follows source
     imports, so a symbol missing from a `mod.ts` re-export list typechecks
     clean and fails only at runtime. New exports must be added to the
     barrel — verify by executing, not by checking.
   - Accepted, unchanged: `project_last_updated`'s `datasets`/`modules`
     stamps are now permanently frozen (the recorded dead-table LOW; the
     client keys on runVersionKey, so nothing reads them).
1. **Defaults store + wizard re-entry + run identity — DONE 2026-07-29**
   (gates green: `deno task typecheck` incl. lint:systems + rig PARITY GREEN
   `--run` after a full dev re-backfill, 719 checks, 0 diffs/both_error/skips;
   live-verified on dev by harness). Generation is now an instance-level act
   with no project context anywhere in its path. What landed:
   - **Defaults store**: `instance_config` key `run_generation_defaults`
     (`getRunGenerationDefaultsConfig`/`updateRunGenerationDefaultsConfig` in
     `db/instance/config.ts`, no migration), Zod `runGenerationDefaultsSchema`
     = `{step1, moduleIds, parameterSelections}` — the same three fields the
     wizard's old manifest prefill produced, so step 1/step 2 seeding is
     unchanged in shape and only its SOURCE moved. Absent key or an
     unparseable blob degrades to the empty defaults (logged), never an
     error: a bad blob can't block generation. Written by a "Save these
     selections as instance defaults" button on the confirm step.
     `getRunGenerationPrefill` and `step1FromManifest` are deleted — the
     merge order is exactly resume > instance defaults > definition defaults.
   - **Attempt re-key**: migration `067_run_generation_attempt_by_user.sql`
     drops and recreates `run_generation_attempts` keyed
     `created_by_user_email` (PK, FK `users(email)` CASCADE); attempts are
     configuration only and deleted at launch, so in-flight rows are dropped
     rather than reassigned. Base schema + `DBRunGenerationAttempt` follow;
     every attempt function takes the calling admin's email, so a user only
     ever sees their own configuration.
   - **(a) Run identity (Q-A)**: `RunSummary` loses `sourceProjectId` and
     gains `backfillSourceProjectId: string | null` (stamped ONLY by the
     backfill synthesizer) plus `attachTargetProjectIds: string[]`.
     `getGeneratingRunIdForProject` → `getGeneratingRunIdForAttachTargets`
     (jsonb target scan, `jsonb_array_elements_text` in an EXISTS —
     summary-less rows are simply no match); `runReadableByProject` keeps
     only the attached-run arm; `listRunsForProject` is now a join on
     `projects.run_id` (the attached run, or nothing).
   - **(b) Catalog-wide reuse (Q-C)**: `resolveBaseRun`/`baseEntryForReuse`
     replaced by `createReuseSearch(mainDb)` — one candidate read per
     generation (ready runs, newest first), manifests read lazily and
     filtered by the summary's `moduleIds`, each (moduleId, inputKey) verdict
     memoized so the pessimistic plan and the authoritative execute loop ask
     once. Unreadable manifest → logged and skipped (dev has 12 pre-merge
     schema-v1 runs; they were skipped exactly this way in the live test).
   - **Attach targets through the pipeline**: `GenerateRunStartData` carries
     `attachTargetProjectIds` instead of a `projectId`; launch claims by
     target (in-memory map keyed by runId + the catalog check), progress and
     `r_script` fan out to each target, `publishReadyRun` repoints them all
     in the one transaction, and the repoint event is emitted per target
     (its project DB opened just for the visualizations list). Zero targets
     is a normal, silent publish. The confirm-step multi-select that fills
     this list is item 2 — the server half had to land here because Q-A's
     guard re-key IS the target list.
   - **(c) `createProject` legacy writes**: `addProject` is now
     `(mainDb, globalUser, label)` — no dataset export, no `installModule`,
     no `datasetLastUpdateds`; the route's body and notify loop shrank with
     it, and `addDataset{Hmis,Hfa,Iceh}ToProject` + `sandboxDatasetCsvTarget`
     are deleted (the capture halves are untouched). The create-project
     form's commented-out dataset/module/user pickers are gone.
   - **Client**: new instance tab "Results packages"
     (`instance_results_packages.tsx`, `can_configure_data`-gated in both nav
     builders and the tab fallback) hosting the generate/resume entry; the
     wizard lost its `projectId` prop and all four `project_id` route params;
     the project tab kept its RunCard/viewers but lost the generate entry,
     the attempt read and the multi-run listing — it shows the attached
     package only, with a "no package attached yet" empty state.
   - **Live-verified on dev** (harnesses, fixtures deleted after): attempt
     CRUD by user (create → step1 → step2 → resume → step-1 re-save nulls
     step 2 → delete; empty-family and unknown-module rejections; another
     user's attempt invisible); the guard SQL against fixture rows (claimed
     target hit, free target miss, overlap in a multi-target list hit, ready
     runs ignored, NULL-summary row harmless, empty list short-circuits);
     `listRunsForProject` = the attached run with its new summary shape;
     viewer auth true only for the attached project; defaults save/read
     round trip + bad-blob degrade. Then the FULL pipeline twice with an
     identical config: run A executed R and published unattached (0 projects
     repointed), run B completed in **0.9 s** with module status `reused`,
     identical inputKey and all five output CSVs byte-identical — the
     catalog-wide search, with no base run and no attached project anywhere
     in the lookup. Both harness runs deleted.
   - **Noticed in passing, fixed**: `lib/resolve_figure_calendar.ts` (added by
     the "fy calendar" commit) was claimed by no system, so `lint:systems` was
     already RED at branch HEAD — claimed by S10. A dead
     `const mainDb = …` in `copyProject`'s background `.then(async …)`
     (`routes/project/project.ts`) removed with its needless `async`.
   - **Carried to item 3**: Q-B moves `run_progress` onto instance SSE, but
     the live R line (`notifyProjectRScript`, the `r_script` message) is
     project-scoped too and today has no channel for a run with no attach
     targets — the catalogue's current-module line needs it to move with
     `run_progress`, under the same `can_configure_data` filter.

   Gate rule for this and every item below (Q-E): re-backfill the dev projects
   (`backfill_runs.ts`) before running the rig, so every project is attached to
   its own backfill-provenance run at gate time.
2. **Attach-at-launch — DONE 2026-07-30** (gates green: `deno task typecheck`
   incl. lint:systems + rig PARITY GREEN `--run` after a full dev re-backfill;
   live-verified on dev end-to-end by harness, 7/7 checks). Item 1 had landed
   the whole server half (launch takes `attachTargetProjectIds`, publish
   repoints every target in one tx, per-target `run_attached`, guard keyed to
   targets), so this item is the confirm-step selection plus the eligibility
   rule it implies. What landed:
   - **Confirm-step multi-select** (`results_package_wizard/step_3.tsx`): a
     checkbox per `instanceState.projects` entry, defaulting to none, sent as
     `attachTargetProjectIds` at launch. A project that cannot receive a
     package — `copying`, `pending_deletion` or locked — renders disabled with
     the reason appended to its label rather than being hidden, so an expected
     project is never silently absent. Attach targets are deliberately NOT part
     of the instance defaults store (a per-generation act, not a configuration
     default), so the "save as instance defaults" payload is unchanged.
   - **Launch-time eligibility re-check** (the selection predates launch):
     `getIneligibleAttachTargetNames` (db/instance/run_generation.ts) returns a
     display name per ineligible target — its label, or the raw id when the
     project is gone — and `launchRunGeneration` refuses with them named,
     BEFORE the attempt is consumed and before any run row is minted. Without
     it a deleted target would have reached the publish transaction, where the
     per-target repoint event opens the target's project DB.
   - `launchRunGeneration`'s body schema tightened to `z.array(z.uuid())`
     (project ids are `crypto.randomUUID`, matching the `project_id` param in
     the same registry) — verified against all 7 real dev ids.
   - **Styling pass on the results-package surfaces** (spotted in passing, all
     files from this plan's own build): `border-base-300` and `text-neutral`
     violate PROTOCOL_UI_STYLING (bare `border` already paints the token;
     `neutral` is a fill intent, the foreground ramp is `base-content-muted`).
     Fixed in wizard steps 1–3, `instance_results_packages.tsx` and
     `project_results_package.tsx`; the `bg-neutral text-neutral-content`
     status badges are correct and stay.
   - **Live-verified on dev** (harness, fixtures deleted after): two throwaway
     projects created via `addProject`, plus a locked fixture row — an
     ineligible target refuses the launch naming it, leaves the attempt intact
     and mints no run row; a multi-target launch records both targets on the
     catalog row; a second launch naming one of those targets is refused; the
     generation (m009, real R execution, `done` not `reused`) reached `ready`
     and the publish transaction repointed BOTH projects to the new run. Also
     unit-checked the eligibility SQL across ready / locked / copying /
     pending_deletion / missing / mixed-order inputs, and that all 7 real dev
     projects are eligible. Fixture projects force-deleted, the run row and
     its dir removed.
   - **Noticed, not acted on**: the dev catalog holds run rows whose
     directories are gone (earlier sessions' cleanups) — the reuse search logs
     each as unreadable and skips it, exactly as designed. Reclaiming them is
     item 3's guarded delete.
3. **Catalogue — DONE 2026-07-30** (gates green: `deno task typecheck` incl.
   lint:systems + rig PARITY GREEN `--run`, 719 checks, after a full dev
   re-backfill; live-verified on dev end-to-end, server up, 16/16 harness
   checks plus an HTTP/SSE pass). All five rulings landed with it. What
   landed:
   - **Catalogue** (`listRunCatalog`, `RunCatalogItem`): every run newest
     first with its attached projects. Those come from `projects.run_id` —
     the serving pointer — never from the summary's launch-time attach
     selection, which says nothing about where a run ended up; they are the
     same fact the delete guard tests, so the column and the guard can never
     disagree. `listRunsForProject` and the catalogue now share one row
     mapper.
   - **Disk size**: `RunSummary.diskSizeBytes`, summed over the finished tmp
     dir by the SHARED builder, so both writers stamp it at the one moment
     the package is final. Typed `number | null` because rows written before
     the stamp existed have none — displayed as unknown, never recomputed
     (a run dir is immutable, so a lazy `du` would only be a slower way to
     the same number). Verified: 807,413 bytes stamped vs 812K on disk.
   - **Guarded hard delete** (`server/runs/delete_run.ts`): the guard is IN
     the DELETE (`AND status <> 'generating' AND NOT EXISTS (… projects
     WHERE run_id = …)`) so a project cannot attach between check and
     delete; a refusal re-reads the row to say WHICH reason. Row first, then
     the directory, then caches: if the directory removal fails the loss is
     disk, not correctness, and it logs loudly — a half-deleted run that was
     still LISTED would be an attachable package with no files.
   - **(a)/(e) Progress + R line on instance SSE (Q-B)**: `run_progress` and
     `r_script` added to `InstanceSseMessage` (the instance `r_script` also
     carries `runId`, since two generations can run at once), dropped in
     `routesInstanceSSE`'s forward loop for callers without
     `can_configure_data`. No emitter calls the project wrappers directly any
     more: `generate_run/notify_run.ts` pairs the instance push with the
     per-target project pushes, so the dual fan-out is one fact rather than
     five call sites. The publish-time final progress moved OUT of the
     per-target loop — a run with no targets does none of those iterations,
     and that message is what ends the generation on both surfaces.
   - **(b) Cache purge (Q-D)**: delete scans + clears `po_items`,
     `metric_info` and `replicant_opts` by runId prefix (new
     `TimCacheC.clearByUniquenessHash` — a scanned hash cannot be turned back
     into params), evicts the run's manifest-cache entries, and leaves
     `po_detail` to TTL exactly as ruled.
   - **(c) Viewer move (Q-F — the ROUTES only; item 3b reversed the UI
     half)**: `getScript`/`getLogs`/`listRunModuleFiles`
     left the project registry for `runGenerationRouteRegistry` as
     `getRunModuleScript`/`getRunModuleLogs`/`listRunModuleFiles` under
     `can_configure_data`; `runReadableByProject` died with its last caller.
     The run-keyed route shape is what makes the surfaces shareable and
     stays; the guard on them is the deferred question.
     `routes/project/modules.ts` is now only what a project MEMBER reads from
     the attached manifest.
   - **(d) Static mount (Q-G)**: the runs serve is now
     `/:run_id/outputs/*` + `can_configure_data`, not `*` +
     `requireGlobalPermission()`. The PATH scope is load-bearing as well as
     the guard: a wildcard mount carrying this permission would 403 every
     non-admin request that falls through to the assets serve mounted after
     it. Verified live — `/{runId}/outputs/{mod}/{file}` 200s,
     `/{runId}/manifest.json` and `/{runId}/inputs/*` no longer serve at all.
   - **Client**: `components/instance_results_packages/` (the surface moved
     out of `instance/`, plus the three viewers moved out of `project/`);
     shared badge/chip/label/bytes in
     `_shared/results_package_status.tsx` (S12's `_shared/**` glob owns the
     path, SYSTEMS §4.1 records S8 as owner). The catalogue refetches its
     listing when an unknown run appears (another admin launched it) and
     whenever `currentModuleId` is null — true exactly at the two boundaries
     of a generation, which is when status/summary/disk size change. The
     project tab lost the viewers and its editor wrapper with them —
     **reversed by item 3b**, which made the viewers shared rather than
     admin-only.
   - **AI tools — flagged, not ruled**: the project copilot's
     `get_module_r_script` / `get_module_log` call these same routes, so
     Q-F's permission move reaches them: they are repointed at the instance
     routes and now answer with a permission failure for a project member who
     is not an instance data admin. Typed and visible to the model, never
     silent. Gating the two tools out of a non-admin's toolset (the instance
     store has the permission client-side) was NOT done — it is a policy
     call for Tim, and the static "Results Package" view instructions name
     both tools.
   - **Live-verified on dev**: harness — catalogue ordering, attachedProjects
     equal to `projects.run_id` exactly, disk size on every attached run,
     delete refused for an attached run (row + dir survive) and for a
     `generating` fixture, delete succeeding for a ready+unattached fixture
     (row and dir gone), a row whose dir is already missing deleting cleanly,
     and an unknown id refused as not found. Then over HTTP with the server
     up: the catalogue, the three viewers at their new paths (typed
     "no script/log" on a backfill run, real content on a wizard run), the
     old project paths gone, the static-mount scope above, and a REAL
     generation (m009, R executed, `done` not `reused`) launched with ZERO
     attach targets — the whole thing arrived on instance SSE (launch
     progress → running → live R lines → terminal progress), which is the
     case that had no channel at all before this item. Deleted it over HTTP
     afterwards: row gone, dir gone, download 302s.
   - **Dev reclamation** (item 2's note, closed here): 71 unattached leftover
     runs from earlier re-backfills were reclaimed with the guarded delete —
     the dev runs volume went 415 MB → 12 MB and the catalogue 78 → the 7
     attached backfill runs. Every attached run was refused, which is the
     guard working on real rows.
3b. **Shared package explorer — DONE 2026-07-30** (gates green; Tim's
   correction to item 3's framing, same session). Item 3 split the package
   surfaces by "debug vs content" and moved the viewers to the instance
   catalogue only. **Tim rejected that split. The rule is: if the answer to
   the question lives inside the run package directory, a project user
   attached to that package can see it.** Script, log and raw outputs are all
   in the run dir, so they are not an admin-only class — they are package
   contents. Consequences, all built:
   - **Exploring a package is one capability, mounted twice.**
     `_shared/results_package/` now holds what a package CONTAINS —
     `package_contents.tsx` (module list + per-module viewers, the generating
     progress chips + live R line, the failed state, and the provenance
     line), `status.tsx`, and the three viewers moved out of
     `instance_results_packages/`. Both surfaces render the identical
     component; each keeps only its own chrome (catalogue: run list,
     generate, guarded delete, disk size, attached projects — project: the
     in-use marker and, next, the picker). The two RunCards no longer carry
     ~110 duplicated lines: 634 lines across the two surfaces became 503
     across three files, and the project tab gained the viewers it never had.
   - **`latestRLine` is a lookup, not a map**, so each surface keeps its own
     R-line store shape: the catalogue keys by run+module because two
     generations can be on screen at once, a project only ever watches its
     own.
   - **AI tools are host-agnostic.** `getToolsForModules` takes a run
     RESOLVER (`() => string | null`), never a runId from the model — inside
     a project there is exactly one correct package, so asking the model to
     name one would invite it to get wrong what it cannot get wrong. A
     resolver rather than a value because binding at construction would
     leave the tools on a stale package after a mid-conversation repoint (a
     regression the value-passing version I first proposed would have
     shipped). An instance-level copilot passes its selected run and reuses
     the tools unchanged.
   - **Permissions deliberately NOT decided** (Tim: "trivial, solve it
     later"). The routes stay `can_configure_data`; the client offers the
     viewer buttons behind one `canViewPackageInternals` expression per
     surface, so a caller without access sees no button rather than one that
     403s. When the permission model is settled it is that one expression
     plus the route guard — no structural change, which is the point of
     keeping the routes run-keyed.
   - **Still open, tracked here, not blocking:** what permission actually
     governs package internals. Under Tim's rule the natural answer is "any
     member of a project attached to this run", which is §2.6's ORIGINAL
     wording — item 3 overwrote that sentence with the Q-F/Q-G carve-out and
     it should be restored when this is settled. Note Q-G rejected
     per-project readability partly on a wrong premise (that it
     "re-introduces exactly the project-scoped guard Q-A deletes" — Q-A
     deleted the `sourceProjectId` arm and explicitly KEPT the attached-run
     arm as "end-state-correct for the project surface"). The awkward piece
     is the raw-file download: it is a `serveStatic` mount with no project
     context, so per-project readability there means replacing it with a
     streaming route that does the check.
4. **Project picker + cache guard — DONE 2026-07-30** (gates green:
   `deno task typecheck` incl. lint:systems + rig PARITY GREEN `--run`, 719
   checks, after a full dev re-backfill; live-verified on dev, 41/41 harness
   checks plus an HTTP/SSE pass with the server up). The project tab is now
   the picker, and the mandatory cache guard shipped with it. What landed:
   - **A project's relationship with packages is its own project-scoped
     mount**: `routes/project/results_package.ts` +
     `lib/api-routes/project/results-package.ts`, four routes, split by
     permission along §4 Phase 3's line. `getAttachedResultsPackage`
     (`RunListingItem | null` — null IS the typed no-package state, not an
     error) is `can_view_data`: the package a project serves from is the
     project's own data. `listAttachableResultsPackages`,
     `getResultsPackageCompatibility` and `attachResultsPackage` are
     `can_configure_visualizations` — the authoring bit the Editor preset is
     built on, and already the guard on
     `routes/project/visualization_folders.ts`, because a repoint changes
     what every authored visualization resolves against. The attach also
     carries `preventAccessToLockedProjects`.
   - **The candidate LISTING is editor-gated, not member-readable** — a
     decision the design bullet did not make. A non-editor member sees the
     package in use and is never told what else the instance holds; that is
     what "read-only for non-editor members" has to mean if the surface is
     not to enumerate the instance's catalogue to viewers. This is why the
     attached package and the candidate list are two routes rather than one
     list with the attached row marked.
   - **`listRunsForProject` deleted** (db function, route, registry entry),
     replaced by `getAttachedRunForProject` (singular — the shape was always
     a 0-or-1 list) and `listAttachableRunsForProject` (ready runs minus the
     attached one, newest first, sharing the same row mapper as the
     catalogue).
   - **The repoint is `setProjectAttachedRun`**: the publish transaction's
     pointer UPDATE minus the status flip. The ready gate is IN the
     `UPDATE … FROM runs`, so a candidate cannot fail between the
     compatibility report and the write; the `projects.run_id` FK
     (migration 065, no cascade) closes the other side — a concurrent
     guarded delete blocks on the FK's row lock and then fails its own
     not-referenced guard, so an attach can never land on a deleted package.
     A refused write re-reads to say which reason (not found / not ready).
   - **One repoint EVENT, two emitters.** `server/runs/attach_run.ts` holds
     `buildRunAttachedManifestPayload` (the manifest-derived half, identical
     for every project attaching to the same package, so a multi-target
     publish still builds it once outside its loop) and
     `notifyRunAttachedForProject` (the per-project half — only the
     visualizations list needs the project DB, and it needs the NEW manifest
     to derive the virtual defaults from). `pipeline.ts` now calls both
     instead of carrying its own copy; a picker attach gets a byte-identical
     `run_attached`. An unreadable manifest AFTER a successful repoint is
     logged, not rolled back: the read plane already reports a broken
     attached package properly, and rolling the pointer back would be a
     worse lie.
   - **The §2.6 compatibility report** (`server/runs/package_compatibility.ts`):
     the project's AUTHORED visualizations resolved against the candidate's
     manifest — metric absent → `metric_not_in_package`, metric stamped
     unavailable → `metric_unavailable` with the stamped reason, else any
     requested disaggregation (groupBy + filter + replicateBy) the
     candidate's results object does not offer →
     `dimensions_not_in_package`. ONE issue per visualization in that
     resolution order, because a missing metric makes the later questions
     unanswerable. Manifest lookups only, zero data queries. Virtual
     defaults are excluded by construction — `getAllPresentationObjectsForProject`
     is the authored table, and migration 038 deleted the legacy default
     rows. The report never BLOCKS: an incompatible package is still
     attachable, and the affected visualizations render their typed
     unavailable states. It exists so the choice is made with the loss in
     view.
   - **Client**: `project_results_package.tsx` = the attached-package card
     (shared `_shared/results_package/` contents, unforked) plus this
     surface's own chrome — the candidate list and the swap. The report
     renders in `results_package_compatibility_modal.tsx` via
     `openComponent`, resolving true/false into the attach action. The tab
     gate moved from `can_configure_data` (instance) to
     `perms.can_view_data` (project) in BOTH places in
     `project/index.tsx`.
   - **Refetch rule fixed in passing**: the old surface refetched on any
     `run_progress` tick naming a run it did not list — true on EVERY tick of
     a generation targeting this project, so a storm. It now refetches at the
     generation's terminal boundary (`currentModuleId === null`), the same
     rule the catalogue uses, plus the `attachedRunId` effect dependency that
     already covers a publish.
   - **The cache guard** (`state/_infra/reactive_cache.ts`): a new optional
     `responseMatchesVersion(data, version)` on the cache config; `setPromise`
     refuses to store a payload that fails it and logs. This is the client
     half of the server caches' `parseData`, which recomputes both hashes
     from the response for exactly the same reason. Wired into all four
     run-keyed caches via `responseRunIdMatches(data.runId, runKey)` in
     `t1_store.ts` — which returns FALSE for an absent runId, so the parity
     rig's Postgres-baseline payloads can never be cached either.
     `po_detail` folds two facts, so its guard reads the run key off the
     version's trailing segment: the row-revision half cannot be checked,
     because `pds.lastUpdated.presentation_objects[id]` is `"unknown"` until
     an SSE `last_updated` for that PO arrives, and comparing it to the
     payload's own `lastUpdated` would silently refuse every entry. The
     trailing-segment read is safe because neither a runId (a UUID) nor a
     PO `last_updated` (an ISO stamp) contains `|` — asserted against every
     real row in the harness.
   - **Live-verified on dev** (harness + HTTP, fixtures deleted after):
     attached/attachable equal to `projects.run_id` on all 7 real projects
     and correctly ordered; on a disposable project — null before attach,
     all 14 ready packages offered, attach succeeds, the attached one drops
     out of the candidate list, an unknown package and a `generating` one
     are both refused with the pointer untouched. Compatibility: three
     fixture POs against a real manifest gave exactly one clean, one
     `metric_not_in_package` and one `dimensions_not_in_package`; over HTTP,
     a real project's 5 authored POs reported 0 issues against every ICEH
     package and 5 `metric_not_in_package` against the HFA-only package —
     the report telling the two apart on real data. Then over HTTP with the
     server up: create → attach → swap → the guarded delete refusing the
     newly attached package, and a project-SSE capture showing the
     `run_attached` event carrying the full catalog (1 module, 2 metrics,
     6 visualizations, 1 dataset). Every fixture project force-deleted; runs
     dirs and catalog rows both back to 14.
   - **Not verifiable in dev, recorded**: the locked-project refusal.
     `_BYPASS_AUTH` hardcodes `isLocked: false` in `getProjectUser`, so the
     `preventAccessToLockedProjects` arm cannot fire locally. The call shape
     is byte-identical to the shipped
     `routes/project/visualization_folders.ts` one.
   - **Noticed, fixed in passing**: the guarded delete's refusal message told
     the user to "detach it from every project first", a control that does
     not exist — it now names the act that does (point those projects at
     another package). The three shared viewers still carried item 3's
     "instance-admin surface (Q-F)" comments, which item 3b reversed; same
     for the registry and route-file headers.
5. **Rig `foreign_run` + docs — LAST.** Full spec = the "Rig" bullet in
   "Phase 3 core — design". Rig gates iff a project's attached run is that
   project's own backfill-provenance run, `foreign_run` typed non-gating
   outcome otherwise — the field to test is
   `RunSummary.backfillSourceProjectId` (added in item 1, stamped ONLY by
   `synthesizeRunForProject`; wizard runs carry null, which is exactly the
   signal). `foreign_run` is COUNTED and printed in TOTALS, never a silent
   skip and never RED.

   Then the closing sweep: SYSTEM doc prose reconciliation — **prose only,
   never glob catch-up** (each item claims its own globs as it lands, and
   items 0–4 did). Items 3 and 4 both reconciled their own S8 route/client
   prose and S3 notify-catalog prose, so this sweep is for whatever item 5
   leaves behind plus a read-through for drift. Known drift item 4 did NOT
   touch, because it is Phase 4's rewrite and not item 4's to correct: S8's
   "Install & catalog (dual-write plane)" section still describes the
   dual-write that item 0 deleted.

   **One ruled deliverable belongs to no work item — record it, do not build
   it.** Q-C also ruled hardlink dedup for run storage (amending §3.7's "copy,
   never link"), and no Phase 3 item owns it; §3.7 says it may land before or
   after the deploy and nothing depends on it. It is unimplemented (no
   `Deno.link` anywhere under `server/runs/` or `generate_run/`). Item 5's
   sweep should leave it as a named open item somewhere Tim will see it again,
   rather than letting it fall out of the plan when Phase 3 closes.

   Then the exit gate — **this is what makes item 5 different in SHAPE from
   items 0–4, which each ended at their own two gates**: `deno task
   typecheck` + rig green + a live dev pass over the whole user model in one
   sitting, covering instance generation with multi-attach, a swap with the
   compat report, the guarded delete, and defaults save/prefill. Item 4's
   harness (`getAttached`/`listAttachable`/compat/attach + the guarded
   delete) and item 3's (catalogue, viewers, SSE) are the pieces; the exit
   gate is running them as one flow against a server that is up, not
   re-proving each in isolation. When that is green the Phase 3 core is DONE
   and the branch is Tim's to roll out — **item 5 does NOT deploy**, and
   Tim's rollout has its own preconditions (Deploy phasing's pre-deploy
   checklist: the modules-repo push and its rollback coupling, the
   per-instance Postgres runs-volume mount, and two decisions that are Tim's
   to make, not an agent's).

### Binding implementation decisions (do not re-derive)

1. Engine seam = `SqlRowsExecutor` + core/wrapper split in
   `server_only_funcs_presentation_objects/`; pg wrappers preserve legacy
   behavior byte-for-byte and are deleted with the Postgres read path.
2. `PO_CACHE_VERSION` — the branch minted "6" for the TS re-sort of option
   lists (`Intl.Collator("en", {numeric: true})`, BOTH engines, in
   `getPossibleValuesCore`), which pins away the Postgres-collation vs
   DuckDB-binary ordering delta. CURRENT value is **"10"** with prefix
   **`po_detail_v5`** (merge took "9"/v4 past both sides' independent bumps;
   the review bumped again because the semantic batch changed payloads after
   "9"/v4 were minted). The authoritative values live in
   `server/routes/caches/visualizations.ts` with their lineage comments.
3. Capture-time instance reads are correct (into the manifest at finalize);
   read-time live reads are forbidden.
4. `RUNS_DIR_PATH` returns, WITH its three path namespaces — the wizard mounts
   run dirs into the R container and the Postgres container needs the runs
   volume for `COPY … TO` dataset extracts (docker-compose change ships with the
   deploy).
5. `getAllMetrics`/`getMetricsWithStatus` (module cards) are never flipped —
   that surface dies with the wizard in this deploy; metric status reads the
   manifest availability stamps. `export_central` was RETIRED, not flipped
   (route deleted — work item 6); nothing gates the legacy plane's demolition.

### Empirical gotchas (verified; don't rediscover)

DuckDB `getRowObjectsJson()` returns BIGINT/DECIMAL as strings — the executor
uses `getRowObjects()` + explicit conversion (throws outside safe-int range);
`read_csv` `columns=` is file-column-order sensitive; `nullstr` also nulls
QUOTED fields unless `allow_quoted_nulls=false`; `information_schema` queries
need `table_schema='public'`; the lint gate only sees TRACKED files (a new file
passes until committed, then orphans); `string_to_array`/`&&`/`unnest` (the
multi-membership SQL) work unchanged on DuckDB. The parquet built from a CSV
uses the CURRENT facility config for drops while the pg table was normalized at
its ingest time — a config change since a module's last run can make them differ
until that module reruns (the rig surfaces it). The Ethiopian quarter expression
is code-identical in shape but has NOT run against real Ethiopian data — the
Ethiopia-instance rig run, scheduled early in the fleet rollout, is the gate for
that (it cannot run pre-flip; accepted, see Deploy phasing).

---

> Vision / end-state: [VISION_RESULTS_RUNS.md](VISION_RESULTS_RUNS.md). This
> plan supersedes and absorbs PLAN_PROJECT_SNAPSHOT.md (deleted; its Step A/B
> project-DB capture mechanism is replaced wholesale — its open question 4b is
> resolved by construction here, see §8). Grounded in an 8-agent code-verified
> sweep (S8 pipeline, S9 SQL surface, full read-surface, cache/ versioning,
> DB+filesystem inventory, plans reconciliation, modules repo, client flows)
> plus a hands-on DuckDB-in-Deno experiment. All file:line citations were
> harness-verified 2026-07-07.

**The move:** stop ingesting module results into per-project Postgres. Each
generation act produces an immutable, self-contained **run directory** keyed by
a run ID; the viz query layer (S9) queries the run's files via **DuckDB**;
caches key on the run ID; projects hold a run pointer; generation moves to an
instance-level wizard. Projects become pure authoring spaces (S9–S13).

---

## 1. Why this is smaller than it looks — verified groundwork

1. **Results are already files.** R writes one CSV per results object into
   `sandbox/{projectId}/{moduleId}/`; Postgres ingest is a `COPY FROM` of that
   CSV
   ([run_module_iterator.ts:383-473](server/worker_routines/run_module/run_module_iterator.ts#L383-L473)).
   The CSVs persist after ingest.
2. **Inter-module data flow is already file-based.** Dependent modules read
   `../{upstreamModuleId}/{file}.csv` from the sibling sandbox dir, never `ro_*`
   ([get_script_with_parameters.ts:59-71](server/server_only_funcs/get_script_with_parameters.ts#L59-L71)).
   Several results objects (`createTableStatementPossibleColumns: false`, e.g.
   m002's admin-area/national aggregates that feed m003/m004/m005) are **never
   ingested at all** — the filesystem is already the data plane. Postgres `ro_*`
   exists solely to serve S9 queries, metric enrichment probes, the raw-rows
   preview, and central export.
3. **The generated SQL ports.** The whole S9 surface is: 2 plain CTEs, one
   `UNION ALL` (roll-up), one PAE subquery wrap, `SUM/AVG/COUNT/MIN/MAX`,
   `LEFT JOIN` (facility subset), `UPPER() IN`, integer period arithmetic (`/`,
   `%`, `LPAD`, `CASE`), `SELECT DISTINCT … ORDER BY … LIMIT`,
   `NULLIF/COALESCE/ABS`, `::int/::text` casts. Verified absent: window
   functions, DISTINCT ON, FILTER, LATERAL, arrays, JSON operators, regex, date
   types/functions, HAVING (verified inventory over
   `server_only_funcs_presentation_objects/**`; the four dialect deltas to
   manage are in §2.4).
4. **Empirically proven at production scale** (scratchpad, 2026-07-07,
   `npm:@duckdb/node-api@1.3.2-alpha.25` under Deno; read-only prod fetch of
   real Nigeria/Ethiopia data, deleted after):
   - **69 real production PO configs** (Nigeria's MAMII project, every viz built
     on `M3_service_utilization`) were run through the repo's **own SQL
     builders** (`getFetchConfigFromPresentationObjectConfig` →
     `buildCombinedQuery`) — not hand-written SQL — against the real 67.2M-row
     table (Nigeria's actual worst-case scale, materialized 4× from a 16.8M-row
     2025 slice). Fresh cold DuckDB instance **per request** (the §2.4 serving
     model), reading Parquet: **median 116 ms, p90 152 ms, max 214 ms**. At the
     raw 16.8M-row slice: median 35 ms, max 132 ms. Zero SQL failures across all
     138 runs (both scales).
   - **DuckDB is ~50–240× faster than the current Postgres path, not merely
     equivalent.** `EXPLAIN ANALYZE` of the same query shapes against the real
     66.4M-row prod `ro_m3_service_utilization_csv` (no indexes — every read is
     a parallel seq scan): a timeseries+SUM+filter took **8.1 s warm / 10.4 s
     cold**; the same query **with the `__NATIONAL` rollup UNION took 15.7 s**;
     a possible-values `DISTINCT` took **5.3 s**. DuckDB ran the equivalents in
     116–214 ms and 22 ms. This reframes the switch: it is not "cleaner model,
     similar speed" but a large cold-read speedup — and it explains _why_ the
     current app is so cache-dependent (a Valkey/IndexedDB miss on a big project
     is a 8–16 s wait). The gap is structural: columnar Parquet reads only the
     3–4 needed columns (78 MB) where Postgres row storage seq-scans all columns
     of 66M rows (9.4 GB).
   - **Parity: 69/69 configs byte-equal to Postgres** to a max relative error of
     **2.0e-15** — the floating-point floor. Same generated SQL run against
     local Postgres (`NUMERIC`, exact) and DuckDB (`DOUBLE`, float); the ≤1e-9
     epsilon policy (§3.3) passed every config with room to spare. **This
     resolves open question 7** — DOUBLE + relative-epsilon is correct; DECIMAL
     is unnecessary.
   - **Parquet is 23× smaller** than the source CSV (78 MB vs 1.82 GB for the
     16.8M-row slice).
   - **Memory is bounded and tiny per request.** A 67M-row aggregate under
     `SET memory_limit='512MB'` completed in 79 ms at **0.12 GB peak RSS** —
     DuckDB streams. Concurrent large queries just need a per-connection
     memory_limit; no pooling needed (cold open→query→close ~5 ms).
   - `SET integer_division = true` restores Postgres `int/int` truncation
     (without it, DuckDB float-division + rounding puts August in Q4 — a
     wrong-data hazard, not a crash).
   - **Null representation differs by source, and finalize must handle both**
     (new finding): raw R output uses `NA`, but a `ro_*` table exported via
     Postgres `COPY` uses **empty string** for NULL. `read_csv` needs
     `nullstr=['NA','']` accordingly — the finalize step reads raw R CSVs
     (`NA`), but any tool building Parquet from a pg dump must expect `''`.
   - `SUM(BIGINT)` returns JS `BigInt` (breaks `JSON.stringify`); `::DOUBLE`
     casts (or `getRowObjectsJson`) resolve it.
5. **Volumes are large but well within DuckDB's range** (fleet census,
   read-only, 2026-07-07). Nigeria's sandbox is **1.3 TB** (Ghana 151 GB,
   Ethiopia 127 GB); a single Nigeria project is ~35 GB, and its biggest `ro_*`
   tables are **66.4M rows / 9.4 GB** in Postgres (Ethiopia similar at 47.7M).
   Two consequences: (a) the query battery above proves DuckDB handles this
   scale in ≤214 ms, so no indexes/pagination are needed; (b) the ~20 Nigeria
   projects each carry a near-duplicate ~35 GB of the _same_ national data —
   **exactly the duplication shared runs collapse**, turning a 1.3 TB
   per-project sprawl into a handful of shared runs.
6. **The artifact layer is already decoupled.** Decks/reports/dashboards store
   self-contained FigureBundles; the public viewer and exports render from
   stored bundles with zero results-table access. Only the _live_ PO query path
   re-points.

---

## 2. Target architecture

### 2.1 The run directory

Mirrors today's project-sandbox layout (so the R contract — `../datasets/` and
`../{moduleId}/` relative reads, and the single Docker mount — is unchanged),
plus a manifest (layout re-cut 2026-07-10: three top-level entries, no separate
query store):

```text
<instance>/runs/<runId>/
  manifest.json            ← see §2.2
  inputs/                  ← EVERYTHING the run consumed (datasets live here
                             too — an input is an input)
    datasets/<type>.csv    ← windowed dataset extracts (same COPY TO export
    datasets/<type>.parquet  that builds them today) + their parquet twins,
                             exact siblings like every parquet in this dir
                             tree — DECIDED 2026-07-10: run input data is
                             queryable through the same DuckDB plane, and a
                             project-UI surface for querying it comes in
                             Phase 3. Generated scripts read
                             ../../inputs/datasets/ (item 4, DONE:
                             app-side injection, per-caller — the legacy
                             sandbox path keeps ../datasets/ until item 5).
    facilities_hmis.parquet, facilities_hfa.parquet   ← structure subset
    indicators.json, calculated_indicators.json,      ← dictionary/snapshot
    hfa_*.json, iceh_indicators.json                    content (today's 12
                                                        project mirror tables)
    assets/<name>           ← pinned copies of consumed instance assets
    geojson/aa<level>.json  ← boundary geometry (later phase; see §8 SNAP-2)
  outputs/<moduleId>/       ← execution workspace per module: ___script___.R,
    <roId>                    ___logs___.txt, raw output CSVs (the
    <roId>.parquet            inter-module plane + debug/download surface),
                              and each results object's normalized query
                              parquet as a PURE SIBLING of its CSV — exactly
                              the Phase-0 shadow-write layout. Inter-module
                              reads (../{upstreamModuleId}/{file}.csv) are
                              unchanged: module dirs stay siblings.
```

Sibling-parquet decision (2026-07-10): there is no `query/` dir. Finalize builds
any missing/stale `<roId>.parquet` beside its CSV (declared types, the four §2.3
normalizations); the accepted trade-off is that app-built parquet sits inside
the R workspace. End-state: R itself emits the parquet in the same folder, and
the CSV is eventually dropped — the sibling layout is the one that survives that
transition without moving anything.

`runId` = UUID. Runs live beside `sandbox/` under the instance dir (new env
`RUNS_DIR_PATH` following the `SANDBOX_DIR_PATH` pattern with its three path
namespaces, [exposed_env_vars.ts:61-85](server/exposed_env_vars.ts#L61-L85)).
Note the dir has **three writers across container boundaries**: the Postgres
container writes dataset extracts via `COPY … TO` (needs the runs dir
volume-mounted into it — a docker-compose change), the Deno process writes
manifest + parquet, and the R container mounts it for execution. Generation
writes into `runs/.tmp-<id>/` and atomically renames to `runs/<id>/` at finalize
— a crashed generation leaves no readable run, and immutability is enforced by
construction, not convention. A post-finalize dedup pass (§3.7, ruled
2026-07-29) may replace any file with a hardlink to an identical blob in
another run and `chmod 0444` it: the run stays a directory of ordinary files at
ordinary paths, and only inodes are shared.

**Immutability — audited 2026-07-30, statically and empirically. This is the
invariant the whole design rests on; anything that would break it is a defect,
not a trade-off.** Every caching layer assumes it: `manifest_cache.ts` parses a
manifest at most once per runId with NO invalidation path, `virtual_defaults`'
`DERIVED_CACHE` is keyed by runId alone, the Valkey caches fold runId into
their hashes, and §3.7's hardlink dedup is only safe because run files are
write-once.

Enumerated: every filesystem write in the server that targets the runs volume
resolves to `runTmpDirPath(runId)` (i.e. `.tmp-{runId}`) — prepare, execute,
reuse, asset import, parquet build, finalize. A published run dir is only ever
reached by three things, none of which mutate content: the two
`Deno.rename(tmpDir → runDirPath(runId))` publishes (`pipeline.ts`,
`synthesize_run.ts` — both onto a FRESHLY minted `crypto.randomUUID()`, so a
rename can never land on an existing dir), reads (`run_read.ts`,
`manifest_cache.ts`, the viewer routes, the static mount), and
`deleteRun`'s guarded whole-directory `Deno.remove`. Reuse is
`Deno.copyFile` OUT of a published run into the new tmp dir. The R container
mounts only `.tmp-{runId}`, never a published run. `sweepAbandonedTmpRunDirs`
removes only `.tmp-`-prefixed entries.

Two honest qualifications: (1) **immutable ≠ permanent** — a run dir can be
deleted in one guarded act, just never edited; (2) the runs VOLUME is not
read-only even though each run dir is — `.duckdb-spill/` is a dot-prefixed
sibling at the volume root (the executor's `temp_directory`, wiped and
recreated at boot), and the volume root itself gets an `mkdir` at startup.

Empirical proof, dev instance: SHA-256 over all 372 files across all 14 run
dirs, then the parity rig's 719 checks driving the full DuckDB read plane,
then re-hashed — byte-identical, and no file mtime moved.

### 2.2 The manifest — precomputed, not probed

`manifest.json` (Zod-validated, schema-versioned) carries:

- **Identity + provenance**: runId, createdAt, label, calendar, countryIso3,
  engine versions (R image tag, app version, manifest schema version).
- **Inputs record**: per dataset family — instance version stamps, windowing,
  row counts (what `datasets.info` holds today,
  [datasets_in_project_hmis.ts:146-155](server/db/project/datasets_in_project_hmis.ts#L146-L155));
  per module — git ref, resolved parameters; the **facility-columns config** the
  run was generated under (this is SNAP-1/N1, dissolved — see §8); pinned-asset
  names+hashes.
- **Module catalog**: the installed (monolingual) definitions — metrics, results
  objects, viz presets — i.e. what the project-DB `modules`, `metrics`,
  `results_objects` tables hold today. Plus a finalize-computed **per-metric
  availability stamp**: each metric is validated against the actual RO schemas
  (valueProps present? PAE ingredients present? required disaggregation options
  available?) → `available` | `unavailable` **with reason**. Readers never
  re-derive availability; they read the stamp. (Synthetic-backfill runs get the
  same stamping — catalog from the project DB, actual schema from the exported
  `ro_*` tables.)
- **Per-results-object query metadata** — the key simplification. Everything
  `enrichMetric` discovers today by firing ~20 `SELECT … LIMIT 1` column probes
  per metric per read
  ([metric_enricher.ts:23-198](server/db/project/metric_enricher.ts#L23-L198))
  is computed ONCE at finalize and stored: actual columns + types (post
  normalization), physical time column, `hasFacilityLevelRows`, available
  disaggregation options, row count, period bounds. `ResultsValue` enrichment
  becomes a manifest lookup. This also deletes the "duplicate resolution
  round-trips" open item (SYSTEM_09) — resultsObjectId → module → last_run_at
  chains become one manifest read.
- **Memoization fields** (schema present from the first manifest, consumed from
  Phase 2 — §3.7): per module node an `inputKey` = hash(generated
  `___script___.R` text, sorted content hashes of declared input files — dataset
  extracts + upstream outputs + pinned assets, R image tag); per output file a
  content hash. Synthetic-backfill runs carry neither (they have no scripts/raw
  inputs) and are never reuse sources.

### 2.3 Finalize — where the four ingest transforms move

Ingest currently does exactly four semantic normalizations
([run_module_iterator.ts:383-473](server/worker_routines/run_module/run_module_iterator.ts#L383-L473)):
`NA`→NULL; table = CSV headers ∩ declared columns (undeclared header = error);
drop redundant period columns and enabled facility columns; normalize 6-digit
`quarter_id` → 5-digit. The **finalize step** reproduces all four while writing
each RO's sibling `<roId>.parquet` from its raw CSV: read with `nullstr='NA'`
(raw R output uses `NA`; note a `ro_*` table dumped via Postgres `COPY` instead
uses empty string, so a pg-sourced backfill reader needs `nullstr=['NA','']` —
verified 2026-07-07), then **project to header ∩ declared columns with declared
types** — the CSV legitimately carries a subset of the declared "possible"
columns, so finalize must select-and-cast (empty/`NA` → NULL before the numeric
cast), not force the full declared schema — then apply the drop rules and
quarter rewrite, then compute the §2.2 query metadata. Raw CSVs stay as-written
(R/debug contract); the sibling parquet is the normalized truth. File-only
results objects (`createTableStatementPossibleColumns: false`) stay file-only —
no parquet, exactly as they are excluded from Postgres today.

**Schema roles — contract at write time, artifact at read time.** The authored
`createTableStatementPossibleColumns` declaration is NOT dropped when the SQL
tables go; its role sharpens into exactly one half of the boundary:

- **Write-time contract, enforced at finalize** exactly as ingest enforces it
  today: an undeclared CSV header is a hard error — caught at generation, in the
  wizard, where an admin is watching, not at first render where a user is.
  Reading with **declared types** (cast, never inferred) makes a type violation
  equally loud, the same failure Postgres `COPY` gives today. "Possible
  superset" semantics are unchanged: actual schema = header ∩ declared.
  Undeclared output _files_ warn (and are excluded from reuse/finalize
  accounting) rather than throw.
- **Declared types are load-bearing under runs in a way they weren't before.**
  CSVs carry no types and DuckDB inference is data-dependent (all-`NA` columns
  are uninferrable, digit-like text infers BIGINT with leading-zero loss), so
  the same RO could infer _different schemas in different runs_ as data changes.
  Swappable runs require cross-run schema stability — a visualization must
  behave identically against every run of the same module version — and only
  declared types provide it.
- **Lint anchor**: the wb-fastr-modules build already checks valueProps ⊆
  declared columns and PAE ingredients ⊆ columns at authoring time; the
  declaration is what makes metrics checkable before anything runs.
- **The manifest is the read-time artifact.** Finalize writes each RO's actual
  post-normalization schema plus the query metadata above, and readers — query
  layer, client, AI — consult ONLY the manifest. The definition is never read at
  query time. Today's half-contract/half-probe split (enrichment probing
  physical tables; the project-DB `results_objects.column_definitions` copy)
  dies with the tables.

### 2.4 The query engine adapter

- New `server/run_query/` (claimed in a SYSTEM glob — the lint gate requires
  it): opens the run's parquet files read-only per request via
  `npm:@duckdb/node-api` (pin the version; the `linux-x64` binding bakes into
  the image via the Dockerfile's existing `deno install` — verified offline-
  loadable, see Phase 0), registers views named by the existing
  `getResultsObjectTableName` convention plus `facilities_hmis/hfa` views over
  the inputs parquet, runs `SET integer_division = true` and a per-connection
  `SET memory_limit`, executes the **same generated SQL strings** S9 builds
  today.
- The **data query itself** is engine-agnostic already — strings executed via
  `projectDb.unsafe(sql)`; there the adapter swaps the executor, not the
  builders. But the hot functions also interleave **project mirror-table reads**
  that are a genuine SQL→manifest/JSON rewrite, not an executor swap, and they
  must land with the read flip (Phase 4 drops the tables). The enumerated
  rewrite surface: `getIndicatorMetadata` + `getDatasetFamilyForModule`
  ([get_indicator_metadata.ts](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts)
  — reads `modules`, `indicators`, the 4 `hfa_*_snapshot` tables, ICEH snapshot;
  its result is embedded in cached items payloads); the
  `results_objects`/`modules` lookups in the items path
  ([get_presentation_object_items.ts:37](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L37));
  the two probe helpers (`detectColumnExists`, `detectHasAnyRows`) and
  `information_schema` checks → manifest lookups; `enrichMetric` → manifest
  metadata.
- **Calendar must thread from the manifest, not the env.** `getCalendar()` is a
  global env read that changes generated SQL (`getQuarterIdExpression`) — fine
  same-instance, wrong the moment a run is queried under a different instance
  calendar (the transportability end-state). The adapter passes
  `manifest.calendar` into SQL generation; this folds in SYSTEM_09's standing
  "separate data-calendar from i18n" decoupling item as a prerequisite, not a
  nicety.
- **Payload/behavior deltas to manage (broader than value formatting):**
  1. `ro_*` value columns are Postgres `NUMERIC`, returned as **strings** by
     postgres.js; DuckDB returns native numbers (and BigInt for integer SUMs —
     cast aggregates `::DOUBLE`). Items are typed `string | number | null`
     throughout, so native numbers are legal — but it is a cached-payload shape
     change: **one-time prefix bump** on
     `po_items`/`metric_info`/`replicant_opts`, gated by the golden-diff rig.
  2. **Possible-values / filter matching**: `disaggregation_value` is
     string-typed today and compared against stored fetch-config filter values
     (strings). Numeric disaggregation columns (`year`, `quarter_id`,
     `period_id`) must be normalized **to text at the adapter boundary** so
     option/filter equality is unchanged.
  3. **Text ORDER BY collation**: Postgres orders by DB collation, DuckDB by
     binary — changes option order _and which values survive the LIMIT 501
     cutoff_. Pin behavior: keep the SQL ORDER BY for determinism, re-sort
     option lists in TS with a defined comparator, and have the rig diff option
     sets, not just row values. The wire boundary validation
     (`validateFetchConfig`, the SQL-safety table in SYSTEM_09) carries over
     unchanged — same strings, same injection surface, same guards.
- Concurrency: keep the `RequestQueue`s and in-flight coalescing through the
  cutover (cheap insurance); list them as a Phase-4 removal candidate once
  measured — they were built for slow Postgres round-trips.

### 2.5 Cache keying — the collapse

| Cache            | Today (uniqueness / version)                                                    | Target                                                                                      |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `po_items`       | projectId, roId, fetchHash / `PO_CACHE_VERSION\|moduleLastRun\|datasetsVersion` | **runId**, roId, fetchHash / `PO_CACHE_VERSION`                                             |
| `metric_info`    | projectId, metricId / same                                                      | **runId**, metricId / `PO_CACHE_VERSION`                                                    |
| `replicant_opts` | projectId, roId, replicateBy, fetchHash / same                                  | **runId**, roId, replicateBy, fetchHash / `PO_CACHE_VERSION`                                |
| `po_detail`      | projectId, poId / PO `last_updated`                                             | projectId, poId / PO `last_updated` **+ runId** (payload embeds run-derived `resultsValue`) |

- The run ID replaces exactly the **data-version** dimensions. The two code
  knobs survive unchanged: `PO_CACHE_VERSION` (payload meaning) and the key
  prefix (payload shape) — a run ID does not protect against code changes.
- Uniqueness becoming run-scoped (not project-scoped) means two projects
  attached to the same run **share cache entries** — correct and free.
- Client mirrors: `moduleDataVersionKey`/`datasetsVersionKey`
  ([t1_store.ts:200-216](client/src/state/project/t1_store.ts#L200-L216)) are
  replaced by the project's `attachedRunId` from the T1 store. The `"unknown"`
  sentinel ("module hasn't run") becomes a typed "no run attached" state.
- **Deleted outright**: the dependent-PO `last_updated` sweep on run end
  ([set_module_clean.ts:132-161](server/task_management/set_module_clean.ts#L132-L161))
  — it exists only because `po_detail` payloads embed live table probes;
  `getDatasetsVersion` per-request reads; the write-only
  `global_last_updated('any_module_last_run')` row (zero readers today —
  deletable independently).
- Immutability makes server/Valkey entries for dead runs garbage — the guarded
  delete purges them. Mechanism and scope are ruled in the Q-D entry of the
  "DESIGN QUESTIONS" block (targeted `scanUniquenessHashes` purge of the three
  runId-prefixed caches; `po_detail` to TTL), which supersedes this bullet's
  original `clearEntriesWithPrefix(runId)` wording. Client IDB relies on the
  existing deploy flush as today.

### 2.6 Catalog, pointer, access

- Main DB: new `runs` table (id, label, status
  `generating|ready|failed|retired` — `retired` is DEAD per ruling 3, never
  written, created_at, created_by, manifest summary
  for listing) — the catalogue. `projects` gains `run_id` (nullable FK) — the
  pointer. Swapping runs is an UPDATE + SSE notify. **Invariant:** `run_id` is
  only ever set to a run with `status='ready'` (which is only set after the
  atomic rename, §2.1), and every reader gates on it — a crash mid-generation
  can never be observed. Failed/abandoned `.tmp-` dirs are swept at boot.
- Project isolation today is connection-level via the `Project-Id` header guard.
  Run reads add: resolve `projects.run_id` inside the guard (or per-route) → run
  paths. Runs are instance-level artifacts whose DATA is readable by any
  project member of an attached project (the ordinary viz/read path). Item 3
  carved the **package internals** — script, logs, raw file listing and the
  static file download — out of that sentence as `can_configure_data`
  instance-admin only, per Q-F/Q-G. **Item 3b re-opened that carve-out**
  (Tim: if the answer lives inside the run package directory, a project user
  attached to that package can see it — which is what this sentence
  originally said). The UI already follows the restored rule; only the route
  guards still carry the item-3 carve-out, and settling them is the plan's
  one deferred question. See item 3b's build record. **Generating** runs is instance-admin gated
  (matches today: dataset attach is admin-gated in the UI). Central-reporting cross-project
  reads were retired with the `export_central.ts` route (work item 6); a future
  central hub streams the run's files.
- **PO validity across swaps — module evolution is per-run, informed, never
  silent.** Metric ids are stable authored ids (`m1-01-01`); a PO resolves its
  metric against the _attached run's_ catalog, so a module changing its results
  objects over time affects a project only when a newer run is attached — old
  runs keep their old catalog forever (today a module update mutates the
  project's only reality underneath every existing viz). Resolution failures are
  typed, not silent: metric absent → `not_in_run`; metric present but stamped
  unavailable (§2.2) → surfaced with the stamped reason; a stored config
  referencing a disaggregation the run doesn't offer surfaces the same way —
  upgrading today's known trap where a stale config's vanished disOpt is
  **silently omitted** with no error surface (SYSTEM_09 "stale configs fail
  silent"). Attach/swap shows a **compatibility report** before
  repointing ("N visualizations reference metrics not in this run; M use
  dimensions it doesn't produce") — computed by resolving the project's POs
  against the candidate manifest, no data queries needed.

### 2.7 What stays in Postgres

- **Instance DB**: everything it holds today (users/ACLs, config, structure
  master, dataset facts, upload attempts, slugs, AI governance) + the new `runs`
  catalog + `projects.run_id`.
- **Project DB**: authored content only — presentation_objects + folders,
  slides/decks, reports, dashboards. The 12 input-mirror tables, `modules`,
  `metrics`, `results_objects`, `ro_*`, and `global_last_updated` all go
  (end-state; phased in §4).

### 2.8 What dies (the mutability tax, enumerated)

DROP-at-run-start/install/uninstall of `ro_*`; the ingest COPY; the dirty
cascade (`setModuleDirty` recursion, `setModulesDirtyForDataset`, queue-gate-
trigger loop, kill-on-redirty, runToken staleness guards **as project-level
machinery** — the wizard reuses the shipped worker/docker contracts for its own
execution, but "dirty" stops being a property of live projects); the
boot-recovery gap moves with it; three staleness checkers
(`checkDataNeedsUpdate`, `checkModulesNeedUpdate`,
`computeDefUpdatedAt >
lastRun`) collapse into catalog-level "newer run
available"; the `module_dirty_state`/`any_running` SSE surface shrinks to wizard
progress; `enrichMetric`'s probe storm and `detectHasAnyRows`-per-metric on
every project load/SSE push; the N1 facility-columns gap (dissolved, §8);
project-copy's `CREATE DATABASE … TEMPLATE` of results + sandbox `cp -r` (copy =
authored-content clone + same run pointer).

---

## 3. Design decisions (made here; flag disagreement rather than re-deriving)

1. **Run = whole-DAG generation.** One wizard execution covers every selected
   module in dependency order into one run dir — there is no partial run and no
   in-place mutation. Fast regeneration comes from memoized reuse _inside_ a
   whole-DAG generation (§3.7), never from updating a subset of an existing run.
   This is what makes a run _coherent_; today's sandbox demonstrably isn't
   (per-module timestamps a month apart, leftover files from removed ROs/legacy
   modules).
2. **Parquet beside each raw CSV, not a `.duckdb` database file.** Parquet is
   language-agnostic, transportable, ~23× smaller, immutable- friendly (no
   single-writer semantics), and fast (≤214 ms at 67M rows). The manifest
   carries the schema; DuckDB gets per-request in-memory instances with views
   (set a per-connection `memory_limit` — a 67M-row aggregate streams in 0.12
   GB). Sibling layout per the §2.1 decision: `<roId>.parquet` next to `<roId>`,
   no separate query dir — the end-state is R emitting parquet directly and the
   CSV being dropped.
3. **Native-number payloads + one-time `po_items`/`metric_info`/
   `replicant_opts` prefix bump**, not a string-typing shim — for _value_
   columns. Option/filter values normalize to text at the adapter boundary (§2.4
   delta 2). The consumer type is already `string | number | null`; the
   golden-diff gate proves render parity before cutover. Numeric parity policy:
   **aggregates compared with relative epsilon (~1e-9), keys/counts/ option sets
   compared exactly** — Postgres NUMERIC is exact decimal and DuckDB DOUBLE is
   float, so low-bit drift on large sums is expected and correct. **Empirically
   confirmed 2026-07-07**: 69/69 real Nigeria configs over 67M rows matched
   Postgres to max 2.0e-15 (the float floor), so the DECIMAL fallback is not
   needed (open question 7, now resolved).
4. **Runs are pre-scoped.** Windowing (periods, indicators, admin areas,
   ownership) is a wizard input, frozen into the run — this is the vision's own
   "(a) choose data" step, resolving the scoping fork toward "a unit = one
   scoped snapshot". Projects attach whole runs. **Stated consequence** (confirm
   it's acceptable — open question 6): a project can no longer re-scope its data
   without a new run being generated.
5. **Module parameters are run-level; defaults are instance-level** (the
   vision's "instance-level config including default settings for modules"). The
   wizard pre-fills from an instance-level defaults store and freezes selections
   into the manifest; per-project module state disappears with the project
   `modules` table. The defaults store's shape is RESOLVED (2026-07-29,
   ruling 1): the `instance_config` key `run_generation_defaults`, flat, no
   migration; built in Phase 3 core item 1.
6. **One cutover deploy; no runtime flag** (re-cut 2026-07-12, collapsing the
   2026-07-10 two-deploy cut; both replaced the earlier `RESULTS_READ_PATH`
   env-flag design — an env flip cannot un-migrate anyway, and two serving modes
   in one build is complexity with no payoff). The deploy has exactly one read
   path. Staging = deploy to a trial prod instance, verify with the rig, roll
   the fleet. **SUPERSEDED BY RULING 5 (2026-07-29)** — original text for the
   record: "Rollback = redeploy the previous image: the backfill migration is
   additive (synthesized run dirs beside an untouched sandbox; Postgres
   untouched) and the wizard dual-writes legacy `ro_*` until the fleet is
   verified, so the old image serves current data." The dual-write was deleted
   pre-deploy (Phase 3 core item 0); rollback is now a hosting-level volume
   restore, and the frozen pg plane is only the rig's oracle until Phase 4. Cross-deploy cache
   correctness uses the standard knobs (`PO_CACHE_VERSION`, key-prefix bumps),
   never runtime modes. Precedent: the FigureBundle boot-time cutover with its
   36-instance read-only dry-run gate (0 failures) — same discipline here.
7. **Memoized generation — content-addressed reuse, landing WITH the wizard
   (Phase 2), not after it.** Regeneration must not cost a full DAG re-run when
   little changed (today a single-module rerun is minutes; a forced whole-DAG
   run would be tens of minutes — a regression on the most common operation, so
   this is a Phase 2 deliverable, not an optimization for later). Mechanism is
   memoization, NOT a revival of the dirty machine:
   - **Node key**: at wizard time, after script generation (cheap, pre-R),
     compute each module's `inputKey` (§2.2). The generated script text alone
     captures params, module version, country, calendar, and the m008/m010
     snapshot-generated R blocks — so a presentation-only module update leaves
     the key unchanged and reuses, automatically mirroring today's
     compute/presentation split with zero extra logic.
   - **Reuse — catalog-wide** (re-cut 2026-07-29, Tim; supersedes the original
     single-base rule, which was "the project's attached run, else its latest
     `ready` run"): the key is looked up **across the whole catalogue** — a
     module reuses iff ANY readable `ready` run's manifest records the same
     non-null `inputKey` with a recorded hash for every declared results object
     → that module's raw output CSVs are materialized into the new run and R is
     skipped. Key found nowhere → execute. There is no "base run" concept and
     no project scoping, which is what makes the instance-level model work
     (Q-C). Downstream forcing is automatic: a re-executed upstream yields new
     output hashes, which change every dependent's key.
   - **Hardlink dedup, not a reference model** (re-cut 2026-07-29, Tim;
     supersedes the 2026-07-12 "copy, never link" rejection of a shared blob
     store). A run dir stays a real, self-contained, independently-deletable,
     zippable directory of ordinary files — the R mount contract, the
     `../{upstreamModuleId}/` reads, transport, and the read path are all
     untouched. Bytes are shared at the INODE level by a generic
     **post-finalize dedup pass**: hash every file in the finished tmp dir and,
     where a blob with that hash already exists, unlink + `Deno.link` to it,
     then `chmod 0444`. Properties:
     - The filesystem does the refcounting — `rm -rf runs/{runId}` decrements,
       and the last release frees the bytes. No mark-and-sweep, no refcount
       table, no GC design at all; that is what the 2026-07-12 rejection was
       actually objecting to, and it matters more now that ruling 3 made
       deletion an explicit operator act with no automatic GC.
     - It is GENERIC, so it covers what reuse never touches: the
       `inputs/datasets/` extracts (18 MB of the largest 78 MB dev run),
       parquet, assets, snapshot JSONs.
     - Measured on the dev instance 2026-07-29: 861 files, 394.6 MB total,
       105.6 MB distinct content — **73.2%**, single files appearing 13×.
       Catalog-wide search makes reuse hit more often, which makes duplication
       worse, which is exactly what this absorbs.
     - **0444 is load-bearing**: a truncate-in-place would corrupt every run
       sharing the inode, and with the dual-write gone the run dir is the only
       copy. Today's code is already safe (the run path starts from
       `emptyDir()`, and unlink breaks the link rather than mutating it), but
       read-only mode turns a latent silent corruption into a loud failure.
     - Constraints, accepted: one filesystem for the runs volume (true today,
       now a deployment rule); backup tooling must preserve hardlinks (rsync
       `-H`) or a restore balloons to apparent size — decide that when §5
       backups learn to carry run dirs, not a blocker now; the catalogue's
       per-run size column is APPARENT size (stamped at finalize as specced),
       with actual usage reported once at instance level.
     A pure manifest-of-references model (a run = a manifest pointing at blobs,
     with no directory) was considered and REJECTED: on a local volume it buys
     nothing over hardlinks and costs the R mount contract, transport, delete,
     and the read path.
   - **Sequencing**: the catalog-wide search is item-1 work (it IS Q-C). The
     dedup pass is purely additive and changes no semantics — it may land
     before or after the deploy, and nothing depends on it.
   - **Finalize is never cached**: parquet + manifest + query metadata are
     rebuilt fresh every generation (seconds). Only R execution is memoized — so
     anything that changes the _data_ (e.g. a facility-column toggle changes the
     dataset extract, hence input hashes) correctly forces re-runs with no
     special-casing.
   - **Why this is safe where the dirty machine wasn't**: event-driven
     invalidation fails open (a missed dirty event = silent staleness);
     memoization fails closed (a wrong/absent key = wasted re-run, never wrong
     data). Deleting the reuse logic degrades to always-re-run with identical
     results. Nondeterministic R output only costs efficiency (downstream
     re-runs), never correctness.
   - **UX (amended 2026-07-13, Tim — the two-surface re-cut)**: the reuse plan
     resolves as the FIRST STAGE of the run's execution pipeline (extracts must
     exist before content keys can be computed) and is shown at the top of the
     run progress view — per-module "reused / will run", today's implicit dirty
     preview made explicit. There is no pre-launch preview: a launch is cheap to
     cancel (repoint happens only on successful finalize), and a guessed preview
     without extracts could be wrong, which is worse than a resolved plan
     seconds after launch.
   - Ships WITH the wizard deploy — there is no earlier deploy to defer it to,
     and forced whole-DAG re-runs without it would regress the most common
     operation. Prerequisites: the §6 hermeticity fixes (un-hashable GitHub
     fetches, undeclared outputs) must land before or with this.

8. **Finalize runs exactly once per generation** (re-cut 2026-07-12; the
   2026-07-10 "eager finalize at every project-level act" variant is SUPERSEDED
   — it existed only for the cancelled interim deploy, and its lifecycle
   blindness was the review's top finding class). One function rewrites
   `manifest.json` + `inputs/` wholesale and atomically, invoked at the end of a
   wizard generation (and by the backfill synthesizer) — no partial metadata
   updates, no per-act hooks, no self-heal. Instance- level changes never fan
   out into runs; instance config (facility columns, calendar, countryIso3) is
   captured into the manifest at generation — the SNAP-1 capture semantics.

---

## 4. Phases

Re-cut 2026-07-12 to a single cutover deploy — the authoritative deploy spec
lives in the Status section at the top of this doc; the sections below carry the
technical detail that still applies. Phase 1 (the interim package plane) is
CANCELLED as a deploy — its section stays as the record of what was built and
salvaged; Phase 2 = THE deploy (wizard + identity + backfill + read flip + cache
re-key); Phases 3–4 unchanged.

### Phase 0 — engine adapter + golden-diff parity rig _(≈ Tim's step 1; feasibility already proven)_

- Add the pinned DuckDB dep; build `server/run_query/` executing S9-generated
  SQL over parquet built from existing sandbox CSVs.
- **The rig**: for every PO in a dev copy of each real instance DB, build the
  fetch config, run both engines, diff items (order-insensitive; aggregates at
  relative epsilon, keys/counts exact — §3.3), diff possible-values **including
  value types and option-set membership under the LIMIT cutoff**, bounds, and
  enrichment outputs. This is the gate every later phase re-runs. Ship nothing
  user-facing.
- **Prod-image gate — VERIFIED 2026-07-07 for the alpha; MUST RE-RUN for
  1.4.5-r.1 before the deploy.** The DuckDB napi addon loads and runs on the
  exact prod platform: inside `denoland/deno:ubuntu-2.5.3` built
  `--platform linux/amd64` (the prod Dockerfile base + arch), the
  `@duckdb/node-bindings-linux-x64@1.3.2-alpha.25` binding loads, `version()`
  returns v1.3.2, and the full S9-shaped query (period CTE + rollup UNION +
  PAE + NULLIF + `integer_division`) plus a parquet round-trip pass. It is
  **bakeable and offline-safe**: `deno cache` prefetches the binding into
  `DENO_DIR` (as the Dockerfile's `deno install` does at build time) and a
  subsequent `deno run --cached-only` (no network) runs DuckDB fully — no
  runtime npm egress needed. Residual: this ran under qemu amd64 emulation on
  arm64 (uses the image's real glibc/libstdc++, translates instructions; DuckDB
  does runtime CPU-feature detection) — a native-amd64 CI smoke is the final
  belt-and-suspenders but the load path is proven. **2026-07-14 addendum (item
  8): the pin moved to `@duckdb/node-api@1.4.5-r.1` (the alpha segfaults on
  instance churn — item 8 notes), so the version-specific half of this gate is
  stale; repeat the same containerized smoke against
  `@duckdb/node-bindings-linux-x64@1.4.5-r.1` as part of the deploy build
  (recipe above is complete: linux/amd64 container → deno cache → --cached-only
  query + parquet round-trip).** **RE-RUN 2026-07-29 for 1.4.5-r.1: PASS.**
  `--platform linux/amd64` `denoland/deno:ubuntu-2.5.3` (stock base — strictly
  weaker than the prod image, which also upgrades libstdc++6),
  `nodeModulesDir: "auto"` matching the app: `deno cache` prefetched
  `@duckdb/node-bindings-linux-x64@1.4.5-r.1`, then `deno run --cached-only`
  (no network) loaded the binding (`version()` = v1.4.5) and passed the full
  shape battery — integer_division (August→Q3), period CTE + rollup UNION +
  PAE `SUM/NULLIF`, `nullstr=['NA','']` on both null forms, parquet
  round-trip — PLUS a 1500-cycle instance create/close churn (the alpha's
  segfault window was ~750–1250; this also closes the gap that item 8's churn
  verification ran natively on macOS, not on the linux-x64 binding). Same
  residual as 2026-07-07: qemu emulation on arm64, not native amd64 silicon.
- Deliverable: parity report per instance; the dialect deltas (integer_division,
  ::DOUBLE, nullstr='NA', text-collation ordering — §2.4) encoded in the
  adapter, not in SQL builders.

### Phase 1 — CANCELLED as a deploy (was: the sandbox results package)

Built to code-complete on the branch (the 2026-07-10 two-deploy cut), then
cancelled 2026-07-12 by the adversarial pre-deploy review before any rollout:
the eager-finalize + stamp-self-heal consistency machinery was the review's top
finding class (mid-run partial CSVs served, stamp-blind staleness), and
hardening machinery destined for deletion by the next deploy was rejected.
Nothing from this phase ever deployed. The salvage map (kept / restored /
re-targeted / deleted) is in the Status section.

Historical note: the original Phase 1 ("synthesize query-only runs from the
project DB, flip reads to runs behind an env flag, re-key caches") was
implemented on the branch, re-cut into the sandbox-package shape, and finally
collapsed into the single deploy; its synthetic-backfill machinery became the
package builder and now becomes the deploy's backfill synthesizer.

### Phase 2 — THE deploy: wizard + identity + backfill _(≈ step 3, still project-entered)_

- One wizard (reuse `ImportWizardShell`'s descriptor pattern + the
  server-persisted attempt/resume machinery): choose data (families + windowing)
  → configure modules (DAG-aware selection, defaults pre-filled, params) →
  **reuse plan** (generate all scripts, compute node keys, diff against the base
  run, show per-module "will reuse / will run") → execute stale nodes with
  streamed progress (`r_script` SSE + the shipped worker/docker contracts), copy
  reused outputs → finalize (the same §3.8 function, once, always fresh) →
  atomic rename to `runs/{runId}` → repoint project.
- **Identity lands here**: the backfill migration SYNTHESIZES each project's
  initial run — mint a runId, build `runs/{runId}` from the project's current
  sandbox CSVs + project-DB catalog + instance config, set `projects.run_id`
  (never a verbatim copy of a sandbox package — review finding 24; the manifest
  carries runId and no projectId; copy, not move — the Status model has the
  rollback posture); caches re-key to runId (§2.5); client T1 gains
  `attachedRunId` and the T2 caches re-key (`export_central` was RETIRED, not
  flipped — work item 6). Legacy `ro_*` ingest was to be dual-written until
  fleet verification — **CANCELLED by ruling 5**: the dual-write was deleted
  pre-deploy (Phase 3 core item 0), `ro_*` is frozen as the rig oracle, and
  the Postgres read path drops in Phase 4.
- **Memoized generation ships here** (§3.7) — it is what keeps regeneration fast
  once per-module rerun is deleted; the §6.1/§6.5 hermeticity fixes are its
  prerequisites and land first.
- Delete: project Data tab attach/staleness UI, module cards'
  install/params/update/rerun surface, `checkDataNeedsUpdate`, dirty-state
  cascade, `setModulesDirtyForDataset` (the branch's eager-finalize hooks and
  self-heal are removed before this deploy — they never ship). Module
  logs/script/files viewers re-point to the run dir.
- Datasets stop being exported _into projects_; `datasets_in_project_*.ts`
  export logic is re-targeted to run-input generation (same COPY TO machinery,
  new destination: `inputs/datasets/<type>.csv` — the generated-script path
  change from `../datasets/` is app-side injection, no modules-repo change;
  landed at work item 4). The export also writes each extract's sibling
  `datasets/<type>.parquet` (same csv→parquet machinery; pg-COPY `''` nulls) —
  the queryable-inputs data lands here, its project-UI surface in Phase 3.

### Phase 3 — instance-level factory + catalogue + attach _(≈ step 5)_

**RE-CUT 2026-07-29 (Tim — see the Status "Phase 3 re-cut" section): the first
two bullets (the user-model core) ship BEFORE the deploy; the queryable-inputs
UI and scheduled generation are deferred post-deploy; demolition entry (dual-
write/pg-read-path deletion) stays gated on fleet verification.**

- Move the wizard entry to the instance shell; `runs` catalogue UI (list,
  disk usage, retire); project settings gets attach/swap with the §2.6
  compatibility report shown before any repoint. (Removed from this bullet by
  the 2026-07-29 luxury deferrals: per-run rename, detach control, and "newer
  run available" surfacing.)
- Permissions: generation instance-admin; attach = project editor. Multi-
  project attachment lands here (cache sharing is already run-keyed).
- **Queryable run inputs UI**: a project surface for querying the attached run's
  `inputs/datasets/<type>.parquet` (decided 2026-07-10; the parquet itself is
  written from the wizard deploy). Frozen, windowed provenance — "what raw data
  fed this run" — served by the same DuckDB plane; obsoletes pass-through
  modules (M9) whose only job is re-materializing input as queryable output.
- Scheduled generation (the DHIS2 scheduled-import unblock, PLAN_TODO_TRACKER
  #6) becomes possible: an automated import + generate + (optional) auto-repoint
  pipeline. **DEFERRED post-deploy by the 2026-07-29 re-cut (§10 Q4)** — not
  part of the pre-deploy core.

### Phase 4 — demolition + docs

- Migrations dropping project-DB `ro_*`, mirrors, `modules`, `metrics`,
  `results_objects`, `global_last_updated`; delete ingest code, dirty machine,
  stamp plumbing, `datasetsVersion`, staleness checkers, ~~the rollback flag~~
  (never built — model point 6 ruled no runtime cutover flag) and
  Postgres read path.
- **The project-catalog WRITE path is already inert — delete it here** (noted
  2026-07-30, verified on the branch; left alone deliberately because it lives
  inside the frozen legacy plane and the rig's oracle is that plane's DATA).
  Ruling 5 froze the pg READ wrappers as the oracle; these are writers, so
  nothing preserves them:
  - `installModule` (`db/project/modules.ts`) — the ONLY writer of project-DB
    `modules` / `results_objects` / `metrics`, now with **zero callers** (item
    0 removed the generation dual-write, item 1 removed `createProject`'s
    call). Its helpers go with it.
  - `uninstallModule` — one caller left, `cleanupOrphanModules` in
    `db_startup.ts`, itself marked "TEMPORARY: remove after all ~5 production
    instances updated / Added 2025-05-20 for hfa001 → m010". Both die with the
    tables they read and write.
  - After this, module definitions live in exactly one place: the run
    manifest's `modules[]` (definition verbatim + script + configSelections +
    gitRef). That relocation — mutable per-project rows → immutable per-run
    artifacts — is what makes §2.6's "module evolution is per-run, never
    silent" true, so it is the end state, not a transitional step.
- Figure provenance re-keys to runId (the deferred FigureBundle provenance
  phase, now in SYSTEM_10 Open items, simplifies: stale badge = capturedRunId ≠
  attachedRunId; "Update data" = re-query current run). This is a **stored-JSON
  shape change across ~17k existing bundles** and gets the full three-layer
  treatment: a data transform stamping existing bundles' provenance with the
  project's backfill runId (approximate, like the FigureBundle backfill's
  `moduleLastRun` — accepted), a **forced** skip-gate (bundle innards are not
  strictly parsed, so the gate won't trip on its own), and the prefix bump where
  cached.
- SYSTEM docs: S8 rewritten around the wizard+runs (S8's first prose landed
  2026-07-16, already post-runs); S9 caching section rewritten; S2/S6 attach
  sections updated; the S8→S9 "data spine" contract finally _stated_ — it
  becomes the run-dir format spec, which this plan's §2 seeds.

---

## 5. Migration & rollback posture

- The deploy's migration is additive (synthesized run dirs beside an untouched
  sandbox + `projects.run_id` pointers; Postgres untouched and frozen).
  **Rollback = hosting-level restore of the pre-deploy instance volume**
  (ruling 5; the previous-image rollback this bullet used to describe died
  with the dual-write). Destructive drops wait for Phase 4.
- Fleet check discipline: the golden-diff rig runs read-only against every
  instance before each cutover (FigureBundle precedent: 36 instances, 17,142
  figures, 0 fails, then deploy).
- **Backups/restore is a real workstream, not a note — runs make the current
  model worse before better.** Today a restored project-DB dump is fully
  self-contained (it carries its own `ro_*` + mirrors and renders standalone);
  under runs, a restored project DB references an instance-level run dir that a
  per-DB dump does not carry
  ([backups.ts:248-485](server/routes/instance/backups.ts#L248-L485) — restore
  is SQL-only, never files). Required: the external backup pipeline gains a file
  channel for run dirs (a run is a directory — tar it); restore resolves the
  referenced run and re-materializes it if absent; retention/GC must never
  delete a run reachable from any retained backup or any project's `run_id`.
  Until that lands, a restore that references a missing run must degrade loudly
  (project renders "run not available"), never silently.
- Disk: runs accumulate. Retention (ruling 3): keep referenced runs always;
  reclamation is ONLY the catalogue's explicit guarded hard delete — there is
  no time-based/automatic GC (an earlier draft said "unreferenced runs kept N
  days"; that is not the model).
  Reuse the existing disk-space guard pattern.

---

## 6. Encapsulation gaps to close (today's run inputs that leak)

These break "fully encapsulated" unless fixed during Phase 2 (lockstep with
wb-fastr-modules where noted). Items 1 and 5 are additionally **hard
prerequisites for memoized generation** (§3.7): a network fetch inside R is an
input the node key cannot hash, and an undeclared output is a file copy-on-reuse
doesn't know to copy.

1. **m004/m005 fetch GitHub raw CSVs from inside R at run time**
   (`survey_data_unified.csv`, `population_estimates_only.csv` — hardcoded URLs
   in script.R; the same files are declared in `assetsToImport` but the local
   copies are unread, and 6 declared assets are missing on the example instance
   with the copy failure silently ignored,
   [run_module_iterator.ts:180](server/worker_routines/run_module/run_module_iterator.ts#L180)).
   Fix: scripts read the pinned run-input copies; asset-copy failures become
   hard errors; network access inside module containers can then be dropped.
   **Modules-repo change** (three-repo lockstep rule). Until fixed, m004/m005
   are excluded from reuse (always re-run).
2. **Assets are unversioned and mutable in place** (`population.csv` etc.). Fix:
   copy into `inputs/assets/` at generation + record name+hash in the manifest.
3. **Instance config read at run time** (countryIso3 + facility columns,
   [worker.ts:59-64](server/worker_routines/run_module/worker.ts#L59-L64)) —
   becomes a wizard-time capture into the manifest, read from there.
4. **R image tag not recorded per run** — manifest field.
5. **m001 writes an undeclared output** (`M1_output_consistency_facility.csv`,
   8.4 MB) — declare it or stop writing it (modules-repo hygiene; matters
   because finalize should account for every file in the run, and copy-on-reuse
   copies only declared outputs — an undeclared file would silently vanish from
   reused nodes).

---

## 7. Client impact summary

- **T1**: `moduleDirtyStates`/`moduleLastRun`/`anyRunning`/staleness slices
  replaced by `attachedRunId` + run summary; wizard progress state lives with
  the run, pushed via the `run_progress` SSE message (the
  attempt-record-polling alternative was not taken). `metrics` list comes from the
  manifest (status vocabulary shrinks).
- **T2**: the three run-keyed caches re-key (mechanism unchanged —
  `createReactiveCache` is version-string-agnostic; an immutable runId is a
  degenerate version). `po_detail` folds runId. Authored-content caches
  untouched.
- **Replaced UI**: `project_data.tsx` + dataset settings editors +
  `project_modules.tsx` + module settings/update/rerun components +
  `staleness_checks.ts` → the wizard (Phase 2) then instance catalogue (Phase
  3). `DirtyStatus`/thumbnail "module running" arms → "no run / run generating /
  metric not in run" states.
- **AI**: tools ride the same routes/caches (verified: client-side tools go
  through `_PO_ITEMS_CACHE` and the metric-info route) — re-keying is free. The
  dead server AI list functions (`getMetricsListForAI`, `getModulesListForAI`,
  uninvoked `getVisualizationsListForAI` route) get deleted rather than
  re-pointed.

---

## 8. Carried-items ledger (from the superseded/absorbed docs)

| Item                                      | Disposition here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SNAP-1 / N1 facility-columns config       | **Dissolved by construction**: captured in the manifest at generation, read from the run, covered by the runId cache key. The live query-time read sites that re-point to the manifest at the read flip (re-verified 2026-07-07; the old plan's "4 sites" list carried a dead one): get_query_context.ts:34, get_results_value_info.ts:32, db/project/presentation_objects.ts:187. db/project/modules.ts:969 (`getAllMetrics`) and modules.ts:993 (`getMetricsWithStatus`) are never re-pointed — the module-card surface they serve dies with the wizard in the same deploy. modules.ts:724 is the dead `getMetricsListForAI` — deleted, not re-pointed (§7). |
| Q4b capture-shape fork                    | **Resolved**: a run IS shape (a) — the whole input set captured atomically in one generation act.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SNAP-2 geojson                            | Run-inputs home (`inputs/geojson/`) replaces PLAN_GEOJSON_SNAPSHOT's WS-SNAPSHOT project-DB table; that plan's WS-DEDUP / WS-COVERAGE / WS-KEY workstreams, settled decisions (one-country invariant, frozen-public-geometry-is-intentional, one-shared-copy-per-level) and DHIS2 API facts carry unchanged. Update that plan's storage-home section when the wizard deploy lands.                                                                                                                                                                                                                                                                             |
| SNAP-3 admin_area_labels                  | Stays resolved-out-of-scope (verified display-only). Its module-load read happens at wizard time, where a live instance read is architecturally correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SNAP-4 countryIso3 public-dashboard read  | Independent tiny artifact-layer fix (read `bundle.localization.countryIso3`); do anytime.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| SNAP-5 image binaries                     | **Not run content** (authored images belong to the project plane) — but explicitly the one remaining live-read hole in the layer rule: slide/deck/report images are fetched by name from the shared instance assets dir at render/export, and FigureBundle stores only the name. A project moved off-instance renders broken images. Parked with a name: needs a project-plane asset capture before the transportability end-state; the vision states this exception honestly.                                                                                                                                                                                 |
| SNAP-6 ai_context                         | Artifact-layer question; unchanged, parked (only matters if AI artifacts become stored).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FigureBundle followups Phase 4 provenance | Re-keys to runId (§4 Phase 4); the untraceable import timestamps become manifest metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PLAN_TODO_TRACKER #6 / reorg line         | This plan is that reorg; scheduled imports land Phase 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 9. Hard rules (carried; do not re-litigate)

- Layer rule: project plane reads only the attached run; runs read nothing live.
  No instance FKs/ids inside run files.
- `PO_CACHE_VERSION` (meaning) and key-prefix (shape) knobs survive run-ID
  keying; any input NOT in the run still needs its own folded stamp
  (`po_detail` + PO `last_updated`).
- Display-only preferences stay out of fetch configs and cache hashes; calendar
  is data semantics (changes generated SQL) and is a run input — the adapter
  reads it from the manifest, never from the env global (§2.4).
- Stored-JSON moves = migration transform + forced skip-gate + lockstep
  `definition.json` (PROTOCOL_APP_MIGRATIONS; zod strip mode silently drops
  renamed keys).
- Backfill from frozen project data, never live instance config.
- One-country-per-instance is invariant. Public-dashboard frozen geometry is
  intentional. FigureBundle layer-3 self-containment is shipped architecture —
  feed it runId provenance, don't reopen it.
- Worker-runtime teardown/claim/docker-rm contracts are settled — the wizard
  execution engine reuses them verbatim.
- Stage app changes before any panther resync. New server dirs must be claimed
  in SYSTEM globs (lint gate blocks deploy otherwise).
- Verify by executing; the golden-diff rig gates every cutover.

## 10. Open questions for Tim

1. **Retention/GC** — **RESOLVED 2026-07-29 (Tim, ruling 3)**: retire IS a
   guarded hard delete (row + dir), refused while referenced or generating;
   no archive state, no automatic/time-based GC. Unchanged by the §3.7
   hardlink-dedup ruling — `rm -rf` still just works; it simply frees only
   the bytes no surviving run shares.
2. **Who generates** — **RESOLVED 2026-07-12 (Tim)**: instance-admin only
   (matches today's data-attach gating).
3. **Raw CSV retention** — **RESOLVED 2026-07-12 (Tim)**: keep raw CSVs in runs
   (they're the debug/download surface and the reuse source, §3.7) UNTIL the R
   scripts read/write parquet natively (the §2.1 sibling end-state), then drop
   the CSVs. Note the corrected size picture: raw CSVs are multi-GB per module
   on Nigeria-scale runs, not small — the reuse argument won anyway, and the
   §3.7 hardlink dedup (ruled 2026-07-29) removes the duplication cost that
   made this a close call.
4. **Scheduled auto-runs** (import → generate → auto-repoint) — **RESOLVED
   2026-07-29 (Tim)**: deferred post-deploy, NOT in the pre-deploy Phase 3
   core (purely additive later). Auto-repoint in particular changes what
   "immutable attachment" means for a project — design it when it lands.
5. **Vocabulary** — **RESOLVED 2026-07-12 (Tim)**: UI label = **"Results
   package"** (EN; FR at translation build); "run" stays the internal name
   (code, DB, this plan). (Still unrelated to PLAN_SNAPSHOT_NAMING's
   Solid-snapshot sense.)
6. **Scoping consequence + Phase 2 stopgap** — **RESOLVED 2026-07-12 (Tim)**:
   the trade is accepted (re-scope = generate a new run), and the wizard's
   "choose data" step keeps the per-project dataset windowing UI verbatim — no
   windowing redesign at this deploy.
7. **Numeric parity policy** (§3.3) — **RESOLVED 2026-07-07 by the at-scale
   parity run**: DOUBLE aggregates + relative-epsilon diff. 69/69 real Nigeria
   configs matched Postgres to max 2.0e-15 (the float floor), so no DECIMAL
   needed. Left here only as the record of the decision.
8. **Instance module-defaults store shape** (§3.5) — **RESOLVED 2026-07-29
   (Tim, ruling 1)**: the `instance_config` key `run_generation_defaults`
   (no migration), Zod-validated, FLAT (one-country-per-instance makes
   per-country presets meaningless); edited via "save as instance defaults" on
   the wizard confirm step. Built in Phase 3 core item 1.

## 11. Execution strategy — how to staff the agentic work

How to run this plan with coding agents (model tier, effort, orchestration),
calibrated to its own phases and gates. Analyzed 2026-07-07; the cost ratios are
for tier selection, not budgeting.

**The routing key is error _catchability_, not task difficulty.** Phase 0
deliberately built machine gates (the golden-diff parity rig, the pre-deploy
dry-run, typecheck). Work a gate backstops is _cheap to get wrong even when the
code is hard_ — the gate catches it. Work that is **not** machine-checked (cache
byte-identity, migration data-loss, Zod strip-mode drops, dual-write races) is
_expensive to get wrong even when the code is trivial_ — it ships green and
surfaces weeks later as a wrong number in a country report. **Buy intelligence
against un-gated correctness; buy cheap where a gate verifies.**

### Tier map

| Work                                                                                                                                              | Model · effort                                                                    | Solo / fleet                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Interactive driving (you reviewing each step — you are the gate)                                                                                  | **Opus 4.8 · xhigh** (the coding/agentic sweet spot; `max` isn't offered on Opus) | Solo                                                                                    |
| Gated mechanical bulk — scaffold a dir, re-point read sites, rig plumbing, doc sweeps, migration boilerplate (typecheck + parity rig catch slips) | **Sonnet 5**                                                                      | Solo, or **fleet** when it fans out (N read sites, doc sweep, module hermeticity fixes) |
| Un-gated correctness **design** — cache re-key keying scheme, migration/backfill shape, dual-write window, wide-constraint per-phase architecture | **Fable 5 · max**, one-shot                                                       | Solo design → hand impl down                                                            |
| Pre-cutover adversarial review (the deploy's backfill/read-flip/wizard; Phase 4 demolition)                                                       | **Fable 5 · max**                                                                 | **Fleet** (panel)                                                                       |
| Per-instance golden-diff verification                                                                                                             | Opus/Sonnet                                                                       | **Fleet**                                                                               |

Cost picture (output tokens dominate; priced on the output multiplier — Fable 50
/ Opus 25 / Sonnet 15): **Fable-everything ≈ 2–2.5× the mixed fleet** (plus an
always-on-thinking token tax — the loser); **Sonnet-everything ≈ 0.6× but a
false economy** — it puts the irreversible ~40% (cache re-key, migration,
cutover) on a near-Opus model with no expensive verifier, exactly where a silent
parity break ships. Inside the mixed fleet, **Fable is ~46% of cost from ~22% of
tokens** — so the single highest-leverage lever is: **do not use Fable as the
default verifier; reserve it for the 2–3 irreversible go/no-go gates**
(Opus-xhigh finder fan-out + one Fable adjudicator per gate). That recovers ~a
quarter of the cost for negligible quality loss.

**Two traps this corrects:** the `getIndicatorMetadata` SQL→JSON rewrite _feels_
like a Fable job (gnarly SQL) but is the **most rig-covered work in the plan** —
spend **down** (Sonnet + rig), Opus xhigh only for the input tail the rig can't
enumerate (nulls, empty runs, disaggregation corners). Conversely, the
three-persistence-layer / Zod-strip-mode edits _feel_ mechanical but a strip
drop is silent data loss — route the edits through Sonnet but keep their
**design and review on Opus xhigh**, never raw Sonnet.

### Per-phase sequencing

- **Phase kickoff** — one Fable · max design pass (solo, or a small judge-panel
  of approaches) to hold the interacting constraints at once (cache layers ×
  dual-write window × migration ordering × cross-repo lockstep). A missed
  interaction here compounds for months. Reserve Fable design for the cutover
  deploy and its content-addressed memoization scheme; Phases 3–4 design fine on
  Opus xhigh.
- **Implementation — solo, not Ultracode.** Linear impl is a dependency chain
  (backfill → read-flip → dual-write → demolition); it doesn't fan out, so
  orchestration only adds coordination tokens and each subagent has _less_
  context than a driver living in the change. Drive Opus xhigh interactively;
  drop to Sonnet for the gated mechanical stretches.
- **Fan-out where it is genuinely parallel** — Ultracode/workflows for (a) the
  parallel mechanical edits (re-point N sites, doc sweep, module hermeticity
  fixes) as a Sonnet fleet, each gate-verified; (b) per-instance golden-diff
  verification. Never the reasoning dependency-chain.
- **Before each irreversible cutover** — a Fable · max adversarial _panel_. The
  parity rig checks query-equivalence; it does **not** cover migration data-loss
  or dual-write races — that un-gated correctness is what the panel exists for,
  and it is the cheapest insurance in the project relative to blast radius.

### Overspend guardrails

- `max` effort only on the handful of Fable one-shots (design + pre-cutover
  panels) — never standing; Fable over-deliberates on routine work.
- Opus **fast mode** scoped to interactive debugging, not batch generation (its
  premium otherwise erases the Opus-vs-Fable saving).
- **Haiku ≈ 0** here — almost nothing is Haiku-safe in a byte-identity-cache
  codebase; don't model savings from it.
- Sonnet's intro output price ($10/M) **expires 2026-08-31** — only ~7 weeks of
  a 4–6 month project; front-load Sonnet-heavy mechanical work (doc sweeps, rig
  plumbing) if timing is flexible, but don't bank the budget on it.
