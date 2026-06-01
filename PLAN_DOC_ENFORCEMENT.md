# Plan: Make the DOCs & Protocols Enforce, Not Just Describe

A code-tightening backlog surfaced while writing the server `DOC_*.md` files (see the index in `CLAUDE.md`). The docs lean descriptive *as written*; this plan is the work that turns their "Rules" into things that actually fail when violated — plus the real defects the review found along the way.

**Framing:** a doc is only a *protocol* if its rule is backed by a mechanism that makes the wrong thing fail (a startup check, a `CHECK` constraint, a lint, or a shared helper that removes the choice). Tier 1 is "fix the bug regardless." Tier 2 is "add the mechanism that makes a doc enforceable (and kills a bug class)." Tier 3 is "consolidate to remove drift risk." Tier 4 is client file-organisation alignment to the new `panther/protocols/PROTOCOL_UI_STRUCTURE.md`, and a final repo-wide sweep applies the new `PROTOCOL_ALL_TYPESCRIPT` code-quality rules.

(Tiers 1–3 are server, surfaced by the `DOC_*.md` review; Tier 4 + the sweep came out of the frontend/protocol discussion and align the code to the panther protocols, client included.)

Work top-down: Tier 1 → the cheap Tier-2 items (3, 4, 5) → the rest. Each item notes the owning doc so the fix and the doc stay in sync.

---

## Tier 1 — Real defects (fix regardless of docs)

- [ ] **1. `health.ts` routes have no permission guard.**
  ~12 routes (`/user_logs`, `/ai_usage`, `/project_activity`, `/pg_stat_statements`, …) plus a **mutating** `POST /pg_stat_statements_reset` are registered raw and sit behind `clerkMiddleware` (which populates, doesn't reject) with no `requireGlobalPermission`. Any logged-in user — any role — can read logs / AI usage / pg stats and reset stats.
  **Fix:** add `requireGlobalPermission("can_view_logs")` (or `{ requireAdmin: true }` for the reset/pg-stats endpoints) to each route, or move them behind a guarded router.
  **File:** `server/routes/instance/health.ts`, mounting in `main.ts`. **Doc:** [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

- [ ] **2. Module-run liveness: leaked connection + stuck "running" + no crash recovery.** Three compounding issues:
  - `run_module/worker.ts` `run()` creates `projectDb` then, on the early `getModuleDetail`-failure return, `.end()`s `mainDb` but **not** `projectDb` — a leaked dedicated-pool connection on every failed run.
    **Fix:** wrap the body in `try/finally` and `.end()` both connections on every exit.
  - A worker that dies without posting `task_ended` leaves its `RUNNING_MODULES_ALL_PROJECTS` entry in place → `getModuleDirtyOrRunning` reports `running` forever → `getNextRunnableModules` skips it → **every dependent module is blocked**.
    **Fix:** attach a host-side `worker.onerror`/exit fallback (in `triggerRunnableModules` after `addRunningModule`) that `removeRunningModule` + marks the module `error`.
  - Nothing re-triggers `dirty='queued'` modules after a crash/deploy (the running map is in-memory; `main.ts` has no resume step).
    **Fix:** add a startup sweep that calls `triggerRunnableModules` per project.
  **Files:** `server/worker_routines/run_module/worker.ts`, `server/task_management/{trigger_runnable_tasks,running_tasks_map,set_module_clean}.ts`, `main.ts`. **Docs:** [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md), [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

---

## Tier 2 — Turn a doc into an enforced protocol (each also kills a bug class)

- [ ] **3. `validateAllRoutesDefined` should fail, not warn.**
  It currently `console.error`s on missing/extra routes and continues, so a registry key with no handler ships as a client action that 404s.
  **Fix:** throw (or `Deno.exit(1)`) on mismatch, or run it as a CI check. This makes the registry-is-the-contract rule real.
  **File:** `server/routes/route-tracker.ts`. **Doc:** [DOC_API_ROUTES.md](DOC_API_ROUTES.md).

- [ ] **4. Startup guard-audit: every registered route is guarded or explicitly public.**
  Classify each route registered via `defineRoute` as having a permission guard or an explicit `/* PUBLIC */` marker; fail boot on an unclassified route. Permanently closes the `health.ts`-style class (item 1) and any future omission.
  **Files:** `server/routes/route-tracker.ts` (extend the tracker), `main.ts` (run after mounting). **Doc:** [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

- [ ] **5. `CHECK` constraint on `modules.dirty`.**
  Constrain to `('queued','ready','error')`. `getModuleDirtyOrRunning` already throws on any other value, so today a stray write silently breaks a project's dirty-state read. Add an idempotent migration (see [DOC_MIGRATIONS.md](DOC_MIGRATIONS.md) for the `DO $$ … pg_constraint` pattern).
  **Files:** `server/db/migrations/project/`, `_project_database.sql`. **Doc:** [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md).

- [ ] **6. One bulk-escape helper; ban hand-built `VALUES`.**
  The import pipeline escapes bulk `VALUES` three different ways on user data: structure uses `cleanValStrForSql` **and** `''`-doubling; HFA uses `cleanValStrForSql` only (no doubling); HMIS facility id uses `''`-doubling without `cleanValStrForSql`. Correctness + injection risk.
  **Fix:** one `sqlBulkLiteral(value)` helper, route all three pipelines through it, and lint/grep-ban manual tuple escaping.
  **Files:** `server/server_only_funcs_importing/stage_structure_from_csv.ts`, `server/worker_routines/stage_{hmis,hfa}_data_csv/worker.ts`, a shared util. **Docs:** [DOC_IMPORT_PIPELINE.md](DOC_IMPORT_PIPELINE.md), [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md) (owns the SQL-safety rule).

- [ ] **7. Harden R-source interpolation.**
  The default and HFA script generators interpolate config `text`/`select`/`number` values and `COUNTRY_ISO3` with bare `'…'` wrapping and no escaping; only the calculated-indicators generator validates identifiers. These strings execute as real R in a container.
  **Fix:** validate-by-type or escape every interpolated value; factor the triplicated 4-input-type substitution block into one function so quoting can't drift.
  **Files:** `server/server_only_funcs/get_script_with_parameters*.ts`. **Doc:** [DOC_MODULE_EXECUTION.md](DOC_MODULE_EXECUTION.md).

---

## Tier 3 — Consolidation that removes drift risk

- [ ] **8. Shared `runWorker()` wrapper.**
  The worker-entry preamble (`onmessage → run().catch(reportError+close)`, `postMessage("READY")`, `alreadyRunning` guard) is hand-copied into 6 worker files with subtle divergence. Factor it; pairs with the `finally`-teardown fix in item 2.
  **Files:** `server/worker_routines/*/worker.ts`, `instantiate_worker_generic.ts`. **Doc:** [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md).

- [ ] **9. Single cache key-builder + one separator.**
  The six `TimCacheC` caches use three separators (`|`, `::`, `_`) and compute the key twice (in `*FromParams` and `parseData`); a one-char drift silently drops every write, and `cache_status` reverse-parses by a hard-coded separator.
  **Fix:** one shared key-builder per cache used by both paths, one reserved separator.
  **Files:** `server/routes/caches/{visualizations,dataset}.ts`, `server/valkey/cache_class_C.ts`. **Doc:** [DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md).

- [ ] **10. Route all CTE construction through `CTEManager`.**
  `get_possible_values.ts` and `get_period_bounds.ts` hand-write their own `WITH period_data` / `facility_subset` strings (always deriving all three period columns), which breaks on `quarter_id`-only tables and duplicates the CTE shape across three files.
  **Files:** `server/server_only_funcs_presentation_objects/{get_possible_values,get_period_bounds,cte_manager}.ts`. **Doc:** [DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md](DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md).

- [ ] **11. Ban raw `Deno.env.get` outside `exposed_env_vars.ts`.**
  The AI proxy and files routes re-read `ANTHROPIC_API_KEY` raw (4 sites) and hardcode the Anthropic URL, despite `_ANTHROPIC_API_KEY` / `_ANTHROPIC_API_URL` being exported and validated at boot.
  **Fix:** use the `_`-prefixed exports; add a lint/grep rule against `Deno.env.get` outside `exposed_env_vars.ts`.
  **Files:** `server/routes/project/{ai_proxy,ai_files}.ts`. **Docs:** [DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md](DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md).

- [ ] **12. Collapse the `notify_last_updated` indirection.**
  `notifyLastUpdated` → `notifyProjectLastUpdatedV2` → `notifyProjectV2` is three layers for one event (the middle layer has no other callers). Pick the layer call sites use; remove the rest. (Bundle with retiring the vestigial `_v2` naming if doing a rename pass.)
  **Files:** `server/task_management/notify_{last_updated,project_v2}.ts`. **Doc:** [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md).

---

## Tier 4 — Client file organisation (align `components/` to `PROTOCOL_UI_STRUCTURE`)

> Opportunistic, low-churn — do these when you're already editing the area, not as a big-bang reorg PR (per the earlier call). The tree already mostly mirrors the UI; these are the exceptions.

- [ ] **18. Relocate the loose-at-root components.** ~13 PascalCase components sit loose at the `components/` root (`PeriodSelector`, `NotAvailableBox`, `ConnectionStatus`, `DirtyStatus`, `Conflicts`, `ReplicateByOptions`, `TimeIndexSelector`, `WindowingSelector`, `PresentationObjectMiniDisplay`, `PresentationObjectPanelDisplay`, `Dhis2CredentialsEditor`, `PasswordGate`, `LoggedInWrapper`), plus `email_opt_in_modal.tsx`, `organisation_modal.tsx`, and the loose `_*.ts(x)` helpers. Move each to **its feature folder** if it's single-area (e.g. `ReplicateByOptions`/`WindowingSelector` → `visualization/`), or to **`_shared/`** if genuinely cross-area (`PeriodSelector`, `NotAvailableBox`). "Loose at root" is not a location.
  **Files:** `client/src/components/`. **Protocol:** `PROTOCOL_UI_STRUCTURE` (rules 2–3, "where does X go?" table).

- [ ] **19. Collapse the `instance_dataset_*` prefix-explosion.** Six siblings (`instance_dataset_{hfa,hmis,iceh}` × `_import`) → one nested domain folder `instance_dataset/{hfa,hmis,iceh}/{view,import}`.
  **Files:** `client/src/components/instance_dataset_*`. **Protocol:** `PROTOCOL_UI_STRUCTURE` (rule 5, nest facets — don't suffix).

- [ ] **20. snake_case component filenames.** Rename PascalCase files (`PeriodSelector.tsx` → `period_selector.tsx`, …) as they move in item 18.
  **Files:** `client/src/components/`. **Protocol:** `PROTOCOL_ALL_TYPESCRIPT` (naming) + `PROTOCOL_UI_STRUCTURE` (rule 8).

---

## Repo-wide — code-quality rule sweep (client + server)

- [ ] **21. Sweep for the new `PROTOCOL_ALL_TYPESCRIPT` rules 14–16.**
  - **No vestigial versioning:** `_v2` SSE route/channel/file + `notifyProjectLastUpdatedV2`, `QueryConfigV2`/`buildCombinedQueryV2` (+ "identical to v1" comments), `goal1_org_units_v2` — rename to the unsuffixed name with a deliberate one-time migration; check the client for `vN` too.
  - **No dead code:** delete commented-out back-compat functions and "old version" breadcrumbs (notably in the PO query pipeline).
  - **No silent failures:** the scattered `.catch(() => {})` — await, or log the failure.
  Spans client and server. Overlaps items 10 and 12. **Protocol:** `PROTOCOL_ALL_TYPESCRIPT` 14–16.

---

## Smaller / lower-priority

- [ ] **13. DHIS2 retry off `error.status`, not `error.message` substring** (`retry_utils.ts` — works today, brittle). **Doc:** [DOC_DHIS2_INTEGRATION.md](DOC_DHIS2_INTEGRATION.md).
- [ ] **14. Gate DHIS2 worker credential/URL logging** behind `logRequest` (the HMIS DHIS2 staging worker logs URL + credential structure unconditionally). **Doc:** DOC_DHIS2_INTEGRATION.
- [ ] **15. Decide the `READ_ONLY` connection flag** — make it real (`default_transaction_read_only`) or rename it to "cache-namespacing only" (today it doesn't prevent writes). **Doc:** [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md).
- [ ] **16. Consolidate `generateUnique*Id`** (6 near-identical copies) into `generateUniqueId(db, tableName)`. **Doc:** DOC_DB_ACCESS_LAYER.

---

## Summary

| # | Item | Tier | Owning doc | Effort |
|---|------|------|-----------|--------|
| 1 | Guard `health.ts` routes | 1 | ACCESS_CONTROL | S |
| 2 | Module-run leak / stuck-running / crash recovery | 1 | WORKER_ROUTINES, TASK_EXECUTION | M |
| 3 | `validateAllRoutesDefined` fails not warns | 2 | API_ROUTES | S |
| 4 | Startup guard-audit | 2 | ACCESS_CONTROL | M |
| 5 | `CHECK` on `modules.dirty` | 2 | TASK_EXECUTION | S |
| 6 | One bulk-escape helper | 2 | IMPORT_PIPELINE, DB_ACCESS_LAYER | M |
| 7 | Harden R-source interpolation | 2 | MODULE_EXECUTION | M |
| 8 | Shared `runWorker()` wrapper | 3 | WORKER_ROUTINES | M |
| 9 | Shared cache key-builder / separator | 3 | VALKEY_CACHE | M |
| 10 | CTEs through `CTEManager` | 3 | PO_QUERY_PIPELINE | M |
| 11 | Ban raw `Deno.env.get` | 3 | AI_PROXY | S |
| 12 | Collapse notify indirection | 3 | SSE_REALTIME | S |
| 13–16 | Smaller items | — | various | S |
| 18 | Relocate loose-at-root components | 4 | UI_STRUCTURE | M |
| 19 | Collapse `instance_dataset_*` | 4 | UI_STRUCTURE | M |
| 20 | snake_case component filenames | 4 | UI_STRUCTURE / TYPESCRIPT | S |
| 21 | Code-quality rule sweep (14–16) | repo | ALL_TYPESCRIPT | M |

**Suggested first branch:** items 1, 2, 3, 4, 5 — the defects plus the cheap enforcement mechanisms, where "documented → enforced" is a small diff with outsized payoff.
