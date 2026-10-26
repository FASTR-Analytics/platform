# HFA work catalogue

Every HFA request, bug and open question raised by the HFA team, and every piece
of HFA work done, checked against the code. HMIS and ICEH items are excluded.

**Compiled:** 2026-10-01, on branch `version2`. Updated 2026-10-08 from the
thread "HFA data upload testing", and 2026-10-15 from the thread "FASTR
platform - HFA weekly call", the "HFA work" messages to 2026-10-08 and Tim's
notes from that day's HFA team meeting. Checked 2026-10-26 against the Gmail
inbox, the HFA weekly-call thread to 2026-10-16 and Tim's atlas HFA notes:
nothing new to add. On 2026-10-26 every open row was re-verified by reading the
code, and the rows that turned out done moved to "Already done".

**Keeping it current.** Every piece of HFA work goes in here: when an item
lands, move its row to "Already done" with the date and the commit; when work is
done that no row asked for, add it to "Already done" directly.

## Sources

- Gmail thread "HFA work" (30 messages, 2026-07-21 to 2026-10-08).
- About 45 other Gmail threads from Meghan Paul, Safia Jiwani, Viviane Azais and
  Ashley Sheffel, 2025-05 to 2026-09-30.
- Google Sheet "FASTR Wish List Tracker": the "HFA list" tab in full, the other
  tabs searched for HFA rows.
- Gmail thread "HFA data upload testing" (10 messages, 2026-09-11 to
  2026-10-07), Safia's Guinea notes attached to it, the generic XLSForm Viviane
  attached on 2026-10-06 (`FASTR Survey - Programed - Generic - 20260417.xlsx`),
  and the Madagascar round 1 file Angelica attached on 2026-10-07
  (`mg_r1-V2.csv`).
- Gmail thread "FASTR platform - HFA weekly call" (10 messages, 2026-10-13 to
  2026-10-15): Safia's Guinea R1 indicator notes, Viviane's Mali R1 and R2 notes
  with their screenshots, and Leenisha's Nigeria notes
  (`LM HFA platform testing notes.docx`) with their screenshots.
- Tim's notes from the HFA team meeting of 2026-10-15.
- The default indicator workbook on the resource hub
  (`hfa_default_indicators.xlsx`, 475 indicators), read on 2026-10-26.

Not read: screenshots in the earlier sources, "FASTR Team Feedback.pdf"
(2025-05), and Sara Riese's Somalia notes and Viviane's Mali notes, which are on
World Bank SharePoint and not open to Tim. The converter section of Safia's
Guinea notes is about the XLSForm converter, which is outside this repo, apart
from Q8.

"State in code" below was read in the code on 2026-10-26. Nothing was run in the
app.

## The indicator code language

The "R code" of an indicator is the app's own expression language, written in R
syntax. The server splices each snippet into a `case_when` branch over the
per-facility wide frame, inside a `with(list(...))` that rebinds every
referenced variable with its sentinel codes set to NA and rebinds `%in%` to be
NA-safe (`server/server_only_funcs/get_script_with_parameters_hfa.ts`). The app
parses the snippet itself: every bare identifier not in `R_KEYWORDS` or
`R_COMMON_FUNCTIONS` (`lib/hfa_r_code_analysis.ts`) is a variable or indicator
dependency, so that allowlist is the language definition. It drives the
unknown-variable gate, the dependency graph, the response-status companion and
the binary/numeric type inference. `AND` and `OR` are rewritten to `&` and `|`.

The language is therefore: comparisons, `&`, `|`, `!`, arithmetic, `%in% c()`
and a few per-facility functions. The default workbook's 475 indicators use only
`==`, `!=`, `<=`, `&`, `|`, `%in% c(...)`, `+` and `*`. Any request to accept
more R (Q11) is answered by this section, not by widening the allowlist.

## Quick fixes

Q1 to Q12 are under "Already done".

| Id | Issue | Raised by | State in code |
| -- | ----- | --------- | ------------- |

## Waiting on the HFA team

Small code changes that need an answer first.

| Id | Question                                                                                                                      | State in code                                                                                                                                                                                                                                                                                            |
| -- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 | What are the standard defaults for the HFA module settings (Ashley, 2026-09-11)? Viviane got unweighted results on 2026-10-15 | m010 defaults: `USE_SAMPLE_WEIGHTS` FALSE, `DONT_KNOW_TREATMENT` missing, `STOP_IF_INDICATOR_FAILS` FALSE (`wb-fastr-modules/m010/definition.json:22-65`). The settings editor and the run fill untouched keys from these defaults. Viviane's unweighted results are the weights default; M27 removes it |
| W2 | Is not-applicable coded `-98` and `-999998` ("?????" in the sheet, High)?                                                     | Both are classed "question specific", not "not applicable" (`lib/hfa_sentinel_classification.ts:37`). In the Sierra Leone form `-98` is question-specific                                                                                                                                                |
| W4 | Is cross-round carry-forward (`USE_OTHER_ROUND("Cycle 2")`) really complete? The sheet ticks it (Viviane, High).              | No `USE_OTHER_ROUND`. m010 fills a round where an indicator has no values from the previous observed round, or the next for a leading gap, and records `carried_from` (`wb-fastr-modules/m010/script.R:104-137`, 2026-07-08, `babd30d`). See L5                                                          |

## Medium

| Id  | Issue                                                                                                                                                                  | Raised by                                          | State in code                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Hard border for the roll-up ("All facilities") column                                                                                                                  | Tim, 2026-07-28                                    | Panther draws every inner table line with `gridLineWidth` (`panther/_010_table/_internal/generate_table_primitives.ts:286-314`); no per-column border style exists. Upstream panther change: a style list of emphasised column ids drawn with `borderWidth`, fed from `ROLLUP_PIN_IDS` in `get_style_from_po/_0_common.ts:162-180`                                                                                                                         |
| M2  | Custom label for the roll-up column                                                                                                                                    | Tim, 2026-07-21                                    | Hard-coded in `client/src/generate_visualization/get_data_config_from_po.ts:126-131` and spread after `valueLabelReplacements`, so nothing overrides it. Add an optional `rollupLabel` to the presentation-object config and return it first in `getRollupRowLabel`                                                                                                                                                                                        |
| M3  | Make the AI copilot genuinely useful for checking indicator code: it reads the labels of the variables the code uses and checks that they make sense for the indicator | Tim, 2026-09-19 and 2026-10-15                     | `validate_hfa_indicators` (`client/src/components/data/hfa/indicators/ai/tools.ts:802`) checks syntax, unknown variables, type and cross-round consistency; nothing compares variable labels with the indicator. Return each indicator's definition with the dictionary labels of the variables its code references                                                                                                                                        |
| M4  | Recode "Other" (`-96`) survey responses                                                                                                                                | Tim, 2026-09-19; Viviane, 2026-08                  | Recoding exists for registry columns only (facility type, ownership, custom). `-96` is classed "other" and stays in the data as a real answer (`lib/hfa_sentinel_classification.ts:39`, `get_script_with_parameters_hfa.ts:63`). Needs a value-recode map in `HfaCsvMappingParams` applied in the wide-to-long loop at `stage_csv.ts:297-300`                                                                                                              |
| M5  | Updating the default indicators broke Sierra Leone's visualizations                                                                                                    | Meghan, 2026-09-30                                 | The import matches on the workbook's `indicatorId`, and the 475-indicator file changed ids. Mostly a file-discipline issue. Meghan worked around it with a country file                                                                                                                                                                                                                                                                                    |
| M6  | Detect questionnaire changes between rounds from the XLSForm and flag affected indicators                                                                              | Viviane (sheet, Medium)                            | Not present. The "Consistent" column compares code across rounds, not questions                                                                                                                                                                                                                                                                                                                                                                            |
| M7  | Draft notes automatically from the XLSForm                                                                                                                             | Viviane (sheet, Low)                               | Not present                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| M8  | Delete individual rows after import                                                                                                                                    | SYSTEM_06 follow-on                                | Only bulk deletion exists: a round or all data (`server/db/instance/dataset_hfa.ts:109-131`), a time point, all facilities, unused facilities. Add a delete of `hfa_data` for one facility and round next to `deleteDatasetHfaData`, with a per-row action in `dataset_items_holder.tsx`                                                                                                                                                                   |
| M9  | Standard HFA report: default visualizations plus an AI prompt, as for HMIS. Service-specific snapshots                                                                 | Ashley and Meghan, 2026-09-14; Safia, 2026         | A new deck gets a cover slide only (`server/db/products/slide_decks.ts:142`); no HFA template or seeded prompt exists. The team decides the approach first                                                                                                                                                                                                                                                                                                 |
| M13 | Indicator search matches the variable ids in the code. Filter the indicators by time point                                                                             | Leenisha, 2026-10-15                               | `indicatorSearchText` (`manager.tsx:869-877`) covers id, labels and category labels only; the time-points column (`:942-965`) is sortable, not filterable. Append the code's identifiers to the search text; make the column filterable by the time points with code                                                                                                                                                                                       |
| M14 | In the editor's variable list, hide or move to the bottom the variables already used in that time point. Its search "did not work well"                                | Leenisha, 2026-10-15                               | The list (`indicator_code_editor.tsx:1229-1267`) filters by search only and the editor never receives other indicators' code. Pass `allCode` in from the manager and mark the variables other indicators use in the selected time point. The search folds accents and case (M12), so "did not work well" is not reproduced                                                                                                                                 |
| M18 | Admin-area and facility-type variables available as indicators without setup, or in the default workbook, under an "ID" category                                       | Safia, 2026-10-14                                  | A file column such as `id_fac_type` becomes a variable when the XLSForm types it select_one (staging excludes only the facility id column, `stage_csv.ts:606`), holding raw codes. Registry admin areas and facility type are not variables: `admin_area_*` and `facility_*` are reserved and facility type is not in the R dataset. The "ID" category is a content change to the default workbook                                                         |
| M20 | Fix the default indicators that fail in every country, e.g. `sh_03` is one string variable but the default code uses `sh_03_c == 1`, and flag such failures            | Viviane, 2026-10-15                                | The workbook's `ind007` to `ind012` are `sh_03_c==1` to `sh_03_x==1`: they work only where `sh_03` is select_multiple with those choices listed. Text questions are never staged, so a text `sh_03` gives "variable not found" in every round. The Status column shows "N error" with no "ready" but has no "fails everywhere" state. Add `failsEverywhere` (error equals total) to the stats at `manager.tsx:380`. The content fix is in the resource hub |
| M21 | Check that imported data values are among the XLSForm's response options                                                                                               | Tim, 2026-10-04                                    | select_one, integer and decimal values are stored as-is (`stage_csv.ts:297-300`), and a select_multiple code missing from the form's choice list is dropped silently (`:274-296`), which is the cause of U9. Count both in staging, add them to `DatasetHfaCsvStagingResult` and show them in `staging_summary.tsx`                                                                                                                                        |
| M22 | More colour options for heatmaps                                                                                                                                       | Viviane, 2026-10-15                                | A heatmap is a table with conditional formatting. Scale palettes are the 13 in `PALETTE_OPTIONS` (`conditional_formatting_editor.tsx:139-153`) plus custom; panther has 22 sequential and 13 diverging (`panther/_001_color/palettes.ts:11-60`). Add the rest to `PALETTE_OPTIONS`                                                                                                                                                                         |
| M23 | A time point as a date range, for rounds that span months: a start month and an end month instead of one month. Time-series charts use the end month                   | Leenisha, 2026-10-15; HFA team meeting, 2026-10-15 | `hfa_time_points` has one `period_id` (`_main_database.sql:697-702`), one Year and Month picker (`time_point_form.tsx`). Needs a `period_id_end` column by migration, a `periodIdEnd` field and a second picker                                                                                                                                                                                                                                            |
| M24 | A finite population correction (FPC) column in the sampling weights table, beside the stratum                                                                          | HFA team meeting, 2026-10-15                       | The stratum is stored (`hfa_facility_weights.stratum`, migration 211) and mapped at import; nothing reads it, and only `weight` reaches R (`capture_inputs/hfa.ts:146`). No FPC anywhere. Add an `fpc` column by migration and map it like `stratumColumn`                                                                                                                                                                                                 |
| M25 | Never list `id_admin1`, `id_admin1_corrected`, `id_fac_type`, `id_resp_consent` and `result` in the unused-variables modal                                             | HFA team meeting, 2026-10-15                       | The filter at `manager.tsx:779-780` has no exclusion list; staging skips only the facility id column. Add a constant set and exclude it in that filter                                                                                                                                                                                                                                                                                                     |
| M26 | The unused-variables Add button opens the indicator editor                                                                                                             | HFA team meeting, 2026-10-15                       | Add calls `p.close(v)`, and the manager opens the metadata-only create modal with the label pre-filled (`unused_variables_modal.tsx:88-95`, `manager.tsx:487-510,792-794`). Create the indicator, then open the code editor with the variable inserted. M15 ("open the indicators that use a variable" from this modal) falls away: the modal lists unused variables, so that set is empty by construction                                                 |
| M27 | Remove the "Use sampling weights" module parameter: m010 uses the weights when a round has them and runs unweighted when it does not                                   | Tim, 2026-10-15                                    | Defined in `wb-fastr-modules/m010/_parameters.ts:4-15`, used only at `script.R:56-61`. Removal: delete the parameter, rebuild `definition.json`, make line 61 `coalesce(weight, 1)`. A stale stored key is dropped at run time by the merge against the live definition; no migration. The script text changes, so m010 reruns once                                                                                                                        |
| M28 | A note on figures when values are carried forward                                                                                                                      | Tim, 2026-10-15; Safia, 2026-05-21 (L5)            | `carried_from` never reaches the client (not in `PHYSICAL_DISAGGREGATION_COLUMNS`), and the carried presets have `footnote: null` (`wb-fastr-modules/m010/_metrics/m10-01-02.ts:53`, `m10-03-02`). Set a translated footnote on those presets. The metric and Explore labels are already in French                                                                                                                                                         |
| M29 | Facility-type disaggregation on the Explore page                                                                                                                       | Tim, 2026-10-15                                    | Every m010 Explore view facets by `hfa_category` with no facility unit (`lib/explore_views.ts:339-411`). Add a view with `unit: "facility_type"` modelled on `hfa_variants`. For figures (M10) facility type is offered once "Facility types" is on in the HFA configuration and the package is regenerated (`server/runs/disaggregation_availability.ts:51-72`)                                                                                           |

## Large, or needs a design decision

| Id | Issue                                                                                   | Raised by                                                        | State in code                                                                                                                                                                                                                                                                                                                                             |
| -- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L2 | Strata, confidence intervals, margins of error, significance tests, low-precision flags | Safia, 2025-09; Viviane, 2026-06; Tim, 2026-09-19 and 2026-10-04 | The weights import stores an optional stratum per facility and round. Nothing uses it: m010 computes weighted point estimates only, with no variance                                                                                                                                                                                                      |
| L3 | Reports in Russian for Tajikistan                                                       | Ashley, 2026-09-11                                               | `TranslatableString` is `{en, fr, pt?}` with fallback to en (`panther/_000_utils/translate.ts:6-36`), so an optional `ru` compiles. About 3,900 `t3(` calls and 3,600 `fr:` literals in the app, panther and report-forge, plus about 1,000 in the modules. Also the language menu, the figure-bundle enum and the plural helper (Russian needs few/many) |
| L4 | Questionnaires that are not XLSForms: Word files, the Ipsos Excel format                | Ashley, Viviane and Safia, 2026-08 and 2026-09                   | The app requires `survey` and `choices` sheets. The converter is outside this repo                                                                                                                                                                                                                                                                        |
| L6 | Sample distribution table (facilities by type, region)                                  | Safia, 2025-09; Tim, 2026-10-04                                  | Not present                                                                                                                                                                                                                                                                                                                                               |
| L7 | Immunization readiness module. Analysis of open-ended answers                           | Viviane and Safia, 2025                                          | Not present                                                                                                                                                                                                                                                                                                                                               |
| L8 | Link HFA and HMIS facilities                                                            | Meghan (sheet, Medium)                                           | The two facility registries are independent by design (SYSTEM_05)                                                                                                                                                                                                                                                                                         |
| L9 | Dotted-line, stacked bar and gauge charts                                               | Viviane (sheet, Medium)                                          | Stacked bars exist (`s.barsStacked`). Panther's `lineDash` is solid or dashed only, and the saved `customSeriesStyles.lineStyle` is ignored (`_0_common.ts:537-547`). A gauge is a pie with `sweepAngle` under 360, which panther supports and the app never sets                                                                                         |

## Not classified

| Id | Issue                                                                                         | Raised by                      | State in code                                                                                                                                                                                                                                    |
| -- | --------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1 | "Solve the 'value' problem"                                                                   | Tim, 2026-07-21                | Too terse to map to code                                                                                                                                                                                                                         |
| U2 | "Weights" (noted beside "Strata")                                                             | Tim, 2026-09-19 and 2026-10-04 | Too terse to map to code                                                                                                                                                                                                                         |
| U5 | HMIS facilities and GeoJSON left over in the HFA registry                                     | Safia, 2026-09-25              | Meghan cleaned the test countries by hand. Other instances need a read-only look at production                                                                                                                                                   |
| U8 | The service category field appears twice when adding an indicator                             | Safia, 2026-10-14              | Rendered once. In the code editor's top row the service-categories `MultiSelect` has no width, so its label overflows under the variant-group `Select` (`indicator_code_editor.tsx:710-725`, panther `field.tsx:40-45`). Give it `min-w-[200px]` |
| U9 | Some country-specific variables (`sup_05aaa_g_gn`, `sup_05ca_ab_gn`) are not listed as unused | Safia, 2026-10-14              | Cause found: a select_multiple choice a country added but the form's choice list lacks never becomes a variable, and its selections are dropped silently (`stage_csv.ts:173-178,287-296`). Fixed by M21's staging count                          |

## Questions, not code

These point to help text or a short guide.

- Does the order of configuration matter?
- When is a row filter needed on a clean dataset?
- Is admin level 0 required for maps? Where should map files come from when
  there is no DHIS2?
- Do weights need a separate upload when they are a column in the dataset?
- Is the XLSForm needed at the facility step? (It is optional and labelled so.)
- In the Data tab, is each row a variable in one round? (Yes.)
- Should anything be done to the ODK dataset between collection and upload?
- How is a facility type of "Other" handled when the file has an "other,
  specify" column such as Guinea's `id_fac_type_other`? (Add it as a display
  column in the recode step.)
- How are extra facility attributes, such as type tags, added? (Map a custom
  column in the data wizard's Facilities step; it switches the column on.)
- Is the HFA facility upload a job for the HMIS team? (The HFA registry is
  separate from the HMIS one, L8.)
- As rounds are added, is "Add new facilities and update existing ones" the
  standard import mode?
- How are categorical variables such as facility type or region set up as
  indicators? Is one dummy indicator per EmONC signal function right? (Safia)
- What month and year does a time point get when a round spans months?
  (Leenisha. M23.)
- Must the dataset's facility ids match a sample file, and is uploading the
  dataset as the sample file fine? (Leenisha. There is no separate facility
  upload; the data wizard writes the registry.)
- Is one questionnaire covering rounds 1 to 4 or one per round better to upload?
  Can an indicator be left out of some rounds? (Leenisha. Code is set per round,
  and a round can have none.)
- Does an indicator import apply the code to every time point? (Leenisha. Yes:
  with one code column and several time points, choose "Apply to all" on the
  time-point step, Q10.)
- What does `== 1` mean in the code, and is it needed? (Leenisha)
- Why do some default indicators name two variables for one question, e.g.
  `chal_02_a==1 & chal_01_a==1`? (Leenisha, for the analysis team)
- Which cases are a warning and which an error in the Status column? (Ashley,
  Meghan; was U6.) Error: unmatched brackets, an unterminated string, `&&` or
  `||`, or an identifier that is neither a variable of that time point nor
  another indicator, including a wrong-case variable. Warning: a lone `=`.
  Differing code across rounds is the separate Consistent column.
- Why are round 3 and round 4 results missing from a figure? (Ashley; was U7.)
  No review status exists. An indicator with no code for a round is absent from
  the observed metric for that round and filled by the carried metric; with
  stop-on-failure off, an indicator with an unknown variable is skipped whole.
- Where is the facility-type disaggregation for figures? (Viviane; was M10.)
  Turn on "Facility types" in the HFA configuration, or map the type column in
  the data wizard, and regenerate the package.

## Already done

Verified in code or commits:

- Indicator id assigned by the app and removed from the table (2026-09-20,
  `cc7bac25c`). This also covers "indicator number should auto populate".
- Indicators table sorted by long label by default.
- Search on the indicators table and the dataset table. Both fold accents and
  case through panther's `foldString` (`panther/_000_utils/search.ts`), as does
  the code editor's variable search (`indicator_code_editor.tsx:533-547`). This
  closes M12 (Safia, 2026-10-14; Viviane, 2026-10-15).
- The indicator editor is an overlay over the manager, whose sort, filters,
  search text and scroll position live outside the remounting holder and are
  restored after a save (`manager.tsx:77-82`, panther `table.tsx:270-299`). This
  closes M17 (Viviane, 2026-10-15).
- Service category as a figure filter (U3, Meghan, 2026-07-22). It is a
  filter-only dimension by design and appears in the Filters section when the
  package carries two or more values (`editor_panel_data.tsx:62-78`).
- Referenced indicators labelled in the code editor (2026-09-24, `9637c76b5`),
  taken to be "Show HFA indicator label".
- Consent row filter at data import, and first, last or per-facility choice of
  duplicate row.
- XLSForm optional at facility import, with codes resolved to labels. This
  covers numeric facility types when the form is supplied. Superseded on
  2026-10-16 (`cddd0a649`): the facility import is HMIS-only and takes no
  XLSForm; the HFA data import resolves the codes (L1).
- "Replace all" facility import (2026-09-10, `12c28544b`), which solved the
  Sierra Leone duplicate facilities.
- Facility-type "Other" recoding step at facility import. For HFA facilities,
  since 2026-10-15 the changes step of the data wizard (L1).
- Variant groups, taken to be "extra category for some indicators".
- Service categories as their own field, several per indicator.
- Roll-up column ("All facilities") with start or end position. This covers
  national and disaggregated results in one visual.
- `&&` and `||` flagged in indicator code; `AND` and `OR` accepted.
- Unused-variables checker.
- Import default indicators from the resource hub.
- Rename and reorder time points.
- Don't-know toggle in the module settings.
- Don't know recognised as both `-99` and `-999999`.
- The admin-depth error names the GeoJSON levels to delete
  (`server/db/instance/config.ts:125`).
- Stratum per facility and round in the weights import (migration
  `211_hfa_weight_strata.sql`, `hfa_weights.tsx:439-463`). The first half of
  M24; nothing reads it yet (L2).
- Q1: the weights import wizard can be closed from its upload step (2026-10-01,
  `1da3284a1`).
- Q2: on the Data page, a round with weights and no data reads "N weights, no
  data yet" instead of "0/0" (2026-10-01, `1da3284a1`).
- Q3: every file-column picker in the weights, facility and HFA data wizards is
  a searchable `SelectSearch` (2026-10-01, `6a245e03f`).
- Q6: the facility id picker pre-selects `id_fac_txt` and the weight picker
  pre-selects `wgt` when the file has those columns (2026-10-01, `0b5e216cb`).
  The facility id default was superseded on 2026-10-15 by Q9; the optional
  facility columns no longer have questionnaire-name guesses (2026-10-26,
  `692cfb809`).
- Q4: a boolean module parameter is a Yes/No select labelled with the
  parameter's description, in every module's settings (2026-10-01, `426dc5f17`).
- Q5: a held HFA data import lists up to 10 of the facility ids it could not
  find, under the not-found count (2026-10-01, `aaf25accf`). Superseded on
  2026-10-15: the data import creates the facilities it does not know, so no run
  holds for an unknown facility (L1).
- Q7: each row of the unused-variables modal has an Add button that opens the
  new-indicator form with the variable's label as the long label (2026-10-01,
  `dd3fab1a2`). M26 changes what the button opens.
- Q8: the HFA data import matches a file column to a form question ignoring
  case, stops with both names when two columns match one question, and the
  staging summary lists up to 10 of the unmatched columns and of the questions
  with no column (2026-10-07, `180e72bcc`).
- Q9: the HFA data and weights wizards default the facility id to the first of
  `id_fac_txt`, `id_fac` that holds a value (`HFA_CORE_FACILITY_ID_COLUMNS`), so
  Madagascar R1's blank `id_fac_txt` no longer drops every row (2026-10-15,
  `30de5caa8` for the weights wizard, `653a561a1` for the data wizard).
- L1, facilities and data from one wizard: the HFA data import maps the facility
  columns from the kept rows, shows every change before launch and writes the
  approved facilities with the data; the structure import is HMIS-only; the
  weights import skips facilities the registry lacks (2026-10-15 to 2026-10-16,
  last commit `cddd0a649`; SYSTEM_05 "HFA registry writes", SYSTEM_06 "HFA
  import runs"). Completed on 2026-10-26 so that a fresh instance needs nothing
  but the wizard:
  - The Mappings step can add the time point it imports into, through the same
    form as the Time points page; the Data page hint no longer says the import
    creates one (`da5aeab38`).
  - The Facilities step offers all eight optional facility columns on every
    import, pre-filled from the latest import's own mapping; mapping a column
    the schema lacks switches it on, a custom column under the label the user
    gives it, in the same transaction as the registry write (`692cfb809`). The
    launch body keeps that label (`a0df990a8`), and the schema write merges onto
    the row it locks so a concurrent configuration save is not reverted
    (`f2087d8c2`). The registry write no longer takes an unread `columnsEnabled`
    (`1d2bc16db`).
  - The wizard refetches the facility preview on the scanned headers only, and
    only while on the Facilities step (`2a8bfc6a3`, `7ef3e798f`).
- Q10: "Apply to all time points" in the indicator workbook import writes the
  single code column, and its variant columns, to every platform time point,
  whatever the column's embedded label (2026-10-26, `cbb578243`).
- Q11, M11 and M16: the indicator code accepts only the per-facility functions
  (`c`, `is.na`, `ifelse`, `pmin`, `pmax`, `abs`, `round`, `floor`, `ceiling`,
  `as.numeric`); any other call is reported as "not an accepted function" in the
  editor and refused at run generation, for main, filter and variant code; a
  variable in the wrong case gets the matching id suggested; the editor lists
  the operators and functions under the code box and the AI guidance names them,
  all from the same constants (2026-10-26, `75689b229`, `a7b241434`). Viviane's
  index is `(a + b + c) / 3`.
- U4: HFA tables and charts order indicators, categories, sub-categories and
  variant items by the instance's own order (workbook row order for indicators,
  the reorder handles for the taxonomies), and ICEH indicators and strata
  likewise, instead of alphabetically; a sub-category or variant item ranks
  inside its parent's order; manifest schema v14 and figure cache "28" carry it
  to existing packages (2026-10-26, `02ed99144`, `b2acc3e92`, `e9dd16d1f`).
  Per-figure manual order already worked everywhere but maps; sort by value is
  chart and pie only.
- Q12: the indicator validator's errors and warnings, the Type column, the HFA
  delete confirmations, the empty-dataset state and every workbook parse error
  render in the instance language; the typed delete phrase is one shared text
  ("oui supprimer", "sim eliminar") in the HFA, HMIS and ICEH delete forms and
  the workbook replace form; the parser names the right workbook row after a
  blank row, and an indicator after a blank row keeps its own code cells
  (2026-10-26, `0324e799e`, `73ab53dbf`). The Explore carry-forward label was
  already translated.
- M19: the default indicator workbook on the resource hub carries `label_en`,
  `label_fr` and `label_pt` columns (Meghan, 2026-10-21), and the import reads
  the instance language's column, then English, then the single column
  (2026-10-22, `299d5f771`, `4e4712a0c`).

From Tim's emails only, not re-verified:

- n counts in table headers (2026-07-27).
- Variable labels carry their question prefix (2026-07-27).
- The blank facility-type column (2026-07-28).
- The `facility_ownership` not-null error in the m010 run (2026-07-07).
- Indicator CSV "add to existing" replacing instead of adding (2026-05-14).
- Index indicators that reference other indicators (2026-07-07).
- Sample weights in the m010 run.
