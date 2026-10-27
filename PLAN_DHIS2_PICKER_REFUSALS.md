# PLAN: DHIS2 picker refusals in the user's words

Seen on the Mauritania instance, 27 Oct 2026: a user searches "CPN" in "Add
indicators from DHIS2", gets 36 results, and every coverage indicator carries a
greyed "Add" button and a red developer diagnostic ("L'opérande N2iwSIPkiKg ne
peut pas être ajouté : son type d'agrégation est AVERAGE_SUM_ORG_UNIT, pas
SUM"). She reads it as the instance being broken.

**Next step: Do 2.** Branch `main`. Repo: this app. Read first: `CLAUDE.md`,
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
  or denominator. _Label_: the element's own DHIS2 name as
  `dhis2ElementName(element, data_id)` writes it. _Diagnostic_: the existing
  refusal wording (`describeDhis2ElementRefusal`, `describeDhis2ParseRefusal`,
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
- An operand carries neither a role nor a label
  ([indicators.ts:399-403](lib/types/indicators.ts#L399-L403)), so the picker
  can say neither "its denominator" nor the element's own DHIS2 name, and falls
  back to the UID.
- The picker orders the causes itself
  ([:113-136](client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx#L113-L136)),
  so the wording and the choice of which cause to show live in the client.
- `parseDhis2Indicator` refuses an annualized indicator before it reads the
  formula
  ([decompose_indicator.ts:56-58](server/dhis2/goal2_indicators/decompose_indicator.ts#L56-L58)),
  so an annualized coverage indicator reports "it is annualized" when the reason
  the user needs is that its denominator is not a monthly count.

## §2 The model

A refused row has no button. Its line is muted text: one sentence saying the
indicator cannot be imported and why, in the user's words. It names the part at
fault by role and by the element's own DHIS2 name, and, when only the
denominator is at fault, it names the numerator as the thing to add instead. No
UID, no DHIS2 metadata field name, no DHIS2 period word. One pure function in
`lib` owns the sentence and the order of causes, and returns nothing when there
is nothing to refuse, so the picker asks rather than decides. The parse always
reads the formula; `annualized` is not a parse concern but a fact about the
indicator, which the decomposition carries. Each operand carries its role and
its label. The save route and the id repair keep the diagnostic.

## §3 Rulings

1. A refused row shows no "Add" button. Decided.
2. A refused row's line is `text-base-content-muted`, never `text-danger`.
   Decided.
3. The import sentence, in en, fr and pt. Every indicator row starts "This
   indicator cannot be imported:" followed by the first cause that applies, in
   this order. Decided.

   | Cause                                                     | Sentence                                                                                                                   |
   | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
   | operand `aggregation_type`, `value_type` or `period_type` | its {numerator / denominator}, "{label}", is not a monthly count, and the platform only imports monthly counts from DHIS2. |
   | the indicator is annualized                               | it is annualized: DHIS2 scales each month up to a yearly rate, which the platform does not do.                             |
   | operand `element_not_found` or `combo_not_found`          | its {numerator / denominator}, "{label}", no longer exists in DHIS2.                                                       |
   | parse `term` or `syntax`                                  | its formula uses DHIS2 functions or constants the platform does not read.                                                  |
   | parse `factor`                                            | its factor is not 1, 100, 1000 or 10000.                                                                                   |
   | parse `empty`                                             | its {numerator / denominator} is empty.                                                                                    |
   | parse `no_operands`                                       | its formula names no data element.                                                                                         |
   | parse `too_many_operands`                                 | its formula names more than {max} data elements.                                                                           |

4. When the first row's refused operands are all on the denominator and every
   numerator operand is accepted, the sentence ends with a second one: "Add its
   numerator, "{label}", as a data element instead." That label is the
   numerator's own; the second sentence is written only when the numerator is
   one operand. An operand on both sides counts as the numerator. Decided.
5. `{label}` is `dhis2ElementName(element, data_id)`, which the search-result
   shaping already computes for the picker's element rows, and the operand's
   `data_id` when the element is not on the server. `getDhis2OperandVerdict`
   never returns `formula`, and `foldDefaultCombos` removes every
   `default_combo` before the operands are judged, so neither kind can reach an
   indicator row; the import describer groups them with the "no longer exists"
   sentence to stay total, with a one-line comment giving that reason. Decided.
6. A data element row shows one sentence, whichever eligibility rule refused it:
   "This data element cannot be imported: it is not a monthly count, and the
   platform only imports monthly counts from DHIS2." A COC row under a refused
   element shows the same sentence. Decided.
7. `annualized` leaves the parse entirely. `parseDhis2Indicator` neither takes
   nor reports it, and the decomposition carries it. The save route and the id
   repair refuse on it with the existing words ("it is annualized"), checked
   after the parse and before the operands, so the id repair's reason for an
   annualized formula becomes `it is annualized` in place of
   `its formula is refused: it is annualized`. Decided.
8. `Dhis2IndicatorDecomposition.accepted` is deleted. Nothing reads it: the
   picker and the save route each re-derive the answer from `parse` and
   `operands`, and after this plan the picker asks the import describer.
   Decided.
9. Nothing ships. Tim deploys.

## §4 Steps

### Step 1: The contract carries the role, the label and the annualized flag, and the import sentences exist

**Surface.** `lib/types/indicators.ts`,
`server/dhis2/goal2_indicators/decompose_indicator.ts`,
`server/dhis2/goal2_indicators/attach_verdicts.ts`,
`server/db/instance/indicators.ts`, `server/dhis2_id_fix/plan.ts`,
`server/dhis2_id_fix/gather.ts`,
`server/tests/dhis2_decompose_indicator_test.ts`,
`server/tests/dhis2_id_fix_plan_test.ts`,
`server/tests/dhis2_id_fix_execute_test.ts`,
`server/tests/indicator_naming_test.ts`, `SYSTEM_07_dhis2.md`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `Dhis2ParsedOperand` gains `side: "numerator" | "denominator" | "both"`.
  `parseDhis2Indicator` sets it per operand; `dedupeOperands` merges an operand
  seen on both sides to `both`. `foldDefaultCombos` keeps the merged side.
- `Dhis2DecompositionOperand` gains `label: string`:
  `dhis2ElementName(element, data_id)` in `withDecompositions`, the operand's
  `data_id` when the element is not in `elementsById`.
- `parseDhis2Indicator` loses its `annualized` input and
  `Dhis2IndicatorParseRefusal` loses its `annualized` kind.
  `Dhis2IndicatorDecomposition` gains `annualized: boolean`, set by
  `withDecompositions` from the indicator, and loses `accepted` (ruling 8).
  `dhis2_id_fix/gather.ts` drops the field from its own parse call.
- `createIndicatorsFromDhis2` refuses an annualized decomposition with
  `DHIS2 indicator <uid> cannot be decomposed: it is annualized`, after the
  parse check and before the operands. `diagnoseUnknown` reports
  `it is annualized` in the same place.
- `describeDhis2IndicatorImportRefusal(decomposition)` and
  `describeDhis2ElementImportRefusal(verdict)` in `lib/types/indicators.ts`
  return `TranslatableString | undefined`, the sentences of rulings 3 to 6 in
  en, fr and pt, and `undefined` when there is nothing to refuse. The indicator
  one owns the order of causes. Both are exported from `lib`.
- `dhis2_decompose_indicator_test.ts` pins: the side per operand, `both` on a
  repeated operand, that an annualized indicator's formula parses like any
  other, and one sentence per row of rulings 3, 4 and 6 through the two
  describers, in en.
- `dhis2_id_fix_plan_test.ts`'s `formula` helper sets `annualized` on the
  decomposition, and its annualized case expects `it is annualized`.
  `indicator_naming_test.ts`'s `decomposition` helper does the same. Both
  helpers drop `accepted`.
- `SYSTEM_07_dhis2.md` "Indicator decomposition" and "Search-result shaping"
  state the side, the label, the annualized flag and where the decomposition is
  judged. `SYSTEM_05_facilities_indicators.md` names the two import-sentence
  functions beside the diagnostic ones and says which caller uses which.

**Not in this step.** The picker. Any change to `getDhis2ElementVerdict` or to
which indicators are accepted.

**Gates.** The floor.

**Ends with.** One commit.

### Step 2: The picker shows the import sentence and no button

**Surface.**
`client/src/components/data/hmis/indicators/dhis2_indicator_select_form.tsx`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `indicatorRefusal` and `elementRefusal` become one call each to
  `t3(describeDhis2IndicatorImportRefusal(...))` and
  `t3(describeDhis2ElementImportRefusal(...))`. The cause ordering and the
  diagnostic imports leave the file.
- A refused indicator row, element row and COC operand row renders no
  `addButton`, so `addButton` no longer takes a refusal and no longer disables
  on one; the row's line is `text-base-content-muted mt-1 text-xs`.
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

1. Step 1 added `server/tests/dhis2_id_fix_execute_test.ts` to its own Surface:
   its `formula` helper builds a `Dhis2IndicatorDecomposition` literal, so
   dropping `accepted` and adding `annualized` and each operand's `label` failed
   `deno check` until that helper was updated with the others.
2. Step 1 dropped the planned decompose-test case "an annualized indicator's
   formula parses like any other" as a separate case: with `annualized` out of
   the parse's input there is nothing to vary, so the case compared one call
   with itself. The fact is pinned where the flag can be set, on the
   decomposition the import sentence reads.
