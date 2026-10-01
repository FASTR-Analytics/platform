# HFA work catalogue

Every HFA request, bug and open question raised by the HFA team, checked against
the code. HMIS and ICEH items are excluded.

**Compiled:** 2026-10-01, on branch `version2`.

**Keeping it current.** When an item lands, move its row to "Already done" with
the date and the commit, in the same commit as the code. The quick fixes are
built by [PLAN_HFA_QUICK_FIXES.md](PLAN_HFA_QUICK_FIXES.md), whose steps do
this.

## Sources

- Gmail thread "HFA work" (25 messages, 2026-07-21 to 2026-09-30).
- About 45 other Gmail threads from Meghan Paul, Safia Jiwani, Viviane Azais and
  Ashley Sheffel, 2025-05 to 2026-09-30.
- Google Sheet "FASTR Wish List Tracker": the "HFA list" tab in full, the other
  tabs searched for HFA rows.

Not read: screenshots and file attachments. That covers the first part of
Safia's Guinea notes (the XLSX form conversion section), Sara Riese's Somalia
notes (SharePoint), and "FASTR Team Feedback.pdf" (2025-05).

"Verified" below means read in the code or the commit history on 2026-10-01.
Nothing was run in the app.

## Quick fixes

Built by [PLAN_HFA_QUICK_FIXES.md](PLAN_HFA_QUICK_FIXES.md).

| Id | Issue                                                                              | Raised by          | State in code                                                                                                                       | Fix                                                                                 |
| -- | ---------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Q5 | Data upload should check that all facility ids are in the facility list            | Tim, 2026-09-29    | The check exists and holds the run in "needs review", but shows a count only, never the ids (`lib/types/dataset_hfa_import.ts:107`) | Show a sample of the missing ids                                                    |
| Q7 | An "add" button to create an indicator from an unused variable (High in the sheet) | Meghan, 2026-09-14 | The unused-variables modal is a read-only list (`client/src/components/data/hfa/indicators/unused_variables_modal.tsx`)             | An Add button that opens the new-indicator form with the variable's label filled in |

## Waiting on the HFA team

Small code changes that need an answer first.

| Id | Question                                                                                                         | State in code                                                                                                                                             |
| -- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 | What are the standard defaults for the HFA module settings (Ashley, 2026-09-11)?                                 | m010 defaults: sample weights off, don't know treated as missing, stop-on-failure off (`wb-fastr-modules/m010/definition.json`)                           |
| W2 | Is not-applicable coded `-98` and `-999998` ("?????" in the sheet, High)?                                        | Both are classed "question specific", not "not applicable" (`lib/hfa_sentinel_classification.ts:37`). In the Sierra Leone form `-98` is question-specific |
| W3 | What are the core questionnaire's column names for admin areas, facility type and ownership?                     | Needed to extend Q6 beyond the facility id and the weight                                                                                                 |
| W4 | Is cross-round carry-forward (`USE_OTHER_ROUND("Cycle 2")`) really complete? The sheet ticks it (Viviane, High). | No such function found in the app or in the m010 script. See L5                                                                                           |

## Medium

| Id | Issue                                                                                                  | Raised by                                  | State in code                                                                                                                                                           |
| -- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 | Hard border for the roll-up ("All facilities") column                                                  | Tim, 2026-07-28                            | The roll-up gets a neutral colour only. No border code found. Probably a panther table-style change                                                                     |
| M2 | Custom label for the roll-up column                                                                    | Tim, 2026-07-21                            | The label is derived automatically. No custom field                                                                                                                     |
| M3 | AI check for a mismatch between an indicator and the question it uses                                  | Tim, 2026-09-19                            | The indicator assistant can read code and the variable dictionary. No dedicated check                                                                                   |
| M4 | Recode "Other" (`-96`) survey responses                                                                | Tim, 2026-09-19; Viviane, 2026-08          | Facility-type recoding exists at facility import. Response-level recoding is parked in SYSTEM_06 as "Sentinel Layer 1"                                                  |
| M5 | Updating the default indicators broke Sierra Leone's visualizations                                    | Meghan, 2026-09-30                         | The import matches on the workbook's `indicatorId`, and the 475-indicator file changed ids. Mostly a file-discipline issue. Meghan worked around it with a country file |
| M6 | Detect questionnaire changes between rounds from the XLSForm and flag affected indicators              | Viviane (sheet, Medium)                    | Not present. The "Consistent" column compares code across rounds, not questions                                                                                         |
| M7 | Draft notes automatically from the XLSForm                                                             | Viviane (sheet, Low)                       | Not present                                                                                                                                                             |
| M8 | Delete individual rows after import                                                                    | SYSTEM_06 follow-on                        | Not present. Scoped in SYSTEM_06                                                                                                                                        |
| M9 | Standard HFA report: default visualizations plus an AI prompt, as for HMIS. Service-specific snapshots | Ashley and Meghan, 2026-09-14; Safia, 2026 | Not checked. The team decides the approach first                                                                                                                        |

## Large, or needs a design decision

| Id | Issue                                                                                   | Raised by                                         | State in code                                                                                                                                                             |
| -- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1 | The same file is uploaded twice, once for facilities and once for data                  | Safia, 2026-09-16; Tim, 2026-05-19                | Still true. `PLAN_HFA_FACILITIES_FROM_ROUNDS__WRONG_BECAUSE_FLAWED.md` was set aside because it resolves between-round facility changes by rule instead of surfacing them |
| L2 | Strata, confidence intervals, margins of error, significance tests, low-precision flags | Safia, 2025-09; Viviane, 2026-06; Tim, 2026-09-19 | m010 computes weighted point estimates only. No strata or variance anywhere                                                                                               |
| L3 | Reports in Russian for Tajikistan                                                       | Ashley, 2026-09-11                                | Languages are en, fr and pt                                                                                                                                               |
| L4 | Questionnaires that are not XLSForms: Word files, the Ipsos Excel format                | Ashley, Viviane and Safia, 2026-08 and 2026-09    | The app requires `survey` and `choices` sheets. The converter is outside this repo                                                                                        |
| L5 | Carry annual items forward or backward across rounds, with a note                       | Safia, 2026-05-21; Viviane (sheet)                | Not found. See W4                                                                                                                                                         |
| L6 | Sample distribution table (facilities by type, region)                                  | Safia, 2025-09                                    | Not present                                                                                                                                                               |
| L7 | Immunization readiness module. Analysis of open-ended answers                           | Viviane and Safia, 2025                           | Not present                                                                                                                                                               |
| L8 | Link HFA and HMIS facilities                                                            | Meghan (sheet, Medium)                            | The two facility registries are independent by design (SYSTEM_05)                                                                                                         |
| L9 | Dotted-line, stacked bar and gauge charts                                               | Viviane (sheet, Medium)                           | Not checked                                                                                                                                                               |

## Not classified

| Id | Issue                                                                                 | Raised by                                      | Why                                                                                               |
| -- | ------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| U1 | "Solve the 'value' problem"                                                           | Tim, 2026-07-21                                | Too terse to map to code                                                                          |
| U2 | "Weights" (noted beside "Strata")                                                     | Tim, 2026-09-19                                | Too terse to map to code                                                                          |
| U3 | Service category filter missing from the visualization panel                          | Meghan, 2026-07-22                             | The dimension is registered. Not confirmed that the panel shows it                                |
| U4 | Sort tables and charts lowest to highest, or manually. Rearrange how indicators group | Safia, 2026-05; Meghan, 2026-06; Viviane, High | An indicator sort order exists and feeds figures. Not checked end to end                          |
| U5 | HMIS facilities and GeoJSON left over in the HFA registry                             | Safia, 2026-09-25                              | Meghan cleaned the test countries by hand. Other instances need a read-only look at production    |
| U6 | Which cases show as a warning and which as an error in the indicator status column    | Ashley, 2026-09-11; Meghan, 2026-04 and 05     | A separate warning state exists and the sheet ticks the request as done. The validator not traced |

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
  covers numeric facility types when the form is supplied.
- "Replace all" facility import (2026-09-10, `12c28544b`), which solved the
  Sierra Leone duplicate facilities.
- Facility-type "Other" recoding step at facility import.
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
  Admin, type and ownership columns wait on W3.
- Q4: a boolean module parameter is a Yes/No select labelled with the
  parameter's description, in every module's settings (2026-10-01, `426dc5f17`).

From Tim's emails only, not re-verified:

- n counts in table headers (2026-07-27).
- Variable labels carry their question prefix (2026-07-27).
- The blank facility-type column (2026-07-28).
- The `facility_ownership` not-null error in the m010 run (2026-07-07).
- Indicator CSV "add to existing" replacing instead of adding (2026-05-14).
- Index indicators that reference other indicators (2026-07-07).
- Sample weights in the m010 run.
