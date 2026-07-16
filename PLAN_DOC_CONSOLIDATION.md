# Plan — Port the remaining `DOC_*` prose into the `SYSTEM_*` files

> The scaffold (SYSTEM stubs + glob manifests + `lint_systems.ts` + SYSTEMS.md)
> is live, and the documentation model this port follows is SYSTEMS.md §6.
> What remains is the prose port: each system's first review cycle inlines its
> `docs_absorbed` `DOC_*` content into the SYSTEM file — you're verifying the doc
> against code anyway, so staleness gets fixed in the same motion — then
> `git rm`s the absorbed `DOC_*` files and fixes that system's §2 staleness items
> in the same commit. Done so far: S6 (DOC_IMPORT_PIPELINE, 2026-07-02), S5
> (written fresh, 2026-07-02), S9 (DOC_PRESENTATION_OBJECT_QUERY_PIPELINE +
> DOC_period_column_handling + DOC_DISAGGREGATION_OPTIONS_HANDLING +
> DOC_ROLLUP_ROWS, 2026-07-06), S13 (DOC_AI_PROXY_AND_USAGE_GOVERNANCE +
> DOC_AI_TOOL_SCHEMAS → SYSTEM_13 + new PROTOCOL_APP_AI_TOOLS, 2026-07-07;
> review-only cycle — findings are S13 Open items, no fix batch yet), S7
> (DOC_DHIS2_INTEGRATION, 2026-07-14; review-only cycle — findings are S7
> Open items), PROTOCOL_APP_STATE (DOC_STATE_RULES + 3× DOC_STATE_MGT_*,
> 2026-07-16; claims verified against code, generic rules deferred to panther
> PROTOCOL_UI_STATE/_SOLIDJS; review-only — code findings are its Open items),
> S3 (DOC_SSE_REALTIME + DOC_VALKEY_CACHE, 2026-07-16; review-only — findings
> are S3 Open items), S1 (DOC_API_ROUTES + DOC_ACCESS_CONTROL → SYSTEM_01 +
> new PROTOCOL_APP_ROUTES, 2026-07-16; review-only — findings are S1 Open
> items; corrections folded in: raw-route inventory completed, authError is
> 401-only, 7 instance permission keys, H_USERS = 9).
> This plan deletes itself when the last `DOC_*` is gone.

## 1. `DOC_*` → target mapping (3-way sort)

When porting a hybrid DOC_*: architecture/behaviour/contract → its SYSTEM_NN;
app-specific authoring recipe → a `PROTOCOL_APP_*` (new or existing); a generic
construction rule → defer to the panther `PROTOCOL_*`, do NOT restate it.

| DOC_* | Architecture → | Recipe → (PROTOCOL_APP) | Defer to panther |
|---|---|---|---|
| DOC_API_ROUTES | S1 | PROTOCOL_APP_ROUTES (add-a-route recipe) | — |
| DOC_ACCESS_CONTROL | S1 | — (also informs S15) | — |
| DOC_DB_ACCESS_LAYER | S2 | (SQL-safety rule may join PROTOCOL_APP_MIGRATIONS or a DB protocol) | — |
| DOC_SSE_REALTIME | S3 (also §4.3.1 audit) | — | — |
| DOC_VALKEY_CACHE | S3 (informs S9) | — | — |
| DOC_STATE_RULES + 3× DOC_STATE_MGT_* | — | PROTOCOL_APP_STATE (tiers + rules + inventory; DONE 2026-07-16) | **PROTOCOL_UI_STATE / _SOLIDJS** (generic rules) |
| DOC_TASK_EXECUTION_DIRTY_STATE | S8 | — | — |
| DOC_WORKER_ROUTINES | S8 (informs S6) | PROTOCOL_APP_WORKER_ROUTINES (write-a-worker recipe) | — |
| DOC_MODULE_EXECUTION | S8 | — | — |
| DOC_MODULE_UPDATES | S8 | — | — |
| DOC_POPULATION_CSV | S8 (informs S5) | — | — |
| DOC_DHIS2_INTEGRATION | S7 | — | — |
| DOC_AI_PROXY_AND_USAGE_GOVERNANCE | S13 | — | — |
| DOC_AI_TOOL_SCHEMAS | S13 | PROTOCOL_APP_AI_TOOLS (author-a-tool-schema recipe) | — |
| DOC_PRESENTATION_OBJECT_QUERY_PIPELINE | S9 | — | — |
| DOC_period_column_handling | S9 (also §4.3.5 audit) | — | — |
| DOC_DISAGGREGATION_OPTIONS_HANDLING | S9 (informs S5) | — | — |
| DOC_ROLLUP_ROWS | S9 | — | — |
| DOC_SPECIAL_CHART_MODES | S10 | — | — |
| DOC_DESIGN_SYSTEM | — | PROTOCOL_APP_UI_CONVENTIONS (app tokens/patterns) — or fold into S14 | **PROTOCOL_UI_STYLING / _COMPONENTS** |
| DOC_BUILD_INSTRUCTIONS | — | PROTOCOL_APP_UI_CONVENTIONS — or fold into S14 | **PROTOCOL_UI_STRUCTURE** |
| DOC_TRANSLATION | S14 (also §4.3.6 audit) | — | **PROTOCOL_ALL_TRANSLATION** |
| DOC_HELP_BUTTONS | S14 | PROTOCOL_APP_HELP_BUTTONS (add-a-help-button recipe) | — |
| DOC_ACCESS_DBS | S15 (informs S2) | — | — |

No DOC_* to absorb (SYSTEM file written fresh from code in the cycle): **S4**
(Assets & Upload), **S12** (Documents & Sharing — the largest doc gap), S11
(partial coverage only).

## 2. Doc staleness to fix during the port

Known-stale items from the systems review; each dissolves when the owning
DOC_* is inlined during its cycle.

- **CLAUDE.md:** `server/visualization_definitions/` doesn't exist (viz query
  code is `server_only_funcs_presentation_objects/`; the phantom `server/ai/`
  entry was fixed in the S13 cycle); `client/src/export_report` is now
  `client/src/exports/`; dataset-import progress is POLLED, not SSE; "i18n
  built from XLSX" is wrong per DOC_TRANSLATION; `state/ui.ts` and
  `components/project_runner/provider.tsx` are phantoms (real: `state/t4_ui.ts`,
  `components/project/index.tsx` area).
- Minor: DOC_BUILD_INSTRUCTIONS/DOC_DESIGN_SYSTEM cite
  `panther/FRONTEND_STYLE_GUIDE.md` (real: `client/src/FRONTEND_STYLE_GUIDE.md`);
  DOC_MODULE_UPDATES uses spec-style `:projectId` paths; DOC_ACCESS_DBS cites a
  deleted diagnostic script.

## 3. Deferred Phase-1 step

Point CLAUDE.md's per-area prose at SYSTEMS.md — do once enough SYSTEM files
hold real prose that readers aren't sent to stubs.

## 4. Open decisions for Tim

1. **`CROSS_*` set** — RULED 2026-07-16: no CROSS category; the doc set is
   `PROTOCOL_*` / `PLAN_*` / `SYSTEM_*` only. State docs shipped as
   PROTOCOL_APP_STATE. Remaining sub-decision: DOC_DESIGN_SYSTEM +
   DOC_BUILD_INSTRUCTIONS → a PROTOCOL_APP_UI_CONVENTIONS, or fold into S14?
2. **`PROTOCOL_APP_*` naming/scope** — confirm the token and repo-root location
   (vs a `protocols_app/` dir, or `GUIDE_*`). PROTOCOL_APP_MIGRATIONS already
   exists as the precedent.
3. **Cross-cutting audits** — they live as the §4.3 list in SYSTEMS.md; confirm
   that is enough, or does any want its own file (densest candidate: the
   notify/stamp + version-hash invalidation audit)?
