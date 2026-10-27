# PLAN_2: a typed DHIS2 element id is confirmed with DHIS2 before it is saved

The dictionary editor lets a user type any DHIS2-shaped id into a DHIS2 element
indicator that has no rows, and the server checks only the shape. A formula id
(what DHIS2 calls an indicator), an id DHIS2 does not have, an element the
picker would refuse, or an operand whose combo the element does not list is
saved, never imports, and surfaces only afterwards: in the import wizard's
Review step, the run detail, the Refresh DHIS2 names modal and the ledger. This
plan makes the create and update paths confirm a typed or changed id with DHIS2
before the write, under the picker's own verdict, and closes the operand combo
hole in the picker's route.

**Next step: Review 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`. Last step: 1. The session that passes
step 1's review deletes this file.

**Start when** `test ! -e PLAN_1_FIX_DHIS2_DATASET_LINKS.md` prints nothing on
`main`. The check fetches elements with the picker's field list, which on
Ethiopia answers 400 until PLAN_1 moves the data-set links to the data-set side;
before that, the check would refuse healthy ids with a DHIS2 error.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("HMIS"
under the identity-space patterns, and "The DHIS2 id repair"),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (the dispatcher bullet and the
Review-step bullet before it), [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) ("Data
value sets", and the S5 and S6 consumer bullets).

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_2_CHECK_TYPED_DHIS2_ID.md." Floor as the protocol lists it, with the dev
Postgres up for `deno task test`; no conditional gate applies. Build log: §8.

Vocabulary. An **element id** is the `data_id` of a `dhis2_element` indicator: a
data element UID or a `UID.COC` operand. A **typed id** is an element id that
arrives through the generic indicator routes: every element id in a create, and
in an update one that differs from the stored `data_id` or lands on an indicator
that was not a DHIS2 element. The **picker's verdict** is
`getDhis2ElementVerdict`: accepted when the element's aggregation type is SUM,
its value type is a count and a monthly data set collects it.

## 1. The problem

- The editor's id field is free text while the indicator has no rows
  (`edit_indicator_form.tsx`, `dataIdLocked`). The route narrows the posted
  definition to `{ type, data_id }` (`server/routes/instance/indicators.ts`),
  and the DB layer's only check is the shape, `dataIdError` in
  `server/db/instance/indicators.ts`, run from `checkIndicatorWrites` and
  `updateIndicator`. Nothing asks DHIS2 what the id is.
- The importer reads only data elements and operands. A formula id or an unknown
  id is a permanent ledger error on every run; the wizard's Review step, the run
  detail and the Refresh DHIS2 names modal report it, all after the save.
- The picker's route, `createIndicatorsFromDhis2`, takes an operand's combo from
  the posted `data_id`, and `getDhis2OperandVerdict` judges the element only. A
  typed `UID.COC` whose combo belongs to another element passes the dispatcher's
  server-wide combo check and imports as an empty series, with no error.
- The repair (SYSTEM_05, "The DHIS2 id repair") fixes the ids already stored.
  After it, the ways back are a hand-typed id, which this plan closes, and a
  change on the DHIS2 side, which no check at save time can see (§6).

## 2. The model

A typed id is confirmed with DHIS2 before the write, under the picker's verdict,
so a hand-typed id can only ever be one the picker would have created. One
function in `server/dhis2/goal2_indicators/` turns a list of ids into verdicts
through a connection: the elements by id with the picker's field list, judged
per id with the operand's combo included, then an `indicators` existence check
for the bare UIDs the fetch did not return, to tell a formula from nothing. That
is the pattern `refreshDhis2Labels` already uses; both share it. The DB layer
owns the rule (which ids are typed, what refuses, the wording) and receives the
verdict function as a required parameter, so the rule is tested on the throwaway
database with a stub and the route is the only place that holds the stored
connection. A refusal is the ordinary `{ success: false, err }` the editor
already shows. An id that is not typed never asks, so DHIS2 being unreachable
blocks only the saving of a new element id, which could not import anyway. An
instance with no stored connection can therefore no longer type a DHIS2 element
id, the gate Add from DHIS2 already has.

## 3. Rulings

1. One verdict function in goal 2, over `FetchOptions` and a list of ids, on the
   refresh-labels pattern; `refreshDhis2Labels` is rewritten over it. No call to
   the run's classifier; the wizard's Review step is untouched.
2. Verdicts are lib's `Dhis2ElementVerdict`, extended with `formula` and
   `combo_not_found` refusal kinds, so the DB layer, the picker's route and the
   decomposition share one refusal vocabulary and one message template,
   `DHIS2
   id "<id>" cannot be imported:` followed by the refusal's text. The
   `element_not_found` wording widens to cover an id that never existed, which
   the picker shows too.
3. The combo check is folded into `getDhis2OperandVerdict(element, dataId)`: an
   operand whose combo the element does not list is refused there, so the
   picker's create route and `withDecompositions` refuse it with no change of
   their own. An operand whose combo is the element's default combo is refused
   too, naming the bare UID: the picker never creates it and the repair treats
   it as a duplicate (`isDefaultComboOf`).
4. `createIndicators` and `updateIndicator` take the verdict function as a
   required parameter. The check runs only on typed ids, only when there is at
   least one, after every local refusal and before the transaction, so a locally
   refused save never asks and a save asks at most once. A typed id the function
   returns no verdict for is refused. An update that keeps its id never asks.
   `createIndicatorsFromDhis2` keeps its own verdicts.
5. _(decided with Tim, 2026-10-21)_ A typed id must pass the picker's verdict. A
   formula, nothing, an element that is not SUM, not a count or in no monthly
   data set, and an operand under an unlisted or default combo are refused with
   ruling 2's message. In a batch the first refused id names its indicator.
6. No answer is a refusal. When the check throws (no stored connection,
   unreachable, timeout, bad credentials) the typed id is not saved, and the
   message says DHIS2 could not confirm it and why. The DB function catches the
   check's throw itself, because the database wrapper would otherwise report a
   DHIS2 outage as a database error. Budget: the wizard's, one attempt, 15
   seconds.
7. The check is live: nothing is stored and nothing is cached.
8. The editor's unlocked caption gains one sentence: DHIS2 is asked on save that
   the id is a data element or operand the picker would accept. No client-side
   pre-check, no spinner.

## 4. Steps

### Step 1: the check, its tests and its prose

**Surface.** `server/dhis2/goal2_indicators/` (the verdict function,
`element_eligibility.ts`), `lib/types/indicators.ts` (the refusal kinds and
their text), `server/routes/instance/indicators_dhis2.ts` (`refreshDhis2Labels`
and the create route over the shared function),
`server/routes/instance/indicators.ts`, `server/db/instance/indicators.ts`, the
three indicator tests that call the two DB functions (a stub answering
accepted), `server/tests/dhis2_element_eligibility_test.ts`, a new DB test on
the throwaway database pattern (in SYSTEM_05's `globs`),
`client/src/components/data/hmis/indicators/edit_indicator_form.tsx` (the
caption, three languages), SYSTEM_05 (the `dhis2_element` sentence, the
`updateIndicator` paragraph, the picker's paragraph), SYSTEM_06 (the dispatcher
bullet gains the save-time refusal), SYSTEM_07 (the S5 consumer bullet;
`withDecompositions` now refuses an unlisted combo; the open item on the chunked
by-id fetches shrinks by one).

**Deliverable.** Rulings 1 to 8 in the code. The new test pins each ruling with
a recording stub; the eligibility test pins the combo rules; the SYSTEM files
describe the check.

**Not in this step.** The import wizard's client, the dispatcher, the repair,
the picker's UI. Any client-side pre-check. Any check of ids already stored.

**Gates.** The floor, with the dev Postgres up.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                               | First reached |
| ---------------------------------- | ------------- |
| `deno task typecheck`              | step 1        |
| `deno task test` (dev Postgres up) | step 1        |
| `./validate_protocols`             | step 1        |
| `./run`                            | step 1        |

## 6. Out of scope

- Ids already stored: the repair's job (SYSTEM_05, "The DHIS2 id repair"), on
  its own rollout (PLAN_WAIT_CLEANUP_DHIS2_ID_REPAIR.md).
- A data element deleted or changed in DHIS2 after the save (moved out of its
  monthly data set, retyped, re-aggregated). No check at save time can see it;
  the Review step and the ledger report it, and the remedy is to retype the
  indicator to Uploaded in the indicator manager, which keeps its data.
- The Refresh DHIS2 names modal, which updates labels and never changes an id.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. No migration, no data change, no
cache shape change. Rollback is reverting the step's commit.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 | 0    | Plan written.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-27 | 0    | Rewritten after three independent reviews: the run classifier replaced by the refresh-labels fetch pattern, one verdict vocabulary in lib, the combo rules folded into the operand verdict, the default-combo refusal added, the start gate on PLAN_1, the references to the deleted repair plan fixed.                                                                                                                                                  |
| 2026-10-27 | 1    | Ruling 2 names two new refusal kinds; ruling 3's default-combo refusal names the bare UID, which neither kind can carry, so a third kind, `default_combo` with the bare id as its value, is added beside `formula` and `combo_not_found`.                                                                                                                                                                                                                |
| 2026-10-27 | 1    | Two files outside the Surface changed, each by one line the step forced: `server/dhis2_id_fix/plan.ts` imports `isDefaultComboOf` from `element_eligibility.ts`, where it moved so the operand verdict can use it without a cycle with `attach_verdicts.ts`; `server/tests/dhis2_id_fix_plan_test.ts` asserts the widened `element_not_found` wording.                                                                                                   |
| 2026-10-27 | 1    | The route's chunked by-id fetch moved into goal 2 as `getDataElementsByIds` and `getIndicatorsByIds`, which `attach_verdicts.ts` and the reader share; the route keeps no copy, so S7's open item on the three copies now names the gatherer's one.                                                                                                                                                                                                      |
| 2026-10-27 | 1    | `readDhis2ElementIds` was run against the public DHIS2 2.40.12 play server with one id of each kind: a SUM monthly element accepted, its operand under a listed combo accepted, an unlisted combo `combo_not_found`, a DHIS2 formula `formula`, an unknown UID and an operand of it `element_not_found`, a default-combo operand `default_combo` naming the bare id; 1.6 s for the three requests.                                                       |
| 2026-10-27 | 1    | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-27 | 1    | Review finding: `client/src/components/data/hmis/indicators/edit_indicator_form.tsx` line 770, the unlocked caption's English reads "DHIS2 is asked that the id is a data element or operand", which is a request, not a confirmation, while the French and Portuguese say "asked to confirm that"; edit: "On save, DHIS2 is asked to confirm that the id is a data element or operand that Add from DHIS2 would accept."                                |
| 2026-10-27 | 1    | Review finding: `server/db/instance/indicators.ts` line 666, `typedDhis2IdError`'s throw message quotes every typed id after the singular "DHIS2 id", so a batch of two reads `DHIS2 could not confirm DHIS2 id "A", "B": ...`; edit: `DHIS2 could not confirm DHIS2 ${typed.length === 1 ? "id" : "ids"} ${quoted}: ...`, and the throw case in `server/tests/indicator_dhis2_id_check_test.ts` line 244 posts two elements and asserts `ids "A", "B"`. |
| 2026-10-27 | 1    | Step 1 reviewed: 2 findings.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | 1    | Step 1 fixed: the caption says DHIS2 is asked to confirm the id; the throw message says "ids" for a batch, and the test posts a batch of two.                                                                                                                                                                                                                                                                                                            |
