# PLAN_1: read each DHIS2 element's data sets from the data-set side

Ethiopia's DHIS2 (2.40.1) cannot serve five elements' data-set links from the
element side: any `dataElements` request whose field list carries
`dataSetElements` and whose result holds one of them answers 400. Every element
fetch in the app carries that field, so on Ethiopia the picker's searches, the
formula decomposition, Add from DHIS2, Refresh DHIS2 names and the DHIS2 id
repair's gatherer all fail, while imports, which pull by element and never read
the field, succeed. The data-set side serves every link. This plan reads links
from there, inside the one element fetcher, so every caller is fixed with no
change of its own.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. Last step: 1. The session that passes step
1's review deletes this file.

Branch: `main`. Repos touched: this app only. PLAN_2 starts when this plan has
landed.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) (query idioms, element eligibility,
data value sets, and the open item on the chunked id fetches).

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_1_FIX_DHIS2_DATASET_LINKS.md." Floor as the protocol lists it; no step
touches a migration, the schema, the query engine or help text, so no
conditional gate applies. Build log: §8.

## 1. The problem

- The one element fetcher, `getDataElementsFromDHIS2` in
  `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts`, asks for
  `dataSetElements[dataSet[id,periodType]]` in its field list, and the search
  function delegates to it. Its callers: the picker's element search and
  combined search, `withDecompositions` (the operand fetch behind the formula
  search, the combined search and the create route),
  `createIndicatorsFromDhis2`, `refreshDhis2Labels`, and the repair's gatherer.
  On Ethiopia every one of them answers 400 whenever a result holds one of the
  five elements (`dL7R2PNgFmd`, `PYXHwqL1mo0`, `wEWni822Yyj`, `CA8EZIKDTry`,
  `GFOhNASU6hH`).
- The worker's pre-2.39 monthly data-set lookup, `getMonthlyDataSetIdByElement`
  in `server/dhis2/goal5_data_value_sets/get_data_value_sets_from_dhis2.ts`,
  reads the same field from the element side, so the same damage on such a
  server would fail every run that pulls by data set.
- The repair's gatherer completed on Ethiopia on 2026-10-21 and failed on
  2026-10-22 (`rollout_logs/`), so the fault appeared on a working server. The
  fix is general, not a workaround for five ids.
- The data-set side serves every link: `/api/dataSets.json` with
  `fields=id,periodType,dataSetElements[dataElement[id]]` and
  `filter=dataSetElements.dataElement.id:in:[...]` answers 200, and each of the
  five is in monthly data sets (observed on Ethiopia, 2026-10-22).
- Four by-id fetches in the server each chunk ids by 100 in their own loop
  (SYSTEM_07's open item). The fix must not add a fifth.

## 2. The model

One function in goal 2 reads, for given element ids, the data sets that hold
them, from the data-set side: the request above, `paging=false`, ids in chunks
of 100 through one shared chunked fetch, each answer reduced by a pure function
to links per asked element id. `getDataElementsFromDHIS2` drops
`dataSetElements` from its field list and attaches each element's links from
that function, so `getDhis2ElementVerdict` reads them as today and every caller
is fixed. `getMonthlyDataSetIdByElement` reads its links through the same
function. The element-side wire code for the field goes.

## 3. Rulings

1. Links come from the data-set side only, attached eagerly inside the element
   fetcher. A lazy attach would leave an empty list indistinguishable from "in
   no data set", which the verdict reads as a refusal.
2. The reduction keeps only the asked ids (an answer carries every element of
   each matching set), dedupes per element by data set id (a set holding ids
   from two chunks is answered twice), tolerates null wire fields, and gives an
   asked id absent from every answer no links.
3. `monthlyDataSetId` picks the first monthly set in data set id order, so the
   pre-2.39 selector is deterministic. An element in several monthly sets may
   pull from a different set than before, with the same values (SYSTEM_06).
4. The chunked in-filter fetch is one function in `server/dhis2/common/`,
   generalised from goal 5's `getMetadataRows` over endpoint and filter
   property, used by the links function and `getExistingMetadataIds`. The three
   `fetchByIds` copies stay with the open item.
5. _(proposed)_ The app type's field becomes
   `dataSets: { id: string; periodType: string | undefined }[]`, required, since
   the fetcher always attaches it; the verdict and `monthlyDataSetId` drop their
   `?? []`. Cost: `lib/types/indicators.ts`, `element_eligibility.ts`, and the
   fixtures of `dhis2_element_eligibility_test.ts`, `dhis2_pull_route_test.ts`
   and `dhis2_id_fix_plan_test.ts`.
6. `/api/dataSets` lists only the data sets the connection's user may read,
   where the element-side nested read did not filter. SYSTEM_07 states it: a set
   the user cannot read is, from now on, no set.
7. The proof on DHIS2 2.38 is an env-gated live test in the new test file,
   ignored unless the DHIS2 variables are set (the precedent is
   `retired_metrics_test.ts`), asserting data-set-side links equal element-side
   links for a sample. The implementer runs it against a local
   `dhis2/core:2.38.7` (as commit 674def551 did) and the 2.40 play server and
   records both runs in §8. No step runs in a production container.

## 4. Steps

### Step 1: links come from the data-set side

**Surface.** `server/dhis2/goal2_indicators/` (the new file,
`get_indicators_from_dhis2.ts`, `element_eligibility.ts`),
`server/dhis2/common/` (the shared chunked fetch),
`server/dhis2/goal5_data_value_sets/get_data_value_sets_from_dhis2.ts`,
`lib/types/indicators.ts` and the three test files of ruling 5,
`server/tests/dhis2_dataset_links_test.ts` (new, in SYSTEM_07's `globs`),
SYSTEM_07 (query idioms, element eligibility, data value sets, the open item),
and PLAN_WAIT_CLEANUP_DHIS2_ID_REPAIR.md, whose Ethiopia row names this file.

**Deliverable.** Rulings 1 to 7 in the code. `DataElementWire.dataSetElements`,
`DataSetElementsWire`, `toDataSetElements` and `DataSetElementsRow` deleted,
with the comments that name the element-side field. The new test pins the
reduction (several sets, none, an empty set, dedupe across chunks, extra
elements dropped, null fields, order) and the verdict and `monthlyDataSetId`
over reduced links. SYSTEM_07 says where links come from and why.

**Not in this step.** Any cache of links across requests. The `fetchByIds`
consolidation.

**Gates.** The floor; ruling 7's live test against 2.38.7 and 2.40.

**Ends with.** One commit, which deletes this file.

## 5. Gates catalogue

| Gate                                    | First reached |
| --------------------------------------- | ------------- |
| `deno task typecheck`                   | step 1        |
| `deno task test` (dev Postgres up)      | step 1        |
| `./validate_protocols`                  | step 1        |
| `./run`                                 | step 1        |
| ruling 7's live test on 2.38.7 and 2.40 | step 1        |

## 6. Out of scope

- The broken `DataSetElement#34601060` row on Ethiopia's server, its DHIS2
  administrator's to repair.
- Any cache of links across requests.
- Ethiopia's repair: PLAN_WAIT_CLEANUP_DHIS2_ID_REPAIR.md's Ethiopia row, gated
  on this file's deletion and the release that carries it.

## 7. Rollout and rollback

Ships in the next release through `./deploy`. Rollback is the previous image:
nothing stored changes.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-27 | 0    | Rewritten after three independent reviews: all six callers named, the links function placed in goal 2 over one shared chunked fetch, the reduction's contract and the selector's order ruled, the element-side wire code deleted, step 2 dropped as circular with the cleanup plan, the production harnesses replaced by an env-gated live test. |
