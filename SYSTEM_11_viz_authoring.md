---
system: 11
name: Visualization Authoring UI
globs:
  - client/src/components/NotAvailableBox.tsx
  - client/src/components/_editor_snapshot.ts
  - client/src/components/explore/**
  - client/src/components/figure_editor/**
  - client/src/components/figures/**
  - client/src/components/forms_editors/confirm_update.tsx
  - client/src/components/forms_editors/conflict_resolution_modal.tsx
  - client/src/components/forms_editors/custom_series_styles.tsx
  - client/src/components/forms_editors/download_presentation_object.tsx
  - client/src/components/forms_editors/view_results_object.tsx
  - client/src/state/instance/_util_disaggregation_label.ts
  - lib/convert_visualization_type.ts
  - lib/derive_default_visualizations.ts
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
docs_absorbed:
---

# S11 — Visualization Authoring UI

The embedded figure editor, the metric → preset wizard that creates figures, and
the Explore tab that browses a package's presets standalone.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`components/figure_editor/**` (editor core + the three panel tabs + conditional
formatting + `stale_figure_badge.tsx` + `figure_mini_display.tsx` +
`replicate_by_options.tsx`); `components/figures/insert_figure/**` (the metric
wizard and the preset-gallery pieces); `components/explore/**` (the Explore
page, `add_to_product_modal.tsx`, `metric_details_modal.tsx`);
`NotAvailableBox` / `_editor_snapshot.ts`; the forms_editors figure modals; lib
config semantics (`normalize_po_config.ts`, `convert_visualization_type.ts`, the
PO config type families, the conditional-formatting family). S11 is a mandatory
reader of `client/src/state/products/t2_figure_data.ts` (S9-owned — SYSTEMS.md
§4.1) and of `_shared/scope_picker.tsx` (S12's `_shared/**` glob);
`withReplicant` lives in kernel-owned `lib/utils.ts` (S00).

## Contract

**A figure is `{ metricId, config }` resolved under its product's PackageScope**
(D3) — there is no visualization you can open, save, duplicate or point at, so
this system authors figures INSIDE a product and never owns a row. Three
surfaces, one editor: the slide editor, the report editor and Explore each hand
the embedded editor a metric, a config and a pair, and take back the edited
config. `PresentationObjectConfig` stays the figure-config type name; renaming
the PO vocabulary is a separate refactor (out of scope, plan §8).

Reactivity is deep-tracked at both sites — the refetch effect
(`trackStore(tempConfig.d)`) and the figureInputs memo (`JSON.stringify` over
`tempConfig.s`/`.t`) — so new config fields need no wiring at either; the
hand-enumerated dependency lists that used to live there (and regressed twice in
one day) were deliberately removed. Do not add one back.

## The embedded editor

[components/figure_editor/index.tsx](client/src/components/figure_editor/index.tsx)
has exactly **one mode**. Props: `label`, `scope` (the product's
`PackageScope`), `metric`, `configSnapshot`, `authoringContext`, and an optional
`collabBinding`. Its whole job before mounting `VisualizationEditorInner` is to
resolve the metric's queryable shape (`resultsValueInfo` — which filter and
disaggregation options exist and their possible values) **under the host's
pair**; that read is scope-dependent, which is why it lives here rather than in
the host.

It closes with `{ updated: { config } }` or `undefined` — the caller owns
storage, always. Apply normalizes client-side (`getConfigForSave()` =
`normalizePOConfigForStorage`). Three callers, one shape each:
`slide_editor/index.tsx` (edits `figureBlock.bundle.config`, then re-queries
items and rebuilds the bundle), `report/index.tsx` (rebuilds the figure block),
and `explore/index.tsx` (drops the result — Explore owns no rows, so it passes a
`structuredClone` of the preset's config so an exploratory edit cannot rewrite
the run's preset for every other reader of the same authoring context).

**Live co-editing changes the button set, not the mode.** With a
`collabBinding` that is ready AND live, the header shows a "Live" badge, undo /
redo, and a single Back button that commits (streamed edits cannot be
discarded); without one it shows Apply / Cancel gated on `needsSave()`. The
binding co-edits the figure's config IN the host document's `figConfig` Y.Map —
there is no standalone room, because a figure has no document of its own (S16).

**Snapshot isolation.**
[\_editor_snapshot.ts](client/src/components/_editor_snapshot.ts):
`snap = structuredClone(unwrap(value))` — unwrap escapes the store proxy,
structuredClone severs aliasing, so the open editor is frozen against live store
churn and editor writes can't mutate the store. Inside the editor the draft is
cloned again (`createStore(structuredClone(p.configSnapshot))`). What is
deliberately NOT snapshotted is the product's pair: the host reads `runId` /
`adminArea2` live off the T1 products row and passes them down, so a reattach
mid-edit moves the editor's reads with it (D16).

## Draft state & the refetch contract

- **`tempConfig`** is a Solid store cloned from `p.configSnapshot`.
  `manuallyUpdateTempConfig` is now a direct alias of `setTempConfig`: the
  copilot is told about figure edits by the HOST, not here — the editor sits
  inside `editing_slide` / `editing_report`, and the host's own "edited locally"
  interaction fires when it applies the coherent bundle.
- **`needsSave`**: a `trackStore(tempConfig)` effect (deep-tracks the whole
  store), skipping first run and the replicant auto-resolution commit-back
  (guarded by the `isAutoResolvingReplicant` flag so it is not read as a user
  edit). It gates the Apply/Cancel pair; under live collab there is nothing to
  gate, since every keystroke is already in the host doc.
- **The refetch effect**
  ([visualization_editor_inner.tsx](client/src/components/figure_editor/visualization_editor_inner.tsx))
  re-queries items when `tempConfig.d` changes, via `trackStore(tempConfig.d)`
  **plus a tracked read of the product's pair** — the host passes
  `PackageScope` live from T1, so reattaching the product mid-edit refetches the
  preview under the new package. There is no version key: a package is
  immutable, so the pair leads the items cache's uniqueness key and a reattach
  is a different ENTRY rather than an invalidation (S9).
  The trackStore replaced a hand-maintained dependency list that regressed twice
  in one day when fields moved between nesting levels — every current and future
  `d` field is fetch-tracked automatically. Superseded fetches are dropped via a
  monotonic `itemsFetchRunId`.
- **The figureInputs memo** deep-tracks ALL of `tempConfig.s`
  and `.t` via `void JSON.stringify(...)` (recursive reads subscribe to every
  nested property, including in-place-reconciled collaborator edits). Net
  contract: `d.*` changes refetch; `s.*`/`t.*` changes re-render locally only.
- The items generator auto-resolves an unset/invalid replicant to the first
  valid option (`resolveDefaultReplicant`) on a **fresh config copy** — it never
  mutates the passed unwrapped store — and the editor commits the resolved value
  back into the draft, guarded on inequality.
- Preview guards before render: duplicate display-slot check
  (`hasDuplicateDisaggregatorDisplayOptions` on the effective config), "You must
  select a replicant" fallback, and `too_many_items` (20,000-point message) /
  `no_data_available` statuses.

## Resolution and staleness

**`resolveBundleFromMetricAndConfig(scope, metric, config)`** is THE
metric-keyed resolver (S10's glob, `generate_visualization/`): validate the
replicant, re-query items, assemble a `FigureBundle` stamped with the pair it
resolved under. There is no from-visualization entry point, because a
visualization is not a thing you can point at — the metric wizard, a preset, the
editor's Apply, the D4 update action and the AI create/edit tools all come
through it.

Two policies, deliberately different, one file apart:
`resolveBundleFromMetricAndConfig` validates the replicant **strictly**
(`assertReplicantValid` throws) so the model gets the valid-value list back;
`resolveFigureBundleInteractively` **auto-defaults** an unset or no-longer-valid
replicant and returns `{ ok: false, reason }` rather than throwing, because its
callers show that reason in place — on the figure — never in a modal that loses
track of which figure it was about.

**The stale badge** ([stale_figure_badge.tsx](client/src/components/figure_editor/stale_figure_badge.tsx))
is the whole compatibility mechanism (D4): the predicate is S10's
`isFigureBundleStale`, and the badge offers exactly one action — re-resolve this
figure under the product's CURRENT pair, through the interactive resolver. The
metric lookup in the target package's authoring context IS the "metric not in
this package" check, which is why reattach and scope change never block and have
no pre-flight anywhere. A failure shows `figurePackageIssueForMetrics`'s reason
(`lib/figure_package_issue.ts`, manifest-only, shared with the server) on that
figure and leaves the old bundle in place. The file also exports
`UpdateAllFiguresButton` (the editor-header counterpart with its count),
`ProductScopeBadge`, and `packageLabel(runId)` — which falls back to a short id,
because a product keeps pointing at exactly the package it was attached to even
after that package leaves the ready list.

## Downloads

One `download()` action (blocked while items aren't ready): PNG rendered at the
canonical frame supersampled to `FIGURE_EXPORT_WIDTH_PX` 1920 (not the on-screen
reflow canvas); formatted table CSV via S10's `getTableExportAoa` with BOM;
underlying-data CSV (re-queries items); JSON definition; a results-file viewer.
The multi-replicant branch is disabled (`allReplicants` hard-coded false — Open
item). The JSON definition is `{label, metricId, runId, adminArea2, config}`
read off the LIVE draft: a figure has no id of its own, so `{metricId, config}`
plus the pair it resolves under is the whole definition.

## The metric wizard

`InsertFigureModal` ([figures/insert_figure/](client/src/components/figures/insert_figure/index.tsx))
is a 3-step stepper fed by a `RunAuthoringContext` — **Metric** (module
sidebar + `MetricCard` grid; a card is selectable only when single-variant and
`status === "ready"`; multi-variant metrics render per-variant chips) →
**Presets** (`PresetSelector`: one live-rendered `PresetPreview` per
`metric.vizPresets` entry + an always-appended `CUSTOM_OPTION` card; selecting a
real preset skips step 3) → **Configure** (five `TypeCard`s gated by
`get_PRESENTATION_SELECT_OPTIONS` — timeseries needs a period column, map needs
an admin-level disaggregation; table/chart/pie are always offered; required
disaggregations are checked+disabled; `FILTER_ONLY_DISAGGREGATION_OPTIONS`
excluded). Preset selections resolve `t` TranslatableStrings via `t3` **at
creation time** — stored figure text fields are plain strings. Custom
selections go through `getStartingConfigForPresentationObject` (type defaults
from `VIZ_TYPE_CONFIG`, display slots assigned via
`getNextAvailableDisaggregationDisplayOption`).

**The wizard never persists and never resolves** — it closes with
`{ metric, config }`, and the caller resolves that under ITS OWN product's pair.
`preselectedMetricId` skips straight to the preset step. Only the preview
fetches need the `scope` prop; metrics, modules and presets all come from the
authoring context, which carries no scope. Three callers: the slide editor, the
report editor, and Explore's "Custom figure…".

## The Explore tab

`components/explore/index.tsx` is the standalone place to look at a chart (D6):
the same module sidebar, metric cards and preset previews the wizard uses,
rendered as a page over an **ephemeral** `(package, scope)` pair. The package
`Select` is the T1 `readyPackages` list (stable options, prefilled with the
pin); the scope picker defaults national. Both live in `t4_ui` signals so a tab
switch doesn't lose them, and neither is persisted or written to any product.
The picker keeps its own working `ScopeSelection` so "Single, no area chosen
yet" is a real interim state — only a COMPLETE selection reaches the pair,
otherwise every gallery preview would refetch at national the moment the user
clicked the radio.

Presets are **not products**: no rows, no detail read. A preset is
`{ metricId, config }` derived from the manifest and served inside
`getRunAuthoringContext.presets`; the gallery for a metric is its slice of that
list, sorted by `sortOrder`, rendered through the same run-keyed items read as
everything else. Per metric the header offers **Details**
(`metric_details_modal.tsx`, moved here — Explore is where approved users browse
metric definitions now), **Custom figure…** (the wizard), and for a selected
preset **Configure** (the embedded editor, ephemerally) and **Add to deck /
report…** (`add_to_product_modal.tsx`, which re-resolves the figure under the
TARGET product's pair before writing it).

## Thumbnails

`FigureMiniDisplay` ([figure_mini_display.tsx](client/src/components/figure_editor/figure_mini_display.tsx))
is the live thumbnail of `{ metricId, config }` under one `PackageScope` — the
preset gallery, the Explore cards, any small preview that is not the editor.
There is **no per-id detail read behind it**: a figure is not a row, so the
caller supplies the metric from the run's authoring context. It drives
`getFigureInputsFromCacheOrFetch_AsyncGenerator` and guards against racing
re-runs with a monotonic `fetchRunId` **inside** the generator loop, since the
generator yields more than once (the same idiom as the editor's
`itemsFetchRunId`). `"[INFO] "`-prefixed errors render as `NotAvailableBox`, the
dumb placeholder.

There is **no server CRUD in this system**. Figures are stored inside slides and
reports (S12); presets are derived from the run manifest (S8) and served inside
`getRunAuthoringContext`; the data reads are S9's run-keyed routes.

## lib config semantics

- **`normalizePOConfigForStorage`**: drops empty `filterBy` entries, collapses
  empty `valuesFilter`, canonicalizes the roll-up off-state to _both entry
  fields absent_ (`rollup`/`rollupPosition` kept only on the entry the
  `getEffectiveRollupDimension` gate selects). Deliberately save-time-only — the
  editor does not eagerly clear the flag on transient gate closures.
- **`getEffectivePOConfig`**: filters ineffective disaggregators with four
  recorded reasons (`filtered_to_one_value`, `single_value`, `single_period`,
  `single_year`); the **replicant exemption** applies to `single_value` only
  (fetches are pinned to one replicant value, so items-derived counts would see
  every replicant as single-valued). Two `singleValueDims` derivations:
  post-fetch from items (slice semantics) and editor-side from possible-values
  (whole-table).
- **`convertVisualizationType`**: drops disallowed disaggregations, remaps
  display slots through `VIZ_TYPE_CONFIG[newType].disDisplayOptFallbacks`,
  re-adds required disaggregations, resets content/style to type defaults.
  `usedOpts` is seeded with the destination's `defaultValuesDisDisplayOpt`
  BEFORE remapping — so a type's default values slot must not be a target of its
  own fallbacks, or the fallback is dead on arrival and the dimension gets
  shunted by the collision escape. This is why pie's values default is `cell`,
  not `series` (its `mapArea` fallback points at `series`, so a converted map's
  region dimension lands on Slices). It is also not `indicator`, for a sharper
  reason: `getDisaggregatorDisplayProp` returns `"--v"` for any slot the VALUE
  props claim and never reaches the disaggregation loop, so a dimension sharing
  that slot resolves to no axis at all and its rows collapse into panther's
  `Duplicate values` throw. Defaulting the values onto a slot the user is
  likely to want (Pies, Bars) makes that collision the common case rather than
  a hand-made one. Note chart→pie therefore KEEPS an `indicator` dimension on
  Pies rather than remapping it to Slices: that is the meaning-preserving
  conversion, since five coverage indicators repeat a mark, they do not
  partition a whole.
- **The pie type**: slices are panther's series axis and `indicator` is
  panther's repeat dimension — N pies tiled INSIDE each sub-chart, costing no
  disaggregation axis (slots: `series` = Slices, `indicator` = Pies,
  `cell` = Grid, `row`/`col`, `replicant`). `s.sortIndicatorValues` is REUSED as
  pie's slice sort (`sortSeriesValues`), which is why pie's `styleResets` —
  unlike map's — do not reset it (resets apply on switching TO a type and would
  wipe the sort on every entry). Both the `series` and
  `indicator` axes route through the `getAxisSort` dispatcher, which gives
  `indicator_common_id` the dictionary order on whichever axis it occupies. Four optional `s` fields: `pieInnerRadiusRatio`
  (0/absent = pie, `0.55` = doughnut; read `?? 0`), `pieGroupSmallSlices`
  (global-share fraction; 0/absent = off; maps to panther `groupSmallSlices`
  with a localized "Other" slice, id `--other`, sorted last),
  `pieCompletionMode` and `pieShowCenterValue`. Roll-up is excluded
  (`isRollupCandidateDimension`), CF is not offered (slices color via the series
  sentinel, not the values sentinel), calendar time dims are never offered, and
  `time_point` is allowed (survey rounds take a display slot — one pie per round
  — never pooled, same exception as map).
- **Completion pies**: `isPieCompletionMode(config, effectiveFormatAs)` in
  `presentation_objects.ts` is THE gate — the data config's
  `total: PIE_COMPLETION_TOTAL` and the style's `centerLabel` must both consult
  it, or the hole reports a share against a denominator the geometry never used.
  The envelope is `1`, not `100`: percent values are 0-1 fractions app-wide. It
  is checked against the EFFECTIVE format, so a flag stranded by a format change
  degrades to a plain cell-sum pie rather than drawing every count as a sliver.
  The editor's "Show each value against 100%" checkbox is gated on that same
  effective format, not on the metric's stored `formatAs` — gating on the
  stored value is what made the toggle unreachable for every HFA pie back when
  HFA metrics declared `"number"` (they now declare `"indicator"`; the
  effective format resolves per display — SYSTEM_10 § Effective format).
  Without it panther defaults to `total: "sum"` (each pie normalized by its own
  slices). The unfilled arc is panther's `remainder` track; slice data labels
  drop the series name when the slice axis carries the
  `NO_DISAGGREGATION_HEADER_ID` sentinel (every completion pie, since the
  indicator header beside the pie already names it).
- **PO config schema** (`_presentation_object_config.ts`): `d` = `configDStrict`
  (shared with the module-authoring repo), `s` = all-required flat style incl.
  the `cf*` fields, `t` = six plain-string/number fields. Reads are strict-throw
  (`parsePresentationObjectConfig`) — no permissive fallback. Duplicate display
  slots are allowed in storage; the UI warns and blocks render.
- **Conditional formatting**: storage = 16 flat `cf*` fields
  (`conditional_formatting_standalone.ts`, vendored to wb-fastr-modules);
  semantics = the `ConditionalFormatting` union with `selectCf` (flat→union) /
  `flattenCf` (union→flat) bridges and display-time `deriveBucketLabels`. The
  editor works purely on the union; `applyCfToTempConfig` fans the flat fields
  into batched store writes. `legacy_cf_presets.ts` maps the 9 legacy preset ids
  — consumed by the S2 po_config transform (Blocks 5/6) and as the thresholds
  editor's preset dropdown.
- **Replicant helpers**: `getReplicateByProp` is the filter-aware single source
  of truth for "active replicant" (safe on raw config);
  `getDisaggregatorDisplayProp` / `hasDuplicateDisaggregatorDisplayOptions` are
  deliberately NOT filter-aware (they receive effective configs).

## Replicant machinery

`replicate_by_options.tsx` exports two shells over one fetch effect:
`ReplicateByOptionsList` (the full-height `SelectList` beside the editor
preview) and `ReplicateByOptionsSelect` (the compact `Select`; zero consumers
today — Open item). Both fetch through the S9 cache
(`getReplicantOptionsFromCacheOrFetch`) with `excludeReplicantFilter: true`,
deep-tracked `filterBy`/`periodFilter` reads, and a tracked read of `p.scope` —
re-read inside the effect, not destructured, so a package or scope change
re-queries. There is no version key: the cache is keyed
`(runId, scopeToken, …)`, so a scope or package change lands on a DIFFERENT
entry rather than invalidating this one (D8). Statuses `too_many_values` (>500)
/ `no_values_available` / `error` are surfaced inline. Labels get Nigeria-admin
cleaning (`formatReplicantLabelForDisplay`), re-sorted only when cleaning
changed something.

## Open items

- **CF-editor unit convention for `rate_per_10k`** — the conditional-
  formatting editor's cutoff/domain inputs take raw stored values (bare
  rates, e.g. `0.00025`) while every rendered surface writes the ×10,000
  scaled count. Whether the editor should accept per-10,000 units and scale
  on save needs a ruling; unreachable today (no `"indicator"` metric surface
  resolves `rate_per_10k` in practice), noted while fixing the rate
  formatters (PLAN_EFFECTIVE_FORMAT F9).
- **Custom value orders are never pruned — ruling pending.**
  `normalizePOConfigForStorage` canonicalizes roll-up flags at save but does not
  touch `s.customValueOrder`, so entries survive for dimensions that were
  removed from the display and ids the data no longer returns. Current behavior
  is deliberate-latent: the style section always lists such an order with its
  reason and a clear button, and an unranked id is simply not ranked, so nothing
  renders wrong. The open question is prune-on-save versus keep-latent, and it
  turns on whether re-adding a dimension later should silently recover its old
  order (keep) or start clean (prune).
- **Dead code (zero importers/consumers):** `forms_editors/confirm_update.tsx`;
  `lib/types/dimension_definitions.ts` (barrel-exported, zero uses);
  `ReplicateByOptionsSelect`; the `allReplicants` download branch.
  (`forms_editors/conflict_resolution_modal.tsx` is NOT dead — it is the slide
  editor's per-slide conflict modal, S12.)
- **Stale white-fill comment**: `visualization_editor_inner.tsx:612` claims
  `getFigureAsCanvas` fills white pending a panther flag — current panther no
  longer fills; verify transparent PNG end-to-end and update or delete.
- **i18n gaps**: `window.alert` in `custom_series_styles.tsx`.
- Commented-out remnants: font-size sliders (`panel_text.tsx`), disaggregation
  chips (`insert_figure/metric_card.tsx`).
