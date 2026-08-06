# Plan: One Effective Format (pre-query, 3-way)

**Depends on [PLAN_MANIFEST_MIGRATIONS.md](PLAN_MANIFEST_MIGRATIONS.md)** for
the manifest field in §4. Everything else is independent of it.

Trigger: "Show each value against 100%" never appears for HFA pies. That is one
symptom of a value that is derived too late, from the wrong source, in four
places.

## 1. What is actually broken

### 1.1 The reported bug

The render path is correct — `isPieCompletionMode`
([presentation_objects.ts:315](lib/types/presentation_objects.ts#L315)) checks
the **effective** format, so an HFA pie with `pieCompletionMode: true` draws
right. The flag can never be set, because the toggle is gated on the **stored
metric** format ([_pie.tsx:60](client/src/components/visualization/presentation_object_editor_panel_style/_pie.tsx#L60)):

```tsx
<Show when={p.poDetail.resultsValue.formatAs === "percent"}>
```

`m10-01-01` / `m10-01-02` declare `formatAs: "number"` in the modules repo, and
correctly so — HFA indicator format is per-indicator via
`getHfaIndicatorMeasure(type, aggregation).kind`. The derivation that makes the
figure percent lives two layers downstream, where the editor cannot see it.

### 1.2 The deeper bug: filtering resolves the format backwards

[build_figure_inputs.ts:327](client/src/generate_visualization/build_figure_inputs.ts#L327):

```ts
const cols = config.d.disaggregateBy.map((d) => d.disOpt);
```

Only **disaggregated** columns are inspected, plus `selectedReplicantValue`.
`config.d.filterBy` is never consulted. So a chart filtered down to a single
percent indicator, not disaggregated by it, has no indicator column in its rows
at all → `sawIndicator` stays false → falls back to the metric format,
`"number"`. **Filtering to percent-only indicators makes the format go
backwards today.** Same for any chart that pins the indicator in `filterBy` and
disaggregates by something else.

This is why the post-query signal is the wrong signal, not merely a late one.

### 1.3 Four implementations

| Where | Basis | Problem |
| --- | --- | --- |
| [build_figure_inputs.ts:57](client/src/generate_visualization/build_figure_inputs.ts#L57) | items + indicatorMetadata | §1.2; post-query |
| editor components (8 sites) | stored metric `formatAs` | §1.1 |
| [_5_scorecard.ts:34](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts#L34) | per-indicator, 3-way | legitimately different (a scorecard mixes formats per row) |
| [_figure_block.ts:763](server/db/migrations/data_transforms/_figure_block.ts#L763) | all metadata, displayed-set-blind | no `ALWAYS_OBEY` escape hatch; can resolve a format the renderer disagrees with |

The 8 editor sites: `forceYMax1` visibility in
[_timeseries.tsx:132](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L132),
[:245](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L245),
[:335](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L335),
[_chart_like_controls.tsx:261](client/src/components/visualization/presentation_object_editor_panel_style/_chart_like_controls.tsx#L261),
`pieCompletionMode` visibility in `_pie.tsx:60`, and the conditional-formatting
`formatAs` prop in
[_table.tsx:119](client/src/components/visualization/presentation_object_editor_panel_style/_table.tsx#L119),
[_map.tsx:73](client/src/components/visualization/presentation_object_editor_panel_style/_map.tsx#L73),
[_chart_like_controls.tsx:187](client/src/components/visualization/presentation_object_editor_panel_style/_chart_like_controls.tsx#L187).

The CF ones are worse than a hidden control: the editor hands HFA users a raw
`NumberInput` capped at 1 instead of `PercentSelect`
([conditional_formatting_editor.tsx:247](client/src/components/visualization/conditional_formatting_editor.tsx#L247),
[:422](client/src/components/visualization/conditional_formatting_editor.tsx#L422))
while the rendered axis is in percent.

## 2. Target: one resolver, pre-query, config-based

```ts
resolveEffectiveFormat(args: {
  metricId: string;
  metricFormatAs: "percent" | "number";
  config: PresentationObjectConfig;
  indicatorFormats: Record<string, "percent" | "number" | "rate_per_10k">;
  possibleValues: { [K in DisaggregationOption]?: DisaggregationPossibleValuesStatus };
}): { formatAs: "percent" | "number" | "rate_per_10k"; source: "metric" | "displayed-indicators" }
```

Lives in `lib/`, beside `isPieCompletionMode` (already its main consumer).

**Displayed indicator set, from config alone:**

- for each `disaggregateBy` entry: if `disDisplayOpt === "replicant"` →
  `d.selectedReplicantValue` (single value); else → the `filterBy` entry for
  that `disOpt` if present, otherwise **all** possible values for it
- **plus** every `filterBy` entry whose `disOpt` is not in `disaggregateBy` —
  the §1.2 fix
- map values through `indicatorFormats`, ignore unknowns, resolve a non-metric
  format only if at least one known indicator was seen and all agree

No rows needed, so it updates the instant a filter changes, with no refetch.

Returning `source` collapses two things that travel side by side today:
`effectiveFormatAs` and `obeyMetricFormat` are separate arguments into
`buildStandardStyle` ([get_style_from_po.ts:44-53](client/src/generate_visualization/get_style_from_po.ts#L44-L53)) —
exactly the shape that invites one being forgotten.

`ALWAYS_OBEY_METRIC_FORMAT_METRICS` ([special_chart_checks.ts:26](client/src/generate_visualization/special_chart_checks.ts#L26))
keeps its meaning: m9-02-01's CIX/SII are derived measures over percent
indicators, and without the escape hatch 50 renders as "5000%".

## 3. The 3-way widening

`"percent" | "number" | "rate_per_10k"`. Metrics are authored 2-way
(`_metric_installed.ts:346`, `_module_definition_github.ts:308`); only
indicator-derived formats can be `rate_per_10k`. One type, three values,
applied at both ends.

- **Tick labels need no panther change.** `TickLabelFormatterOption` is
  `((v: number) => string) | "auto-number" | "auto-percent"`
  ([number_formatters.ts:340](panther/_000_utils/number_formatters.ts#L340)), and
  [_5_scorecard.ts:34-43](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts#L34-L43)
  already has the reference implementation:
  `getFormatterFunc("number", dp)(v * 10000)`. Apply it in `_1_standard`,
  `_2_coverage`, `_3_percent_change`, `_4_disruptions`.
- **Legend format is the exception — decide before building.** It is a 2-way zod
  enum with no function escape
  ([figure_inputs.ts:91,99](panther/_150_figure_schema/figure_inputs.ts#L91)),
  used by `getLegendFromConfig` and `buildMapAutoLegend`. Either a
  `rate_per_10k` figure gets a legend that silently drops the ×10000 (real and
  visible), or panther's legend format widens to accept a formatter function —
  symmetric with `tickLabelFormatter`, so a legitimate library-capability
  change, not app policy leaking in. **Recommendation: widen panther.** An axis
  and its legend disagreeing by a factor of 10,000 is not an acceptable
  end-state, and the asymmetry between the two format fields is a library wart
  independent of this work.
  - Panther edit + `./sync` from the panther repo, which copies its **working
    tree** wholesale: confirm panther typechecks first, and stage/commit the app
    changes BEFORE syncing so the sync diff stays isolated.
- Type `runMetricSchema.format_as` — currently bare `z.string()`
  ([run_manifest.ts:74](lib/types/run_manifest.ts#L74)).

## 4. Where `indicatorFormats` comes from

Pre-query, so not from the items payload. Two steps, one now and one that pays
for itself:

**4.1 Now — `resultsValueInfo` gains the field.**
[get_results_value_info.ts:60-61](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L60-L61)
already loads the **full** `IndicatorMetadata[]` server-side and throws away
everything but `label` to build `labelMap`. Exposing formats costs one payload
field, no new query, no new join. Same at the run-backed twin
([run_read.ts:957](server/run_query/run_read.ts#L957)).

A **flat** `indicatorFormats: Record<string, …>` on
`ResultsValueInfoForPresentationObject`, not `format_as` added to the
`{ id, label }` entries in `disaggregationPossibleValues`. Those entries look
like the natural home but are absent whenever a dimension came back
`too_many_values`, and a `filterBy` can still name specific indicators on such
a dimension. A flat map has no such hole.

Cost: `resultsValueInfo` is Valkey-cached as `_METRIC_INFO_CACHE`, whose version
hash is `PO_CACHE_VERSION` — so the remedy is a **`PO_CACHE_VERSION` bump**, not
a cache-prefix bump. That constant exists for exactly this case ("a code change
alters the MEANING of a cached results payload") and invalidates the stale
entries once, where a prefix bump would orphan every key until TTL.

**4.2 With the manifest data transform — the catalog moves into the manifest.**
`run_manifest.ts`'s header states the doctrine: *"Precomputed, never probed:
every fact the read path used to discover via per-request column probes is
stamped here."*
[getIndicatorMetadataFromRun](server/run_query/run_read.ts#L457) violates it —
per request it reads 5–8 input-mirror JSONs, re-sorts them in TS to replicate
the DB `ORDER BY`s, re-composes HFA labels, and re-derives format through
`getHfaIndicatorMeasure`. Its own comment admits it "mirrors
getIndicatorMetadata", a maintained pair.

Stamping resolved `IndicatorMetadata[]` per module into the manifest at finalize
deletes that function, its row schemas, and its sort duplication — and hands
the format map to every reader as a side effect. It is also the read path's
first step off the input mirrors (PLAN_MANIFEST_MIGRATIONS §10), and the
manifest transform's first real block: a pure recompute from `inputs/*.json`,
so it satisfies that plan's recompute-only invariant (§3) cleanly.

Two obligations that come with being the first block:

- `RUN_MANIFEST_SCHEMA_VERSION` bumps 2 → 3, so the forced gate transforms every
  existing package on the next boot.
- The block cannot call `getIndicatorMetadataFromRun` as it stands — it resolves
  paths by runId, not by the directory the transform is handed
  (PLAN_MANIFEST_MIGRATIONS §4.3). It needs a runDir-based variant first, which
  the finalize writer should then share so writer and transform are one code
  path.

Post-Phase-4 this is the end-state regardless: `getIndicatorMetadata` dies with
the snapshot tables.

## 5. Editor threading

`visualization_editor_inner.tsx` already holds `itemsHolder`; the resolver needs
only config + `resultsValueInfo`, both of which the panel already receives. So
the memo can live in `presentation_object_editor_panel.tsx` next to
`effectivePOConfigResult()`, and flow into the style and data panels as one
prop — replacing all 8 reads in §1.3.

- Resolve against `tempConfig` (the draft), not the saved config, so controls
  react to the edit in progress.
- Percent-only controls appearing and disappearing as filters change is correct
  behavior; keep the last resolved value across a pending refetch rather than
  falling back to the metric format, or they flicker.
- CF editors switch from `NumberInput`(max 1) to `PercentSelect` for HFA percent
  figures. **Display-only: the stored value is unchanged** (0.5 was typed as
  0.5, now shows as 50%). No migration.

## 6. Render authority — rides Phase 4

Config-based and items-based derivation can disagree: an indicator that is
possible-and-unfiltered but has no rows. Config sees it (→ number), items do not
(→ percent).

Make config-based authoritative **everywhere, render included**:

- format is an authoring fact, not a data fact — an axis should not flip to raw
  counts because this month's extract came back empty for one indicator
- stable across data refreshes, so a saved slide cannot silently re-format
- editor and render agree by construction

Cost: a stored `FigureBundle` has no `resultsValueInfo`, so the resolved format
must travel **on the bundle** → migration + forced skip-gate + cache prefix,
across ~17k bundles.

**Phase 4 already schedules exactly that migration** (figure provenance re-keys
to runId, same three layers, same bundle count). Ride it and the bill is paid
once. Until then, `buildFigureInputs` keeps deriving from items — the one
knowingly-retained duplicate, with a pointer comment to this section.

Rejected alternative: config-based for editor gates only, items-based at render.
That re-creates §1.1 in a new place — the editor offering a toggle the renderer
ignores, or hiding one it would have honoured.

## 7. Build order

1. `resolveEffectiveFormat` in `lib/`, 3-way, with the `filterBy` fix. Unit-verify
   by executing (`deno run --allow-all -c deno.json`), including: filtered-to-one
   percent indicator; mixed formats; `ALWAYS_OBEY` metric; all-`rate_per_10k`;
   `too_many_values`.
2. Panther legend decision → panther edit → `./sync` (staging discipline in §3).
3. 3-way through the four style builders + legend builders.
4. `indicatorFormats` on `resultsValueInfo` (both engines) + `PO_CACHE_VERSION`
   bump.
5. Editor threading; delete all 8 stored-format reads.
6. `_figure_block.ts`'s `inferFormatAs` calls the lib resolver; `_5_scorecard.ts`
   gets a pointer comment saying why it stays per-indicator.
7. Manifest `indicators[]` catalog as the first transform block (schema version
   2 → 3) + delete `getIndicatorMetadataFromRun`'s derivation — after
   PLAN_MANIFEST_MIGRATIONS items 1–4 are in.
8. Bundle field + render authority — with Phase 4.

Steps 1–6 ship independently and fix the reported bug. Step 7 wants the manifest
transform mechanism. Step 8 wants Phase 4.

## 8. Open items

- **`too_many_values` / `error` on an unfiltered indicator dimension** — cannot
  enumerate, so fall back to the metric format. The cap is 500 named values
  (`MAX_REPLICANT_OPTIONS`, `server/server_only_funcs_presentation_objects/consts.ts`);
  HFA indicator counts are well under it and the dimensions that do exceed it
  (facilities) carry no indicator ids, so this should be theoretical. Confirm
  against the largest real HFA package before relying on that.
- **Divergence on possible-but-empty indicators** (§6) — the deliberate
  behavior change is that the format stops depending on data presence. Worth one
  live comparison on a real HFA project before step 8 makes it authoritative.
- **Mixed-format figures below the scorecard** — a chart mixing percent and
  count indicators resolves to the metric format and renders both on one axis.
  Out of scope here; the scorecard is the only surface that formats per row
  today. Noting it because §2's "all agree" rule is where a future fix would
  hook in.
