# PLAN — Config-centric figure editing for slide decks & reports

Status: DRAFT (report-only; no code yet). Author handoff doc — written to be
mechanical to implement.

## 1. Problem

A figure embedded in a slide or report is stored as a `FigureBundle`
([lib/types/_figure_bundle.ts:96-119](lib/types/_figure_bundle.ts#L96-L119)).
The AI can **create** one two ways — `from_metric` (instantiate a preset) or
`from_visualization` (clone a saved viz) — but once created there is:

- **No way to edit it.** "Change the replicant on this slide figure" has no verb.
  `update_slide_editor.blockUpdates` only accepts a *whole* new `from_metric` /
  `from_visualization` block, and neither can express an arbitrary config, so an
  existing figure's settings cannot be tweaked in place.
- **No read visibility.** `get_slide_editor`'s figure summary prints only
  `metric` + `type` and then a raw data dump that ignores
  `selectedReplicantValue` entirely
  ([extract_blocks_from_layout.ts:76-94](client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts#L76-L94)).
  The AI cannot see the active replicant, the per-dimension display slots, or the
  available replicant values — so even a patch would be blind.

This affects slide decks **and** reports identically (the report editor shares
the same resolvers — [report_editor.ts:5-6](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L5-L6)).

## 2. Core principle (the whole plan follows from this)

> A figure is **fully described by `bundle.config`** (`d` data spec + `t`
> captions). `items` are a pure function of `(metricId, config)`. The bundle
> already stores `metricId`. Therefore **any figure can be re-resolved from
> `bundle.metricId` + a (patched) `config`, regardless of how it was created** —
> the source viz is irrelevant after creation.

`from_metric` and `from_visualization` are not figure *kinds*; they are two ways
to **seed an initial `config`**. "User adds custom" seeds a config too. After
seeding, every figure is "a config bound to a metric." So:

- **Edit = patch `config`, re-resolve `items`, rebuild bundle.** Origin-agnostic.
- **Recreate = supply a full `config` for a metric.** A generalized `from_metric`.

Items re-resolution keys off `metricId` (always present in the bundle) — it never
needs the source visualization.

## 3. Architecture

Three pieces, built in two phases.

```
                 ┌─────────────────────────────────────────────┐
                 │  AiFigureConfigPatchSchema  (lib/ai_input)   │  ← ONE schema
                 │  derived from configDStrict.shape + captions │
                 └─────────────────────────────────────────────┘
                     │ used by ↓            │ used by ↓        │ used by ↓
        from_metric overrides     from_visualization      update_figure
                     │                      │                  │
                     ▼                      ▼                  ▼
        ┌────────────────────────────────────────────────────────────┐
        │  resolveBundleFromMetricAndConfig(projectId, metric, config)│ ← ONE core
        │   getFetchConfig → validate replicant → fetch items → bundle│
        └────────────────────────────────────────────────────────────┘
```

- **Phase 1 — SLIDE DECKS ONLY (do this first):** read visibility +
  `update_figure` for slides. Closes the filed bug AND delivers "change the
  replicant for any slide figure, however created." Reuses existing resolve
  plumbing. **Reports are deliberately out of scope here** — prove the
  config-centric model on the simpler write surface first.
- **Phase 2 (optional, slides):** generalize `from_metric` to author arbitrary
  configs (preset becomes an optional seed). Only needed if the AI must *create*
  novel replicated figures where no preset/viz exists.
- **Phase 3 — REPORTS (later, after decks are proven):** apply the same core to
  report figures. Sketched in **Appendix A**; not fully designed yet.

### Build the core reports-agnostic (load-bearing constraint)

The shared core — `AiFigureConfigPatchSchema`, `applyFigureConfigPatch`,
`resolveBundleFromMetricAndConfig`, `formatFigureConfigForAI` — **must take plain
inputs (metric + config + bundle) and know nothing about slides**: no `tempSlide`,
no layout types, no slide context. The ONLY slide-specific code is the thin
wrapper that locates a block and writes it back. Hold this boundary and Phase 3
(reports) is just a second wrapper around the same core, not a refactor.

### Scope boundaries (decisions baked in)

- **`config.s` (style) is OUT of the AI surface.** Expose only `d` + `t`. Style
  stays deck/preset-driven, matching today's `from_metric`
  ([build_config_from_metric.ts:61](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts#L61) seeds `DEFAULT_S_CONFIG`).
- **Array patches replace whole** (`disaggregateBy`, `filterBy`) — never merge.
- **`periodFilter` patch requires both `min` & `max`** → a `custom` filter
  (mirrors the existing `startDate`/`endDate` pair; avoids the open-ended
  data-bounds fetch). Pass `null` to clear.
- **Replicant validation is strict** (throw with the valid-value list) — matches
  the current `from_metric` policy, not the auto-default editor policy.

---

## 4. Shared schema — `AiFigureConfigPatchSchema`

**File:** `lib/types/ai_input.ts` (add near the figure schemas). Derive every
field from the storage schema so types stay locked to `configDStrict`
([lib/types/_metric_installed.ts:151-173](lib/types/_metric_installed.ts#L151-L173))
and the caption fields from `presentationObjectConfigTStrict`
([lib/types/_presentation_object_config.ts:89-95](lib/types/_presentation_object_config.ts#L89-L95)).

```ts
export const AiFigureConfigPatchSchema = z.object({
  // ── config.d (data spec) ──
  type: configDStrict.shape.type.optional()
    .describe("Presentation type: timeseries | table | chart | map."),
  timeseriesGrouping: configDStrict.shape.timeseriesGrouping // already .optional()
    .describe("Time-axis grouping; only meaningful for timeseries."),
  valuesDisDisplayOpt: configDStrict.shape.valuesDisDisplayOpt.optional()
    .describe("Display slot for the values dimension. Valid slots depend on type."),
  valuesFilter: z.union([configDStrict.shape.valuesFilter, z.null()]).optional()
    .describe("Which value properties to show, or null to show all."),
  disaggregateBy: configDStrict.shape.disaggregateBy.optional()
    .describe("Replaces ALL disaggregations. Each is { disOpt, disDisplayOpt }; "
      + "set a dimension's disDisplayOpt to 'replicant' to replicate by it."),
  filterBy: configDStrict.shape.filterBy.optional()
    .describe("Replaces ALL data filters. Empty array clears."),
  selectedReplicantValue: z.union([z.string(), z.null()]).optional()
    .describe("Which replicant value to show (e.g. 'opd'); null to clear. "
      + "Only meaningful when a disaggregation is displayed as 'replicant'."),
  includeAdminAreaRollup: configDStrict.shape.includeAdminAreaRollup // optional
    .describe("Add an admin-area total row (constraints apply; error if unavailable)."),
  adminAreaRollupPosition: configDStrict.shape.adminAreaRollupPosition // optional
    .describe("'top' or 'bottom'; defaults to bottom."),
  periodFilter: z.union([
    z.object({
      min: z.number().describe("Start period (YYYY / YYYYQ / YYYYMM)."),
      max: z.number().describe("End period."),
    }),
    z.null(),
  ]).optional().describe("Time range filter, or null to clear."),

  // ── config.t (captions) ──
  caption: presentationObjectConfigTStrict.shape.caption.optional(),
  subCaption: presentationObjectConfigTStrict.shape.subCaption.optional(),
  footnote: presentationObjectConfigTStrict.shape.footnote.optional(),
});

export type AiFigureConfigPatch = z.infer<typeof AiFigureConfigPatchSchema>;
```

> Note: this is derived from the **storage schema** (`configDStrict`), not copied
> from any existing tool. The field set is intentionally the data-shape subset a
> figure needs; `s`/style is excluded by design.

---

## 5. Pure patch applier — `applyFigureConfigPatch`

**New file:** `client/src/generate_visualization/apply_figure_config_patch.ts`
(pure; no fetches). Maps a patch onto an existing config, returning a fresh copy.

```ts
import type { PresentationObjectConfig } from "lib";
import type { AiFigureConfigPatch } from "lib";
import { convertPeriodValue } from "~/components/slide_deck/slide_ai/build_config_from_metric";
import type { PeriodOption } from "lib";

export function applyFigureConfigPatch(
  config: PresentationObjectConfig,
  patch: AiFigureConfigPatch,
  periodOption: PeriodOption | undefined, // metric.mostGranularTimePeriodColumnInResultsFile
): PresentationObjectConfig {
  const d = { ...config.d };
  const t = { ...config.t };

  if (patch.type !== undefined) d.type = patch.type;
  if (patch.timeseriesGrouping !== undefined) d.timeseriesGrouping = patch.timeseriesGrouping;
  if (patch.valuesDisDisplayOpt !== undefined) d.valuesDisDisplayOpt = patch.valuesDisDisplayOpt;
  if (patch.valuesFilter !== undefined) d.valuesFilter = patch.valuesFilter === null ? undefined : patch.valuesFilter;
  if (patch.disaggregateBy !== undefined) d.disaggregateBy = patch.disaggregateBy;
  if (patch.filterBy !== undefined) d.filterBy = patch.filterBy;
  if (patch.selectedReplicantValue !== undefined) {
    d.selectedReplicantValue = patch.selectedReplicantValue === null ? undefined : patch.selectedReplicantValue;
  }
  if (patch.includeAdminAreaRollup !== undefined) d.includeAdminAreaRollup = patch.includeAdminAreaRollup;
  if (patch.adminAreaRollupPosition !== undefined) d.adminAreaRollupPosition = patch.adminAreaRollupPosition;
  if (patch.periodFilter !== undefined) {
    if (patch.periodFilter === null) {
      d.periodFilter = undefined;
    } else {
      if (!periodOption) throw new Error("Cannot set periodFilter: metric has no time period column");
      d.periodFilter = {
        filterType: "custom",
        min: convertPeriodValue(patch.periodFilter.min, periodOption, false),
        max: convertPeriodValue(patch.periodFilter.max, periodOption, true),
      };
    }
  }

  if (patch.caption !== undefined) t.caption = patch.caption;
  if (patch.subCaption !== undefined) t.subCaption = patch.subCaption;
  if (patch.footnote !== undefined) t.footnote = patch.footnote;

  return { ...config, d, t };
}
```

Per-type validity (which `disDisplayOpt` slots are valid for which `type`) is
enforced in the resolve core / handler, not here. Reuse the existing maps in
[visualization_editor.tsx:70-82](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L70-L82)
by extracting `VALID_DIS_DISPLAY` / `VALID_VALUES_DISPLAY` into a shared module
(`lib` or `~/generate_visualization`) so both call sites share one source.

---

## 6. Shared resolve core — `resolveBundleFromMetricAndConfig`

This unifies the replicant validation currently inlined in the `from_metric` AI
adapter ([resolve_figure_from_metric.ts:34-68](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts#L34-L68))
so `update_figure` and `from_metric` share one path.

**New file:** `client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`

```ts
import type { FigureBundle, MetricWithStatus, PresentationObjectConfig } from "lib";
import { getFetchConfigFromPresentationObjectConfig, getReplicateByProp } from "lib";
import { resolveFigureBundleFromMetric } from "./resolve_figure_from_metric";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";

export async function resolveBundleFromMetricAndConfig(
  projectId: string,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  if (metric.status !== "ready") {
    throw new Error(`Metric "${metric.id}" is not ready (status: ${metric.status})`);
  }

  const resFetch = getFetchConfigFromPresentationObjectConfig(metric, config);
  if (!resFetch.success) throw new Error(resFetch.err);

  // Strict replicant validation (mirrors current from_metric policy).
  const replicateBy = getReplicateByProp(config);
  if (replicateBy) {
    const resOptions = getFetchConfigFromPresentationObjectConfig(
      metric, config, { excludeReplicantFilter: true },
    );
    if (!resOptions.success) throw new Error(resOptions.err);
    const optRes = await getReplicantOptionsFromCacheOrFetch(
      projectId, metric.resultsObjectId, replicateBy, resOptions.data,
    );
    if (optRes.success && optRes.data.status === "ok") {
      const valid = optRes.data.possibleValues;
      const sel = config.d.selectedReplicantValue;
      if (!sel) {
        throw new Error(`This figure replicates by "${replicateBy}" and needs a `
          + `selectedReplicantValue. Valid values: ${valid.map(v => v.label).join(", ")}`);
      }
      if (!valid.some(v => v.id === sel)) {
        throw new Error(`Invalid replicant value "${sel}" for metric "${metric.id}". `
          + `Valid values: ${valid.map(v => v.label).join(", ")}`);
      }
    }
  }

  return resolveFigureBundleFromMetric(
    projectId,
    {
      metricId: metric.id,
      resultsObjectId: metric.resultsObjectId,
      mostGranularTimePeriodColumnInResultsFile: metric.mostGranularTimePeriodColumnInResultsFile,
      moduleLastRun: "", // matches current from_metric adapter; provenance is informational
      resultsValueForViz: {
        formatAs: metric.formatAs,
        valueProps: metric.valueProps,
        valueLabelReplacements: metric.valueLabelReplacements,
      },
      fetchConfig: resFetch.data,
    },
    config,
  );
}
```

**Refactor** `resolveFigureFromMetric`
([client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts))
to: `buildConfigFromPreset(block, metrics)` → `validateMetricInputs` (keep) →
`resolveBundleFromMetricAndConfig(projectId, resultsValue, config)`. Delete the
now-duplicated inline replicant block. Net behavior identical for existing
`from_metric` calls.

> `MetricWithStatus` carries `id`, `resultsObjectId`,
> `mostGranularTimePeriodColumnInResultsFile`, `formatAs`, `valueProps`,
> `valueLabelReplacements`, `disaggregationOptions`, `postAggregationExpression`,
> `vizPresets`, `status`. Confirm `moduleLastRun` availability before using it;
> otherwise keep `""` as above.

---

## 7. Phase 1a — Read visibility

### 7.1 Shared figure-config formatter

**New file:**
`client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts`

```ts
export async function formatFigureConfigForAI(
  projectId: string,
  metric: MetricWithStatus | undefined,
  config: PresentationObjectConfig,
): Promise<string>
```

Emits (in order):

1. `Metric: <metricId>` · `Type: <config.d.type>`
2. **Disaggregations** — one line per `disaggregateBy`:
   `- <disOpt> → <disDisplayOpt>` with ` (REPLICANT)` appended when
   `getReplicateByProp(config) === disOpt`.
3. **Filters** — one line per `filterBy`: `- <disOpt>: <values join>`.
4. **Replicant** (only when `getReplicateByProp(config)` is defined):
   - `Replicate by: <dim>`
   - `Selected replicant: <config.d.selectedReplicantValue ?? "(none — INVALID, must set)">`
   - `Available replicant values: <id (label), …>` — fetch with
     `getFetchConfigFromPresentationObjectConfig(metric, config, { excludeReplicantFilter: true })`
     → `getReplicantOptionsFromCacheOrFetch(...)`. On `too_many_values` /
     `no_values_available` / fetch-fail, print the status instead of a list.
5. `Values filter:` (or "showing all"), `Period filter:` (decoded), captions.
6. **Available options** (so a patch isn't blind):
   - `Available dimensions: <metric.disaggregationOptions[].value + label>`
   - `Valid display slots for <type>: <VALID_DIS_DISPLAY[type]>`

This is the slide/report counterpart of the existing metric-data formatter and
deliberately **does not** depend on the viz editor.

### 7.2 Wire into `get_slide_editor`

Replace the figure branch of `simplifySlideForAI`
([extract_blocks_from_layout.ts:76-94](client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts#L76-L94)):

```ts
// Figure block
if (block.bundle) {
  const metric = (metrics ?? []).find(m => m.id === block.bundle!.metricId);
  const cfg = await formatFigureConfigForAI(projectId, metric, block.bundle.config);
  let data = "";
  try {
    data = await getDataFromConfig(projectId, block.bundle.metricId, metrics ?? [], block.bundle.config);
  } catch (err) { data = `(data unavailable: ${err})`; }
  return { id, summary: cfg + "\n\n" + data };
}
return { id, summary: "Figure (no data)" };
```

### 7.3 Make the data excerpt replicant-aware

`getDataFromConfig` → `getMetricDataForAI` currently ignores
`selectedReplicantValue`
([format_metric_data_for_ai.ts:528-557](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L528-L557)),
so the data dump shows all replicant values. Fold the replicant pin into the
query inside `getDataFromConfig`:

```ts
const filters = getFiltersWithReplicant(config); // from lib (already pins selectedReplicantValue)
```

instead of `const filters = config.d.filterBy;`. (`getFiltersWithReplicant` is in
[lib/get_fetch_config_from_po.ts:411-427](lib/get_fetch_config_from_po.ts#L411-L427)
— export it if not already.) This makes the excerpt match the rendered figure.
The `getMetricDataForAI` "Filtered by:" line will then also surface the replicant
pin for free.

### 7.4 Report editor read — DEFERRED to Phase 3

Out of scope for Phase 1. See **Appendix A**.

---

## 8. Phase 1b — `update_figure` tool

### 8.1 Slide editor

**File:** `client/src/components/project_ai/ai_tools/tools/slide_editor.tsx` — add
a third tool to `getToolsForSlideEditor`.

```ts
createAITool({
  name: "update_figure",
  description:
    "Change the configuration of an existing figure block on this slide — works "
    + "regardless of how the figure was created. Provide the blockId (from "
    + "get_slide_editor) and only the fields you want to change. The figure's data "
    + "is re-queried automatically. Changes are LOCAL until the user clicks Save.",
  inputSchema: z.object({
    blockId: z.string().describe("Figure block ID from get_slide_editor."),
    patch: AiFigureConfigPatchSchema,
  }),
  handler: async (input) => {
    const ctx = getAIContext();
    if (ctx.mode !== "editing_slide") throw new Error("Only available when editing a slide");

    const slide = unwrap(ctx.getTempSlide());
    if (slide.type !== "content") throw new Error("Figures only exist on content slides");

    // 1. locate the block + assert it's a figure
    const found = extractBlocksFromLayout(slide.layout).find(b => b.id === input.blockId);
    if (!found) {
      const ids = extractBlocksFromLayout(slide.layout).map(b => b.id).join(", ");
      throw new Error(`Block "${input.blockId}" not found. Block IDs: ${ids}`);
    }
    if (found.block.type !== "figure" || !found.block.bundle) {
      throw new Error(`Block "${input.blockId}" is not a figure.`);
    }
    const bundle = found.block.bundle;

    // 2. metric + patched config
    const metric = metrics.find(m => m.id === bundle.metricId);
    if (!metric) throw new Error(`Metric "${bundle.metricId}" not found in this project.`);
    const newConfig = applyFigureConfigPatch(
      bundle.config, input.patch, metric.mostGranularTimePeriodColumnInResultsFile,
    );

    // 3. per-type display-slot validation (shared VALID_DIS_DISPLAY / VALID_VALUES_DISPLAY)
    validateDisplaySlots(newConfig); // throws with a clear message on invalid slot/type combo

    // 4. re-resolve → new bundle (throws on bad replicant / no-data / too-many)
    const newBundle = await resolveBundleFromMetricAndConfig(projectId, metric, newConfig);

    // 5. replace the block's bundle in the layout, commit to tempSlide
    const updatedSlide = replaceFigureBundleInLayout(slide, input.blockId, newBundle);
    ctx.setTempSlide(reconcile(updatedSlide));
    return `Updated figure ${input.blockId}. Preview updated; user must Save to persist.`;
  },
  inProgressLabel: "Updating figure...",
  completionMessage: "Updated figure",
});
```

Helpers:

- `replaceFigureBundleInLayout(slide, blockId, bundle)` — a layout tree walk that
  swaps `node.data = { type: "figure", bundle }` at the matching item id. Model
  it on `updateLayoutNode` in
  [get_slide_with_updated_blocks.ts](client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts).
- `validateDisplaySlots(config)` — uses the shared `VALID_DIS_DISPLAY` /
  `VALID_VALUES_DISPLAY` maps; throw "nothing changed" style errors BEFORE the
  re-resolve (the re-resolve is the irreversible/expensive step).

**Error contract:** every throw must mean "no change applied." Validate (steps
1–3) before any mutation; only `setTempSlide` after a successful re-resolve.

### 8.2 Report editor — DEFERRED to Phase 3

Out of scope for Phase 1. See **Appendix A**.

---

## 9. Phase 2 (optional) — generalize `from_metric` to author arbitrary configs

Goal: let the AI **create** a figure with an arbitrary config (incl. a replicant
the AI defines) where no matching preset exists — the universal "recreate any
bundle" path your read output enables.

Change `AiFigureFromMetricSchema`
([ai_input.ts:96-140](lib/types/ai_input.ts#L96-L140)):

- Make `vizPresetId` **optional** (seed; omit to start from metric defaults).
- Add an optional `config: AiFigureConfigPatchSchema` applied AFTER the seed.

`buildConfigFromPreset` becomes `buildConfigForMetric(block, metrics)`:

1. Seed `config.d`:
   - if `vizPresetId` given → `preset.config.d` (current behavior);
   - else → a new `buildDefaultConfigForMetric(metric, type)` helper (**the one
     genuinely new sub-design** — sensible defaults: required disaggregations,
     `valuesDisDisplayOpt`, empty filters). Decide defaults explicitly.
2. Seed `config.s` = `DEFAULT_S_CONFIG` (+ preset.s if present).
3. Seed `config.t` = `DEFAULT_T_CONFIG` (+ `caption: block.chartTitle`).
4. If `block.config` present → `applyFigureConfigPatch(config, block.config, metric.mostGranular...)`.
5. Keep the existing `selectedReplicant` / `filters` / `valuesFilter` /
   `startDate`/`endDate` fields working (or fold them into `config` and
   deprecate — decide; folding is cleaner but a wider change to the system prompt).

Then `resolveFigureFromMetric` calls `resolveBundleFromMetricAndConfig` exactly as
in Phase 1, so authoring and editing share the same validation + resolve.

**Defer Phase 2** until Phase 1 is proven; it carries the only real open design
question (presetless default config).

---

## 10. File-change checklist

Phase 1 — SLIDE DECKS ONLY. The first six items are the **reports-agnostic core**
(reused verbatim in Phase 3); the last three are the slide-specific wrapper +
system prompt. No `report_editor.ts` changes in this phase.

Core (reports-agnostic — no slide imports):

- [ ] `lib/types/ai_input.ts` — add `AiFigureConfigPatchSchema` + type (§4).
- [ ] Extract `VALID_DIS_DISPLAY` / `VALID_VALUES_DISPLAY` from
      `visualization_editor.tsx` into a shared module; add `validateDisplaySlots`.
- [ ] `client/src/generate_visualization/apply_figure_config_patch.ts` — new (§5).
- [ ] `client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts` — new (§6).
- [ ] Refactor `slide_ai/resolve_figure_from_metric.ts` to use the core (§6).
- [ ] `_internal/format_figure_config_for_ai.ts` — new (§7.1).
- [ ] `_internal/format_metric_data_for_ai.ts` — `getDataFromConfig` folds
      `getFiltersWithReplicant` (§7.3); export `getFiltersWithReplicant` from lib.

Slide-specific wrapper:

- [ ] `extract_blocks_from_layout.ts` — figure branch → structured summary (§7.2).
- [ ] `slide_editor.tsx` — add `update_figure` tool + layout helpers (§8.1).
- [ ] `build_system_prompt.ts` — document the new verb (slide mode) + that slide
      figures are editable.

Phase 2 (optional, slides):

- [ ] `ai_input.ts` — `vizPresetId` optional, add `config` to `from_metric`.
- [ ] `build_config_from_metric.ts` — `buildConfigForMetric` + `buildDefaultConfigForMetric`.

Phase 3 — REPORTS (later; see Appendix A). Reuses the entire core unchanged.

## 11. Edge cases / rigor

- **Replicant invalidated by a disagg/filter change.** Patching `disaggregateBy`
  or `filterBy` can drop the replicant dim or strand `selectedReplicantValue`.
  The strict validation in §6 throws with the valid list; the AI then re-patches.
  (Alternative: auto-default like `resolveDefaultReplicant`. Strict is chosen for
  feedback parity with `from_metric`; revisit if it's too chatty.)
- **`too_many_items` / `no_data_available`.** `resolveFigureBundleFromMetric`
  throws ([resolve_figure_from_metric.ts:65-67](client/src/generate_visualization/resolve_figure_from_metric.ts#L65-L67));
  surface as a tool error — block unchanged (validate-before-mutate ordering).
- **`includeAdminAreaRollup` gate.** Re-validate against the *patched* config with
  `getEffectiveRollupLevel` and throw before mutating (the
  [visualization_editor.tsx:156-172](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L156-L172)
  pattern) — fold into `validateDisplaySlots` or a sibling guard.
- **Duplicate display slots.** Allowed in storage but block render
  ([_metric_installed.ts:174-175](lib/types/_metric_installed.ts#L174-L175)).
  Optionally reject in `validateDisplaySlots` for a cleaner AI error.
- **Provenance/`snapshotAt`.** Refreshed by `resolveFigureBundleFromMetric` on
  every re-resolve — correct (the figure is genuinely re-queried).
- **`config.s` preserved.** `applyFigureConfigPatch` spreads `...config` so the
  original style survives untouched across edits.

## 12. Open decisions for Tim

These apply to the Phase 1 (slide-deck) scope:

1. Strict replicant validation (throw + list) vs auto-default-to-first on edit.
   Plan assumes **strict**.
2. Phase 2 presetless `buildDefaultConfigForMetric` defaults — needed only if you
   want AI to author replicants from scratch in decks. Defer?
3. Whether to keep the data excerpt in `get_slide_editor` at all once the
   structured config + options are shown, or trim it to reduce tokens.

Reports-phase decisions are parked in Appendix A.

---

## Appendix A — Reports (Phase 3, later; not yet fully designed)

Apply the same reports-agnostic core (§4–§7.1, §7.3) to report figures once the
slide implementation is proven. Reports differ structurally from slides, so only
the **wrapper** is new — but the wrapper is trickier:

**Read** (`get_report_editor`): today it surfaces only the figure ids
(`figure:<id>`) — far blinder than slides
([report_editor.ts:184](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L184)).
Render `formatFigureConfigForAI(projectId, metric, fig.bundle.config)` per
registered figure (`ctx.getFigures()` → `Record<id, FigureBlock>`). **Decide
inline-vs-drill-down here:** a report can hold many figures, and inlining every
figure's config *plus* its replicant-options fetch means N round-trips per read.
Leaning toward a shared `get_figure(id)` drill-down tool (lightweight index in the
editor read, full spec + options on demand) — but that's a tools-alignment call to
settle at the start of this phase.

**Write** (`update_figure` for reports): structurally different from slides —

- Figures live in an append-only **registry** keyed by `figureId`, referenced by
  `![caption](figure:<id>)` body tokens; there is no layout tree.
- Edits go through `ctx.proposeEdit({ newBody, addFigures, summary })` — a
  **diff the user accepts/rejects** — not slides' local-until-Save.
- The established `replace_figure` pattern **mints a new id and rewrites the body
  token** on every change ([report_editor.ts:372-394](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L372-L394)),
  because the accept/reject diff is body-based, so a same-id registry swap would
  produce an empty diff. So `update_figure` for reports = `replace_figure`
  mechanics (load bundle → patch → re-resolve → mint new id → swap token,
  preserving the markdown caption → `proposeEdit`), **not** an in-place mutation.

**Caption ambiguity (reports only):** the markdown token caption
(`![caption](figure:id)`, alt-text in the body) is a DIFFERENT field from the
chart's own `config.t.caption`. The patch touches `config.t.*`; the markdown
caption must be preserved/handled separately (as `replace_figure` already does).

**Phase 3 open decisions:**

1. Inline full config in `get_report_editor` vs a shared `get_figure(id)`
   drill-down (and whether to retrofit the drill-down to slides for symmetry).
2. New-id-per-edit (matches `replace_figure`, churns ids, orphans old figures) vs
   teaching `proposeEdit` a registry-only (no-body) figure change to keep stable
   ids. Former is least friction; latter is cleaner identity.
