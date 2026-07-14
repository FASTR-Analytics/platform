# Plan — DHIS2 importer: speed, import ledger, auto-pull

**Status (2026-07-14): Phases 0–2 complete; Phases 3–4 not started.
Next action = Phase 3 (§5.3 — the fetch dispatcher §4.4 + per-pair
units C1/C2 §7).**

- Phase 0 = the fetch lab; all verdicts in §2.
- Phase 1 shipped `da4f6a7d` — worker quick wins + per-pair
  instrumentation; as-built notes in §4.1/§4.3.
- Phase 2 shipped `d191fb3f` — the import ledger end-to-end; as-built
  notes in §6/§6.1. Verified empirically against the dev DB (backfill
  parity, raw-vizItems byte-parity, writers exercised in rolled-back
  transactions).
- Adversarial review of Phases 1–2: two independent reviewers run
  2026-07-14. Core mechanics and the ledger invariant (every
  `dataset_hmis` mutation path maintains the ledger in-transaction)
  independently confirmed. 7 findings triaged → 5 confirmed and fixed
  in `49d36776` (error-string cap applied at source;
  URL-guard errors classified permanent; ledger writers skip indicators
  deleted between staging and integration instead of FK-aborting the
  whole integration; non-facility-scoped deletes also sweep zero-count/
  error ledger rows from the window; "Before import tracking began"
  label no longer shown for never-imported failing pairs), 1 documented
  (`pairFetchStats` timing = wall time incl. retry sleeps), 1 deferred
  by design (per-run instrumentation retention in version rows →
  C2's runs table, see §4.1). All fixes re-verified empirically
  (rolled-back-transaction harness) + typecheck green.

Outstanding non-code items:

- §2.6 daytime lab runs (needs WAT business hours; zero app code).
- Nigeria comms: Tim pastes the A2 attribution paragraph (delivered to
  Tim 2026-07-14; §4.2) and the 6-stale-id remap ask (§2.2).
- Deploy: Phases 1–2 take effect only after a server restart/deploy
  (migration 056 runs at startup; the dev DB already has it from the
  verify harness — idempotent no-op).

Tim has ruled the Phase 3 architecture: the **fetch dispatcher** (§4.4)
— dataValueSets-primary, analytics only for computed indicators.
Standing directive from Tim: **where a decision is unclear, take the
most robust option, even at the cost of more work.** Rulings made under
that directive are marked *(robustness ruling)*.

A fresh agent continuing this work: read §1 for the as-built system,
§2 for the evidence base, §3 for the ruled architecture, then execute
the next unfinished phase in §5 (specs: §4.4 for the dispatcher, §7 for
per-pair units/auto-pull, §6.1 for the per-phase UI surfaces).
Everything needed is in this file or linked from it. This plan is the
status tracker — when a phase completes, update the Status block above
(commit to main). Delete the plan when Phase 4 lands; if work stalls,
fold remainders into SYSTEM_06/07 Open items.

Three goals, one system (S6's HMIS-DHIS2 path + S7 connector):

- **G1 — speed**: imports bounded by what Nigeria's DHIS2 genuinely
  requires, not by our request arithmetic.
- **G2 — import ledger**: a per (raw indicator, month) record of import
  history (DHIS2 + CSV), which also makes the HMIS viewer instant.
- **G3 — auto-pull**: the platform pulls everything automatically each
  weekend instead of a user babysitting a wizard for 48 hours.

## 0. The driver (Nigeria, July 2026)

From the SWAp-training thread (Rachel Neill / Josh Elaigwu, 2026-07-03 →
2026-07-13): a Q2 (Apr–Jun) all-indicators import took ~48 h over a
weekend with scattered failures; disaggregated-indicator runs sat at ~70%
for many hours; the Ministry is frustrated and visibility is high. Rachel
twice asked whether our scoped-delete changes caused the slowdown. Phase 0
settled that (§2.1: no — and the evidence is written down). Thread
promises to redeem: a per-indicator "last updated on X" surface and an
in-app one-indicator-at-a-time checklist replacing Rachel's spreadsheet
(both = WS-B).

## 1. Anatomy today (as-built after Phases 1–2; verified against `main` 2026-07-14)

**Fetch** (`server/worker_routines/stage_hmis_data_dhis2/worker.ts`):
work item = (raw indicator × month). `pooledMap` concurrency from env
`DHIS2_CONCURRENT_REQUESTS` (default 5); within a work item the facility
batches run sequentially — batch size from env
`DHIS2_FACILITY_BATCH_SIZE` (default **400**, measured-safe §2.3) → 124
batches for Nigeria's 49,473 UID-shaped facilities — each batch a
separate `getAnalyticsFromDHIS2` call (`dx:1 × pe:1 × ou:N`, `skipMeta`)
with `maxAttempts: 3`; 4xx (except 429) is never retried (connector
`shouldRetry`), so a 409 on a stale dx fails the pair instantly. The URL
guard measures the **real** URL via `buildUrl` against a 7,000-char
limit (nginx cliff ~8 KB; a 400-facility batch is ~5,740 chars).
Progress writes to the single-row attempt table are throttled to ≥2 s
(the client polls at 2 s), force-written on pair completion. A 200
response missing `rows` still fails the work item (deliberate; §2.1 —
Nigeria never omits `rows`). Values are `parseInt`-truncated, negatives
dropped. Per-pair instrumentation (`pairFetchStats`: requests, retries,
totalFetchMs, maxRequestMs, rowsFetched, route, errorKind) is persisted
in the staging result — the production counterpart of lab E1.
`failedFetches` is the **complete** failure list (uncapped; error
strings capped at 1,000 chars) and every entry carries
`errorKind: "permanent" | "transient"` (4xx≠429 vs everything else).
The staged result JSON (`step_3_result`, copied onto
`dataset_hmis_versions.staging_result`) carries `periodIndicatorStats`,
`failedFetches`, `succeededWorkItems`, `fetchedFacilityIds`,
`pairFetchStats`.

**Integration** (`server/worker_routines/integrate_hmis_data/worker.ts`):
scoped delete-then-insert for DHIS2 results carrying the delete scope,
legacy merge for CSV. The same transaction writes the **import ledger**
(below) — succeeded pairs recomputed from `dataset_hmis`, failed DHIS2
pairs upserted as `status='error'`.

**Import ledger** (`dataset_hmis_import_ledger`, main DB — the G2
deliverable, Phase 2): one row per (raw indicator, month) — `n_records`,
`sum_count`, `source` (`dhis2|csv|backfill`), `status` (`ready|error`),
`error` (prefixed `[permanent]`/`[transient]`), `imported_at`
(NULL = pre-ledger backfill), `version_id`. Written **inside every
transaction that mutates `dataset_hmis`** (both integration branches;
windowed/full deletes reconcile) so it can never disagree with the
data. Writers + read fn: `server/db/instance/dataset_hmis_import_ledger.ts`.
Served raw by `getDatasetHmisImportLedger` (GET, `can_view_data`,
uncached; ~1,440 rows for Nigeria).

**Viewer** (`getDatasetHmisItemsForDisplay*`): `vizItems`, indicator
lists, and `periodBounds` read the **ledger** (`WHERE n_records > 0`),
not `dataset_hmis`. Raw view is byte-identical to the old GROUP BY
(verified on dev DB); common view is a mappings join+SUM — its `count`
is the summed raw record count, which diverges from the old
distinct-facility count only where several raws map to one common id
(ruled, §6). Valkey cache prefix bumped `ds_hmis` → `ds_hmis_v2`;
keying (`versionId + indicatorMappingsVersion`) unchanged.

**Ledger UI** (§6.1 Phase 2, shipped): "Import status by indicator"
button in the HMIS admin sidebar → read-only checklist (one row per raw
indicator: months-with-data vs window, last import date+source, failed
months; failures-first default sort, all columns sortable) → per-month
detail (status incl. "Checked — no data" / "Never imported", records,
sum, source, imported_at, classified error). Components:
`client/src/components/instance_dataset_hmis/_import_ledger.tsx` +
`_import_ledger_indicator.tsx`. Per-cell import info lives here — the
main viz grid is a panther figure, not a custom table, so cell metadata
was not injected there.

**State machine**: unchanged — one single-row attempt per family; the
wizard owns it; only one import can exist at a time; progress is the
(now throttled) status JSON. Phase 3's C2 replaces this for DHIS2 runs.

**Connector** (S7, `server/dhis2/`): unchanged — one base fetcher
(`fetchFromDHIS2`/`getDHIS2`) owning auth/timeout(120 s spanning body
read)/retry (`withRetry`, classifies by message substring; never
retries 4xx except 429); analytics via
`goal3_analytics/getAnalyticsFromDHIS2`. See SYSTEM_07_dhis2.md.

## 2. Phase 0 verdicts (the evidence base — lab, real Nigeria DHIS2)

Lab repo: `~/projects/apps/wb-fastr-dhis2-lab` (commits `9341fe9`,
`a35b87b`). Ran 2026-07-14 03:20–05:00 WAT (off-peak) against
`https://dhis2nigeria.org.ng/dhis` (2.40.9) using **production inputs**
pulled per [DOC_ACCESS_DBS.md](DOC_ACCESS_DBS.md): `facilities_hmis`
(49,473 UID-shaped ids), `indicators_raw` (96 dx), and real failure
records from `dataset_hmis_versions.staging_result` v59/v60. Credentials
live only in the lab's gitignored `.env` (from Tim; never commit, never
print). **Caveat: all timing is off-peak; production runs face daytime/
weekend load where the slow tail is fatter.**

### 2.1 Bottleneck model + attribution (E1/E2/E5)

- Every analytics request's time is ~100% server think time: TTFB = total
  at all percentiles, bodies 0–4 ms / ~1.4 KB. Raw p50 786 ms, mean
  3.3 s, p90 14.8 s (prod indicator mix, ou:100). Think time has a
  ~0.4–1 s floor, does **not** scale with `ou` batch size or rows
  returned, and swings 0.4 s → 160 s driven by (dx, pe) — the national
  data volume/partition behind the query, not our request shape.
- Slow queries die at **~60 s as nginx 504** (their `proxy_read_timeout`;
  observed repeatedly at exactly ~60 s). Real run v59: pair-duration p50
  4.8 min; one v60 pair took 1.8 h and succeeded.
- No concurrency throttling: 12 parallel at night → zero 429s, no
  latency collapse. The server is not rate-limiting us.
- **Attribution (Rachel's question): the platform is exonerated.** The
  scoped-delete changes did not slow successful fetches; the
  missing-`rows`→fail change is not implicated at all (Nigeria 2.40.9
  always returns `rows: []` for empty results — zero missing-`rows`
  cases in all lab traffic). The 48 h is arithmetic: ~713k requests ×
  think time + retry burn. A2 = write this into the thread
  (paragraph delivered — §4.2; Tim's paste is the outstanding item).

### 2.2 The failure clusters (E6, from real v59/v60 failures)

1. **409 "Dimension is present in query without any valid dimension"**
   (56+38 occurrences): exactly 4 dx ids — `lp4vfvVhXfz`, `tupwLqIxPPo`,
   `mcLi3dvV3fm`, `nVDvjFIxwqV` — which **404 on every DHIS2 metadata
   endpoint: they do not exist**. Stale config; correct operand
   replacements (`p6aVCk9aN6S.zbr2vnRNwAW`/`.YW7OzKBM90D`) already sit in
   `indicators_raw`. E10 metadata census found **2 more latent stale ids**:
   `O82o1WlMisO`, `lyVV9bPLlVy` (6 total). Deterministic, instant, fails
   every run. Fix = config remap in the Nigeria instance (comms item,
   Phase 1) + dispatcher `unknown` handling (§4.4).
2. **504 retry-exhaustion** (44): valid dx (`YjZiHDKMWCJ` Live Births +
   operands, `wGPpop3rz7i` Inpatient Admissions, `w6nOgEFHWMG`,
   `YWNyZu9wR89`) whose analytics queries take 5–160 s and cross the 60 s
   cliff under load; at the time, 10 retries × up-to-60 s ≈ 24 min per
   batch burned (Phase 1 capped retries at 3).
   All returned correct data off-peak. **Retry-rescue is dead** (E10): an
   identical repeat 504s again and a 12-min-later retry re-paid 46 s of
   fresh compute — no completed-computation cache. The escape is the
   dataValueSets path (§2.4), not retry policy.
   Anomaly worth handing to Nigeria: `wGPpop3rz7i` has almost no stored
   facility-month data (6 values nationwide in 202605) yet costs the
   analytics engine 45–60 s per query.

### 2.3 Shape facts (E2/E3/E4/E9)

- Real URL limit: nginx 414 above ~8 KB (measured: 5,727-char URL OK,
  11,327 rejected). `ou:400` is measured-safe. The then-current in-app
  2048 guard + batch 100 was ~4× too conservative (fixed in Phase 1:
  real-URL guard at 7,000 chars, batch 400).
- `ou:400 × pe:12` returns values **byte-identical** to the baseline
  shape (E9 gate PASS, incl. operand dx) — 48× fewer requests per
  indicator-year. Still rides the analytics engine, so it is now only
  the fallback lever for the analytics leg of the dispatcher.
- `ou:LEVEL-5` works (rooted variant returned 17,218 OUs, all ∈ our
  facility list; 101/101 values matched) but one dense indicator-month
  took 56 s — cliff-adjacent. Not recommended.

### 2.4 dataValueSets can replace analytics for everything but 2 dx (E7/E10)

- Census of all 96 configured dx: **76 bare data elements + 16 operands
  (`base.coc`) + 2 computed DHIS2 indicators** (`joWyNIq0XtY`
  "X_Antenatal 1st visit - Total", `sq1t1xsNl1J` "X_Deliveries - Total"),
  plus 6 nonexistent (§2.2). Only the 2 computed indicators need the
  analytics engine.
- One `GET /api/dataValueSets.json?dataElement={base}&orgUnit={root}&
  children=true&startDate=…&endDate=…` covers the **whole country for a
  month in one request**: ANC = 37,957 values / 21,353 facilities /
  11.4 MB / **1.3 s TTFB** (22 s total = transfer); Live Births (a
  504-cluster dx!) = 31,877 values / 9.6 MB / **1.7 s TTFB**. Per
  indicator-month that is 22–41 s total vs ~5 min–2 h (or
  never-completes under load) via analytics — and ~1000× less server
  compute for Nigeria.
- `children=true` descends to facility level (verified: returned OUs are
  facility UIDs in our list). Values carry `period`, `orgUnit`,
  `categoryOptionCombo`, `attributeOptionCombo`, `value`, `lastUpdated`
  (the G3 incremental-sync key). All observed periods were monthly.
- **Parity gate: 300/300 facilities identical** — client-side
  sum(value) across COC×AOC == the analytics value (ANC 202605, three
  spread batches). Analytics is derived from the same datavalue table,
  so it cannot know values dataValueSets lacks.
- Live fragility contrast: mid-lab (~04:30 WAT) the analytics engine
  went 100%-504 for `ou:400` shapes and served ANC `ou:100` at 16–18 s,
  while concurrent dataValueSets pulls held 1–2 s TTFB. Different server
  path, independent health.

### 2.5 Operational facts (E8)

Analytics tables rebuild nightly **00:17–01:00 WAT** (43 min runtime).
Weekend auto-pull should start after ~01:15 WAT. `./run e8` appends to a
freshness log — keep sampling other hours/days to confirm the schedule.

### 2.6 Phase 0 loose ends (cheap, fold into Phase 1/3 work)

- Re-run `./run e1` and `./run e8` during WAT business hours (the
  daytime tail is the missing distribution; ~40 read-only requests).
- The full per-element parity gate (§4.4 gate) before Phase 3 cutover.
- `wGPpop3rz7i` anomaly + stale-id list → Nigeria comms/advocacy note.

## 3. Architecture ruling (Tim, 2026-07-14): the fetch dispatcher

Not analytics-reshape *or* dataValueSets — a **dispatcher** inside the
fetch step that routes each raw indicator by its DHIS2 metadata type.
DHIS2-side aggregation is arithmetic we can do ourselves (sum across
COC×AOC); we only need the analytics engine where a formula lives
(computed indicators). Both routes emit the **same output contract** —
staged rows `(facility_id, indicator_raw_id, period_id, count)` + pair
stats — so integration, scoped delete, the ledger, and the UI never know
which route fetched. Design details in §4.4.

## 4. Workstreams

### 4.1 A1 — in-app instrumentation (SHIPPED, Phase 1 `da4f6a7d`)

Per-request timing in the staging worker (fetch ms, rows, retry count,
HTTP status, route taken) rolled up per pair, persisted in the staging
result + logs — the production counterpart of lab E1, so future slowness
reports arrive with their own evidence.

*As built*: `pairFetchStats: Dhis2PairFetchStat[]` on
`DatasetDhis2StagingResult` (additive optional field — no migration or
cache impact); retries counted via the connector's `onRetry` hook; HTTP
status lives in the error string + `errorKind`; timing is wall time per
batch call including retry sleeps (bounded by the retry cap); `route` is
`"analytics"` until the dispatcher adds a second route. Error strings
are capped at 1,000 chars at the source. Known cost (accepted, review
2026-07-14): `pairFetchStats` rides into every
`dataset_hmis_versions.staging_result` copy (~300 KB per clean Nigeria
run) and the versions-list route ships full staging results to the
client — same order as the pre-existing
`succeededWorkItems`/`periodIndicatorStats` payload. C2's runs table
(Phase 3) is the designed durable home for per-run instrumentation;
when C2 lands, strip `pairFetchStats` from the version copy like
`fetchedFacilityIds` is stripped today.

### 4.2 A2 — the regression answer (DELIVERED 2026-07-14)

Write §2.1's attribution verdict into the thread (Rachel/Josh), with the
advocacy-note material for the Ministry/DHIS2 team: the slow-dx list and
the `wGPpop3rz7i` anomaly, the 60 s `proxy_read_timeout` (ask: raise for
`/api/analytics`, or fix the slow queries), the nightly rebuild window,
and the 6 stale indicator ids to remap instance-side (§2.2). Done = a
paragraph Tim can paste, stored nowhere else (one tracking home: this
plan's Status block records A2 done/not-done).

*Status*: paragraph written and handed to Tim 2026-07-14; pasting it to
the thread is Tim's outstanding comms item (Status block).

### 4.3 A3 — quick wins (SHIPPED, Phase 1 `da4f6a7d`)

- **Throttle progress writes**: time-based (≥2 s since last write — the
  client polls at 2 s), always write on pair completion. Kills ~99% of
  the single-row UPDATE traffic.
- **Fix the URL guard** to measure the real URL, then raise
  `FACILITY_BATCH_SIZE` to **400** (measured-safe, E9-gated). Make batch
  size and `CONCURRENT_REQUESTS` env-tunable so instances can be tuned
  without redeploy.
- **Cap the retry budget** at `maxAttempts: 3` (from 10). §2.2: retries
  never rescue a pathological query; failing fast + re-running the pair
  later (ledger, WS-B/C) beats 24 min of sleep inside one batch.
- **Treat analytics 409 as permanent**: fail the pair immediately with
  the error recorded, zero retries (it is a deterministic config error).
- These land in today's worker; the dispatcher (Phase 3) supersedes some
  of it, but Phase 1 is cheap, de-risks the current path for all
  instances, and the tunables/instrumentation/409 handling carry over.

*As built*: all four items as specified. Env tunables =
`DHIS2_FACILITY_BATCH_SIZE` / `DHIS2_CONCURRENT_REQUESTS` (documented in
`.env.example`). Note the connector's default `shouldRetry` already
refused to retry 4xx≠429, so "409 permanent" was largely pre-existing —
the commit adds the explicit permanent/transient classification
(`classifyFetchError`) that the ledger stores.

### 4.4 A4 — the fetch dispatcher (Phase 3 core)

At the start of a run, classify every selected raw indicator with two
batched metadata requests (as lab E10 does):
`/api/dataElements.json?filter=id:in:[…]` and
`/api/indicators.json?filter=id:in:[…]` over the distinct base ids
(operands split on `.`). Classification is **dynamic per run** — no
stored type field to maintain; fleet-generic by construction
*(robustness ruling: metadata is the source of truth, config can't
drift)*. Routes:

1. **Bare data element** → dataValueSets route.
2. **Operand `base.coc`** (base is a data element, coc exists) →
   dataValueSets route on the base, filtered to that COC. Indicators
   sharing a base element share one pull.
3. **Computed DHIS2 indicator** → analytics route (keep the engine for
   formulas; do NOT hand-reconstruct numerators
   *(robustness ruling: formulas belong to DHIS2)*).
4. **Unknown / 404** → no fetch; pair recorded as permanent
   ledger-visible error ("not found in DHIS2") so stale config is loud
   instead of a silent per-run failure tax.
5. **Non-monthly data detected** (see below) → analytics route for that
   element *(robustness ruling: never silently sum weekly/daily values
   into months ourselves — DHIS2's period-allocation rules apply and the
   analytics engine implements them)*.

**dataValueSets route** (per base element × period window):

- `GET /api/dataValueSets.json?dataElement={base}&orgUnit={root}&children=true&startDate={window}&endDate={window}`
  through the S7 base fetcher (`maxResponseBytes` cap ~100 MB, timeout
  300 s, streamed read).
- Root org unit: discovered per instance (level-1 org unit), cached.
- **Window sizing, adaptive** *(robustness ruling)*: start with a
  3-month window; if the response exceeds the byte cap or times out,
  halve the window (min 1 month); if a 1-month response still exceeds
  the cap, split by level-2 org-unit subtree (state) and merge. Never
  fail a pair on size without having tried the splits.
- Client-side reduce: keep rows where `orgUnit` ∈ the instance's
  UID-shaped `facilities_hmis` set AND `period` matches an expected
  monthly id (`^\d{6}$` within the selection); skip `deleted: true`
  values; for bare elements sum `Number(value)` across COC×AOC per
  (facility, month); for operands restrict to the COC first. Preserve
  existing integration semantics (parseInt truncation, negatives
  dropped) so the dispatcher changes *where* numbers come from, not what
  they mean. **Any non-monthly period id observed → mark the element
  non-monthly, discard the pull, re-route to analytics (rule 5) and
  record a ledger warning.**
- Scoped delete: the pull covers the entire facility list, so
  `fetchedFacilityIds` = the full UID-shaped list — simpler and more
  correct than today's batch bookkeeping.
- Empty result (`dataValues` absent/empty on 200): legitimate empty
  month — stage zero rows, mark pair succeeded with `nRecords: 0`
  (unlike analytics missing-`rows`, this endpoint's empty shape is
  unambiguous; verified in E7/E10).

**Analytics route** (computed indicators + rule-5 elements): today's
batched fetch with Phase 1's fixes (batch 400, retry cap 3, 409
permanent). Optionally fold in `pe:12` multi-period (E9-gated) if the
analytics leg is ever a measurable share of a run — with 2 of 96 dx it
is not; don't build it speculatively.

**Cutover gate** *(robustness ruling — two layers)*:

1. **Lab pre-flight**: extend lab E9/E10 to run the DVS-vs-analytics
   parity comparison over **every** classified element (not a sample) on
   ≥2 months, plus the ⊇-coverage assertion (every analytics value has a
   DVS-derived counterpart). Minutes of runtime; gate must be green
   before the dispatcher ships to any instance.
2. **In-app shadow verification, first run per instance**: the first
   dispatcher run on an instance cross-checks a random sample of pairs
   (~5%) against the analytics value and records the comparison in the
   run result. Mismatch → the pair fails loudly with both numbers.
   Remove the shadow mode once the fleet has run clean (one-time
   operational step, not a permanent shim).

### 4.5 A5 — failure handling (Phase 1+2 part SHIPPED; dispatcher rule 4 remains)

409/404 → permanent per-pair error, ledger-visible, no retry (shipped:
retry cap + permanent/transient classification in Phase 1, ledger
visibility in Phase 2; the dispatcher's rule 4 completes it). 5xx/timeout → transient: fail the pair after the capped
retries; re-runs happen at pair granularity via WS-B/WS-C, ideally
scheduled off-peak (§2.5). Plus the Nigeria comms item: remap/remove the
6 stale ids instance-side.

## 5. Sequencing (each phase ships alone; update Status on completion)

1. **Phase 1 — DONE (`da4f6a7d`)** — quick wins + instrumentation + the
   answer (A3 + A1 + A2): worker fixes (throttle, guard fix + batch 400,
   retry cap 3, 409 permanent, env tunables), per-pair timing
   instrumentation, thread attribution paragraph. Still outstanding from
   this phase: the §2.6 daytime lab runs and the Nigeria comms
   (Status block).
2. **Phase 2 — DONE (`d191fb3f`)** — ledger (WS-B, §6): table plus
   writers, backfill, viewer switch, and the read-only checklist /
   "last imported" UI.
3. **Phase 3 — NEXT** — dispatcher + per-pair units (§4.4 + C1 + C2,
   §7): restructure to per-pair fetch+integrate, runs table, dispatcher
   as the fetch step, cutover gates green (lab pre-flight parity gate
   BEFORE shipping, then first-run shadow verification per instance).
   Also ships the §6.1 Phase 3 UI (checklist actions + run view).
4. **Phase 4 — auto-pull** (C3 + C4, §7): stored credentials
   (encrypted), weekly scheduler, off-peak window, failure surfacing.
   Plus the §6.1 Phase 4 UI (subscription config + failure banner).

## 6. WS-B — the import ledger (G2) — SHIPPED (Phase 2, `d191fb3f`)

Built as specified below, with the as-built deviations listed after the
spec (all robustness-driven or ruled; all verified on the dev DB).

New main-DB table, grain = **(indicator_raw_id, period_id)** — raw, not
common, because the import unit is raw and common is a cheap join through
`indicator_mappings` at read time (mirrors the viewer's raw/common
toggle):

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
  succeeded pair from its staged stats (scoped delete makes staged stats
  = final state); CSV branch recomputes each *affected* pair post-merge
  (`idx_dataset_hmis_indicator_period` makes that cheap); windowed
  deletes update/delete their pairs; delete-all truncates. Failed DHIS2
  pairs upsert `status='error'` + `error` WITHOUT touching
  `n_records`/`sum_count` (no data changed). Error text should carry the
  dispatcher's classification (permanent-config vs transient-server).
- **Backfill migration**: seed from `GROUP BY` over `dataset_hmis`,
  `imported_at NULL`, `source 'backfill'`.
- **Ledger-only, no events table** *(ruled)*: latest state per pair; an
  append-only `_events` audit table is a later additive migration if an
  audit trail is ever wanted (writes are identical, just also-append).
- **Viewer switch**: `vizItems`, `periodBounds`, and the indicator list
  read from the ledger instead of scanning `dataset_hmis` — the raw view
  becomes a ~1,440-row read for Nigeria, the common view a join+SUM over
  it. Existing Valkey key (`versionId + mappingsVersion`) still works;
  the cached computation becomes trivial.
HFA/ICEH are out of scope (different identity models); the ledger is
HMIS-only by design.

**As built** (deviations from the spec above, deliberate):

- **Counts are recomputed from `dataset_hmis` inside the transaction**
  for BOTH branches — not copied from staged stats. Staged stats miss
  rows outside the fetch's facility scope that survive a scoped delete
  (e.g. CSV-imported facilities with non-UID ids), so recompute is
  strictly more correct; the per-pair LATERAL rides
  `idx_dataset_hmis_indicator_period` *(robustness ruling)*.
- Pair lists: scoped DHIS2 = `succeededWorkItems` (including zero-row
  pairs → `n_records 0`, "checked, empty" — real information); merge
  branch (CSV, and legacy DHIS2 results lacking the delete scope) =
  `SELECT DISTINCT … WHERE version_id = new version`.
- Failed-pair upserts touch only `status` + `error` (counts,
  `imported_at`, `source`, `version_id` untouched — no data changed);
  a never-imported failed pair gets a zero-count `error` row with
  `imported_at NULL`. `error` is prefixed `[permanent]`/`[transient]`
  (the classification the plan asked the text to carry).
- Both writer INSERTs JOIN `indicators_raw` and skip pairs whose
  indicator was deleted between staging and integration — without this
  the FK aborts the whole integration and the fetch is lost (review fix
  `49d36776`; skipping matches the CASCADE end-state).
- **`failedFetches` is uncapped** (was a 100-sample; per-error strings
  capped at 1,000 chars at source) so the ledger records every failed
  pair.
- Deletion: `deleteAllDatasetHmisData` is windowed (there is no separate
  truncate path in the app) — affected pairs are captured before the
  DELETE, then reconciled: emptied pairs lose their ledger row,
  partially-deleted pairs keep their last-import identity with corrected
  counts. Non-facility-scoped deletes ALSO sweep the window's
  zero-count/error ledger rows (which have no `dataset_hmis` rows and
  are invisible to the data scan); facility-scoped deletes leave them
  (review fix `49d36776`).
- Viewer reads filter `WHERE n_records > 0` so zero-count/error-only
  rows are checklist information, not data cells; the Valkey prefix was
  bumped `ds_hmis` → `ds_hmis_v2` because the common-view `count`
  semantics changed (summed raw records vs distinct facilities — equal
  except where several raws map to one common id).
- Module: `server/db/instance/dataset_hmis_import_ledger.ts` (writers +
  read fn); migration `056_dataset_hmis_import_ledger.sql`; route
  `getDatasetHmisImportLedger`.

### 6.1 UI surfaces (this plan is NOT backend-only — these are the thread promises)

All read from the ledger (+ C2 runs table in Phase 3); the ledger's
`(indicator_raw_id, period_id) → imported_at, source, status, error` is
exactly "when was the last successful fetch of this indicator-month".
Client home: the HMIS dataset components (viewer + wizard) under
`client/src/components/` — follow PROTOCOL_UI_STRUCTURE for placement.

**Phase 2 (read-only) — SHIPPED (`d191fb3f`):**

- **HMIS viewer, per-cell**: each (indicator, month) cell exposes its
  ledger row — imported_at ("last imported 12 Jul 2026"), source
  (dhis2/csv/backfill), and error state. Failed pairs get a distinct
  visual state with the stored error on hover/inspect; `backfill` rows
  ("before history began") show as such rather than pretending a date.
- **HMIS viewer, per-indicator**: rollup of the row — months covered,
  latest imported_at, count of failed months.
- **Indicator checklist view** (replaces Rachel's spreadsheet): one row
  per raw indicator — months covered vs expected window, last import
  date+source, failing months with classified errors (permanent-config
  "not found in DHIS2" vs transient-server), sortable so "what needs
  attention" floats up. Read-only in Phase 2.

*As built*: all three surfaces live in one place — the "Import status
by indicator" view (HMIS admin sidebar → checklist table, failures
first → click an indicator → per-month detail with status, counts,
source, imported_at, and the classified error). Per-cell info was NOT
injected into the main viz grid: that grid is a panther figure
(`ChartHolder` table mode), not a custom component, so the month-detail
table is the per-cell surface. Only true backfill rows render "Before
import tracking began" — never-imported failing pairs show "Never
imported" (review fix `49d36776`). Components: `_import_ledger.tsx` /
`_import_ledger_indicator.tsx`; strings inline `t3` en/fr/pt.

**Phase 3 (actions + runs, ships with dispatcher/C1/C2):**

- **Checklist actions**: "re-import this indicator" and "retry failed
  pairs" buttons enqueue per-pair units — the checklist is WS-C's unit
  made visible; don't build a second re-import surface.
- **Run view**: wizard progress switches from the status-JSON poll to
  run + ledger reads (live per-pair progress, per-pair errors as they
  land, partial results visible if a run dies mid-way), plus a run
  history list (who/what/when, pair counts, per-run outcome) from
  `dataset_hmis_import_runs`.

**Phase 4 (auto-pull visibility):**

- Subscription config UI (per-instance: on/off, indicator list, rolling
  window, schedule) and an in-app banner + checklist/run-history
  surfacing when a scheduled pull fails or partially fails.

All new strings translated (en/fr/pt) per DOC_TRANSLATION.md.

## 7. WS-C — per-pair units and weekend auto-pull (G3)

Target: per-instance subscription config — DHIS2 credentials, raw
indicator list, rolling period window (e.g. current + previous 12
months), weekly schedule — and a runner executing **per-pair import
units**: fetch one (indicator, month) via the dispatcher → integrate that
pair in its own small transaction → write its ledger row. Failures don't
block other pairs; re-runs retry only `status='error'` or stale pairs.
The wizard remains for ad-hoc/backfill work as an enqueuer over the same
units.

- **C1 — the per-pair import unit.** Restructure the DHIS2 path from
  monolithic stage-all-then-integrate-all to fetch+integrate per pair
  (scoped-delete semantics are already pair-scoped; the DHIS2 staging
  becomes per-pair in-memory or a tiny transient table). Note the
  dispatcher's DVS route naturally fetches one *element × window* that
  covers many pairs — the unit boundary is (pair) for integration and
  ledger writes even when one fetch feeds several units. A 48-hour run
  that dies at hour 40 keeps 40 hours of work, visible in the ledger.
  **Version-record grain** *(ruled)*: one `dataset_hmis_versions` row per
  run, minted at run **end**, skipped entirely if zero pairs succeeded
  (no empty versions; in-progress visibility belongs to C2's runs table).
- **C2 — an import-runs table** replacing the single-row status blob for
  DHIS2 runs: `dataset_hmis_import_runs` (id, trigger user|schedule,
  selection, started/ended, pair counts) + the ledger as per-pair
  progress. The wizard's progress view reads run + ledger; the hot
  single-row JSON rewrite dies (finishing what A3's throttle started).
  The single-row attempt table remains only for the CSV wizard's
  step-config state.
- **C3 — instance-level stored DHIS2 credentials, encrypted at rest**
  *(ruled: plaintext is not acceptable)*: encrypt with a key from
  instance env (e.g. AES-GCM via WebCrypto; key never in the DB), decrypt
  only in the worker at fetch time. This also retires the plaintext
  copies in attempt rows (S5/S6/S7 have each deferred this ruling — it is
  now on the critical path and settled in principle; pick the exact
  primitive during C3 build).
- **C4 — the scheduler.** `main.ts` already runs daily `setInterval`
  jobs; add a weekly instance-config-gated trigger that enqueues a run
  from the subscription, with a lock against concurrent manual runs,
  jittered start inside the off-peak window (after ~01:15 WAT for
  Nigeria — post-rebuild, §2.5; window per instance TZ), and failure
  surfacing. **Auto-pull default OFF per instance** *(ruled)*;
  notification = in-app banner + run/ledger visibility first, email
  later if wanted *(ruled: no new external dependency for v1)*.
- **C5 — downstream freshness** (note only, out of scope): a scheduled
  pull bumps the dataset version; results-runs staleness surfaces it.
  Whether anything re-generates automatically is a separate ruling.

## 8. The lab (kept; extend rather than re-derive)

`~/projects/apps/wb-fastr-dhis2-lab` — sibling repo so national-DHIS2
credentials and experiment churn never enter this repo. It imports the
app's **real** connector via absolute paths and runs under this repo's
`deno.json` (`./run e1 … e10`, see its README). Guardrails: read-only
GETs, ≤5 concurrent default, backoff on 429/5xx, hard stop after 20
consecutive server-stress failures, every run logs request count; DHIS2
caches analytics responses, so never time a repeated identical request.
Inputs are prod-DB-first (README documents the pull commands per
DOC_ACCESS_DBS.md). Known future lab work: §2.6 daytime runs; the full
per-element parity gate (§4.4); DVS backfill window sizing if Phase 3
wants data (~10 MB per dense element-month; 72-month history ≈ 10–20 GB
transfer, chunked by the adaptive window).
