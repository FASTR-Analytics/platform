# PLAN_INBOX_BUGS: the open platform items from the inbox

One item per line: what to build, where, and the gate. The commit that lands an
item deletes its line. Delete the file with the last one.

- **AI figure-edit errors** (Ashley, 2026-10-23). Needs her screenshots or the
  "Tool feedback" text. Then trace the message in
  `client/src/components/products/copilot/ai_tools/tools/update_figure.ts`,
  `client/src/generate_visualization/validate_figure_config_edit.ts` or
  `lib/ai_tools/content_validators.ts` and fix the cause.
- **Tables in slide text** (Angelica and Fran, 2026-10-09). Panther's slide
  markdown measurer throws on a table item
  (`panther/_105_markdown/_internal/measure_items.ts:163-169`). Render tables
  through panther's table path for slide items, in the panther repo, then sync;
  drop the `validateNoMarkdownTables` refusal
  (`client/src/components/products/copilot/_shared/content_validators.ts:19-37`)
  and the "Markdown tables are NOT allowed" prompt lines, and let
  `lib/slide_text_offsets.ts:125-129` treat `table_open` as editable.
- **Footnotes read the package's adjustment** (Claire for Ashley, 2026-10-14).
  Each module's count-variable choice is in the manifest's
  `modules[].configSelections` (`lib/types/run_manifest.ts:100-108`). Render the
  basis sentence from it in
  `client/src/generate_visualization/build_figure_inputs.ts:165-174` beside the
  DATE_RANGE and REPLICANT tokens, and drop the fixed "adjusted for data
  quality" wording from `wb-fastr-modules/_shared/text_presets.ts:1-5`.
- **Coverage under all four adjustments** (Claire for Ashley, 2026-10-14). In
  `wb-fastr-modules`, m005 emits coverage per `count_final_*` column
  (`m005/script.R:270-271`) and m006 carries the four variants
  (`m006/_results_objects.ts`); then an Explore switch on the m006 views
  (`lib/explore_views.ts:241-280`) like m002's "Adjustment impact" (`:167-203`).
  Gate: `./validate_queries`.
- **Survey source on hover** (Claire for Ashley, 2026-10-14). In
  `wb-fastr-modules`, stop m005 dropping `source` and `source_detail`
  (`m005/script.R:2175`, `2196`, `2220`) so m006's `survey_raw_source` fills;
  then a hover on the coverage chart's survey series, which panther's
  `FigureHolder` lacks (`panther/_303_components/charts/figure_holder.tsx`).
- **Fewer default visualisations** (Tim to Claire, 2026-10-14). Every preset is
  a card since `ecb530d34` (app) and `e22dcbf` (modules): 50 cards, with twins
  across levels and modules. Waiting on Claire's view of which to keep; then a
  default flag on presets and the rest behind "All presets"
  (`client/src/components/results_packages/package_view/presets.tsx:31-82`).
