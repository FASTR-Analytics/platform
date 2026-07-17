---
system: 11
name: Visualization Authoring UI
globs:
  - client/src/components/NotAvailableBox.tsx
  - client/src/components/PresentationObjectMiniDisplay.tsx
  - client/src/components/PresentationObjectPanelDisplay.tsx
  - client/src/components/ReplicateByOptions.tsx
  - client/src/components/_editor_snapshot.ts
  - client/src/components/forms_editors/confirm_update.tsx
  - client/src/components/forms_editors/conflict_resolution_modal.tsx
  - client/src/components/forms_editors/custom_series_styles.tsx
  - client/src/components/forms_editors/download_presentation_object.tsx
  - client/src/components/forms_editors/view_results_object.tsx
  - client/src/components/project/add_visualization/index.tsx
  - client/src/components/project/add_visualization/metric_card.tsx
  - client/src/components/project/add_visualization/module_sidebar.tsx
  - client/src/components/project/add_visualization/step_1_metric.tsx
  - client/src/components/project/add_visualization/step_2_preset.tsx
  - client/src/components/project/add_visualization/step_3_configure.tsx
  - client/src/components/project/add_visualization/type_card.tsx
  - client/src/components/project/edit_folder_modal.tsx
  - client/src/components/project/move_to_folder_modal.tsx
  - client/src/components/project/preset_preview.tsx
  - client/src/components/project/project_metrics.tsx
  - client/src/components/project/project_visualizations.tsx
  - client/src/components/visualization/**
  - client/src/state/instance/_util_disaggregation_label.ts
  - lib/convert_visualization_type.ts
  - lib/disaggregation_labels.ts
  - lib/format_nigeria_admin_label.ts
  - lib/get_disaggregator_display_prop.ts
  - lib/group_metrics.ts
  - lib/legacy_cf_presets.ts
  - lib/normalize_po_config.ts
  - lib/types/_metric_installed.ts
  - lib/types/_presentation_object_config.ts
  - lib/types/conditional_formatting.ts
  - lib/types/conditional_formatting_standalone.ts
  - lib/types/dimension_definitions.ts
  - lib/types/disaggregation_options.ts
  - lib/types/presentation_object_defaults.ts
  - lib/types/presentation_objects.ts
  - lib/types/visualization_folders.ts
  - server/db/project/presentation_objects.ts
  - server/db/project/visualization_folders.ts
  - server/routes/project/visualization_folders.ts
docs_absorbed:
---
# S11 — Visualization Authoring UI

The live PO editor (edit/create/ephemeral modes), the visualization library,
and PO CRUD with conflict resolution.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`components/visualization/**` (editor core + panel tabs, ~6.2k LOC);
`PresentationObjectPanelDisplay` / `MiniDisplay` / `ReplicateByOptions` /
`NotAvailableBox` / `_editor_snapshot.ts`;
`components/project/add_visualization/**` + `preset_preview.tsx` +
`project_visualizations.tsx` + `project_metrics.tsx` + folder modals;
forms_editors viz modals; server PO/folder CRUD
(`db/project/{presentation_objects,visualization_folders}.ts` + the
`visualization_folders` route file — the `presentation_objects` route file is
S9-owned, S11 a mandatory reader); lib config semantics
(`normalize_po_config.ts`, `convert_visualization_type.ts`, the PO config
type families, the conditional-formatting family). S11 is also a mandatory
reader of `t2_presentation_objects.ts` (S9-owned — SYSTEMS.md §4.1);
`withReplicant` lives in kernel-owned `lib/utils.ts` (S00).

## Contract

The three-mode editor (notably *ephemeral* mode) is the authoring surface
dashboards/slides/reports plug into; the AI plugs in via AIContext mutators,
not ephemeral mode. The save path normalizes client-side and enforces the
`expectedLastUpdated` conflict protocol; default visualizations are
server-protected against update/delete. Known fragility: manually-enumerated
reactive reads exist at TWO sites — the refetch effect (`tempConfig.d`
nesting) and the figureInputs memo (`tempConfig.s`/`.t`) — a new nested
config field silently stops refetching/re-rendering unless a read is added.

## The three-mode editor

[components/visualization/index.tsx](client/src/components/visualization/index.tsx)
dispatches a discriminated props union on `mode`, each variant with its own
return type through `close`:

| Mode | Gets | Fetches | Returns |
| --- | --- | --- | --- |
| `edit` | `presentationObjectId` | PO detail + resultsValueInfo (`Promise.all`) | `{deleted}` \| `{saved}` \| undefined |
| `create` | `label` + `configSnapshot` + `resultsValueSnapshot` | resultsValueInfo only | `{created: {presentationObjectId, folderId}}` |
| `ephemeral` | same snapshots as create | resultsValueInfo only | `{updated: {config}}` |

Create and ephemeral build a **synthetic `PresentationObjectDetail`**
(`id: ""`, `lastUpdated: ""`) around their snapshots so
`VisualizationEditorInner` sees one `poDetail` shape for all three modes.
Ephemeral **never touches the server**: Apply closes with a **normalized**
config (`getConfigForSave()`), and the caller owns storage. The four
ephemeral callers: `slide_editor/index.tsx` (edits `figureBlock.bundle.config`,
then re-queries items and rebuilds the bundle), `dashboard_editor.tsx` ×2
(item + group edit, each running its reconcile step), `report/index.tsx`
(rebuilds the figure block). Edit mode has exactly one caller
(`project_visualizations.tsx`); create is used by the library, the metrics
page, and the wizard flows.

**Snapshot isolation.**
[\_editor_snapshot.ts](client/src/components/_editor_snapshot.ts):
`snap = structuredClone(unwrap(value))` — unwrap escapes the store proxy,
structuredClone severs aliasing, so the open editor is frozen against live
store churn and editor writes can't mutate the store. All 8
`snapshotForVizEditor` callers pass `projectStateSnapshot`; inside, the draft
is cloned again (`createStore(structuredClone(poDetail.config))`).
(`instanceDetailSnapshot` is emitted at every site but has zero consumers —
Open item.)

## Draft state & the refetch contract

- **`tempConfig`** is a Solid store cloned from `poDetail.config`. The panel
  writes through **`manuallyUpdateTempConfig`**, which forwards to
  `setTempConfig` then fires `notifyAI({type: "edited_viz_locally"})`. Raw
  `setTempConfig` is reserved for (a) the replicant auto-resolution
  commit-back — wrapped in the `isAutoResolvingReplicant` flag so `needsSave`
  doesn't treat it as a user edit — and (b) the AIContext registration (AI
  writes mark dirty but don't echo an interaction back to the AI).
- **`needsSave`**: a `trackStore(tempConfig)` effect (deep-tracks the whole
  store), skipping first run and auto-resolution; cleared only on successful
  save.
- **The refetch effect**
  ([visualization_editor_inner.tsx:236-288](client/src/components/visualization/visualization_editor_inner.tsx#L236-L288))
  re-queries items when `tempConfig.d` changes. Solid's for-in over `d` only
  tracks top-level keys, so nested reads are hand-enumerated: per-disaggregator
  `disOpt`/`disDisplayOpt`, per-filter `disOpt` + joined `values`, all seven
  `periodFilter` variants' fields, `valuesFilter`, plus a tracked
  `moduleDataVersionKey` read so the preview refetches when module output
  changes mid-edit. The CRITICAL comment states the contract: **a new nested
  filter field needs a read added here or the preview silently stops
  refetching.** Superseded fetches are dropped via a monotonic
  `itemsFetchRunId`.
- **The figureInputs memo** (inner:959-1023) is the second enumeration site:
  it for-in-reads ALL of `tempConfig.s` and `.t`. Net contract: `d.*` changes
  refetch; `s.*`/`t.*` changes re-render locally only.
- The items generator auto-resolves an unset/invalid replicant to the first
  valid option (`resolveDefaultReplicant`) on a **fresh config copy** — it
  never mutates the passed unwrapped store — and the editor commits the
  resolved value back into the draft, guarded on inequality.
- Preview guards before render: duplicate display-slot check
  (`hasDuplicateDisaggregatorDisplayOptions` on the effective config),
  "You must select a replicant" fallback, and `too_many_items` (20,000-point
  message) / `no_data_available` statuses.

## Save, conflict & default-viz protections

- **Normalization is client-side only.** `getConfigForSave()` =
  `normalizePOConfigForStorage(unwrap(tempConfig), resultsValue)`; the server
  route only re-parses via `presentationObjectConfigSchema.parse` — it does
  not normalize. Save-as-new normalizes a second time (idempotent — this also
  covers the AI draft-preview path, which opens the same modal).
- **Conflict protocol.** `saveFunc` posts `expectedLastUpdated =
  lastKnownServerTimestamp()`; the server
  ([db/project/presentation_objects.ts:298-312](server/db/project/presentation_objects.ts#L298-L312))
  returns `err: "CONFLICT"` + `currentLastUpdated` when the row moved and
  `overwrite` isn't set. The client opens `ConflictResolutionModal` with four
  outcomes: **overwrite** (`saveFunc(true)`), **save_as_new** (creates
  `"{label} (copy)"` in the same folder), **view_theirs** (discard + close),
  **cancel** (keep editing). The timestamp signal advances on every
  successful save.
- **Default visualizations** are protected at both tiers: server refuses
  label/config updates and deletes (including the **batch** period-filter
  update, which refuses the whole batch if any selected id is a default);
  the client never opens them in edit mode (the library reroutes to a
  create-mode copy, `"Copy of {label}"`), hides save/delete, and shows a
  "Default" badge.
- Mutations fire `notifyLastUpdated(projectId, "presentation_objects", …)` +
  `notifyProjectVisualizationsUpdated` (S3 triangle); folder mutations push
  the refreshed folder list.

## AIContext lifecycle

`onMount` registers `{mode: "editing_visualization", vizId (null for
create/ephemeral), getTempConfig, setTempConfig}`; `onCleanup` restores
`returnToContext ?? {mode: "viewing_visualizations"}`. The S13 tools
(`ai_tools/tools/visualization_editor.tsx`) read the live draft
(`get_viz_editor`) and write through `update_viz_config`, whose input schema
is **derived from the storage schemas** and whose validation runs entirely
before any store write (a throw means nothing changed); the AI has **no save
path** — persistence is exclusively the human Save button.
`project_visualizations`, `project_metrics`, and the slide editor pass
`returnToContext`; the dashboard and report editors don't (Open item).

## Downloads

One `download()` action (blocked while dirty and while items aren't ready):
PNG rendered at the canonical frame supersampled to `FIGURE_EXPORT_WIDTH_PX`
1920 (not the on-screen reflow canvas); formatted table CSV via S10's
`getTableExportAoa` with BOM; underlying-data CSV (re-queries items); JSON
definition; a results-file viewer. The multi-replicant branch is disabled
(`allReplicants` hard-coded false — Open item). The JSON definition
serializes `p.poDetail.config` — the open-time snapshot — so it exports the
pre-edit config even right after a save (Open item).

## The add-visualization wizard

`AddVisualization` is a 3-step stepper — **Metric** (module sidebar +
`MetricCard` grid; a card is selectable only when single-variant and
`status === "ready"`; multi-variant metrics render per-variant chips) →
**Presets** (`PresetSelector`: one live-rendered `PresetPreview` per
`metric.vizPresets` entry + an always-appended `CUSTOM_OPTION` card; selecting
a real preset skips step 3) → **Configure** (four `TypeCard`s gated by
`get_PRESENTATION_SELECT_OPTIONS` — timeseries needs a period column, map
needs an admin-level disaggregation; required disaggregations are
checked+disabled; `FILTER_ONLY_DISAGGREGATION_OPTIONS` excluded). Preset
saves resolve `t` TranslatableStrings via `t3` **at creation time** — stored
PO text fields are plain strings. Custom saves go through
`getStartingConfigForPresentationObject` (type defaults from
`VIZ_TYPE_CONFIG`, display slots assigned via
`getNextAvailableDisaggregationDisplayOption`). **The wizard never persists**
— it closes with `{label, resultsValue, config}` and its five callers decide:
library/metrics open the editor in create mode; dashboard/report/slide
editors build a figure block directly.

## The library page

`ProjectVisualizations` (Pattern C list page) + `PresentationObjectPanelDisplay`
(995 LOC — group sidebar + card grid):

- **Grouping modes** `folders | module | metric | flat`, persisted in
  `t4_ui` signals (`vizGroupingMode`, `vizSelectedGroup`, `vizSortMode`,
  `hideUnreadyVisualizations`); final display order is client-side
  `sortBySortMode`, not the server ORDER BY. Folders mode synthesizes
  `_defaults` and `_unfiled` ("General") groups; sub-grouping by
  module/metric/variant per mode.
- **Selection & bulk ops** via panther `createSelectionController` (selection
  changes notify the AI): move-to-folder, edit-common-properties (batch
  period-filter — uses the FIRST viz's period bounds for the whole selection,
  Open item), create-slides (blocked for multi-select with replicants),
  duplicate, delete (parallel per-id). Folder CRUD (rename/color/delete —
  delete moves POs to General via FK `ON DELETE SET NULL`).
- **Card components:** `PresentationObjectMiniDisplay` = live thumbnail
  (versioned on `lastUpdated.presentation_objects[id]`, monotonic run-id
  guard, dirty-state placeholders, `"[INFO] "`-prefixed errors render as
  `NotAvailableBox`); `PresentationObjectPanelDisplay` cards carry
  REPLICATED/FILTERED/AI/Default badges; `NotAvailableBox` = dumb
  placeholder. Unready metrics keep their cards selectable/deletable with the
  fill variant.

## Server CRUD

[db/project/presentation_objects.ts](server/db/project/presentation_objects.ts)
(574 LOC, 13 exports): create (3-char nanoid id, config re-parsed before
store), duplicate (copies the raw config string verbatim, never default),
list (`ORDER BY is_default_visualization DESC, sort_order, LOWER(label)`;
strict-parses every row), detail (rebuilds `resultsValue` via metric
resolution), label/config/delete with default-viz refusals, the batch
period-filter transaction (pre-checks and refuses default rows), and
`getVisualizationsListForAI` — S13-serving code living in this S11 file (its
sole caller is `routes/project/ai_tools.ts`). Folder CRUD in
`db/project/visualization_folders.ts` + 6 routes in
[routes/project/visualization_folders.ts](server/routes/project/visualization_folders.ts),
all guarded `can_configure_visualizations` with
`preventAccessToLockedProjects`.

## lib config semantics

- **`normalizePOConfigForStorage`**: drops empty `filterBy` entries,
  collapses empty `valuesFilter`, canonicalizes the roll-up off-state to
  *both fields absent* (kept only when the flag is set AND the
  `getEffectiveRollupLevel` gate is open). Deliberately save-time-only — the
  editor does not eagerly clear the flag on transient gate closures.
- **`getEffectivePOConfig`**: filters ineffective disaggregators with four
  recorded reasons (`filtered_to_one_value`, `single_value`, `single_period`,
  `single_year`); the **replicant exemption** applies to `single_value` only
  (fetches are pinned to one replicant value, so items-derived counts would
  see every replicant as single-valued). Two `singleValueDims` derivations:
  post-fetch from items (slice semantics) and editor-side from
  possible-values (whole-table).
- **`convertVisualizationType`**: drops disallowed disaggregations, remaps
  display slots through `VIZ_TYPE_CONFIG[newType].disDisplayOptFallbacks`,
  re-adds required disaggregations, resets content/style to type defaults.
- **PO config schema** (`_presentation_object_config.ts`): `d` =
  `configDStrict` (shared with the module-authoring repo), `s` = all-required
  flat style incl. the `cf*` fields, `t` = six plain-string/number fields.
  Reads are strict-throw (`parsePresentationObjectConfig`) — no permissive
  fallback. Duplicate display slots are allowed in storage; the UI warns and
  blocks render.
- **Conditional formatting**: storage = 16 flat `cf*` fields
  (`conditional_formatting_standalone.ts`, vendored to wb-fastr-modules);
  semantics = the `ConditionalFormatting` union with `selectCf` (flat→union)
  / `flattenCf` (union→flat) bridges and display-time `deriveBucketLabels`.
  The editor works purely on the union; `applyCfToTempConfig` fans the flat
  fields into batched store writes. `legacy_cf_presets.ts` maps the 9 legacy
  preset ids — consumed by the S2 po_config transform (Blocks 5/6) and as
  the thresholds editor's preset dropdown.
- **Replicant helpers**: `getReplicateByProp` is the filter-aware single
  source of truth for "active replicant" (safe on raw config);
  `getDisaggregatorDisplayProp` / `hasDuplicateDisaggregatorDisplayOptions`
  are deliberately NOT filter-aware (they receive effective configs).

## Replicant machinery

`ReplicateByOptions.tsx` exports a sidebar `SelectList` variant (viz editor)
and a `Select` dropdown variant (`inline_replicant_selector.tsx`,
`select_visualization_for_slide.tsx`). Both fetch replicant options through
the S9 cache (`getReplicantOptionsFromCacheOrFetch`) with
`excludeReplicantFilter: true`, deep-tracked `filterBy`/`periodFilter` reads,
and a tracked `moduleDataVersionKey`; statuses `too_many_values` (>500) /
`no_values_available` / `error` are surfaced inline. Labels get
Nigeria-admin cleaning (`formatReplicantLabelForDisplay`), re-sorted only
when cleaning changed something. The dropdown variant publishes the full
option list to its parent (the slide modal's "All replicants (N)" count).

## Open items

- **Batch edit-common-properties uses the first viz's period bounds** for a
  heterogeneous selection — a shared periodFilter may be format-mismatched
  for other metrics and later fail the schema refine.
- **AI-created unfiled vizzes are invisible in folders mode** (excluded from
  `_defaults`/`_unfiled`, absent from user folders); user-folder counts
  inconsistently don't exclude `createdByAI`. Intentionality needs a ruling.
- **AI context not restored after dashboard/report ephemeral edits** — both
  omit `returnToContext`, so closing resets to `viewing_visualizations` while
  the user is still inside the report/dashboard editor (overlaps the parked
  view-mode-tools refactor).
- **JSON-definition download exports the open-time config** — after a save it
  still serializes the pre-edit `p.poDetail.config`.
- **Edit-mode close type hole**: edit-mode "Save as new" closes with
  `{created}` (outside `EditModeReturn`); benign today, unenforced contract.
- **Duplicate cold fetch of PO detail in edit mode** — two concurrent
  `getPODetailFromCacheorFetch` calls; the reactive-cache inflight dedupe is
  check-then-set, so a cold open can double-fetch.
- **Dead reorder feature**: `reorderPresentationObjects` +
  `reorderVisualizationFolders` (registry + routes + db functions) have zero
  client callers; `sort_order` is only written by folder-create.
- **Dead code (zero importers/consumers):**
  `forms_editors/confirm_update.tsx`; `lib/types/dimension_definitions.ts`
  (barrel-exported, zero uses); db `getAllPresentationObjectsForModule` +
  `getPresentationObjectLastUpdated`; `VisualizationGroupingMode`'s `"type"`
  member (never offered, unhandled); `instanceDetailSnapshot` (cloned at all
  9 sites, read nowhere); the `allReplicants` download branch.
- **Stale white-fill comment**: inner:555-558 claims `getFigureAsCanvas`
  fills white pending a panther flag — current panther no longer fills;
  verify transparent PNG end-to-end and update or delete.
- **Duplicated ~45-line fetch effect** in the two `ReplicateByOptions*`
  components; `MetricsByModule` type duplicated in `project_metrics.tsx`.
- **i18n gaps**: hardcoded "Visualize" (`project_metrics.tsx:217`),
  "Replicant" (`inline_replicant_selector.tsx:26`), "Default" sub-group
  label, DuplicateVisualization/CreateSlide progress strings,
  `window.alert` in `custom_series_styles.tsx`.
- Commented-out remnants: AI create-from-prompt + backup blocks
  (`project_visualizations.tsx`), `attemptDeleteFromError`
  (`visualization/index.tsx`), font-size sliders (`panel_text.tsx`),
  disaggregation chips (`metric_card.tsx`), "ownership" grouping option.
