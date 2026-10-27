# PLAN_3: the CSV reader is one sequential loop, and the weights import names the wrong column

Three defects. The streaming CSV reader turns a row callback that throws
mid-read into an uncaught promise rejection, so an import worker whose database
insert fails dies through the host's crash listener instead of its own error
path. The same reader takes each batch off its queue one `shift()` at a time,
quadratic in the rows of each chunk: about 25 seconds instead of 0.2 for a
500,000-row file. And the HFA weights import checks for repeated facility ids
before it checks that any id exists, so a wrong facility ID column is reported
as "7 facility ID(s) appear more than once", with no ids and no hint that the
column is wrong.

**Next step: Review 2.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`. Last step: 2. The review that passes
step 2 deletes this file.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (the `getCsvStreamComponents`
bullet of "Staging (phase 1)"),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) (the
**Weights** paragraph under "Facilities, admin areas, weights").

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_3_CSV_READER_AND_WEIGHTS.md." Floor as the protocol lists it, with the dev
Postgres up for `deno task test`; no step touches a migration, the schema, the
query engine or help text, so no conditional gate applies. Build log: §8.

## 1. The problem

### 1.1 The reader's queue

`getCsvStreamComponents`
(`server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`) reads 2
MB chunks, parses each onto `rowQueue`, and a detached `processQueue` loop
drains the queue to the row callback in batches. The queue exists to overlap the
next chunk's read with the callback, but the parse is synchronous on the same
thread, so the overlap buys one page-cache read per chunk. It costs: a rejection
with no handler, so a callback that throws while the loop awaits the next chunk
is uncaught (a worker registers no `unhandledrejection` listener, so the host
records "Worker crashed" and the worker's own catch never runs); a per-batch
`shift()` loop, quadratic per chunk; two 1 ms polling sleeps; a backpressure
flag that is written and never read; the parse block duplicated; and a no-op
rethrow. The callbacks that await inside are the HFA and HMIS CSV stage legs
(database inserts, in workers) and structure staging (in the main process).
Every CSV import and every wizard scan pays the queue.

### 1.2 The weights import

`importHfaFacilityWeights` (`server/db/instance/hfa_facility_weights.ts`)
checks, in order, non-positive weights, ids on more than one row (a count only),
no usable weight, and then, inside the write transaction, ids not in
`facilities_hfa`, refusing only when none is known, with a message that blames
the import order. A wrong facility ID column therefore fails on repeats first,
naming neither the ids nor the column. On Nigeria on 2026-10-08 a user picked
the file's `facility_id` column (3,974 DHIS2 codes, none an HFA facility, 7
repeated) and read "7 facility ID(s) appear more than once in the CSV."; the
file's `uid` column matched every registry id. The wizard shows the server's
message verbatim, so the wording is the whole fix.

## 2. The model

**The reader** is one sequential loop: read a chunk, cut it at the last unquoted
newline, parse the text once, `await` the callback per row, next chunk. A
throwing callback rejects `processRows` through the one await chain, there is no
batch to take, and `bytesRead` is exact. The contract (`rowIndex`, file order,
`bytesRead`) and every caller are untouched.

**The weights import** reads the file, then in one transaction reads the
registry once and checks, in order, before any write: non-positive weights; no
usable weight; unknown ids, refusing when none of the usable rows' ids is an HFA
facility, naming the column as the wizard shows it, the first ten ids and three
registry ids, and saying to check the column or import the time point's data
first (with an empty registry, only to import the time point's data first);
repeated ids, naming the first ten. A usable row has a non-blank id, seen for
the first time, with a positive weight. Weighted ids the registry lacks are
skipped and reported, as now.

## 3. Rulings

1. `processRows` loses its queue: no `processQueue`, `rowQueue`,
   `MAX_QUEUE_SIZE`, `RESUME_THRESHOLD`, `BATCH_SIZE`, `isPaused`,
   `parsingComplete`, polling or post-await re-check; one parse function
   replaces the two duplicated parse blocks. Measured on a 500,000-row file:
   about 0.2 seconds, and no slower than the queue when the callback flushes to
   a database every 10,000 rows. Pinned by two new cases in
   `server/tests/csv_stream_reader_test.ts`: a multi-chunk file read with an
   async callback that throws at row 1,000 rejects with that error; 500,000 rows
   arrive complete, in file order, each `rowIndex` its position, in under 10
   seconds.
2. The weights checks run in §2's order. The unknown-id rule is Tim's
   (2026-10-16); the weight checks move ahead of it here because the unknown-id
   check on zero usable rows would report "None of the 0 facility IDs", and the
   weight column is independent of the facility column. The registry read sorts
   by facility id for the three example ids. The comment claiming the
   in-transaction read prevents a race goes with the block it describes: it does
   not. Pinned by a new DB test,
   `server/tests/hfa_facility_weights_import_test.ts`, on the throwaway database
   pattern of `hfa_csv_column_matching_test.ts`: an empty registry; a column
   whose ids are all unknown and include a repeat; known ids with one repeated;
   a clean file with one blank weight. The partial-unknown case is already
   pinned by `hfa_round_reimport_test.ts`.
3. Nothing here needs a migration or changes stored data or a cached payload. It
   ships with the next release.

## 4. Steps

### Step 1: the reader

**Surface.** The reader, `server/tests/csv_stream_reader_test.ts`, SYSTEM_06
(the `getCsvStreamComponents` bullet).

**Deliverable.** Ruling 1. The SYSTEM_06 bullet says rows are delivered in file
order as each chunk is parsed, that a callback which throws rejects the stream
with its own error, and that the test file pins both.

**Not in this step.** The weights import. The callers' own error handling.

**Gates.** The floor, and, green on its own,
`deno test -A --env-file server/tests/csv_stream_reader_test.ts`.

**Ends with.** One commit.

### Step 2: the weights import

**Surface.** `server/db/instance/hfa_facility_weights.ts`,
`server/tests/hfa_facility_weights_import_test.ts` (new, in SYSTEM_05's
`globs`), SYSTEM_05 (the **Weights** paragraph).

**Deliverable.** Ruling 2. The Weights paragraph states the order of the checks
and what each message names.

**Not in this step.** The client weights wizard.

**Gates.** The floor with the dev Postgres up, and, green on its own,
`deno test -A --env-file server/tests/hfa_facility_weights_import_test.ts`.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                       | First reached |
| -------------------------------------------------------------------------- | ------------- |
| The floor (as PROTOCOL_APP_PLANS lists it)                                 | every step    |
| `deno test -A --env-file server/tests/csv_stream_reader_test.ts`           | step 1        |
| `deno test -A --env-file server/tests/hfa_facility_weights_import_test.ts` | step 2        |

## 6. Out of scope

- A wizard step that resolves repeated ids. Nigeria's repeats came from the
  wrong column, and 6 of its 7 repeated ids carried two different weights, so no
  rule could choose between them.
- Any migration.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. No migration runs and no stored
data changes shape. Rollback is `git revert` of the plan's commits.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-16 | 2    | The unknown-id rule rewritten by Tim before `Do 1`, after the HFA facilities work (ef6fe401f) made the weights import skip and report unknown ids and refuse only when none is known.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-27 | 0    | Rewritten after three independent reviews: the two reader patches replaced by one sequential loop with no queue (all three measured it); the weight checks ordered ahead of the unknown-id check; the branch is `main` since version2 replaced it; the stale twin-plan and panther references removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | 1    | Measured on 500,000 rows (14.9 MB) on this machine: the queue took 9.3 s with a synchronous callback and 19.4 s with a 5 ms wait every 10,000 rows; the sequential loop takes 0.16 s and 0.54 s. The plan's 25 s was another machine's figure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-27 | 1    | Papa's `error` option is a FileReader hook and never fires for string input, so the "CSV parsing error at row" path was unreachable and is gone. Papa's per-row `errors` array is ignored as before. The dev-only chunk-count and leftover-buffer logs went with the loop that produced them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-27 | 1    | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-27 | 1    | Finding (code), `get_csv_components_streaming_fast.ts` lines 57-93, pre-existing but in the Surface: the header read settles only from Papa's `step`, which `skipEmptyLines` never calls for a file of blank lines, so `getCsvStreamComponents` hangs forever (confirmed with a 2 s race); its empty-row branch is unreachable and its `error` hook never fires for string input. Edit: read the header chunk inside `try`/`finally { file.close() }`, take the first row of `parseCsvRows(headerChunk)` and throw "CSV header row is empty" when there is none, and drop the second `file.close()` in the catch, which a double close turns into "Bad resource ID". Pin with a test case: a file of three blank lines returns `success: false` with that message. |
| 2026-10-27 | 1    | Finding (prose), reader lines 129-131: the comment said what the loop does. Replaced by the reason there is no queue. Edited by the review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-27 | 1    | Finding (prose), test lines 47-48: the comment claimed the throw at row 1,000 crosses a chunk boundary; it is in the first chunk, and the size pins that later chunks are neither read nor delivered. Rewritten. Edited by the review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | 1    | Step 1 reviewed: 3 findings. Gates run by the reviewer: the test file 8 passed, typecheck green, `deno task test` 824 passed, `./validate_protocols` passed, `./run` served HTTP 200 on port 8000.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-27 | 1    | Step 1 fixed: the header chunk is read under `try`/`finally { file.close() }`, its first parsed row is the header, a file with none fails with "CSV header row is empty", pinned by a new case. Floor green: typecheck, 825 tests, `./validate_protocols`, `./run` served HTTP 200.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-27 | 1    | Seen by the re-review, outside its findings, pre-existing: a header row wider than the 64 KB first read is truncated silently (a 10,000-column header parses as 8,331 headers), before and after this step alike.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-27 | 1    | Step 1 reviewed: pass. The re-review ran the test file (9 passed), typecheck, `deno task test` (825 passed), `./validate_protocols` and `./run` (HTTP 200), and compared header parsing before and after the fix on a `:::` header, a quoted header with a newline, an empty file and a file of blank lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-27 | 2    | The test file has a fifth case beyond Ruling 2's four: a non-positive weight in a file whose facility column is all unknown refuses on the weight, which pins the order the ruling chose. The empty-registry message names neither the column nor any id, since no column could have matched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-27 | 2    | `deno.lock` gained a `jsr:@std/assert@*` entry from a review harness run with the repo config; it is not part of this step and is left unstaged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-27 | 2    | Step 2 built. Floor green: typecheck, 831 tests, `./validate_protocols`, `./run` served HTTP 200; the new test file 6 passed on its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
