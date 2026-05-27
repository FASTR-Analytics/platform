# Project-Level State Management

> ⚠️ **Before writing state code, read `DOC_STATE_RULES.md`.** It's a short hit-list of rules that have each produced real production bugs (notably around Solid.js reactive tracking, SSE-driven invalidation, when to use `timQuery` vs `createEffect`, and the "don't flash loading on Variant B re-runs" rule specific to project-level per-entity caches).

## Overview

Project state is scoped to a single project: modules, visualizations, slide decks, dirty states, metrics, and project users. Project state uses the same global store + SSE pattern as instance state.

For instance-level state management, see `DOC_STATE_MGT_INSTANCE.md`.

## Architecture

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
| Slide decks | `slideDecks` | `slide_decks_updated` | — |
| Slide deck folders | `slideDeckFolders` | `slide_deck_folders_updated` | — |
| Project users | `projectUsers` | `project_users_updated` | — |
| Module dirty states | `moduleDirtyStates` | `module_dirty_state` | — |
| Module last run | `moduleLastRun`, `moduleLastRunGitRef` | `module_dirty_state` | `moduleLastRun[moduleId]` |
| Any running | `anyRunning` | `any_running` | — |
| Per-entity timestamps | `lastUpdated` | `last_updated` | `lastUpdated[tableName][entityId]` |
| Current user permissions | `thisUserPermissions` | `project_users_updated` (re-derived) | — |

**Per-entity `lastUpdated` timestamps:** Unlike instance state, project T2 caches need per-entity versioning. For example, when a single presentation object is edited, only that PO's cache entry should invalidate — not all POs. The `lastUpdated` field is a nested record: `Record<LastUpdateTableName, Record<string, string>>`, where table names include `presentation_objects`, `slides`, `slide_decks`, `modules`, `datasets`.

**Derived lookup maps:** `t1_store.ts` maintains internal lookup maps (`metricToModule`, `resultsObjectToModule`, `metricToFormatAs`) recomputed from `projectModules`/`metrics` whenever those fields update. Exported via getter functions (`getModuleIdForMetric()`, `getModuleIdForResultsObject()`, `getFormatAsForMetric()`). Used by T2 caches to resolve module-based version keys.

**Excluded from T1 — `aiContext`:** The project's AI context string is NOT included in `ProjectState`. It's unbounded (users can paste large documents) and is only consumed by the AI panel. Fetched independently when the AI panel opens (T3).

---

## Tier 2: Reactive cache

Heavy project data too large for SSE. Cached in memory + IndexedDB. Auto-invalidated by T1 `lastUpdated` timestamps or `moduleLastRun`.

Most project-level T2 caches are **per-entity** — keyed by an individual entity ID rather than a single global version. This is the **Variant B** pattern from `DOC_STATE_MGT_TIERS.md`. Read that doc first.

| Data | File | Cache version key(s) | Variant | Why cached, not on SSE |
| --- | --- | --- | --- | --- |
| Dashboard detail (with items) | `project/t2_dashboards.ts` | `lastUpdated.dashboards[dashboardId]` | B (per-entity) | Items array can be large (stripped figure inputs) |
| PO detail (config, metadata) | `project/t2_presentation_objects.ts` | `lastUpdated.presentation_objects[poId]` | B (per-entity) | Full config object per PO |
| PO items (data rows) | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` (via resultsObjectId lookup) | A (whole-module data) | Potentially thousands of rows |
| Metric info (results value info) | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` (via metricId lookup) | A | Per-metric results metadata |
| Replicant options | `project/t2_replicant_options.ts` | `moduleLastRun[moduleId]` (via resultsObjectId lookup) | A | Disaggregation options per fetch config |
| Slide content | `project/t2_slides.ts` | `lastUpdated.slides[slideId]` | B (per-entity) | Full slide with blocks and metadata |
| Slide deck meta | `project/t2_slides.ts` | `lastUpdated.slide_decks[deckId]` | B (per-entity) | Deck label, plan, slide order |
| Image blobs | `project/t2_images.ts` | URL-based (not PDS-keyed) | — | Binary data, IndexedDB + memory |

**Image cache note:** `t2_images.ts` uses `TimCacheD` (IndexedDB) rather than `createReactiveCache`. It's URL-keyed with failure backoff, not PDS-versioned. It's T2 because it caches fetched data that persists across navigation, but its invalidation pattern is different from the other T2 caches.

### Per-entity T2 (Variant B) — canonical client pattern (live read)

The version key for a per-entity cache is `projectState.lastUpdated.{tableName}[entityId]`. When that single entity changes (the user added an item to a dashboard, edited a slide, renamed a deck), only its version key flips. Other entities are unaffected. The data change is usually **incremental** — one item added, one field edited — so the existing rendered view stays mostly correct.

This is a **live read** pattern (see `DOC_STATE_RULES.md` rule #6) — required for any long-lived view of a per-entity record. For short-lived picker modals that fetch the same data, a **snapshot read** via `timQuery` is acceptable; SSE updates during the modal's lifetime aren't consumed.

**Rules for consuming per-entity T2 data as a live read:**

1. Use `createSignal<StateHolder<T>>` initialized to `{ status: "loading" }`.
2. Use `createEffect` that **reactively reads** the per-entity version key.
3. **Do NOT call `setData({ status: "loading" })` inside the effect.** Stale data stays visible while the refetch is in flight. Initial loading is handled by the signal default.
4. **Do NOT call `silentFetch()`, `fetch()`, or any manual `refresh()` after a mutation.** SSE handles propagation. The server route handler called `notifyLastUpdated(...)` after the mutation; the SSE message will flip the version key; the `createEffect` will fire; the cache will miss; fresh data arrives.

```tsx
const [data, setData] = createSignal<StateHolder<DashboardDetail>>({
  status: "loading",
});

createEffect(async () => {
  const _v = projectState.lastUpdated.dashboards[p.dashboardId]; // reactive read for tracking
  // NOTE: No setData({ status: "loading" }) here — Variant B leaves stale data visible.
  const res = await getDashboardDetailFromCacheOrFetch(p.projectId, p.dashboardId);
  if (res.success) {
    setData({ status: "ready", data: res.data });
  } else {
    setData({ status: "error", err: res.err });
  }
});

<StateHolderWrapper state={data()}>
  {(dashboard) => <DashboardView dashboard={dashboard} />}
</StateHolderWrapper>
```

This gives:

- ✅ Loading flash **only on first mount** (signal default).
- ✅ **No flash** on SSE-triggered refetches — stale data stays visible until fresh data arrives.
- ⚠️ If the refetch errors out (e.g. transient network failure), the stale data is replaced with an error state. This is an accepted trade-off — rare in practice, and showing stale data without ever indicating the error would be worse.

**Note on `void` vs `const _v`:** Both `void projectState.lastUpdated.dashboards[id]` and `const _v = projectState.lastUpdated.dashboards[id]` achieve the same thing — they create a reactive dependency without using the value. Use whichever is clearer in context. Some components in the codebase use one, some use the other.

### Whole-module T2 (Variant A) — for `moduleLastRun`-keyed caches

`PO items`, `metric info`, and `replicant options` are keyed off `moduleLastRun[moduleId]`. When a module re-runs, ALL of that module's outputs change at once. This is whole-collection invalidation (Variant A) — show loading on every effect re-run. Follow the Variant A pattern in `DOC_STATE_MGT_INSTANCE.md`.

### Anti-patterns (do not write these in project-level code)

See `DOC_STATE_MGT_TIERS.md` for the full anti-pattern catalogue. The most common ones in project-level code:

1. **Using `timQuery` (snapshot read) for a long-lived view of per-entity data.** SSE updates will never be reflected; the view goes stale silently. Use a live read (`createEffect` + version key) instead. (Snapshot reads via `timQuery` ARE appropriate for short-lived picker modals — see `DOC_STATE_RULES.md` rule #6 for the distinction.)
2. **Calling `silentFetch()` or `refresh()` after a mutation.** Duplicates work and races with SSE. Remove the call; let SSE drive invalidation.
3. **Setting `{ status: "loading" }` on every Variant B effect re-run.** Flashes "Loading..." every time anything changes, even one-character edits to a label.

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
