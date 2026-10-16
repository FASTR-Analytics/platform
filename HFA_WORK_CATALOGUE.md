# HFA work catalogue

Every HFA request, bug and open question raised by the HFA team, checked against
the code. HMIS and ICEH items are excluded.

**Compiled:** 2026-10-01, on branch `version2`. Updated 2026-10-08 from the
thread "HFA data upload testing", and 2026-10-15 from the thread "FASTR
platform - HFA weekly call", the "HFA work" messages to 2026-10-08 and Tim's
notes from that day's HFA team meeting.

**Keeping it current.** When an item lands, move its row to "Already done" with
the date and the commit.

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

Not read: screenshots in the earlier sources, "FASTR Team Feedback.pdf"
(2025-05), and Sara Riese's Somalia notes and Viviane's Mali notes, which are on
World Bank SharePoint and not open to Tim. The converter section of Safia's
Guinea notes is about the XLSForm converter, which is outside this repo, apart
from Q8.

"Verified" below means read in the code or the commit history on 2026-10-01, or
on 2026-10-15 for the rows added then. Nothing was run in the app.

## Quick fixes

Q1 to Q9 are under "Already done".

| Id  | Issue                                                                                                                                                                                                                                 | Raised by                            | State in code                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q10 | "Apply to all time points" in the indicator workbook import writes the code to one time point only, and fails with "Select at least one time point" when the workbook's column label ("Round 1" in the default file) matches no round | Viviane, 2026-10-15                  | `effectiveMapping` returns `[mapping[0]]` in "all" mode (`client/src/components/data/hfa/indicators/xlsx_upload_form.tsx:481-489`). Expand it to every platform time point                        |
| Q11 | Summary indices such as `rowMeans(cbind(...), na.rm = TRUE)` show as errors                                                                                                                                                           | Viviane, 2026-10-15                  | `cbind` is not in `R_COMMON_FUNCTIONS` (`lib/hfa_r_code_analysis.ts:76`), and the tokenizer reads the named argument `na.rm` as a variable (`:282-290`)                                           |
| Q12 | Messages in English in the French UI: indicator code errors and warnings, the "yes please delete" confirmation, the Explore page legend                                                                                               | Viviane, 2026-10-15; Tim, 2026-10-06 | Hard-coded English at `client/src/components/data/hfa/indicators/_shared/r_code_validator.ts:52` and `:143`; the phrase is compared at `xlsx_upload_form.tsx:492`. The Explore legend not checked |

## Waiting on the HFA team

Small code changes that need an answer first.

| Id | Question                                                                                                                      | State in code                                                                                                                                                                                                                                   |
| -- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 | What are the standard defaults for the HFA module settings (Ashley, 2026-09-11)? Viviane got unweighted results on 2026-10-15 | m010 defaults: sample weights off, don't know treated as missing, stop-on-failure off (`wb-fastr-modules/m010/definition.json`)                                                                                                                 |
| W2 | Is not-applicable coded `-98` and `-999998` ("?????" in the sheet, High)?                                                     | Both are classed "question specific", not "not applicable" (`lib/hfa_sentinel_classification.ts:37`). In the Sierra Leone form `-98` is question-specific                                                                                       |
| W4 | Is cross-round carry-forward (`USE_OTHER_ROUND("Cycle 2")`) really complete? The sheet ticks it (Viviane, High).              | No `USE_OTHER_ROUND`. m010 fills a round where an indicator has no values from the previous observed round, or the next for a leading gap, and records `carried_from` (`wb-fastr-modules/m010/script.R:104-137`, 2026-07-08, `babd30d`). See L5 |

## Medium

| Id  | Issue                                                                                                                                                                                                                                                      | Raised by                                                               | State in code                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Hard border for the roll-up ("All facilities") column                                                                                                                                                                                                      | Tim, 2026-07-28                                                         | The roll-up gets a neutral colour only. No border code found. Probably a panther table-style change                                                                                                                                       |
| M2  | Custom label for the roll-up column                                                                                                                                                                                                                        | Tim, 2026-07-21                                                         | The label is derived automatically. No custom field                                                                                                                                                                                       |
| M3  | Make the AI copilot genuinely useful for checking indicator code: it reads the labels of the variables the code uses and checks that they make sense for the indicator                                                                                     | Tim, 2026-09-19 and 2026-10-15                                          | The indicator assistant can read code and the variable dictionary. No dedicated check                                                                                                                                                     |
| M4  | Recode "Other" (`-96`) survey responses                                                                                                                                                                                                                    | Tim, 2026-09-19; Viviane, 2026-08                                       | Facility-type recoding exists at facility import. Response-level recoding is parked in SYSTEM_06 as "Sentinel Layer 1"                                                                                                                    |
| M5  | Updating the default indicators broke Sierra Leone's visualizations                                                                                                                                                                                        | Meghan, 2026-09-30                                                      | The import matches on the workbook's `indicatorId`, and the 475-indicator file changed ids. Mostly a file-discipline issue. Meghan worked around it with a country file                                                                   |
| M6  | Detect questionnaire changes between rounds from the XLSForm and flag affected indicators                                                                                                                                                                  | Viviane (sheet, Medium)                                                 | Not present. The "Consistent" column compares code across rounds, not questions                                                                                                                                                           |
| M7  | Draft notes automatically from the XLSForm                                                                                                                                                                                                                 | Viviane (sheet, Low)                                                    | Not present                                                                                                                                                                                                                               |
| M8  | Delete individual rows after import                                                                                                                                                                                                                        | SYSTEM_06 follow-on                                                     | Not present. Scoped in SYSTEM_06                                                                                                                                                                                                          |
| M9  | Standard HFA report: default visualizations plus an AI prompt, as for HMIS. Service-specific snapshots                                                                                                                                                     | Ashley and Meghan, 2026-09-14; Safia, 2026                              | Not checked. The team decides the approach first                                                                                                                                                                                          |
| M10 | Disaggregate HFA results by facility type. Viviane could not find the option; it is how their reports present results                                                                                                                                      | Viviane, 2026-10-15                                                     | Not checked                                                                                                                                                                                                                               |
| M11 | Guidance on writing indicator code (`==`, `%in%`, summary indices) in the platform, and tips on asking the AI assistant. Meeting: just below the code box, list the functions and operators the code accepts, since it is the app's own pseudo-code, not R | Viviane, 2026-10-15; Leenisha, 2026-10-15; HFA team meeting, 2026-10-15 | Not checked                                                                                                                                                                                                                               |
| M12 | Indicator search ignores French accents                                                                                                                                                                                                                    | Safia, 2026-10-14; Viviane, 2026-10-15                                  | Not checked                                                                                                                                                                                                                               |
| M13 | Indicator search matches the variable ids in the code. Filter the indicators by time point                                                                                                                                                                 | Leenisha, 2026-10-15                                                    | Not checked                                                                                                                                                                                                                               |
| M14 | In the editor's variable list, hide or move to the bottom the variables already used in that time point. Its search "did not work well"                                                                                                                    | Leenisha, 2026-10-15                                                    | Not checked                                                                                                                                                                                                                               |
| M15 | Open the indicators that use a variable from the unused-variables modal                                                                                                                                                                                    | Leenisha, 2026-10-15                                                    | Q7's Add button opens a new indicator only. Her screenshot has no Add button, which the modal always renders, so her site runs a build older than `dd3fab1a2`                                                                             |
| M16 | Code written with the wrong case (`com_03c` for `COM_03C`) shows only "not found"                                                                                                                                                                          | Leenisha, 2026-10-15                                                    | Not checked                                                                                                                                                                                                                               |
| M17 | After editing an indicator, going back loses the position in the indicator list                                                                                                                                                                            | Viviane, 2026-10-15                                                     | Not checked                                                                                                                                                                                                                               |
| M18 | Admin-area and facility-type variables available as indicators without setup, or in the default workbook, under an "ID" category                                                                                                                           | Safia, 2026-10-14                                                       | Not checked                                                                                                                                                                                                                               |
| M19 | A French version of the default indicator workbook                                                                                                                                                                                                         | Safia, 2026-10-14; Viviane, 2026-10-15                                  | Content, not code: the workbook is a file in the resource hub                                                                                                                                                                             |
| M20 | Fix the default indicators that fail in every country, e.g. `sh_03` is one string variable but the default code uses `sh_03_c == 1`, and flag such failures                                                                                                | Viviane, 2026-10-15                                                     | Content fix in the default workbook. Flagging not checked                                                                                                                                                                                 |
| M21 | Check that imported data values are among the XLSForm's response options                                                                                                                                                                                   | Tim, 2026-10-04                                                         | Not checked                                                                                                                                                                                                                               |
| M22 | More colour options for heatmaps                                                                                                                                                                                                                           | Viviane, 2026-10-15                                                     | Not checked                                                                                                                                                                                                                               |
| M23 | A time point as a date range, for rounds that span months: a start month and an end month instead of one month. Time-series charts use the end month                                                                                                       | Leenisha, 2026-10-15; HFA team meeting, 2026-10-15                      | Not checked                                                                                                                                                                                                                               |
| M24 | A finite population correction (FPC) column in the sampling weights table, beside the stratum                                                                                                                                                              | HFA team meeting, 2026-10-15                                            | Not checked. The stratum is already stored (L2)                                                                                                                                                                                           |
| M25 | Never list `id_admin1`, `id_admin1_corrected`, `id_fac_type`, `id_resp_consent` and `result` in the unused-variables modal                                                                                                                                 | HFA team meeting, 2026-10-15                                            | Not checked                                                                                                                                                                                                                               |
| M26 | The unused-variables Add button opens the indicator editor                                                                                                                                                                                                 | HFA team meeting, 2026-10-15                                            | Q7's Add button opens the new-indicator form with the variable's label as the long label, not the code editor. The Mali screenshot from the meeting also has no Add button, so that site too runs a build older than `dd3fab1a2`. See M15 |
| M27 | Remove the "Use sampling weights" module parameter: m010 uses the weights when a round has them and runs unweighted when it does not                                                                                                                       | Tim, 2026-10-15                                                         | Not checked. The parameter is off by default (W1)                                                                                                                                                                                         |
| M28 | The carry-forward label in French                                                                                                                                                                                                                          | Tim, 2026-10-15                                                         | Not checked. See W4 and Q12                                                                                                                                                                                                               |
| M29 | Facility-type disaggregation on the Explore page                                                                                                                                                                                                           | Tim, 2026-10-15                                                         | Not checked. See M10                                                                                                                                                                                                                      |

## Large, or needs a design decision

| Id | Issue                                                                                   | Raised by                                                        | State in code                                                                                                                                        |
| -- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| L2 | Strata, confidence intervals, margins of error, significance tests, low-precision flags | Safia, 2025-09; Viviane, 2026-06; Tim, 2026-09-19 and 2026-10-04 | The weights import stores an optional stratum per facility and round. Nothing uses it: m010 computes weighted point estimates only, with no variance |
| L3 | Reports in Russian for Tajikistan                                                       | Ashley, 2026-09-11                                               | Languages are en, fr and pt                                                                                                                          |
| L4 | Questionnaires that are not XLSForms: Word files, the Ipsos Excel format                | Ashley, Viviane and Safia, 2026-08 and 2026-09                   | The app requires `survey` and `choices` sheets. The converter is outside this repo                                                                   |
| L5 | Carry annual items forward or backward across rounds, with a note                       | Safia, 2026-05-21; Viviane (sheet)                               | m010 carries a round with no values forward or backward (W4). Whether figures show a note: not checked                                               |
| L6 | Sample distribution table (facilities by type, region)                                  | Safia, 2025-09; Tim, 2026-10-04                                  | Not present                                                                                                                                          |
| L7 | Immunization readiness module. Analysis of open-ended answers                           | Viviane and Safia, 2025                                          | Not present                                                                                                                                          |
| L8 | Link HFA and HMIS facilities                                                            | Meghan (sheet, Medium)                                           | The two facility registries are independent by design (SYSTEM_05)                                                                                    |
| L9 | Dotted-line, stacked bar and gauge charts                                               | Viviane (sheet, Medium)                                          | Not checked                                                                                                                                          |

### Inputs to the L1 rework

From the thread "HFA data upload testing". The facility columns and changes
steps of the HFA data wizard take them; the structure wizard is HMIS-only.

- **Core column names** (Viviane, 2026-10-06, and the generic XLSForm): facility
  id: the first of `id_fac_txt`, `id_fac` that has values (the generic form has
  no `id_fac_txt`, and Madagascar R1 has it blank); country `id_admin0`; region
  `id_admin1_name`; district `id_admin2_name`; name `id_fac_name`; type
  `id_fac_type`. The generic form has no ownership question. Pre-select these,
  as Q6 does for the facility id and the weight. These are defaults only. Some
  firms put region names in `id_admin1`. Ipsos files use their own facility id
  name, which can change between rounds, so the id column is chosen per round.
  Guinea's raw file names them `SynID`, `weights` and `Stratum`. Each country's
  recode do-file (`gn_recode.do`) records its renames.
- **Blank country column** (Angelica and Viviane, 2026-10-07): Madagascar R1 has
  `id_admin0` blank in every row. Level 1 is a mapped column and a blank value
  drops the row. The instance's country is already set by `ISO_COUNTRY_CODE`, so
  fill level 1 from it instead of mapping a column.
- **Correction columns** (Safia, Guinea, 2026-09-16): the form has
  `id_admin1_corrected` and `id_admin2_corrected` (choice codes) and
  `id_fac_corrected` (text), filled only when the respondent says the pre-filled
  region, district or name is wrong. Each facility column maps to one file
  column, so on raw data those facilities keep the wrong pre-filled value. The
  mapping needs a correction column that wins where it is filled, resolved
  through the XLSForm like the original.
- **Mali** (Viviane, 2026-10-02): rounds 1 to 3 used the old 11 regions; later
  rounds use the current 20 and DHIS2 facility ids. Under latest round wins, the
  next round adds every facility again under its DHIS2 id with a new region
  name, and the round 1 to 3 facilities keep the old names, with nothing shown
  to the user. Viviane plans to reconcile outside the platform. A later round's
  import now shows its new facilities and the admin paths it introduces before
  launch. Re-keying rounds 1 to 3 means deleting their data and weights,
  re-importing them under the new ids, then removing the old facilities from the
  facilities page once no data or weights reference them.

## Not classified

| Id | Issue                                                                                         | Raised by                                                     | Why                                                                                                                                          |
| -- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 | "Solve the 'value' problem"                                                                   | Tim, 2026-07-21                                               | Too terse to map to code                                                                                                                     |
| U2 | "Weights" (noted beside "Strata")                                                             | Tim, 2026-09-19 and 2026-10-04                                | Too terse to map to code                                                                                                                     |
| U3 | Service category filter missing from the visualization panel                                  | Meghan, 2026-07-22                                            | The dimension is registered. Not confirmed that the panel shows it                                                                           |
| U4 | Sort tables and charts lowest to highest, or manually. Rearrange how indicators group         | Safia, 2026-05; Meghan, 2026-06; Viviane, High and 2026-10-15 | An indicator sort order exists and feeds figures. Not checked end to end                                                                     |
| U5 | HMIS facilities and GeoJSON left over in the HFA registry                                     | Safia, 2026-09-25                                             | Meghan cleaned the test countries by hand. Other instances need a read-only look at production                                               |
| U6 | Which cases show as a warning and which as an error in the indicator status column            | Ashley, 2026-09-11; Meghan, 2026-04 and 05                    | A separate warning state exists and the sheet ticks the request as done. The validator not traced                                            |
| U7 | Round 3 and round 4 results not visible in a test visualization                               | Ashley, 2026-09-11                                            | Ashley suspected her unreviewed indicators. Not reproduced                                                                                   |
| U8 | The service category field appears twice when adding an indicator                             | Safia, 2026-10-14                                             | Not reproduced. In Viviane's and Leenisha's editor screenshots the service-categories label sits half hidden behind the variant-group select |
| U9 | Some country-specific variables (`sup_05aaa_g_gn`, `sup_05ca_ab_gn`) are not listed as unused | Safia, 2026-10-14                                             | Safia suspects the XLSForm conversion. Not checked                                                                                           |

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
- How are extra facility attributes, such as type tags, added? (Turn on a custom
  facility column in the HFA facility configuration and map it at import.)
- Is the HFA facility upload a job for the HMIS team? (The HFA registry is
  separate from the HMIS one, L8.)
- As rounds are added, is "Add new facilities and update existing ones" the
  standard import mode?
- How are categorical variables such as facility type or region set up as
  indicators? Is one dummy indicator per EmONC signal function right? (Safia)
- What month and year does a time point get when a round spans months?
  (Leenisha)
- Must the dataset's facility ids match a sample file, and is uploading the
  dataset as the sample file fine? (Leenisha. L1 removes the separate facility
  upload.)
- Is one questionnaire covering rounds 1 to 4 or one per round better to upload?
  Can an indicator be left out of some rounds? (Leenisha. Code is set per round,
  and a round can have none.)
- Does an indicator import apply the code to every time point? (Leenisha. Not
  today, Q10.)
- What does `== 1` mean in the code, and is it needed? (Leenisha)
- Why do some default indicators name two variables for one question, e.g.
  `chal_02_a==1 & chal_01_a==1`? (Leenisha, for the analysis team)

## Already done

Verified in code or commits:

- Indicator id assigned by the app and removed from the table (2026-09-20,
  `cc7bac25c`). This also covers "indicator number should auto populate".
- Indicators table sorted by long label by default.
- Search on the indicators table and the dataset table.
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
- Q1: the weights import wizard can be closed from its upload step (2026-10-01,
  `1da3284a1`).
- Q2: on the Data page, a round with weights and no data reads "N weights, no
  data yet" instead of "0/0" (2026-10-01, `1da3284a1`).
- Q3: every file-column picker in the weights, facility and HFA data wizards is
  a searchable `SelectSearch` (2026-10-01, `6a245e03f`).
- Q6: the facility id picker pre-selects `id_fac_txt` and the weight picker
  pre-selects `wgt` when the file has those columns (2026-10-01, `0b5e216cb`).
  The facility id default was superseded on 2026-10-15 by Q9; the other core
  columns are under "Inputs to the L1 rework".
- Q4: a boolean module parameter is a Yes/No select labelled with the
  parameter's description, in every module's settings (2026-10-01, `426dc5f17`).
- Q5: a held HFA data import lists up to 10 of the facility ids it could not
  find, under the not-found count (2026-10-01, `aaf25accf`). Superseded on
  2026-10-15: the data import creates the facilities it does not know, so no run
  holds for an unknown facility (L1).
- Q7: each row of the unused-variables modal has an Add button that opens the
  new-indicator form with the variable's label as the long label (2026-10-01,
  `dd3fab1a2`).
- Q8: the HFA data import matches a file column to a form question ignoring
  case, stops with both names when two columns match one question, and the
  staging summary lists up to 10 of the unmatched columns and of the questions
  with no column (2026-10-07, `180e72bcc`).
- Q9: the HFA data and weights wizards default the facility id to the first of
  `id_fac_txt`, `id_fac` that holds a value (`HFA_CORE_FACILITY_ID_COLUMNS`), so
  Madagascar R1's blank `id_fac_txt` no longer drops every row (2026-10-15,
  `30de5caa8` for the weights wizard, `653a561a1` for the data wizard).
- L1: the HFA data import maps the facility columns from the kept rows, shows
  every change before launch and writes the approved facilities with the data;
  the structure import is HMIS-only; the weights import skips facilities the
  registry lacks (2026-10-15 to 2026-10-16, last commit `cddd0a649`; SYSTEM_05
  "HFA registry writes", SYSTEM_06 "HFA import runs").

From Tim's emails only, not re-verified:

- n counts in table headers (2026-07-27).
- Variable labels carry their question prefix (2026-07-27).
- The blank facility-type column (2026-07-28).
- The `facility_ownership` not-null error in the m010 run (2026-07-07).
- Indicator CSV "add to existing" replacing instead of adding (2026-05-14).
- Index indicators that reference other indicators (2026-07-07).
- Sample weights in the m010 run.
