# PLAN: the CSV reader survives a throwing callback and reads in linear time, and the weights import names the wrong column

Status: OPEN. Three defects found while closing PLAN_IMPORT_ERROR_TEXT and
diagnosing a Nigeria weights import on 2026-10-09. Rulings proposed. Not
started.

The streaming CSV reader turns a row callback that throws mid-read into an
uncaught promise rejection, so an import worker whose database insert fails
dies through the host's crash listener instead of its own error path. The same
reader takes each batch off its queue one `shift()` at a time, which costs time
quadratic in the rows of each 2 MB chunk: 29 s instead of 0.25 s for a
500,000-row file. And the HFA weights import checks for repeated facility ids
before it checks that the ids exist, so a wrong facility ID column is reported
as "7 facility ID(s) appear more than once", with no ids and no hint that the
column is wrong.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 2 deletes this
file.

Branch: `main` (this checkout). Repos touched: this app only.

`PLAN_CSV_READER_AND_WEIGHTS.md` on `version2` (the `wb-fastr-v2` worktree)
carries the same three rulings for that branch and runs in parallel with this
plan. Neither plan reads or edits the other.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (the `getCsvStreamComponents`
bullet of "Staging (phase 1)"),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) (the
**Weights** paragraph under "Facilities, admin areas, weights").

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_CSV_READER_AND_WEIGHTS.md."
- Branch: `main`. PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides it
  because this checkout works on `main`, which `tim-branch` trails.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the schema, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.

## 1. The problem

### 1.1 A row callback that throws mid-read is an uncaught rejection

`server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`:
`processQueue` catches a callback error, stores it in `processingError` and
rethrows (lines 170-173), so `queuePromise` (line 178) rejects. Nothing handles
`queuePromise` until `await queuePromise` (line 378), after the read loop ends.
When the callback throws while the loop is awaiting the next chunk, the
rejection has no handler and Deno treats it as uncaught:

- a script dies with "error: Uncaught (in promise)" before its caller's `catch`
  runs, and a test file fails every test in it;
- an import worker registers no `unhandledrejection` listener, so its error
  event reaches the host's crash listener, which records the run's error as
  "Worker crashed: Uncaught (in promise) Error: …"
  (`server/db/instance/dataset_hfa_import_runs.ts:272`,
  `server/db/instance/dataset_hmis_import_runs.ts:688`) and the worker's own
  `catch` never runs;
- in the main server process, `main.ts:298` logs it as `[unhandledrejection]`
  and the caller still receives the error at `await queuePromise`.

The callbacks that can throw mid-read are the two CSV stage legs, which await a
database insert inside the callback
(`server/worker_routines/import_hfa_data_csv/stage_csv.ts:254`,
`server/worker_routines/import_hmis_data_csv/stage_csv.ts:201`). Verified on
2026-10-09 with a scratch `deno test`: a 6 MB file read with an async callback
that throws at row 1,000 fails the file with "Uncaught error … (in promise)
Error: db flush failed"; with a no-op handler attached to `queuePromise` the
read rejects with that error and the test passes.

### 1.2 Taking a batch off the queue costs time quadratic in a chunk's rows

`processQueue` takes each batch with up to 1,000 `rowQueue.shift()` calls
(lines 146-151). Each 2 MB chunk is parsed onto the queue in one go, and each
`shift` on an array that long moves every remaining element, so a chunk costs
time quadratic in its row count, and short rows (more rows per chunk) cost
most. Measured on 2026-10-09 with a no-op callback: 500,000 rows of `id,v`
(about 6 MB) took 29.4 s with the loop and 0.24 s with
`const batch = rowQueue.splice(0, BATCH_SIZE);`; 2,000,000 HMIS-shaped rows
(a 58 MB file) took 21.6 s and 1.1 s. Every caller of the reader pays it: the HMIS and
HFA CSV imports, structure staging, population and weights imports.

### 1.3 The weights import reports a symptom of the wrong column

`server/db/instance/hfa_facility_weights.ts`: `importHfaFacilityWeights`
(line 119) checks, in order, non-positive weights (line 180), facility ids on
more than one row (line 186, a count only), no usable weight (line 192), and
then, inside the write transaction, facility ids not in `facilities_hfa`
(line 212, the count and the first ten ids). A wrong facility ID column
therefore usually fails on repeats first, with a message that names neither the
ids nor the column.

On Nigeria on 2026-10-08 a user picked the weights file's `facility_id` column:
3,974 distinct DHIS2-style codes, none of them an HFA facility id, 7 of them on
two rows each. The message was "7 facility ID(s) appear more than once in the
CSV." The file's `uid` column matches all 3,989 registry ids (`1` to `3989`),
and neither message would have pointed there.

`SYSTEM_05_facilities_indicators.md` (the **Weights** paragraph) also says
unknown facility ids reject the file pre-transaction; the code checks them
inside the transaction.

## 2. The model

- **The reader**: `getCsvStreamComponents` and its `processRows`, the one
  streaming CSV parser every CSV import uses. **A throwing callback**: a row
  callback passed to `processRows` that throws or rejects.
- **The queue**: `rowQueue`, the parsed rows waiting for the callback. **A
  batch**: up to `BATCH_SIZE` rows taken off it at once.
- **The weights import**: `importHfaFacilityWeights`. **The registry**:
  `facilities_hfa`. **A usable row**: a row whose facility id is non-blank, seen
  for the first time, with a positive weight. **An unknown id**: the facility id
  of a usable row that is not in the registry. **A repeated id**: a non-blank
  facility id on more than one row.

## 3. Rulings

1. **A throwing callback rejects `processRows` with its own error**
   _(proposed)_. `queuePromise.catch(() => {});` on the line after
   `const queuePromise = processQueue();`, with a comment saying the rejection
   is read at `await queuePromise`. Pinned by a new case in
   `server/tests/csv_stream_reader_test.ts`: a file of at least 6 MB (more than
   one chunk) read with an async callback that throws at row 1,000 rejects with
   that error.
2. **A batch leaves the queue in one splice** _(proposed)_. Lines 146-151
   become `const batch = rowQueue.splice(0, BATCH_SIZE);`. Pinned by a new case
   in the same file: 500,000 rows of `id,v` arrive complete and in file order,
   each `rowIndex` equal to its position, and the read takes under 10 s (about
   0.25 s after the change, about 29 s before).
3. **The weights import checks unknown ids first, and its messages say what to
   fix** _(proposed)_. After the file is read, one transaction reads the
   registry once and checks, in this order, before any write:
   1. Unknown ids. With an empty registry: "There are no HFA facilities yet.
      Import the HFA facilities before their weights." Otherwise:
      `` `${nUnknown} of the ${nUsable} facility IDs in column "${header}" are not HFA facilities. First: ${first ten}. HFA facility IDs look like: ${three}. Check that you chose the right facility ID column.` ``,
      where `header` is the column's header text, `nUsable` counts the usable
      rows and `three` is the first three registry ids in sort order.
   2. Non-positive weights, message unchanged.
   3. Repeated ids:
      `` `${n} facility ID(s) appear more than once in the CSV. First: ${first ten}.` ``
   4. No usable weight, message unchanged.

   The transaction then replaces the time point's weights as now. The checks
   that ran before the transaction, and the second registry read, go. Messages
   stay English-only, as every message of this importer is. Pinned by a new
   database test, `server/tests/hfa_facility_weights_import_test.ts`, on a
   throwaway database built from `_main_database.sql` as
   `hfa_csv_column_matching_test.ts` builds one, with its CSVs written to
   `_ASSETS_DIR_PATH` under unique names and removed afterwards:
   - an empty registry rejects with the empty-registry message;
   - with facilities `1`, `2`, `3`, a column whose ids are all unknown and
     include a repeat rejects with the unknown-id message naming the column,
     `3 of the 3` and `1, 2, 3`, and writes nothing;
   - one unknown id among two known ones rejects with `1 of the 3`;
   - known ids with one repeated rejects naming the repeated id;
   - a clean file with one blank weight imports the other rows and reports one
     skipped row.
4. **Release** _(proposed)_: nothing here needs a migration or changes stored
   data or a cached payload; it goes out with the next release from this
   checkout.

## 4. Steps

### Step 1: the reader

**Surface.** `server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`,
`server/tests/csv_stream_reader_test.ts`, `SYSTEM_06_ingestion.md` (the
`getCsvStreamComponents` bullet of "Staging (phase 1)").

**Deliverable.**

- Ruling 1 in the reader, after line 178:

  ```ts
  const queuePromise = processQueue();
  // Read at `await queuePromise`; without a handler, a callback that throws
  // mid-read is an uncaught rejection.
  queuePromise.catch(() => {});
  ```

  and its test case.
- Ruling 2 in the reader, lines 146-151:

  ```ts
  const batch = rowQueue.splice(0, BATCH_SIZE);
  ```

  and its test case.
- `SYSTEM_06_ingestion.md`: the `getCsvStreamComponents` bullet gains "A row
  callback that throws rejects the stream with its own error, and a batch
  leaves the queue in one splice, so a chunk costs time linear in its rows;
  both pinned by the same test file."

**Not in this step.** The weights import (step 2). The callers' own error
handling.

**Gates.** The floor, and, green on its own,
`deno test -A --env-file server/tests/csv_stream_reader_test.ts`.

**Ends with.** One commit per ruling, each green.

### Step 2: the weights import

**Surface.** `server/db/instance/hfa_facility_weights.ts`,
`server/tests/hfa_facility_weights_import_test.ts` (new),
`SYSTEM_05_facilities_indicators.md` (its `globs` and the **Weights**
paragraph's last sentence).

**Deliverable.**

- Ruling 3 in `importHfaFacilityWeights`, with its test file.
- `SYSTEM_05_facilities_indicators.md`: the `globs` gain the test; the
  **Weights** paragraph's last sentence becomes "After the file is read, one
  transaction reads `facilities_hfa` once and rejects the whole file before any
  write, checking in order: facility ids that are not HFA facilities (naming the
  column, the first unknown ids and three registry ids), non-positive weights,
  ids on more than one row (naming the first ten), and a file with no usable
  weight. Pinned by `server/tests/hfa_facility_weights_import_test.ts`."

**Not in this step.** The client weights wizard.

**Gates.** The floor, and, green on its own,
`deno test -A --env-file server/tests/hfa_facility_weights_import_test.ts`.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                                 | First reached |
| ------------------------------------------------------------------------------------ | ------------- |
| The floor (`deno task typecheck`, `deno task test`, `./validate_protocols`, `./run`) | every step    |
| `deno test -A --env-file server/tests/csv_stream_reader_test.ts`                     | step 1        |
| `deno test -A --env-file server/tests/hfa_facility_weights_import_test.ts`           | step 2        |

## 6. Out of scope

- A step in the weights wizard that resolves repeated ids. The Nigeria repeats
  came from the wrong column, and 6 of its 7 repeated ids carry two different
  weights, so no rule could choose between them.
- Pre-selecting the facility ID column in the weights wizard.
- The two `SYSTEM_07_dhis2.md` sentences and the `launchDatasetHmisDhis2Run`
  comment that Review 2 of PLAN_IMPORT_ERROR_TEXT found wrong: prose, not code.
- Any migration.

## 7. Rollout and rollback

Nothing ships before Review 2 passes. The release is Tim's: `./deploy` from this
checkout. No migration runs and no stored data changes shape.

Rollback is `git revert` of the plan's commits on `main` and `./deploy` again.

## 8. Build log

| Step | Row |
| ---- | --- |
