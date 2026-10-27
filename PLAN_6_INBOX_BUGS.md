# PLAN_6: the open platform items from the inbox

One item per section: what to build, where, the gate, and what it waits on.
Instruction to an agent: "Do item N of PLAN_6_INBOX_BUGS.md." Items 2 to 5 are
ready now; items 1 and 6 wait on the people named. Branch: `main`. The commit
that lands an item deletes its section. Delete the file with the last one.
Repos: this app, `wb-fastr-modules` (edit the sources, `deno task
build`
regenerates each `definition.json`, push in lockstep with schema changes) and
panther (edit in the panther repo, typecheck, commit app changes, then
`./sync`).

## 1. AI figure-edit errors (Ashley, 2026-10-23)

Waits on Ashley's screenshots or the "Tool feedback" text, already asked for.
"Tool feedback: update_figure" is panther's label for any `AIToolFailure` the
tool throws; the text below it names the site. The sites `update_figure`
reaches: `update_figure.ts`, `validate_figure_config_edit.ts`,
`apply_figure_config_patch.ts`, `assert_replicant_valid.ts`,
`resolve_bundle_from_metric_and_config.ts`, `slide_target.ts`,
`figure_metric_for_ai.ts`, the lib and copilot `content_validators.ts`, the view
gate and `tool_guard.ts`. With her text, trace the one message to its site and
fix the cause. Gate: the floor.

## 2. Tables in slide text (Angelica and Fran, 2026-10-09)

Ready; panther first. Panther's slide markdown measurer throws on a table item
(`panther/_105_markdown/_internal/measure_items.ts`, both `case "table"` arms),
so the copilot refuses tables (`validateNoMarkdownTables`, four call sites and
four prompt lines) and a table a user types renders the whole slide as a bad
config.

- Panther: a table inside a markdown item is measured and rendered through the
  table renderer (`convertMarkdownTableToTableData` exists;
  `getMinComfortableWidth` already measures table cells), with the autofit scale
  threaded into the table's text style so the block still shrinks as one unit,
  and the PPTX text path (`_122_pptx/text_to_pptx.ts`) gains a table case. Not
  an app-side split of the block into text and table nodes: that breaks the
  one-block-one-node model the slide editor's hit targets and autofit rely on.
  Panther typecheck, commit app changes, `./sync`.
- App: delete the validator, its five references and the four prompt lines
  (`slides.tsx`, `drafts.tsx`, `update_slide.ts`, the copilot
  `build_system_prompt.ts`), and the SYSTEM_13 sentence that states the refusal.
  A block holding a table stays side-panel-edited: `lib/slide_text_offsets.ts`
  keeps `table_open` unsupported, as it does for fences.

Gate: the floor, `./validate_protocols`.

## 3. Footnotes read the package's count basis (Claire for Ashley, 2026-10-14)

Ready. The coverage footnote says "adjusted for data quality" whatever the
package chose (`wb-fastr-modules/_shared/text_presets.ts`, copied into
`config.t.footnote` at figure creation, and verbatim in `lib/retired_metrics.ts`
for the carried metric). `buildFigureInputs` reads only the bundle, so the basis
cannot be read from the manifest there.

Design, DATE_RANGE's: a token in the modules' wording, resolved at render beside
`withDateRange` from a bundle field the server stamps on the items payload from
the manifest's selection (`run_read.ts`), with the sentence per option value in
lib in three languages (the option labels are English only). A sentence
substituted at preset derivation would go stale when a figure is repointed to a
package with another basis, which is the bug class reported. The basis is
declared, not inferred: the metric's module's count selection
(`SELECTED_COUNT_VARIABLE` on m005, `SELECTEDCOUNT` on m011 and m012), else its
prerequisite's (m006 reads m005's).

Lockstep: the bundle schema (`lib/types/_figure_bundle.ts`) and its test, the
items payload type, `PO_CACHE_VERSION`, `lib/retired_metrics.ts` and its test,
the modules' wording and `deno task build`. Gates: the floor,
`./validate_queries`.

## 4. Coverage under all four adjustments (Claire for Ashley, 2026-10-14)

Ready, in the modules repo first. m005 computes coverage on the one
`count_final_*` column the package selected (`m005/script.R`, the chain from
line 271), and m006 carries three estimation columns on that one basis, not four
variants. m002's "Adjustment impact" switch is not the pattern: a switch binding
cannot compose with m006's per-level bindings.

Design, m2-02-01's: m005 runs its coverage chain once per basis (four times the
runtime, stated in the module header), a new results object per level in m005
and m006 carries `coverage_<basis>` value props, with new metrics over them and
existing results objects and figures untouched; the Explore view shows the bases
as series. No new disaggregation option, no binding type change.

Lockstep: twelve metric files and `definition.json`; the app tests that read the
local checkout (`explore_views_test.ts`,
`run_generation_module_options_test.ts`, `retired_metrics_test.ts`). Gates: the
floor, the modules build.

## 5. Survey source on the coverage chart (Claire for Ashley, 2026-10-14)

Two halves.

- Modules, ready: m005 drops `source` and `source_detail` before writing its
  national, admin-2 and admin-3 combined results (`m005/script.R`, the three
  `select(-any_of(...))` lines near 2176, 2197 and 2221). Stop the drop and
  declare the two columns in m005's results objects, since ingest refuses an
  undeclared header; m006's `survey_raw_source` then fills. Gate: the modules
  build.
- App, after the modules half: show the source on the survey series as a
  per-point label through the existing coverage `textFormatter`
  (`get_style_from_po/_2_coverage.ts`), not on hover: products export to PDF,
  PPTX and PNG as static canvases, so a hover would lose the fact everywhere a
  figure is delivered, and panther's `FigureHolder` has no pointer handling to
  build on. The label needs the column in the items: the fetch config selects
  only value props and group-bys today (`lib/get_fetch_config_from_po.ts`,
  `run_read.ts`, the bundle), so an annotation column is a new fetch concept.
  Gates: the floor, `./validate_queries`.

## 6. Fewer default visualisations (Tim to Claire, 2026-10-14)

Waits on Claire's view of which to keep. Every preset is a card since
`ecb530d34` (app) and `e22dcbf` (modules): 50 cards, with twins across levels
and modules, and the insert-figure wizard lists them all too
(`insert_figure/step_2_preset.tsx`). Her list decides the mechanism: twins that
are redundant are deleted in the modules repo, which needs no schema; a preset
that must exist but stay behind "All presets" needs an optional `default` flag
on both preset schemas (GitHub and installed, absent reads false, a module with
no flagged preset shows all) in both repos, in lockstep. Explore borrows style
from a metric's first preset (SYSTEM_11), so deletions can move Explore
defaults.
