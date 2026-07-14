# Plan — DHIS2 importer: speed, import ledger, auto-pull

**Status: Phase 0 COMPLETE (2026-07-14) — awaiting Tim's review before
Phase 1.** The lab (`~/projects/apps/wb-fastr-dhis2-lab`, committed) ran
E1–E9 against the real Nigeria DHIS2 with production inputs
(`facilities_hmis`, `indicators_raw`, and real failure evidence from
`dataset_hmis_versions.staging_result` — pulled per DOC_ACCESS_DBS.md).
Verdicts in the lab's `RESULTS.md`: bottleneck = fixed per-request server
think time (H1) with a (dx,pe) slow tail dying at nginx's 60s cliff (H3);
attribution = platform adds nothing, scoped-delete changes not implicated
(Nigeria returns `rows: []`, never missing-`rows`); E6 = 409 cluster is 4
stale nonexistent UIDs (config remap, no code) + 504 cluster is
valid-but-slow dx (retry-budget + shape fix); A4 lever = `ou:400 × pe:12`
(48× fewer requests, E9 correctness gate PASS); E7 incremental-sync
primitive confirmed; analytics rebuild 00:17–01:00 WAT nightly. Caveat:
lab timing is off-peak — repeat `./run e1`/`./run e8` at WAT business
hours. Next action = Tim reviews RESULTS.md, then Phase 1 (A3+A1).

Three goals, one system (S6's HMIS-DHIS2 path + S7 connector):

- **G1 — speed**: hunt down anything making imports slower than the DHIS2
  round-trips demand, and shrink the number of round-trips.
- **G2 — import ledger**: a per indicator-month record of import history
  (DHIS2 + CSV), which also makes the HMIS viewer instant.
- **G3 — auto-pull**: converge the architecture toward "the platform pulls
  everything automatically each weekend" instead of "a user babysits a
  wizard for 48 hours".

Phase 0 is a standalone **fetch lab** (A0) — extensive empirical testing
against the real Nigeria DHIS2 (Tim has credentials), in its own repo,
before any app code changes. The lab's job is to find the actual
bottleneck and answer the attribution question once and for all; any
request reshaping is conditional on what it finds. Code anatomy below
verified against `main` 2026-07-14.

## 0. The driver (Nigeria, July 2026)

From the SWAp-training thread (Rachel Neill / Josh Elaigwu, 2026-07-03 →
2026-07-13): a Q2 (Apr–Jun) all-indicators import took ~48 h over a
weekend with scattered failures; a disaggregated-indicator run sat at
~70 % for many hours over a 27 h run; failures cluster on disaggregated
indicators configured before the new disaggregated-import system. The
Ministry is frustrated, visibility is very high (all HMIS officers just
onboarded, evidence-pack training running), and the team needs to know —
with evidence — whether the slowness is the platform or Nigeria's DHIS2
before escalating to government as DHIS2-investment advocacy. Rachel has
twice asked whether our scoped-delete import changes caused a slowdown;
we owe a definitive answer, not a reassurance.

The arithmetic that frames everything: Nigeria has ~49,475 UID-shaped
facilities → 495 batches of 100 per indicator-month. 20 indicators ×
72 months ≈ 713,000 DHIS2 analytics requests for a full-history pull.
At ~1–2 min per indicator-month and 5 concurrent, that is ~24 h — before
any failure burns retry budget.

But note (Tim's framing rule for this whole plan): the total rows
fetched are identical under any request shape. Whether request COUNT
matters depends entirely on how per-request time splits between fixed
cost (connection, auth, query setup, envelope) and per-row cost (the
analytics work itself). 100 facilities × 495 requests vs 200 × 248
saves only 247 × fixed-cost — which might be ~half the wall clock or
might be noise. **Find the actual bottleneck; do not reshape for the
sake of it.** The lab's first job is the bottleneck model, and every
reshaping lever below is conditional on what it says.

Thread promises this plan should redeem: a per-indicator "last updated
on X" surface, and an in-app one-indicator-at-a-time checklist instead
of the spreadsheet Rachel keeps by hand.

## 1. Anatomy today (what the code actually does)

**Fetch** (`stage_hmis_data_dhis2/worker.ts`): work item = (raw
indicator × month). `pooledMap` with `CONCURRENT_REQUESTS = 5`; within a
work item the 495 facility batches run **sequentially**, each a separate
`getAnalyticsFromDHIS2` call (`dx:1 × pe:1 × ou:100`, `skipMeta`) with
`maxAttempts: 10, maxDelayMs: 60000` (worst case per stuck batch: ~4 min
of sleep + 10 × 120 s timeouts ≈ 24 min). A 200 response missing `rows`
fails the whole work item immediately (deliberate — scoped delete must
not treat it as empty), discarding that pair's completed batches. Values
are `parseInt`-truncated, negatives dropped. Successful pairs are
integrated later via the pair-scoped delete-then-insert (S6).

**Known bugs/warts in that path** (verified):

- The 2048-char URL guard measures a URL built with `searchParams.set`
  on the same `dimension` key three times — only the last (`ou`)
  survives, so it undercounts by the `dx`+`pe` dimensions (~40–50
  chars). It also means `FACILITY_BATCH_SIZE = 100` was tuned against a
  guess, not a measured limit (real-world servlet default is ~8 KB).
- `updateGranularProgress` is awaited after **every facility batch of
  every work item** — one UPDATE of the whole status JSON on the
  single-row `dataset_hmis_upload_attempts` table per batch. A full
  Nigeria pull ≈ 713k single-row UPDATEs (dead-tuple churn on a table
  the client also polls every 2 s; the status column is deliberately
  unindexed because the JSON exceeds btree limits). Suspect for
  progressive slowdown; needs measurement, not assumption.
- Per-pair `nRecords`/`totalCount` stats are already computed (both
  DHIS2 and CSV staging produce `periodIndicatorStats`) and then buried
  in the `step_3_result` JSON — exactly the data G2 wants, discarded.
- Work-item history in the status JSON is capped at 20 entries; failed
  pairs surface only as `failedFetches` samples. Nothing durable.

**Viewer** (`getDatasetHmisItemsForDisplay*`): `vizItems` is a full
`GROUP BY indicator, period` over `dataset_hmis` (tens of millions of
rows for Nigeria); the common view first aggregates at facility level
(heavier). Valkey-cached on `versionId + indicatorMappingsVersion`, so
every import re-pays the scan.

**State machine**: one single-row attempt per family; the wizard owns
it; only one import can exist at a time; progress is the status JSON.

## 2. WS-A — speed

**A0 — the fetch lab (Phase 0, all of it).** A new sibling repo
(`~/projects/apps/wb-fastr-dhis2-lab`) whose primary output is a
**bottleneck model** of Nigeria DHIS2 fetching — where each request's
time actually goes — and only secondarily a request shape, if the model
says shape matters. The candidate hypotheses the lab must distinguish:

- **H1 fixed-cost dominated** (analytics tables materialized; each
  request is a fast lookup + small JSON) → batching/multi-pe/LEVEL-n
  are big levers; pick one in A4.
- **H2 per-row dominated** (e.g. DHIS2 aggregating on the fly) →
  reshaping ≈ nothing; the levers are fetching LESS (incremental
  `lastUpdated`, rolling windows, E7) and DHIS2-side fixes.
- **H3 server queueing/throttling dominated** → concurrency and shape
  change nothing; the deliverable is scheduling + the advocacy note.
- **H4 analytics not materialized for some dimensions** (disaggregated
  COCs) → explains the failure cluster; fix is on Nigeria's side, with
  specifics we can hand them.

E2's latency-vs-batch-size curve separates H1/H2 (intercept = fixed
cost, slope = per-row cost); E1's TTFB-vs-body split plus E5 separates
H3; E6/E8 test H4.

Separate repo, not a folder here: national-DHIS2 credentials never
enter the platform repo (lab `.env`, never committed), and experiment
churn stays out of the deploy-gated lint/typecheck chain. The lab imports the app's
**real** connector (`fetchFromDHIS2` / `getAnalyticsFromDHIS2` via
absolute-path imports with the app's `deno.json` — the standard
verify-by-executing pattern), so measurements attribute the actual code
path, not a reimplementation. Committed artifacts: the experiment
runner, raw timing JSONs per run, and a `RESULTS.md` that records the
verdicts.

Guardrails (the lab talks to a struggling production national system):
read-only GETs only; explicit load budget (default ≤ 5 concurrent,
back off on 429/5xx, hard stop on repeated errors); every run logs its
own request count; prefer Nigeria off-peak (WAT = UTC+1; their night is
late-morning/afternoon AEST).

Measurement trap: DHIS2 caches analytics responses, so repeating the
identical request measures its cache, not its work. Samples must vary
indicator/period; deliberate repeats are their own experiment (cache
hit rate is itself useful — it bounds what a re-import costs).

The experiment matrix:

- **E1 baseline replication + attribution**: the current shape
  (`dx:1 × pe:1 × ou:100`), measured properly — time-to-headers vs
  body-read time per request, distribution across time of day and
  across indicators. (The connector doesn't expose the TTFB boundary:
  run end-to-end timings through the real connector, plus a raw-`fetch`
  variant of the same requests for the TTFB/body split — do NOT modify
  the app connector to get it.) This is the "platform vs Nigeria's
  DHIS2" verdict: if server think-time dominates, the 48 h is
  arithmetic and Rachel's advocacy note writes itself.
- **E2 batch-size sweep**: `ou:` 50/100/200/400/800 — find the real URL
  limit empirically (the in-app 2048 guard measured a broken URL) and
  the latency-vs-batch-size curve (fixed per-request cost vs per-row
  cost).
- **E3 multi-period sweep**: `pe:` 1/3/6/12 months, crossed with E2
  batch sizes; response-size growth vs round-trip savings.
- **E4 `ou:LEVEL-n`**: does Nigeria's DHIS2 serve it at all, at what
  latency/size, and does the returned facility set match the enumerated
  fetch?
- **E5 concurrency sweep**: 1/2/5/8/12 parallel — find where Nigeria
  throttles or degrades (429s, latency collapse).
- **E6 disaggregated-indicator failures** (= A5): reproduce against the
  thread's failing indicators, capture raw responses — is it
  missing-`rows` on empty operands, un-materialized analytics for those
  category combos, or something else?
- **E7 `dataValueSets` + `lastUpdated`** feasibility probe for raw data
  elements (the incremental-sync primitive for G3).
- **E8 analytics-table freshness**: check when Nigeria's analytics
  tables are rebuilt (their nightly job) — imports racing a rebuild
  would explain run-to-run variance and failure clusters.
- **E9 correctness gate**: any candidate shape must return identical
  values to E1 on a sample of indicator-months before it can win.
  Speed results without this are void — the importer deletes-then-
  inserts on the strength of these responses.

Phase 0 exit: `RESULTS.md` states the bottleneck model (which of H1–H4,
with numbers), the attribution verdict for the thread, the E6 failure
diagnosis, and — only if the model says shape matters — the winning
request shape. Everything downstream (A3 tunables, whether A4 happens
at all and which lever, C1 unit design) consumes those verdicts instead
of guesses.

**A1 — in-app instrumentation** (ships with Phase 1). Add per-batch
timing to the staging worker (fetch ms, rows, retry count, HTTP status)
rolled up per pair and persisted in the staging result + logs — the
production-run counterpart of E1, so future slowness reports come with
their own evidence.

**A2 — the regression answer.** Diff-audit of the fetch path across the
scoped-delete work (already done in outline: the only behavioral changes
were missing-`rows` → fail and the URL guard — neither slows a
*successful* fetch). E1/E6 numbers complete it; write the answer down in
the thread and here. The missing-`rows` change DID convert some
previously-"empty" pairs into failures — if E6 shows Nigeria omits
`rows` on empty analytics results, that is the disaggregated-failure
cluster and needs a distinct fix (probe, or treat missing-rows-as-empty
only when a verification re-fetch agrees), not a revert.

**A3 — quick wins** (independent, low-risk, ship as a batch):

- Throttle progress writes: time-based (≥2 s since last write — the
  client polls at 2 s anyway), always write on pair completion. Kills
  ~99 % of the single-row UPDATE traffic.
- Fix the URL guard to measure the real URL, then raise
  `FACILITY_BATCH_SIZE` to a measured-safe value (likely 300–500 →
  3–5× fewer requests). Make both the batch size and
  `CONCURRENT_REQUESTS` instance-tunable (env), so Nigeria can be tuned
  without a redeploy.
- Cap the retry budget inside staging (e.g. `maxAttempts: 3`): once
  pairs are cheap to re-run (G2 checklist / WS-C units), failing fast
  and retrying the pair later beats 24 min inside one batch.

**A4 — structural request-count levers** (measured in the lab —
E2/E3/E4/E7 — then ONE picked by the `RESULTS.md` verdict; they change
the request shape, so they land cleanest with the WS-C per-pair unit):

- **Multi-period requests**: `pe:202401;…;202412` — 12× fewer requests
  for ~80 extra URL chars; rows already carry the `pe` column. Composes
  with the batch-size raise (495 batches × 12 months → 495 requests per
  indicator-**year**). Response is 12× bigger; budget with
  `maxResponseBytes`.
- **`ou:LEVEL-n`**: one request per pair (or per indicator-year) with
  no facility enumeration at all. Needs: facility-level discovery per
  instance, filtering returned UIDs against `facilities_hmis` (returned
  set ⊇ ours), and care that the scoped-delete `fetchedFacilityIds`
  remains exactly the facility list the request *covers*. Biggest win
  (495× fewer requests) and biggest per-request DHIS2 load — measure
  whether Nigeria's DHIS2 can serve it at all before betting on it.
- **`dataValueSets` + `lastUpdated`** for raw data elements: the
  incremental-sync primitive ("give me what changed since last pull") —
  analytics only for computed indicators. This is the long-term
  auto-pull enabler; explore feasibility (operand/COC handling) but
  don't block G1 on it.

**A5 — disaggregated-indicator failures**: E6 produces the diagnosis;
A5 is the in-app fix — handle the classified cause and degrade cleanly
per pair with a ledger-visible error.

Acceptance for WS-A: a written attribution answer for the thread, and a
Nigeria indicator-year measurably down against the lab's own bottleneck
model — i.e. we captured whatever headroom the model says exists (under
H1 that could be minutes → seconds; under H2/H3 the win comes from
fetching less, and "no reshape" is a legitimate, evidenced outcome).

## 3. WS-B — the import ledger (G2)

New main-DB table, grain = **(indicator_raw_id, period_id)** — raw, not
common, because the import unit is raw and common is a cheap join
through `indicator_mappings` at read time (mirrors the viewer's
raw/common toggle):

```sql
CREATE TABLE dataset_hmis_import_ledger (
  indicator_raw_id text NOT NULL REFERENCES indicators_raw ON DELETE CASCADE,
  period_id integer NOT NULL,
  n_records integer NOT NULL,          -- facilities with data
  sum_count bigint NOT NULL,           -- service volume
  source text NOT NULL,                -- 'dhis2' | 'csv' | 'backfill'
  status text NOT NULL,                -- 'ready' | 'error'
  error text,                          -- last failure detail (status='error')
  imported_at timestamptz,             -- NULL = pre-ledger backfill
  version_id integer REFERENCES dataset_hmis_versions(id),
  PRIMARY KEY (indicator_raw_id, period_id)
);
```

- **Writers** (all inside the existing integration transaction, so the
  ledger can never disagree with the data): DHIS2 branch upserts each
  succeeded pair from its staged stats (scoped delete makes staged
  stats = final state); CSV branch recomputes each *affected* pair
  post-merge (merge keeps unmatched prior rows;
  `idx_dataset_hmis_indicator_period` makes per-pair recompute cheap);
  windowed deletes update/delete their pairs; delete-all truncates.
  Failed DHIS2 pairs upsert `status='error'` + `error` WITHOUT touching
  `n_records`/`sum_count` (no data changed).
- **Backfill migration**: seed from `GROUP BY` over `dataset_hmis`,
  `imported_at NULL`, `source 'backfill'` — "before history began" is
  honest and visible.
- **Decide with Tim**: ledger-only (latest state per pair, above) vs
  ledger + append-only `_events` audit table. Recommendation: ledger
  first; an events table is a later additive migration if the audit
  trail is wanted (writes are identical, just also-append).
- **Viewer switch**: `vizItems`, `periodBounds`, and the indicator list
  read from the ledger instead of scanning `dataset_hmis` — the raw
  view is a 1,440-row read for Nigeria, the common view a join+SUM over
  it. Existing Valkey key (`versionId + mappingsVersion`) still works;
  the cached computation just becomes trivial.
- **New UI surfaces** (the thread promises): per-cell/per-indicator
  "last imported X" in the HMIS viewer; failed pairs marked with their
  error; an indicator-level checklist view (per indicator: months
  covered, last import, failures) that replaces Rachel's spreadsheet.
  Re-import-one-indicator from that view is WS-C's unit made visible —
  don't build it twice; the checklist ships read-only until C1 lands.

HFA/ICEH are out of scope (different identity models); the ledger is
HMIS-only by design.

## 4. WS-C — toward weekend auto-pull (G3)

Target picture: per-instance subscription config — DHIS2 credentials,
raw-indicator list, rolling period window (e.g. current + previous 12
months), weekly schedule — and a runner that executes **per-pair import
units**, each unit = fetch one (indicator, month) → integrate that pair
in its own small transaction → write its ledger row. Failures don't
block other pairs; a re-run retries only `status='error'` or stale
pairs. The wizard remains for ad-hoc/backfill work and becomes an
enqueuer over the same units.

What that demands of today's system, in dependency order (each step is
independently valuable *now*):

- **C1 — the per-pair import unit.** Restructure the DHIS2 path from
  monolithic stage-all-then-integrate-all to fetch+integrate per pair
  (the scoped-delete semantics are already pair-scoped; the staging
  table for the DHIS2 branch becomes per-pair in-memory or a tiny
  transient table). A 48-hour run that dies at hour 40 keeps 40 hours
  of work, visible in the ledger. This is where the A4 request-shape
  levers land cleanest. Version records move to one per *run*, not per
  pair (decide: minted at run start or end).
- **C2 — an import-runs table instead of the single-row status blob.**
  `dataset_hmis_import_runs` (id, trigger user|schedule, selection,
  started/ended, pair counts) + the ledger as per-pair progress. The
  wizard's progress view reads run + ledger; the hot single-row JSON
  rewrite dies entirely (finishes what A3's throttle started). The
  single-row attempt table remains only for the CSV wizard's
  step-config state.
- **C3 — instance-level stored DHIS2 credentials.** Forces the at-rest
  encryption ruling that S5/S6/S7 have each deferred (currently
  plaintext in attempt rows). A scheduled pull cannot ask a user to
  retype a password, so this ruling is now on the critical path.
- **C4 — the scheduler.** `main.ts` already runs daily `setInterval`
  jobs (log cleanup, project purge); add a weekly instance-config-gated
  trigger that enqueues a run from the subscription, with a lock
  against concurrent manual runs, jittered start, and failure
  notification (channel TBD: email vs in-app banner vs both).
- **C5 — downstream freshness** (note only, out of scope): a scheduled
  pull bumps the dataset version; results-runs staleness surfaces it.
  Whether anything re-generates automatically is a separate ruling.

Open decisions for Tim before WS-C build: credentials-at-rest
encryption approach; events table (WS-B); version-record grain (C1);
auto-pull default on/off per instance; notification channel (C4).

## 5. Sequencing

1. **Phase 0 — the fetch lab** (A0, all experiments E1–E9): a new
   sibling repo, extensive testing against the real Nigeria DHIS2, zero
   app changes. Exits with `RESULTS.md`: the bottleneck model (H1–H4),
   attribution verdict + advocacy note for the thread (A2), the E6
   failure diagnosis, and the request shape only if the model says
   shape matters. Bootstrap instructions: §6.
2. **Phase 1 — quick wins** (A3 + A1): throttle, guard fix +
   lab-measured batch-size raise, retry budget, tunables, in-app
   instrumentation.
3. **Phase 2 — ledger** (WS-B): table + writers + backfill + viewer
   switch + read-only checklist/last-updated UI.
4. **Phase 3 — request shape + units** (chosen A4 lever + C1 + C2).
5. **Phase 4 — auto-pull** (C3 + C4).

Each phase ships alone. **This plan is the status tracker**: when a
phase completes, record it in a `Status` block at the top of this file
(commit to main) — no other tracking home. Delete this plan when
Phase 4 lands; if the work stalls earlier, fold the remainder into
SYSTEM_06/07 Open items.

## 6. Bootstrap — starting Phase 0 cold

For an agent starting with nothing but this file:

1. **Read first**: §1 above (importer anatomy);
   [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) (the connector: fetcher,
   retry, timeouts, `maxResponseBytes`); the fetch loop itself,
   `server/worker_routines/stage_hmis_data_dhis2/worker.ts`
   (`fetchIndicatorPeriod` is the shape being replicated in E1).
2. **Create the lab repo**: `~/projects/apps/wb-fastr-dhis2-lab`,
   `git init`, private. Layout: `experiments/e1_baseline.ts` … one
   script per experiment; `results/` for raw timing JSONs (committed);
   `RESULTS.md` (verdicts, kept current every session); `.env`
   (gitignored) with `DHIS2_URL`, `DHIS2_USERNAME`, `DHIS2_PASSWORD` —
   **ask Tim for the Nigeria credentials; never commit them, never
   print them**.
3. **Import the real connector** — do not reimplement it. Run lab
   scripts with the app's config so its import map resolves:
   `deno run --allow-all -c /Users/timroberton/projects/apps/wb-fastr/deno.json experiments/e1_baseline.ts`,
   importing via absolute paths, e.g.
   `import { getAnalyticsFromDHIS2 } from "/Users/timroberton/projects/apps/wb-fastr/server/dhis2/goal3_analytics/mod.ts"`.
4. **Shared harness before first experiment**: a `runExperiment`
   helper that owns the load budget (≤ 5 concurrent, backoff on
   429/5xx, hard stop after ~20 consecutive failures), stamps every
   request with timings (TTFB, body ms, bytes, rows, HTTP status,
   retry count), and writes one JSON per run into `results/`.
5. **Inputs for realistic sampling**: pull the facility-UID list and
   raw indicator ids the same way the worker does (query the Nigeria
   instance DB if reachable, else `/api/organisationUnits.json` for
   UID-shaped facility ids; the maternal/newborn-death UIDs
   `ss0TObFWNpb`, `PJQ5Qd8OPck`, `zU82h583KJ8` are known-good test
   indicators, and Josh's priority-indicator CSV from the thread is
   available from Tim). Sample across indicators AND periods (cache
   trap above).
6. **Run E1 → E9 in order**, writing each verdict into `RESULTS.md`
   as it lands. E9 (correctness vs baseline) gates any shape
   recommendation. Phase 0 makes **zero changes to the wb-fastr app
   repo**.
7. **Exit**: `RESULTS.md` answers — bottleneck model (H1–H4), the
   attribution paragraph for Rachel's thread, the E6 diagnosis, and
   the shape recommendation (or explicit "shape doesn't matter, go
   incremental"). Then update this plan's Status block and stop for
   Tim's review before Phase 1.
