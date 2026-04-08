# Project-Level State Management

## Overview

Project state is scoped to a single project: modules, visualizations, reports, slide decks, dirty states, metrics, and project users. After Phase 2 of the SSE migration (`PLAN_SSE_STATE_MANAGEMENT.md`), project state will use the same global store + SSE pattern as instance state.

For instance-level state management, see `DOC_STATE_MGT_INSTANCE.md`.

> **Status:** The T1 section (SSE store) and Architecture table below describe the **target** architecture after SSE Phase 2 — this code does not exist yet. The T2, T3, T4, and T5 sections describe **existing** code.

## Architecture (target, after Phase 2)

5 files, one per concern — same structure as instance:

| Concern | File |
| --- | --- |
| Types (state shape, SSE events) | `lib/types/project_sse.ts` |
| Server notifications | `server/task_management/notify_project_updated.ts` |
| Server SSE endpoint | `server/routes/project/project-sse.ts` |
| Client state (store + getters) | `client/src/state/project/t1_store.ts` |
| Client SSE connection + boundary | `client/src/state/project/t1_sse.tsx` |

### Key difference from instance: reset on project switch

Instance state is a singleton — one store for the session. Project state must be fully reset when the user navigates between projects. `disconnectProjectSSE()` calls `resetProjectState()` which clears the entire store via `reconcile(EMPTY_PROJECT_STATE)`. Components gate rendering on `projectState.isReady`.

On reconnect *within* the same project, `isReady` is NOT reset — stale data stays visible while reconnecting. On project *switch*, `isReady` IS reset.

---

## Five Tiers

Every piece of project-level state belongs to exactly one tier. See `DOC_STATE_MGT_TIERS.md` for the full tier definitions, file naming conventions, and directory structure.

---

## Tier 1: SSE store (`ProjectState`)

Metadata and list data for the project. Pushed via SSE on every change. Components read directly from the store.

| Data | Fields on `ProjectState` | SSE event | Version key for T2 caches |
| --- | --- | --- | --- |
| Project config | `id`, `label`, `isLocked` | `project_config_updated` | — |
| Project datasets | `projectDatasets` | `datasets_updated` | — |
| Installed modules | `projectModules` | `modules_updated` | — |
| Metrics | `metrics` | `modules_updated` (derived from modules) | — |
| Common indicators | `commonIndicators` | `modules_updated` (derived) | — |
| Visualizations | `visualizations` | `visualizations_updated` | — |
| Visualization folders | `visualizationFolders` | `visualization_folders_updated` | — |
| Reports | `reports` | `reports_updated` | — |
| Slide decks | `slideDecks` | `slide_decks_updated` | — |
| Slide deck folders | `slideDeckFolders` | `slide_deck_folders_updated` | — |
| Project users | `projectUsers` | `project_users_updated` | — |
| Module dirty states | `moduleDirtyStates` | `module_dirty_state` | — |
| Module last run | `moduleLastRun`, `moduleLastRunGitRef` | `module_dirty_state` | `moduleLastRun[moduleId]` |
| Any running | `anyRunning` | `any_running` | — |
| R logs | `rLogs` | `r_script` | — |
| Per-entity timestamps | `lastUpdated` | `last_updated` | `lastUpdated[tableName][entityId]` |
| Current user permissions | `thisUserPermissions` | `project_users_updated` (re-derived) | — |

**Per-entity `lastUpdated` timestamps:** Unlike instance state, project T2 caches need per-entity versioning. For example, when a single presentation object is edited, only that PO's cache entry should invalidate — not all POs. The `lastUpdated` field is a nested record: `Record<LastUpdateTableName, Record<string, string>>`, where table names include `presentation_objects`, `reports`, `report_items`, `slides`, `slide_decks`, `modules`, `datasets`.

**Derived lookup maps:** `t1_store.ts` maintains internal lookup maps (`metricToModule`, `resultsObjectToModule`, `metricToFormatAs`) recomputed from `projectModules`/`metrics` whenever those fields update. Exported via getter functions (`getModuleIdForMetric()`, `getModuleIdForResultsObject()`, `getFormatAsForMetric()`). Used by T2 caches to resolve module-based version keys.

**Excluded from T1 — `aiContext`:** The project's AI context string is NOT included in `ProjectState`. It's unbounded (users can paste large documents) and is only consumed by the AI panel. Fetched independently when the AI panel opens (T3).

---

## Tier 2: Reactive cache

Heavy project data too large for SSE. Cached in memory + IndexedDB. Auto-invalidated by T1 `lastUpdated` timestamps or `moduleLastRun`.

| Data | File | Cache version key(s) | Why cached, not on SSE |
| --- | --- | --- | --- |
| PO detail (config, metadata) | `project/t2_presentation_objects.ts` | `lastUpdated.presentation_objects[poId]` | Full config object per PO |
| PO items (data rows) | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` (via resultsObjectId lookup) | Potentially thousands of rows |
| Metric info (results value info) | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` (via metricId lookup) | Per-metric results metadata |
| Replicant options | `project/t2_replicant_options.ts` | `moduleLastRun[moduleId]` (via resultsObjectId lookup) | Disaggregation options per fetch config |
| Report detail | `project/t2_reports.ts` | `lastUpdated.reports[reportId]` | Full report config |
| Report item | `project/t2_reports.ts` | `lastUpdated.report_items[reportItemId]` | Per-item config |
| Slide inputs (page layouts) | `project/t2_reports.ts` | `anyModuleLastRun` + `lastUpdated.reports` + `lastUpdated.report_items` | Composite — depends on module output + report/item config |
| Slide content | `project/t2_slides.ts` | `lastUpdated.slides[slideId]` | Full slide with blocks and metadata |
| Slide deck meta | `project/t2_slides.ts` | `lastUpdated.slide_decks[deckId]` | Deck label, plan, slide order |
| Image blobs | `project/t2_images.ts` | URL-based (not PDS-keyed) | Binary data, IndexedDB + memory |

**Image cache note:** `t2_images.ts` uses `TimCacheD` (IndexedDB) rather than `createReactiveCache`. It's URL-keyed with failure backoff, not PDS-versioned. It's T2 because it caches fetched data that persists across navigation, but its invalidation pattern is different from the other T2 caches.

---

## Tier 3: On-demand fetch

Fetched fresh from the server every time. Not cached, not reactive.

| Data | Component | Why T3, not T2 |
| --- | --- | --- |
| AI context string | `project_ai/index.tsx` | Unbounded size; only needed when AI panel opens |
| Module execution logs | `project/view_logs.tsx` | Audit data; should be fresh |
| Module R script source | `project/view_script.tsx` | On-demand modal; source code loaded on open |
| Module config selections | `project_module_settings/settings_generic.tsx` | Editor-only; loaded when settings panel opens |
| Module files | `project/view_files.tsx` | On-demand modal; file listing loaded on open |
| Project backup | `project/create_backup_form.tsx` | On-demand action; generates and downloads |
| Metric detail data | `project/metric_details_modal.tsx` | On-demand modal; detailed metric breakdown |

---

## Tier 4: Client-persistent state

State that originates on the client, persists across component mounts and navigation, but is NOT backed by the server.

| Data | File | Storage mechanism | Why T4, not T5 |
| --- | --- | --- | --- |
| AI documents (Anthropic file IDs) | `project/t4_ai_documents.ts` | IndexedDB (per project) | Persists across AI panel open/close; survives navigation |
| AI interpretations (per PO) | `project/t4_ai_interpretations.ts` | In-memory Solid store (24h TTL) | Persists across viz navigation; auto-cleanup after 24h |
| Long form editor mode | `project/t4_long_form_editor.ts` | Module-level signals | Persists editor UI mode across component remounts |

---

## Tier 5: Component-local state

Temporary UI state scoped to a single component. Dies on component unmount.

Examples: search text in visualization list, selected tab in project view, loading flags in modals, form inputs in settings editors, AI chat draft content, AI pending interactions.

No state files.

---

## Key Rules

Same rules as instance-level (`DOC_STATE_MGT_INSTANCE.md`), plus:

1. **Project state resets on project switch.** `disconnectProjectSSE()` clears the store, clears listeners, closes EventSource. No stale data from Project A leaks into Project B.
2. **Per-entity versioning via `lastUpdated`.** T2 caches use `lastUpdated[tableName][entityId]` as version keys. Editing one PO only invalidates that PO's cache entry.
3. **Derived maps are internal to `t1_store.ts`.** Module lookup maps (`metricToModule`, etc.) are recomputed from T1 state and exposed via getter functions. No separate file.
4. **`aiContext` is always T3.** Never put unbounded user content in the T1 store.
