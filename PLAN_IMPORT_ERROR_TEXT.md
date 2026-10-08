# PLAN: import errors say the true cause, and the pre-launch check fails fast

Status: OPEN. Five defects found by the verification of PLAN_IMPORT_FEEDBACK on
2026-10-08, none of which changes what that plan fixed. Rulings proposed. Not
started.

The HFA zero-match message counts the staged-type questions no column matched
and calls that "questions of a staged type in the form", one short whenever the
facility id column is itself such a question. The streaming CSV reader swallows
a column-count error when it lands on the first row, so the HFA worker then
reports "0 rows read … check the facility id column", the wrong cause. The DHIS2
import wizard's pre-launch classification shows the retry wrapper's "Failed
after 1 attempts. Last error: …" as its error line, and waits on the fetcher's
two-minute default timeout per metadata call. And the refresh modal imports a
symbol it never uses.

**Next step: Review 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 2 deletes this
file.

Branch: `tim-branch` (this checkout). Repos touched: this app only.

`PLAN_IMPORT_FEEDBACK.md` on `version2` (the `wb-fastr-v2` worktree) carries the
same corrections for that branch, as amendments to its own rulings, and runs in
parallel with this plan. Neither plan reads or edits the other.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) ("Staging (phase 1)", the HFA
XLSForm bullet and the `getCsvStreamComponents` bullet; the wizard's pre-launch
sentence under "HMIS import runs"), [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md)
("Retry").

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md)
(this checkout's copy carries the two-reviews-per-step rule, 6dd76d5e1); the
app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_IMPORT_ERROR_TEXT.md."
- Branch: `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the schema, the query engine or help
  text, so no conditional gate applies.
- `deno task test` fails one test outside this plan's surface on this machine at
  the time of writing: `server/tests/mcp_context_cache_test.ts` reads a package
  that is not in this checkout
  (`_example_instance_dir/runs/37572e10-…/manifest.json`). A session records
  that result in §8 and holds the rest of the suite to the floor, as a typecheck
  error outside the Surface is reported, not fixed.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.

## 1. The problem

### 1.1 The zero-match count

`server/worker_routines/import_hfa_data_csv/stage_csv.ts:115-122` aborts staging
when no column matches a staged-type question, and its message labels
`xlsFormQuestionsNotInCsv.length` as "questions of a staged type in the form".
That list excludes a staged-type question the facility id column matched, so the
count is one short exactly when the facility id column is such a question: the
repo test's fixture (`id_fac` is a `select_one`) says "3 questions of a staged
type in the form" where the form has 4, and the Nigeria form with
`id_resp_consent` as the id column says 319 where it has 320.

### 1.2 The reader swallows a first-row error

`server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`:
`processQueue` (line 135) loops
`while (rowQueue.length > 0 ||
!parsingComplete)` and throws `processingError`
only when it finds the queue non-empty on an iteration. When the parser sets
`processingError` on a row that never reaches the queue (the column-count check
at lines 235 and 329 returns before the push) and no row was queued before it,
the loop sees `parsingComplete` with an empty queue and returns;
`await queuePromise` at line 378 resolves and nothing reads `processingError`
afterwards. A 3-column header with a 5-column first data row therefore delivers
0 rows and resolves, and the HFA worker reports "No rows could be staged from
the file (0 rows read) … Check the facility id column and filters", the wrong
cause. The same row as the second row rejects correctly with "Row 3 has 5
columns but header only has 3 columns". Verified on a patched copy during the
verification: with the check added, both orderings reject. The reader is shared
by the HMIS CSV import and the HFA import.

### 1.3 The pre-launch error line shows the retry wrapper

`server/routes/instance/datasets.ts:633-637` runs `classifyElements` with
`retryOptions: { maxAttempts: 1 }`, and
`server/dhis2/common/retry_utils.ts:60-64` wraps the last failure as
`Failed after ${opts.maxAttempts} attempts. Last error: …` whenever
`shouldRetry` allowed the error, even at one attempt. The review step's one line
then reads "Could not ask DHIS2 what the selected ids are (Failed after 1
attempts. Last error: DHIS2 request timeout after 120000ms: https://…). …".
Nothing downstream matches the "Failed after" text (grep over `server`, `lib`,
`client/src`).

### 1.4 The pre-launch check waits two minutes per call

The same route passes no `timeout`, so each metadata call takes the fetcher's
default of 120 000 ms (`server/dhis2/common/base_fetcher.ts:72`), and
`classifyElements` makes up to three in sequence. On a hanging DHIS2 the review
step's "Asking DHIS2 what the selected ids are..." line can sit for minutes. The
launch is not blocked, but the line is. The connection validation's budget for
the same kind of call is 10 s.

### 1.5 An unused import

`client/src/components/indicator_manager_hmis/refresh_dhis2_labels_modal.tsx:8`
imports `TC` from `lib` and never uses it (the import line is its only
occurrence; `tsc` does not flag unused imports here).

## 2. The model

- **The zero-match message**: the error the HFA stage leg throws when no column
  other than the facility id column matches a staged-type question.
- **The reader**: `getCsvStreamComponents` and its `processRows`, the one
  streaming CSV parser both CSV imports use. **A column-count error**: a row
  with more columns than the header, or under `strict` a different count.
- **The pre-launch classification**: the `classifyDatasetHmisDhis2Selection`
  route and the review step's call to it, one attempt, informational only.
- **The fetcher's timeout**: `FetchOptions.timeout`, the whole-request budget of
  one DHIS2 call, 120 s unless the caller sets it.

## 3. Rulings

1. **The zero-match message counts every staged-type question in the form**
   _(proposed)_:
   `[...xlsForm.questions.values()].filter((q) =>
   STAGED_QUESTION_TYPES.has(q.type)).length`,
   computed only on the abort path. The lists it samples are unchanged.
2. **The reader rejects on a column-count error whatever row it lands on**
   _(proposed)_. After `await queuePromise`, a pending `processingError` is
   thrown, so the first queued row rejects as the second does, with the
   row-numbered message the parser already builds. Pinned by a new pure test,
   `server/tests/csv_stream_reader_test.ts` (no database): under
   `allow-fewer-columns`, a 5-column first row and a 5-column second row under a
   3-column header each reject naming the row; under `strict`, a 2-column first
   row and a 2-column second row each reject; and under `allow-fewer-columns` a
   2-column row is delivered. The reader imports `exposed_env_vars`, so the test
   runs with the `.env` the test task loads.
3. **`withRetry` at `maxAttempts: 1` throws the original error** _(proposed)_.
   The wrapped "Failed after N attempts" message stays for two or more attempts.
   Pinned by a new pure test, `server/tests/dhis2_retry_test.ts`: a function
   that always throws, called through `withRetry` with `maxAttempts: 1`, rejects
   with the same error object and is called once; with
   `maxAttempts: 2, initialDelayMs: 0` it rejects with the wrapped message and
   is called twice; with a `shouldRetry` returning false it rejects with the
   original error and is called once.
4. **The pre-launch classification passes `timeout: 15000`** _(proposed)_,
   beside its `maxAttempts: 1`. The run's own classification keeps the fetcher's
   default: it has minutes and retries.
5. **No unused import** _(proposed)_: `TC` leaves the refresh modal's import
   line.
6. **Release** _(proposed)_: nothing here needs a migration or changes stored
   data; it goes out with the next release of this branch.

## 4. Steps

### Step 1: the zero-match count and the reader's swallowed error

**Surface.** `server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
`server/tests/hfa_csv_column_matching_test.ts`,
`server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`,
`server/tests/csv_stream_reader_test.ts` (new), `SYSTEM_06_ingestion.md` (its
`globs`, the `getCsvStreamComponents` bullet of "Staging (phase 1)").

**Deliverable.**

- Ruling 1 in `stage_csv.ts`, inside the `csvQuestionMappings.length === 0`
  branch:

  ```ts
  const nStagedTypeQuestions =
    [...xlsForm.questions.values()].filter((q) =>
      STAGED_QUESTION_TYPES.has(q.type)
    ).length;
  ```

  and `${nStagedTypeQuestions} questions of a staged type in the form` in the
  message. In `hfa_csv_column_matching_test.ts`, the zero-match case gains
  `assertStringIncludes(err.message, "4 questions of a staged type in
  the form");`
  beside its other assertions (lines 192-195).
- Ruling 2 in `get_csv_components_streaming_fast.ts`, after line 378:

  ```ts
  await queuePromise;
  if (processingError) {
    throw processingError;
  }
  ```

  and the new test file as ruling 2 describes it.
- `SYSTEM_06_ingestion.md`: the `globs` gain the test; the
  `getCsvStreamComponents` bullet gains "a row with more columns than the header
  (under `strict`, a different count) rejects the stream naming the row,
  whichever row it is, pinned by `server/tests/csv_stream_reader_test.ts`".

**Not in this step.** Anything DHIS2 (step 2).

**Gates.** The floor, and, green on their own,
`deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` and
`deno test -A --env-file server/tests/csv_stream_reader_test.ts`.

**Ends with.** One commit per ruling, each green.

### Step 2: the pre-launch classification fails fast and says why

**Surface.** `server/dhis2/common/retry_utils.ts`,
`server/tests/dhis2_retry_test.ts` (new), `server/routes/instance/datasets.ts`,
`client/src/components/indicator_manager_hmis/refresh_dhis2_labels_modal.tsx`,
`SYSTEM_07_dhis2.md` (its `globs` and the "Retry" exhaustion sentence, lines
104-107), `SYSTEM_06_ingestion.md` (the wizard's pre-launch sentence under "HMIS
import runs").

**Deliverable.**

- Ruling 3 in `retry_utils.ts`:

  ```ts
  if (attempt === opts.maxAttempts) {
    throw opts.maxAttempts === 1 ? lastError : new Error(
      `Failed after ${opts.maxAttempts} attempts. Last error: ${lastError.message}`,
    );
  }
  ```

  and the new test file as ruling 3 describes it.
- Ruling 4 in `datasets.ts`:

  ```ts
  const routes = await classifyElements(dataIds, {
    dhis2Credentials: credentials,
    timeout: 15000,
    retryOptions: { maxAttempts: 1 },
  });
  ```

  with the comment above it saying why both: the user waits on the review step
  for this answer, and the run classifies again when it starts.
- Ruling 5:
  `import { type Dhis2LabelRefresh, type HmisIndicator, t3 } from
  "lib";`.
- `SYSTEM_07_dhis2.md`: the `globs` gain the test; the exhaustion sentence
  becomes "On exhaustion with two or more attempts, `withRetry` throws a new
  plain `Error` (`"Failed after N attempts. Last error: …"`); at
  `maxAttempts: 1` the original error is thrown unchanged, so a single-attempt
  caller shows the fetcher's own message. The structured `status`/`responseBody`
  fields do not survive the wrapped form."
- `SYSTEM_06_ingestion.md`: the pre-launch sentence says the route asks once
  with a 15 s budget per call.

**Not in this step.** The retry classifier's substring matching (SYSTEM_07 open
item).

**Gates.** The floor, and, green on its own,
`deno test -A --env-file server/tests/dhis2_retry_test.ts`.

**Ends with.** One commit per ruling, each green.

## 5. Gates catalogue

| Gate                                                                                 | First reached |
| ------------------------------------------------------------------------------------ | ------------- |
| The floor (`deno task typecheck`, `deno task test`, `./validate_protocols`, `./run`) | every step    |
| `deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts`               | step 1        |
| `deno test -A --env-file server/tests/csv_stream_reader_test.ts`                     | step 1        |
| `deno test -A --env-file server/tests/dhis2_retry_test.ts`                           | step 2        |

## 6. Out of scope

- Classifying retries by `DHIS2FetchError.status` instead of message substrings
  (SYSTEM_07 open item).
- The HMIS CSV wizard's own messages: it gains the reader's rejection and
  nothing else.
- The `mcp_context_cache_test.ts` fixture (§0).
- Any migration.

## 7. Rollout and rollback

Nothing ships before Review 2 passes. The release is Tim's: `./deploy` from this
checkout. No migration runs and no stored data changes shape.

Rollback is `git revert` of the plan's commits on `tim-branch` and `./deploy`
again.

## 8. Build log

| Step | Row |
| ---- | --- |
| 1 | The checkout is on `main`, not `tim-branch`: `tim-branch` is an ancestor of `main`, two commits behind (the v1.76.1 changelog and this plan's own commit), so the plan's commits go on `main`. |
| 1 | §0 is stale on `server/tests/mcp_context_cache_test.ts`: it passes on this machine. `deno task test` was 150 passed, 0 failed before the step and 155 passed, 0 failed after it. |
| 1 | §1.2 undercounts the reader's callers: besides the HFA scan and the HMIS CSV stage leg it serves the HMIS indicator scan (`scan_indicator_values.ts`), structure staging (`stage_structure_from_csv.ts`, `db/instance/structure.ts`), HFA facility weights and population imports. Each now rejects a first-row column-count error as it already rejected a later one; none needed an edit. |
| 1 | Step 1 built. |
