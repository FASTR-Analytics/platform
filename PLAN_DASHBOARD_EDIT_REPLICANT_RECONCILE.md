# Plan: Reconcile dashboard replicant structure on edit / switch

> **Status:** Plan — proposed, pending review (2026-06-08). Scope: make an **edit or switch** of a
> dashboard entry re-derive its replicant *structure* (standalone item ↔ replicant group, and the
> replicant set), instead of freezing that decision at add-time.
>
> **The bug that triggered this:** editing a standalone dashboard item so its config gains a replicant
> dimension does **not** expand it into the full replicant suite — it silently stays one item. That is
> one corner of a wider desync matrix (below).

## 1. The load-bearing insight

Two things get conflated under "save data after edit." Keep them apart:

- **Data values already re-import on edit.** Both `handleEdit` ([dashboard_editor.tsx:467](client/src/components/dashboards/dashboard_editor.tsx#L467))
  and `handleGroupEdit` ([:602](client/src/components/dashboards/dashboard_editor.tsx#L602)) rebuild the
  `figureBlock` from a **fresh** fetch via `buildFigureBlock` → `getPresentationObjectItemsFromCacheOrFetch`
  ([:215-270](client/src/components/dashboards/dashboard_editor.tsx#L215-L270)). Numbers are not stale.
- **The replicant *structure* never reconciles.** Whether an entry is a standalone item vs. a group, and
  *which* replicants exist, is decided **once at add-time** (`attemptAddItem` [:287-361](client/src/components/dashboards/dashboard_editor.tsx#L287-L361)
  + the single-vs-all modal) and then frozen. Editing the config never recomputes it.

So this is **not** a data-freshness problem — it's a **structural-reconciliation** problem.

### The second insight: "structure" is item-vs-group **contextual**, not a pure function of config

A config with a replicant dimension (`getReplicateByProp` truthy, [get_disaggregator_display_prop.ts:32](lib/get_disaggregator_display_prop.ts#L32))
can legitimately be added as **either** a single item (one picked replicant) **or** a group (all
replicants) — the add modal asks. So you cannot derive intent from config alone. But you *can* derive it
**given what you're editing**:

- The disaggregation editor **clears `selectedReplicantValue`** whenever a disaggregator is toggled or its
  display option changes ([_3_disaggregation.tsx:189,194,291](client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx#L189)).
  So a config that *just gained* a replicant dimension has `selectedReplicantValue === undefined`.
- A single-replicant item carries a **defined** `selectedReplicantValue`.

This gives an unambiguous rule, branched on whether you started from an **item** or a **group** (which the
editor knows — `selectedItem()` vs `selectedGroup()`). See §4.

### The third insight: an edit re-resolves *all* member data anyway → "replace in place" is the simplest correct primitive

Because every edit/switch already re-resolves the figure for **every** member, there is **no incremental
value in preserving member rows**. That collapses all four structural transitions into one operation:
**delete the old entry, insert the new entry at the same position.** The only things worth carrying
forward are *position* (sort-order span) and *non-derivable group metadata* (label,
`defaultReplicantValue` when still valid). This avoids per-member sort-order diffing entirely.

## 2. The full desync matrix (today)

| Edit (from → to) | What happens now | Where |
|---|---|---|
| **Item → gains replicant** (reported) | Stays one item; no group, no suite. `handleEdit` never calls `getReplicateByProp` on the new config. | [:467-502](client/src/components/dashboards/dashboard_editor.tsx#L467-L502) |
| **Group → loses replicant** | Loops the **old** `g.replicants`; `getReplicateByProp` now falsy so `selectedReplicantValue` is never set → **N identical members**, group persists. | [:633-641](client/src/components/dashboards/dashboard_editor.tsx#L633-L641) |
| **Group → different replicant dimension** | Re-resolves against **stale** old values; `replicate_by` + `replicants` metadata never updated (the server fn doesn't even accept `replicateBy`). | server [:526-529](server/db/project/dashboards.ts#L526-L529) |
| **Group → same dimension, available set changed** (filter/data shift) | Replicant set frozen at add-time; new replicants never appear, removed ones linger. | — |
| **Switch (item or group) → different replicant shape** | Same blind spot — `handleSwitch`/`handleGroupSwitch` never reshape. | [:442-465](client/src/components/dashboards/dashboard_editor.tsx#L442-L465), [:585-600](client/src/components/dashboards/dashboard_editor.tsx#L585-L600) |

The server is explicit about the limitation: *"the replicant SET is assumed stable — v1 supports
same-dimension switch/edit"*, members matched by `replicant_value` with **UPDATE only** (no INSERT/DELETE)
([dashboards.ts:586-593](server/db/project/dashboards.ts#L586-L593)).

## 3. What exists today (the building blocks to reuse)

- **Add-time structure derivation** lives inline in `attemptAddItem` ([:308-347](client/src/components/dashboards/dashboard_editor.tsx#L308-L347)):
  `getReplicateByProp(config)` → `getResultsValueInfoForPresentationObjectFromCacheOrFetch` →
  `getFetchConfigFromPresentationObjectConfig` → `getReplicantOptionsFromCacheOrFetch`
  ([t2_replicant_options.ts:33](client/src/state/project/t2_replicant_options.ts#L33)). **Extract this.**
- **Member resolution + progress** lives in `AddDashboardItemConfirmModal` ([:64-134](client/src/components/dashboards/add_dashboard_item_modal.tsx#L64-L134)):
  the resolve-all loop with `resolveFigureAndGeoFromVisualization`, a shared-geojson collapse, and a
  `ProgressBar`. **Reuse this pattern** for the reshape fan-out.
- **`buildFigureBlock(resultsValue, config)`** ([:215-270](client/src/components/dashboards/dashboard_editor.tsx#L215-L270))
  already produces a `figureBlock` + `geoData` from an arbitrary config — works for any replicant value
  via `config.d.selectedReplicantValue`.
- **Server transactional primitives**: `addDashboardItem` / `addDashboardItemGroup` /
  `deleteDashboardItem` / `deleteDashboardItemGroup` (FK `ON DELETE CASCADE` on
  `dashboard_items.replicant_group_id`, [_project_database.sql:315](server/db/project/_project_database.sql#L315))
  / `reSequence` ([:681](server/db/project/dashboards.ts#L681)). All append at `max(sort_order)+10` — so a
  naive delete+add **jumps the entry to the end**; position must be handled in one txn (§5.3).

## 4. The reconciliation rule (locked logic)

Given the entry you're editing and the editor's returned config `after`:

**Editing a standalone item** (`selectedItem()`):
- `getReplicateByProp(after)` falsy → **item** (refresh in place — today's path).
- truthy **and** `after.d.selectedReplicantValue` defined → **item** for that replicant (refresh in place).
- truthy **and** `selectedReplicantValue` undefined → **group** over all replicant options *(← the bug fix)*.

**Editing a group** (`selectedGroup()`) — groups always sweep all replicants; ignore `selectedReplicantValue`:
- `getReplicateByProp(after)` falsy → **collapse to single item**.
- truthy, **same** dimension, **same** option set → group, **in place** (today's path).
- truthy, **different** dimension **or** changed option set → **rebuild group** (replace).

"Same option set" = the freshly fetched replicant option values equal `g.replicants` values (order-insensitive).

**Switch** (`handleSwitch` / `handleGroupSwitch`): the picked viz's config drives the same rule; a switch
that changes shape reshapes via the same path.

## 5. Design

### 5.1 Client — `resolveReplicantStructure` (shared helper, new)

`client/src/components/dashboards/resolve_replicant_structure.ts`:

```ts
// null  → standalone (no replicant sweep)
// object → group over these replicant options
export async function resolveReplicantStructure(
  projectId: string,
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
): Promise<
  | { kind: "item" }
  | { kind: "group"; replicateBy: string; replicants: { value: string; label: string }[] }
>;
```

Encapsulates exactly the `attemptAddItem` [:308-347](client/src/components/dashboards/dashboard_editor.tsx#L308-L347)
block (replicateBy → results-value-info → fetch-config → replicant-options). `attemptAddItem` is then
refactored to call it too, so add and edit share one definition of "what replicants exist."

### 5.2 Client — reshape dispatch in the four handlers

Add one shared `reconcileEntryStructure(before, after)` used by `handleEdit`, `handleSwitch`,
`handleGroupEdit`, `handleGroupSwitch`. It:

1. Computes `after` structure via §4 (using `resolveReplicantStructure` only when the config is
   replicant-capable).
2. If structure is unchanged → keep today's **in-place** path (`updateDashboardItem` /
   `updateDashboardItemGroup`) — no id churn, cheapest, common case.
3. If structure changed → open a **confirm + progress** step (reuse `AddDashboardItemConfirmModal`'s
   resolve loop + `ProgressBar`; generalize it to "resolve N members with progress"). Warn explicitly when
   an edit fans a single item into N figures (*"This change expands into N replicant figures — generate
   all?"*). On confirm, resolve every member's `figureBlock` (+ shared geojson) via `buildFigureBlock` and
   call the new `replaceDashboardEntry` server action (§5.3).
   - `defaultReplicantValue` for a new/rebuilt group: the item's old `selectedReplicantValue` if present
     in the new set, else the old group default if still present, else `replicants[0].value`.

### 5.3 Server — `replaceDashboardEntry` (one new transactional action)

Handles **all** structure-changing transitions uniformly (item↔group, group→group with any set/dimension
change) by replacing the old entry's rows **in its existing sort position**, atomically:

```ts
replaceDashboardEntry(projectDb, dashboardId, {
  old: { kind: "item"; itemId } | { kind: "group"; groupId },
  new:
    | { kind: "item"; label; figureBlock; geoData? }
    | { kind: "group"; label; replicateBy; defaultReplicantValue?;
        replicants; geoData?; members },
})
```

In one `projectDb.begin`:
1. Read the old entry's sort span — item: its `sort_order`; group: `min(sort_order)` over its members.
2. Delete the old entry (item row, or group row → members cascade).
3. Insert the new entry's row(s) starting at the captured `baseSort` (group members at
   `baseSort + 10*i`), reusing the insert bodies of `addDashboardItem` / `addDashboardItemGroup`.
4. `reSequence(sql, dashboardId)` → restores clean 10-spaced global order, entry stays put.
5. Bump `dashboards.last_updated` (drives the SSE refetch the editor already listens on,
   [dashboard_editor.tsx:118-129](client/src/components/dashboards/dashboard_editor.tsx#L118-L129)).

New route in the registry ([lib/api-routes/project/dashboards.ts](lib/api-routes/project/dashboards.ts#L115))
+ server action + DB fn. The existing `updateDashboardItem` / `updateDashboardItemGroup` stay for the
**unchanged-structure** fast paths.

> **Why a dedicated action, not delete+add from the client:** three round-trips would (a) jump the entry to
> the list end, (b) expose a broken intermediate state, (c) not be atomic on failure. One txn fixes all
> three. **Why "replace" over member-diff:** the edit re-resolves every member regardless, so preserving
> member rows buys nothing but sort-order-diffing complexity (§1, third insight).

## 6. Phasing

- **Phase 1 — extract `resolveReplicantStructure`** and refactor `attemptAddItem` onto it. No behavior
  change; pure de-dup. Lands the single source of truth for "what replicants exist."
- **Phase 2 — server `replaceDashboardEntry`** (route + action + DB fn) + tests (item→group, group→item,
  group→group set change; assert position preserved + atomic rollback on a thrown resolve).
- **Phase 3 — client reshape dispatch** in `handleEdit` + `handleGroupEdit` (the reported bug + its
  inverse), with the confirm/progress step. Verify the reported case end-to-end.
- **Phase 4 — extend to `handleSwitch` / `handleGroupSwitch`** (same dispatch, viz-driven config).

Phases 3–4 are where user-visible behavior changes; 1–2 are safe groundwork.

## 7. Edge cases

- **Item with a specific picked replicant, edited** (keeps `selectedReplicantValue`) → stays single, refresh
  in place. Not an accidental expansion.
- **Group edited but set + dimension unchanged** → in-place member UPDATE (today). No id churn.
- **Zero replicant options returned** (`status !== "ok"` or empty) → treat as **item** (don't create an empty
  group); surface the resolve error like add does.
- **`defaultReplicantValue` no longer in the new set** → fall back to `replicants[0]`.
- **geojson**: groups store one shared copy (members `geo_data = NULL`); items store their own. `replaceDashboardEntry`
  writes to the right place per `new.kind` — mirrors `buildPublicDashboardBundle` which feeds members the
  group's geojson ([dashboard.ts:159](lib/types/dashboard.ts#L159)).
- **Large fan-out** (e.g. 40 replicants from one edit) → N sequential resolves; gate behind the confirm +
  `ProgressBar` so it's not a silent multi-second hang.

## 8. Non-goals / risks

- **Auto-refresh on upstream metric change.** Dashboard figures are point-in-time snapshots
  (`source.snapshotAt`); they intentionally do **not** re-pull when the source module re-runs. Out of scope
  — this plan only reconciles on **user edit/switch**.
- **FigureBundle entanglement (timing).** Reshape resolves figures through `resolveFigureAndGeoFromVisualization`
  / `buildFigureBlock` / `FigureSource` / `stripFigureInputsForStorage` — the exact surface
  [PLAN_FIGURE_BUNDLE.md](PLAN_FIGURE_BUNDLE.md) replaces with `FigureBundle`. The reshape **logic**
  (structure diff + replace-in-place) is stable across that refactor; only *how it obtains a stored figure*
  changes. Coordinate: if FigureBundle is imminent, build Phase 3 against its resolver. Either way, the new
  `replaceDashboardEntry` server primitive is FigureBundle-agnostic (it moves opaque blocks).
- **Member id churn on rebuild.** Replace gives group members fresh ids. Nothing external references member
  ids (selection is transient, keyed by entry id); acceptable.
- **Concurrent edits / SSE.** Reshape is one txn bumping `last_updated`; the editor's stale-while-revalidate
  holder refetches. Same consistency model as every other mutation here.

## 9. Key file references

| Purpose | File |
|---|---|
| Edit / switch handlers to reshape | [dashboard_editor.tsx:442-642](client/src/components/dashboards/dashboard_editor.tsx#L442-L642) |
| Add-time structure derivation (to extract) | [dashboard_editor.tsx:308-347](client/src/components/dashboards/dashboard_editor.tsx#L308-L347) |
| `buildFigureBlock` (per-replicant resolve) | [dashboard_editor.tsx:215-270](client/src/components/dashboards/dashboard_editor.tsx#L215-L270) |
| Resolve-all-members + progress (to reuse) | [add_dashboard_item_modal.tsx:64-134](client/src/components/dashboards/add_dashboard_item_modal.tsx#L64-L134) |
| `getReplicateByProp` (replicant detection) | [get_disaggregator_display_prop.ts:32](lib/get_disaggregator_display_prop.ts#L32) |
| Editor clears `selectedReplicantValue` | [_3_disaggregation.tsx:189,194,291](client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx#L189) |
| Replicant options fetch | [t2_replicant_options.ts:33](client/src/state/project/t2_replicant_options.ts#L33) |
| Server group update ("same-dimension only") | [dashboards.ts:526-602](server/db/project/dashboards.ts#L526-L602) |
| Server add-group + `reSequence` (insert bodies to reuse) | [dashboards.ts:428-500](server/db/project/dashboards.ts#L428-L500), [:681](server/db/project/dashboards.ts#L681) |
| Route registry (add `replaceDashboardEntry`) | [lib/api-routes/project/dashboards.ts](lib/api-routes/project/dashboards.ts#L115) |
| Table schema (FK cascade, sort_order) | [_project_database.sql:290-321](server/db/project/_project_database.sql#L290-L321) |
| Dashboard → public bundle (entries/groups) | [lib/types/dashboard.ts:159](lib/types/dashboard.ts#L159) |
| FigureBundle refactor (timing risk) | [PLAN_FIGURE_BUNDLE.md](PLAN_FIGURE_BUNDLE.md) |
</content>
</invoke>
