# PLAN: Merge main into version2

Bring main's indicator restructure (PLAN_A3 to A8, deploys 1.72.0 to 1.73.1)
into `version2`, which carries the products restructure through step 9a.
The result is one merge commit on `version2` whose tree passes every gate.

**Next step: Review 1.** Values are `Do N`, `Review N`, `Fix N`. After step 5's
review passes, delete this file in the same commit.

**Nothing ships.** No step runs `./deploy_testing` or `./deploy`. The
merged branch ships when the products plan closes, under its own runbook.
The rollback point is `3b087642`, `version2` before this plan's first
commit; `git reset --hard` to it undoes everything here. No step writes to
a production database. The one durable side effect is on the dev and
testing databases (D1), and it is idempotent.

**The sequence.** Five steps, each a Do session then a Review session, a
Fix session only when a review finds something:

1. `Do 1`: renumber the products migrations to 090 to 092. One commit on
   `version2`, before anything is merged. (§3, Step 1)
2. `Do 2`: `git merge --no-commit --no-ff main`, resolve the 24 conflicts
   by the tables in Step 2, make the listed follow-up edits, take
   `panther/` from main, run the floor, commit once. (§3, Step 2)
3. `Do 3`: rerun the data-bearing validators over the merged tree and log
   each result. No code changes expected. (§3, Step 3)
4. `Do 4`: read the eleven SYSTEM files both branches edited against the
   merged code and fix prose. (§3, Step 4)
5. `Do 5`: delete this file. (§3, Step 5)

The first session is `Do 1`. It does not merge.

---

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_MERGE_MAIN_INTO_VERSION2.md."**

**Session start.** The branch is `version2` (`git branch --show-current`),
`git status` is clean, and `git fetch` has run. Never create a branch. Read
`CLAUDE.md`, `SYSTEMS.md`, §1 and §2 here, the step's section in §3, and
the log in §5. Where this plan and the code disagree, the code wins and §5
records it; a session never rewrites a decision or a step section.

**A Do session** builds one step, runs its gates, adds a closing row to §5,
sets the **Next step** line, commits, and stops.

**A Review session** is a fresh agent that did not write the step. It reads
the step's commits, checks every item of the step's Deliverable in the code,
reruns every gate, records findings as rows in §5 with file and line, and
sets the line to `Do N+1` (no code findings) or `Fix N`.

**A Fix session** works the findings of the last review, reruns the gates,
and sets the line to `Review N`.

The gate floor for every step is in §4.

---

## 1. The two sides

Merge base: `474d1a2b` (7 Sept, "CHANGELOG_AUTO for v1.71.1"). Since then
main has 164 commits and `version2` has 81. Nothing has been merged in
either direction.

**Main** (253 files): one `indicators` table keyed by `data_id`
(migrations 086 and 087), `commonIndicators` renamed `hmisIndicators`
everywhere (manifest schema 7 to 10), the stamps `indicatorMappingsVersion`
and `baseIndicatorMappingsVersion` renamed `indicatorsVersion` and
`countIndicatorsVersion`, direction/target/expected-low-counts on the
indicator (088), the formula type renamed `derived` to `calculated` (089),
population reserved words (084), ledger skipped values (085), run input
transforms (`server/runs/input_transform.ts`), the DHIS2 indicator wizard,
the HMIS Data page Ledger tab, 15 new server tests, two new validators
(`validate_fresh_boot`, `validate_indicator_migration`), 35 panther files
synced, `PROTOCOL_APP_PLANS.md` added, `PLAN_2_DHIS2_INDICATOR_IMPORT.md`
closed and deleted, VERSION 1.73.1.

**version2** (460 files): products, folders, slide deck versions and the
product plane (`087_products.sql`, staged `088_consolidate_projects.ts` and
`089_drop_project_layer.sql`, `000_legacy_project_shell.sql`, the runner's
TypeScript migrations), the project shell, dashboards and visualization
products deleted on the client (117 files), `project_ai` moved to
`copilot`, `components/visualization` moved to `figure_editor`,
`db/project/datasets_in_project_*` moved to `server/runs/capture_inputs/`,
`lib/types/datasets_in_project.ts` renamed `run_datasets.ts` with
`DatasetInProject` renamed `RunDataset`, scope-keyed figure caches,
`validate_consolidation*` and `validate_migrations_replay`.

**Independent facts established by a dry-run merge** (read-only, in a
scratch worktree, discarded):

- 24 files conflict. 19 are content conflicts, 17 of them a single hunk.
  5 are modify/delete.
- Git followed version2's renames for main's edits to
  `datasets_in_project.ts`, `datasets_in_project_hmis.ts`,
  `visualization/conditional_formatting_editor.tsx` and
  `project_ai/build_system_prompt.ts`; those edits land in the moved files.
- No file main added lands in a directory version2 deleted.
- Outside the conflict markers, exactly one relative import in the merged
  tree is broken: `~/components/visualization/conditional_formatting_editor`
  in main's new `_edit_indicator.tsx`.
- Main's `panther/` already contains version2's only panther edit
  (`settingsScope` in `_305_ai`). Main synced from panther commit
  `8056661`, version2 from `6aa81fb`.
- Server cache prefixes merge cleanly (`PO_CACHE_VERSION` "22",
  `po_detail_v12` in `server/routes/caches/visualizations.ts`).
- The manifest transform chain is main's, whole. Version2 never edited
  `server/runs/manifest_transform.ts`; its blocks 4, 6, 7 and 8 carry
  `hmisIndicators`, drop `commonIndicators`, add the interpretation facts
  and rename `derived` to `calculated`, and main's
  `server/tests/run_input_transform_test.ts` exercises
  `transformRunManifestFile`. The merge adds no manifest shape of its own,
  so no new transform block is needed.
- The merged `_main_database.sql` carries both main's indicators block and
  version2's products block; `indicators_raw`, `indicator_mappings` and
  `indicator_sources` are gone from it.
- Main's project migration `042_dataset_info_stamp_names.sql` renames the
  stamps inside project `datasets.info`. The consolidation never reads that
  table, and its `REQUIRED_SOURCE_MIGRATION` check is an existence check on
  041, so 042 neither breaks nor matters to it.

---

## 2. Decisions

- **D1. Renumber before merging.** Main's instance migrations now run 084
  to 089, so version2's 087 to 089 collide. They become 090 to 092 in a
  commit on `version2` that precedes the merge, so the merge commit carries
  no renumber noise. This is the products plan's own rule (D9: "if another
  migration lands first, take the next free number and record it in §9").
  The cost: `087_products` is already applied on the dev and testing
  databases, so `090_products` re-runs there as an `IF NOT EXISTS` no-op
  and the dead `087_products` row stays in their `schema_migrations`.
  Nothing else on the fleet has seen either number.
- **D2. One merge commit, green.** Every conflict, rename propagation and
  import fix is resolved inside the merge commit. Gates run before it is
  made. No "fix the merge" follow-up commits.
- **D3. Panther comes from main wholesale, and `./sync` is not run.**
  `panther/` is never hand-merged. `git checkout main -- panther` replaces
  the directory, which is a superset of version2's copy (§1). Checked
  against the source repo (`~/projects/panther/timroberton-panther`, HEAD
  `e3040df`, clean): every file main synced matches the source apart from
  the sync's own banner header, so a sync would write the same bytes. Do
  not run `./sync` for this plan: its `sync-configs.json` targets
  `~/projects/apps/wb-fastr/panther`, the `tim-branch` worktree, not this
  one.
- **D4. Rename pairs: both sides win.** Where main renamed
  `commonIndicators` to `hmisIndicators` (type `RunHmisIndicator`) and
  version2 renamed `DatasetInProject` to `RunDataset` on the same lines, the
  result carries both new names.
- **D5. Version2's deletions stand.** Main's edits to files version2 deleted
  are the rename above and a modal-prop tidy; nothing to carry.
- **D6. Main's deletion of `_edit_indicator_common.tsx` stands.** Its
  replacement `_edit_indicator.tsx` takes version2's `figure_editor` import
  path.
- **D7. No client cache bump for `run_po_items`.** Main bumped `po_items_v4`
  to `v5` because `indicatorMetadata` gained `direction` and `target`.
  Version2's equivalent, `run_po_items` in
  `client/src/state/products/t2_figure_data.ts`, is keyed immutably by run
  id. Version2 has never deployed, so no production browser holds an
  entry, and the client clears its data caches whenever the server version
  changes (`LoggedInWrapper.tsx`, the check that logs "Server version
  changed"), which the products plan already relies on for its own cache
  renames. Recorded here so the omission is a decision, not an oversight.
- **D8. Fleet dumps are refreshed after the merge, not before.**
  `validate_indicator_migration` and `validate_consolidation` prove the
  chain over restored dumps; the dumps must come from instances on 1.73.1
  so the combined 084 to 092 chain is what runs. Pulling them is Tim's
  step and is not a gate here.

---

## 3. Steps

### Step 1. Renumber the products migrations to 090 to 092

Surface: `server/db/migrations/instance/`,
`server/db/migrations/consolidation/`, `validate_consolidation.ts`,
`validate_consolidation_replay`, `validate_consolidation_replay.ts`,
`SYSTEM_02_persistence.md`, `SYSTEM_12_documents_sharing.md`,
`PLAN_PRODUCTS_RESTRUCTURE.md`.

Deliverable:

- `git mv` `087_products.sql` to `090_products.sql`,
  `staged/088_consolidate_projects.ts` to `staged/091_consolidate_projects.ts`,
  `staged/089_drop_project_layer.sql` to `staged/092_drop_project_layer.sql`.
- Every reference follows. Known sites (verify with
  `git grep -nE '[^0-9_]0(87|88|89)[^0-9]' -- . ':!CHANGELOG_AUTO.txt' ':!panther'`):
  `SYSTEM_02_persistence.md` (lines near 88 and 337 to 358),
  `SYSTEM_12_documents_sharing.md` (near 111), `validate_consolidation.ts`
  (comments near 10, 290, 292, 565), `validate_consolidation_replay`
  (its header still says "000, 085, 086", which was stale already),
  `validate_consolidation_replay.ts` (the import at 40, the
  `TS_MIGRATIONS` key at 57, the file list at 142, the `schema_migrations`
  assertion at 490 to 491, the reference-schema steps at 561 to 655),
  `staged/000_legacy_project_shell.sql` (comment: "migrations 001 to 087",
  "088 then consolidates"), `consolidation/execute.ts` (comment at 5, 75,
  and the `[migration] 088 consolidate` log strings), `consolidation/plan.ts`
  (comment at 10).
- The `000_legacy_project_shell.sql` comment now reads "migrations 001 to
  090" and "091 then consolidates".
- `PLAN_PRODUCTS_RESTRUCTURE.md` gets one row in its §9 build log recording
  the renumber and naming this plan. Its step sections and rulings keep
  their old numbers: that plan's own rule is that a session never rewrites
  a ruling or a step, and its D9 says the correction lives in §9. Its
  **Next step** line stays `Do 9b`.

Gates: the floor in §4, except `./validate_fresh_boot`, which is not on the
branch until step 2. Commit: "Renumber the products migrations to 090 to
092 so main's 084 to 089 merge cleanly".

### Step 2. Merge main and resolve

Surface: the whole tree; every change is either a merge resolution or one
of the listed follow-ups.

Start: `git merge --no-commit --no-ff main`. Expect 24 conflicts. Resolve
as follows, then make the follow-up edits, then run the gates, then commit
once.

**Take both new names (D4)**:

| File | Resolution |
| --- | --- |
| `lib/types/projects.ts` | keep version2's `RunDataset` import, add main's `RunHmisIndicator` import from `./run_manifest.ts`; drop the `datasets_in_project.ts` import |
| `lib/types/project_sse.ts` | `projectDatasets: RunDataset[]`, `hmisIndicators: RunHmisIndicator[]` |
| `lib/ai_tools/build_system_prompt.ts` | `datasets: RunDataset[]`, `hmisIndicators: RunHmisIndicator[]`; also fix the stale `project_ai` path in its comment to `copilot` |
| `client/src/components/copilot/build_system_prompt.ts` | `datasets: authoringContext.datasets`, `hmisIndicators: authoringContext.hmisIndicators` |
| `server/db/project/projects.ts` | `RunDataset[]`, `RunHmisIndicator[]`, `getRunDatasetsFromManifest`, `manifest.hmisIndicators` (both hunks) |
| `server/mcp/context_cache.ts` | `getRunDatasetsFromManifest`, `manifest.hmisIndicators`; fix the comment that says `db/project/projects.ts` only if it is wrong after the merge |
| `server/runs/attach_run.ts` | `getRunDatasetsFromManifest`, `runCtx.manifest.hmisIndicators` |
| `server/runs/capture_inputs/hmis.ts` | three import hunks: main's names (`getHmisIndicators`, `getCountIndicatorsVersion`, `getIndicatorsVersion`, `HmisIndicatorCatalogRow`, `escapeSqlString`) with version2's paths (`../../db/instance/...`, `../../db/utils.ts`); `facilities` stays `RunFacilityRow[]` (version2's name). The rest of the file merged clean and carries no retired names |

**Take main**:

| File | Resolution |
| --- | --- |
| `client/src/state/instance/t2_datasets.ts` | main's `countIndicatorsVersion` key |
| `client/src/state/instance/t2_indicators.ts` | main's `indicatorsVersion` and `pdsNotRequired`, name `instance_indicators_v7` |
| `client/src/components/_shared/results_package/package_view.tsx` | main's header comment, minus the "project's Results package tab" clause version2 removed |
| `panther/.panther-manifest.json` | superseded by D3 below |

**Take version2 (HEAD)**:

| File | Resolution |
| --- | --- |
| `client/src/components/instance/index.tsx` | HEAD; main's side is the project-shell `Switch`. Main's only other change there is removing the two `itemWidth` props on the nav `ButtonGroup`s (version2 still has them, at lines 226 and 235 before the merge); carry that removal |
| `validate_protocols_baseline.json` | HEAD's `copilot/...` entries; main's side deletes two `project_ai` entries version2 had already moved |

**Both sides added blocks; keep both**:
`server/db/instance/_main_database_types.ts` (products types beside main's
indicator types), `SYSTEM_01_api_contract.md`, `SYSTEM_02_persistence.md`,
`SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md` (prose and
file manifests from both sides; `lint:systems` is the check).

**Modify/delete (D5, D6)**:
`git rm` `client/src/components/forms_editors/select_project_user_role.tsx`,
`client/src/components/instance/pending_deletions.tsx`,
`client/src/state/project/t1_store.ts`,
`client/src/state/project/t2_presentation_objects.ts`,
`client/src/components/indicator_manager_hmis/_edit_indicator_common.tsx`.

**Panther (D3)**: `git checkout main -- panther` after the conflict
resolution, so the manifest and the two `_305_ai` files are main's.

**Follow-up edits inside the same merge commit**. These are outside the
conflict markers; typecheck finds them, this list makes them
non-surprising:

- `client/src/components/indicator_manager_hmis/_edit_indicator.tsx` line
  61: import `ThresholdsPanel` from
  `~/components/figure_editor/conditional_formatting_editor`.
- `lib/types/run_authoring_context.ts` line 27: `commonIndicators` becomes
  `hmisIndicators: RunHmisIndicator[]` (the type main gives the manifest
  entries; the `{ id, label }` shape was the old projection).
- `server/run_query/authoring_context.ts` line 27:
  `hmisIndicators: manifest.hmisIndicators`.
- `server/tests/run_authoring_context_parity_test.ts` line 56: compare
  `hmisIndicators`.
- Any other `commonIndicators`, `CommonIndicator`, `MappingsVersion`,
  `DatasetInProject`, `datasets_in_project`, `indicator_mappings`,
  `indicators_raw` or `"derived"` hit that `git grep` finds under `client/`,
  `lib/`, `server/`, `query_rig/` or the root validators, excluding
  `CHANGELOG_AUTO.txt` and migration files. The dry run found none beyond
  the four above, but the grep is the proof.
- `deno task build:help-buttons` regenerates
  `lib/help/help_targets.generated.ts`: main regenerated it over site
  sections version2 restructured, and the generated file is never
  hand-merged.

Deliverable: a single merge commit on `version2`; `git status` clean;
`git log --merges -1` shows main merged; no conflict markers
(`git grep -nE '^(<<<<<<<|=======|>>>>>>>)'` is empty); `panther/` is
byte-identical to main's (`git diff main -- panther` is empty); VERSION is
1.73.1; `PLAN_2_DHIS2_INDICATOR_IMPORT.md` is gone and
`PROTOCOL_APP_PLANS.md` is present.

Gates: the full floor in §4. Commit message: "Merge main (1.73.1, the
indicator restructure) into version2".

### Step 3. Prove the migration chain over the combined history

Surface: none (no code changes expected). This step exists so a review
reruns the data-bearing validators against the merged tree and records the
result, and so a failure becomes a `Fix 3`, not a surprise on deploy.

Deliverable: a §5 row per validator with its result:
`./validate_migrations`, `./validate_migrations_replay`,
`./validate_consolidation_replay`, `./validate_fresh_boot` (on version2 the
boot now runs the consolidation path over the empty database as well),
`./validate_indicator_migration` and `./validate_consolidation` if dumps
are available locally (D8; if not, the row says so and names the dumps
needed).

One more row, a verification and not a gate: `./run` against the dev
database boots, and a results package created before the merge attaches
and reads through main's transform chain (§1) with its `hmisIndicators`
list and dataset stamps present. If no pre-merge package exists on dev,
the row says so. No new test file is written for this; the chain is main's
and main tests it.

### Step 4. SYSTEM prose sweep

Surface: `SYSTEM_*.md` only. No code changes.

Both branches edited SYSTEM_01, 02, 05, 06, 08, 09, 10, 12, 13, 14 and 15.
Four of those conflicted and were folded by hand in step 2; the other
seven merged textually, which proves nothing about whether a sentence now
describes one branch's contract rather than the merged one. `lint:systems`
checks only the file manifests.

Deliverable: each of the eleven files is read in full against the merged
code, and every sentence that names a contract the merge changed (the
indicator table and types, the stamps, the manifest schema, the copilot and
figure editor locations, the capture modules, the products plane) reads as
the code does. Prose that is correct is left alone. A defect found in the
code during the read is a §5 row and a finding for the review, never a fix
made here.

Gates: the floor in §4.

### Step 5. Close

Delete this file in the closing commit after the review of step 4 passes.

---

## 4. Gate floor

Every Do, Review and Fix session runs all of these before its closing
commit, and lists the result in its §5 row:

- `deno task typecheck` (server, client, `lint:systems`)
- `deno task test`
- `./validate_migrations`
- `./validate_migrations_replay`
- `./validate_consolidation_replay`
- `./validate_fresh_boot` (arrives with the merge; not run before step 2)
- `./validate_queries`
- `./validate_protocols`
- `deno task build:help-buttons` leaves `git status` clean

`./validate_indicator_migration` and `./validate_consolidation` are step 3
rows, not floor gates (D8).

---

## 5. Log

| Row | Note |
| --- | --- |
| Plan written | From an independent dry-run merge of `main` (7f62d424) into `version2` (3b087642), 16 Sept 2026. |
| Plan consolidated | A second, independently written plan for the same merge was compared against this one; its SYSTEM prose sweep (Step 4), the nothing-ships rule and rollback point, and the §9-row treatment of the products plan were folded in, and it was deleted. Its pre-merge-package harness was not adopted (§1: the transform chain is main's and main tests it). |
| Step 1 built | `git mv` of `087_products.sql`, `staged/088_consolidate_projects.ts` and `staged/089_drop_project_layer.sql` to 090, 091 and 092; every reference followed (the Step 1 grep is empty over the tree; `validate_consolidation_replay`'s stale "000, 085, 086" header now reads "000, 091, 092"); one §9 row in `PLAN_PRODUCTS_RESTRUCTURE.md`. Gates: `deno task typecheck` PASS, `./validate_migrations` PASS, `./validate_migrations_replay` PASS, `./validate_consolidation_replay` PASS, `./validate_queries` PASS, `./validate_protocols` PASS. `deno task test`: 34 passed, 4 failed, none of them touching this step's surface: `products_routes_test` and `m012_expression_parity_test` are the two failures the products plan's 9a review already recorded as pre-existing (the first now fails on "table products does not exist", see the D1 row below); `mcp_context_cache_test` and `run_authoring_context_parity_test` fail because the runs the dev database points at exist only under `../wb-fastr/_example_instance_dir/runs/`, not this worktree's. `deno task build:help-buttons` does not leave `git status` clean: `../wb-fastr-site` has moved on with main (the indicators docs now describe calculated indicators; key `ind-common` goes, `ind-dhis2-import`, `ind-include` and `ind-list` arrive), which Step 2 already assigns to the merge commit. The generated file was restored to HEAD and is not in this commit. |
| D1 corrected for dev | The dev database does not carry `087_products`: its `schema_migrations` ends with main's `084_population_reserved_words` to `089_indicator_type_calculated` and it has no `products` table, so it was restored from a fleet dump after the products plan's 9a work. On dev, `090_products` applies fresh at the first version2 boot after the merge, with no dead row. The testing database was not checked from here, so D1's cost note may still hold there. |
