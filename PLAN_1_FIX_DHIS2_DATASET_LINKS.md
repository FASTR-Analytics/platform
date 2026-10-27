# PLAN: read each DHIS2 element's data sets from the data-set side

## 0. Bindings

PROTOCOL_APP_PLANS, with one override. Branch: `main`, because Tim commits to
the current branch and `main` is the release branch.

**Next step: Do 1.** Each session sets this line in its final commit. Last
step: 2. The session that finishes step 2 deletes this file.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md)
(element eligibility, decomposition, data value sets),
[PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) (Safety).

## 1. The problem

Ethiopia's DHIS2 (2.40.1) cannot serve five elements' data-set links from the
element side. Any `dataElements` request whose field list carries
`dataSetElements` and whose result holds one of them answers 400. The body is
the elements up to the failing one, then:

```
No row with the given identifier exists: [org.hisp.dhis.dataset.DataSetElement#34601060]
(through reference chain: org.hisp.dhis.dataelement.DataElement["dataSetElements"])
```

The five are `dL7R2PNgFmd` (`diarrhea_treat`), `PYXHwqL1mo0` (`New_ART`), and
`wEWni822Yyj`, `CA8EZIKDTry`, `GFOhNASU6hH` (the three MTCT elements). The same
elements without `dataSetElements` answer 200, and they import, since a pull by
data element never reads that field. On 2026-10-22, read-only:

- The dictionary picker's element search answers 400 for any search whose
  results hold one of the five ("ORS and zinc", "newly started on ART").
- The DHIS2 id repair cannot plan `ethiopia`: its gatherer fetches every element
  with the picker's field list.
- The data-set side serves every link: `/api/dataSets.json` with
  `fields=id,periodType,dataSetElements[dataElement[id]]` and
  `filter=dataSetElements.dataElement.id:in:[...]` answers 200, and each of the
  five is in monthly data sets.

The worker's monthly data-set lookup for a pre-2.39 server
(`getMonthlyDataSetIdByElement`) reads the same field from the element side, so
the same damage on such a server would fail every run that pulls by data set.

## 2. The model

One function reads, for given element ids, the data sets that hold them, from
the data-set side: the request above, ids in chunks of 100 like every id filter,
each answer reduced to `dataSetElements` per element id (`id` and `periodType`
of each data set). Element fetches drop `dataSetElements` from their field list
and attach each element's links from that function, so `DHIS2DataElement` keeps
its shape and `getDhis2ElementVerdict` reads it as today. The attach lives
inside the element fetchers, so every caller (the picker's three searches, the
decomposition's operand fetch, the repair's gatherer) is fixed with no change of
its own. `getMonthlyDataSetIdByElement` reads its links through the same
function.

## 3. Rulings

None. The fix changes how links are read, not what any caller receives.

## 4. Steps

### Step 1: links come from the data-set side

**Surface.** `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts`,
`server/dhis2/goal5_data_value_sets/get_data_value_sets_from_dhis2.ts`, the new
function's file where SYSTEM_07's layout puts it,
`server/tests/dhis2_dataset_links_test.ts` (new, added to SYSTEM_07's manifest),
SYSTEM_07 (element eligibility, data value sets).

**Deliverable.**

- The function of §2, exported from `server/dhis2/mod.ts`, with the reduction
  from a data-set answer to links per element a pure function beside it.
- `getDataElementsFromDHIS2` and `searchDataElementsFromDHIS2` request no
  `dataSetElements` and return every element with its links attached; an element
  in no data set has none, as today.
- `getMonthlyDataSetIdByElement` takes its links from the same function.
- SYSTEM_07 says where links come from and why.

**Gates.**

- The new test pins the pure reduction: an element in several data sets, an
  element in none, a data set with no elements, and the verdict of an element
  whose links come from it.
- A read-only harness inside `ethiopia`'s container, through its stored
  connection: the picker's search "ORS and zinc" returns elements, and the five
  elements come back with monthly links and an accepted verdict.
- The same harness inside `mauritanie`'s container proves the filter on DHIS2
  2.38.
- The floor.

**Ends with.** One commit.

### Step 2: the release

Not code. Ships with the next release. On the release image, inside `ethiopia`'s
container, the DHIS2 id repair's `plan` completes, and the picker's search "ORS
and zinc" returns elements. Ethiopia's repair is then planned and applied as the
DHIS2 id repair's own plan says. The session records both in §8.

## 6. Out of scope

- The broken `DataSetElement#34601060` row on Ethiopia's server, which is its
  DHIS2 administrator's to repair.
- Any cache of links across requests.

## 7. Rollout and rollback

Step 1 ships in the next release through `./deploy`. Rollback is the previous
image: nothing stored changes.

## 8. Build log

| When | Step | Row |
| ---- | ---- | --- |
