# PLAN: DHIS2 picker refusals in the user's words

Seen on the Mauritania instance, 27 Oct 2026: a user searches "CPN" in "Add
indicators from DHIS2", gets 36 results, and every coverage indicator carries a
greyed "Add" button and a red developer diagnostic ("L'opérande N2iwSIPkiKg ne
peut pas être ajouté : son type d'agrégation est AVERAGE_SUM_ORG_UNIT, pas
SUM"). She reads it as the instance being broken.

**Next step: Do 1.** Branch `main`. Repo: this app. Read first: `CLAUDE.md`,
`SYSTEMS.md`, [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md). Start
when: nothing; the plan stands alone.

## §0 How to work this plan

- The plan file is `PLAN_DHIS2_PICKER_REFUSALS.md`; the instruction is "Do the
  next step of PLAN_DHIS2_PICKER_REFUSALS.md".
- Branch `main`, as [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds it.
- The floor is the one PROTOCOL_APP_PLANS.md names.
- The log is §6. A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_07_dhis2.md`, `SYSTEM_05_facilities_indicators.md`, §2 and §3, its own
  §4 section, §6.
- The last step is 2.
- Vocabulary. _Picker_: the DHIS2 select form
  (`client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx`).
  _Refused row_: a search result whose element verdict or decomposition is not
  accepted. _Role_: which side of the DHIS2 formula an operand is on, numerator
  or denominator. _Diagnostic_: the existing refusal wording
  (`describeDhis2ElementRefusal`, `describeDhis2ParseRefusal`,
  `describeDhis2IdRefusal` in `lib/types/indicators.ts`), which names UIDs and
  DHIS2 metadata fields and stays as the save route's and the id repair's
  wording. _Import sentence_: the new wording a refused row shows.

## §1 The problem

- The picker renders a disabled "Add" on every refused row
  ([dhis2_indicator_select_form.tsx:384-398](client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx#L384-L398)),
  so a row that can never be added still looks like one that can.
- The refused row's line is `text-danger`
  ([:582-592](client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx#L582-L592),
  [:645-651](client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx#L645-L651)),
  which reads as an error, not as a fact about the indicator.
- The line is the diagnostic verbatim
  ([:102-136](client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx#L102-L136)):
  "Operand <UID> cannot be added: its aggregation type is AVERAGE_SUM_ORG_UNIT,
  not SUM". It was written for the save route and the id repair, where naming
  the UID and the field is right.
- An operand carries no role
  ([indicators.ts:399-403](lib/types/indicators.ts#L399-L403)), so the picker
  cannot say "its denominator" and falls back to the UID.
- `parseDhis2Indicator` refuses an annualized indicator before it reads the
  formula
  ([decompose_indicator.ts:56-58](server/dhis2/goal2_indicators/decompose_indicator.ts#L56-L58)),
  so an annualized coverage indicator reports "it is annualized" when the reason
  the user needs is that it divides by a population.

## §2 The model

A refused row has no button. Its line is muted text: one import sentence that
says this type of indicator cannot be imported, that the platform only imports
monthly counts from DHIS2, and which part of this indicator is not one, by role.
No UID, no DHIS2 field name, no element name. The parse always reads the formula
and records each operand's role and whether the indicator is annualized; the
decomposition is accepted only when the parse accepted, the indicator is not
annualized, and every operand is accepted. The save route and the id repair keep
the diagnostic.

## §3 Rulings

1. A refused row shows no "Add" button. Decided.
2. A refused row's line is `text-base-content-muted`, never `text-danger`.
   Decided.
3. The import sentence, in en, fr and pt. Every indicator row starts "This type
   of indicator cannot be imported. The platform only imports monthly counts
   from DHIS2, and" followed by the first cause that applies, in this order: a
   refused operand, then annualized, then the parse refusal. Decided:

   | Cause                                                                       | Sentence                                                                                                   |
   | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
   | denominator operand: `aggregation_type`, or `period_type` yearly or no set  | this indicator divides by a population figure, which DHIS2 holds as one value per year.                    |
   | numerator operand: the same refusals                                        | this indicator's numerator is a yearly figure, not a monthly count.                                        |
   | operand `period_type` with any other value (quarterly, weekly, six-monthly) | this indicator uses data that DHIS2 collects {period types}, not monthly.                                  |
   | operand `value_type`                                                        | this indicator uses a percentage or a ratio, which is not a count.                                         |
   | `annualized`, operands accepted                                             | this indicator is annualized: DHIS2 scales each month up to a yearly rate, which the platform does not do. |
   | parse `term` or `syntax`                                                    | this indicator's formula uses DHIS2 functions or constants, which the platform does not read.              |
   | parse `factor`                                                              | this indicator's factor is not 1, 100, 1000 or 10000, so the platform has no format for it.                |
   | operand `element_not_found`, `combo_not_found`, `default_combo`             | one of this indicator's elements no longer exists in DHIS2.                                                |

4. _(proposed)_ An operand on both sides takes the numerator wording. Parse
   `empty` and `no_operands` read "this indicator's formula names no data
   element."; `too_many_operands` reads "this indicator's formula names more
   than {max} data elements."
5. _(proposed)_ A data element row starts "This data element cannot be imported.
   The platform only imports monthly counts from DHIS2, and" with the same
   causes worded for the element: "this element is a population figure, which
   DHIS2 holds as one value per year." / "DHIS2 collects it {period types}, not
   monthly." / "it is a percentage or a ratio, not a count." The `formula`,
   `element_not_found` and combo kinds cannot reach a search result and take the
   diagnostic.
6. The parse never refuses on `annualized`; it reports it. The decomposition,
   the save route and the id repair refuse on it with the existing words ("it is
   annualized"). Decided.
7. Nothing ships. Tim deploys.

## §4 Steps

### Step 1: The contract carries the role and the annualized flag, and the import sentences exist

**Surface.** `lib/types/indicators.ts`,
`server/dhis2/goal2_indicators/decompose_indicator.ts`,
`server/dhis2/goal2_indicators/attach_verdicts.ts`,
`server/db/instance/indicators.ts`, `server/dhis2_id_fix/plan.ts`,
`server/tests/dhis2_decompose_indicator_test.ts`,
`server/tests/dhis2_id_fix_plan_test.ts`,
`server/tests/indicator_naming_test.ts`, `SYSTEM_07_dhis2.md`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `Dhis2ParsedOperand` gains `side: "numerator" | "denominator" | "both"`.
  `parseDhis2Indicator` sets it per operand; `dedupeOperands` merges an operand
  seen on both sides to `both`. `foldDefaultCombos` keeps the merged side.
- `Dhis2IndicatorParseRefusal` loses `annualized`. The accepted
  `Dhis2IndicatorParse` gains `annualized: boolean`. `parseDhis2Indicator` reads
  the formula whatever the flag.
- `Dhis2IndicatorDecomposition.accepted` is
  `parse.accepted && !parse.annualized
  && every operand accepted`
  (`withDecompositions`).
- `createIndicatorsFromDhis2` refuses an annualized decomposition with
  `DHIS2 indicator <uid> cannot be decomposed: it is annualized`, checked after
  the parse and before the operands. `diagnoseUnknown` (or whichever function in
  `plan.ts` reads `formula.parse`) reports
  `its formula is refused: it is
  annualized` for an annualized parse, after
  the operand check; the test's expected strings are unchanged.
- `describeDhis2IndicatorImportRefusal(decomposition)` and
  `describeDhis2ElementImportRefusal(refusal)` in `lib/types/indicators.ts`
  return the import sentences of rulings 3, 4 and 5 as `TranslatableString`, en,
  fr, pt. The period-type cause lists the DHIS2 period type words the verdict
  carries. Both are exported from `lib`.
- `dhis2_decompose_indicator_test.ts` pins: the side per operand, `both` on a
  repeated operand, `annualized: true` on an accepted parse, and one sentence
  per row of ruling 3 and 4 through `describeDhis2IndicatorImportRefusal`, in
  en.
- `SYSTEM_07_dhis2.md` "Indicator decomposition" and "Search-result shaping"
  state the side, the annualized flag and where the decomposition is judged.
  `SYSTEM_05_facilities_indicators.md` names the two import-sentence functions
  beside the diagnostic ones and says which caller uses which.

**Not in this step.** The picker. Any change to `getDhis2ElementVerdict` or to
which indicators are accepted.

**Gates.** The floor.

**Ends with.** One commit.

### Step 2: The picker shows the import sentence and no button

**Surface.**
`client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `indicatorRefusal` and `elementRefusal` return
  `t3(describeDhis2IndicatorImportRefusal(...))` and
  `t3(describeDhis2ElementImportRefusal(...))`. The diagnostic imports are gone
  from the file.
- A refused indicator row, element row and COC operand row renders no
  `addButton`; the row's line is `text-base-content-muted mt-1 text-xs`.
- The file's header comment says a refused row carries the import sentence in
  the user's words.
- `SYSTEM_05_facilities_indicators.md`, where it describes the DHIS2 select
  form, says a refused row has no button and shows the import sentence.

**Not in this step.** The naming step; the selected-items pane.

**Gates.** The floor.

**Ends with.** One commit, which, this being the last step, deletes this file.

## §5 Out of scope

- Importing a coverage indicator whose denominator is a population element, in
  any form: mapping it to a population type, a per-instance population series,
  or a DHIS2 population writer. Tim ruled these out on 27 Oct 2026.
- The eligibility rules themselves (`element_eligibility.ts`).
- The wording of the save route's and the id repair's diagnostics.

## §6 Log
