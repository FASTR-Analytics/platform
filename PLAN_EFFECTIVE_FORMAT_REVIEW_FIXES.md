# Plan: fix the defects found in the per-value format work

**Status: Phase A done (`4a89a29a`). Phases B, C, D not started — 18 of 22
boxes open. Start at B4, then B1.**

Self-contained — an agent pointed at it with "continue work" needs no prior
conversation.

Line numbers for the OPEN items (B, C, D) are accurate as of **2026-08-09**
(re-verified, and the `_0_common.ts` anchors re-pinned — see §0). Every
behavioural claim marked **VERIFIED** was reproduced by executing code, with the
output quoted. Claims not personally reproduced are marked **REPORTED**.

---

## 0. Where this stands — read first

Phase A is done (`4a89a29a`). **18 of 22 items remain: B, C, D.**
Start at B4, then B1.

**One gate is red:** `deno lint` on
`server/db/migrations/data_transforms/_figure_block.ts`, exactly one
unused-import problem. That is B4, one line. `deno task typecheck` and
`lint:systems` are green.

**Anchor drift.** Anchors were pinned when Phase A landed. Since then
`client/src/generate_visualization/get_style_from_po/_0_common.ts` gained ~13-16
lines, so the C4/C5/C6/C7 anchors into it have been **re-pinned** to current
lines (`getIndicatorIdsForCell` :192, `getIndicatorIdsForChartValue` :366,
`getIndicatorIdsForMapRegion` :384, `formatIndicatorValue` :309, `formatRateAuto`
:336, `scaleValueForFormat` :299, the shared-list comment :190).
`PROTOCOL_APP_MIGRATIONS.md` also changed, but after B2's anchors, so `:293` and
`:301` still hold. Every other cited file is untouched.

That file family is actively worked on. Prefer `grep -n "export function <name>"`
over a pinned line — the anchors are a convenience, not a contract.

**Suggested order:** B4 (clears the red lint) → B1 (the dry-run gate) → B2, B3,
B5 (doc/consistency, cheap) → C1, C3 (concrete user-facing bugs) → C4, C5, C6,
C7, C8 → C2 (needs a UI decision) → D1-D5 (panther; one sync + 303-test run at
the end).

---

## 1. What this is

`PLAN_EFFECTIVE_FORMAT_PER_VALUE.md` (implemented 2026-08-07, gates green, plan
file deleted) replaced `{ formatAs, perCell }` with
`EffectiveFormat = { axisFormat, formatForValue(ids) }` and rewired every
surface that writes an individual number. Four adversarial reviewers then went
over it.

**The core rewiring holds.** I re-confirmed the load-bearing parts myself (see
§7). Do not re-litigate the design. What follows is damage at the edges: four
defects I introduced, plus pre-existing items the review surfaced.

Scope is **everything, including the panther repo**.

## 2. The three repos

- `wb-fastr` — app + the vendored `panther/` mirror
- `/Users/timroberton/projects/panther/timroberton-panther` — library source
- `/Users/timroberton/projects/apps/wb-fastr-modules` — the eight metrics

**Never edit `wb-fastr/panther/` directly.** Edit the panther repo, confirm
`deno task typecheck` + `deno task test` (303) there, then
`./sync wb-fastr --force --no-commit` from the panther repo. Phase D is the only
remaining work that needs this; sync once at the end of Phase D, not per item.

---

## 3. Phase A — defects I introduced

**All four are DONE and committed in `4a89a29a`.** Kept in full because the
reasoning is the reason the fixes are what they are — several of these had an
obvious-looking wrong answer. Each item's line references describe the code as
it was BEFORE the fix; the **DONE** block at the end of each says what is there
now. Do not re-derive these; read them and move to Phase B.

### [x] A1. `inferFormatAs` writes wrong data, permanently

`server/db/migrations/data_transforms/_figure_block.ts:806-832`

Two defects in one function:

1. **The m9-02-01 escape is gone; its comment is still there.** `:793` still
   reads *"m9-02-01 is frozen `number`: its values are DERIVED measures
   (CIX/SII) over percent indicators — the historical ALWAYS_OBEY fact"*. The
   `if (metricId === "m9-02-01") return "number";` line it describes was deleted.
   VERIFIED — `git show 0cef208b:…` has it at line 835; the working tree does
   not.
2. **`:812` claims "the ORIGINAL backfill heuristic". It is not.** VERIFIED —
   `git show 01637827:…` line 441:

   ```ts
   if (indicatorMetadata.length === 0) return "number";
   return indicatorMetadata.every((m) => m.format_as === "percent") ? "percent" : "number";
   ```

   `every` counts an entry **without** `format_as` as disagreement. The current
   loop skips it. `deriveIndicatorMetadata` emits label-only entries —
   VERIFIED, the `metadata.push` sites carrying **no** `format_as` are
   `server/runs/indicator_catalog.ts:139` (HFA categories / sub-categories),
   `:167` (ICEH strat codes), `:174` (ICEH levels) and `:184` (raw common
   indicators); only `:121` (HFA, `format_as` at `:127`), `:158` (ICEH, at
   `:161`) and the calculated-indicator push (at `:208`) declare one. So this
   flips `number` → `percent` for HFA, ICEH and template modules alike.

Consequence: a legacy m9-02-01 figure freezes as `formatAs: "percent"` and its
CIX/SII values render ×100 with a `%`. The write is permanent.

**Fix — restore exactly what `0cef208b` shipped.** Three lines:

- the true `every`-based original, where a missing `format_as` counts as
  disagreement;
- plus `if (metricId === "m9-02-01") return "number";`;
- delete the "ORIGINAL heuristic" claim at `:812` — that sentence is what made
  this wrong. Keep the m9-02-01 comment at `:793`; it becomes true again.

Regression pin: label-only metadata (HFA / ICEH / template shapes) must yield
`number`, and `m9-02-01` must yield `number` whatever its metadata says.

**Do NOT "read the declaration from the `metrics` table".** I specified that in
the first draft of this plan and it was wrong. The timing works — VERIFIED,
`server/db_startup.ts:117` runs `runProjectMigrations` and only then `:120`
`runProjectDataTransforms`, which opens a fresh `projectDb.begin(tx)` per
transform at `:309-313`, so migration 039 has committed before any sweep's `tx`
opens. But **nothing writes that table any more**: the dual-write was deleted in
`aef409ea` ("delete the legacy dual-write (no backwards compat)"), and metrics
now come from the run manifest via `enrichMetricFromManifest`. VERIFIED — no
`INSERT INTO metrics` anywhere in `server/`; the only readers left are
`server/db/project/results_value_resolver.ts:23`,
`server/runs/synthesize_run.ts:252-258`, and the boot uninstall sweep
(`server/db_startup.ts:488`). On a project created after the runs migration the
table can be empty, the lookup map comes back empty, control falls through to
the heuristic anyway, and the bug is exactly as it was — with no error and a
comment claiming the declaration is being read. A silent fallback to a
known-wrong heuristic is worse than an honest heuristic.

If a future change genuinely needs the declaration here, the source is the **run
manifest** (`manifest.metrics[].format_as`, which `manifest_transform` block 2
already repairs) — not this table. Out of scope.

*This function is unreachable for the eight listed ids: they return at `:810`.
It only ever decides the format of figures belonging to OTHER metrics, which is
why the small faithful restoration is the right size of fix.*

**DONE** (`4a89a29a`). `inferFormatAs` now reads, in full:

```ts
if (INDICATOR_FORMAT_METRIC_IDS.includes(metricId)) return "indicator";
if (metricId === "m9-02-01") return "number";
if (indicatorMetadata.length === 0) return "number";
return indicatorMetadata.every((m) => m.format_as === "percent") ? "percent" : "number";
```

The comment above it now says outright that this function repairs history and
does not improve on it, and spells out WHY the `every` counts a missing
`format_as` as disagreement — the "more correct"-looking rule is the regression.

Verified by transcribing `0cef208b`'s behaviour as an oracle and driving the
real `transformFigureBlockToBundle` over the metadata shapes
`deriveIndicatorMetadata` actually emits — 9/9 match, including
`m9-02-01` over an all-percent catalog and all three label-only family shapes.

Fixture trap worth knowing: the transform reads `source.indicatorMetadata`, NOT
`figureInputs.indicatorMetadata`. Getting that wrong makes every case return
`"number"`, which silently agrees with the oracle everywhere except the single
all-percent case — a harness that looks green while testing nothing.

### [x] A2. The scorecard lost its raw fallback and prints `0` for `0.42`

`client/src/generate_visualization/get_style_from_po/_5_scorecard.ts:86-93`

The old formatter ended `return String(info.value);` when the cell's metadata
carried no `format_as`. The new one calls `formatForValue` unconditionally,
which falls through to `axisFormat` = `"number"` at `decimalPlaces ?? 0`.

**VERIFIED** — same fixture, both surfaces, catalog entry carries a label and no
`format_as`, stored value `0.42`:

```
STANDARD table, label-only meta : [["",""],["","0"]]   <- old code also printed the collapsed format
SCORECARD,      label-only meta : [["",""],["","0"]]   <- old code printed "0.42"
```

So the standard table is **byte-identical** to before (its old non-`perCell`
branch already fell through to the collapse) and must not be "fixed" too. Only
the scorecard regressed.

Reachable: `server/runs/indicator_catalog.ts:83` — "Reads one input mirror;
yields no rows when the package does not carry it." A results package with no
`calculated_indicators_snapshot.json` gives every m8-01-01 row a label-only
entry. That is the "85% renders as 1" failure this workstream exists to remove,
reintroduced on the one surface that was immune.

**Fix.** The scorecard needs to distinguish "declared nothing" from "declared
number" — a question `formatForValue` answers by collapsing. Add a second reader
to `EffectiveFormat` rather than letting the scorecard re-implement the chain
walk (re-implementation is the sin the parent plan removed):

```ts
declaredFormatForValue: (ids) => IndicatorFormat | undefined
formatForValue:         (ids) => declaredFormatForValue(ids) ?? axisFormat
```

Scorecard uses `declaredFormatForValue`, falls back to `String(info.value)`.
One source, two questions. Constant-format metrics answer both from the
declaration.

**DONE** (`4a89a29a`). `EffectiveFormat` gained
`declaredFormatForValue(ids) => IndicatorFormat | undefined`, and
`formatForValue` is now defined as `declaredFormatForValue(ids) ?? axisFormat`,
so there is still exactly ONE chain walk. The scorecard takes the miss branch
and prints `String(info.value)`. Constant-format metrics answer both readers
from the declaration, so a `"percent"`/`"number"` metric never takes the miss
branch.

Verified, same fixture through both surfaces:

```
STANDARD table, label-only meta : [["",""],["","0"]]      <- unchanged, as required
SCORECARD,      label-only meta : [["",""],["","0.42"]]   <- was "0"
```

### [x] A3. `./deploy`'s gate goes red the moment the new file is committed

`lib/indicator_format_metrics.ts`

`deno task lint:systems` is chained into `deno task typecheck`, which is the
`./deploy` gate. It enumerates via `git ls-files`, so the file is invisible only
because it is **untracked**. No `SYSTEM_NN_*.md` frontmatter `globs:` claims it →
orphan → `Deno.exit(1)` at `lint_systems.ts:154`. Prose links at
`SYSTEM_02_persistence.md:372` and `SYSTEM_10_figure_render_export.md:437` are
not claims.

**Fix.** Add it to SYSTEM_10's `globs:`, which already owns
`lib/resolve_effective_format.ts` (`SYSTEM_10_figure_render_export.md:12`). Then
`git add -N` the file and re-run `deno task lint:systems` — running the linter
while the file is untracked proves nothing.

**DONE** (`4a89a29a`). `lib/indicator_format_metrics.ts` added to SYSTEM_10's
`globs:`. Proven with the file TRACKED (`git add -N`, then re-run): tracked-file
count went 831 → 832 and `lint:systems` reported "every tracked file is claimed
by exactly one system". It is now committed, so the gate is genuinely exercised
on every run.

### [x] A4. The AI CSV's format key vanishes above 20 indicators

`lib/ai_tools/format_metric_data_for_ai.ts:162` (the header I wrote) vs `:306`
(`if (stats.uniqueCount <= 20)`)

`:162` promises the model that two conventions coexist — percent stays a 0-1
fraction, `rate_per_10k` is pre-scaled — and points at the Dimension Summary for
which is which. The summary only enumerates values, and therefore formats, at
≤20 unique values.

**VERIFIED** — 21 indicators, formats cycling percent/number/rate, default call
shape (model names no disaggregations):

```
**indicator_common_id:** 21 unique values
**year:** 1 unique value
  2024

year,ind_00,ind_01,ind_02,ind_03,ind_04,...
2024,0.853,1234.00,4.20,0.853,1234.00,...

format key present for indicators? false
```

`0.853` is 85.3%, `4.20` is 4.2 per 10,000, adjacent, unlabelled. Before this
change every value was in bare stored units — one uniform (if useless-for-rates)
convention. The cap bites hardest on m7/m8/m10 scorecards, which routinely
exceed 20 indicators.

**Fix.** When `metric.formatAs === "indicator"` the per-indicator format is not
decoration, it is the key to reading the file — emit it regardless of the cap.
Keep the cap for *labels*, which is what it is for (noise control on long
facility/area lists). Extend `harness_ai_csv.ts` (§7) with the >20 mixed-format
case above; that case is the finding.

---

## 4. Phase B — gate and doc integrity

**DONE** (`4a89a29a`). Above the cap the labels are still dropped, but the
formats are not — emitted grouped by format, so the cost is O(formats) not
O(indicators):

```
**indicator_common_id:** 21 unique values
  percent: ind_00, ind_03, ind_06, ...
  number: ind_01, ind_04, ind_07, ...
  rate_per_10k: ind_02, ind_05, ind_08, ...
```

New helper `groupIdsByFormat`, gated on `metric.formatAs === "indicator"` AND on
ids that actually declare a format — so a 100-value admin-area dimension prints
nothing extra. The ≤20 path is untouched (`harness_ai_csv.ts` still green).

### [ ] B1. The pre-deploy dry-run gate is blind to this change

`validate_figure_bundle_backfill.ts:71-76`

```ts
const already = figureBlockSchema.safeParse(figureBlock).success &&
  !rawJsonNeedsForcedTransform(JSON.stringify(figureBlock));
if (already) return { outcome: ... };   // transform never runs
```

VERIFIED — all three real sweeps call `rawJsonNeedsIndicatorFormatFlip`
(`dashboard_items.ts:47`, `reports.ts:63`, `slide_config.ts:193`); the dry-run
does not. So every post-P2 row carrying one of the eight metrics is counted
`already-bundle` while the boot sweep will rewrite it. The gate's own comment
("skipping it here would under-report the rows the deploy will touch") and
`SYSTEM_02_persistence.md:368` ("the two cannot drift") are both currently false.

**Fix.** Add the second gate call, then re-run the dry-run against a disposable
copy and confirm the counts move.

### [ ] B2. PROTOCOL_APP_MIGRATIONS states both boot-failure policies

VERIFIED — `PROTOCOL_APP_MIGRATIONS.md:293` (mine) opens "The last two rows are
the input-mirror twin of rows 2 and 3…", and `:301` (pre-existing) still reads
"The last two rows are principle 4 unchanged. **Absent or unparseable must not
fail boot**". Both now point at the input-mirror rows, the last of which
explicitly fail-stops. Two adjacent paragraphs, opposite policies, in the doc
that is authoritative for this.

**Fix.** Name the rows instead of counting them, in both paragraphs.

### [ ] B3. SYSTEM_02 names the wrong gate and repeats the false heuristic claim

VERIFIED — `SYSTEM_02_persistence.md:379` says the flip "needs a forced
skip-gate (`rawJsonNeedsForcedTransform`)". The real gate is
`rawJsonNeedsIndicatorFormatFlip` (`_figure_block.ts:202`);
`rawJsonNeedsForcedTransform` (`po_config.ts:423`) is the unrelated roll-up-key
scan. `:373` in the same paragraph repeats the "original backfill heuristic"
claim that A1 falsifies — rewrite it once A1 lands.

### [ ] B4. Dead import — `deno lint` fails

`_figure_block.ts:31`, `type PresentationObjectConfig`. VERIFIED:
`deno lint server/db/migrations/data_transforms/_figure_block.ts` →
`no-unused-vars`, "Found 1 problem". Not in the typecheck gate, so it will not
block `./deploy`, but this change introduced it.

### [ ] B5. Two entries in the "frozen history" list have no history

VERIFIED — `git show HEAD:m010/definition.json` in wb-fastr-modules lists
`m10-01-01, m10-01-02, m10-02-01, m10-02-02`; the working tree adds
`m10-03-01, m10-03-02`. They are **new** metrics, authored `"indicator"` from
day one, never installed, never in a manifest or stored bundle. Nothing to
repair at any of the four sites.

**Fix.** Keep them — harmless, and defensive for the `validateDefinition`
normalization job — but reword the comment: the list is "every metric that must
read `indicator`", not "metrics whose data predates the declaration". Also make
it `as const` / `readonly string[]` to match the word "frozen", and restore the
`lib/mod.ts` export to alphabetical order.

---

## 5. Phase C — pre-existing, in scope by decision

### [ ] C1. Rate cutoffs round-trip to visible float garbage

`client/src/components/visualization/conditional_formatting_editor.tsx:509`
(`scaleForInput`) / `:513` (`unscaleFromInput`), with panther
`_303_components/form_inputs/numbers.tsx:33`
(`displayValue = () => (isFocused() ? text() : String(p.value))`).

**VERIFIED:**

```
typed 3   stored 0.0003  redisplay "2.9999999999999996"
typed 12  stored 0.0012  redisplay "11.999999999999998"
typed 29  stored 0.0029  redisplay "28.999999999999996"
typed 5   stored 0.0005  redisplay "5"
```

`formatRateAuto`'s 1e-9 relative tolerance absorbs it, so the legend still says
"3" — only the box the user just typed into is visibly wrong, which is the worst
possible place for it.

**Fix.** Round in `scaleForInput` to ~6 significant decimals. App-side, not in
panther's `NumberInput` — its `String()` is correct for a control handed an
exact value.

### [ ] C2. The CF editor's scaling factor is filter-sensitive

`conditional_formatting_editor.tsx:471` (`ValueInput`) ←
`presentation_object_editor_panel.tsx:158` (`effectiveFormat().axisFormat`).

**VERIFIED** — the collapse really does swing the factor:

```
rates only       -> axisFormat rate_per_10k
rate + percent   -> axisFormat number
```

Cutoffs are stored raw and compared raw, so **colouring is unaffected**. But a
user who sets a cutoff at 5 per 10k (stored `0.0005`), then adds one percent
indicator to the display, sees the same box read `0.0005`. "Correcting" it to
`5` stores a 50,000-per-10k threshold.

**Fix.** Keep the `axisFormat`-driven scaling — there is no per-value answer for
a figure-wide cutoff — but make the active unit **visible** on the control
(`%` / `per 10k` / bare), so a unit change is something the user sees rather
than something they discover by mis-typing. Record the ruling in SYSTEM_10
beside the existing editor/render divergence paragraph.

### [ ] C3. The bottom cutoff keeps the bound the top one just lost

`conditional_formatting_editor.tsx:398`

`maxVal()` at `:401` was generalised ("only a percent tops out at 100%").
`minVal()` at `:398` is still `p.allowNegative ? -1 : 0`, and `allowNegative`
comes from `METRICS_WITH_NEGATIVE_PCT_VALUES` (`_0_conditional_consts.ts`, four
m3-0x-02 percent metrics) via `_map.tsx:79`, `_chart_like_controls.tsx:193`,
`_table.tsx:125` — **not** `ALLOW_NEGATIVE_SCALE_VALUES_METRICS`
(`special_chart_checks.ts:40-57`), which lists **m9-02-01** at `:41` as "signed
by construction — CIX / SII" and gives it an `auto-zero` axis so negatives
render. VERIFIED: `m9-02-01` does not appear in `_0_conditional_consts.ts`.

So on an m9-02-01 SII figure the axis draws below zero but typing `-0.2` into
the lowest cutoff is clamped to `0`.

**Fix.** Mirror `maxVal`'s reasoning — only a percent has a natural floor — then
reconcile the two metric lists, which answer nearly the same question and
disagree.

### [ ] C4. Close the id-chain asymmetry

`_0_common.ts:192` (`getIndicatorIdsForCell`) leads with the sole value prop;
`:366` (`getIndicatorIdsForChartValue`) and `:384`
(`getIndicatorIdsForMapRegion`) have no equivalent, and
`getDisplayedIndicatorDimensionValues` enumerates indicator *dimensions* only,
so `axisFormat` cannot cover for them.

Unreachable today — VERIFIED, all eight ids are `valueProps: ["value"]` in the
authored definitions. But the list is frozen *because* a newly authored metric
declares `"indicator"` itself, and such a metric could be wide-format; it would
format correctly in tables and fall back to `"number"` on charts and maps.

**Fix.** Add the sole-value-prop id to both chains. Three lines, removes a trap.

### [ ] C5. `s.decimalPlaces` is silently inert on rate figures

`_0_common.ts:309` (`formatIndicatorValue`) routes every rate through
`formatRateAuto` (`:336`), which ignores `decimalPlaces`. **VERIFIED:**

```
dp=0  pct=86%      num=1,235      rate=4.2
dp=1  pct=85.7%    num=1,234.6    rate=4.2
dp=2  pct=85.67%   num=1,234.57   rate=4.2
dp=3  pct=85.670%  num=1,234.568  rate=4.2
```

The ruling is right (a dp=0 default would print `1` beside an axis tick reading
`1.2`) and documented in SYSTEM_10, but the control is still rendered with no
indication it does nothing.

**Fix.** `effectiveFormatAs` is **already** plumbed into every style sub-panel
(`presentation_object_editor_panel_style.tsx:93-129`), so gating is cheap: hide
or disable when it is `"rate_per_10k"`. Eight sites — `_chart_like_controls.tsx:222`
and `:254`, `_table.tsx:95`, `_map.tsx:148`, `_pie.tsx:177`,
`_timeseries.tsx:218`, `:327`, `:452`. Gate on `axisFormat === "rate_per_10k"`
only; on a **mixed** `"indicator"` table the knob genuinely works on the percent
cells and is inert on the rate cells of the same table, and pretending otherwise
would be a new lie.

### [ ] C6. Comments asserting invariants the code does not hold

- `_0_common.ts:190` — "The list is shared with the scorecard so a cell resolves
  the same indicator for its format and for its threshold colouring." The *list*
  is shared; the *stopping rule* is not. `formatForValue` stops at the first id
  declaring `format_as`; `getThresholdMetaForCell` at the first declaring
  `threshold_direction`. Not reachable today (per-module catalogs never mix the
  families). State what is true.
- `lib/resolve_effective_format.ts:203` — "The stored default is an empty
  string, not undefined." Not for a PO config: VERIFIED, the field is declared
  `z.string().optional()` at `lib/types/_metric_installed.ts:190`, and the
  starting config sets it `undefined`
  (`lib/types/presentation_objects.ts:576`). The `""` default lives on the
  **deck** config (`_slide_deck_config.ts:90`). `""` does reach
  `tempConfig` via `ReplicateByOptions.tsx:253` (`p.selectedReplicantValue || ""`)
  → `visualization_editor_inner.tsx:1325`, so the guard is justified — the
  stated reason is just wrong. Fix the reason, keep the guard.
- The guard **is** a latent behaviour change, not a pure no-op. VERIFIED:

  ```
  single indicator dim, replicant "":        number   (old path also reached number)
  SECOND indicator source pinned in filterBy: number  (old path would have said percent)
  ```

  Two reviewers disagreed on this; the second line is why. It needs a metric
  with two of the three `INDICATOR_DISAGGREGATION_OPTIONS`
  (`indicator_common_id`, `hfa_indicator`, `iceh_indicator`) and none exists, so
  it is unreachable today. Record it; do not change behaviour.

### [ ] C7. Two surviving `rate_per_10k` re-implementations

SYSTEM_10 now claims "every rate label follows `formatRateAuto`". Two do not:

- `client/src/components/indicator_manager_hmis/calculated_indicator_editor.tsx:136`
  — `(previewRawValue * 10000).toLocaleString(...)`. This one **is** a label;
  route it through `scaleValueForFormat` (`_0_common.ts:299`) / `formatRateAuto`.
- `lib/ai_tools/format_metric_data_for_ai.ts:492` — `(num * 10000).toFixed(2)`.
  Defensible: a CSV column wants a stable width, not per-value decimals.
  **Keep**, and narrow the SYSTEM_10 claim to labels so it stops being false.

### [ ] C8. Scale-legend decimals are now ragged — accept and record

`compile.ts:44` (`scaleLegendFormat`), `:23` (`buildAutoValueFormatter`).
**VERIFIED**, rate boundary list `[0, 0.000025, 0.00005, 0.000075, 0.0001]`:

```
new (per-value): 0 / 0.25 / 0.5 / 0.75 / 1
```

Previously a shared decimal count printed `0.00 / 0.25 / 0.50 / 0.75 / 1.00`.
Cosmetic; the axis was already per-value. **Accept** — it is the direct
consequence of the one-rule decision that fixed the duplicated-label bug — and
note it in SYSTEM_10 so the next person does not "fix" it back.

---

## 6. Phase D — panther repo

Edit the source, not the mirror. After ANY of these: `deno task typecheck` +
`deno task test` (expect 303 passed / 0 failed) in panther, then
`./sync wb-fastr --force --no-commit`, then the app's `deno task typecheck`.

### [ ] D1. `TableCellPrimitive.meta` carries two of four headers

`modules/_001_render_system/primitives/types.ts:653-661`, built at
`modules/_010_table/_internal/generate_table_primitives.ts:222-226`.

This is the *other* public surface exposing a cell's headers, and the library
treats it as one contract with `TableCellInfo` — the label-semantics comment at
`chart_info_types.ts:159` enumerates "getStyle funcs,
`TableCellInfo.rowHeader/colHeader`, **primitive metadata**" in one breath. The
new field comment asserts "A cell knows all four of its headers"; the primitive
contradicts it.

Latent — **REPORTED**: a reviewer grepped both repos and found nothing reads
`meta.rowHeader` today. Any consumer inspecting a rendered table via primitives
rather than the style callback (annotation overlays, hit-testing, an AI
figure-reader, a primitives-based export) is still blind to the group axes,
which is the blindness this change exists to remove.

**Fix.** Add both fields to the meta type and populate from `cell.cellInfo` —
already in scope at the construction site. Two lines plus the type.

### [ ] D2. Panther's architecture doc is now wrong

`DOC_FIGURE_ARCHITECTURE.md:1159` — the contract table row still reads
`| TableCellInfo | rowHeader/colHeader: HeaderItem \| undefined | …`, and the
asymmetries bullet at `:1168` explains the `| undefined` for row/col only. Every
other row in that table lists all its axes, so this is the odd one out — in the
doc whose job is cataloguing these asymmetries.

### [ ] D3. Stale enumeration in the label-semantics comment

`modules/_001_render_system/chart_info_types.ts:159` — should name all four
headers. **REPORTED**: a reviewer confirmed empirically that the two new fields
do carry RESOLVED labels (with `tableRowHeaders.textFormatter = l => "R<"+l+">"`
a cell reports `rowGroupHeader = {id:"A", label:"R<A>"}`), so the rule holds for
them; the comment just does not name them, and it is the single authoritative
statement of that rule.

### [ ] D4. The helper's comment describes work it does not do

`modules/_010_table/_internal/measure_table.ts:349` says group headers are built
"per row/column INDEX … so **both lookups** are built once from the same
source". Only the row lookup exists; the column group header is re-derived
inline at all three call sites (`:202`, `:598`, `:925`), allocating a fresh
`HeaderItem` per **cell** rather than per group.

**Fix.** Build a col lookup too and use it at all three sites — removes a
per-cell allocation and makes the comment true. (Or narrow the comment; building
it is better.)

### [ ] D5. Fold the duplicated `rowGroups` walks

`measure_table.ts:557-560` and `:896-899` — both functions walk `d.rowGroups`
twice in adjacent statements: an inline loop building
`rowHeaderItems[row.index]`, then `buildRowGroupHeadersByRowIndex(d.rowGroups)`
over the identical structure. One helper returning
`{ rowHeaderItems, rowGroupHeaderItems }` collapses four loops into two call
sites.

---

## 7. Verification bar

The parent plan's bar stands: fixtures from the REAL
`getStartingConfigForPresentationObject`, assertions on `buildFigureInputs`
output with the real formatter functions invoked, never on a config-level
intermediate. Additionally:

- **A1 and B1 touch permanent writes.** Verify by executing against a
  **disposable** Postgres and a **copy** of a package dir (`SANDBOX_DIR_PATH`
  override). Never write to a real project DB; never mutate
  `_example_instance_dir`.
- **A2 needs its own pin**: all-label-only catalog ⇒ scorecard prints the raw
  value, standard table still prints the collapsed format (they differ on
  purpose — see the A2 output).
- **A3 must be proven with the file TRACKED** (`git add -N`), else vacuous.
- **A4 needs the >20-indicator case.**
- Re-run in wb-fastr: `deno task typecheck` (server + client + `lint:systems`),
  `./validate_queries`, `./validate_migrations`, `deno lint`.
- Re-run in panther after any Phase D change: `deno task typecheck`,
  `deno task test` (303).

### Gate results at the Phase A commit (`4a89a29a`)

All green, so any red after this point is yours: `deno task typecheck` (server +
client + `lint:systems`); the per-value harness 27/27; `harness_ai_csv.ts`;
`./validate_migrations`; `./validate_queries` 52/52. The one exception is
`deno lint`, red on `_figure_block.ts` — that is B4.

### The harnesses do not live in the repo

They were written to the session scratchpad, which does not survive. Rebuild
them from the recipe below; they are ~60 lines each and worth it before touching
anything in B/C. The four that mattered:

- **per-value harness** — real starting configs across HFA / calculated / ICEH,
  every surface, both directions. The regression net for anything in C.
- **`harness_ai_csv.ts`** — drives `getMetricDataForAI` with a fake `AIToolEnv`
  (`getItems` returning canned items + `indicatorMetadata`). Needs `--env-file`.
- **`inferFormatAs` oracle** — transcribes `0cef208b`'s behaviour and diffs the
  live transform against it. Rebuild this before touching A1's function again.
- **scorecard vs standard table** — same fixture through both, proving they
  differ on purpose.

### What I re-confirmed of the parent work (so it is not re-litigated)

Personally executed: the per-value harness (27/27) covering HFA / calculated /
ICEH across table item axis, table **group** axis, chart, timeseries, map and
scorecard, in both directions; the AI CSV harness; migration 039's SQL literal
matching `INDICATOR_FORMAT_METRIC_IDS` 8/8; `./validate_migrations`;
`./validate_queries` (52/52); panther `deno task test` (303).

**REPORTED, not personally reproduced:** a reviewer drove panther's
`TableRenderer.measure` over 8 table shapes checking every `TableCellInfo`
against an independent index→group oracle (0 mismatches), and confirmed
`getTableExportAoa` agrees with the measure path cell-for-cell.

### Running client code under Deno

This is what made the review conclusive, and it is written down nowhere else:

- A scratch `deno.json` mapping `"panther"` and `"@timroberton/panther"` to a
  hand-rolled shim, `"lib"` → `wb-fastr/lib/mod.ts`, `"~/"` →
  `wb-fastr/client/src/`, plus the client's npm deps (solid-js, zod, nanoid,
  papaparse, markdown-it, idb-keyval, docx, jspdf, pptxgenjs, xlsx, yjs,
  y-protocols, @solidjs/router, @solid-primitives/deep, client-zip, sortablejs,
  @anthropic-ai/sdk, @vscode/markdown-it-katex, fractional-indexing).
- The shim re-exports panther's **core** barrels only (`_000_*` …
  `_150_figure_schema`, plus `_111`/`_112`/`_113`/`_121`) — NOT the `_30x` UI
  modules, which pull a CSS import Deno cannot resolve.
- `deno run --allow-all --sloppy-imports -c deno.json <file>`.

Server/lib code needs none of that: `deno run --allow-all -c deno.json /tmp/x.ts`
from the repo root with absolute-path imports.

State plainly what was run and what it printed. Do not describe a check that was
not executed.

---

## 8. Deliberately NOT doing

- **Table-cell conditional-formatting COLOUR cannot be per-indicator.** VERIFIED
  — `modules/_003_figure_style/style_func_types.ts:437` calls
  `valuesColorFunc(info.valueAsNumber, info.valueMin, info.valueMax)`, no header
  ids. So on a mixed-indicator table the *text* is now per-indicator while the CF
  *colour* is not: a percent scale with a 0-1 domain colours the count columns by
  the same domain. The scorecard sidesteps it with its own `func`, which does
  receive the full `TableCellInfo`. Real and pre-existing, but it changes a core
  panther style contract used by every figure type. **Record in SYSTEM_10's open
  items; separate workstream.**
- **A panther test pinning the three-pass agreement on the new group headers.**
  An independent oracle exists, and `measure_table.ts:315` already warns the
  autofit path "must match the real measure exactly, or autofit silently
  corrupts". But `DOC_TESTING.md:105` bans anything added "for completeness",
  and the three passes were already driven over 8 shapes with 0 mismatches.
  **Declined**, recorded so the reasoning is not lost.
- **Version snapshots are not swept.** VERIFIED — `PROJECT_DATA_TRANSFORMS`
  (`server/db_startup.ts:260-269`) has eight entries and none touches
  `report_versions.figures` or `deck_versions.slides`, which hold full figure
  snapshots. Restoring a version writes a pre-flip bundle back into the live row.
  Bounded: the flip gate is a sticky raw scan that fires again on the next boot.
  **Accepted**, named because it is the last store that can re-introduce the old
  value.
