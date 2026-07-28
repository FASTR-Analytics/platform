# Plan: Make the System Docs & Protocols Enforce, Not Just Describe

A code-tightening backlog surfaced while writing the server architecture docs
(then `DOC_*.md`, since consolidated into the `SYSTEM_NN_*.md` files —
renamed from PLAN_DOC_ENFORCEMENT.md 2026-07-17, item numbers unchanged; 13
cross-references cite them). The docs lean descriptive _as written_; this
plan is the work that turns their "Rules" into things that actually fail when
violated — plus the real defects the review found along the way.

**Status refresh 2026-07-17:** items 3, 14 done; item 11 mostly done; item
21 partially done — details inline. Everything else verified still open
against the tree. **Scope ruling (same day): this plan holds only
cross-cutting enforcement mechanisms and consolidation.** Plain bug fixes
moved to their owning SYSTEM's Open items: item 1 closed (health read
surface ruled public-by-design, SYSTEM_15; the mutating reset endpoint got
its status-api-key guard), item 2 → SYSTEM_08 (boot recovery sweep), item 7
→ SYSTEM_08 (R interpolation), item 13 → SYSTEM_07 (retry classification).
Item numbers of remaining entries unchanged (cross-references cite them).

**Framing:** a doc is only a _protocol_ if its rule is backed by a mechanism
that makes the wrong thing fail (a startup check, a `CHECK` constraint, a lint,
or a shared helper that removes the choice). Tier 2 is "add the mechanism that
makes a doc enforceable (and kills a bug class)." Tier 3 is "consolidate to
remove drift risk." Tier 4 is client file-organisation alignment to
`panther/protocols/PROTOCOL_UI_STRUCTURE.md`, and a final repo-wide sweep
applies the `PROTOCOL_ALL_TYPESCRIPT` code-quality rules. (One-off bug fixes
do NOT live here — they belong to their owning SYSTEM's Open items; the former
Tier 1 was dissolved accordingly, see the status note above.)

(Tiers 2–3 are server, surfaced by the original server-doc review; Tier 4 +
the sweep came out of the frontend/protocol discussion and align the code to
the panther protocols, client included.)

Work top-down: the cheap Tier-2 items (4, 5) → the rest. Each item notes the
owning doc so the fix and the doc stay in sync.

---

## Tier 2 — Turn a doc into an enforced protocol (each also kills a bug class)

- [x] **3. `validateAllRoutesDefined` should fail, not warn.** **DONE
      2026-06-12** (via the API-routes hardening pass, plan deleted): boot now
      `Deno.exit(1)`s on missing/extra routes and additionally checks registry
      key collisions and duplicate `method+path` pairs. See
      SYSTEM_01_api_contract.md §Startup validation.

- [ ] **4. Startup guard-audit: every registered route is guarded or explicitly
      public.** Classify each route registered via `defineRoute` as having a
      permission guard or an explicit `/* PUBLIC */` marker; fail boot on an
      unclassified route. Permanently closes the `health.ts`-style class
      (item 1) and any future omission. **Files:**
      `server/routes/route-tracker.ts` (extend the tracker), `main.ts` (run
      after mounting). **Doc:**
      [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md).

- [ ] **5. `CHECK` constraint on `modules.dirty`.** Constrain to
      `('queued','ready','error')`. `getModuleDirtyOrRunning` already throws on
      any other value, so today a stray write silently breaks a project's
      dirty-state read. Add an idempotent migration (see
      [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) for the
      `DO $$ … pg_constraint` pattern). **Files:**
      `server/db/migrations/project/`, `_project_database.sql`. **Doc:**
      [SYSTEM_08_module_system.md](SYSTEM_08_module_system.md).

- [ ] **6. One bulk-escape helper; ban hand-built `VALUES`.** Bulk `VALUES`
      escaping is uniform `''`-doubling, but implemented twice: HFA via the
      shared `escapeSqlString` (`server/db/utils.ts`), HMIS/structure inline.
      One shared helper + a lint/grep ban on manual tuple escaping keeps the
      implementations from drifting. (A parameterized/COPY bulk-insert helper
      was sketched in the now-deleted PLAN_IMPORTER_CONSOLIDATION toolkit plan —
      superseded by PLAN_DHIS2_IMPORTER_CONSOLIDATION.md, which wraps rather
      than rewrites the insert paths; the escaping-dedup idea here stands on its
      own.) **Files:**
      `server/server_only_funcs_importing/stage_structure_from_csv.ts`,
      `server/worker_routines/stage_hmis_data_csv/worker.ts`. **Docs:**
      [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md),
      [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) (owns the SQL-safety
      rule).

---

## Tier 3 — Consolidation that removes drift risk

- [ ] **8. Shared `runWorker()` wrapper.** The worker-entry preamble
      (`onmessage → run().catch(reportError+close)`, `postMessage("READY")`,
      `alreadyRunning` guard) is hand-copied into 6 worker files with subtle
      divergence. Factor it (the companion teardown fixes shipped 2026-07-02).
      **Files:** `server/worker_routines/*/worker.ts`,
      `instantiate_worker_generic.ts`. **Doc:**
      [PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md).

- [ ] **9. Single cache key-builder + one separator.** The six `TimCacheC`
      caches use three separators (`|`, `::`, `_`) and compute the key twice (in
      `*FromParams` and `parseData`); a one-char drift silently drops every
      write, and `cache_status` reverse-parses by a hard-coded separator.
      **Fix:** one shared key-builder per cache used by both paths, one reserved
      separator. **Files:** `server/routes/caches/{visualizations,dataset}.ts`,
      `server/valkey/cache_class_C.ts`. **Doc:**
      [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

- [ ] **10. Route all CTE construction through `CTEManager`.**
      `get_possible_values.ts` and `get_period_bounds.ts` hand-write their own
      `WITH period_data` / `facility_subset` strings (always deriving all three
      period columns), which breaks on `quarter_id`-only tables and duplicates
      the CTE shape across three files. **Files:**
      `server/server_only_funcs_presentation_objects/{get_possible_values,get_period_bounds,cte_manager}.ts`.
      **Doc:** [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

- [ ] **11. Ban raw `Deno.env.get` outside `exposed_env_vars.ts`.** MOSTLY
      DONE (verified 2026-07-17): the four AI-route sites now use
      `_ANTHROPIC_API_KEY`. Remaining: two stragglers
      (`server/middleware/cors.ts` reads `CLIENT_ORIGIN`,
      `server/valkey/connection.ts` reads `VALKEY_URL` — move both into
      `exposed_env_vars.ts`) and the enforcement mechanism itself (lint/grep
      rule against `Deno.env.get` outside `exposed_env_vars.ts`) was never
      added. **Docs:** [SYSTEM_00_kernel.md](SYSTEM_00_kernel.md),
      [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

- [ ] **12. Collapse the `notify_last_updated` indirection.**
      `notifyLastUpdated` → `notifyProjectLastUpdatedV2` → `notifyProjectV2` is
      three layers for one event (the middle layer has no other callers). Pick
      the layer call sites use; remove the rest. (Bundle with retiring the
      vestigial `_v2` naming if doing a rename pass.) **Files:**
      `server/task_management/notify_{last_updated,project_v2}.ts`. **Doc:**
      [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

---

## Tier 4 — Client file organisation (align `components/` to `PROTOCOL_UI_STRUCTURE`)

> Opportunistic, low-churn — do these when you're already editing the area, not
> as a big-bang reorg PR (per the earlier call). The tree already mostly mirrors
> the UI; these are the exceptions.

- [ ] **18. Relocate the loose-at-root components.** ~13 PascalCase components
      sit loose at the `components/` root (`PeriodSelector`, `NotAvailableBox`,
      `ConnectionStatus`, `DirtyStatus`, `Conflicts`, `ReplicateByOptions`,
      `TimeIndexSelector`, `WindowingSelector`, `PresentationObjectMiniDisplay`,
      `PresentationObjectPanelDisplay`, `Dhis2CredentialsEditor`,
      `PasswordGate`, `LoggedInWrapper`), plus `email_opt_in_modal.tsx`,
      `organisation_modal.tsx`, and the loose `_*.ts(x)` helpers. Move each to
      **its feature folder** if it's single-area (e.g.
      `ReplicateByOptions`/`WindowingSelector` → `visualization/`), or to
      **`_shared/`** if genuinely cross-area (`PeriodSelector`,
      `NotAvailableBox`). Exception: `PasswordGate` is dead code (SYSTEM_12
      Open items) — delete it, don't relocate it. "Loose at root" is not a
      location. **Files:**
      `client/src/components/`. **Protocol:** `PROTOCOL_UI_STRUCTURE` (rules
      2–3, "where does X go?" table).

- [ ] **19. Collapse the `instance_dataset_*` prefix-explosion.** Six siblings
      (`instance_dataset_{hfa,hmis,iceh}` × `_import`) → one nested domain
      folder `instance_dataset/{hfa,hmis,iceh}/{view,import}`. **Files:**
      `client/src/components/instance_dataset_*`. **Protocol:**
      `PROTOCOL_UI_STRUCTURE` (rule 5, nest facets — don't suffix).

- [ ] **20. snake_case component filenames.** Rename PascalCase files
      (`PeriodSelector.tsx` → `period_selector.tsx`, …) as they move in item 18.
      **Files:** `client/src/components/`. **Protocol:**
      `PROTOCOL_ALL_TYPESCRIPT` (naming) + `PROTOCOL_UI_STRUCTURE` (rule 8).

---

## Repo-wide — code-quality rule sweep (client + server)

- [ ] **21. Sweep for the new `PROTOCOL_ALL_TYPESCRIPT` rules 14–16.**
      (Partially done, verified 2026-07-17:
      `QueryConfigV2`/`buildCombinedQueryV2` no longer exist anywhere.)
  - **No vestigial versioning:** `_v2` SSE route/channel/file +
    `notifyProjectLastUpdatedV2`, `goal1_org_units_v2` (dhis2) — rename to the
    unsuffixed name with a deliberate one-time migration; check the client for
    `vN` too.
  - **No dead code:** delete commented-out back-compat functions and "old
    version" breadcrumbs (notably in the PO query pipeline).
  - **No silent failures:** the scattered `.catch(() => {})` — await, or log the
    failure. Spans client and server. Overlaps items 10 and 12. **Protocol:**
    `PROTOCOL_ALL_TYPESCRIPT` 14–16.

---

## Smaller / lower-priority

- [x] **14. Gate DHIS2 worker credential/URL logging** — RESOLVED: the HMIS
      DHIS2 staging worker no longer logs credentials and routes analytics
      through `getAnalyticsFromDHIS2` (verified 2026-07-14); the remaining
      unconditional URL log is `dhis2ConfirmCredentials` (S7 Open items).
- [ ] **15. Decide the `READ_ONLY` connection flag** — make it real
      (`default_transaction_read_only`) or rename it to "cache-namespacing only"
      (today it doesn't prevent writes). **Doc:**
      [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md).
- [ ] **16. Consolidate `generateUnique*Id`** (7 near-identical copies) into
      `generateUniqueId(db, tableName)`. **Doc:** SYSTEM_02_persistence.md.

---

## Summary

(Items 1, 2, 7, 13 no longer live here — closed or moved to SYSTEM Open
items, see the status note. Numbering is stable; 17 never existed.)

| #     | Item                                                       | Tier | Owning doc                   | Effort |
| ----- | ---------------------------------------------------------- | ---- | ---------------------------- | ------ |
| 3     | `validateAllRoutesDefined` fails not warns (done)          | 2    | SYSTEM_01                    | —      |
| 4     | Startup guard-audit                                        | 2    | SYSTEM_01                    | M      |
| 5     | `CHECK` on `modules.dirty`                                 | 2    | SYSTEM_08                    | S      |
| 6     | One bulk-escape helper                                     | 2    | SYSTEM_06, SYSTEM_02         | M      |
| 8     | Shared `runWorker()` wrapper                               | 3    | PROTOCOL_APP_WORKER_ROUTINES | M      |
| 9     | Shared cache key-builder / separator                       | 3    | SYSTEM_03                    | M      |
| 10    | CTEs through `CTEManager`                                  | 3    | SYSTEM_09                    | M      |
| 11    | Ban raw `Deno.env.get` (mostly done — 2 stragglers + lint) | 3    | SYSTEM_00, SYSTEM_13         | S      |
| 12    | Collapse notify indirection                                | 3    | SYSTEM_03                    | S      |
| 14–16 | Smaller items (14 done)                                    | —    | various                      | S      |
| 18    | Relocate loose-at-root components                          | 4    | PROTOCOL_UI_STRUCTURE        | M      |
| 19    | Collapse `instance_dataset_*`                              | 4    | PROTOCOL_UI_STRUCTURE        | M      |
| 20    | snake_case component filenames                             | 4    | PROTOCOL_UI_STRUCTURE        | S      |
| 21    | Code-quality rule sweep (14–16, partial)                   | repo | PROTOCOL_ALL_TYPESCRIPT      | M      |

**Suggested first branch:** items 4 and 5 — the cheap enforcement mechanisms,
where "documented → enforced" is a small diff with outsized payoff.
