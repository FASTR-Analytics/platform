# PLAN: Merge main into version2

Bring main's indicator restructure (PLAN_A3 to A8, deploys 1.72.0 to 1.73.1)
into `version2`, which carries the products restructure through step 9a.
The result is one merge commit on `version2` whose tree passes every gate.

**Next step: Fix 4.** Values are `Do N`, `Review N`, `Fix N`. After step 5's
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
| Dev environment | This worktree's `.env` (git-ignored) now points `RUNS_DIR_PATH`, `RUNS_DIR_PATH_EXTERNAL` and `ASSETS_DIR_PATH` at `../wb-fastr/_example_instance_dir`, the directory the shared dev database's 9 runs live in; the 20 runs under this worktree's own `_example_instance_dir` are orphans of the pre-restore database. This supersedes the run-directory explanation in the "Step 1 built" row. Expected shape of `deno task test` from here: before the merge, `mcp_context_cache_test` and `run_authoring_context_parity_test` fail with "manifest schema version 10, this server requires 7", and `products_routes_test` fails on the missing `products` table. The merge brings schema 10, so the first two pass from step 2. The table arrives at the first merged boot (`090_products`), which step 3 performs, so the products test is red in step 2's gate and green from step 3; a Do 2 session may boot once to clear it early. `m012_expression_parity_test` stays the one known pre-existing failure. |
| Review 1 | Commit 6be0b4bc read against the Step 1 Deliverable, by a fresh agent. The three renames are in place (`instance/` ends `083_population_level_setting.sql`, `090_products.sql`; `staged/` holds `000`, `091_consolidate_projects.ts`, `092_drop_project_layer.sql`); every reference site the Deliverable lists carries the new number, the Step 1 grep hits nothing outside this plan's own text, `PLAN_PRODUCTS_RESTRUCTURE.md`'s two renumber rows and `deno.lock` hashes; the `000` comment reads "001 to 090" and "091 then consolidates"; the products plan has its §9 row and its **Next step** line still says `Do 9b`. Gates rerun: `deno task typecheck` PASS (server, client, `lint:systems` with every tracked file claimed once), `./validate_migrations` PASS (87 instance, 43 project, `090_products.sql` applied, schemas unchanged), `./validate_migrations_replay` PASS (every fleet shape, `090_products.sql` applied), `./validate_consolidation_replay` PASS (all checks, "000, 091 and 092 recorded"), `./validate_queries` PASS (76 cases), `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined). `deno task test` with Valkey up: 34 passed, 4 failed, exactly the shape the "Dev environment" row predicts (`mcp_context_cache_test` and `run_authoring_context_parity_test` on "manifest schema version 10, this server requires 7", `products_routes_test` on the missing `products` table, `m012_expression_parity_test` pre-existing). `deno task build:help-buttons` rewrites `lib/help/help_targets.generated.ts` (22 insertions, 10 deletions, the site changes Step 2 owns); restored to HEAD, not committed. No code findings. |
| Review 1, finding (prose) | D1's cost note is wrong for both databases, and the §9 row this step added to `PLAN_PRODUCTS_RESTRUCTURE.md` (line 2352) repeats it: "The dev and testing databases already record `087_products`". Dev was settled by the "D1 corrected for dev" row above. The testing database (`testing-tim`, read-only over ssh per PROTOCOL_ACCESS_DBS) holds 87 `schema_migrations` rows ending at `084_population_reserved_words`, no `products` table and no row matching `%products%`, so it never saw `087_products` either. On both, `090_products` applies fresh at the first merged boot and no dead row stays. D1 is a decision and stays as written; this row is the correction. The products plan's §9 row is not corrected here (a review session does not edit); its correction, if wanted, is one more §9 row under that plan's D9. Not a code finding: next step is `Do 2`. |
| Step 2 built | `git merge --no-commit --no-ff main` gave the 24 predicted conflicts, resolved by the Step 2 tables. Departures the code forced: (a) the permission layer refused `git checkout main -- panther` and `git restore --source=main -- panther`; the merge had already carried main's panther for every non-conflicting file, so only `.panther-manifest.json` was written from `git show main:...`, and `git diff main -- panther` is empty. (b) `pdsNotRequired: true` in `t2_indicators.ts` and the `_pds` parameter in `t2_datasets.ts` are dropped, not taken from main: version2 removed the project-store readiness gate from `client/src/state/_infra/reactive_cache.ts` (ae354f5b, c50b413e), so main's key fails the client typecheck. (c) `_main_database_types.ts`: main's side of the hunk is empty (it deleted the `// Structure` section, `DBIndicatorRaw` and `DBIndicatorMapping`, and holds no indicator types in this file), so the resolution is version2's products block alone. (d) `SYSTEM_01`: main deleted `server/dev_boot_checks.ts`, so its glob goes and `server/auth/**` stays. `SYSTEM_02`: main's "HMIS indicator dictionary" with version2's "Instance migrations" heading, since the runner takes `.ts` files here. `SYSTEM_12`: version2's product-plane paragraph with main's custody wording. `SYSTEM_13`: main's interpretation paragraph minus `no projectId`. (e) the `copilot` comment in `lib/ai_tools/build_system_prompt.ts` and `server/mcp/context_cache.ts` needed no fix. The four follow-up edits are in; the retired-name grep hits only main's own transform chain and validators. `deno task build:help-buttons` is a no-op over the merged tree (main's regenerated file matches the site). Gates: `deno task typecheck` PASS (server, client, `lint:systems`), `./validate_migrations` PASS, `./validate_migrations_replay` PASS, `./validate_consolidation_replay` PASS, `./validate_fresh_boot` PASS, `./validate_queries` PASS, `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined). `deno task test`: 162 passed, 1 failed, `products_routes_test` on the missing `products` table, as the "Dev environment" row predicts; `mcp_context_cache_test`, `run_authoring_context_parity_test` and `m012_expression_parity_test` pass. No boot was performed; the table arrives in step 3. |
| Review 2 | Merge commit adbcf84d (parents 7810b3ac and 7f62d424) read against the Step 2 Deliverable, by a fresh agent. Structure: `main` is an ancestor of HEAD, no conflict markers, `git diff main -- panther` is empty, VERSION is 1.73.1, `PLAN_2_DHIS2_INDICATOR_IMPORT.md` is gone, `PROTOCOL_APP_PLANS.md` is present, the five modify/delete files are gone. Mechanical check: among the files only one branch touched since the merge base, the ones that differ from their source branch in HEAD are exactly the four rename propagations (main's edits to `datasets_in_project.ts`, `datasets_in_project_hmis.ts`, `visualization/conditional_formatting_editor.tsx` and `project_ai/build_system_prompt.ts` land in the moved files with the same changed-line counts: 4, 135, 38, 2), the `_edit_indicator.tsx` import fix, the four listed follow-up edits, and this plan. Every row of the four resolution tables checked in the code: both new names in the seven D4 files (`hmis.ts` keeps `RunFacilityRow` and version2's import paths); `countIndicatorsVersion` and `indicatorsVersion` with `instance_indicators_v7` and no `pdsNotRequired` or `_pds` (departure b holds: `reactive_cache.ts` has no readiness gate); `package_view.tsx` carries all of main's code changes under version2's project-free comment with main's "collapsible sections" wording; `index.tsx` has no `itemWidth`, and the two removals were main's only change there besides the project-shell `Switch`; the protocols baseline has no `project_ai` entry; `_main_database_types.ts` holds `DBFolder` and `DBProduct`, and main's side has no indicator types (departure c holds); `server/dev_boot_checks.ts` is gone on both sides and SYSTEM_01 keeps `server/auth/**` (departure d holds). The retired-name grep hits only `run_manifest.ts`'s transform comment, `input_transform.ts`, `validate_fresh_boot.ts` and `validate_indicator_migration.ts`, which name the old shapes on purpose. Gates rerun: `deno task typecheck` PASS (server, client, `lint:systems` with every tracked file claimed once), `./validate_migrations` PASS, `./validate_migrations_replay` PASS (7 fleet shapes, 93 migrations each, fresh boot exit 0), `./validate_consolidation_replay` PASS (live path, logs merge, negative controls, fresh path through 092), `./validate_fresh_boot` PASS, `./validate_queries` PASS (76 cases), `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined), `deno task build:help-buttons` rewrites 43 targets and leaves `git status` clean. `deno task test` with Valkey up: 162 passed, 1 failed, `products_routes_test` on `relation "products" does not exist`, exactly the "Dev environment" row's prediction for step 2. No code findings: next step is `Do 3`. |
| Step 3 built, validators | Over the merged tree at 0b348aaa, no code changes. `./validate_migrations` PASS. `./validate_migrations_replay` PASS (every fleet shape, 93 migrations each, zero statement errors). `./validate_consolidation_replay` PASS (all checks, including the negative controls). `./validate_fresh_boot` PASS (the empty boot applies through `090_products.sql`, sweeps 0 manifests, leaves an empty dictionary). `./validate_indicator_migration` NOT RUN: no dump exists under the home directory or either worktree that matches its `<main dump>` argument (a plain-SQL `pg_dump` of an instance's `main` database, `.sql` or `.sql.gz`); per D8 pulling them from the fleet on 1.73.1 is Tim's step, and the row that runs it belongs to whichever session has them. `./validate_consolidation` has no dump form; its read-only `--local` mode was run against the dev database before the boot below, while dev was still at main's `089` shape: 1 instance, zero FAIL, 5 projects ready, plan 57 products (52 decks, 5 reports), 21 folders, 345 slides, 1 id remap (slide `x2u`), 4 REVIEW lines (8 viewer-only and 13 no-role users become editors, 27 user-authored visualizations and 1 public dashboard deleted). One procedural note: `./validate_queries` failed on its first run with "Unable to load node_modules/.deno/postgres@3.4.5/.../result.js" while four validators ran in parallel and deno was rewriting `node_modules`; rerun alone it PASSED (76 cases). Run the validators serially. |
| Step 3 built, dev boot | `deno run --allow-all --env-file --unstable-broadcast-channel main.ts` (the server half of `./run`; the Vite client was not started) against the dev database on port 7001: "Running 1 instance migration(s)... 090_products.sql" applied, `schema_migrations` now ends `090_products` and `products` exists (the D1 correction rows hold: no dead `087` row); project data transforms 0 transformed; "[migration] Run manifests 8 checked, 0 transformed, 0 input mirrors rewritten, 0 unreadable, 0 from a newer server"; 283 routes, 3 headless mounts, listening on 8000. The 0 transformed is expected: main's server booted over the same runs directory at 06:54 today and rewrote every manifest to schema 10, leaving `manifest.v4` to `manifest.v7.json` backups beside them. Pre-merge package read through the merged server: run `0da592f0` (created 2026-09-04 by app 1.69.2, schema 6 at capture, `manifest.v6.json` still carries `commonIndicators`) answers `GET /run_generation/catalog` as `ready` and `GET /run_generation/run/0da592f0.../authoring_context` with `success: true`, 6 modules, 33 metrics, `hmisIndicators` of 29 entries in the `{ id, label, format_as }` shape, and one `hmis` dataset whose `info` carries `version`, `totalRows`, `structureLastUpdated` and both version stamps. Server stopped after the read. `deno task test` then: 163 passed, 0 failed (`products_routes_test` green now the table exists, as the "Dev environment" row predicts). Remaining floor: `deno task typecheck` PASS (server, client, `lint:systems`), `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined), `deno task build:help-buttons` rewrites 43 targets and leaves `git status` clean. |
| Step 3, finding for the review (main's, not the merge's) | The version stamps the pre-1.72 package carries in `datasets[0].info` are the old names, `indicatorMappingsVersion` and `baseIndicatorMappingsVersion`, after main's whole transform chain: no block in `server/runs/manifest_transform.ts` renames them, and main's project migration `042_dataset_info_stamp_names.sql` renames only project `datasets.info`. Packages captured on 1.72 or later write the new names (`server/runs/capture_inputs/hmis.ts` lines 201 to 209). `RunDatasetHmisInfo` in `lib/types/run_datasets.ts` (lines 29 to 36) types only the new names, so the old stamps are untyped and, since Zod passes `info` through as `unknown`, survive rather than being stripped. Inert today: no reader consumes `info.indicatorsVersion`, `info.countIndicatorsVersion` or the old pair anywhere under `client/src`, `server` or `lib` (the grep is empty), and the "staleness detection" the type's comment promises has no consumer yet. Same on `main` (`git grep MappingsVersion main` hits only 042). Not a merge defect and not fixed here (Step 4's rule); recorded so the review rules whether it is a main finding for a manifest transform block 11 or a comment fix, and so the "dataset stamps present" verification above is read with the right names in mind. |
| Review 3 | Commit daeb79fc read against the Step 3 Deliverable, by a fresh agent. Surface: the commit touches only this plan, no code. Every validator row reproduced serially over the same tree: `./validate_migrations` PASS (instance and project, schemas unchanged), `./validate_migrations_replay` PASS (every fleet shape, 93 migrations recorded on the fresh boot), `./validate_consolidation_replay` PASS (live path, logs merge, negative controls, fresh path through 092), `./validate_fresh_boot` PASS (through `090_products.sql`, empty dictionary). `./validate_indicator_migration` NOT RUN, the same reason: a search of the home directory and both worktrees for `.sql`, `.sql.gz` or dump-named files outside the migration folders finds nothing. `./validate_consolidation.ts --local` (its documented read-only mode) rerun against dev, now at the `090` shape: 1 instance, zero FAIL, 57 products (52 decks, 5 reports), 21 folders, 345 slides, 1 remap (slide `x2u`), the same 4 REVIEW lines. Dev boot row checked at the database: `main` holds 93 `schema_migrations` rows ending `090_products`, `products` exists, no row matches `087`; the five project databases end at `042_dataset_info_stamp_names`. The merged server booted again on 8000 ("Run manifests 8 checked, 0 transformed", 283 routes), `GET /run_generation/catalog` lists `0da592f0` as `ready`, and its `authoring_context` answers `success: true`, 6 modules, 33 metrics, 29 `hmisIndicators` as `{ id, label, format_as }`, one dataset whose `info` carries `version`, `totalRows`, `structureLastUpdated` and the stamp pair; server stopped after the read. Floor: `deno task typecheck` PASS (server, client, `lint:systems`, 834 tracked files each claimed once), `deno task test` with Valkey up 163 passed, 0 failed, `./validate_queries` PASS (76 cases), `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined), `deno task build:help-buttons` rewrites 43 targets and leaves `git status` clean. No code findings: next step is `Do 4`. |
| Review 3, ruling on the stamp-name row | Confirmed in the code: `server/runs/manifest_transform.ts` and `server/runs/input_transform.ts` never name either stamp pair, `git grep MappingsVersion main` hits only project migration 042 and the changelog, `lib/types/run_manifest.ts` line 142 types dataset `info` as `z.unknown()`, and the grep for any reader of `info.indicatorsVersion`, `info.countIndicatorsVersion` or the old pair under `client/src`, `server` and `lib` is empty. The authoring context read above returns the old names for the pre-1.72 package, so the projection passes them through untouched. Ruling: not a merge defect and not a finding for this plan; it is main's, inert, and identical on both branches. It does not block `Do 4`. Where it lives next is Tim's call, asked in chat: a transform block on main that renames the pair in `datasets[].info` (the fix the `RunDatasetHmisInfo` type implies), or a one-line addition to the legacy-keys comment above that type in `lib/types/run_datasets.ts` naming the old pair as inert. Either is a main change, outside this plan. |
| Outside the plan, between Review 3 and Do 4 | Tim ruled on the stamp-name row: as little legacy as possible. One commit on `version2` follows this row's commit and is not part of any step: manifest transform block 9 (schema 11) renames the pre-1.72 HMIS stamp pair in `datasets[].info` and drops every info key nothing reads, with the schema history, cache prefixes, SYSTEM_08 paragraph and a test, per the manifest checklist in `PROTOCOL_APP_MIGRATIONS.md`. Review 4 lists commits from the one that set `Do 4`; that commit is expected there and is not a Step 4 surface finding. |
| Step 4 built | Eleven SYSTEM files read in full against the merged tree, one reader per file, each checking every named table, type, field, path, cache key, migration number, validator and component location with grep or by opening the file. Surface held: only `SYSTEM_*.md` changed, no code. 294 lines changed across the eleven. The merge-changed contracts were mostly already right (`hmisIndicators`, `RunHmisIndicator`, `indicatorsVersion` / `countIndicatorsVersion`, `calculated`, `data_id`, `RunDataset`, `capture_inputs/`, `copilot`, `figure_editor`, 090 to 092); what was wrong was mostly one branch's leftovers: SYSTEM_08's project-tab, picker and pre-attach-modal sentences (gone in 9a), SYSTEM_02's `datasets_in_project_*` list, `getPgConnection` call sites, the fresh-boot seed claim and the `dashboard_config.ts` figure sweep, SYSTEM_09's `PO_CACHE_VERSION` "19" / `po_detail_v10` and two symbols that no longer exist, SYSTEM_13's model config (panther's `DEFAULT_MODEL_CONFIG` now, no app `allowedModels`) and the deleted `routes/project/ai_tools.ts` paragraph and manifest entry, SYSTEM_12's report row shape and notify triangle and five open items already resolved, SYSTEM_05's project-snapshot wording for HFA metadata and the `instance_indicators_v6` key, SYSTEM_01's off-registry AI rows and `requireApprovedUser()` call sites, SYSTEM_15's `addProject` body and `/dhis2-indicators-export` `id`, SYSTEM_10's XLSX and dashboard export rows, and stale line anchors and counts throughout. No em-dash introduced. Gates: `deno task typecheck` PASS (server, client, `lint:systems`), `deno task test` 165 passed, 0 failed, `./validate_migrations` PASS, `./validate_migrations_replay` PASS, `./validate_consolidation_replay` PASS, `./validate_fresh_boot` PASS, `./validate_queries` PASS, `./validate_protocols` PASS, `deno task build:help-buttons` leaves `git status` clean. |
| Step 4, code findings for the review (not fixed here) | Found during the read, none a merge defect: (a) `server/routes/project/ai_proxy.ts` exports `routesAiProxy` and nothing imports it; `main.ts` mounts the instance proxies only. Dead file. (b) `lib/types/reports.ts` lines 39 to 103: `ReportGroupingMode`, `ReportFolder`, `ReportPreviewLine`, `ReportPreview`, `ReportSummary`, `buildReportPreview` have no consumer since the product summary replaced the report list. (c) `server/db/project/mod.ts` omits `visualization_folders.ts`, which `server/db/project/projects.ts` line 41 and `server/routes/project/visualization_folders.ts` line 8 deep-import against the barrel rule SYSTEM_02 states. (d) Stale comments: `server/runs/capture_inputs/hmis.ts` line 99 says the indicators mirror is the whole dictionary (it is the analysed set); `server/middleware/headless_allowlist.ts` lines 28 to 29 and `server/mcp/context_cache.ts` line 252 say the run-keyed metric routes enforce `can_view_data` (they are `requireApprovedUser()`); `client/src/components/instance_results_packages/detail.tsx` line 44 names the deleted project tab; `lib/validate_fetch_config.ts` lines 11 and 46 name `projectDb.unsafe`, a call that no longer exists (the DuckDB executor runs the SQL). (e) `SYSTEMS.md` line 53 says `routes/project/project.ts` has 18 routes; it has 15. Outside this step's surface. All of (a) to (c) are on the project layer or the report list that 9b removes or already replaced, so the review rules whether any is worth a commit before 9b. |
| Review 4 | Commits `a27fcaac` and `74938d70` read against the Step 4 Deliverable, by a fresh agent, with eleven per-file reads against the merged code. Surface held: `74938d70` touches only the eleven `SYSTEM_*.md` files and this plan's two mandated lines; `a27fcaac` is the out-of-plan commit the "Outside the plan" row above announced, and is not judged as Step 4 surface. Scope ruling, stated because most findings below turn on it: the Deliverable is "every sentence that names a contract the merge changed reads as the code does", not "every sentence in the file is correct", so a pre-existing error in prose the merge did not touch is recorded below but is not a Step 4 defect. Gates rerun serially: `deno task typecheck` PASS (server, client, `lint:systems`, 18 systems, 835 tracked files each claimed once), `deno task test` with Valkey up 165 passed 0 failed (including the two new `run_manifest_transform_test.ts` cases), `./validate_migrations` PASS, `./validate_migrations_replay` PASS, `./validate_consolidation_replay` PASS, `./validate_fresh_boot` PASS, `./validate_queries` PASS (76 cases), `./validate_protocols` PASS (0 tier-1, 0 new tier-2, 16 baselined), `deno task build:help-buttons` rewrites 43 targets and leaves `git status` clean. The merge-changed contracts the step set out to sweep are overwhelmingly right in the result, and the reads confirmed a large amount of correct rewriting. But the step introduced ten errors of its own, four of them plain errors of fact where the pre-edit text was correct, so the next step is `Fix 4`, not `Do 5`: on a prose-only surface a wrong edit is the step's equivalent of a code finding, and the review protocol's `Do N+1` branch requires no findings that change content. |
| Review 4, findings against step 4's own edits (the Fix 4 list) | Each verified in the code by this session, not taken from the reader's report. (1) `SYSTEM_10_figure_render_export.md:43` changed a correct "102 font files" to "103": `client/public/fonts/` holds 105 entries, 34 `.ttf` + 34 `.woff` + 34 `.woff2` = 102 font files, plus `fonts.css`, `font-preload.html` and `font-map.json`; the directory is unchanged since `672a82d7`, so nothing justified the bump, and the sentence names only `fonts.css` of the three non-font files. (2) `SYSTEM_10_figure_render_export.md:709` changed a correct "15 consumer files" to "16": grepping every symbol `lib/key_colors.ts` exports across `client/src`, `lib` and `server` hits 17 files, of which one is `lib/key_colors.ts` itself and one is `server/db/migrations/instance/079_common_indicator_types.sql`, leaving 15 TypeScript consumers. (3) `SYSTEM_05_facilities_indicators.md:354` changed "fourteen cases" to "nineteen"; `server/tests/indicator_schema_test.ts` has 19 `Deno.test` blocks but the last (`:271`) is `cleanup: drop the throwaway database`, so the constraint cases are the 14 numbered ones plus the four rule tests at `:238,:245,:253,:261`, eighteen. (4) `SYSTEM_12_documents_sharing.md:254` added "the copilot itself mounts once on the Products page (`ProductCopilotHost`, D15), so every editor opened from it shares that one instance"; the host is mounted per opened product as the editor overlay (`client/src/components/products/index.tsx:86-97`, comment at `:88-89` "one copilot per open product"; `client/src/components/copilot/index.tsx:52-54` says the same), and `SYSTEM_13_ai_assistant.md:264` states the opposite in the merged tree ("The Products page and every other tab have no copilot"). The nested-slide-editor half of the sentence is right. (5) `SYSTEM_09_viz_query_cache.md:756-762` folded `getRunAuthoringContext` into a list qualified "the caller supplying `(run_id, adminArea2)`, `runs.status = 'ready'` required"; neither applies to it, and `server/routes/instance/run_generation.ts:332-334` says so in the code ("the manifest lens, no scope and no ready gate"), its handler at `:340` calling `getRunReadContextForRun(params.run_id)`, not `getReadyRunReadContext`. The `requireApprovedUser()` half is correct for all five. The same edit left a 95-character line where the file wraps at about 80. (6) `SYSTEM_13_ai_assistant.md:156` moved the anchor from `238-240` to `237-239` for a sentence about "two thin raw Hono routes"; the two proxies are `main.ts:237` and `:238`, while `:239` is `app.route("/ai", routesAiFiles)`, which the same file documents separately as the Files proxy. (7) `SYSTEM_14_client_shell.md:76` still says "~250-file `t3` call-site surface" after the same edit corrected `:193` and `:212` to 241, so one file states one count three ways. (8) `SYSTEM_02_persistence.md:472-474` added `db/products/mod.ts` to the barrel list under the unchanged claim "aggregate and re-export every non-helper sibling so callers never deep-import"; `server/db/mod.ts` re-exports only `postgres/mod.ts`, `utils.ts`, `instance/mod.ts` and `project/mod.ts`, so the new fourth barrel is unreachable from the top one and callers necessarily deep-import it (`server/task_management/build_instance_state.ts:14-16`, `server/task_management/notify_instance_updated.ts:23`, `server/collab/version_capture.ts:51-54`). (9) `SYSTEM_13_ai_assistant.md:731` rewrote `_internal/format_*_for_ai.ts` to `lib/ai_tools/format_*_for_ai.ts`; both sets are live, `client/src/components/copilot/ai_tools/tools/_internal/` still holding `format_figure_config_for_ai.ts`, `format_module_settings_for_ai.ts` and `format_modules_list_for_ai.ts`, which are what the Open items at `:792-796` are about, so the rewrite narrows the claim rather than correcting it. (10) `SYSTEM_09_viz_query_cache.md:30-31` corrected the numbers to `"23"` and `po_detail_v13` (right: `server/routes/caches/visualizations.ts:95,147`) but dropped the pre-edit hedge about the stale table further down, leaving "SYSTEM_03's cache catalog is authoritative for the live keying" pointing at `SYSTEM_03_realtime_cache.md:369-374`, which still says `"19"` and `po_detail_v10`. SYSTEM_03 is outside this step's surface, so the fix belongs in the pointer, not in SYSTEM_03. |
| Review 4, Deliverable misses (merge-changed contracts the sweep left wrong) | Sentences the step should have caught by its own Deliverable, all pre-existing rather than introduced. (a) `SYSTEM_01_api_contract.md:634-637`: "`approved` is only enforced on the project path (e.g. the send-email route's instance-side guard)". `requireApprovedUser()` arrived with main and enforces it on nine instance routes (`server/middleware/userPermission.ts:54`), which the same file states at `:495-504`, and the example given is now the counter-example: `sendSlideDeckEmail` is an instance route (`lib/api-routes/instance/emails.ts:12`) guarded by `requireApprovedUser()` (`server/routes/instance/emails.ts:89`). The first clause is still true, its live examples being `sendHelpEmail` (`server/routes/instance/emails.ts:134`) and `recordTourEvent` (`server/routes/instance/onboarding.ts:16`). (b) `SYSTEM_09_viz_query_cache.md:628`: "`projectState.adminArea2` set + national context renders the pinned form instead". `projectState` is a project-shell global the products restructure removed and has zero hits under `client/` and `lib/`; the override reads the bundle's own scope (`client/src/generate_visualization/get_data_config_from_po.ts:131`, with the D4 contract spelled out at `:126-130`). (c) `SYSTEM_12_documents_sharing.md:205` and `:438`: slide bodies are not `z.unknown()` at the route, they validate against `slideConfigSchema` on both writers (`lib/api-routes/products/slides.ts:49,59`, header at `:20-25`), and the PatternType `"none"` gap the sentences call the blocker is closed (`lib/types/_slide_config.ts:28-32`, "Mirrors panther's PatternType exactly, `"none"` included"). (d) `SYSTEM_08_results_packages.md:425-428`: "the manifest lens ... serves the package-internals reads (`getRunModuleWithConfigSelections`, `getRunAuthoringContext`)" under "the same exposure as `getRunDetail`". The two do not share an exposure: `server/routes/instance/run_generation.ts:221-222` gates `getRunModuleWithConfigSelections` on `requireGlobalPermission("can_view_data")`, `:337-338` gates `getRunAuthoringContext` on `requireApprovedUser()`. This is the same defect as finding (5) above, in the other file. (e) `SYSTEM_08_results_packages.md:439`: "`PO_CACHE_VERSION` did not move" reads as present tense and is now contradicted by the same file's own block-9 paragraph; the constant went `"22"` to `"23"` in `a27fcaac`. True as a historical claim about the D7 mount refactor, so it needs a scoping clause. |
| Review 4, prose outside the Deliverable (recorded, not in the Fix 4 list) | Pre-existing errors in sentences the merge did not change; correcting them is optional and none blocks the plan. `SYSTEM_09_viz_query_cache.md:508,512,518-519,521` say the blank fold emits `btrim()`; the emitter uses two-arg `trim()` and `server/server_only_funcs_presentation_objects/query_helpers.ts:31-34` rules on why ("DuckDB has no btrim"). `SYSTEM_02_persistence.md:354` says the staged consolidation files are scanned by neither the runner nor the validate scripts, which its own next sentence contradicts and `validate_consolidation_replay.ts:46,131,143,568` disproves; "neither the runner nor `validate_migrations`/`validate_migrations_replay`" is the true form. `SYSTEM_15_admin_ops.md:304-305` names `projectEditors`/`projectViewers`, which appear nowhere in `lib/`, `server/` or `client/src/` (`createProject`'s body is `z.object({ label, adminArea2 })`, `lib/api-routes/project/projects.ts:24-32`); `:305-306` names an unused local `mainDb` in `copyProject`'s `.then`, which holds only two notify calls (`server/routes/project/project.ts:324-331`); `:125` still lists the central-export endpoints in the H_USERS gate list, which the same file retires at `:181-185`. `SYSTEM_13_ai_assistant.md:102-104` credits `buildInstanceContextSections` with the calendar line; it is emitted by `buildPackageGroundingSections` (`lib/ai_tools/build_system_prompt.ts:214`), the first function emitting country, instance name and terminology only. Smaller ones: `SYSTEM_01:274-288`'s "complete" off-registry list omits `server/routes/public/oauth_metadata.ts` (three raw handlers) and `main.ts:262`'s `app.all("/mcp", ...)`; `SYSTEM_14:9,12` and `:21,23` list two glob paths twice; `SYSTEM_05:254-255` says "both facility-delete endpoints" where there is one, `deleteFamilyFacilities` (`server/routes/instance/structure.ts:89`), parameterised by family; `SYSTEM_13:580` puts `MAX_TURN_CONTINUATIONS` in `turn_logic.ts` when it is `panther/_305_ai/_components/_create_ai_chat.ts:84`; `SYSTEM_13:601` says the HFA chat shares the copilot's model config shape, but the copilot omits `modelConfig` (`client/src/components/copilot/index.tsx:205-210`) while HFA passes `{ max_tokens: 4096 }` (`client/src/components/indicator_manager_hfa/ai/index.tsx:32`); `SYSTEM_13:508` names `INFO_TOPICS` where the SPA prompt uses `SPA_INFO_TOPICS`; `SYSTEM_12:118-120` says each of five detail tables carries a `type` column and a composite FK, which is true of `slide_decks` and `reports` only (`server/db/migrations/instance/090_products.sql:34-40,60-70`); `SYSTEM_12:72-76` has an unclosed parenthesis; `SYSTEM_02:272-290,321-326` have an incomplete `escapeSqlString` call-site list (`server/run_query/run_read.ts:885` and `server/runs/package_compatibility.ts:74` build DuckDB SQL with the Postgres escaper), an uncovered `.unsafe()` site (`server/db_startup.ts:59`) and the dashboard-slug backfill placed after the project migrations when `server/db_startup.ts:108-114` runs it before them and says why. Two files also carry an em-dash inside a faithful quotation of a code string (`SYSTEM_09:618,629` and `SYSTEM_10:313`, quoting `client/src/generate_visualization/get_data_config_from_po.ts:116`), which the repo rule permits for strings shown to users. |
| Review 4, finding against `a27fcaac` (not step 4's) | `server/routes/caches/visualizations.ts`: that commit's edit left the closing `>` of `_PO_DETAIL_CACHE`'s type-argument list on line 122, ahead of the prefix doc comment, so the call arguments are orphaned at `:147` as `("po_detail_v13", {`, where every earlier revision had `>("po_detail_v12", {` immediately after the comment. `deno fmt --check` is clean on the file, so it is cosmetic and not a gate failure. One reader reported the same pattern on all three caches in the file; that is wrong, `_PO_ITEMS`, `_METRIC_INFO` and `_REPLICANT_OPTS` still read `>("po_items", {` at `:178`, `:216` and `:258`. The other consequence of that commit is row (e) above, the now-unscoped `PO_CACHE_VERSION` sentence at `SYSTEM_08_results_packages.md:439`. Both are that commit's to fix, not `Fix 4`'s, unless Tim folds them in. |
| Review 4, ruling on step 4's code findings | All five reproduced independently and all five stand. (a) `server/routes/project/ai_proxy.ts:5` exports `routesAiProxy` and the only other mention in the tree is a stale comment at `server/routes/instance/ai_proxy.ts:8` pointing at it; the live sibling is `copilot_ai_proxy.ts`. (b) the six report symbols occur only in `lib/types/reports.ts`, and `ReportPreviewLine` (`:23`) is dead with them, which the step's row did not list. (c) `server/db/project/mod.ts` exports three siblings and omits `visualization_folders.ts`, deep-imported at `server/db/project/projects.ts:41` and `server/routes/project/visualization_folders.ts:8`; the same defect is worse one level up, see finding (8). (d) all four stale comments confirmed, with one refinement: `server/mcp/context_cache.ts:252` and `server/middleware/headless_allowlist.ts:28-29` name a guard that exists on a different set of routes, `server/routes/instance/run_generation.ts:177-222` being the `can_view_data` ones while the run-keyed metric reads at `:251,271,288,313,338` are `requireApprovedUser()`, as `:245` states. `lib/validate_fetch_config.ts:11,46` name `projectDb.unsafe`, and no `.unsafe(` remains outside the instance path. (e) `SYSTEMS.md:53` says 15, not 18: `server/routes/project/project.ts` has exactly 15 `defineRoute` calls. Ruling: (a) to (c) are all on the project layer or the report list that 9b removes, so none is worth a commit before 9b, and (d) and (e) are one-line comment and count fixes outside this plan's surface. None is a merge defect and none belongs in `Fix 4`; they are recorded here for the products plan. |
