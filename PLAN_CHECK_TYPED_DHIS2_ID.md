# PLAN: a typed DHIS2 element id is confirmed with DHIS2 before it is saved

Status: OPEN. Written 2026-10-21 from the code and from the repair rollout of
PLAN_FIX_DHIS2_IDS, which found formula ids and dead ids in five production
dictionaries (four repaired so far, `rca` pending its upgrade); a dry run of the
same repair the same day found five more in Madagascar's, and a run in
Mauritania found eleven elements DHIS2 has but the picker would refuse. Ruling 4
decided with Tim on 2026-10-21; the rest proposed. Premise and proposal were
reviewed by two independent agents before `Do 1`; their findings are applied
below.

The dictionary editor lets a user type any DHIS2-shaped id into a DHIS2 element
indicator that has no rows, and the server checks only the shape. A DHIS2
formula id (what DHIS2 calls an indicator) or an id DHIS2 does not have is
saved, can never import, and surfaces only after the save: at the import
wizard's Review step, in the run detail's banners, in the Refresh DHIS2 names
modal, and as permanent ledger errors. This plan makes the create and update
paths ask DHIS2 what a typed or changed id is, through the stored connection,
and refuse a formula, nothing, or an element the picker would refuse (not SUM,
not a count, no monthly data set), with the wizard's and the picker's wording;
the picker's route stops trusting the client for an operand's category option
combo. Nothing else about the editor, the picker or the repair changes.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The session that passes step 1's review
deletes this file.

Branch: `main` (PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides it
because `main` is the release branch and Tim commits to the current branch).
Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("HMIS"
under the identity-space patterns, and "The DHIS2 id repair"),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (the dispatcher bullet and the
Review-step bullet before it), [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) ("Data
value sets", and the S5 and S6 consumer bullets).

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_CHECK_TYPED_DHIS2_ID.md."
- Branch: `main`.
- Floor: `deno task typecheck`, `deno task test` (with the dev Postgres up:
  `./pg_run`), `./validate_protocols`, `./run`. No step touches migrations, the
  schema, the query engine or help text, so no conditional gate applies.
- Build log: §8. Last step: 1.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM files named
  above, §2 and §3 of this plan, the step's own section in §4, and §8.
- Vocabulary: an **element id** is the `data_id` of a `dhis2_element` indicator,
  a data element UID or a `UID.COC` operand. A **typed id** is an element id
  that arrives from a client through the generic indicator routes: every element
  id in `createIndicators`, and in `updateIndicator` one that differs from the
  stored `data_id` or lands on an indicator that was not a DHIS2 element. The
  **classifier** is `classifyElements`
  (`server/worker_routines/import_hmis_data_dhis2/dispatch.ts`), whose answer
  per id is `dvs` (a data element or operand DHIS2 has, the operand's combo
  included), `unknown/dhis2_indicator` (a formula) or `unknown/not_found`. The
  **picker's verdict** is `getDhis2ElementVerdict`
  (`server/dhis2/goal2_indicators/element_eligibility.ts`): accepted when the
  element's aggregation type is SUM, its value type is a count and a monthly
  data set collects it, refused otherwise with a reason
  `describeDhis2ElementRefusal` words. A **verdict** is what the check answers
  per id: `element` (a data element or operand DHIS2 has and the picker
  accepts), `formula`, `not_found`, or `refused` carrying the picker's refusal.

## 1. The problem

- The editor's DHIS2 id field is a free-text input, enabled while the indicator
  has no rows
  ([edit_indicator_form.tsx:877-881](client/src/components/data/hmis/indicators/edit_indicator_form.tsx#L877-L881),
  `dataIdLocked` at line 250). The server narrows the posted definition to
  `{ type: "dhis2_element", data_id }`
  ([indicators.ts:36](server/routes/instance/indicators.ts#L36)) and the DB
  layer's only check on the id is its shape, `dataIdError`
  ([indicators.ts:186](server/db/instance/indicators.ts#L186)), run from
  `checkIndicatorWrites` (line 515) and `updateIndicator` (line 975). Nothing
  asks DHIS2 what the id is.
- The importer reads only data elements and operands. Its dispatcher refuses a
  formula id and an unknown id on every run, each pair a permanent ledger error
  (SYSTEM_06, the dispatcher bullet); the wizard's Review step previews the same
  refusal through `classifyDatasetHmisDhis2Selection`
  ([datasets.ts:257](server/routes/instance/datasets.ts#L257)); the run detail
  lists `classification.dhis2IndicatorIds` and `classification.unknownIds`; the
  Refresh DHIS2 names modal lists the stored elements it cannot find
  ([indicators_dhis2.ts:109](server/routes/instance/indicators_dhis2.ts#L109)).
  All of them come after the id is saved.
- The repair of PLAN_FIX_DHIS2_IDS fixes the ids that reached production through
  the raw-id fold of migration 086 and the analytics-era pulls. Those paths are
  gone. After the repair, two ways back remain: a hand-typed id in the editor,
  which this plan closes, and a data element the ministry deletes in DHIS2,
  which no check at save time can see and which the Review step and the ledger
  report (§6).
- The picker's path, `createIndicatorsFromDhis2`
  ([indicators_dhis2.ts:302](server/routes/instance/indicators_dhis2.ts#L302)),
  creates elements under live verdicts of the data element and decomposes
  formulas. The operand's combo half is the client's: the route takes it from
  the posted `data_id` (lines 304 to 312) and `getDhis2OperandVerdict` judges
  the element only, so a crafted body from any `can_configure_data` user stores
  `UID.<combo DHIS2 lacks>`, which the dispatcher then refuses. The UI builds
  operands from the element's live combos, so only a crafted body reaches it;
  ruling 7 closes it. The CSV wizard creates no indicators: it maps file values
  onto existing ones, and an Uploaded key is the server's.

## 2. The model

A typed id is confirmed with DHIS2 before the write, by the same classifier the
run and the wizard use and the same verdict the picker applies, so a hand-typed
id can only ever be one the picker would have created. One route-side function
turns a list of ids into verdicts through the stored connection, on top of the
classifier call the wizard's Review-step route shares. The DB layer owns the
rule (when an id is typed, what verdict refuses it, the wording) and receives
the verdict function as a parameter, so the rule is tested on the throwaway
database without DHIS2 and the route is the only place that holds the stored
connection. A refusal is an ordinary `{ success: false, err }` the editor
already shows. An id that is not typed, which is every edit of a label, a flag
or a locked id, never asks DHIS2, so DHIS2 being unreachable blocks only the
saving of a new element id, which could never import anyway.

## 3. Rulings

1. _(proposed)_ **Two route-side functions, the classifier call shared.** Both
   exported from `server/routes/instance/indicators_dhis2.ts` (the route file
   that already reads the stored connection for the dictionary).
   `dhis2IdRoutes(mainDb: Sql, dataIds: string[]): Promise<Map<string,
   ElementRoute>>`
   reads the credentials through `getStoredDhis2CredentialsDecrypted` inside its
   body and calls `classifyElements` with `retryOptions: { maxAttempts: 1 }` and
   `timeout:
   15000` (the wizard's budget, stated once);
   `classifyDatasetHmisDhis2Selection` calls it and splits the map into its two
   arrays, behaviour unchanged.
   `dhis2IdVerdicts(mainDb: Sql, dataIds: string[]): Promise<Map<string,
   Dhis2IdVerdict>>`
   calls it, fetches the data elements of the `dvs` routes with the picker's
   field list (`getDataElementsFromDHIS2`, `id:in` chunks of 100, the same
   options), and answers per id: `formula` and `not_found` from the route;
   otherwise `refused` with the picker's refusal when `getDhis2ElementVerdict`
   refuses the element or `operandComboMissing` (ruling 7) finds the operand's
   combo unlisted (`element_not_found` is the refusal for an element the fetch
   did not return); otherwise `element`.
2. _(proposed)_ **The check lives in the DB layer, injected.**
   `createIndicators` and `updateIndicator` take a required
   `checkDhis2Ids: (dataIds: string[]) =>
   Promise<Map<string, Dhis2IdVerdict>>`;
   `Dhis2IdVerdict = { kind: "element" } | { kind: "formula" } | { kind:
   "not_found" } | { kind: "refused"; refusal: Dhis2ElementRefusal }`
   is declared in `server/db/instance/indicators.ts`, with `Dhis2ElementRefusal`
   the refusal half of lib's `Dhis2ElementVerdict`. The route passes
   `(ids) => dhis2IdVerdicts(c.var.mainDb, ids)`; tests pass a stub. Required,
   not optional, so no caller can forget it. `createIndicatorsFromDhis2` keeps
   its own verdicts and does not take it.
3. _(proposed)_ **Only a typed id is checked, last, once.** In
   `createIndicators`, every element id in the batch, after
   `checkIndicatorWrites` passes (which already refuses a duplicate data id); in
   `updateIndicator`, the element id when the stored row is not a DHIS2 element
   or its `data_id` differs, after the owned-elsewhere check. Both before the
   transaction, so a locally refused save never asks DHIS2 and a save asks at
   most once. An unchanged id is never asked about, so a locked id and every
   other field edit stay independent of DHIS2.
4. _(decided)_ **A typed id must pass the picker's verdict.** A formula and
   nothing are refused, and so is an element DHIS2 has but the picker would
   refuse: aggregation type not SUM (DHIS2 itself does not add its values across
   facilities or months), value type not a count, or no monthly data set
   (Mauritania's eleven, which fail every run on a 2.38 server and return
   nothing monthly on a later one). An operand is checked whole: its element's
   verdict and its combo listed by the element. The error for a formula or
   nothing is the wizard's sentence, without the repair note, since nothing was
   saved:
   `DHIS2 id "<id>" points to a DHIS2 formula (what DHIS2 calls an
   indicator), which a DHIS2 import does not fetch`
   and `DHIS2 id "<id>" points
   to nothing in DHIS2`; for a refused element it
   is `DHIS2 id "<id>" cannot be
   imported:` followed by
   `describeDhis2ElementRefusal(refusal).en`, the picker's own text. In a batch,
   the first refused id names the indicator the way `checkIndicatorWrites` does
   (`<indicator id>: <error>`).
5. _(proposed)_ **No answer is a refusal.** When the check throws (no stored
   connection, unreachable, timeout, bad credentials), the typed id is not
   saved, with `DHIS2 could not confirm the id: <the thrown message>`. The
   missing connection therefore reads `DHIS2 could not confirm the id:` followed
   by the existing `NO_STORED_DHIS2_CONNECTION` text, since the verdict function
   reads the credentials inside its body. A DHIS2 element that DHIS2 cannot
   vouch for could not import either, and the check is skipped for everything
   but a typed id (ruling 3), so an outage never blocks the rest of the editor.
6. _(proposed)_ **The ids the check accepts are the ids the dispatcher
   fetches.** No stored flag, no cached verdict: the classifier is asked each
   time an id is typed, as the run asks each time it starts.
7. _(proposed)_ **Both routes check the operand's combo.** A pure
   `operandComboMissing(element, dataId)` beside `getDhis2OperandVerdict` in
   `server/dhis2/goal2_indicators/element_eligibility.ts` says whether an
   operand's combo is missing from the element's
   `categoryCombo.categoryOptionCombos`. `createIndicatorsFromDhis2`'s route
   refuses such an operand with ruling 4's "points to nothing in DHIS2" sentence
   before the write, from the elements it already fetched; `dhis2IdVerdicts`
   answers `refused` for it (ruling 1). No extra DHIS2 call in either.
8. _(proposed)_ **The editor says what happens.** The unlocked caption gains one
   sentence: DHIS2 is asked on save that the id is a data element or operand the
   picker would accept. No client-side pre-check, no spinner: the save action
   already waits on the route and shows its error.

## 4. Steps

### Step 1: the check, its tests and its prose

**Surface.**

- `server/routes/instance/indicators_dhis2.ts`: `dhis2IdRoutes` and
  `dhis2IdVerdicts` (ruling 1); the operand-combo refusal in the create route
  (ruling 7).
- `server/routes/instance/datasets.ts`: `classifyDatasetHmisDhis2Selection`
  calls `dhis2IdRoutes` (ruling 1).
- `server/db/instance/indicators.ts`: the `Dhis2IdVerdict` type and the
  `checkDhis2Ids` parameter; `createIndicators` and `updateIndicator` apply
  rulings 3 to 5; the refusal messages.
- `server/routes/instance/indicators.ts`: `createIndicators` and
  `updateIndicator` pass the check (ruling 2).
- `server/dhis2/goal2_indicators/element_eligibility.ts`: `operandComboMissing`
  (ruling 7).
- `server/tests/indicator_rename_test.ts`,
  `server/tests/indicator_data_key_test.ts`,
  `server/tests/indicator_naming_test.ts`: the only callers of the two functions
  outside the route; each passes a stub that answers `element` for every id, and
  nothing else in it changes.
- `server/tests/dhis2_element_eligibility_test.ts`: `operandComboMissing` on an
  element with combos, an element without, a bare UID and an unlisted combo.
- `server/tests/indicator_dhis2_id_check_test.ts`, new: on the throwaway
  database pattern of `indicator_data_key_test.ts`, with a stub check that
  records the ids it was asked and answers from a map. Pins: a create with a
  formula id is refused with ruling 4's sentence and nothing is inserted; a
  create with an unknown id likewise; a create whose element the picker refuses
  (no monthly data set) is refused with ruling 4's "cannot be imported" sentence
  and the refusal's text; an operand is passed whole to the check; a batch with
  a locally refused item never asks; Uploaded, Sum and Calculated definitions
  are not asked; an update that keeps the id asks nothing; an update that
  changes the id of a rowless element asks and is refused on `formula`; an
  Uploaded indicator whose key is a UID, with rows under it, retyped to DHIS2
  element under the same UID asks and is refused on `not_found`; a check that
  throws refuses with ruling 5's sentence and leaves the row as it was.
- `SYSTEM_05_facilities_indicators.md`: the new test file in `globs`; the
  `dhis2_element` sentence under "HMIS" (identity-space patterns) states the
  check; the `updateIndicator` paragraph states when it runs; the picker's
  paragraph states the combo refusal.
- `client/src/components/data/hmis/indicators/edit_indicator_form.tsx`: the
  unlocked caption (ruling 8), three languages.
- `SYSTEM_06_ingestion.md`: the Review-step bullet names `dhis2IdVerdicts`; the
  dispatcher bullet gains one clause that the editor refuses the same two kinds
  of id at save. `SYSTEM_07_dhis2.md`: the S5 consumer bullet names the verdict
  function and `operandComboMissing`.

**Deliverable.** Rulings 1 to 8 are in the code; the new test and the
eligibility test run green on the dev Postgres; the three existing indicator
tests pass with the stub; the SYSTEM files describe the check in the sentences
named above.

**Not in this step.** Any change to the import wizard's client, the dispatcher,
the id repair or the picker's UI. Any client-side pre-check or search on the
typed id. Any check of ids already stored (that is the repair's job, §6).

**Gates.** The floor, with the dev Postgres up for `deno task test`.

**Ends with.** One commit: "A typed DHIS2 element id is confirmed with DHIS2
before it is saved".

## 5. Gates catalogue

| Gate                                                   | First reached |
| ------------------------------------------------------ | ------------- |
| `deno task typecheck`                                  | step 1        |
| `deno task test` (dev Postgres up), the new test among | step 1        |
| `./validate_protocols`                                 | step 1        |
| `./run`                                                | step 1        |

## 6. Out of scope

- Ids already stored. The repair (`fix_dhis2_ids.ts`) is the only path that
  changes an element id that has rows, and PLAN_FIX_DHIS2_IDS's step 4 is where
  every instance's dictionary gets checked; this plan does not re-check the
  dictionary at rest, by the ruling that re-keying with data is a team-run,
  reviewed script.
- A data element deleted in DHIS2 after the id was saved. No check at save time
  can see it; the wizard's Review step and the ledger report it, and the repair
  turns it Uploaded with its rows kept.
- An element that passes the verdict at save and is later changed in DHIS2
  (moved out of its monthly data set, retyped, re-aggregated). No check at save
  time can see it; the run reports it (`classification.noMonthlyDataSetIds` on a
  release before 2.39, empty months on a later one) and the repair retypes it
  Uploaded with its rows kept (PLAN_FIX_DHIS2_IDS ruling 1).
- The Refresh DHIS2 names modal, which updates labels, reports formula and
  not-found ids, and never changes an id.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. No migration, no data change, no
cache shape change. Rollback is reverting the step's commit.

## 8. Build log

| When       | Step | Row           |
| ---------- | ---- | ------------- |
| 2026-10-21 | 0    | Plan written. |
