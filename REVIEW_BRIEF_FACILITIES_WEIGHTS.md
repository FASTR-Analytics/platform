# Review Brief — Facilities Split, Per-Family Imports, HFA Sampling Weights

Instructions for a full review of the work landed on `main` between commit `b76c1292`-equivalent ("reset upload attempts wedged mid-import on startup") and `2351139a` ("weights into hfa.csv export"), ~15 commits, 2026-06-10/11. Read the commit messages first — they are detailed and record what was verified per commit.

## The goal of the work

1. **Split the single shared `facilities` table into two independent registries** — `facilities_hmis` and `facilities_hfa` — both FK'd to the shared `admin_areas_*` hierarchy (instance DB). Facility IDs and counts are now independent per dataset family.
2. **Fully separate facility importing per family.** The old combined "admin areas + facilities" wizard couldn't know which registry an upload targeted (and offered DHIS2 to HFA, which has none). Now: each family's Facilities page launches its own import (HMIS = CSV/DHIS2, HFA = CSV only); admin areas are *derived* from facility imports (additive, orphans GC'd); the Admin areas page is counts + nuclear clear only.
3. **HFA sampling weights, importable now**: `hfa_facility_weights` (facility × time_point, strictly positive), wide-CSV import/display/export (one canonical round-tripping shape: `facility_id` + one column per time-point label), own box + page on the instance Data page, coverage stats in the SSE state. Analysis wiring (m010/R + viz aggregation) is **deliberately not implemented** — it is specified in `PLAN_WEIGHTS_WIRING.md`; only its §1.1 (weight column in the project `hfa.csv` export) and §1.2 (reserved `weight` var name) are live.
4. Incidental fixes along the way: startup reset of wedged upload attempts; facility FKs changed `RESTRICT DEFERRABLE` → `NO ACTION DEFERRABLE` (RESTRICT is never deferrable — replace-all import had never worked with data present); backup restore now runs project migrations; the lossy SQL escaper (`cleanValStrForSql`, stripped `' " ,` from values) retired in favor of `escapeSqlString`; an `ImportWizardShell` extracted with ICEH ported onto it.

`PLAN_FACILITIES_SPLIT.md` and `PLAN_WEIGHTS_WIRING.md` are the design docs; their decision tables record what is deliberate **with rationale**. Challenge any decision whose rationale doesn't hold up — just don't relitigate from taste alone.

## How to run this review

Do your own **independent pass first** — read the diff range and the system as it stands, form your own findings — *before* reading the "specific risks" section below. That list is the author's suspicions: treat it as a minimum-coverage floor to check off at the end, not as the map of where the bugs are. The author's blind spots are, by definition, not on it.

## Approximate scope — key files

**Schema & migrations**
- `server/db/instance/_main_database.sql` (facilities_hmis/_hfa, hfa_facility_weights, FK constraint names are load-bearing), `server/db/project/_project_database.sql`
- `server/db/migrations/instance/047`–`051`, `server/db/migrations/project/024`, edited guards in instance `001/003/029`
- `server/db/migrations/runner.ts` behavior assumptions; `validate_migrations` (now covers instance + project fresh replay)

**Import pipeline (server)**
- `server/db/instance/structure.ts` — attempt state machine (now `dataset_family`-aware), per-family items/delete, guards
- `server/server_only_funcs_importing/integrate_structure_from_staging.ts` — family-scoped strategies, AA insert/cleanup (UNION), deferred delete, weights stash/restore
- `server/server_only_funcs_importing/stage_structure_from_csv.ts`, `stage_structure_from_dhis2.ts`
- `server/db/instance/hfa_facility_weights.ts` — wide CSV import/items/coverage
- `server/worker_routines/stage_hfa_data_csv/worker.ts`, `stage_hmis_data_csv/worker.ts`, `integrate_*` workers (escaper change, table repoints, reserved `weight` var name)
- `server/db_startup.ts` (wedged-attempt reset)

**Viz pipeline (family threading)**
- `server/server_only_funcs_presentation_objects/get_query_context.ts` (`facilitiesTableForFamily` — throws for non-HMIS/HFA), `get_indicator_metadata.ts` (`getDatasetFamily*`), `cte_manager.ts`, `get_possible_values.ts`, `get_presentation_object_items.ts`, `get_results_value_info.ts`

**Project export**
- `server/db/project/datasets_in_project_hfa.ts` (weight LEFT JOIN into hfa.csv; parameterized facilities copy), `datasets_in_project_hmis.ts` (per-family scoping)

**Routes & types**
- `lib/api-routes/instance/structure.ts`, `server/routes/instance/structure.ts` (family params, weights routes, raw CSV exports), `server/routes/instance/instance-sse.ts`
- `lib/types/structure.ts`, `instance.ts`, `instance_sse.ts`

**Client**
- `client/src/components/instance/instance_data.tsx` (box layout), `structure/` (Facilities page, admin_areas.tsx, hfa_weights.tsx), `structure_import/` (family-parameterized wizard), `_import_wizard/import_wizard_shell.tsx` + `instance_dataset_iceh_import/` (shell port), `state/instance/t1_store.ts`, `t2_structure.ts` (family-keyed cache)

## Author's verification claims (spot-check these — they are claims, not ground truth)

`deno task typecheck` and `./validate_migrations` green throughout; migrations applied to the real local dev DBs; function-level test scripts exercised: structure staging losslessness (apostrophes/commas), weights import (wide happy path, blanks-skip, round-trip re-import, zero/duplicate/unknown-column/unknown-facility rejections), deferred replace-all delete, weights stash/restore. Browser-verified: Data page layout, both family wizards (HMIS step 0 with CSV/DHIS2; HFA straight to CSV), ICEH wizard on the new shell. Two prior multi-agent reviews ran on the split commit and the per-family commit; their confirmed findings are fixed. If any of these claims looks load-bearing for an area you're reviewing, re-verify it yourself rather than assuming it.

## Specific risks to chase (beyond general bug-finding)

1. **No full end-to-end import has been run since the changes.** Nobody has driven stage → strategy → integrate with real CSVs through the new per-family flow, for any family, nor an HFA data import (CSV + XLSForm) through the changed stager. The 6 integrate strategies × 2 families is the highest-value test matrix — especially the update-only strategies under shared admin areas. This is the single biggest gap.
2. **Admin-area GC cascading into facilities.** `facilities_* → admin_areas_4` is `ON DELETE CASCADE`, and `cleanupUnusedAdminAreas` deletes AAs `NOT IN (UNION of both facility tables)`. A bug in the UNION arms or column ordering would silently **cascade-delete the other family's facilities**. Scrutinize the four NOT-IN subqueries and prove an AA used only by family B survives family A's imports/deletes.
3. **Single-row attempt race.** `addStructureUploadAttempt` now refuses cross-family/mid-import resets, but the check and the reset are separate statements with no lock — two concurrent creates can interleave. Also stale client state: the Facilities pages fetch the attempt once on mount, no poll.
4. **Data-present migration paths are untested.** `validate_migrations` only proves fresh-replay idempotency. Untested: 047's backfill on large legacy DBs, 048's FK revalidation, 050 purging a genuinely mid-flight legacy attempt, restored mid-history backups (049/050 ordering with an attempt row present), `copyProjectInBackground`'s template path.
5. **Escaper byte-effects downstream.** A3 means values keep `' " ,` that were previously stripped. Hunt for consumers that implicitly relied on cleaned values: dedup/set keys in the HFA stager, `select_multiple` space-splitting, R-side matching on choice values, anything comparing var labels. Also HMIS `count` kept comma-stripping deliberately — confirm nothing else needed it.
6. **Wide weights CSV header edge cases.** Time-point labels are column headers: labels containing commas/quotes (CSV quoting round-trip through panther's `stringifyCsvWithHeaders` vs `getCsvStreamComponents`), labels differing only by whitespace, a label literally named `facility_id`, and `ON UPDATE CASCADE` renames of `hfa_time_points.label` while weights/exports exist.
7. **SSE/perf:** `getHfaWeightsCoverage` runs three correlated subqueries per time point (COUNT DISTINCT over `hfa_data`) on **every SSE connect and every structure notify**. Fine at dev scale (~850 facilities); estimate it at production scale (hfa_data = facilities × variables × rounds) and flag if it needs an index or materialization.
8. **Half-wired weights state.** The export now emits a `weight` column that m010 ignores by regex-miss. Confirm the old-script/new-export combination is genuinely inert (run a module if possible), and that PLAN_WEIGHTS_WIRING's compat matrix holds. The §1.3 staleness bump is deliberately deferred — confirm nothing else assumed it.
9. **Viz family threading throw-path.** `facilitiesTableForFamily` throws for ICEH/derived modules; today unreachable (verified empirically), but `metric_enricher` gates facility disaggs only on column existence, and `getReplicantOptions` maps any failure to a benign `no_values_available`. Check no stored PO config or future module shape can surface the throw as a user-facing 500 or a silently-empty dropdown.
10. **Dropped-table stragglers.** The legacy `facilities` table and its index names are gone. Grep for any consumer outside the main code paths: deploy/ops scripts, AI tool schemas (`DOC_AI_TOOL_SCHEMAS.md` machinery), status tooling, anything composing raw SQL strings at runtime.
11. **Not browser-verified:** the new weights page/box UI shipped after the last browser session — render it (set `VITE_BYPASS_AUTH=true` in `client/.env.development.local`, restore it after; Postgres runs in the `pg` docker container on port 7001).

## Practical notes

- Function-level verification pattern that works well here: small Deno scripts with absolute-path imports run via `deno run --allow-all --env-file --config deno.json /tmp/script.ts` against the local DB; clean up any rows/files you create. Staging functions are safe to run (they write staging tables only); **do not run integrates or deletes against the dev data without rolling back**.
- The server has no `--watch`; check whether ports 8000/3000 are already in use before starting anything, and leave the developer's processes alone.
- `panther/` is an external synced library — read-only here.
- The docs `DOC_IMPORT_PIPELINE.md` and friends still describe the pre-split combined import; this drift is already known — only report doc issues beyond it.
