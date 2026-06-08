# Plan — Importer Consolidation Toolkit

> **Status: implementation plan (v2 — revised after a fact-check + adversarial review, 48 claims, 46 confirmed/2 partial/0 refuted).** Standalone effort. **Goal: make building the *next* dataset importer cheap** — via shared UI patterns, server helpers, and a thin wiring scaffold.
>
> **This is deliberately NOT the monolithic generic engine** in `PLAN_DATA_IMPORT_ARCHITECTURE.md`, and it is independent of the facilities split and the population table. It consolidates *building blocks* while every importer stays its own readable file.
>
> **Read §1 first.** The review changed the shape of this plan: a few items are real bugs/blockers worth doing now; most of the "toolkit" is speculative and should wait for a real second customer.

---

## 1. Economics first — what's justified now vs. on spec

Be honest about demand before building abstractions:

- Importer code is **~3% of churn** (33 of 1,064 commits in 9 months).
- Exactly **one** new dataset family has ever been added (ICEH, 2026-05-19) → cadence ≈ **one new dataset per ~6 months**.
- Revealed preference: ICEH's author knew the codebase well enough to deliberately skip the worker machinery, yet still hand-cloned the wizard + state-machine boilerplate rather than build a shared helper. That's weak evidence the boilerplate is *annoying but cheap*.

**Conclusion:** a 4-layer toolkit's payback is measured in **years**. So split the work:

- **Part A (do now):** three items justified *independently of any future importer* — two real bugs and the one genuine blocker. ~150–250 LOC total, need none of the toolkit.
- **Part B (build on demand):** the consolidation toolkit. Build it **when there's a real second customer in flight** (e.g. the population importer), so that customer *justifies* each abstraction instead of it being built on spec. At that point you'll have 4–5 real importers to design against.

---

## 2. Part A — Ship these now (independent of the toolkit)

### A1 — Fix the restart-wedge (real reliability bug)
Fixed staging-table names ([stage_hmis_data_csv/worker.ts:48-51](server/worker_routines/stage_hmis_data_csv/worker.ts#L48)) + an in-memory worker singleton + a guard that reads **persisted** DB state ([dataset_hmis.ts:798](server/db/instance/dataset_hmis.ts#L798), [dataset_hfa.ts:535](server/db/instance/dataset_hfa.ts#L535)) mean: a server restart mid-stage leaves `status_type` stuck at `staging`/`integrating` with no live worker, and the guard then blocks **all** future imports — only fix is manually deleting the attempt row. There is **no startup reset anywhere**. And the server has no `--watch`, so you restart on every server edit.
- **Fix (~50 LOC):** on startup, `UPDATE …_upload_attempts SET status_type='error', status=… WHERE status_type IN ('staging','integrating')` for each attempt table; and move to per-importer (or per-attempt) staging table names so a re-run can't collide. Needs neither the merge nor the toolkit.

### A2 — Keyed worker registry (the only hard blocker)
[worker_store.ts:4](server/worker_routines/worker_store.ts#L4) has two named singletons (`hmisWorker`, `hfaWorker`). **You cannot add a 5th worker-based importer without editing this file**, and there's no generic slot.
- **Fix (~15 LOC):** replace with `Map<string, Worker>` + `setWorker(key, w|null)` / `getWorker(key)`. Behavior-preserving; removes the ceiling. Keep thin typed aliases for the existing two during transition.

### A3 — Parameterized/COPY insert path + retire the lossy escaper (live data-corruption bug)
[`cleanValStrForSql`](lib/utils.ts#L5) strips `"` `'` **and `,`** — it mangles *free text*, not just IDs. Today it silently corrupts HFA questionnaire labels like "Yes, with conditions" ([stage_hfa_data_csv:330](server/worker_routines/stage_hfa_data_csv/worker.ts#L330),:336,:358) and structure facility/area names like "Bauchi, North" / "St. Mary's" ([stage_structure_from_csv:197](server/server_only_funcs_importing/stage_structure_from_csv.ts#L197),:221). HMIS uses quote-doubling ([:217](server/worker_routines/stage_hmis_data_csv/worker.ts#L217)); ICEH already uses parameterized queries ([dataset_iceh.ts:564](server/db/instance/dataset_iceh.ts#L564)) — the model.
- **Fix:** introduce a single `withBufferedInsert` helper backed by parameterized binding / `COPY`, and route HFA + structure staging through it (they're the lossy ones). **Gate each swap on a row-for-row output diff** vs. the legacy path before deleting it — the byte output changes (it stops dropping characters), so verify per pipeline. This is the first extracted helper of Layer 3, pulled forward because it fixes a bug.

**Part A is the whole "urgent" story: ~150–250 LOC, three independently-justified PRs, no speculative abstraction.**

---

## 3. Part B — The consolidation toolkit (build on demand)

Goal: drop the marginal cost of a *new* importer. Honest costs today (verified, §12):

| Layer | Per-importer cost today | Realistic reduction |
|---|---|---|
| Client orchestrator (`index.tsx`) | 250–390 LOC; ~90% identical skeleton | ~50% |
| Client step components | ~600–2,000 LOC; partly duplicated | trim, not unify |
| Server stager + integrator | 220–910 LOC each; shared skeleton | ~33% (helpers) |
| Wiring (DB state-machine + routes + worker store) | 760–1,190 LOC | ~40–55% |

**Design principle: toolkit, not engine.** Extract reusable parts; each importer stays its own file; the irreducible cases (XLSForm metadata load, `select_multiple` 1→N fan-out, structure's 6-strategy preview) stay as plain code. **Lead with the *marginal* number, not the gross-reduction %:** the real, defensible goal is *"the next simple CSV importer ships in <500 LOC total"* (vs. ~2,300–3,200 today).

---

## 4. Layer 1 — Client `<ImportWizardShell>`

**Today:** 4 orchestrators (hmis 387, hfa 283, iceh 251, structure 268 = **1,189 LOC**, ~90% identical skeleton: `timQuery` get-attempt → `getStepper` → 2s poll + `onCleanup` (structure has none) → `FrameTop`/`HeaderBarCanGoBack`/`StepperNavigationVisual` → `StateHolderWrapper` cascading `Switch`).

**The descriptor must use render-thunks, not bare component refs** — the review found bare refs can't carry the real variation:
```ts
// Fully typed — no `any`, no bare-string dispatch (PROTOCOL_ALL_TYPESCRIPT). TUA = this importer's
// upload-attempt detail type; TReturn = close() payload (structure returns { needsReload: true }).
type ImportWizardDescriptor<TUA, TReturn> = {
  getUploadAction: keyof typeof serverActions;            // typed action keys, resolved against the generated registry
  getStatusAction: (keyof typeof serverActions) | null;  // null ⇒ structure (streams progress; no poll)
  deleteAction: keyof typeof serverActions;
  navMaxStep: number;                                     // stepper cap for goNext()
  // highest *renderable* step key may exceed navMaxStep — structure renders Step4 at
  // currentStep()===4 while navMaxStep===3 (reached only via server setCurrentStep). Model separately.
  steps: Record<number, (ua: TUA, ctx: StepCtx) => JSX.Element>;        // ctx carries ACCESSORS (structure: maxAdminArea, facilityColumns, silentRefreshInstance) — pass accessors down, never snapshot values
  progress: Array<{ status: string; render: (ua: TUA, pollingStatus: PollingStatus) => JSX.Element }>;  // HMIS staging vs staging_dhis2; ICEH synthetic "staged"
  errorMessage: (status: TUA["status"]) => string;        // HMIS status.err / structure status.error / HFA+ICEH JSON.stringify
  getStepperValidation: (state: StateHolder<TUA>) => (step: number, state: StateHolder<TUA>) => { canPrev: boolean; canNext: boolean };
  typeLabel: T3;
};
```

**Build:** `client/src/components/_import_wizard/import_wizard_shell.tsx` (~180–200 LOC; component exported as `ImportWizardShell`) + a per-importer descriptor. **Render steps through Solid control-flow** — invoke `descriptor.steps[n]` inside `<Switch>/<Match>` (or `<Dynamic>`), not by imperative dispatch; read `currentStep()` + reactive deps at the top; step thunks obey `DOC_STATE_RULES` #1–3 (no early return — use `<Show>`; read reactive deps before any conditional/`await`; pass **accessors**, not snapshot values). See §13.

**Realistic impact:** 1,189 → **~530–570 LOC (~50%)** — descriptors aren't uniformly ~80 LOC (HMIS branching + 5 progress thunks ≈ 110–130; structure server-driven step-4 + extra props + no-poll ≈ 110–130). **The honest win is marginal:** a *new simple* importer's orchestrator = a ~50-LOC descriptor.

**Port order:** ICEH (simplest) → HFA → HMIS → structure (last: no poll, extra props, server-driven step-4). Behavior-preserving; verify each end-to-end before deleting the old `index.tsx`.

---

## 5. Layer 2 — Client step kit (trim hard, don't unify)

**Reuse as-is (already shared):** [FileUploadSelector](client/src/components/_file_upload_selector.tsx) (120), [Dhis2CredentialsEditor](client/src/components/Dhis2CredentialsEditor.tsx) (99), [PeriodSelector](client/src/components/PeriodSelector.tsx) (158).

**Extract only the high-confidence, multi-consumer atoms:**
- `SourceTypeStep` (hmis/structure `step_0`, ~95% identical) — parameterized by options + save action.
- `Dhis2CredentialsStep` (hmis/structure `step_1_dhis2`, ~98% identical) — parameterized by save action.
- `CsvUploadStep` (hmis/structure `step_1_csv`, ~90%).
- `CsvColumnSelectRow` — a **thin ~15-LOC atom** (`<Select options={csvHeaders}/>` row) shared by **HMIS + structure only**.

**Do NOT build a generic `ColumnMappingStep`.** The three `step_2_csv` are not one abstraction: HMIS = 4 fixed `Select`s; structure = *dynamic* (`facility_id` + `admin_area_1..maxAdminArea` + optional facility cols); **HFA = a heterogeneous form** (Select + free-text time-point `Input` + `PeriodSelect` with bespoke `periodId.length !== 6` validation + a "saved" Switch state). Forcing HFA in means render-slots rich enough to be "a form" — i.e. reinventing panther's form primitives. HFA's mapping also couples to its stager via the `select_multiple` 1→N contract ([stage_hfa_data_csv:236](server/worker_routines/stage_hfa_data_csv/worker.ts#L236)). **Leave HFA's step_2 bespoke.**

**Demote to "extract on second consumer," not speculative kit:** `StagingResultsStep`, `Dhis2SelectionTableStep`, `StagingStartStep`, `ProgressStreamingStep`. **Stays bespoke regardless:** HFA dual-file + time-point, ICEH zip preview, structure dynamic-AA + the 6-strategy [step_4.tsx](client/src/components/structure_import/step_4.tsx) (282), geojson feature mapping.

---

## 6. Layer 3 — Server building-blocks library

A3 (above) already extracts `withBufferedInsert` to fix the escaper. The rest follow the same "extract, adopt in new code, refactor existing opportunistically with a row-diff" pattern. Build under `server/server_only_funcs_importing/_toolkit/`:
```ts
createUnloggedStagingTable(db, name, columns[]) ; dropTablesIfExist(db, ...names) ; verifyStagingTableExists(db, name)
withBufferedInsert(db, {table, columns, bufferSize?}, fn)          // A3 — parameterized/COPY
validateForeignKey(db, stagingTable, col, refTable, refCol, limit?)  // the LEFT JOIN…WHERE IS NULL pattern
withTunedTransaction(db, fn, {workMem?, maintenanceWorkMem?, synchronousCommit?})  // the char-identical SET LOCAL block
mergeRowUpsert(db, {stagingTable, targetTable, keyCols[], valueCols[], versionCol?}, versionId?)
mergePartitionReplace(db, {stagingTable, targetTable, partitionCol, partitionValue})
```
Already-generic, keep: [instantiate_worker_generic.ts](server/worker_routines/instantiate_worker_generic.ts) (READY→postMessage→COMPLETED), the CSV primitives. Bespoke transforms (`select_multiple` fan-out, XLSForm loader) stay plain functions the importer passes in. **Impact:** ~4,750 → ~3,200 LOC (~33%) *if* existing pipelines are migrated; the real value is per *new* importer.

> Also evaluate consuming panther's CSV modules (`_100_csv` / `_232_csv`) instead of wb-fastr's parallel `get_csv_components_streaming_fast.ts` — capacity that already exists upstream (see §8).

---

## 7. Layer 4 — Wiring scaffold (corrected: smaller win than first claimed)

**KEEP ONE TABLE PER IMPORTER.** The v1 "single merged `upload_attempts` keyed by `table_type`" idea is **cut.** Reasons (code-grounded): ~50 bare `UPDATE …_upload_attempts SET …`/`DELETE FROM …` sites with **no `WHERE`** rely on the single-row-per-table invariant (across DB modules *and* workers: [stage_hmis_data_csv:291](server/worker_routines/stage_hmis_data_csv/worker.ts#L291), [integrate_hmis:265](server/worker_routines/integrate_hmis_data/worker.ts#L265), [stage_hfa_csv:432](server/worker_routines/stage_hfa_data_csv/worker.ts#L432), …); the concurrency guard is table-scoped with no importer filter. Merging means threading a `table_type` predicate through all ~50 sites in un-watched workers, losing the DB-enforced "HFA `source_type NOT NULL`", to unlock cross-dataset concurrency **nobody requested**. Net: more churn + more risk than it saves.

**4a — Table-name-parameterized CRUD helpers** (the real, safe saving):
```ts
getRawUA(db, attemptTable) ; addUploadAttempt(db, attemptTable, init) ; getUploadAttemptDetail(db, attemptTable)
getUploadStatus(db, attemptTable) ; deleteUploadAttempt(db, attemptTable, { workerKey }) ; updateStepResult(db, attemptTable, n, result, {...})
```
Each importer keeps its own table + its step-transition bodies (importer-specific: HMIS stage-launch ~75 LOC at [dataset_hmis.ts:790](server/db/instance/dataset_hmis.ts#L790)). Saves the generic CRUD (~120–180 LOC/importer), not the whole module.

**4b — Route *handler* generator, NOT a registry factory.** The typed registry (`lib/api-routes/instance/*.ts`) is **irreducible**: `defineRoute` is keyed by compile-time literal route names, and the auto-generated server actions derive their `body`/`response` types from those literals (e.g. iceh registry: `response: {} as IcehUploadAttemptDetail`). A runtime factory can't emit typed literals → the registry stays hand-written per importer (~50–170 LOC). The factory can generate the standard *handlers* — but those are already ~6 LOC each, so the win is ~40–50 LOC/importer. Bespoke routes stay explicit and are a large fraction (structure: ~7 of 17 — two `streamResponse` stagers, `Dhis2_GetOrgUnitsMetadata`, `Dhis2_SetCredentials`, `deleteAllStructureData`, `getStructureItems`, raw CSV export; ICEH's `updateStep2` = combined stage+integrate with `onComplete`).

**4c — keyed worker registry:** already done in Part A (A2).

**Server actions remain auto-generated** ([create_server_action.ts](client/src/server_actions/create_server_action.ts)) — zero per-importer client API code. **Realistic impact:** 760–1,190 → **~350–500 LOC/importer (~40–55%)**, not 150–250. The defensible headline is M5's **"<500 LOC total for a new importer."**

---

## 8. What goes in panther (and what doesn't)

Panther is UI + viz/figure + doc-generation + fonts + CSV parsing + generic utils. It has a UI surface (`mod.ui.ts`) and a Deno surface (`mod.deno.ts`) — but the Deno side is **document generation, not backend data**: grepping panther for Postgres / `UNLOGGED` / workers / Hono routing returns **nothing**. That boundary decides it. (Edit panther in the **source** repo `~/projects/panther/timroberton-panther` and re-sync; never edit `panther/` here.)

**The boundary, simply: panther = generic UI frame + CSV/file primitives, no DB/workers/routes. The *frame* of the wizard goes to panther; the *meaning* of each step and everything server-side stays in wb-fastr.**

| Element | Owner | Status | Note |
|---|---|---|---|
| `getStepper`, `StepperNavigationVisual`, `StateHolderWrapper`, `HeaderBarCanGoBack`, `timQuery`, form inputs, tables, progress bar | **panther** | exists | wizards already import these — most of "the shared skeleton" is panther today |
| CSV parsing primitives (`_100_csv` / `_232_csv`) | **panther** | exists | consider consuming instead of wb-fastr's parallel `get_csv_components_streaming_fast.ts` |
| `<WizardShell>` — stepper + frame + state-holder + slotted step-switch + optional async-state | **panther** | **NEW — promote** | the one genuinely-generic new thing; **no import/upload semantics inside** |
| `pollUntil` hook | **panther** | NEW (optional) | generic; only if a second consumer appears |
| `<ImportWizardShell>` = `WizardShell` + import wiring (upload-attempt resource, staging/integrating statuses, `source_type`, 2s poll) | **wb-fastr** | NEW | §4 descriptor lives here |
| Step kit: `SourceTypeStep`, `Dhis2CredentialsStep`, `CsvUploadStep`, `CsvColumnSelectRow` | **wb-fastr** | §5 | domain steps |
| `FileUploadSelector`, `Dhis2CredentialsEditor`, `PeriodSelector` | **wb-fastr** | exists | Uppy/TUS + asset/SSE; DHIS2; FASTR period model |
| Layer 3 server ETL helpers (`withBufferedInsert`, `validateForeignKey`, `withTunedTransaction`, merge patterns) | **wb-fastr** | §6 | panther has no Postgres surface |
| Layer 4 wiring (CRUD helpers, route handler-gen, keyed worker registry, upload-attempt tables) | **wb-fastr** | §7 | panther has no backend-data surface; route work must **conform to** panther's `PROTOCOL_DENO_API` |

- **Already in panther (correctly):** `getStepper` (`_303_components/layout/stepper`), `StateHolderWrapper` (`special_state`), `HeaderBarCanGoBack` (`layout/heading_bar`), `timQuery` (`_302_query`), form inputs, tables, progress bar. The wizards already import these — most of "the shared skeleton" is panther today.
- **Promote to panther (the one genuinely-generic new thing):** a **domain-agnostic `<WizardShell>`** — composes stepper + frame + state-holder + a slotted step-switch + optional async-state. Panther has `getStepper` but no composed shell above it; any multi-step app wants this. **Keep all import semantics OUT of it** (upload-attempt resource, staging/integrating statuses, source_type, polling cadence). wb-fastr's `<ImportWizardShell>` (§4) = panther `<WizardShell>` + the FASTR import wiring. Optionally a generic `pollUntil` hook.
- **Stays in wb-fastr (domain-specific):** the entire step kit (DHIS2 creds, CSV→facility/indicator/period mapping, admin-area mapping, staging results), `FileUploadSelector` (Uppy/TUS + asset/SSE model).
- **Stays in wb-fastr (panther has no backend-data surface):** all of Layer 3 (Postgres ETL helpers) and Layer 4 (upload-attempt tables, route factory, worker registry). Putting a `postgres`-dependent toolkit into a UI/viz/docgen lib bolts on a whole new concern + dependency. If these ever need cross-project sharing, that's a *separate* Deno-Postgres util lib, not panther. The route factory must still **conform to** panther's `PROTOCOL_DENO_API`; if it reveals a missing convention, fix the protocol and re-sync.
- **Adjacent win:** consider moving wb-fastr's CSV streaming onto panther's `_100_csv`/`_232_csv` rather than maintaining a parallel implementation.

**Net: only `<WizardShell>` is worth newly promoting.** Everything that knows about datasets, DHIS2, Postgres, workers, or routes stays app-side.

---

## 9. Sequencing & milestones

**Part A first (independently justified, ~150–250 LOC):**
1. **M1 — restart-wedge fix (A1).** Startup orphan-reset + per-importer staging names.
2. **M2 — keyed worker registry (A2).** `Map<string,Worker>` swap.
3. **M3 — parameterized insert + retire lossy escaper (A3).** HFA + structure onto `withBufferedInsert`, row-diff gated.

**Part B only when a real second importer is in flight (e.g. population):**

1. **M4 — Wizard shell (Layer 1), a cross-repo sequence:**
   - **M4a — `<WizardShell>` in panther** *(panther repo)*. Build the domain-agnostic shell in the **source** repo `~/projects/panther/timroberton-panther` under `_303_components/layout/`, composing the stepper it already owns + frame + state-holder + a slotted step-switch + optional async-state. **No upload/staging/`source_type`/poll semantics.** Export from `mod.ui.ts`; **re-sync** into wb-fastr's `panther/` (never hand-edit `panther/` here).
   - **M4b — `<ImportWizardShell>`** *(wb-fastr)*. Compose the synced `WizardShell` + the §4 render-thunk descriptor + the import wiring (upload-attempt resource, 2s poll, staging/integrating statuses). Build it against the new importer in M5.
   - **M4c — port the existing four** *(wb-fastr)* onto `<ImportWizardShell>` opportunistically: ICEH → HFA → HMIS → structure. Behavior-preserving; delete each old `index.tsx` only after end-to-end verification. Never a big-bang.
2. **M5 — first real customer on the toolkit** *(wb-fastr)*. Build the next needed importer using table-name-parameterized CRUD (4a), the handler generator (4b), the step atoms (§5), and the server helpers (Layer 3). **Success metric: <500 LOC total** (excl. genuinely-unique transform/preview).
3. **M6 (optional) — back-fill** existing importers onto the toolkit when touched. Never a big-bang cutover.

> Repo legend: *(panther repo)* = edit `~/projects/panther/timroberton-panther` + re-sync; everything else is in this wb-fastr repo. Only **M4a** touches panther — every other milestone is wb-fastr-only.

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A3 insert-path swap changes stored bytes (stops dropping chars) | Row-for-row diff per pipeline before deleting legacy; never swap blind |
| R2 | Opportunistic refactors (R6-style) let the **bugs** ride along and then stall | **Part A is decoupled from the toolkit and ships first** — bugs can't be held hostage to a refactor losing momentum |
| R3 | Shell descriptor under-models variation (progress thunks, error accessor, nav-vs-render step, `TReturn`) | Use the render-thunk descriptor in §4; port structure last as the stress test |
| R4 | Over-extracting the step kit (ColumnMappingStep, etc.) creates leaky abstractions the 5th importer fights | §5: extract only multi-consumer atoms; HFA stays bespoke; demote the rest to on-demand |
| R5 | No server `--watch` — slow inner loop on Parts A3/Layer 3/4 | Budget for manual restarts |
| R6 | Building Part B on spec before a real customer | Gate Part B on M5 having an actual importer to justify each abstraction |

---

## 11. Verified inventory (appendix — corrected per review)

Client orchestrators: hmis 387, hfa 283, iceh 251, structure 268 = **1,189 LOC** ✓. Shared skeleton + structure-has-no-poll ✓. Shared components: FileUploadSelector 120, Dhis2CredentialsEditor 99, PeriodSelector 158 ✓. Step similarity: source-type ~95%, dhis2-creds ~98% ✓. Structure 6-strategy step_4 = 282 LOC ✓.

Server stagers/integrators ≈ **4,752 LOC** ✓ (stage_hmis_csv 787, stage_hmis_dhis2 911, stage_hfa_csv 481, integrate_hmis 334, integrate_hfa 224, stage_structure_csv 334, stage_structure_dhis2 508, integrate_structure 550, dataset_iceh 623). `SET LOCAL` block char-identical (integrate_hmis ~L120, integrate_hfa ~L117) ✓. FK-check `LEFT JOIN…WHERE IS NULL` (integrate_hmis ~L78, integrate_hfa ~L92, stage_hmis_csv ~L377; *line refs ±10 from formatting*). Buffered-insert confirmed identical-in-logic for **HMIS (10k) + HFA (100k) only** — structure CSV staging differs; don't cite it as a third instance. Escapers: lossy `cleanValStrForSql` (lib/utils.ts:5-10) strips `" ' ,`; quote-double stage_hmis_csv:217; ICEH parameterized ~L564 ✓.

Wiring: 4 upload-attempt tables, `CHECK (id='single_row')` ✓; HFA `source_type NOT NULL`, ICEH no `source_type` ✓. DB modules: dataset_hmis 1,046, dataset_hfa 698, dataset_iceh 623, structure 736 ✓. Routes: datasets.ts **26 handlers / 490 LOC** ✓; iceh.ts **10 / 142** ✓; structure.ts **17 `defineRoute` (+1 raw CSV export) / 361 LOC** — *corrected from 21*. Server actions auto-generated ✓. worker_store.ts = 2 named singletons ✓. **Correction:** **ICEH is fire-and-forget async** (`updateStep2` calls `stageAndIntegrateIcehData` **without `await`**, [dataset_iceh.ts:~397](server/db/instance/dataset_iceh.ts#L397)) — *not* "synchronous"; and structure *has* `status`/`status_type` columns, it just streams progress (`streamResponse`) instead of polling. Per-importer total today ≈ **760–1,190 LOC wiring + UI**.

---

## 12. Relationship to other plans

- `PLAN_DATA_IMPORT_ARCHITECTURE.md` — the broader (engine + facilities split + population) program. **This is the safe, standalone subset** of its "Goal A," reframed as a toolkit (not a runtime engine) and decoupled from B/C.
- Population table & facilities split — independent; population is the natural **first real customer** that would justify Part B.

---

## 13. Protocol & state-management conformance

Checked against `panther/protocols/*` and the three state docs. Verdicts + any required adjustment:

| Protocol / doc | Verdict | Adjustment |
|---|---|---|
| **DOC_STATE_* + PROTOCOL_UI_STATE** | **conform** (clarify the tier) | Upload attempts are **T3 component-local** (`DOC_STATE_MGT_INSTANCE.md` rule #8 @:246; T3 table @:196–198). The 2s poll + `silentFetch` is the **sanctioned** T3 pattern — `DOC_STATE_MGT_TIERS.md`@:248 lists "Upload workflows (transient per-user state + polling)" as canonical T3. The "no manual refetch" rule is **T2-scoped** (post-mutation cache invalidation) and does **not** apply. Keep the attempt component-local: **no provider, no state file, no Context/hooks/prop-threading-for-state** (rule #5 @:243). Use `timQuery` for the fetch; **never `createResource`** (`DOC_STATE_RULES.md` #9). The panther `<WizardShell>` stays state-agnostic — the `timQuery` + poll live only in wb-fastr's `<ImportWizardShell>`. |
| **PROTOCOL_UI_SOLIDJS + DOC_STATE_RULES #1–3** | conform **iff §4 note followed** | Render via control-flow (`<Switch>/<Match>`/`<Dynamic>`); read reactive deps at top; no early returns (use `<Show>`); no new tracking after `await`; props as `p` (not destructured); step thunks pass **accessors**, not snapshots. |
| **PROTOCOL_ALL_TYPESCRIPT** | gap → **fixed in §4** | Descriptor is now generic `ImportWizardDescriptor<TUA, TReturn>` with `keyof typeof serverActions` action keys + annotated thunk params. No `any`, no bare-string dispatch. |
| **PROTOCOL_DENO_API** | conform | Layer 4 keeps the typed `defineRoute` registry-as-contract + the `APIResponse` `{success,data}\|{success,err}` envelope; the toolkit generates **handlers**, never bypasses the registry; structure's streaming routes keep the streaming sub-protocol. Boundary validation preserved. |
| **PROTOCOL_ALL_STRUCTURE / PROTOCOL_UI_STRUCTURE** | conform (naming) | Shared shell + kit under a `_`-prefixed dir (`_import_wizard/`); server helpers under `_toolkit/`; **snake_case filenames** (`import_wizard_shell.tsx`), components PascalCase; feature dirs keep the existing `index.tsx` entry convention. |
| **PROTOCOL_UI_COMPONENTS** | conform | Composes panther stepper / `StateHolderWrapper` / frame / form inputs; no hand-rolled primitives. |
| **PROTOCOL_ALL_TRANSLATION** | conform | All user-facing labels are `T3` / `TranslatableString {en,fr}` resolved via `t3`; descriptor label *values* must be `{en,fr}`, never hardcoded strings. |
| **PROTOCOL_UI_STYLING** | conform | No custom styling; inherits panther `ui-*` utilities, semantic colors, sentence case. |
| **PROTOCOL_ALL_SIZING** | n/a | Governs figure/viz/page sizing; importers render no figures. |

**Action helpers (DOC_STATE_RULES quick-ref):** step submit/confirm/delete use `timActionForm` / `timActionButton` / `timActionDelete`; the on-demand attempt fetch uses `timQuery`. These already back the existing wizards, so the shell + kit inherit them.
