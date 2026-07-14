# Plan — DHIS2 importer: speed, import ledger, auto-pull

Three goals, one system (S6's HMIS-DHIS2 path + S7 connector):

- **G1 — speed**: hunt down anything making imports slower than the DHIS2
  round-trips demand, and shrink the number of round-trips.
- **G2 — import ledger**: a per indicator-month record of import history
  (DHIS2 + CSV), which also makes the HMIS viewer instant.
- **G3 — auto-pull**: converge the architecture toward "the platform pulls
  everything automatically each weekend" instead of "a user babysits a
  wizard for 48 hours".

The first work item is exploration/instrumentation, not code changes.
Code anatomy below verified against `main` 2026-07-14.

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
any failure burns retry budget. Request count is the enemy; per-request
latency is (mostly) DHIS2's.

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

**A1 — instrument first.** Add per-batch timing to the staging worker
(fetch ms, rows returned, retry count, HTTP status) rolled up per pair
(min/median/max batch ms, retries, failures) and persisted in the
staging result + logs. This is cheap, ships alone, and produces the
attribution evidence: if median batch time is 1–2 s of DHIS2 server
time, the 48 h is arithmetic, not platform overhead — that's the
advocacy note Rachel needs. If DB-write or scheduling gaps between
batches are material, we found a platform bug.

**A2 — answer the regression question definitively.** Diff-audit of the
fetch path across the scoped-delete work (already done in outline: the
only behavioral changes were missing-`rows` → fail and the URL guard —
neither slows a *successful* fetch). Pair with A1 numbers from the next
Nigeria run and write the answer down (in the thread and here). The
missing-`rows` change DID convert some previously-"empty" pairs into
failures — investigate whether Nigeria's DHIS2 omits `rows` on empty
analytics results; if so that is the disaggregated-failure cluster
(A5) and it needs a distinct fix (probe, or treat missing-rows-as-empty
ONLY when a verification re-fetch agrees), not a revert.

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

**A4 — structural request-count levers** (explore on a real DHIS2, then
pick; these change the request shape, so they land cleanest with the
WS-C per-pair unit):

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

**A5 — disaggregated-indicator failures**: reproduce against the
pre-new-system indicators from the thread, classify (missing-`rows` on
empty operands? analytics tables not materialized for those COCs?), fix
or degrade cleanly per pair with a ledger-visible error.

Acceptance for WS-A: a Nigeria indicator-year measurably down (target:
≤ 5 min with A3 alone, ≤ 1 min with a chosen A4 lever), and a written
attribution answer for the thread.

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

1. **Phase 0 — explore & attribute** (A1, A2, A5 repro): instrument,
   run against Nigeria, write the attribution answer + advocacy note.
   No behavior changes beyond logging/persisted timings.
2. **Phase 1 — quick wins** (A3): throttle, guard fix + batch-size
   raise, retry budget, tunables.
3. **Phase 2 — ledger** (WS-B): table + writers + backfill + viewer
   switch + read-only checklist/last-updated UI.
4. **Phase 3 — request shape + units** (chosen A4 lever + C1 + C2).
5. **Phase 4 — auto-pull** (C3 + C4).

Each phase ships alone. Delete this plan when Phase 4 lands; if the
work stalls earlier, fold the remainder into SYSTEM_06/07 Open items.
