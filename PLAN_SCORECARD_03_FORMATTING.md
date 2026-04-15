# PLAN: Scorecard Phase 3 — Per-Indicator Formatting & Thresholds

Per-indicator format (`percent` / `number` / `rate_per_10k`), decimal places, and threshold colour cutoffs flow from the catalog (phase 1) into the scorecard style closure via a client-side catalog lookup keyed by label. Completes the in-progress deprecation of `client/src/generate_visualization/conditional_formatting_scorecard.ts` and deletes it.

Depends on phase 1 (catalog has format and threshold columns) and phase 2 (m008's metric produces one row per scorecard_indicator per area-period).

## The core problem

Formatting is metric-level today: [`_0_common.ts:108-122`](client/src/generate_visualization/get_style_from_po/_0_common.ts#L108-L122) builds a single style closure with one `formatAs` and one threshold function applied uniformly across every cell in the table.

A scorecard needs **per-row (per-indicator) styling** — penta3 coverage is a percent with an 80/70 threshold; HTN new cases is "per 10k" with a 10/20 threshold (lower-is-better); they sit in the same table.

## The approach: label-based catalog lookup

The existing scorecard renderer at [conditional_formatting_scorecard.ts:233-290](client/src/generate_visualization/conditional_formatting_scorecard.ts#L233-L290) already uses **label-based lookup**. The hardcoded `_SCORECARD` map at lines 23-217 maps raw IDs to `{group, thresholdType, label}`; at render time the code rewrites each row's `indicator_common_id` to the display label, sets `colGroupProp = "group"` so indicators render as columns grouped by category, then attaches a `tableCells.func` that reads `info.colHeader` (the column header label) to look up the threshold via a `label → thresholdType` map.

That pattern is correct in shape — **indicators are columns in the scorecard table**, and `info.colHeader` at render time is the indicator's display label. Phase 3 preserves the label-based approach verbatim; the only change is sourcing the label-to-metadata map from the catalog instead of a hardcoded constant.

**No row-index plumbing, no `TableCellInfo.i_row` / `i_col` threading, no type-system extensions.** Phase 2's metric result is enough as-is. Phase 3 adds a client-side catalog hook and rewires the existing scorecard style function to read from it.

**Label uniqueness** (enforced at catalog save time and at DB level via `UNIQUE` constraint — see [PLAN_SCORECARD_01_CATALOG.md §1.1](PLAN_SCORECARD_01_CATALOG.md)) is what makes label-based lookup safe. Two scorecard indicators with the same label would produce ambiguous lookups; the uniqueness constraint prevents this.

## 3.1 — Client-side catalog hook

The reactive cache from phase 1 §1.6 (`getScorecardIndicatorsFromCacheOrFetch`) is already wired into `instanceState.scorecardIndicatorsVersion` and auto-refreshes on the `scorecard_indicators_updated` SSE event. Phase 3 just adds a consumer-side helper that builds a label-keyed map:

```ts
export function getScorecardIndicatorsByLabelMap(
  indicators: ScorecardIndicator[],
): Map<string, ScorecardIndicator> {
  return new Map(indicators.map((si) => [si.label, si]));
}
```

The scorecard figure-inputs builder calls `getScorecardIndicatorsFromCacheOrFetch` once at build time, passes the resulting array through `getScorecardIndicatorsByLabelMap`, and captures the map into the style closure.

## 3.2 — Relocate scorecard figure-inputs logic into `_5_scorecard.ts`

**File:** [`client/src/generate_visualization/get_style_from_po/_5_scorecard.ts`](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts)

Today `_5_scorecard.ts` is a placeholder that delegates to `buildStandardStyle`. Phase 3 replaces it with a real implementation that absorbs everything currently in `conditional_formatting_scorecard.ts`:

1. The `_SCORECARD` map → catalog lookup.
2. The per-row `indicator_common_id` label rewrite → catalog-sourced labels.
3. The `group` field injection → catalog-sourced `group_label`.
4. `colGroupProp = "group"` → preserved.
5. The `tableCells.func` threshold lookup → per-row cutoff function built from catalog fields.
6. The `textFormatter` → per-row formatter built from catalog fields.
7. The legend → preserved (same three-colour on-track / progress / not-on-track items, but emitted unconditionally rather than from a hardcoded map).

New module exports from `_5_scorecard.ts`:

```ts
export function buildScorecardFigureInputs(
  resultsValue: ResultsValueForVisualization,
  ih: ItemsHolderPresentationObject,
  config: PresentationObjectConfig,
  scorecardIndicatorsByLabel: Map<string, ScorecardIndicator>,
): FigureInputs {
  if (ih.status !== "ok") {
    throw new Error("buildScorecardFigureInputs called with non-ok status");
  }

  // Resolve each row's indicator_common_id to a catalog row via the metric's
  // raw ID, then rewrite to the display label and inject the group. The lookup
  // is ID -> catalog via a temporary id-keyed map built from the label map.
  const byId = new Map(
    Array.from(scorecardIndicatorsByLabel.values())
      .map((si) => [si.scorecard_indicator_id, si] as const),
  );

  const jsonArray = ih.items.map((item) => {
    const id = item.indicator_common_id;
    const si = byId.get(id);
    return {
      ...item,
      indicator_common_id: si?.label ?? id,
      group: si?.group_label ?? "",
    };
  });

  const jsonDataConfig = getTableJsonDataConfigFromPresentationObjectConfig(
    resultsValue,
    config,
    {},
    jsonArray,
  );
  jsonDataConfig.colGroupProp = "group";

  const style = getStyleFromPresentationObject(
    config,
    resultsValue.formatAs ?? "number",
  );

  style.content = {
    ...style.content,
    tableCells: {
      func: (info) => {
        const si = scorecardIndicatorsByLabel.get(info.colHeader);
        if (!si) return { backgroundColor: { key: "base100" } };
        const scaled = scaleValueForFormat(info.valueAsNumber, si.format_as);
        return {
          backgroundColor: getScorecardCutoffColor(
            si.threshold_direction,
            si.threshold_green,
            si.threshold_yellow,
            scaled,
          ),
        };
      },
      textFormatter: (info) => {
        const si = scorecardIndicatorsByLabel.get(info.colHeader);
        if (!si) return String(info.value ?? "");
        return formatScorecardValue(
          info.valueAsNumber,
          si.format_as,
          si.decimal_places,
        );
      },
    },
  };

  style.surrounds!.legendPosition = "bottom-left";
  style.legend!.maxLegendItemsInOneColumn = 1;

  return {
    tableData: { jsonArray, jsonDataConfig },
    style,
    legend: [
      { label: t3({ en: "On track",     fr: "En bonne voie"    }), color: _CF_LIGHTER_GREEN  },
      { label: t3({ en: "Progress",     fr: "En progrès"       }), color: _CF_LIGHTER_YELLOW },
      { label: t3({ en: "Not on track", fr: "Pas en bonne voie"}), color: _CF_LIGHTER_RED    },
    ],
  };
}
```

Three new small helpers live in the same file:

**`scaleValueForFormat(rawValue, formatAs)`** returns the value in the scale the user sees:

- `percent` → `rawValue * 100`
- `number` → `rawValue`
- `rate_per_10k` → `rawValue * 10000`

**Convention:** threshold cutoffs are stored in the **displayed scale**, not the raw scale. A percent indicator with `threshold_green: 80` means "green at ≥ 80%"; the raw value `0.73` scales to `73`, which is `73 ≥ 80 → no`, `73 ≥ 70 → yes → yellow`. A `rate_per_10k` indicator with `threshold_green: 10, threshold_yellow: 20, direction: lower_is_better` treats raw `0.0008` as scaled `8`, which is `8 ≤ 10 → green`. Phase 1's seed in [PLAN_SCORECARD_01_CATALOG.md §1.9](PLAN_SCORECARD_01_CATALOG.md) uses display-scale values throughout (percents as 80/70, rates as 10/20) — the convention is consistent end-to-end.

**`getScorecardCutoffColor(direction, green, yellow, scaledValue)`** returns a panther colour:

```ts
function getScorecardCutoffColor(
  direction: "higher_is_better" | "lower_is_better",
  green: number,
  yellow: number,
  v: number | string | undefined | null,
): ColorKeyOrString {
  if (v === "." || v === null || v === undefined) return "#ffffff";
  const n = Number(v);
  if (isNaN(n)) return "#ffffff";
  if (direction === "higher_is_better") {
    if (n >= green)  return _CF_LIGHTER_GREEN;
    if (n >= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  }
  // lower_is_better
  if (n <= green)  return _CF_LIGHTER_GREEN;
  if (n <= yellow) return _CF_LIGHTER_YELLOW;
  return _CF_LIGHTER_RED;
}
```

Reuses the existing colour constants `_CF_LIGHTER_GREEN`, `_CF_LIGHTER_YELLOW`, `_CF_LIGHTER_RED` from `lib`. No dependency on the `conditional_formatting.ts` preset switch — cutoffs are per-indicator numbers, not preset enum values.

**`formatScorecardValue(rawValue, formatAs, decimals)`** returns a formatted string:

- `percent` → `toPctN(rawValue, decimals)` (scales × 100, appends `%`)
- `number` → `toNumN(rawValue, decimals)` (raw, thousands separator)
- `rate_per_10k` → `toNumN(rawValue * 10000, decimals) + " per 10k"`

Uses panther's existing number-formatting helpers. The `rate_per_10k` case is why overview D6 moves the ×10000 out of m007's numerator — without that decision, the scaling would be duplicated across R and JS and thresholds would be ambiguous.

## 3.3 — Call site: `get_figure_inputs_from_po.ts`

**File:** [`client/src/generate_visualization/get_figure_inputs_from_po.ts`](client/src/generate_visualization/get_figure_inputs_from_po.ts)

Today the scorecard branch at [lines 119-125](client/src/generate_visualization/get_figure_inputs_from_po.ts#L119-L125) calls `getSpecialScorecardTableFigureInputs`. Replace with a call to `buildScorecardFigureInputs` from `_5_scorecard.ts`, passing the catalog map:

```ts
if (effectiveConfig.d.type === "table") {
  if (effectiveConfig.s.specialScorecardTable) {
    const scorecardCatalog = getScorecardIndicatorsByLabelMap(
      await getScorecardIndicatorsFromCacheOrFetch(
        instanceState.scorecardIndicatorsVersion,
      ).then((r) => r.success ? r.data : []),
    );
    return {
      status: "ready",
      data: buildScorecardFigureInputs(
        resultsValue,
        ih,
        effectiveConfig,
        scorecardCatalog,
      ),
    };
  }
  // ...standard table path unchanged
}
```

The catalog fetch is already cached (phase 1 §1.6); the cost at render time is a single map lookup against warm cache. SSE-driven invalidation means edits in the catalog editor propagate to open scorecards on the next render cycle.

If the fetch fails (empty or error), `scorecardCatalog` is an empty map. Every lookup misses, every cell falls through to the "no catalog match" branch — neutral background, raw value as string. The scorecard renders but without per-indicator styling, with a warning logged to console. Degrades gracefully.

## 3.4 — Delete `conditional_formatting_scorecard.ts`

Once §3.2 absorbs the logic into `_5_scorecard.ts`:

1. Remove the import from [`get_figure_inputs_from_po.ts:24`](client/src/generate_visualization/get_figure_inputs_from_po.ts#L24).
2. Repo-wide grep for `conditional_formatting_scorecard` — expect one hit (the file itself).
3. Repo-wide grep for `getSpecialScorecardTableFigureInputs` — expect zero hits.
4. Delete the file.
5. Grep again for both names — expect zero hits across `client/`, `server/`, `lib/`.

The hardcoded `_SCORECARD` map (the only reason this file exists) is replaced by the phase-1 seed migration. The aspirational entries in the map that had no m007 backing (14 of the 24) are dropped entirely — admins add them via the editor once their data supports them.

## 3.5 — Verification before shipping

- **Live threshold round-trip.** Change a scorecard indicator's `threshold_green` in the catalog editor. Without re-running m008, verify the already-rendered scorecard's cell colours update on the next render cycle (SSE → cache invalidation → re-render).
- **Live format round-trip.** Change an indicator's `format_as` from `percent` to `rate_per_10k`. Verify both the value display and the threshold interpretation update (threshold comparisons happen in the new scaled value).
- **Non-scorecard regression check.** Open a non-scorecard presentation object (e.g. a chart or table backed by m002). Confirm its styling is unchanged — no spillover from the `_5_scorecard.ts` rewrite into other paths.
- **Catalog fetch failure.** Temporarily force `getScorecardIndicatorsFromCacheOrFetch` to return an error. Verify the scorecard still renders (degraded, neutral colours) and doesn't crash the viz editor.
- **Grep clean.** `conditional_formatting_scorecard` returns zero hits across the repo.

## Definition of done

- [ ] `getScorecardIndicatorsByLabelMap` helper exists and is used by the scorecard figure-inputs builder
- [ ] `_5_scorecard.ts` contains the real scorecard figure-inputs logic (formerly in `conditional_formatting_scorecard.ts`), sourcing labels / groups / format / thresholds from the catalog map via `info.colHeader` label lookup
- [ ] `_5_scorecard.ts` exposes three helpers: `scaleValueForFormat`, `getScorecardCutoffColor`, `formatScorecardValue`
- [ ] Threshold colour comparison uses the **scaled** (displayed) value, matching the convention that cutoffs are stored in display-scale units
- [ ] `get_figure_inputs_from_po.ts` scorecard branch calls `buildScorecardFigureInputs` with the catalog map; the `getSpecialScorecardTableFigureInputs` import is removed
- [ ] `conditional_formatting_scorecard.ts` deleted; repo-wide grep returns zero hits
- [ ] Catalog edits propagate to open scorecards via SSE-driven cache invalidation without reloading the page
- [ ] Scorecard with missing / empty catalog degrades gracefully (neutral cells, no crash)
- [ ] Non-scorecard presentation objects render unchanged (no regressions in chart / timeseries / map / standard-table paths)
- [ ] No changes to `metric_enricher.ts`, `ResultsValue`, or `ResultsValueForVisualization` (deliberate — all metadata lookup is client-side via the catalog hook)
- [ ] `deno task typecheck` clean
