# PLAN A7: the DHIS2 import selects indicators and shows the elements it fetches

Status: DRAFT. Written 2026-09-14 from Tim's rulings in discussion. The
rulings marked *(proposed)* in §3 are the drafter's derivation from those
rulings and stand unless Tim overrules them in §3 before `Do 1`. Follows
PLAN_A6, closed 2026-09-14 at `cdf1a5ba` (its text is in git history at
`cdf1a5ba^`). A7 changes what the DHIS2 import wizard offers and shows,
lets the indicator manager launch that wizard for the indicators
selected in its list, and makes the HMIS family's words for its objects
consistent. It changes no route, no type the server stores, no migration and no worker: the
server already expands a selection of indicators to the DHIS2 elements
it fetches, and A7 puts that expansion in front of the user before launch
instead of after.

**Next step: Review 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 4's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (help text). The modules repo and panther
are not touched.

Read first: [SYSTEM_06](SYSTEM_06_ingestion.md) "HMIS import runs" (the
bullet "Import selects indicators; the data ids it fetches are expanded
where pairs are enumerated") and "Client"; [SYSTEM_05](SYSTEM_05_facilities_indicators.md)
"The four indicator dictionaries" and "Client state & wizard";
`lib/hmis_indicator_catalog.ts` (`expandIndicatorSelection`);
`lib/types/dataset_hmis_import.ts` (`Dhis2WindowSelectionInput`,
`Dhis2SelectionExpansion`);
`client/src/components/instance_dataset_hmis/imports/_wizard/index.tsx`;
`client/src/components/instance_dataset_hmis/imports/_indicator_picker.tsx`;
`client/src/components/instance_dataset_hmis/imports/index.tsx`
(`openWizard`);
`client/src/components/indicator_manager_hmis/indicators_manager.tsx`
(`bulkActions`);
`client/src/components/indicator_manager_hmis/_indicator_display.ts`
(`indicatorsByDataId`);
`server/tests/indicator_selection_expansion_test.ts`.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md),
bound for this app by [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md).
This plan binds them as follows.

- Instruction: "Do the next step of PLAN_A7_DHIS2_IMPORT_SELECTION.md."
- Branch: `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Step 4 touches help text, so it also runs
  `deno task build:help-buttons` and shows it unchanged on a second run.
  No step touches a migration, the seed, the query engine or the extract.
- Last step: 4.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 of this plan, the step's own section
  in §4.
- Peculiar to this plan: `./run` has not started in any A5 or A6 session
  because port 8000 is held by another deno server on Tim's machine. A
  session that finds the port held runs `deno task build:client` instead.

## 1. The problem

The DHIS2 import already selects indicators and fetches the DHIS2
elements they expand to (PLAN_A4 ruling 5, PLAN_A5 ruling 9). The
expansion lives in one lib function, `expandIndicatorSelection`
(`lib/hmis_indicator_catalog.ts` line 438): a sum expands to its members,
a derived flattens through the formula resolver to the counts it reaches,
the DHIS2 elements among them contribute their data ids, and Uploaded
indicators and population terms are dropped and listed. The server
persists that expansion on the run row as `dataIds` and the worker
fetches exactly that set; a selection that expands to nothing is refused
at launch (`server/db/instance/dataset_hmis_import_runs.ts` lines
240-241, "The selected indicators have no DHIS2 elements to fetch"). Eight
tests pin the expansion. None of that changes.

What the wizard does with it is the problem.

- **The picker offers Uploaded indicators.** `_indicator_picker.tsx` line
  81 lists the whole dictionary, and `_step_indicators.tsx` line 22 adds a
  sentence saying Uploaded indicators are not fetched. A DHIS2 import can
  never fetch one, so the row is noise the sentence apologises for.
- **The Review shows a count, not the set.** `_wizard/index.tsx` lines
  156-164 run the expansion and keep only `dataIds.length`; the Review
  (`_step_review.tsx` lines 7-9) prints "N indicators (M DHIS2
  elements)". The user who selects three derived indicators to "import
  everything they need" cannot see which elements that is, and the
  dropped parts (an Uploaded member of a sum, a population term, a derived
  that does not resolve) are discarded by the memo and appear only after
  launch, in the run detail (`_run_detail.tsx` lines 262-283).
- **An empty expansion is refused at the end.** The wizard lets the user
  through Indicators, Time and Config before the launch tells them the
  selection fetches nothing.
- **The manager cannot start an import for the indicators in front of
  you.** Its only bulk action is Delete (`indicators_manager.tsx` lines
  496-506). The DHIS2 wizard is opened only from the imports view
  (`imports/index.tsx` lines 194-202), which hands it two of its own
  queries (`runsQuery`, `schedulingQuery`) and takes back the tab it
  landed on. The wizard reads two things from them: whether a run is
  running, for the Start-vs-Queue fork, which the SSE store already
  carries as `instanceState.hmisImportRunActive`; and the stored
  connection with the encryption-key flag, which is exactly the payload
  of `getInstanceDhis2CredentialsInfo` that the manage-connection modal
  fetches for itself (`manage_connection.tsx` lines 15-25). The DHIS2
  and CSV wizards are the two modals in the client that take data from
  their host instead of fetching it the way the results-package wizard does
  (`instance_results_packages/_wizard/index.tsx` lines 52-105: a query,
  a loading frame of the same width and heading, an inner component
  seeded from the data). A user who has
  just created or checked three derived indicators and wants their data
  must leave the manager, open HMIS data, open Imports, open the wizard
  and find the same three rows again.
- **Two actions share one name.** The indicator manager's button that
  creates indicators from DHIS2 metadata is "Import from DHIS2"
  (`indicators_manager.tsx` line 233), and the data wizard's modal title
  is "Import from DHIS2" (`_wizard/index.tsx` line 534). The select form
  behind the manager's button is headed "DHIS2 indicator selection"
  (`dhis2_indicator_select_form.tsx` line 419), which is DHIS2's word for
  its formula objects, while the form mainly finds DHIS2 elements.
- **The type is named with DHIS2's word.** The dictionary type is "DHIS2
  element" in 50 user-facing strings, which is also what the thing on
  DHIS2 is called wherever a count or a pair is labelled; "data element"
  names that same thing in 18 more. A reader cannot tell the indicator
  from the DHIS2 object it fetches.

## 2. The model

**Selection.** The indicator ids the user picks in the wizard's
Indicators step. It may hold DHIS2-element, Sum and Derived indicators,
never Uploaded. It is what a run row and a schedule store as
`indicatorIds`, unchanged.

**Expansion.** What `expandIndicatorSelection` returns for a selection:
the data ids fetched (`dataIds`), in first-appearance order and once
each; the Uploaded indicators dropped; the population terms dropped; the
selected ids that are unknown; the derived indicators that do not
resolve. Unchanged, and the only source of truth for what a run fetches.

**Covered elements.** The expansion's data ids joined to the dictionary
(`indicatorsByDataId`): one row per DHIS2-element indicator the
selection covers, showing its indicator id, label and DHIS2 id. The
Review lists them. This is the answer to "import everything these three
derived indicators need".

**Dropped parts.** The expansion's Uploaded indicators and population
terms, and any unresolvable derived. The Review lists them under the
covered elements with one sentence each saying why they are not fetched.
A selection with dropped parts is ordinary and launches; a country that
fills one member of a sum by CSV has exactly this shape.

**The Indicators step refuses forward** while the expansion has no data
ids, or a selected derived is unresolvable, with the reason under the
table. The launch's own refusal stays as the last line of defence, never
the first the user hears.

**Launching from the manager.** The manager's list gains a bulk action,
"Import HMIS data from DHIS2", the wizard's own title, on the rows
selected. It opens the same DHIS2 wizard as a modal over the manager, with
the selection preselected in its Indicators step (the ids the picker does
not list, Uploaded rows and any id no longer in the dictionary, are
dropped once the dictionary loads, and the step says which ones and why),
and every other step as it is. The wizard fetches what it needs itself, so
the manager hands it the selection and takes back the result, nothing
else. The wizard launches or queues or schedules exactly as it does from
the imports view. When it closes after a launch, the manager shows a
notice saying the import can be followed under HMIS data, Imports; the
dataset sidebar's running and queued flags already come from the SSE
summary and need nothing. No page switch, no state carried between
pages.

**Words.** Two terms across the HMIS family (the indicator manager, the
DHIS2 and CSV import wizards, the imports tabs, the run detail, the
version information and the site pages behind their help buttons).
**DHIS2 element** is the thing on DHIS2 itself, what DHIS2 calls a data
element: the thing a DHIS2 id names. **DHIS2-element indicator** is one
of the four types of indicator FASTR manages, the one whose data comes
from a DHIS2 element.

Two actions get distinct names: **Add indicators from DHIS2** creates
indicators from DHIS2 metadata (the manager's button and the select form's
heading); **Import HMIS data from DHIS2** fetches values (the data
wizard's title and the manager's bulk action, one string).

## 3. Rulings

1. **The picker offers DHIS2-element, Sum and Derived.** An Uploaded
   indicator is not listed. The sentence saying Uploaded indicators are
   not fetched goes with it. (Tim.)
2. **A Sum or a Derived is selectable whatever its parts.** The DHIS2
   elements among its parts are fetched; Uploaded parts and population
   terms are not; the server's expansion and its dropped lists are the
   whole rule, unchanged. (Tim: "select all components that are DHIS2
   elements".)
3. **The Review lists the covered elements**, one row per DHIS2-element
   indicator (indicator id, label, DHIS2 id), deduplicated, in the
   expansion's order, followed by the dropped parts with their reasons.
   The counts ("N indicators, M DHIS2 elements") and the pair count stay
   above the list. (Tim: "the wizard should get the unique set of DHIS2
   element indicators that covers all selected".)
4. **The rows the Review shows come from one lib function** *(proposed)*:
   `describeDhis2Selection(indicatorIds, indicators, populationTypeIds)`
   in `lib/hmis_indicator_catalog.ts`, whose `indicators` is
   `Pick<HmisIndicator, "indicator_common_id" | "indicator_common_label" |
   "definition">[]` (the expansion's own input has no label), a thin
   wrapper over `expandIndicatorSelection` that joins each data id to its
   indicator and
   returns `{ elements: { dataId, indicatorId, label }[], uploadedDropped,
   populationTermsDropped, unresolvable, unknownIndicatorIds }`. The
   wizard renders it; a harness pins it. The server keeps calling
   `expandIndicatorSelection` directly.
5. **The Indicators step refuses Next** *(proposed)* while the
   description has no elements or an unresolvable derived, with the
   reason under the table. An unknown id never reaches the description:
   ruling 12 drops it at seed, and the picker's table can only add ids it
   lists. The launch's refusals in `dataset_hmis_import_runs.ts` stay.
6. **Nothing stored changes.** `indicatorIds` and `dataIds` on the run
   row and `indicatorIds` on a schedule keep their shape and meaning; the
   History label ("N indicators (M DHIS2 elements)"), the Future label and
   the By indicator tab are unchanged. (Consequence of rulings 1-5.)
7. **The schedule editor and the preset-pairs entry are the same wizard**
   and inherit rulings 1-5 without their own work; a preset-pairs run
   (retry failed, re-import from the ledger) skips the Indicators step
   today and keeps doing so, and its Review keeps its pair label.
   (Consequence.)
8. **The two names** *(proposed)*: the manager's button and the select
   form's heading become "Add indicators from DHIS2"; the data wizard's
   title and the manager's bulk action (ruling 11) become "Import HMIS
   data from DHIS2", one string. French and Portuguese follow. The site's section "Importing from DHIS2" on the indicators
   page is retitled to match, and every sentence that says "Import from
   DHIS2" to mean adding indicators says the new name.
9. **The term sweep** applies the two §2 words to every user-facing
   string in the HMIS family. The type is "DHIS2-element indicator"
   wherever it is named, `indicatorTypeWord` included. The thing on DHIS2
   is "DHIS2 element", and "data element" is retired. Counts of data ids
   ("M DHIS2 elements") and pair labels already name the thing on DHIS2
   and stay. DHIS2's formula object keeps its name, "DHIS2 indicator", in
   the search form's result types and the run detail's classification.
   Comments and SYSTEM prose follow. A string outside the family (the
   geojson wizard's "Import from DHIS2", which fetches boundaries) is out
   of scope (§6). (Tim.)
10. **No new state and no memory.** The wizard does not remember a
    selection between runs beyond what a schedule already stores, and no
    "select all DHIS2 elements" shortcut is added. (Consequence of §6.)
11. **The manager launches the wizard for its selection.** A bulk action
    "Import HMIS data from DHIS2" on the manager's list, for global admins like
    its Delete, opens the DHIS2 wizard as a modal with the selected
    indicator ids preselected; the wizard fetches its own data; after a
    launch the manager shows where to follow the run. (Tim.)
12. **The mechanism of ruling 11** *(proposed)*: the wizard's `new` entry
    gains an optional `indicatorIds`, `{ kind: "new"; indicatorIds?:
    string[] }`; the imports view keeps passing `{ kind: "new" }`. Every
    entry that seeds a selection (`new` from those ids, `editSchedule`
    from the stored schedule) drops the ids the picker does not list:
    Uploaded indicators, and ids not in the dictionary (a stored schedule
    can name a since-deleted indicator). The dictionary arrives when the
    Indicators step mounts and the picker's query resolves, so the drop
    runs in `onDictionaryLoaded`, once per open, never at construction.
    The drop is never silent: the Indicators step shows one line above the
    table naming each id it left out with its reason (an Uploaded
    indicator, which a DHIS2 import cannot fetch; an id no longer in the
    list), for this launch only. A selection that was only dropped ids
    opens the step with nothing selected, that line, and the step's own
    refusal (ruling 5), so the bulk action is never disabled by the
    selection's content. The wizard fetches its
    own data, in the results-package wizard's shape
    (`instance_results_packages/_wizard/index.tsx`): `Dhis2WizardProps`
    is the entry alone; the outer component runs `createQuery` over
    `getInstanceDhis2CredentialsInfo` inside a `StateHolderWrapper` whose
    `loadingRenderer` and `errorRenderer` draw a `ModalContainer` of the
    wizard's width and title; the ready branch mounts the inner wizard
    seeded from the data. The inner keeps the credentials info in a signal
    and refreshes it in the credentials step's `onSaved` by calling the
    same action, never by refetching the outer query: the wrapper keys its
    ready branch on the data object, and a remount would wipe the
    selection of a user who came back to step 1 through "Back to step 1".
    The Start-vs-Queue fork reads `instanceState.hmisImportRunActive`,
    which the server pushes at launch, enqueue, scheduler fire and
    completion, so the fork is live in every host without a poll. The
    imports view's readiness gate on its New import button and the
    wizard's refetch of the host queries before close both go; the imports
    view's `refresh()` on the result already covers it. The manager opens
    the wizard on the click with no await: the loading frame is the
    feedback.

## 4. Steps

### Step 1: The wizard

**Surface.** `lib/hmis_indicator_catalog.ts`;
`server/tests/indicator_selection_expansion_test.ts`;
`client/src/components/instance_dataset_hmis/imports/_indicator_picker.tsx`;
`client/src/components/instance_dataset_hmis/imports/_wizard/_step_indicators.tsx`;
`client/src/components/instance_dataset_hmis/imports/_wizard/_step_review.tsx`;
`client/src/components/instance_dataset_hmis/imports/_wizard/index.tsx`;
`SYSTEM_06_ingestion.md` prose; this file.

**Deliverable.** `describeDhis2Selection` exists in lib as ruling 4 says
and is pinned by tests in the expansion test file: a selection of one
element, a sum, a derived through a sum, a mixed sum with an Uploaded
member, a population term, an unresolvable derived, each giving the
expected element rows (with labels) and dropped lists. The picker lists
only DHIS2-element, Sum and Derived rows (ruling 1) and the step's caption
says what selecting each type fetches without mentioning Uploaded. The
wizard computes the description once from the dictionary the picker
loads (replacing the `nElements` memo) and refuses Next from the
Indicators step while it has no elements or an unresolvable derived, with
the reason under the table (ruling 5). The Review keeps its counts and
adds the covered elements and the dropped parts as ruling 3 says; a
preset-pairs run shows neither (ruling 7). SYSTEM_06 "Client" describes
the Indicators step's filter and refusal and the Review's list, and its
expansion bullet names `describeDhis2Selection` as the client's read of
the same expansion.

**Not in this step.** The manager's bulk action (step 2). Any string
outside the wizard's own files (step 3). The site (step 4).

**Gates.** `deno task test` includes the new cases. `grep -c "Uploaded indicators are not fetched"
client/src/components/instance_dataset_hmis/imports/_wizard/_step_indicators.tsx`
at zero.

**Ends with.** Two commits: the lib function with its tests, then the
wizard with SYSTEM_06.

### Step 2: The manager's bulk action

**Surface.** `client/src/components/indicator_manager_hmis/indicators_manager.tsx`;
`client/src/components/instance_dataset_hmis/imports/_wizard/index.tsx`
(the entry type, the self-fetch and the seeded selection);
`client/src/components/instance_dataset_hmis/imports/index.tsx` (the
wizard's props and the New import gate only);
`SYSTEM_05_facilities_indicators.md` and `SYSTEM_06_ingestion.md` prose;
this file.

**Deliverable.** The wizard fetches its own credentials info and reads
the SSE run flag as ruling 12 says, `Dhis2WizardProps` is the entry
alone, the imports view passes only the entry, and its New import button
no longer waits on the scheduling query. The `new` entry carries the
optional `indicatorIds`, every seeded selection drops the ids the picker
does not list when the dictionary loads, and the Indicators step names
each dropped id with its reason above the table. The manager's bulk
actions hold "Import HMIS data from DHIS2" beside Delete, gated the same
way; clicking it opens the
wizard at once with the selected ids, and on a result shows a notice
naming HMIS data, Imports and the tab the wizard landed on (ruling 11).
SYSTEM_05 "Client state & wizard" names the action; SYSTEM_06 "Client"
names the manager as the wizard's second host, says the wizard fetches
its own data and reads the SSE flag, and records under Open items that
the CSV wizard still takes `runsQuery` for the same fork.

**Not in this step.** Any string outside the three files (step 3). The
site (step 4). The CSV wizard.

**Gates.** The floor. `grep -c "Import HMIS data from DHIS2"
client/src/components/indicator_manager_hmis/indicators_manager.tsx` at
least one.

**Ends with.** One commit.

### Step 3: The words

**Surface.** `client/src/components/instance_dataset_hmis/**`,
`client/src/components/indicator_manager_hmis/**`, string literals and
comments in `lib/types/indicators.ts`, `lib/types/dataset_hmis_import.ts`
and `lib/hmis_indicator_catalog.ts`; `SYSTEM_05_facilities_indicators.md`
and `SYSTEM_06_ingestion.md` prose; this file.

**Deliverable.** The two names of ruling 8 are in the code: the manager's
button and the select form's heading say "Add indicators from DHIS2", the
data wizard's title says "Import HMIS data from DHIS2", in three
languages. Every user-facing string in the surface reads by the two §2 words
(ruling 9).
SYSTEM_05 and SYSTEM_06 name the two actions by their new names and use
the two §2 words.

**Not in this step.** Layout, behaviour, or any string outside the
surface. The site (step 4).

**Gates.** `grep -rn "Import from DHIS2\|DHIS2 indicator selection"
client/src --include='*.tsx' --include='*.ts' | grep -v instance_geojson`
at zero. `grep -rn "Importer depuis DHIS2\|Importation depuis DHIS2"
client/src --include='*.tsx' | grep -v instance_geojson` at zero.

**Ends with.** One commit, or two if the renames and the sweep are
easier to review apart.

### Step 4: Docs and close

**Surface.** `wb-fastr-site` pages `admin-guide/data-hmis.md`,
`admin-guide/indicators.md` and their `fr/` twins;
`lib/help/help_targets.generated.ts` via `deno task build:help-buttons`;
`SYSTEM_05_facilities_indicators.md` and `SYSTEM_06_ingestion.md` if a
sentence still disagrees with the code; this file.

**Deliverable.** The site's DHIS2 import workflow describes the
Indicators step (three types offered, what each fetches, the refusal) and
the Review (the covered elements and the dropped parts), and says the
same wizard opens from the indicator list's "Import HMIS data from DHIS2"
action with the selected rows preselected. The indicators page's section
on adding indicators from DHIS2 carries the new name in its heading and
its button references, and the help target behind it keeps its id
`ind-dhis2-import` while its anchor, which `build_help_buttons.ts`
slugifies from the heading, changes in the generated file; its
list section names the bulk action. Every site sentence in the two pages reads by the two §2 words.
The generated help targets are rebuilt. Nothing else changes.

**Not in this step.** Code.

**Gates.** `grep -rn "Import from DHIS2\|Importer depuis DHIS2"
../wb-fastr-site/src/content/docs/admin-guide/indicators.md
../wb-fastr-site/src/content/docs/admin-guide/data-hmis.md
../wb-fastr-site/src/content/docs/fr/admin-guide/indicators.md
../wb-fastr-site/src/content/docs/fr/admin-guide/data-hmis.md` at zero.
`deno task build:help-buttons` leaves the tree unchanged when run twice.

**Ends with.** One commit here and one in `wb-fastr-site`. The review
that passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches each is named, and every later step keeps it.

1. A5's and A6's gates stay at zero. Landed.
2. `describeDhis2Selection` pinned in
   `server/tests/indicator_selection_expansion_test.ts`; `deno task test`
   runs it. Step 1.
3. The bulk action present in the manager. Step 2.
4. The retired labels absent from `client/src` outside the geojson
   wizard. Step 3.
5. The retired labels absent from the four site pages, and
   `build:help-buttons` idempotent. Step 4.

## 6. Out of scope

- Any server change. The expansion, its persistence on the run row, the
  worker's fetch and the launch refusal are as PLAN_A5 left them.
- Remembering a selection between imports, or a bulk "select every DHIS2
  element" action in the picker. The picker's table selection is the
  mechanism; a country that wants everything selects everything.
- Search or filter controls in the picker beyond what panther's `Table`
  gives today.
- The geojson wizard's "Import from DHIS2" label, which fetches boundaries
  and belongs to S5's geojson path, not the HMIS family.
- The CSV wizard's mechanics (PLAN_A6), including its `runsQuery`
  dependency. Its strings are in step 3's sweep only.
- The By indicator tab, already keyed by data id and showing a DHIS2 id
  only under a DHIS2 element (PLAN_A6 ruling 1).
- Any rename of a stored value: `dhis2_element` as the type's code name,
  `data_id`, `indicatorIds`, `dataIds`.

## 7. Rollout and rollback

Client and prose only. Nothing here touches a database, a cache prefix
or a stored JSON shape, so there is nothing to back up and no migration
to rehearse.

1. After step 4's review passes, `./deploy_testing` from `tim-branch`
   (it ships the working tree; check `git status`), then in the testing
   instance select one derived indicator whose formula reaches a sum in
   the indicator list, choose "Import HMIS data from DHIS2", and confirm the
   Review lists the elements the run detail then reports as fetched.
2. Rollback is the previous image. A run launched under A7 stores the
   same `selection` shape as one launched before it.
