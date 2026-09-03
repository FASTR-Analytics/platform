# PLAN_1d — An indicator carries a conditional-formatting rule; figures use it as a CF source (the scorecard table mode goes)

Status: **BUILT 2026-09-03, all gates green, uncommitted in the working
trees of app + modules.** Verified: `deno task typecheck` (server + client
+ lint:systems); `./validate_migrations` (83 instance / 42 project,
idempotent, base parity); `./validate_queries` (63/63); modules
`./vendor_schema` + `deno task build` + `deno task typecheck` +
`validate_definitions.ts`, vendored files diff-identical,
`specialScorecardTable` only in m007/m008, m012 preset carries
`"cfMode": "indicator"`; app grep for the flag hits only the po_config /
_figure_block transform strings; §5.6 transform harness (po_config Block
27 full + partial + flag-false + idempotent + both skip-gates; _figure_block
pre-P2 and post-P2 conversion, group_label retained, strict-parses,
idempotent, raw scan); §5.7 migration-semantics harness on postgres:15
under GUC `fr` and with the GUC unset (the five fixture rows → the
ruling-12 rules with float cutoffs `[0.7, 0.8]` / `[0.001, 0.002]`, three
degenerate rows → two buckets at green, FR then EN labels, identity alias
leaves the base at `number`, old columns + CHECK gone, new CHECK rejects a
non-object — since corrected: the column is TEXT, no CHECK, and the
harness asserts no json/jsonb column exists in the database); §5.8 colour
oracle (48 truth-table cells reproduced by
`thresholdBucketIndex` over `trafficLightThresholdsToRule`; every legacy
preset and every m001/m002 preset cutoff lands in the bucket its label
names; symmetric ignores direction); §5.9 round trips; §5.11 resolver (all
three chains, label-only never masks, count never borrows, filter-pinned
single/two/count, displayedRules dedupe, too_many_values, constant-format
metric); §5.12 lib half (legend order both directions, authored + derived
labels, PT symmetric wording); §5.13 AI text (percent and rate strings
exact). Client render pieces gated by the client typecheck (§5.14). The
harness files live in the session scratchpad, not the repo.

Previous status: RULED 2026-09-02 (Tim); code-verified pre-flight
2026-09-03 folded in (four review agents + spot checks); second pre-flight
2026-09-03 folded in (panther prerequisite BUILT + synced; m007/m008 out
of scope by ruling; 9(vi)/9(vii) collapsed). The indicator's
thresholds become a general `ConditionalFormattingThresholds` rule with
per-bucket labels, and the figure-level `indicator` CF source means "each
value uses its own indicator's rule". No open rulings. Sequencing
(re-ruled 2026-09-03, renumbered from 1e): ships IN the 1a+1b+1c release,
BEFORE [PLAN_1e](PLAN_1e_MODULE_CLEANUP.md). Migration 079 and run-manifest
schema v6 are unreleased (fleet on app 1.67.0; there is no git tag to check —
the VERSION file and the memory of the fleet are the source of truth), so
this plan rewrites them to the end state instead of adding a follow-on
migration and a v7 transform (§2.4). **m007 and m008 are out of scope
(ruled 2026-09-03):** they are frozen, never fetched, and nothing in this
plan preserves their presets or rescues packages built from them; the only
m008-linked code that stays is the v1 catalog reader, which serves existing
figures on fleet packages (§2.4). Audience: a fresh agent with zero
context — every path is absolute or repo-relative to the app repo, every
check is runnable.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (relative paths
below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`;
panther = `/Users/timroberton/projects/panther/timroberton-panther` (synced
into the app by `./sync wb-fastr` run FROM the panther repo; never edit
`panther/` in the app). Before touching anything: `git status` in all
three — build on the working tree as found; never stash, checkout or reset;
if it is not clean-or-explained, stop and ask. Tim commits.

## 0. Why (facts as the code stands, verified 2026-09-03)

A common indicator carries four presentation facts (S5): `format_as`,
thresholds (`threshold_direction/green/yellow`), `group_label`,
`sort_order`. They are snapshotted into a run's catalog and reach a figure
as `indicatorMetadata`. How each is consumed today:

| Fact | Renderer | AI (`get_metric_data` / `get_visualization_data`) |
| --- | --- | --- |
| `format_as` | EVERY surface, per value (`formatForValue`, `lib/resolve_effective_format.ts`; `_0_common.ts` table cells + map regions, `_1_standard.ts` data labels) | every row, per value (`lib/ai_tools/format_metric_data_for_ai.ts` `resolveItemFormat`, CSV scaling) |
| thresholds | ONLY when `config.s.specialScorecardTable` is true on a table (`client/src/generate_visualization/get_style_from_po/_5_scorecard.ts`) | for any metric, in the Dimension Summary (`formatIndicatorThresholds`, dimension columns with ≤ 20 values) |
| `sort_order` | every figure (`buildIndicatorIdOrder`, `build_figure_inputs.ts`) | n/a |
| `group_label` | nowhere | nowhere |

Three defects follow:

1. **Thresholds are a catalog fact for the AI and a table-mode feature for
   the renderer.** A standard table coloured by user-typed cutoffs shows
   70/80 while the AI describes the catalog's 60/90. The other four special
   modes (S10 "special chart modes") are hardcoded renderings of specific
   constant-format metrics; the scorecard is generic "colour each value by
   its own indicator's thresholds", reachable only through a flag on one
   metric, and that flag is also a preset field in the module schemas
   (`wb-fastr-modules/m012/_metrics/m12-01-01.ts` and the frozen
   `m008/_metrics/m8-01-01.ts`, `s: { specialScorecardTable: true }`).
2. **The dictionary's threshold shape is a hardwired special case of a type
   the app already owns.** `direction + green + yellow` is a
   conditional-formatting rule with exactly two cutoffs, three bands, fixed
   colours and fixed wording ("On track / Progress needed / Not on track",
   `client/src/generate_visualization/conditional_formatting.ts`). The
   figure-level CF already has the general form:
   `ConditionalFormattingThresholds` = `cutoffs[]`, `buckets[{color}]`,
   `direction` (`lib/types/conditional_formatting.ts`). Wording is not
   configurable, band count is not configurable, and the instance indicator
   editor never says what green/yellow mean on screen.
3. **Two unit conventions and two boundary rules for the same idea.**
   Dictionary thresholds are in DISPLAY units (80 for 80%; the scorecard
   scales the value with `scaleValueForFormat` before comparing) and are
   inclusive toward green in both directions (`getScorecardCutoffColor`).
   Figure CF cutoffs are in STORED units (0.8) and panther's
   `thresholdColorFunc` (`panther/_001_color/value_color_funcs.ts`) is
   strict-`<` upward regardless of `direction` — the flag only changes the
   legend's `<`/`≤` wording (`deriveBucketLabels`), so a lower-is-better
   value sitting exactly on a cutoff is labelled in one bucket and coloured
   in the other. This already bites the three `reverseThreeTier` legacy
   presets (`lib/legacy_cf_presets.ts`) and the m001/m002 lower-is-better
   presets. (The figure CF EDITOR already presents display units —
   `scaleForInput`/`PercentSelect` in `conditional_formatting_editor.tsx` —
   so S11's open item "CF-editor unit convention for `rate_per_10k`" is
   stale documentation and is struck by this plan.)

How CF paints today, which the build must respect: table cells, bars and
map regions emit panther's `777` value-colour SENTINEL
(`_0_common.ts` `getTableCellsContent` / `getMapRegionsContent`,
`_1_standard.ts` bars) and ONE figure-wide `valuesColorFunc(value, min,
max)` (`compileCfToValuesColorFunc`). Map regions emit the sentinel
UNCONDITIONALLY, and panther's default `mapRegions.func` also emits it, so
"no colour func" does not mean "uncoloured" — it means panther's default
grey ramp. Before panther `5d1180f` (§3) the slot never saw the element it
coloured, so a colouring whose RULE depends on the element could not be
expressed through it; that commit closed the gap at the library, where it
belongs, and is already synced. Lines, points and pie slices never consult CF; the pie
path passes `legend: undefined` precisely so a stray `cf*` state cannot
replace the categorical series legend.

## 1. Rulings

1. **An indicator carries a CF rule, not a threshold pair.** `CommonIndicator.thresholds`
   becomes `ConditionalFormattingThresholds | null`: `cutoffs` (ascending,
   STORED units), `buckets[{ color, label? }]` (one more bucket than
   cutoffs; `label` is plain text, optional), `direction`
   (`higher-is-better | lower-is-better`), `noDataColor?`. Any number of
   bands, any colours, any wording, per indicator. The type gains the
   optional per-bucket `label` for every CF user (figure-level rules may
   label their buckets too); an unlabelled bucket keeps today's derived
   `deriveBucketLabels` text. **Stored shape (ruled 2026-09-03): the rule
   is stored WITHOUT the union discriminator.** `ThresholdsRule =
   { cutoffs, buckets, direction, noDataColor? }` is the thing an
   indicator carries (DB JSON text — every JSON column in this app is
   `text`, never `jsonb` — catalog row, manifest entry, API body),
   and the figure-level union member is
   `ConditionalFormattingThresholds = { type: "thresholds" } & ThresholdsRule`.
   A `type` field means nothing in a dictionary row, and the migration
   composes the JSON without one. `deriveBucketLabels` takes a
   `language` argument and resolves its symmetric wording with `pickLang`
   (today it calls ambient `t3`); every caller passes the figure's
   `bundle.localization.language` at render and the UI language in the
   editors.
2. **The instance indicator editor reuses the figure CF thresholds panel.**
   `ThresholdsPanel` (`client/src/components/visualization/conditional_formatting_editor.tsx`)
   is extracted to a shared component with props
   `{ cf, onChange, formatAs, decimalPlaces, allowNegative, showLabels,
   showPresets }` — the current `decimalPlaces`/`allowNegative` props stay
   live (preview text; diverging inputs). The indicator editor passes
   `showLabels: true`, `showPresets: false` (the `LEGACY_CF_PRESETS`
   dropdown — "±10% deviation", diverging ±5/10/20 — is a figure concern),
   `decimalPlaces: 0`. It presents DISPLAY units and stores STORED units
   for both callers; a `base` indicator (a count, format `number`) edits in
   plain numbers. The percent input becomes a free `NumberInput` in percent
   units (the ×100 twin of the rate path): `PercentSelect` is a coarse
   fixed list (1% steps to 5%, then 5% steps) that would silently snap a
   migrated cutoff such as 78 or 62.5 on the first interaction. The
   display-unit scaler moves to lib as ONE pair,
   `scaleValueForFormat` / `unscaleValueForFormat` (today duplicated in
   `_0_common.ts` and the editor's `scaleForInput`/`unscaleFromInput`, and
   needed by the AI text in lib).
3. **One boundary rule, honoured by colour AND label.** The boundary belongs
   to the BETTER side: `higher-is-better` → value `< cutoff` falls below
   (strict, so an exact cutoff goes up); `lower-is-better` → value
   `≤ cutoff` falls below (inclusive, so an exact cutoff goes down). This
   is exactly the scorecard's inclusive-toward-green rule and exactly what
   `standardBucketLabels` already prints. **Carve-out:** a rule whose
   cutoffs are symmetric around zero (a diverging rule, `isSymmetricAroundZero`)
   has no better side; `direction` is ignored and the boundary is "up",
   which is what `deriveBucketLabels` already does for it. panther's
   `thresholdColorFunc` gains the boundary argument (§3); the app passes it
   everywhere it compiles a thresholds rule. **Accepted side effect:** the
   three `reverseThreeTier` legacy presets and the m001/m002
   `lower-is-better` presets change colour for a value sitting exactly on a
   cutoff — the label already said that bucket; the colour was the bug.
   The stale comment in `lib/legacy_cf_presets.ts` ("panther's
   thresholdColorFunc uses `<` uniformly") is rewritten.
4. **Thresholds are a conditional-formatting SOURCE, not a table mode.** The
   `ConditionalFormatting` union gains `{ type: "indicator" }` — "each
   value's colour and legend come from its own indicator's rule". Storage:
   `cfMode` gains the value `"indicator"` (no other `cf*` field is used by
   it). It paints wherever CF paints: table cells, bars, map regions —
   through the SAME mechanism as every other source: the content sites keep
   emitting the `777` sentinel and panther's figure-wide value-colour slot
   does the colouring. Panther's
   element-aware value-colour slot (BUILT and synced, §3) — it receives the
   element's own Info and may return `undefined`, which panther resolves as
   magnitude → identity → none — so the `indicator` source compiles to one
   function that reads the element's headers, walks the app's id chain to
   the rule, and returns the bucket colour or `undefined`. A value whose
   indicator has no rule renders uncoloured (table cell, map region) or in
   its series colour (bar), with no app-side special case in any content
   function. `specialScorecardTable` is DELETED from the
   PO config schema, the module preset schemas (github + installed + the
   vendored `.validation/` copy), the style panel, the render dispatch and
   every gate that reads it. A "scorecard" is a table whose CF source is
   `indicator`. There is ONE indicator source — no "indicator-on-track"
   beside an "indicator-cf".
5. **Legend for the `indicator` source is DERIVED, never authored on the
   figure.** Collect the distinct rules among the displayed indicators
   (`displayedRules`, ruling 6). Two rules are the same when count,
   colours, labels, cutoffs AND the owning indicator's `format_as` all
   agree (colours-and-labels alone would let one indicator's cutoffs print
   as universal). Unanimous → the legend is that bucket list; labels from
   the buckets, derived text for unlabelled ones formatted in THAT RULE'S
   indicator format (never the figure's `axisFormat`, which collapses to
   `number` for a mixed scorecard). Differing → the distinct colour
   swatches with a "varies by indicator" note (EN/FR/PT via `pickLang`
   with `bundle.localization.language`, never ambient `t3`), and the CF
   editor lists each displayed indicator's bands read-only beside the
   source picker. No displayed indicator carries a rule, or the displayed
   set is not enumerable (replicant with nothing selected,
   `too_many_values`) → no legend. **Order is best bucket first**, i.e.
   direction-aware: `higher-is-better` reversed (today's order),
   `lower-is-better` natural — this applies to figure-level `thresholds`
   legends too, so the lower-is-better presets now list green first, as
   the scorecard legend always did. **The CF legend is emitted only for
   figures that paint CF** (table, map, chart with `content === "bars"`):
   the existing pie rule (`legend: undefined` so the series legend
   survives) generalised to lines and points, for every CF source. The map
   legend path (`buildMapAutoLegend`) routes `indicator` to the same
   derived legend (today it falls to the gradient branch for anything but
   `thresholds`). The fixed "On track / Progress needed / Not on track"
   strings in `getLegendFromConfig` are deleted; the migration seeds them
   as bucket labels on every existing rule so nothing changes on screen.
6. **One catalog resolver for both facts.** `EffectiveFormat` becomes
   `EffectiveIndicatorFacts = { axisFormat, declaredFormatForValue,
   formatForValue, ruleForValue, displayedRules }` — the same three id
   chains (`getIndicatorIdsForCell`, `getIndicatorIdsForChartValue`,
   `getIndicatorIdsForMapRegion`) and the same "first id that DECLARES"
   stopping rule for both facts. `declaredFormatForValue` STAYS: the v1
   catalog reader (`server/runs/indicator_catalog.ts`, legacy packages
   without `calculated_indicators_snapshot.json`) and stored bundles still
   carry label-only entries, and `_5_scorecard.ts` documents the
   whole-table case. `ruleForValue(ids)`: the first id in the chain that
   declares a rule; when the chain carries NO id at all (the indicator is
   pinned by `filterBy` — the one-indicator map or bar chart) and exactly
   one indicator is displayed, that indicator's rule; otherwise
   `undefined` (an id that declares no rule — a count beside percents —
   is never coloured by a neighbour's rule). `getThresholdMetaForCell`
   goes. Both entry points (config-based for the editor, items-based for
   the bundle) resolve rules; the config-based one reads the new
   `indicatorRules` payload field (ruling 9(v)).
7. **Default on.** A new figure on an `"indicator"` metric
   (`resultsValue.formatAs === "indicator"`) starts with
   `cfMode: "indicator"`, unconditionally — `getStartingConfigForPresentationObject`
   (`lib/types/presentation_objects.ts`) has no catalog at Add-Visualization
   time, and a figure whose indicators carry no rule simply renders
   uncoloured with no legend (rulings 4–5). The three preset paths
   (`client/src/components/project/add_visualization/index.tsx` preset
   branch, `client/src/components/project/preset_preview.tsx`,
   `lib/derive_default_visualizations.ts`) spread `preset.config.s` over
   `DEFAULT_S_CONFIG` and so inherit `cfMode` from the preset unchanged.
   The source is offered in the CF editor only for `"indicator"` metrics —
   the gate is the metric's declared `formatAs`
   (`poDetail.resultsValue.formatAs`, a `MetricFormatAs`), passed to
   `ConditionalFormattingEditor` as a new prop by its three callers
   (`_table.tsx`, `_map.tsx`, `_chart_like_controls.tsx`), which already
   hold `poDetail` — nothing new is threaded through
   `presentation_object_editor_panel_style.tsx`. The editor's existing
   `formatAs` prop is the resolved axis `IndicatorFormat`, never
   `"indicator"`. `SPECIAL_SCORECARD_TABLE_METRICS` is deleted with the mode.
8. **User override is allowed.** On an `"indicator"` metric the user may
   still choose `scale` or a figure-level `thresholds` rule; the AI keeps
   describing the catalog's rule. A deliberate override is a display
   choice and stays invisible to the AI, exactly as decimal places and
   colours do.
9. **Stored data rewrites, every layer** (CLAUDE.md "changing a cached
   payload's shape"), with the forced skip-gate per
   `PROTOCOL_APP_MIGRATIONS.md` "Skip-Gate Gotcha" wherever a key is
   REMOVED from a strip-mode schema:
   - (i) **po_config Block 27**, UNGUARDED by `fillDefaults` (it must reach
     preset-shaped partial `s` blobs — Block 19 is the full-only pattern,
     Blocks 5/7/9/17 are the exemplars): `s.specialScorecardTable === true`
     → `s.cfMode = "indicator"`, key deleted in every shape. BOTH fill
     sites go (`po_config.ts` line ~402 inside the Block 16 group, and
     Block 19). `configNeedsForcedTransform` today inspects only
     `config.d`; it gains a `config.s` read for this key, and
     `rawJsonNeedsForcedTransform` gains the string. Every stored PO
     carries the key (Blocks 16/19 filled `false` everywhere), so this is
     a one-boot fleet-wide rewrite of `presentation_objects` plus every
     slide/report/dashboard row whose JSON carries it — acknowledged.
   - (ii) **`_figure_block.ts`**: `_INDICATOR_METADATA_KEYS` gains
     `thresholds`, loses the three threshold keys, keeps `group_label`
     (ruling 11). The conversion (`threshold_direction/green/yellow` in
     display units → `thresholds` in stored units with seeded labels,
     ruling 12) runs BEFORE the allow-list strip, on BOTH the pre-P2
     `block.source.indicatorMetadata` and the post-P2
     `bundle.indicatorMetadata` (a new traversal — nothing touches the
     bundle's metadata today). The bundle's `indicatorMetadataSchema` is a
     `strictObject`, so an unconverted entry fails the sweep's parse and
     aborts boot. The raw force scan gains `"specialScorecardTable"`
     (config half, strip mode) and `"threshold_direction"`.
   - (iii) **Server caches**, enumerated from
     `server/routes/caches/visualizations.ts` (the S9/S3 tables are
     stale — `po_detail_v7`, version 15/13 — and are corrected):
     `po_detail_v9` → `po_detail_v10` (carries the PO config);
     `PO_CACHE_VERSION` `"17"` → `"18"` with a dated comment (covers
     `po_items` — `IndicatorMetadataDisplay[]` — and `metric_info` —
     `indicatorFormats` + the new `indicatorRules`; `replicant_opts` rides
     along).
   - (iv) **Client IndexedDB names** (`client/src/state/instance/t2_indicators.ts`
     states the rule: a shape change bumps the NAME): `instance_indicators_v2`
     → `_v3` (carries `CommonIndicator.thresholds`), `po_items_v2` → `_v3`,
     `metric_info` → `metric_info_v2`. `po_detail_v2` stays — its enum
     gains a value and former scorecards' rows get a new `last_updated`
     from (i), which the version hash tracks.
   - (v) **The editor payload.** `ResultsValueInfoForPresentationObject`
     (`lib/types/presentation_objects.ts`) gains
     `indicatorRules: Record<string, ConditionalFormattingThresholds>` —
     flat, beside `indicatorFormats`, for the same reason (a filter can
     name an indicator absent from a `too_many_values` dimension).
     Producers: `indicatorFormatsFrom` gets a rules twin in
     `server/server_only_funcs_presentation_objects/get_results_value_info.ts`
     and `server/run_query/run_read.ts`. Precedent: `PO_CACHE_VERSION`
     "12" is this exact change for formats.
   - (vi) **Module presets: nothing to transform.** Presets reach the
     client from the run manifest's `metrics[].viz_presets` (parsed in
     strip mode at `server/run_query/run_read.ts` and
     `server/run_query/virtual_defaults.ts`; the installed definition blob
     carries no metrics — `server/db/project/modules.ts` strips them before
     storage). m012 has never shipped and no deployed app has it in
     `MODULE_REGISTRY`, so no fleet package carries the m012 preset; m008's
     preset is out of scope by ruling. The key is deleted from both
     schemas and the vendored copy, m012's preset is edited in the modules
     repo (§4), and a testing package built from the old preset is
     regenerated. There is no module_definition transform in the boot
     sweep — `PROTOCOL_APP_MIGRATIONS.md`'s mention of "metric and
     module_definition sweeps" is stale and is corrected.
   - (vii) **Run manifest**: schema v6 is rewritten in place (catalog entry
     carries `thresholds`; `group_label` stays per ruling 11), and the v2
     mirror row (`indicatorRowV2`, `server/runs/indicator_catalog.ts`)
     likewise. No v7, no gate, no rescue: a testing package stamped `6`
     under the earlier shape is regenerated (its old-shape v2 mirror would
     fail block 1's recompute anyway). `manifestNeedsForcedTransform`
     stays version-equality only.
   A former scorecard ALWAYS gets an explicit `cfMode: "indicator"`,
   whether or not any displayed indicator carries a rule: it is what the
   figure meant, and cells whose indicator has no rule render uncoloured —
   which is what the scorecard did for them.
10. **Scorecard-only side behaviours resolved individually:** the CF table
    look (`getTableLayoutStyle(cfOn)`) follows `cfMode !== "none"`
    automatically; the forced catalog sort (`customSortHeaders`,
    `build_figure_inputs.ts`, sprayed onto every table axis matching ids OR
    labels) is DROPPED — `buildIndicatorIdOrder` orders the
    `indicator_common_id` axis by the catalog, both scorecard presets
    disaggregate by that axis, and the custom-order panel is the user's
    override like any other figure (`NOTE_SCORECARD` in
    `_custom_value_order.tsx` goes; the rationale comments in
    `get_data_config_from_po.ts` around `customSortHeaders` are rewritten,
    not just the branch). In `_table.tsx` every scorecard gate goes: the
    n-values toggle, `decimalPlaces`, `hideLegend` and the CF section show
    as for other figure types.
11. **`group_label` is DELETED from the dictionary** — column (079 never
    creates it), editor (`_edit_indicator_common.tsx`; the manager list
    never showed it), catalog row, v2 mirror, `CommonIndicator`. The batch
    CSV never carried it (three columns only) — nothing to do there.
    `IndicatorMetadata.group_label?` STAYS: it is the HFA/ICEH category
    carrier, written by `server/runs/indicator_catalog.ts` (ICEH) and
    `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`,
    present in stored bundles under a `strictObject`, and the manifest's
    catalog entry. The common-indicator writers simply stop setting it.
12. **Migration of existing rules is mechanical and lossless — inside 079.**
    Per row, from `ci.format_as` on the same row (no second pass):
    `higher_is_better {green, yellow}` → `cutoffs [yellow, green]`, buckets
    `[red, yellow, green]`; `lower_is_better` → `cutoffs [green, yellow]`,
    buckets `[green, yellow, red]`; cutoffs divided by 100 for `percent`
    and by 10,000 for `rate_per_10k`; colours hardcoded in SQL as
    `#F7BCBC` / `#FAE9B7` / `#A9DFBF` (= `_CF_LIGHTER_RED/YELLOW/GREEN`,
    `lib/key_colors.ts` — assert equality in §5.7). **Degenerate pairs**
    (nothing ever enforced `yellow < green`: the old CHECK was
    all-null-or-all-set, the editor checked finiteness only): `green ==
    yellow`, or inverted, → a TWO-bucket rule at the green cutoff
    (`higher`: `cutoffs [green]`, `[red, green]`; `lower`: `cutoffs
    [green]`, `[green, red]`) — in the scorecard truth table the yellow
    band was unreachable for such a row, so this is the faithful
    conversion. **Labels** are seeded as plain text in the instance
    language: the migration runner sets a transaction-local GUC
    `fastr.instance_language` (from `_INSTANCE_LANGUAGE`,
    `server/exposed_env_vars.ts`) before executing each file, and 079
    reads it with `current_setting('fastr.instance_language', true)` —
    `missing_ok`, `COALESCE`d to `'en'` — in a `CASE` (EN "Not on track /
    Progress needed / On track"; FR/PT = the strings `getLegendFromConfig`
    prints today, copied before they are deleted). The default is
    load-bearing: `./validate_migrations` pipes each file through `psql`
    directly, never through `runner.ts`, so the GUC is unset there.
    Under ruling 3 every migrated value colours exactly as the scorecard
    coloured it (§5.8). The AI Dimension Summary prints each bucket's label
    with its cutoff in display units.
13. **The AI path changes shape only.** `formatIndicatorThresholds` prints
    the rule's buckets and cutoffs (display units via the lib scaler);
    it keeps firing for any metric's ≤ 20-value dimension columns, as
    today. Everything else in the AI path is unchanged.

## 2. Build — app

### 2.1 lib

- `lib/types/conditional_formatting_standalone.ts`: `cfMode` enum gains
  `"indicator"`; bucket objects gain optional `label`. Re-vendor with the
  modules repo's `./vendor_schema` (§4).
- `lib/types/conditional_formatting.ts`: union gains `{ type: "indicator" }`;
  `ThresholdsRule` extracted per ruling 1 with `buckets[].label?: string`,
  `ConditionalFormattingThresholds = { type: "thresholds" } & ThresholdsRule`;
  `selectCf` / `flattenCf` round-trip both; `deriveBucketLabels` gains
  `language` and uses `pickLang`; `bucketLabels(rule, fmt, language)`
  prefers authored labels and falls back to it. Export a pure
  `thresholdBucketIndex(rule, value): number | undefined` implementing
  ruling 3 including the symmetric carve-out — the ONE boundary rule, used
  by the panther call site's argument, the legend, the AI text and the
  harness. Export `legendBucketOrder(rule)` (ruling 5's direction-aware
  order) so `compileCfToLegend` and the indicator legend share it.
- `lib/indicator_value_scale.ts` (new): `scaleValueForFormat` /
  `unscaleValueForFormat`; the client copies (`_0_common.ts`, the editor's
  `scaleForInput`/`unscaleFromInput`) are deleted.
- `lib/types/indicators.ts`: `CommonIndicatorThresholds` → `ThresholdsRule`
  (`thresholds: ThresholdsRule | null`, no `type` field); `group_label`
  removed from `CommonIndicator`; `IndicatorMetadata` loses
  `threshold_direction/green/yellow`, gains `thresholds?`, keeps
  `group_label?`; `IndicatorMetadataDisplay` follows.
  `lib/types/_figure_bundle.ts`: `indicatorMetadataSchema` and the
  `Required<IndicatorMetadataDisplay>` compile lock below it updated.
  `lib/api-routes/instance/indicators.ts`: the body schema IS the
  validation (the server route only casts today): `cutoffs` ascending
  (`.refine`), `buckets.length === cutoffs.length + 1`, stored units.
- `lib/resolve_effective_format.ts` → `lib/resolve_effective_indicator_facts.ts`
  per ruling 6, both entry points; the config-based one takes
  `indicatorRules`. Move the header contract prose across intact; S10's
  wiring map is the only restatement allowed.
- `lib/types/presentation_objects.ts`: `indicatorRules` on
  `ResultsValueInfoForPresentationObject` (ruling 9(v));
  `getStartingConfigForPresentationObject` per ruling 7.
- `lib/common_indicator_catalog.ts` row: `thresholds` object replaces the
  three columns; `group_label` gone. `lib/types/run_manifest.ts`: catalog
  entry likewise (v6 in place, ruling 9(vii)).
- `lib/types/_presentation_object_config.ts`, `presentation_object_defaults.ts`,
  `lib/types/_module_definition_github.ts`, `lib/types/_metric_installed.ts`:
  delete `specialScorecardTable`.
- `lib/legacy_cf_presets.ts`: comment per ruling 3.
- `lib/ai_tools/format_metric_data_for_ai.ts`: `formatIndicatorThresholds`
  prints `label ≥ cutoff` / `label ≤ cutoff` per bucket in display units,
  best bucket first, using `bucketLabels` + ruling 3's operators; its
  header comment names `_5_scorecard.ts` / `getScorecardCutoffColor`
  (deleted) and is rewritten to name `thresholdBucketIndex`.

### 2.2 Client render

- `get_style_from_po/_0_common.ts` `getTableCellsContent`,
  `getMapRegionsContent`, and the bars branch in `_1_standard.ts` are
  UNTOUCHED apart from `cfOn` now being true for the `indicator` source:
  they keep emitting `777`. Delete `getThresholdMetaForCell`.
- `conditional_formatting/compile.ts` `compileCfToValuesColorFunc(cf,
  facts, effectiveValueProps)` returns panther's `FigureValuesColorFunc`.
  For `indicator`: `(value, _min, _max, element) =>` element `undefined`
  (legend sampling) → `undefined`; else the id chain for the element's
  shape (`getIndicatorIdsForCell` / `getIndicatorIdsForChartValue` /
  `getIndicatorIdsForMapRegion` already take the Info objects; narrow the
  union structurally — `"featureId" in element`, `"i_series" in element`)
  → `facts.ruleForValue(ids)` → `thresholdBucketIndex(rule, value)` →
  bucket colour, or `undefined` when there is no rule. For `scale` /
  figure-level `thresholds` nothing changes except the boundary option
  (ruling 3; `thresholdColorFunc(thresholds, colors, { noDataColor,
  boundary })` — the options object is already passed; `boundary` is
  added).
- Delete `get_style_from_po/_5_scorecard.ts`; the scorecard branch in
  `get_style_from_po.ts`; `isSpecialScorecardTableActive`,
  `canUseSpecialScorecardTable`, `SPECIAL_SCORECARD_TABLE_METRICS`
  (`special_chart_checks.ts`); the `customSortHeaders` branch in
  `build_figure_inputs.ts` and its rationale comments in
  `get_data_config_from_po.ts`.
- `conditional_formatting/compile.ts`: `compileCfToLegend(cf, formatAs, facts, language)` handles
  `indicator` per ruling 5 and uses `bucketLabels` + `legendBucketOrder`
  for `thresholds`. `conditional_formatting.ts` `getLegendFromConfig`
  gains the facts argument, loses its scorecard branch and the three fixed
  strings, and returns `undefined` for figures that do not paint CF
  (ruling 5); its four call sites in `build_figure_inputs.ts` (standard,
  table, map via `buildMapAutoLegend`, and the pie site which stays
  `undefined`) updated.
- S10's mode table loses the Scorecard row; "Effective format" becomes
  "Effective indicator facts" with the rule column.

### 2.3 Client editors

- `conditional_formatting_editor.tsx`: extract `ThresholdsPanel` per ruling
  2 (shared component, display units, free percent input, presets
  optional, label inputs optional); `Mode` gains `"indicator"`, offered
  when the metric's declared `formatAs === "indicator"` (new editor prop,
  passed by `_table.tsx`, `_map.tsx`, `_chart_like_controls.tsx` from the
  `poDetail` they already hold — ruling 7), with the read-only
  per-indicator band listing from `indicatorRules`.
- `indicator_manager_hmis/_edit_indicator_common.tsx`: the four threshold
  inputs (on/off, direction, green, yellow) and the `group_label` input are
  replaced by the shared panel with labels; "None" = `thresholds: null`.
- `presentation_object_editor_panel_style/_table.tsx`: the table-mode
  RadioGroup and every `specialScorecardTable` gate go (ruling 10).
  `presentation_object_editor_panel_style.tsx`: `showScorecardMode` goes.
  `_custom_value_order.tsx`: `NOTE_SCORECARD` goes.
- `client/src/state/instance/t2_indicators.ts` + the PO caches: names per
  ruling 9(iv).

### 2.4 Server / persistence

- **079 rewritten to the end state, with the base schema, together**
  (`./validate_migrations` diffs base-then-migrations against base; the
  two cannot move separately — 079's four write sites reference the
  columns). `server/db/migrations/instance/079_common_indicator_types.sql`:
  `ADD COLUMN IF NOT EXISTS thresholds TEXT` (JSON text, like every JSON
  column in both schemas — there is no `jsonb` column in this app and none
  is introduced) replaces the three threshold columns; no `group_label`;
  `indicators_threshold_fields_check` dropped with them (text JSON columns
  carry no CHECK; the lib schema validates on read and at the API
  boundary); the identity-alias `UPDATE` and the three `INSERT`s compose
  the rule's JSON text inline per ruling 12 from `ci.*` on the same row. The identity-alias
  branch stops copying `ci.format_as` onto a base common (a base is forced
  to `number` by 1c's `formatRuleError`; copying `percent` made the row
  un-editable) — thresholds still cross, divided by `ci.format_as` because
  that is the unit m008 displayed them in. `server/db/instance/_main_database.sql`
  to the same end state (no old migration indexes the threshold columns —
  verified). This is the deliberate exception to
  `PROTOCOL_APP_MIGRATIONS.md` "don't rewrite old migrations": 079 is
  unreleased. **A testing DB that already ran the earlier 079 is
  re-created, not migrated** (the ledger is filename-keyed, and a re-run
  would find `calculated_indicators` already gone and convert nothing) —
  the same instruction 1c already gives; ALL of its sandbox packages are
  regenerated (ruling 9(vii): no rescue for an old-shape package).
- `server/db/migrations/runner.ts`: sets the `fastr.instance_language`
  GUC (transaction-local, `set_config(..., true)`, inside the same
  `sql.begin` as the file) before each file (ruling 12).
- `server/db/instance/indicators.ts`: `DBIndicatorCommon.thresholds`,
  `COMMON_INDICATOR_COLUMNS`, `dbRowToCommonIndicator`; `group_label`
  gone. `server/routes/instance/indicators.ts` `toNewCommonIndicator`: the
  hand-casts for `thresholds`/`group_label` follow the lib schema.
- `server/runs/indicator_catalog.ts`: `indicatorRowV2` carries
  `thresholds` (in place, 9(vii)); the v1 `calculatedIndicatorRow` reader
  stays (frozen legacy format — it is what keeps existing scorecard
  figures on fleet packages coloured after Block 27 flips them to the
  `indicator` source, until each project repoints to an m012 package) and
  maps its display-unit `threshold_*` into a rule at derive time with the
  ruling-12 conversion (including degenerate pairs; its `format_as` is
  per row). `manifest_transform.ts` is untouched.
- `server/db/migrations/data_transforms/po_config.ts` Block 27 and the two
  fill-site deletions, `configNeedsForcedTransform` s-read, raw scan (9(i));
  `_figure_block.ts` per 9(ii).
- `server/routes/caches/visualizations.ts` per 9(iii);
  `get_results_value_info.ts` + `run_read.ts` per 9(v).
- Docs: S5 (dictionary shape), S9 + S3 cache tables corrected from code,
  S10 (mode table, facts), S11 (open item struck), S8 (module preset
  contract), `PROTOCOL_APP_MIGRATIONS.md` sweep list corrected;
  `lint:systems` for any new file.

## 3. Panther prerequisite — DONE (2026-09-03)

- Panther commit `5d1180f` ("style func") built the element-aware slot:
  `FigureValuesColorFunc = (value, min, max, element?) => color | undefined`
  (`panther/_003_figure_style/style_func_types.ts`; `undefined` declines
  and the sentinel site falls through to series colour / "none"; legend
  sampling calls it with no element) and
  `thresholdColorFunc(thresholds, colors, { noDataColor?, boundary?: "up" |
  "down" })` (`panther/_001_color/value_color_funcs.ts`; `"down"` =
  `value <= t[i]`). App commit `9a0746ac` synced it; the app's `panther/`
  is content-identical to panther HEAD (verified file-by-file ignoring the
  sync header), and `compileCfToValuesColorFunc` already passes the options
  object (uncommitted working-tree edit in `compile.ts`, part of this
  release). No further sync is needed for this plan; if one happens for
  other reasons, run it from the panther repo with `--force --no-commit`,
  never `./sync --all`.

## 4. Build — modules (lockstep)

- `m012/_metrics/m12-01-01.ts`: `s: { cfMode: "indicator" }`. Modules
  `deno task build` + `deno task typecheck` CANNOT catch a forgotten
  preset edit (dynamic import; strip-mode schema), so the gate is a grep
  (§5.5). `./vendor_schema` (copies three files:
  `_module_definition_github.ts`, `conditional_formatting_standalone.ts`,
  `disaggregation_options.ts`, then `deno check`s) — note the github
  schema is already one comment line out of sync with the app's; the
  re-vendor absorbs it. Run `.validation/validate_definitions.ts` explicitly
  (not a task; it skips `FROZEN_MODULE_DIRS`). m007/m008 are FROZEN and
  out of scope — not edited, not preserved; the app never fetches them
  (`MODULE_REGISTRY` has no m007/m008).
- **Modules working tree as found (2026-09-03):** `DOC_MODULES.md`,
  `_frozen_modules.ts` and `m012/script.R` are modified and uncommitted
  (1c's `#---` marker fix, 2026-09-02) — build on them. The
  `_frozen_modules.ts` header comment says "PLAN_1d deletes the
  directories AND this file"; after the renumbering that is
  [PLAN_1e](PLAN_1e_MODULE_CLEANUP.md) — corrected in passing.
- **Push order is unchanged from PLAN_1a §6**: modules push first, app
  second. Only m012's preset changes, and no deployed old app has m012 in
  its registry, so no old app ever parses `cfMode: "indicator"`.
- `DOC_SPECIAL_METRICS_SYNC.md` in the modules repo names a file that no
  longer exists (`_0_conditional_consts.ts`; the consts live in
  `special_chart_checks.ts`) — corrected in passing.

## 5. Verification (automated gates — the work is done when these are green)

1. `deno task typecheck` (server + client + `lint:systems`).
2. `./validate_migrations` (079 idempotent against a fresh DB; base schema
   parity).
3. `./validate_queries` (engine untouched — count unchanged).
4. Panther: done (§3). Standing check only: `git diff --stat panther/` is
   empty at the start of the build.
5. Modules: `cd /Users/timroberton/projects/apps/wb-fastr-modules &&
   ./vendor_schema && deno task build && deno task typecheck && deno run
   --allow-all .validation/validate_definitions.ts`; vendored files
   diff-identical to the app's;
   `grep -rn specialScorecardTable /Users/timroberton/projects/apps/wb-fastr-modules --include='*.ts' --include='*.json'`
   hits ONLY `m007/` and `m008/`; `m012/definition.json` carries
   `"cfMode": "indicator"`.
   App: `grep -rn specialScorecardTable lib server client/src` is empty
   except the po_config/_figure_block transform strings.
6. Transform harness (`deno run --allow-all -c deno.json <file>`, absolute
   imports): po_config full config with `specialScorecardTable: true` →
   `cfMode === "indicator"`, key absent, strict-parses; preset-shaped
   partial `s: { specialScorecardTable: true }` → `s: { cfMode:
   "indicator" }` WITHOUT `fillDefaults`; flag false → key absent,
   `cfMode` untouched; idempotent; `configNeedsForcedTransform` and
   `rawJsonNeedsForcedTransform` both true for the key. `_figure_block`
   over (a) a post-P2 bundle fixture whose `indicatorMetadata` carries
   `threshold_direction: "higher_is_better", green 80, yellow 70,
   format_as "percent"` and an ICEH-style entry with `group_label` →
   `thresholds: { cutoffs: [0.7, 0.8], buckets: [red, yellow, green]
   with seeded labels, direction "higher-is-better" }`, `group_label`
   retained, strict-parses, idempotent; (b) a pre-P2 block with the same
   `source.indicatorMetadata` → converted, not stripped.
7. Migration-semantics harness against a local `postgres:15` (the
   `./validate_migrations` recipe), with
   `SELECT set_config('fastr.instance_language', 'fr', true)` issued in
   the same transaction before the file (the harness's own `SET`; the
   runner does this in production, psql does not): rows
   `(higher, 80, 70, percent)`, `(lower, 10, 20, rate_per_10k)`,
   `(higher, 80, 80, percent)`, `(higher, 70, 80, percent)`,
   `(lower, 20, 10, number)`, `(NULL)` → ruling-12 rules: cutoffs
   `[0.7, 0.8]` and `[0.001, 0.002]`, the three degenerate rows →
   two-bucket rules at the green cutoff, FR labels seeded, NULL stays
   NULL; hex colours equal `_CF_LIGHTER_*`; the stored JSON text carries
   no `type` key (ruling 1); old columns, `group_label` and the old CHECK
   absent; the column is `text` and no `json`/`jsonb` column exists in the
   database. An identity-alias row with
   `format_as = 'percent'` leaves the base common at `number`. A second
   run with the GUC unset seeds EN labels.
8. Colour oracle: capture `getScorecardCutoffColor`'s truth table BEFORE
   `_5_scorecard.ts` is deleted (both directions; values exactly on green,
   exactly on yellow, between, outside; the degenerate pairs) and assert
   `thresholdBucketIndex(migratedRule, storedValue)` reproduces it for
   every row. Then over every `LEGACY_CF_PRESETS` rule and the m001/m002
   preset rules: for each cutoff, `thresholdBucketIndex` at the cutoff
   lands in the bucket `bucketLabels` names for it; a symmetric rule
   ignores direction.
9. CF round trip: `flattenCf` → `selectCf` identity for `indicator` and for
   a labelled `thresholds` rule; every other member unchanged.
10. Colour-func harness: `compileCfToValuesColorFunc` for the `indicator`
    source over the resolver fixture of item 11 — a `TableCellInfo`, a
    `ChartValueInfo` and a `MapRegionInfo` whose headers name the rule
    indicator → the bucket colour; the count indicator → `undefined`;
    element omitted → `undefined`.
11. Facts resolver harness: a catalog with a percent indicator carrying a
    rule, a count indicator with none, and a label-only header entry →
    `ruleForValue` finds the rule through each header position of each of
    the three id chains, `undefined` for the count even when the rule
    indicator is displayed beside it, `undefined` for the label-only
    header; an all-`undefined` chain with ONE displayed (filter-pinned)
    indicator → that indicator's rule, with two displayed → `undefined`;
    `displayedRules` dedupes identical rules and separates rules that
    differ only in cutoffs or owning format; `declaredFormatForValue` and
    `formatForValue` unchanged from today's `resolve_effective_format`
    cases (a legacy label-only catalog still resolves per value).
12. Legend harness: two displayed indicators sharing one rule → one legend
    with the authored labels, best bucket first (lower-is-better → green
    first); two differing rules → the swatch legend with the "varies by
    indicator" note in EN/FR/PT; no rules → `undefined`; an `indicator`
    or `thresholds` cf on a lines figure → `undefined`; on a map → the
    derived legend, not a gradient.
13. AI text harness: `formatIndicatorThresholds` over the migrated percent
    rule prints `On track ≥ 80%; Progress needed ≥ 70%; Not on track
    < 70%` (display units, ruling-3 operators); the rate rule prints
    per-10,000 values.
14. Client render pieces (`_0_common.ts`, `compile.ts`, the editors) are
    client-only code; their gate is the client typecheck plus the Deno-side
    harnesses above over the lib they call. No Playwright.

User testing is not a gate (CLAUDE.md). When 1–14 are green: update this
file's Status to BUILT with what was verified, update the memory index, and
stop. Tim commits.
