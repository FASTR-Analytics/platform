# Plan: Client State Directory Restructure

## Goal

After this restructure, ALL state management code in `client/src/` lives under `client/src/state/`. The `components/` directory is purely UI. No state management code lives in `utils/`, `components/`, or anywhere else.

Every file in `state/` has an unambiguous home, and the file tree itself tells you what each file does — its scope (instance vs project), its tier (from `DOC_STATE_MGT_INSTANCE.md`), and its data domain. Looking at the directory listing should be equivalent to reading the state management doc.

This plan interleaves with `PLAN_SSE_STATE_MANAGEMENT.md`. Phase 1 (instance SSE) is complete. The restructure is sequenced to avoid moving files that SSE Phase 2 will rewrite or delete.

### State code currently outside `state/`

State management code currently lives in three places — this restructure collapses them into one:

| Current location | What it is | Destination |
|---|---|---|
| `client/src/state/` | Instance state, project caches, cache infra, UI state | Reorganized in place |
| `client/src/components/project_runner/` | Project-level state: Context/Provider, SSE connection, store, global PDS reference, module lookup maps (`provider.tsx`, `context.tsx`, `hooks.tsx`, `global_pds.ts`, `global_module_maps.ts`) | `state/project/t1_store.ts` + `state/project/t1_sse.tsx` (via SSE Phase 2) |
| `client/src/utils/connection-monitor.ts` | Global connection status signals (`isOnline`, `connectionIssues`) + failure tracking | `state/t4_connection_monitor.ts` (move to state root) |

After the restructure, `components/project_runner/` is deleted entirely and `utils/connection-monitor.ts` moves to `state/`. The remaining files in `utils/` (`id_generation.ts`, `request_queue.ts`, `snapshot.ts`) are genuine utilities with no application state — they stay.

**Not state (verified, stays where it is):**
- `components/LoggedInWrapper.tsx` — Clerk instance is app bootstrap infrastructure, not application state
- `utils/request_queue.ts` — concurrency control (RequestQueue class), holds no application state
- `generate_visualization/conditional_formatting_scorecard.ts` — read-only config maps, never mutated

## Design Principles

### Tier prefix naming

Every state file is prefixed with its tier number from the state management docs (`DOC_STATE_MGT_INSTANCE.md`). No file is unprefixed — if it holds state, it has a tier.

- **`t1_`** — Tier 1: SSE store. The `createStore`, setters, getters, and the SSE connection manager + boundary component. Lightweight metadata pushed via SSE on every change. Components read directly from the store — no fetching, no loading states.
- **`t2_`** — Tier 2: Reactive cache. Medium-to-heavy data too large for SSE but still reactive. Cached in memory + IndexedDB. A `createEffect` watches version keys from the T1 store; when SSE pushes a new version, the cache misses and fresh data is fetched automatically.
- **`t4_`** — Tier 4: Client-persistent state. Originates on the client, persists across navigation and component mounts. Stored in localStorage, sessionStorage, or module-level signals/stores that outlive any single component.

Tiers 3 and 5 (on-demand server fetches and component-local signals) don't have dedicated state files — those patterns live inside components by definition. No empty directories or placeholder files.

### Sort order

Within each directory, files sort naturally by tier then by domain:

```
t1_sse.tsx                            ← tier 1 group
t1_store.ts
t2_datasets.ts                        ← tier 2 group, alphabetical by domain
t2_geojson.ts
t2_indicators.ts
t2_structure.ts
t4_dhis2_session.ts                   ← tier 4 group
```

Tier 1 files group together, tier 2 files group together, tier 4 files group together, and within each tier files sort by data domain.

### One file per data domain

Each tier 2 file maps to exactly one logical data domain. The current `instance_data_caches.ts` bundles three unrelated caches (indicators, HFA indicators, structure) — these split into separate files. Cache instance definitions merge with their access functions (no more split between "here's the cache" and "here's how to use it").

### Scope directories

The top-level split is by scope: `instance/` for instance-level state, `project/` for project-level state. Every file goes in exactly one. Cross-cutting infrastructure (`reactive_cache.ts`, `indexeddb_cache.ts`) goes in `_infra/`. Global UI preferences (`ui.ts`) and cache clearing (`clear_caches.ts`) stay at the `state/` root.

---

## Target Structure (End State)

```
client/src/state/
│
├── instance/
│   ├── t1_sse.tsx                        ← SSE connection manager + InstanceSSEBoundary
│   ├── t1_store.ts                       ← createStore<InstanceState>, setters, getters
│   ├── t2_datasets.ts                    ← HMIS + HFA display item caches
│   ├── t2_geojson.ts                     ← GeoJSON map data cache (IndexedDB + memory)
│   ├── t2_indicators.ts                  ← common indicators + HFA indicators caches
│   ├── t2_structure.ts                   ← structure items cache (facilities, admin areas)
│   └── t4_dhis2_session.ts              ← DHIS2 credentials in sessionStorage
│
├── project/
│   ├── t1_sse.tsx                        ← SSE connection manager + ProjectSSEBoundary
│   ├── t1_store.ts                       ← createStore<ProjectState>, setters, getters, derived maps
│   ├── t2_images.ts                      ← image blob cache (IndexedDB via TimCacheD)
│   ├── t2_presentation_objects.ts        ← PO detail + items + metric info caches + access functions
│   ├── t2_replicant_options.ts           ← replicant options cache + access function
│   ├── t2_reports.ts                     ← report detail + report item + slide inputs caches + access functions
│   ├── t2_slides.ts                      ← slide + slide deck meta caches
│   ├── t4_ai_documents.ts               ← client-only IndexedDB (Anthropic file IDs per project)
│   ├── t4_ai_interpretations.ts          ← client-only Solid store (AI interpretation per PO, 24h TTL)
│   └── t4_long_form_editor.ts            ← client-only signals (editor UI mode persistence)
│
├── _infra/
│   ├── indexeddb_cache.ts                ← TimCacheD class (IndexedDB storage layer)
│   └── reactive_cache.ts                 ← createReactiveCache (version-keyed caching with PDS)
│
├── clear_caches.ts                       ← clearDataCache() + clearAiChatCache() utilities (not state — utility)
├── t4_connection_monitor.ts              ← global online/offline signals + failure tracking
└── t4_ui.ts                              ← global UI preferences (project tab, nav, viz modes — localStorage)
```

---

## File-by-File Mapping

### Instance files

| New file | Old file(s) | Change type |
|---|---|---|
| `instance/t1_store.ts` | `instance_state.ts` | Move + rename |
| `instance/t1_sse.tsx` | `instance_sse.tsx` | Move + rename |
| `instance/t2_datasets.ts` | `dataset_cache.ts` | Move + rename |
| `instance/t2_geojson.ts` | `caches/geojson_cache.ts` | Move + rename |
| `instance/t2_indicators.ts` | `instance_data_caches.ts` (indicators + HFA indicators sections) | Split: extract indicators + HFA indicators caches |
| `instance/t2_structure.ts` | `instance_data_caches.ts` (structure section) | Split: extract structure cache |
| `instance/t4_dhis2_session.ts` | `dhis2-session-storage.ts` | Move + rename |

**Split detail — `instance_data_caches.ts`:**

Currently has three `createReactiveCache` instances and three `getXFromCacheOrFetch` functions bundled together. Split into:

- `t2_indicators.ts` gets `_INDICATORS_CACHE` + `getIndicatorsFromCacheOrFetch` + `_HFA_INDICATORS_CACHE` + `getHfaIndicatorsFromCacheOrFetch`. Both are indicator data from the same conceptual domain.
- `t2_structure.ts` gets `_STRUCTURE_ITEMS_CACHE` + `getStructureItemsFromCacheOrFetch`.

### Project files

| New file | Old file(s) | Change type |
|---|---|---|
| `project/t1_store.ts` | NEW (SSE Phase 2) | Created by Phase 2 — replaces `components/project_runner/provider.tsx`, `context.tsx`, `hooks.tsx`, `global_pds.ts`, `global_module_maps.ts` |
| `project/t1_sse.tsx` | NEW (SSE Phase 2) | Created by Phase 2 — SSE connection + ProjectSSEBoundary |
| `project/t2_presentation_objects.ts` | `po_cache.ts` + `caches/visualizations.ts` | Merge: cache instances + access functions into one file |
| `project/t2_replicant_options.ts` | `replicant_options_cache.ts` + part of `caches/visualizations.ts` | Merge: `_REPLICANT_OPTIONS_CACHE` instance moves from visualizations.ts |
| `project/t2_reports.ts` | `ri_cache.ts` + `caches/reports.ts` | Merge: cache instances + access functions into one file |
| `project/t2_slides.ts` | `caches/slides.ts` | Move + rename (already self-contained) |
| `project/t2_images.ts` | `img_cache.ts` | Move + rename |
| `project/t4_ai_documents.ts` | `ai_documents.ts` | Move + rename |
| `project/t4_ai_interpretations.ts` | `ai_interpretations.ts` | Move + rename |
| `project/t4_long_form_editor.ts` | `long_form_editor.ts` | Move + rename |

**Merge detail — `caches/visualizations.ts` dissolves:**

Currently defines 4 cache instances (`_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE`, `_REPLICANT_OPTIONS_CACHE`) that are imported by `po_cache.ts` and `replicant_options_cache.ts` for their access functions. This separation serves no purpose. In the new structure:

- `_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE` → merge into `t2_presentation_objects.ts` alongside all access functions from `po_cache.ts`
- `_REPLICANT_OPTIONS_CACHE` → merge into `t2_replicant_options.ts` alongside the access function from `replicant_options_cache.ts`

**Merge detail — `caches/reports.ts` dissolves:**

Currently defines 3 cache instances (`_REPORT_DETAIL_CACHE`, `_REPORT_ITEM_CACHE`, `_SLIDE_INPUTS_CACHE`) imported by `ri_cache.ts`. Merge into `t2_reports.ts` — cache instances + access functions in one file.

### Infrastructure files

| New file | Old file(s) | Change type |
|---|---|---|
| `_infra/reactive_cache.ts` | `caches/reactive_cache.ts` | Move |
| `_infra/indexeddb_cache.ts` | `caches/cache_class_D_indexeddb.ts` | Move + rename |

### Root state files (stay at `state/`)

| File | Change |
|---|---|
| `t4_ui.ts` | Rename from `ui.ts` — global UI preferences, cross-cutting |
| `t4_connection_monitor.ts` | Move from `utils/connection-monitor.ts` + rename — global online/offline signals + failure tracking |
| `clear_caches.ts` | Rename from `clear_data_cache.ts` — update import of `clearGeoJsonMemoryCache` to new path. Not state — utility that operates on caches. No tier prefix. |

### Deleted

| Old file/dir | Reason |
|---|---|
| `caches/visualizations.ts` | Dissolved into `project/t2_presentation_objects.ts` + `project/t2_replicant_options.ts` |
| `caches/reports.ts` | Dissolved into `project/t2_reports.ts` |
| `caches/slides.ts` | Moved to `project/t2_slides.ts` |
| `caches/geojson_cache.ts` | Moved to `instance/t2_geojson.ts` |
| `caches/reactive_cache.ts` | Moved to `_infra/reactive_cache.ts` |
| `caches/cache_class_D_indexeddb.ts` | Moved to `_infra/indexeddb_cache.ts` |
| `caches/_archived/` | Delete (archived code, no longer needed) |
| `caches/` directory | Empty after all moves — delete |
| `instance_state.ts` | Moved to `instance/t1_store.ts` |
| `instance_sse.tsx` | Moved to `instance/t1_sse.tsx` |
| `instance_data_caches.ts` | Split into `instance/t2_indicators.ts` + `instance/t2_structure.ts` |
| `dataset_cache.ts` | Moved to `instance/t2_datasets.ts` |
| `dhis2-session-storage.ts` | Moved to `instance/t4_dhis2_session.ts` |
| `po_cache.ts` | Merged into `project/t2_presentation_objects.ts` |
| `ri_cache.ts` | Merged into `project/t2_reports.ts` |
| `replicant_options_cache.ts` | Merged into `project/t2_replicant_options.ts` |
| `img_cache.ts` | Moved to `project/t2_images.ts` |
| `ai_documents.ts` | Moved to `project/t4_ai_documents.ts` |
| `ai_interpretations.ts` | Moved to `project/t4_ai_interpretations.ts` |
| `long_form_editor.ts` | Moved to `project/t4_long_form_editor.ts` |
| `ui.ts` | Renamed to `t4_ui.ts` |
| `clear_data_cache.ts` | Renamed to `clear_caches.ts` |

---

## Import Path Changes

The `~` alias resolves to `client/src/`. All import paths in the codebase that reference state files need updating. The changes are mechanical find-replace operations.

### Instance (Reorg Step 1)

These happen now. Approximate import site counts:

| Old import path | New import path | ~Sites |
|---|---|---|
| `~/state/instance_state` | `~/state/instance/t1_store` | ~100+ |
| `~/state/instance_sse` | `~/state/instance/t1_sse` | ~2 |
| `~/state/instance_data_caches` | `~/state/instance/t2_indicators` or `~/state/instance/t2_structure` | ~5 |
| `~/state/dataset_cache` | `~/state/instance/t2_datasets` | ~2 |
| `~/state/caches/geojson_cache` | `~/state/instance/t2_geojson` | ~3 |
| `~/state/dhis2-session-storage` | `~/state/instance/t4_dhis2_session` | ~3 |
| `~/state/caches/reactive_cache` | `~/state/_infra/reactive_cache` | ~5 |
| `~/state/caches/cache_class_D_indexeddb` | `~/state/_infra/indexeddb_cache` | ~2 |
| `~/state/clear_data_cache` | `~/state/clear_caches` | ~2 |
| `~/utils/connection-monitor` | `~/state/t4_connection_monitor` | ~3 |
| `~/state/ui` | `~/state/t4_ui` | ~10+ |

For the `instance_data_caches` split: find each import, check which functions are used (`getIndicatorsFromCacheOrFetch` / `getHfaIndicatorsFromCacheOrFetch` → `t2_indicators`, `getStructureItemsFromCacheOrFetch` → `t2_structure`), update accordingly.

### Project (Reorg Step 2, after Phase 2)

These happen after SSE Phase 2 is complete. Phase 2 will have already rewritten imports from `~/components/project_runner/hooks` → `~/state/project/t1_store`, so the project cache files will already reference the new store. The remaining work:

| Old import path | New import path |
|---|---|
| `~/state/po_cache` | `~/state/project/t2_presentation_objects` |
| `~/state/ri_cache` | `~/state/project/t2_reports` |
| `~/state/replicant_options_cache` | `~/state/project/t2_replicant_options` |
| `~/state/caches/visualizations` | dissolved — imports come from `~/state/project/t2_presentation_objects` or `~/state/project/t2_replicant_options` |
| `~/state/caches/reports` | dissolved — imports come from `~/state/project/t2_reports` |
| `~/state/caches/slides` | `~/state/project/t2_slides` |
| `~/state/img_cache` | `~/state/project/t2_images` |
| `~/state/ai_documents` | `~/state/project/t4_ai_documents` |
| `~/state/ai_interpretations` | `~/state/project/t4_ai_interpretations` |
| `~/state/long_form_editor` | `~/state/project/t4_long_form_editor` |

---

## Key Dependencies Between Files

Understanding these prevents breaking changes during the restructure:

### Instance state → instance caches (tier 1 → tier 2)

Tier 2 caches read version keys from the tier 1 store. Components call cache access functions inside `createEffect` blocks that reactively read `instanceState.indicatorMappingsVersion`, `instanceState.datasetVersions.hmis`, etc. The tier 2 files import getter functions from the tier 1 store for non-reactive access.

### Cache instances → access functions (currently split, will merge)

- `caches/visualizations.ts` exports `_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE`, `_REPLICANT_OPTIONS_CACHE` → imported by `po_cache.ts` and `replicant_options_cache.ts`
- `caches/reports.ts` exports `_REPORT_DETAIL_CACHE`, `_REPORT_ITEM_CACHE`, `_SLIDE_INPUTS_CACHE` → imported by `ri_cache.ts`

After the merge, these cross-file imports disappear. Each `t2_` file is self-contained.

### `caches/visualizations.ts` → `global_module_maps.ts`

`caches/visualizations.ts` imports `getModuleIdForMetric` and `getModuleIdForResultsObject` from `~/components/project_runner/global_module_maps`. SSE Phase 2 deletes `global_module_maps.ts` and moves these functions into `project/t1_store.ts`. This is why project cache files must not be moved until after Phase 2 — the import will change.

### `clear_caches.ts` → `t2_geojson.ts`

`clear_data_cache.ts` imports `clearGeoJsonMemoryCache` from `caches/geojson_cache`. After the move, this becomes an import from `instance/t2_geojson`.

### `po_cache.ts` → `generate_visualization/mod.ts`

`po_cache.ts` imports `getFigureInputsFromPresentationObject` from the visualization generation module. This dependency crosses the `state/` ↔ `generate_visualization/` boundary. The import path doesn't change in this restructure (it's not a state file), but it's worth noting that `t2_presentation_objects.ts` will have this external dependency.

---

## Sequencing

### Reorg Step 1 — Instance state + infrastructure (now)

**Prerequisite:** SSE Phase 1 complete (it is).

**Scope:** Move all instance state files into `state/instance/`. Move cache infrastructure into `state/_infra/`. Move `connection-monitor.ts` from `utils/` into `state/`. Rename root state files with tier prefixes. Create empty `state/project/` directory.

**Files moved/split/renamed:**

1. Create directories: `state/instance/`, `state/project/`, `state/_infra/`
2. Move `instance_state.ts` → `instance/t1_store.ts`
3. Move `instance_sse.tsx` → `instance/t1_sse.tsx`
4. Split `instance_data_caches.ts`:
   - Indicators + HFA indicators sections → `instance/t2_indicators.ts`
   - Structure section → `instance/t2_structure.ts`
5. Move `dataset_cache.ts` → `instance/t2_datasets.ts`
6. Move `caches/geojson_cache.ts` → `instance/t2_geojson.ts`
7. Move `dhis2-session-storage.ts` → `instance/t4_dhis2_session.ts`
8. Move `caches/reactive_cache.ts` → `_infra/reactive_cache.ts`
9. Move `caches/cache_class_D_indexeddb.ts` → `_infra/indexeddb_cache.ts`
10. Move `utils/connection-monitor.ts` → `state/t4_connection_monitor.ts`
11. Rename `ui.ts` → `t4_ui.ts`
12. Rename `clear_data_cache.ts` → `clear_caches.ts`
13. Update all import paths across the codebase
14. Delete `caches/_archived/` directory

**What NOT to touch:**

- `po_cache.ts`, `ri_cache.ts`, `replicant_options_cache.ts` — imports from `global_module_maps.ts` will change in Phase 2
- `caches/visualizations.ts`, `caches/reports.ts`, `caches/slides.ts` — cache instances that import from `global_module_maps.ts`; will be dissolved/merged in Reorg Step 2
- `img_cache.ts`, `ai_documents.ts`, `ai_interpretations.ts`, `long_form_editor.ts` — project-scoped, moved after Phase 2

**Risk:** Low. Pure file moves + import path updates. No logic changes. Instance files are stable (Phase 1 done). The ~100+ import site update for `instance_state` is mechanical but large — use find-replace carefully.

**Verification:** `deno task typecheck` must pass after all moves.

### SSE Phase 2 — Project SSE consolidation (separate plan)

See `PLAN_SSE_STATE_MANAGEMENT.md` Phase 2.

**Relevant to this restructure:**

- Creates `project/t1_store.ts` and `project/t1_sse.tsx` directly in the new directory structure (the `state/project/` directory exists from Reorg Step 1)
- Deletes `components/project_runner/provider.tsx`, `context.tsx`, `hooks.tsx`, `global_pds.ts`, `global_module_maps.ts`, `utils.ts`
- Rewrites all project component imports from `~/components/project_runner/hooks` → `~/state/project/t1_store`
- Rewrites `caches/visualizations.ts` import of `global_module_maps` → `~/state/project/t1_store`

After Phase 2, the project cache files (`po_cache.ts`, `ri_cache.ts`, etc.) will have stable import paths pointing at `~/state/project/t1_store`. They're now safe to move and merge.

### Reorg Step 2 — Project caches (after Phase 2)

**Prerequisite:** SSE Phase 2 complete.

**Scope:** Move all project state files into `state/project/`. Merge cache instances with their access functions. Dissolve `caches/visualizations.ts` and `caches/reports.ts`.

**Files moved/merged:**

1. Merge `caches/visualizations.ts` (cache instances) + `po_cache.ts` (access functions) → `project/t2_presentation_objects.ts`
   - Move `_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE` definitions into the file
   - All access functions (`getPOFigureInputsFromCacheOrFetch`, `getPODetailFromCacheorFetch`, etc.) already in po_cache.ts
   - Remove the cross-file imports
2. Merge `_REPLICANT_OPTIONS_CACHE` (from `caches/visualizations.ts`) + `replicant_options_cache.ts` → `project/t2_replicant_options.ts`
3. Merge `caches/reports.ts` (cache instances) + `ri_cache.ts` (access functions) → `project/t2_reports.ts`
   - Move `_REPORT_DETAIL_CACHE`, `_REPORT_ITEM_CACHE`, `_SLIDE_INPUTS_CACHE` definitions into the file
4. Move `caches/slides.ts` → `project/t2_slides.ts` (already self-contained, just move)
5. Move `img_cache.ts` → `project/t2_images.ts`
6. Move `ai_documents.ts` → `project/t4_ai_documents.ts`
7. Move `ai_interpretations.ts` → `project/t4_ai_interpretations.ts`
8. Move `long_form_editor.ts` → `project/t4_long_form_editor.ts`
9. Update all import paths across the codebase
10. Delete old files and empty `caches/` directory

**Merge verification:** After merging, each `t2_` file should be self-contained — it defines its cache instances AND exports its access functions. No cache instance should be exported to another file.

**Risk:** Medium. The merges change file boundaries (not just paths), so imports need careful attention. But no logic changes — the same code runs, just reorganized within files.

**Verification:** `deno task typecheck` must pass after all moves.

### Reorg Step 3 — Final cleanup

**Scope:** Delete empty directories, verify the end state matches the target structure, update documentation.

1. Verify `state/caches/` directory is empty → delete it
2. Verify no orphan files remain at `state/` root (should only be `t4_ui.ts`, `t4_connection_monitor.ts`, and `clear_caches.ts`)
3. Verify `components/project_runner/` is fully deleted (Phase 2 should have done this)
4. Update `DOC_STATE_MGT_INSTANCE.md` file references table to use new paths
5. Create `DOC_STATE_MGT_PROJECT.md` if it doesn't exist (Phase 2 deliverable)
6. Update `CLAUDE.md` architecture section if state paths are referenced

---

## What Does NOT Change

This restructure only affects `client/src/state/`. Everything else in `client/src/` stays as-is:

- `components/` — UI components (unchanged, except `project_runner/` deleted by Phase 2)
- `server_actions/` — API client layer
- `generate_visualization/` — PO → figure inputs
- `generate_report/` — report → page inputs
- `export_report/` — PDF/PPTX export
- `utils/` — ID generation, request queue, snapshot (connection monitor moved to `state/`)
- `upload/` — TUS upload
- `routes/` — router config
- Root files — `app.tsx`, `index.tsx`, `app.css`, `font-map.json`
