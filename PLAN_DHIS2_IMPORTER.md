# Plan — DHIS2 importer: speed, import ledger, auto-pull

**Status (2026-07-14): Phases 0–3 complete, twice adversarially
reviewed, everything on main: Phase 3 (`d267c39f`), review round 1
fixes (`86f87385`), review round 2 fixes + the single-month-pulls
ruling (`136870c6`). The LAB IS RETIRED (Tim's ruling, 2026-07-14
evening): trust the evidence already gathered (E9/E10/E12 parity —
§2.4, §2.8 — plus e11's partials with zero hard mismatches ever
observed); the e11 gate run was halted INCOMPLETE (checkpoint kept,
resumable if ever wanted) and no further lab work should be spent.
The in-app first-run shadow verification + circuit breaker (§4.4
gate 2) is the remaining cutover protection — it runs on every
instance's first dispatcher run regardless. E12 settled the
range-vs-`period=` question (§2.8). Phase 4 (auto-pull) not started.
Next action = Phase 4 (§5.4 — C3 encrypted credentials + C4 scheduler
with a per-instance SETTABLE off-peak schedule, §7).**

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
- Phase 3 built 2026-07-14 — the fetch dispatcher (§4.4) + per-pair
  units C1/C2 (§7) + Phase 3 UI (§6.1); as-built notes in §1 (rewritten
  to the new anatomy), §4.4, §6.1, §7. Verified empirically the same
  day: DB layer 14/14 checks (migration 057, single-running claim,
  startup sweep, summary round-trip, enumeration/chunking/date helpers),
  per-pair integration SQL 7/7 (rolled-back transaction — scoped delete
  respects the snapshot, ledger recompute includes out-of-scope
  survivors), a REAL run end-to-end against Nigeria's DHIS2 on the
  dev DB 13/13 (launch claim, worker lifecycle, metadata
  classification, rule-4 permanent ledger errors, zero-success ⇒ no
  version minted, scope-table cleanup), and a full server boot with
  all 249 registry routes validated live.
- **Phase 3 adversarial review run 2026-07-14** (two independent
  reviewers, same pattern as Phases 1–2). Core invariants independently
  confirmed: launch-claim atomicity, ledger-vs-data on every path,
  cancel non-resurrection, DVS/analytics number-parity mechanics,
  credential handling, CSV worker's loud refusal of DHIS2 staging.
  All substantive findings verified against the code and fixed in
  `86f87385`:
  1. **Version-keyed cache poisoning** — the lazily-minted version id
     was visible to readers mid-run while per-pair integration kept
     changing data under it, so a mid-run viewer visit froze partial
     vizItems in Valkey (`ds_hmis_v2`) + client IndexedDB under a key
     that never changed at run end. Fix: running-run versions are now
     hidden from ALL version readers (`getVersionsForDatasetHmis`,
     `getCurrentDatasetHmisMaxVersionId/Version`, datasets summary) so
     the cache token flips exactly once, at run end — and the display
     route neither reads nor writes its cache while a run is active
     (mid-run reads compute live; "partial results visible" preserved).
     Minting paths compute MAX(id) inline (CSV integrate switched off
     the now-excluding reader).
  2. **Unbounded window enumeration** — launch iterated every integer
     from startPeriod to endPeriod on the request thread (Zod only
     checked int; the deleted wizard step's guard was not reproduced);
     a huge endPeriod would freeze the whole server. Fix: bounds
     validated in `enumerateRunPairs` (valid period ids, start ≤ end).
  3. **Cancel killed the wrong run** — the route terminated the current
     worker before checking the given runId was the running run; a
     stale tab cancelling a finished run silently killed the live one.
     Fix: conditional status flip first, terminate only on a match.
  4. **Ethiopian-calendar data wipe** — DVS `startDate`/`endDate` are
     Gregorian arithmetic on instance-calendar period ids, so on an
     Ethiopian instance the window is ~7.5 y off and "successful empty"
     pulls would scoped-delete real data. Fix: non-Gregorian instances
     force every pair to the analytics route (pre-Phase-3 semantics,
     calendar-consistent `pe:` passthrough); rule-4 loudness kept.
  5. **Run↔CSV exclusion race** — only the run side re-checked after
     its claim. Fix: CSV staging/integrate now re-check the run guard
     post-claim too (claim reverted to error + loud throw). The
     run-launch-mid-windowed-delete direction stays unclaimed by
     design: a mint collision aborts exactly one side loudly and the
     ledger recompute self-heals (documented at the delete).
  6. **Interrupted runs lied in version history** — cancel/crash/sweep
     left the mint-time placeholder (0 rows) on the version row. Fix:
     shared `finalizeInterruptedDatasetHmisRunVersion` recomputes
     counts from `dataset_hmis` + stats from the ledger on every exit
     path (cancel route, worker catch, host crash listener, db_startup
     sweep), and zero-success versions are deleted outright — the "no
     empty versions" ruling now holds even on the
     mint-committed-then-first-pair-failed edge and at natural
     completion.
  7. **Shadow verification hardened** — ≥3 hard-mismatch pairs now
     abort the run before the unsampled ~95% integrates (was
     canary-only: a systematic DVS≠analytics divergence would have
     integrated and scope-deleted everything unsampled);
     `shadow_passed` is keyed to the DHIS2 URL (repointing the instance
     re-arms shadow); mismatch records carry a hard/soft discriminator;
     analytics responses with rows but unrecognized headers are a
     failed fetch (both legs), and in shadow "analytics-unavailable"
     rather than a wall of false mismatches; `shadow_passed` stays NULL
     when a run had no DVS pairs.
  8. Smaller: `versionPromise` resets on mint failure (a transient mint
     error no longer poisons every later pair while the fetch burns
     on); worker-spawn failure releases the launch claim; the
     worker-crash path now fires the datasets SSE notify (via
     onComplete); DOC_WORKER_ROUTINES routines table updated
     (import_hmis_data_dhis2 replaces the deleted stage_hmis_data_dhis2);
     `dataset_hmis_import_runs.ts` claimed in SYSTEM_06 (Phase 3 had
     landed with the lint:systems gate red — typecheck chains it).
  Verified: full typecheck + lint:systems green; 14/14 empirical
  harness checks on the dev DB (enumeration guard incl. instant-throw
  timing, reader exclusion live-toggled, both finalize paths,
  idempotency). Reviewed-and-left-as-is (deliberate):
  `getDatasetHmisImportRuns` exposes triggeredBy email + DHIS2 URL at
  `can_view_data` (surface if Tim wants it `can_configure_data`);
  `failPair`'s ledger write stays best-effort; DVS
  missing-`dataValues`-on-200 = legitimate empty (plan-ruled, E7/E10).
- **Round-2 adversarial review of the fix batch (86f87385) run
  2026-07-14** — two fresh independent reviewers; all round-1 fixes
  independently confirmed sound (reader-exclusion coverage, minting
  sites, run↔CSV Dekker pattern, cancel fix, calendar force, zero-success
  FK ordering, shadow abort mechanics). Round-2 findings all fixed in a
  second batch (the commit carrying this Status update), each verified
  on the dev DB (6/6 new harness checks + round-1 14/14 rerun):
  1. `addDatasetHmisToProject` had no run guard — attaching HMIS to a
     project mid-run exported torn per-pair-mutating data stamped with
     the settled version id. Now refuses while a run is active (also
     turns the confusing first-ever-import "Cannot get hmis version"
     into the clear message).
  2. Cancel racing the first pair's in-flight COMMIT could FK-abort the
     zero-success version delete and leave a placeholder version visible
     forever — `finalizeInterruptedDatasetHmisRunVersion` now re-reads
     and falls through to the recompute branch (bounded retry;
     converges on every reachable and unreachable state). Host crash
     listener reordered terminate-before-finalize.
  3. Shadow-abort (and every worker error exit) now persists
     `run_stats` — the abort message's "detail in run_stats.shadow" is
     true; soft mismatch records capped at 200 (hard never capped).
  4. Scope-table drops re-sequenced: the worker drops before the status
     flip releases the claim; cancel no longer drops at all (a successor
     run's create-time drop handles leftovers) — a trailing drop could
     destroy a successor's snapshot.
  5. Client IndexedDB twin closed: `hmisImportRunActive` on
     `InstanceDatasetsSummary`/`InstanceState` (SSE starting + updates;
     launch route notifies immediately), and
     `getDatasetHmisDisplayInfoFromCacheOrFetch` bypasses the client
     cache while true — mirrors the server's Valkey bypass.
  6. Unrecognized-analytics-headers errors classify `[permanent]`
     (deterministic server property, not retryable server health).
  Reviewed-and-accepted (documented, no code): ms-scale
  visible-placeholder window between an interrupted run's status flip
  and finalize; display-route runActive TOCTOU (refuted as practically
  inert — a fresh run spends minutes classifying before its first
  commit); both-abort livelock on simultaneous run+CSV claims (safe:
  at most one proceeds, both may fail loudly).
- **Single-month DVS pulls (Tim's explicit ruling, 2026-07-14)**: the
  original ≤3-contiguous-month adaptive window (a delegated robustness
  ruling, not Tim's) is gone — one pull = one element × one month, the
  fetch unit matching the import unit. Window-halving code deleted
  (`chunkContiguousMonths`/`nextMonth` removed from dispatch.ts);
  size/timeout now escalates straight to the level-2 subtree split. The
  batching had saved only ~15 min of per-request TTFB on a full Nigeria
  year (total bytes identical) at the cost of 3× failure blast radius
  and worker memory. Date-RANGE fetching (vs `period=` exact selection)
  stays — it is load-bearing for rule 5 (§4.4): exact-period selection
  silently omits records stored at non-monthly period types. Lab E12
  (§2.8) then settled the cost/equality question empirically: records
  identical, no measurable timing difference.
- **Cutover gate 1 (lab E11): RETIRED without completing** *(Tim's
  ruling, 2026-07-14 evening: stop all lab work, trust the evidence
  gathered — no more effort on the lab)*. History: rebuilt that day
  for daytime resilience (checkpoint to `results/e11_checkpoint.json`,
  live rollup to `results/e11_summary_latest.json`, grind cycles with
  cooldowns, resume on re-run), ran ~18:00–20:25 AWST through Nigeria's
  afternoon: every DVS pull that completed was healthy, ZERO hard
  mismatches ever observed across all e11 attempts, but Nigeria's
  analytics never served a single API comparison all day (evidence in
  itself — §2.7's finding at full strength), so 0/160 subject-months
  formally settled when halted. The parity evidence base stands on
  E9 + E10 (300/300) + E12 (record-exact, §2.8). **Gate 2 — the in-app
  first-run shadow verification with the §4.4 circuit breaker — is the
  remaining cutover protection**, and it runs on every instance's
  first dispatcher run regardless. The checkpoint is kept; `./run e11`
  resumes it if anyone ever wants the formal verdict.

Outstanding non-code items:

- Deploy: Phases 1–3 take effect only after a server restart/deploy
  (migrations 056–057 run at startup; the dev DB already has both from
  the verify harnesses — idempotent no-ops). One-time operational note:
  any attempt mid-DHIS2-wizard at deploy time is orphaned (the wizard
  is CSV-only now) — delete the attempt and re-import via the new
  DHIS2 import; a leftover *staged* DHIS2 attempt is refused loudly by
  the integrate worker.

Tim has ruled the Phase 3 architecture: the **fetch dispatcher** (§4.4)
— dataValueSets-primary, analytics only for computed indicators.
Standing directive from Tim: **where a decision is unclear, take the
most robust option, even at the cost of more work.** Rulings made under
that directive are marked *(robustness ruling)*.

A fresh agent continuing this work — the task is **Phase 4**:

1. Read §1 for the as-built system, §2 for the evidence base (§2.7/§2.8
   for gate/lab state), §3 for the ruled architecture.
2. Build Phase 4 per §5.4: C3 encrypted stored credentials + C4 weekly
   scheduler with the per-instance SETTABLE schedule window (§7 C3/C4
   specs; §6.1 Phase 4 UI — subscription config + failure banner). Pick
   C3's exact crypto primitive during the build (AES-GCM via WebCrypto,
   key from instance env — §7). C4 must ship DISABLED per instance and
   stay disabled until that instance's first dispatcher run has
   shadow-verified clean (§7 C4 dependency — the lab gate is retired,
   Status block).

Phase 3's code (§1, §4.4) is built, twice-reviewed, and on `main` —
build Phase 4 on top of it; don't re-derive it. Do NOT start new lab
work (Tim's ruling — Status block); the lab repo is kept for reference
and Tim will push it to GitHub himself.
Everything needed is in this file or linked from it. This plan is the
status tracker — when a phase completes, update the Status block above
(commit to main). Delete the plan once Phase 4 lands; if work stalls,
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

## 1. Anatomy today (as-built after Phase 3; verified against `main` 2026-07-14)

**DHIS2 imports are runs** (`dataset_hmis_import_runs`, main DB;
migration 057): launched by `launchDatasetHmisDhis2Run` (validates the
connection, expands the selection — window or explicit pairs — checks
indicators exist, refuses while a CSV attempt or another run is active;
the INSERT of the single allowed `status='running'` row is the atomic
claim via a partial unique index). Credentials travel only in the worker
message — never stored (C3 adds encrypted storage). Runs are listed by
`getDatasetHmisImportRuns` (top 50), cancelled by
`cancelDatasetHmisDhis2Run` (terminates the worker; completed pairs are
kept — the point of per-pair units). db_startup sweeps stale `running`
rows to `error` after a restart.

**The run worker**
(`server/worker_routines/import_hmis_data_dhis2/worker.ts`; pure logic
in `dispatch.ts`): snapshots the UID-shaped `facilities_hmis` list into
an UNLOGGED scope table (`hmis_dhis2_run_facility_scope`), classifies
every selected raw indicator per run from DHIS2 metadata (dispatcher
§4.4), builds fetch tasks — dataValueSets pulls per base element ×
single month (ruled 2026-07-14: the fetch unit matches the import unit;
indicators sharing a base share one pull),
analytics tasks per pair for computed indicators — and runs them under
`pooledMap` (`DHIS2_CONCURRENT_REQUESTS`, default 5). Each pair then
integrates in its own small transaction: scoped DELETE (join the scope
table) → UNNEST INSERT → ledger upsert → run counters. The version row
is minted lazily at the first successful pair (NOT NULL FK; no empty
versions) but stays INVISIBLE to every version reader until the run
ends (version-keyed caches assume a visible id names settled data —
authoritative comment on `getVersionsForDatasetHmis`; the display route
also bypasses its cache while a run is active), and is finalized at run
end with a slim `DatasetDhis2StagingResult` (periodIndicatorStats read
back from the ledger; no
succeededWorkItems/fetchedFacilityIds/pairFetchStats — §4.1's strip).
Interrupted exits (cancel/crash/restart sweep) reconcile the version
row from dataset_hmis + ledger, deleting it if zero pairs succeeded
(`finalizeInterruptedDatasetHmisRunVersion`). Per-pair instrumentation (`pairFetchStats`, route `"dvs" |
"analytics"`), the classification summary, and shadow results live in
`run_stats` on the run row. Progress (`phase` + ≤20 active pairs) is
throttled to ≥2 s and status-guarded so a cancelled run is never
resurrected. Analytics leg unchanged from Phase 1: batch 400 (env
tunable), real-URL 7,000-char guard, `maxAttempts: 3`, 4xx≠429 never
retried, missing-`rows` = failed fetch, `parseInt` + negatives dropped.
DVS leg: one pull = one element × one month, 100 MB streamed cap,
300 s timeout, size/timeout triggers the level-2 subtree split (never
retried at the same
shape), values summed per facility across COC×AOC (operands filtered to
their COC), SUM truncated, negative totals dropped, `deleted: true`
skipped, any non-monthly period id re-routes the element to analytics.
Unknown ids fail all their pairs as `[permanent] Not found in DHIS2`
without any fetch. First run per instance shadow-verifies ~5% of DVS
pairs (≤40; ≤400 sampled facilities per pair, both directions,
zero-vs-absent soft) against analytics BEFORE integrating; a hard
mismatch fails the pair loudly with both numbers; `shadow_passed=true`
(all sampled pairs verified, zero hard mismatches) skips shadow on
later runs.

**CSV imports** keep the attempt wizard (now CSV-only: the client sets
`source_type='csv'` at creation; the DHIS2 steps/routes are deleted) and
the merge-only integrate worker, which refuses leftover DHIS2-staged
results loudly. CSV staging/integration and windowed deletes refuse
while a run is active, and vice versa. The same transaction writes the
**import ledger** (below).

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
keying (`versionId + indicatorMappingsVersion`) unchanged. While a run
is active BOTH cache layers are bypassed and reads compute live: the
display route skips Valkey, and the client skips its IndexedDB twin
via `hmisImportRunActive` on the datasets summary (SSE starting +
updates; the launch route notifies immediately).

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

**State machine**: the single-row attempt table remains only for the
CSV wizard (C2 delivered); DHIS2 progress is the run row + ledger. Only
one HMIS import operation (run OR CSV phase) can exist at a time.

**Connector** (S7, `server/dhis2/`): one base fetcher
(`fetchFromDHIS2`/`getDHIS2`) owning auth/timeout(120 s spanning body
read)/retry (`withRetry`, classifies by message substring; never
retries 4xx except 429); analytics via
`goal3_analytics/getAnalyticsFromDHIS2`; Phase 3 added
`goal5_data_value_sets/` (`getDataValueSetsFromDHIS2` with streamed
byte cap, `getExistingMetadataIds` chunked id:in existence checks,
`getOrgUnitIdsAtLevel`). See SYSTEM_07_dhis2.md.

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
  think time + retry burn. A2 = write this into the thread (done —
  §4.2, closed).

### 2.2 The failure clusters (E6, from real v59/v60 failures)

1. **409 "Dimension is present in query without any valid dimension"**
   (56+38 occurrences): exactly 4 dx ids — `lp4vfvVhXfz`, `tupwLqIxPPo`,
   `mcLi3dvV3fm`, `nVDvjFIxwqV` — which **404 on every DHIS2 metadata
   endpoint: they do not exist**. Stale config; correct operand
   replacements (`p6aVCk9aN6S.zbr2vnRNwAW`/`.YW7OzKBM90D`) already sit in
   `indicators_raw`. E10 metadata census found **2 more latent stale ids**:
   `O82o1WlMisO`, `lyVV9bPLlVy` (6 total). Deterministic, instant, fails
   every run. Fix = config remap in the Nigeria instance (handled) +
   dispatcher `unknown` handling (§4.4).
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
For Nigeria specifically, a pull starting after ~01:15 WAT (post-rebuild)
is a good default — this is the value the Phase 4 UI should suggest as
Nigeria's default schedule (§7 C4), not a value baked into the scheduler
itself; other instances will have their own windows. `./run e8` appends
to a freshness log — keep sampling other hours/days to confirm the
schedule. §2.7 (2026-07-14 daytime) is now direct evidence for *why*
this needs to be a real per-instance setting, not an assumption.

### 2.6 Phase 0 loose ends — CLOSED (lab retired, Status block)

The E1/E8 daytime samplers were never run and won't be (Tim's ruling:
no more lab effort); E11's daytime attempts supplied the daytime
evidence that mattered. The parity gate's disposition is in the Status
block.

### 2.7 Gate 1 attempt, 2026-07-14 daytime — inconclusive (informs Phase 4's scheduler)

Ran `./run e11` (the full per-element DVS-vs-analytics parity gate,
§4.4) against Nigeria starting ~08:20 WAT — daytime, not off-peak. It
did not reach a verdict:

- **19 of ~76 dataValueSets base elements processed cleanly** — each
  pull succeeded fast (6k–122k values per element, no errors), and
  every value seen was consistent (0 hard mismatches recorded).
- **Every analytics-side comparison call failed.** The log shows
  repeated `server-stress failure #1…#6, backing off up to 60000ms`
  for the `parity_analytics` requests specifically — 429/5xx/timeout,
  the harness's own guardrail backoff. "Verified so far" stayed at 0
  through all 19 bases; the run was killed (not a code hang — see
  below) before reaching a natural finish or fail.
- **Follow-up single-request probe** (one dataValueSets call, one
  analytics call, same element/month, no retries, run standalone
  outside the full gate): dataValueSets succeeded in 30.6 s (6,244
  values); analytics **failed outright with a literal
  `504 Gateway Timeout` from Nigeria's own nginx after 60 s** — not a
  connector timeout, not a retry exhaustion message, an actual HTTP 504
  returned by their reverse proxy. A second probe attempt (single
  lightweight metadata `id:in` classification call, no analytics
  involved) also failed to return within 90 s.
- **Reading**: this is consistent with §2.1/§2.4's existing evidence
  (*"mid-lab the analytics engine went 100%-504 for ou:400 shapes while
  concurrent dataValueSets pulls held 1–2s TTFB — different server
  path, independent health"*), but stronger — today even a lightweight
  metadata endpoint was slow to answer, suggesting the whole instance,
  not just `/api/analytics`, was under real production load at that
  time of day. This is external evidence, not a defect in the
  dispatcher or the gate's design: dataValueSets remained healthy
  throughout: this is exactly the failure mode Phase 3 exists to route
  around, and it directly informs Phase 4 — **any unattended DHIS2
  fetch (gate re-runs, and especially the auto-pull scheduler) needs a
  real, operator-controlled off-peak window, not an assumption baked
  into app code.** See §7 C4.
- **Action** *(closed 2026-07-14 by Tim's ruling — see Status)*: e11
  was rebuilt to survive daytime load (checkpoint + grind cycles +
  resume), ran through the afternoon settling nothing (analytics fully
  down for API consumers), and was then retired with the rest of the
  lab. No app-code changes are implicated by this finding.

### 2.8 E12 — date-range vs `period=` head-to-head (2026-07-14 daytime)

Ran after Tim challenged the range approach (why convert period ids to
dates at all?). 6 dvs base elements × month 202605, interleaved A/B
request pairs (order alternating to cancel warm-cache bias), against
live daytime load:

- **Records: EXACT EQUAL on all 5 comparable elements** — canonical
  multiset over (dataElement, period, orgUnit, COC, AOC, value,
  deleted), including ANC's 37,961 values. The 6th element got no
  verdict (both selectors 5xx'd repeatedly in a load spike — says
  nothing about the comparison). `period=` + `dataElement=` is
  confirmed working on Nigeria's 2.40.9. Zero non-monthly records
  observed in any range response (consistent with §2.4).
- **Timings: no systematic winner.** Per-element wins split both
  directions (range lost 18s/47s-vs-2s on one element, won 2s-vs-23s
  on another); daytime load noise dwarfs any selector difference. No
  evidence of marginal query-time cost for the range approach.
- **Verdict**: keep the date range — equality proven, cost nil, and
  only a range surfaces non-monthly-stored records (rule 5's detection
  depends on that visibility; `period=` omits them silently, and
  dataValueSets is a raw export with no aggregation engine to
  compensate). Run: `e12_range_vs_period_2026-07-14T11-47-46`.

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
`succeededWorkItems`/`periodIndicatorStats` payload. *Resolved in
Phase 3*: `pairFetchStats` now lives in `dataset_hmis_import_runs.
run_stats`; run-minted version rows carry only the slim staging result
(no pairFetchStats/succeededWorkItems/fetchedFacilityIds).

### 4.2 A2 — the regression answer (DONE, closed 2026-07-14)

§2.1's attribution verdict was written into the thread (Rachel/Josh),
with the advocacy-note material for the Ministry/DHIS2 team: the
slow-dx list and the `wGPpop3rz7i` anomaly, the 60 s
`proxy_read_timeout` (ask: raise for `/api/analytics`, or fix the slow
queries), the nightly rebuild window, and the 6 stale indicator ids to
remap instance-side (§2.2). Comms and the instance-side remap are
handled — nothing outstanding.

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

### 4.4 A4 — the fetch dispatcher (SHIPPED, Phase 3)

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

**dataValueSets route** (per base element × single month):

- `GET /api/dataValueSets.json?dataElement={base}&orgUnit={root}&children=true&startDate={month start}&endDate={month end}`
  through the S7 base fetcher (`maxResponseBytes` cap ~100 MB, timeout
  300 s, streamed read).
- Root org unit: discovered per instance (level-1 org unit), cached.
- **One month per pull** *(Tim's explicit ruling 2026-07-14, superseding
  the original adaptive ≤3-month window)*: the fetch unit matches the
  import unit. A date RANGE (not `period=` exact selection) is still
  required — exact-period selection silently omits records stored at
  non-monthly period types, which is what rule 5's detection depends on.
  If the response exceeds the byte cap or times out, split by level-2
  org-unit subtree (state) and merge; never fail a pair on size without
  having tried the split.
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

*As built* (deviations, robustness-driven): classification also checks
operand COCs exist (`categoryOptionCombos` id:in) — a missing COC would
otherwise silently reduce to zero rows; non-UID-shaped ids classify
`unknown` without a metadata call; size/timeout DVS errors are never
retried at the same shape (`shouldRetry` excludes them; the split IS
the retry); rule-4 pairs get no `pairFetchStats` entry (fetch
instrumentation covers pairs that reached a fetch route). On a
non-Gregorian instance calendar every pair routes to analytics — the
DVS date window is Gregorian arithmetic on instance-calendar period
ids and would be years off (review fix 2026-07-14). Shadow: ≤40
sampled pairs, per pair one analytics call over ≤400 facilities (≤300
with DVS data + ≤100 without, both coverage directions);
zero-vs-absent is recorded as soft, not a failure (endpoint ambiguity);
`shadow_passed=true` requires every sampled pair verified (no
analytics-unavailable) and zero hard mismatches, is keyed to the DHIS2
URL, and ≥3 hard-mismatch pairs abort the whole run before the
unsampled remainder integrates (circuit breaker, review fix
2026-07-14). The lab pre-flight is E11 (`e11_full_parity_gate.ts`),
which imports the app's real `dispatch.ts` classification/date helpers
(checkpoint/resume design in §8).

### 4.5 A5 — failure handling (SHIPPED through Phase 3)

409/404 → permanent per-pair error, ledger-visible, no retry (retry
cap plus permanent/transient classification in Phase 1, ledger
visibility in Phase 2, dispatcher rule 4 in Phase 3). 5xx/timeout →
transient: fail
the pair after the capped retries; re-runs happen at pair granularity
via the checklist actions (§6.1), ideally scheduled off-peak (§2.5).
The 6 stale ids were remapped instance-side (handled); rule 4 surfaces
any future stale config loudly per run.

## 5. Sequencing (each phase ships alone; update Status on completion)

1. **Phase 1 — DONE (`da4f6a7d`)** — quick wins + instrumentation + the
   answer (A3 + A1 + A2): worker fixes (throttle, guard fix + batch 400,
   retry cap 3, 409 permanent, env tunables), per-pair timing
   instrumentation, thread attribution paragraph. Still outstanding from
   this phase: the §2.6 daytime lab runs (optional).
2. **Phase 2 — DONE (`d191fb3f`)** — ledger (WS-B, §6): table plus
   writers, backfill, viewer switch, and the read-only checklist /
   "last imported" UI.
3. **Phase 3 — DONE + twice reviewed; gate 1 running** (built, verified,
   and adversarially reviewed twice 2026-07-14 — see Status) —
   dispatcher + per-pair units (§4.4 + C1 + C2, §7): per-pair
   fetch+integrate run worker, runs table (migration 057), dispatcher
   as the fetch step (single-month pulls), §6.1 Phase 3 UI (run
   launcher/view/history + checklist actions). On main: `d267c39f`,
   `86f87385`, and the round-2/single-month commit (Status
   header). Gate 1 (lab E11) RETIRED without completing — Tim ruled the
   E9/E10/E12 evidence sufficient (Status block). Gate 2 = in-app
   first-run shadow verification + circuit breaker, ships in the worker
   (no separate action needed) and is the remaining cutover protection.
4. **Phase 4 — NEXT — auto-pull** (C3 + C4, §7): stored credentials
   (encrypted), weekly scheduler with a **per-instance settable
   schedule window** (day/time/timezone — not hardcoded; §7 C4, ruled
   2026-07-14 off the §2.7 finding), failure surfacing. Plus the §6.1
   Phase 4 UI (subscription config incl. the schedule fields + failure
   banner). C4's scheduler must stay disabled per-instance until that
   instance's gate 1 has passed.

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

**Phase 3 (actions + runs) — SHIPPED:**

- **Checklist actions**: "re-import this indicator" and "retry failed
  pairs" buttons enqueue per-pair units — the checklist is WS-C's unit
  made visible; don't build a second re-import surface.
- **Run view**: wizard progress switches from the status-JSON poll to
  run + ledger reads (live per-pair progress, per-pair errors as they
  land, partial results visible if a run dies mid-way), plus a run
  history list (who/what/when, pair counts, per-run outcome) from
  `dataset_hmis_import_runs`.

*As built*: new client home
`instance_dataset_hmis/dhis2_run/` (`index` = editor with 2 s poll
while running, `_launcher` = credentials + indicator/period pickers or
a preset-pairs summary, `_run_view` = progress bar/phase/active
pairs/cancel, `_run_history` = table). The HMIS sidebar gets "Import
from DHIS2" plus a live progress card; "Upload CSV file" keeps the
attempt wizard (now CSV-only — Step0/DHIS2 steps deleted, source set at
creation). Checklist: header "Retry failed pairs (N)" launches a
pairs-preset run over every `status='error'` pair; the per-indicator
detail header gets "Re-import this indicator" (all window months).
Both open the same launcher — credentials prompted per run until C3;
URL prefilled from the last run. All new strings inline t3 en/fr/pt.

**Phase 4 (auto-pull visibility):**

- Subscription config UI (per-instance: on/off, indicator list, rolling
  window, and the **settable schedule** — day of week, start time, IANA
  timezone; see §7 C4 for the stored shape and the Nigeria-specific
  default-value hint) and an in-app banner + checklist/run-history
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

- **C1 — the per-pair import unit (SHIPPED, Phase 3).** Restructure the
  DHIS2 path from monolithic stage-all-then-integrate-all to
  fetch+integrate per pair (staging is per-pull in worker memory; the
  only table is the run-scoped facility snapshot). The dispatcher's DVS
  route fetches one *element × month* which can cover several pairs
  (indicators sharing a base element) — the unit boundary is (pair) for
  integration and ledger writes. A 48-hour run
  that dies at hour 40 keeps 40 hours of work, visible in the ledger.
  **Version-record grain** *(ruled; as-built deviation)*: one
  `dataset_hmis_versions` row per run, minted **lazily at the first
  successful pair** — not at run end, because `dataset_hmis.version_id`
  is a NOT NULL FK and rows insert mid-run. The ruling's substance
  holds: zero successful pairs ⇒ no version row (verified live);
  counts/staging_result finalized at run end.
- **C2 — an import-runs table (SHIPPED, Phase 3)**:
  `dataset_hmis_import_runs` (trigger user|schedule, selection JSON,
  status, pair counters, started/ended, version_id, shadow_passed,
  throttled progress JSON, run_stats instrumentation blob) + the ledger
  as per-pair progress. Partial unique index = at most one running row
  (the launch claim). The run view reads run + ledger; the hot
  single-row JSON rewrite is gone. The single-row attempt table remains
  only for the CSV wizard's step-config state. Also shipped: run
  cancel (worker terminated, completed pairs kept) and a db_startup
  sweep for runs wedged by a restart.
- **C3 — instance-level stored DHIS2 credentials, encrypted at rest**
  *(ruled: plaintext is not acceptable)*: encrypt with a key from
  instance env (e.g. AES-GCM via WebCrypto; key never in the DB), decrypt
  only in the worker at fetch time. This also retires the plaintext
  copies in attempt rows (S5/S6/S7 have each deferred this ruling — it is
  now on the critical path and settled in principle; pick the exact
  primitive during C3 build).
- **C4 — the scheduler.** `main.ts` already runs daily `setInterval`
  jobs; add a weekly instance-config-gated trigger that enqueues a run
  from the subscription, with a lock against concurrent manual runs
  and failure surfacing.
  **The schedule window is a per-instance SETTABLE config, not a
  hardcoded time** *(ruled 2026-07-14, driven by §2.7: Nigeria's
  daytime load made an unattended gate run fail outright with a 504 —
  the same risk applies to any unattended auto-pull, and different
  DHIS2 instances will have different low-traffic windows)*. Shape:
  `{ enabled: boolean, dayOfWeek: number (0-6), startTime: "HH:MM",
  timezone: string (IANA, e.g. "Africa/Lagos") }`, stored per instance
  (mirrors the existing `instance_config` config_key/config_json_value
  pattern — see `db_startup.ts`'s default-config inserts for the
  convention). The daily scheduler tick computes "is it currently
  within this instance's configured window" against that stored
  timezone/day/time — not against an app-wide constant. §2.5's Nigeria
  finding (~01:15 WAT, post analytics-rebuild) becomes the **UI's
  suggested default value** for Nigeria specifically (surfaced as
  placeholder/hint text in the Phase 4 subscription config UI, §6.1),
  not logic baked into the scheduler. Still jitter the actual start a
  few minutes inside the window to avoid a thundering-herd instant if
  several instances share a schedule.
  **Auto-pull default OFF per instance** *(ruled)*; notification =
  in-app banner + run/ledger visibility first, email later if wanted
  *(ruled: no new external dependency for v1)*.
  **Dependency** *(updated 2026-07-14 — the lab gate is retired, Status
  block)*: do not enable C4 for any instance until that instance's
  first dispatcher run has shadow-verified clean (`shadow_passed=true`
  for its DHIS2 URL, §4.4 gate 2) — an unattended scheduled run
  inherits every risk a manual run does, and §2.7 is direct evidence
  that timing matters for unattended production pulls.
- **C5 — downstream freshness** (note only, out of scope): a scheduled
  pull bumps the dataset version; results-runs staleness surfaces it.
  Whether anything re-generates automatically is a separate ruling.

## 8. The lab (RETIRED 2026-07-14 — kept for reference, no new work)

Tim's ruling: trust the evidence gathered; spend no further effort on
the lab. The repo stays (Tim will push it to a GitHub repo himself);
everything below is reference for reading its results, not an
invitation to run more experiments.

`~/projects/apps/wb-fastr-dhis2-lab` — sibling repo so national-DHIS2
credentials and experiment churn never enter this repo. It imports the
app's **real** connector via absolute paths and runs under this repo's
`deno.json` (`./run e1 … e12`, see its README; verdicts in its
RESULTS.md, E12 = range-vs-`period=` — §2.8).
Guardrails: read-only
GETs, ≤5 concurrent default, backoff on 429/5xx, hard stop after 20
consecutive server-stress failures, every run logs request count; DHIS2
caches analytics responses, so never time a repeated identical request.
Inputs are prod-DB-first (README documents the pull commands per
DOC_ACCESS_DBS.md). `./run e11` is the full per-element parity gate
(§4.4 gate 1) — it imports the app's real dispatcher code. Rebuilt
2026-07-14 for daytime resilience: settled verdicts checkpoint to
`results/e11_checkpoint.json`, a live rollup rewrites to
`results/e11_summary_latest.json`, unverified subject-months retry in
grind cycles (HARD STOP ends a cycle, not the run), DVS sums re-pull
when >45 min old, and a re-run resumes from the checkpoint
(`--fresh` discards; `--maxMinutes`/`--cooldownSeconds` tune the
budget). Exit 0 PASS / 1 FAIL / 2 INCOMPLETE. No future lab work is
planned (retired — see above). One sizing fact kept for reference: DVS
deep-history backfill would be ~10 MB per dense element-month
(72-month history ≈ 10–20 GB transfer, one pull per element-month).
