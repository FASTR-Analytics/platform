# Plan — Importer Consolidation Toolkit

> **Status: dormant by design (v3, 2026-07-02).** Everything here is gated on
> a real second importer being in flight (e.g. the population importer) — see
> §1. **Goal: make building the *next* dataset importer cheap** — via shared
> UI patterns, server helpers, and a thin wiring scaffold.
>
> **This is deliberately NOT a monolithic generic engine** (that idea, from the now-deleted `PLAN_DATA_IMPORT_ARCHITECTURE.md`, was rejected on code evidence 2026-06-10 — see `PLAN_FACILITIES_SPLIT.md`), and it is independent of the facilities split. It consolidates *building blocks* while every importer stays its own readable file.

---

## 1. Economics first — why this waits for a customer

Be honest about demand before building abstractions:

- Importer code is **~3% of churn** (33 of 1,064 commits in 9 months).
- Exactly **one** new dataset family has ever been added (ICEH, 2026-05-19) → cadence ≈ **one new dataset per ~6 months**.
- Revealed preference: ICEH's author knew the codebase well enough to deliberately skip the worker machinery, yet still hand-cloned the wizard + state-machine boilerplate rather than build a shared helper. That's weak evidence the boilerplate is *annoying but cheap*.

**Conclusion:** the toolkit's payback is measured in **years**. Build it
**when there's a real second customer in flight**, so that customer
*justifies* each abstraction instead of it being built on spec. At that point
you'll have 4–5 real importers to design against. (There is no do-now work
left in this plan: the worker registry is keyed — `worker_store.ts` is
`Map<string, Worker>` — so a new worker-based importer has a generic slot.)

---

## 2. The consolidation toolkit (build on demand)

Goal: drop the marginal cost of a *new* importer. Honest costs (verified 2026-06, pre-review-cycle — see §10 caveat):

| Layer | Per-importer cost today | Realistic reduction |
|---|---|---|
| Client orchestrator (`index.tsx`) | 250–390 LOC; ~90% identical skeleton | ~50% |
| Client step components | ~600–2,000 LOC; partly duplicated | trim, not unify |
| Server stager + integrator | 220–910 LOC each; shared skeleton | ~33% (helpers) |
| Wiring (DB state-machine + routes + worker store) | 760–1,190 LOC | ~40–55% |

**Design principle: toolkit, not engine.** Extract reusable parts; each importer stays its own file; the irreducible cases (XLSForm metadata load, `select_multiple` 1→N fan-out, structure's strategy preview) stay as plain code. **Lead with the *marginal* number, not the gross-reduction %:** the real, defensible goal is *"the next simple CSV importer ships in <500 LOC total"* (vs. ~2,300–3,200 today).

---

## 3. Layer 1 — Client `<ImportWizardShell>`

**Today:** 4 orchestrators (hmis 387, hfa 283, iceh 251, structure 268 = **1,189 LOC**, ~90% identical skeleton: `createQuery` get-attempt → `getStepper` → 2s poll + `onCleanup` → `FrameTop`/`HeaderBarCanGoBack`/`StepperNavigationVisual` → `StateHolderWrapper` cascading `Switch`).

**The descriptor must use render-thunks, not bare component refs** — the review found bare refs can't carry the real variation:
```ts
// Fully typed — no `any`, no bare-string dispatch (PROTOCOL_ALL_TYPESCRIPT). TUA = this importer's
// upload-attempt detail type; TReturn = close() payload (structure returns { needsReload: true }).
type ImportWizardDescriptor<TUA, TReturn> = {
  getUploadAction: keyof typeof serverActions;            // typed action keys, resolved against the generated registry
  getStatusAction: (keyof typeof serverActions) | null;  // null ⇒ structure (streams progress; polls only while importing)
  deleteAction: keyof typeof serverActions;
  navMaxStep: number;                                     // stepper cap for goNext()
  // highest *renderable* step key may exceed navMaxStep — structure renders Step4 at
  // currentStep()===4 while navMaxStep===3 (reached only via server setCurrentStep). Model separately.
  steps: Record<number, (ua: TUA, ctx: StepCtx) => JSX.Element>;        // ctx carries ACCESSORS (structure: maxAdminArea, facilityColumns, silentRefreshInstance) — pass accessors down, never snapshot values
  progress: Array<{ status: string; render: (ua: TUA, pollingStatus: PollingStatus) => JSX.Element }>;  // HMIS staging vs staging_dhis2; ICEH synthetic "staged"; structure importing/importing_dhis2
  errorMessage: (status: TUA["status"]) => string;        // HMIS status.err / structure status.error / HFA+ICEH JSON.stringify
  getStepperValidation: (state: StateHolder<TUA>) => (step: number, state: StateHolder<TUA>) => { canPrev: boolean; canNext: boolean };
  typeLabel: T3;
};
```

**Build:** `client/src/components/_import_wizard/import_wizard_shell.tsx` (~180–200 LOC; component exported as `ImportWizardShell`) + a per-importer descriptor. **Render steps through Solid control-flow** — invoke `descriptor.steps[n]` inside `<Switch>/<Match>` (or `<Dynamic>`), not by imperative dispatch; read `currentStep()` + reactive deps at the top; step thunks obey `DOC_STATE_RULES` #1–3 (no early return — use `<Show>`; read reactive deps before any conditional/`await`; pass **accessors**, not snapshot values). See §9.

**Realistic impact:** 1,189 → **~530–570 LOC (~50%)** — descriptors aren't uniformly ~80 LOC (HMIS branching + 5 progress thunks ≈ 110–130; structure server-driven step-4 + extra props ≈ 110–130). **The honest win is marginal:** a *new simple* importer's orchestrator = a ~50-LOC descriptor.

**Port order:** ICEH (simplest) → HFA → HMIS → structure (last: streams staging progress, extra props, server-driven step-4, error-banner + in-progress states from the S5 cycle). Behavior-preserving; verify each end-to-end before deleting the old `index.tsx`.

---

## 4. Layer 2 — Client step kit (trim hard, don't unify)

**Reuse as-is (already shared):** [FileUploadSelector](client/src/components/_file_upload_selector.tsx), [Dhis2CredentialsEditor](client/src/components/Dhis2CredentialsEditor.tsx), [PeriodSelector](client/src/components/PeriodSelector.tsx).

**Extract only the high-confidence, multi-consumer atoms:**
- `SourceTypeStep` (hmis/structure `step_0`, ~95% identical) — parameterized by options + save action.
- `Dhis2CredentialsStep` (hmis/structure `step_1_dhis2`, ~98% identical) — parameterized by save action.
- `CsvUploadStep` (hmis/structure/hfa `step_1_csv`, ~90%; structure and HFA both take an optional second file — XLSForm).
- `CsvColumnSelectRow` — a **thin ~15-LOC atom** (`<Select options={csvHeaders}/>` row) shared by **HMIS + structure only**.

**Do NOT build a generic `ColumnMappingStep`.** The three `step_2_csv` are not one abstraction: HMIS = 4 fixed `Select`s; structure = *dynamic* (`facility_id` + `admin_area_1..maxAdminArea` + optional facility cols); **HFA = a heterogeneous form** (Select + free-text time-point `Input` + `PeriodSelect` with bespoke validation + a "saved" Switch state). Forcing HFA in means render-slots rich enough to be "a form" — i.e. reinventing panther's form primitives. HFA's mapping also couples to its stager via the `select_multiple` 1→N contract. **Leave HFA's step_2 bespoke.**

**Demote to "extract on second consumer," not speculative kit:** `StagingResultsStep`, `Dhis2SelectionTableStep`, `StagingStartStep`, `ProgressStreamingStep`. **Stays bespoke regardless:** HFA dual-file + time-point, ICEH zip preview, structure dynamic-AA + strategy-pick [step_4.tsx](client/src/components/structure_import/step_4.tsx), geojson feature mapping.

---

## 5. Layer 3 — Server building-blocks library

Extract under `server/server_only_funcs_importing/_toolkit/`, adopt in new code, refactor existing opportunistically **gated on a row-for-row output diff** vs. the legacy path:
```ts
createUnloggedStagingTable(db, name, columns[]) ; dropTablesIfExist(db, ...names) ; verifyStagingTableExists(db, name)
withBufferedInsert(db, {table, columns, bufferSize?}, fn)          // parameterized/COPY instead of inline-escaped VALUES
validateForeignKey(db, stagingTable, col, refTable, refCol, limit?)  // the LEFT JOIN…WHERE IS NULL pattern
withTunedTransaction(db, fn, {workMem?, maintenanceWorkMem?, synchronousCommit?})  // the char-identical SET LOCAL block
mergeRowUpsert(db, {stagingTable, targetTable, keyCols[], valueCols[], versionCol?}, versionId?)
mergePartitionReplace(db, {stagingTable, targetTable, partitionCol, partitionValue})
```
Already-generic, keep: [instantiate_worker_generic.ts](server/worker_routines/instantiate_worker_generic.ts) (READY→postMessage→COMPLETED), the CSV primitives. Bespoke transforms (`select_multiple` fan-out, XLSForm loader) stay plain functions the importer passes in. New importers should also get **their own staging-table names** (today's fixed names mean a re-run can collide across restarts). **Impact:** ~33% off existing stager/integrator LOC *if* migrated; the real value is per *new* importer.

> Also evaluate consuming panther's CSV modules (`_100_csv` / `_232_csv`) instead of wb-fastr's parallel `get_csv_components_streaming_fast.ts`. This is hygiene, not a bug fix (the streamer's quote-boundary bug was fixed in place, `c237008e`), and panther's modules are whole-string/whole-file — adoption would mean adding streaming there first.

---

## 6. Layer 4 — Wiring scaffold

**KEEP ONE TABLE PER IMPORTER.** The v1 "single merged `upload_attempts` keyed by `table_type`" idea is **cut.** Reasons (code-grounded): ~50 bare `UPDATE …_upload_attempts SET …`/`DELETE FROM …` sites with **no `WHERE`** rely on the single-row-per-table invariant (across DB modules *and* workers); the concurrency guard is table-scoped with no importer filter. Merging means threading a `table_type` predicate through all ~50 sites in un-watched workers, losing the DB-enforced "HFA `source_type NOT NULL`", to unlock cross-dataset concurrency **nobody requested**.

**6a — Table-name-parameterized CRUD helpers** (the real, safe saving):
```ts
getRawUA(db, attemptTable) ; addUploadAttempt(db, attemptTable, init) ; getUploadAttemptDetail(db, attemptTable)
getUploadStatus(db, attemptTable) ; deleteUploadAttempt(db, attemptTable, { workerKey }) ; updateStepResult(db, attemptTable, n, result, {...})
```
Each importer keeps its own table + its step-transition bodies (importer-specific claim/launch logic stays put — the conditional-UPDATE claim pattern is the contract, see SYSTEM_05/06). Saves the generic CRUD (~120–180 LOC/importer), not the whole module.

**6b — Route *handler* generator, NOT a registry factory.** The typed registry (`lib/api-routes/instance/*.ts`) is **irreducible**: `defineRoute` is keyed by compile-time literal route names, and the auto-generated server actions derive their `body`/`response` types from those literals. A runtime factory can't emit typed literals → the registry stays hand-written per importer (~50–170 LOC). The factory can generate the standard *handlers* — but those are already ~6 LOC each, so the win is ~40–50 LOC/importer. Bespoke routes stay explicit and are a large fraction.

**Server actions remain auto-generated** ([create_server_action.ts](client/src/server_actions/create_server_action.ts)) — zero per-importer client API code. **Realistic impact:** 760–1,190 → **~350–500 LOC/importer (~40–55%)**. The defensible headline is **"<500 LOC total for a new importer."**

---

## 7. What goes in panther (and what doesn't)

Panther is UI + viz/figure + doc-generation + fonts + CSV parsing + generic utils — grepping panther for Postgres / `UNLOGGED` / workers / Hono routing returns **nothing**. That boundary decides it. (Edit panther in the **source** repo `~/projects/panther/timroberton-panther` and re-sync; never edit `panther/` here. Panther edits require explicit sign-off from Tim first.)

**The boundary, simply: panther = generic UI frame + CSV/file primitives, no DB/workers/routes. The *frame* of the wizard goes to panther; the *meaning* of each step and everything server-side stays in wb-fastr.**

- **Already in panther (correctly):** `getStepper`, `StateHolderWrapper`, `HeaderBarCanGoBack`, `createQuery`, form inputs, tables, progress bar — most of "the shared skeleton" is panther today.
- **Promote to panther (the one genuinely-generic new thing):** a **domain-agnostic `<WizardShell>`** — composes stepper + frame + state-holder + a slotted step-switch + optional async-state. **Keep all import semantics OUT of it** (upload-attempt resource, staging/integrating statuses, source_type, polling cadence). wb-fastr's `<ImportWizardShell>` (§3) = panther `<WizardShell>` + the FASTR import wiring. Optionally a generic `pollUntil` hook.
- **Stays in wb-fastr:** the entire step kit (DHIS2 creds, CSV mapping, admin-area mapping, staging results), `FileUploadSelector` (Uppy/TUS + asset/SSE model), all of Layer 3 (Postgres ETL helpers) and Layer 4 (upload-attempt tables, handler generator, worker registry). If the server helpers ever need cross-project sharing, that's a *separate* Deno-Postgres util lib, not panther. Route work must **conform to** panther's `PROTOCOL_DENO_API`; if it reveals a missing convention, fix the protocol and re-sync.

**Net: only `<WizardShell>` is worth newly promoting.** Everything that knows about datasets, DHIS2, Postgres, workers, or routes stays app-side.

---

## 8. Sequencing & milestones

**All milestones run only when a real second importer is in flight (e.g. population):**

1. **M1 — Wizard shell (Layer 1), a cross-repo sequence:**
   - **M1a — `<WizardShell>` in panther** *(panther repo — requires Tim's sign-off)*. Build the domain-agnostic shell under `_303_components/layout/`, composing the stepper it already owns + frame + state-holder + a slotted step-switch. **No upload/staging/`source_type`/poll semantics.** Export from `mod.ui.ts`; **re-sync** into wb-fastr's `panther/`.
   - **M1b — `<ImportWizardShell>`** *(wb-fastr)*. Compose the synced `WizardShell` + the §3 render-thunk descriptor + the import wiring. Build it against the new importer in M2.
   - **M1c — port the existing four** *(wb-fastr)* opportunistically: ICEH → HFA → HMIS → structure. Behavior-preserving; delete each old `index.tsx` only after end-to-end verification. Never a big-bang.
2. **M2 — first real customer on the toolkit** *(wb-fastr)*. Build the next needed importer using the CRUD helpers (6a), the handler generator (6b), the step atoms (§4), and the server helpers (Layer 3). **Success metric: <500 LOC total** (excl. genuinely-unique transform/preview).
3. **M3 (optional) — back-fill** existing importers onto the toolkit when touched. Never a big-bang cutover.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Insert-path swaps (Layer 3) change stored bytes | Row-for-row diff per pipeline before deleting legacy; never swap blind |
| R2 | Shell descriptor under-models variation (progress thunks, error accessor, nav-vs-render step, `TReturn`) | Use the render-thunk descriptor in §3; port structure last as the stress test |
| R3 | Over-extracting the step kit creates leaky abstractions the 5th importer fights | §4: extract only multi-consumer atoms; HFA stays bespoke; demote the rest to on-demand |
| R4 | No server `--watch` — slow inner loop on Layer 3/4 | Budget for manual restarts |
| R5 | Building the toolkit on spec before a real customer | Gate everything on M2 having an actual importer to justify each abstraction |

---

## 10. Verified inventory (appendix)

> Measured 2026-06 (v2 fact-check, 48 claims: 46 confirmed / 2 partial / 0 refuted). The 2026-07 review cycles changed several of these files (structure ELT claims, ODK label resolution, wizard error/in-progress states), so treat LOC and line refs as approximate until re-measured; the *shape* conclusions (shared skeleton, similarity percentages, single-row invariant) still hold.

Client orchestrators: hmis 387, hfa 283, iceh 251, structure 268 = **1,189 LOC**. Shared components: FileUploadSelector 120, Dhis2CredentialsEditor 99, PeriodSelector 158. Step similarity: source-type ~95%, dhis2-creds ~98%.

Server stagers/integrators ≈ **4,752 LOC** (stage_hmis_csv 787, stage_hmis_dhis2 911, stage_hfa_csv 481, integrate_hmis 334, integrate_hfa 224, stage_structure_csv 334, stage_structure_dhis2 508, integrate_structure 550, dataset_iceh 623). `SET LOCAL` block char-identical (integrate_hmis, integrate_hfa). FK-check `LEFT JOIN…WHERE IS NULL` in three sites. Buffered-insert identical-in-logic for HMIS (10k) + HFA (100k) only.

Wiring: 4 upload-attempt tables, `CHECK (id='single_row')`; HFA `source_type NOT NULL`, ICEH no `source_type`. Routes: datasets.ts 26 handlers, iceh.ts 10, structure.ts 17 `defineRoute` (+1 raw CSV export). Server actions auto-generated. worker_store.ts = keyed `Map<WorkerKey, Worker>`. ICEH is fire-and-forget async (`updateStep2` calls `stageAndIntegrateIcehData` without `await`); structure streams progress (`streamResponse`) instead of polling during staging. Per-importer total ≈ **760–1,190 LOC wiring + UI**.

---

## 11. Relationship to other plans

- `PLAN_FACILITIES_SPLIT.md` — the facilities split + HFA weights + viz family-threading program. Independent of this plan, except: do not port the structure wizard the same night the split changes structure-import server behavior.
- Population table — future, independent; the natural **first real customer** that would justify the toolkit.

---

## 12. Protocol & state-management conformance

Checked against `panther/protocols/*` and the three state docs. Verdicts + any required adjustment:

| Protocol / doc | Verdict | Adjustment |
|---|---|---|
| **DOC_STATE_* + PROTOCOL_UI_STATE** | **conform** (clarify the tier) | Upload attempts are **T3 component-local** (`DOC_STATE_MGT_INSTANCE.md` rule #8; T3 table). The 2s poll + `silentFetch` is the **sanctioned** T3 pattern — `DOC_STATE_MGT_TIERS.md` lists "Upload workflows (transient per-user state + polling)" as canonical T3. The "no manual refetch" rule is **T2-scoped** and does **not** apply. Keep the attempt component-local: **no provider, no state file, no Context/hooks/prop-threading-for-state**. Use `createQuery` for the fetch; **never `createResource`** (`DOC_STATE_RULES.md` #9). The panther `<WizardShell>` stays state-agnostic — the `createQuery` + poll live only in wb-fastr's `<ImportWizardShell>`. |
| **PROTOCOL_UI_SOLIDJS + DOC_STATE_RULES #1–3** | conform **iff §3 note followed** | Render via control-flow (`<Switch>/<Match>`/`<Dynamic>`); read reactive deps at top; no early returns (use `<Show>`); no new tracking after `await`; props as `p` (not destructured); step thunks pass **accessors**, not snapshots. |
| **PROTOCOL_ALL_TYPESCRIPT** | conform | Descriptor is generic `ImportWizardDescriptor<TUA, TReturn>` with `keyof typeof serverActions` action keys + annotated thunk params. No `any`, no bare-string dispatch. |
| **PROTOCOL_DENO_API** | conform | Layer 4 keeps the typed `defineRoute` registry-as-contract + the `APIResponse` envelope; the toolkit generates **handlers**, never bypasses the registry; structure's streaming routes keep the streaming sub-protocol. Boundary validation preserved. |
| **PROTOCOL_ALL_STRUCTURE / PROTOCOL_UI_STRUCTURE** | conform (naming) | Shared shell + kit under `_import_wizard/`; server helpers under `_toolkit/`; snake_case filenames, components PascalCase; feature dirs keep the `index.tsx` entry convention. |
| **PROTOCOL_UI_COMPONENTS** | conform | Composes panther stepper / `StateHolderWrapper` / frame / form inputs; no hand-rolled primitives. |
| **PROTOCOL_ALL_TRANSLATION** | conform | All user-facing labels are `T3` resolved via `t3`; descriptor label *values* must be translatable objects, never hardcoded strings. |
| **PROTOCOL_UI_STYLING** | conform | No custom styling; inherits panther `ui-*` utilities, semantic colors, sentence case. |
| **PROTOCOL_ALL_SIZING** | n/a | Governs figure/viz/page sizing; importers render no figures. |

**Action helpers (DOC_STATE_RULES quick-ref):** step submit/confirm/delete use `createFormAction` / `createButtonAction` / `createDeleteAction`; the on-demand attempt fetch uses `createQuery`. These already back the existing wizards, so the shell + kit inherit them.
