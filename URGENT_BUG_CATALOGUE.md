# Urgent bug catalogue

Every non-HFA bug, request and data question in Tim's Gmail inbox on 2026-10-26,
checked against the code. HFA items are in
[HFA_WORK_CATALOGUE.md](HFA_WORK_CATALOGUE.md).

**Compiled:** 2026-10-26 on `main` at `9b3b6e19d` (2.0.6, deployed 2026-10-22).
Updated the same day: twelve rows landed (below), and the modules repo carries
the m005 label fix (`cdbc3ed`), to push in lockstep with the next deploy.
[URGENT_BUG_CATALOGUE_EMAILS.md](URGENT_BUG_CATALOGUE_EMAILS.md) holds the
replies to send once it is live.

**Keeping it current.** When an item lands, move its row to "Already done" with
the date and the commit.

## Sources

Every thread in the inbox was read. Nine are about the platform:

- "V2 bugs / IG demo" (Ashley, 2026-10-23).
- "JAR 2026 Compendium: Historical Data Discrepancies Between August and
  September version" (Joshua Elaigwu, 2026-10-23; Ashley's reply hands it to
  Angelica).
- "V2 testing site - upcoming workshops/trainings" (Angelica, 2026-10-23).
- "Fwd: [FASTR] New Bug Report from asheffel@worldbank.org" (Meghan, 2026-10-21,
  Ashley's report of 2026-10-20 on `demo`).
- "Scopes and users- upcoming virtual workshops and mission" (Angelica,
  2026-10-16).
- "Fwd: [FASTR] New Bug Report from asheffel@worldbank.org" (Meghan, 2026-10-14,
  Ashley's report on `demo-v2-testing`, plus three suggestions).
- "Viz and platform questions before check in with Ashley" (Claire, 2026-10-14).
- "Small platform bugs and suggestions- current version" (Angelica, 2026-10-09).
- "Uganda: Markdown tables in slide decks" (Angelica, 2026-10-09).

The other six are not platform work: the Gates "New Frontiers" resubmission, the
firm ToR ("Useful Data and PDF work"), the HF Profiles concept note, the demo
video, the garden plan, and Tim's own "HFA work" notes (already in the HFA
catalogue).

Not read: the screenshots in Ashley's, Claire's and Angelica's messages, and
Joshua's 38-slide comparison deck. The testing instance's build at the time of
the 2026-10-14 report is unknown: `deploy_testing` pushes the working tree
without a commit.

"Verified" below means read in the code or the commit history on 2026-10-26.
Nothing was run in the app.

## Bugs

| Id | Issue                                                                                   | Raised by                     | State in code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -- | --------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4 | A four-column markdown table cannot be made in a slide text block; it works in a report | Angelica and Fran, 2026-10-09 | No column limit: slides do not render tables at all. The AI is refused by `validateNoMarkdownTables` (`client/src/components/products/copilot/_shared/content_validators.ts:19-37`) and told so in five prompt places. Typed by hand, the panther markdown measurer throws on a table item (`panther/_105_markdown/_internal/measure_items.ts:163-169`) and the slide shows "Bad chart config"; the canvas editor marks `table_open` unsupported (`lib/slide_text_offsets.ts:125-129`) and exits to a side panel that no longer exists (`inline_text_editor.tsx:1046-1050`). Reports render through report-forge's markdown-it with a Widgets > Table picker capped at 6 columns (`report-forge/ui/screen/toolbar.tsx:1528-1534`). Change: render tables in slide text blocks through panther's table path, or offer a table figure preset from the slide Insert menu                                                                                                                                                   |
| B8 | Figure footnotes may not reflect the adjustment actually used                           | Claire for Ashley, 2026-10-14 | The adjustment is a per-module package parameter (`m012/_parameters.ts:3-31`, `m005/_parameters.ts:4-34`, `m011/_parameters.ts:3-26`), substituted at generation (`server/server_only_funcs/get_script_with_parameters.ts:113-128`), so one package can mix bases. Footnotes never read it: a new figure takes the preset's static text (`lib/derive_presets.ts:34-36`, only DATE_RANGE and REPLICANT substituted at `build_figure_inputs.ts:165-174`), an edited figure takes whatever the model writes (`apply_figure_config_patch.ts:191`). `FOOTNOTE_COVERAGE_BASE` (`wb-fastr-modules/_shared/text_presets.ts:1-5`) says "adjusted for data quality" even under `count_final_none`; m012 presets have no footnote; the m003 to m012 carry-forward deletes the basis sentences (`lib/retired_metrics.ts:114-140`). Change: stamp each module's count-variable choice into the run manifest (`lib/types/run_manifest.ts:100-108` holds `configSelections` as a string already) and render the basis sentence from it |

## Requests

| Id | Request                                                                    | Raised by                     | State in code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -- | -------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R4 | A "view as user X" mode for admins to check scopes                         | Angelica, 2026-10-16          | Will not be done (Tim, 2026-10-26): impersonating a session touches every permission check, and a mistake shows a user data they must not see. The check is a test account that holds the scope. Angelica is told in her email                                                                                                                                                                                                                                                                         |
| R7 | In Explore, toggle coverage between none, outliers, completeness and both  | Claire for Ashley, 2026-10-14 | Coverage has one basis per package: m005 builds the numerator from the single `SELECTED_COUNT_VARIABLE` column (`m005/script.R:270-271`) and m006 reads only m005's output (`m006/_core.ts`). All four `count_final_*` columns exist only for volumes (`m002/_results_objects.ts:5-21`), where Explore already has the "Adjustment impact" switch (`lib/explore_views.ts:167-203`). Change: m005 emits coverage per count variable and m006 carries the four; then an Explore switch on the m006 views |
| R8 | Hover a survey point on the coverage chart to see its source (DHS or MICS) | Claire for Ashley, 2026-10-14 | The source never reaches a package: m006 declares `survey_raw_source` (`m006/_results_objects.ts:14-15`) but m005 drops `source` and `source_detail` before writing its combined results (`m005/script.R:2175`, `2196`, `2220`), so the column is always NA. Explore draws through panther `FigureHolder`, a canvas with no hover (`panther/_303_components/charts/figure_holder.tsx:31-50`). Change: keep `source` through m005, then a hover on the coverage chart's survey series                   |
| R9 | The v2 default visualisations are redundant                                | Tim to Claire, 2026-10-14     | Every preset of every metric is a card since `ecb530d34` (app) and `e22dcbf` (modules): about 50. Twins: m002's three identical adjustment tables, m006's coverage timeseries at three levels, m012's annual-change pair, m011's eight band charts across levels, m010's observed and carried-forward pairs. Change: restore a default subset flag on presets and show the rest behind "All presets"                                                                                                   |

## Data and operations

| Id | Item                                                                                                                                                                                                              | Raised by                                          | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | Nigeria JAR compendium: values for 2020 to August 2026 changed between the August and September runs; 21 series 15 to 75% lower across every month, annual totals revised, Jan to Sep cumulative below Jan to Aug | Joshua Elaigwu, 2026-10-23; Angelica investigating | A whole-series shift is not outlier re-detection: m012 and m005 use one count variable per package (`m012/_parameters.ts:3-31`), so a settings difference or a dataset difference between the two runs explains it. Each run's manifest records `modules[].configSelections` and `datasets[]` (`lib/types/run_manifest.ts:100-108`, `285`), so the diff is readable from the two packages. The 2020 Penta 1 coverage move (121% to 134%) and the "Fully immunized" relabel point at the m004 to m006 carry-forward (`lib/retired_metrics.ts:371-415`), which changed the denominator. Answer to Joshua's two questions: outlier detection runs on the full series in every run; the adjustment setting is per package and is what to compare |
| D2 | `demo-fr-v2-testing.fastr-analytics.org` shows "temporarily unavailable"; Angelica needs a French v2 site for the Mali training and the Mauritania workshop (2026-10-26 to 30)                                    | Angelica, 2026-10-23                               | Not a code item. 2.0.0 reached production on 2026-10-20, so `demo-fr` is now v2 and is the site to use. Change: reply, and retire or redirect the v2-testing hostname                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Already done

- B1: a tab whose AI turn is running answers `busy` to a take-over and the
  taker's notice says to wait (`3495b179d`).
- B2: the replicant errors list `id (label)` and say to pass the id
  (`12fa416be`); the figure-editor view's instructions already name
  `update_figure_editor` as the tool to use there. The filter-value check lists
  every valid value in its message, so the model needs one retry, not a lookup
  tool. Still panther's: a readable error label in place of "Tool feedback:
  <tool>".
- B3: `deck_settings`, `deck_history` and `report_history` carry instructions
  naming the screen and its back button (`616302d5b`).
- B5: the duplicate's folder opens and the copy opens for editing (`06bef515f`).
- B6: every approved user has Explore; a restricted user's opens on the first
  scope they hold and offers only their scopes (`914c47108`).
- B7: m005's six metrics share a label map generated from the script's chains
  and targets, and `script.R` learns the sba phrase (modules `cdbc3ed`); the pin
  and replicant selects merge every metric's `valueLabelReplacements` into their
  label map (`442d710f3`). The new labels reach a package generated from the
  pushed module definition.
- R1: package options read `label · date (pinned)` in the create modal, the
  package-and-scope modal and Explore (`1e71b7902`).
- R2: "Add slide" is spelled beside the plus, and the Insert menu starts with a
  new slide (`91539befc`).
- R3: `showAi` persists per browser and starts open (`341180d83`).
- R5: the products list shows "Last updated" (2.0.0, `5d4d607cc`, `54f1b43dd`).
- R6: `users.organisation` and `users.role` (migration 219), asked once after
  approval, edited from the profile, pushed to the fleet, shown on the Users
  page (`c662bee93`).
- R10: AI settings expose effort (`5360692e1`).
- D3: answered under B1 and in Ashley's email.
