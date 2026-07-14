# Plan — DHIS2 importer UI revision (wizard + tabbed listing)

**Status (2026-07-15): proposal only, nothing built.** Written after Tim
reviewed the Phase 4 imports surface (`PLAN_DHIS2_IMPORTER.md` §6.1 Phase 4,
shipped) and found it doesn't match his intent: the surface is one long
page stacking a flat launcher form, a queued table, a stored-credentials
card, a schedules card (with its own inline flat editor), and a history
table — "a jumble of wizard and listing." This plan is client-UI-only; the
backend contract from PLAN_DHIS2_IMPORTER.md (runs table, scheduled-imports
table, ledger, all server actions/routes) does not change.

**Revised 2026-07-15 after adversarial review:** step-1 validation contract
corrected (no validate-only route exists; stored creds can never be
pre-validated), step 3 surfaces the full unattended gate (both halves),
step 5 computes the Start/Queue fork from live run state and blocks the
inline-creds+queue combination, hard no-overlay rule inside the wizard,
queued rows keep direct Remove, tab badges + shell-owns-plumbing added.
CSV rows explicitly NOT folded in (Tim's ruling) — see §2 and §6.
Follow-up loose ends pinned same day: step-1 save = explicit "Validate
and save" button (not a checkbox, not bundled into Next); step-5
submit race = accepted, backstopped by the runs table's partial unique
index (no client-side locking).

## 1. What's wrong (evidence, current code)

`client/src/components/instance_dataset_hmis/dhis2_run/`:

- `index.tsx` renders one scrolling column: attention banner → (`_run_view`
  if a run is active, else `_launcher` inline) → "queue another import"
  toggle → `_queued` table → `_stored_credentials` card → `_schedules` card
  → `_run_history` table. No tabs, no separation of concerns.
- `_launcher.tsx` is a single flat form — credentials, indicator picker,
  and period range all visible at once, one submit button. Not a wizard;
  never dismisses (it lives permanently on the same page as the listing).
- `_schedules.tsx` embeds its own second flat form (kind radio + day/time/
  timezone/interval or one-shot datetime + indicator picker + months-back),
  expanding inline above the schedules table. A second, slightly different
  ad-hoc form for the same underlying concepts (indicators, credentials-
  via-`hasStoredCredentials`, timing).
- `_queued.tsx` rows have an inline "Remove" button only — no click-through
  detail.
- Stored-credentials management (`_stored_credentials.tsx`) is a third
  standalone card, disconnected from both forms above even though both
  forms need to know whether stored credentials exist.

Net effect: four different places to configure overlapping concepts
(credentials, indicators, timing), stacked vertically with no navigational
structure, matching Tim's "jumble" description exactly.

## 2. Target shape (agreed with Tim, 2026-07-15)

One shared 5-step wizard for every way a DHIS2 import gets configured (ad
hoc run, queue, one-shot future run, recurring schedule), and a 3-tab
listing for everything already configured. Confirmed decisions:

- **One wizard, not two.** The same 5-step flow handles both an immediate
  run and a scheduled one — step 3 ("time") is where the immediate/later/
  recurring fork happens, not a fork at the entry point.
- **Tabs = Current / Future / History** (three, not two) — history
  (completed runs) gets its own tab rather than folding into Current,
  since a finished run is neither running nor upcoming.
- **Credentials live in step 1 of the wizard.** Step 1 both manages the
  stored connection (save/replace/delete) and lets the user pick
  stored-vs-inline for this particular launch.
- **CSV rows are not folded in** (decided 2026-07-15). The surface stays
  DHIS2-only in content, but tabs, headings, and component naming stay
  source-neutral ("Imports", not "DHIS2 imports") so Phase 5's CSV
  re-flow can slot CSV upload attempts into Current and CSV versions
  into History without a second restructure. The wizards stay separate
  regardless — the CSV flow is a resumable server-persisted staged
  editor, this wizard is deliberately transient client-local state.

## 3. The wizard

Steps, in the order Tim specified:

1. **Credentials.** If a stored connection exists: shown as the default
   ("Use stored connection: `{url}` — `{username}`"), with Replace/Delete
   actions inline (inline confirm UI — see the overlay rule below). If
   none exists, or the user opts to override: the existing
   `Dhis2CredentialsEditor` fields (url/username/password).
   **Saving is an explicit button, not a checkbox (pinned 2026-07-15):**
   the inline-editor state has two exits — just proceed with Next (inline
   credentials, this run only), or press a "Validate and save connection"
   button (today's `_stored_credentials.tsx` semantics) which round-trips
   `saveDatasetHmisDhis2Credentials`, then flips step 1 to the
   stored-connection display and refreshes the scheduling query so
   `hasStoredCredentials`/`unattendedReady` are current for the step 3/5
   blockers. The save must actually happen before those steps evaluate —
   which is why it cannot be deferred to Next or to final submit — and
   bundling it into Next would make navigation destructive (replacing
   stored credentials as a side effect, persisting even if the wizard is
   abandoned). A save followed by wizard abandonment leaves the
   connection saved: correct, a button press is a committed action.
   **Validation contract (corrected 2026-07-15):** there is no standalone
   validate-connection route, and stored credentials deliberately cannot
   be pre-validated at all (decryption is worker-only — see the comment
   in `launchDatasetHmisDhis2Run`). So step 1 validates only when it
   saves: the save button goes through
   `saveDatasetHmisDhis2Credentials`, which validates server-side before
   storing and surfaces the error inline. Inline-no-save credentials are
   validated at launch (step 5 submit), exactly as today. Next out of
   step 1 gates on field completeness only — no connection round-trip.
   (A validate-only route would be a scope change; not added.)
   Doubles as a standalone entry point: a small "Manage connection"
   affordance outside the wizard (e.g. next to the "New import" button)
   opens step 1 alone, save-only, no Next — so a password rotation
   doesn't require stepping through the whole wizard. This is the one
   piece of step 1 that exists outside the wizard shell; everything else
   below is wizard-only.
2. **Indicators.** Just the indicator picker (reuse `_indicator_picker.tsx`
   as-is). No period/window fields here — that moves to step 4, so step 2
   is purely "which raw indicators."
3. **Time.** Three choices: **Now**, **Later (once)**, **Recurring**.
   - Now → immediate launch (or queue, decided at review — see below).
   - Later → the existing one-shot datetime picker.
   - Recurring → the existing day-of-week + start-time + IANA timezone +
     interval-weeks pickers, with the Nigeria ~01:15 Africa/Lagos hint kept
     as helper text (unchanged from today).
   - If Later/Recurring is chosen but the instance isn't unattended-ready,
     show an inline blocker rather than silently disabling the option.
     The gate is the server's `assertUnattendedReady` and has **two**
     halves: stored credentials AND a shadow-verified import against the
     stored URL. The wizard consumes `unattendedReady` from
     `getDatasetHmisDhis2Scheduling` (already returned) and mirrors
     today's two messages: no stored credentials → "save credentials
     first" with a "Back to step 1" link; stored but not shadow-verified
     → "run an import directly first" (today's copy in `_schedules.tsx`).
     Sequencing consequence to make legible in the copy: credentials
     saved fresh in step 1 (a new URL) can never pass the shadow half in
     the same wizard pass — that is deliberate backend behavior, and the
     blocker must present it as "run one import directly first," not as
     an error.
4. **Config.** The data window: explicit start/end period range for
   Now/Later (today's `PeriodSelector`), or "current month + previous N"
   rolling-window input for Recurring (today's `monthsBack` field). This
   is the one field whose shape depends on step 3's choice; everything
   else in the wizard is choice-independent.
5. **Review & launch.** Summary of steps 1–4 (connection, N indicators,
   when, window) **including the computed pair total** ("N indicators ×
   M months = P pairs" — today's launcher's most useful pre-launch sanity
   check, kept), and a single CTA button whose label and action depend on
   step 3:
   - Now, no run active → "Start import" → `launchDatasetHmisDhis2Run`.
   - Now, a run is already active → "Queue import", with explicit review
     copy ("An import is currently running — this will start after it
     finishes") → `enqueueDatasetHmisDhis2Run`. This satisfies the
     existing "explicit queueing, never silent" ruling
     (PLAN_DHIS2_IMPORTER.md §7 C6) through the review step's own copy +
     deliberate click — **the separate `openConfirm` popup in today's
     `_launcher.tsx` is retired**, folded into this step (and its
     retirement is mandatory anyway — see the overlay rule below).
   - The Start-vs-Queue fork is computed from **live run state when step
     5 renders and again at submit**, never captured at wizard open — the
     ~60 s scheduler tick (or another user) can start a run while the
     wizard is up. The residual sub-second race (tick fires between the
     submit-time check and the server's claim) is accepted: the runs
     table's partial unique index (Phase 3's single-running claim) turns
     a lost race into an explicit server refusal, never a silent second
     run — that refusal is the last line of defense, and the builder
     should NOT add client-side locking on top. On that error the wizard
     stays on step 5, shows the error inline, and the refreshed fork
     flips the CTA to "Queue import" for the second click. (The benign
     direction — queueing just as the run finishes — is also fine: the
     tick drains queued rows FIFO within ~60 s.)
   - Queued fires run with the stored connection only
     (`enqueueDatasetHmisDhis2Run` refuses without stored credentials,
     and inline credentials would be silently discarded). If the CTA
     resolves to Queue but step 1 chose inline-without-save, show the
     same inline-blocker-with-back-link pattern as step 3 ("queueing
     needs the stored connection — back to step 1") instead of letting
     the submit fail.
   - Later/Recurring → "Schedule import" →
     `createDatasetHmisDhis2Schedule` (or `updateDatasetHmisDhis2Schedule`
     when editing — see §5).
   On success: **the wizard closes**, returning to the listing (Current
   tab if launched/queued now, Future tab if scheduled) — this is the
   dismiss behavior Tim asked for and today's implementation lacks
   entirely.

**Reduced-step variant for checklist actions** ("re-import this
indicator" / "retry failed pairs", which pass fixed `Dhis2RunPair[]`):
step 2 is replaced with a read-only pair-count summary (today's preset
copy) and step 4 is skipped (the window is already baked into the pairs).
Step 3 only offers Now/Queue — a fixed one-off pair list is not
sensibly schedulable, so Later/Recurring aren't shown. Steps 1 and 5
behave identically to the full wizard. Entry mechanics: checklist
actions today pass `presetPairs`/`presetLabel` into the full-page
editor's inline launcher; under this plan the listing auto-opens the
wizard modal (this reduced variant) when those props are present.

**Editing an existing schedule** (Future tab → Edit) reopens the same
wizard prefilled from the schedule row (stored connection preselected,
indicators/kind/timing/window populated), landing on step 1 with full
navigation available; Review calls `updateDatasetHmisDhis2Schedule`
instead of create.

**Mechanically: a modal, not a full-screen editor** — revised from the
initial draft after comparing panther's stepper options with Tim
(2026-07-15). Panther has one headless stepper engine,
`getStepper(dataAccessor, options)`, with several interchangeable visual
skins (`modules/_303_components/layout/stepper/`): `StepperNavigationVisual`
(numbered circles + connectors + built-in Prev/Next — what the CSV wizard
uses) and `StepperChipsWithTitles` (numbered chips + inline labels,
click-to-jump, no built-in Prev/Next — what the "Add visualization" flow
uses), among others. The modal-vs-full-screen choice is unrelated to which
skin is used: modal-ness belongs entirely to how "Add visualization" is
*opened* (`openComponent` → `ModalContainer`, the same overlay system as
`openAlert`/`openConfirm`), not to the stepper component, which reads no
modal context and just renders chips.

This wizard should follow the "Add visualization" pattern in full:
`getStepper` + `StepperChipsWithTitles` (cleaner than the CSV wizard's
circles-and-connectors), opened via `openComponent`/`ModalContainer`
(`AlertComponentProps`, `topPanel`/`leftButtons`/`rightButtons` for
Back/Next/the step-5 submit) instead of the CSV wizard's full-screen
`openEditor`/`EditorComponentProps`. A modal fits this wizard's actual
shape better than a full-screen push: it's a short, transient
configure-and-submit action launched from the listing (open → step
through → submit → close back to exactly where you were), not a
multi-session resumable flow. That also matches "Add visualization"
functionally — a step wizard invoked from a details page, submitted, and
dismissed back to it. Note `StepperChipsWithTitles` is click-to-jump:
any step gating (step 1 completeness, the step 3/5 blockers) must gate
chip jumps too, not just the Next button.

**Overlay rule (hard constraint): nothing inside the wizard may call
`openConfirm`/`openAlert`/`openPrompt`/`openComponent`, including
indirectly via `createDeleteAction`.** Panther's overlay slot is
single-occupancy (one `alertState` signal in
`_303_components/special_state/alert.tsx`) — a nested open call REPLACES
the wizard modal, the wizard's resolver never fires (the awaiting
promise hangs), and all step state is lost. This is the same hazard
already hit in the report-editing work. Concretely: step 1's
Replace/Delete stored-connection actions (today `createDeleteAction` →
`openComponent` in `_stored_credentials.tsx`) must become inline confirm
UI inside the step, and all errors surface via inline
`StateHolderFormError`, never `openAlert`. The standalone "Manage
connection" modal is under the same constraint.

One real difference from "Add visualization" to carry over deliberately:
step state here is **client-local only** (signals, like "Add
visualization"'s `selectedMetricId`/etc.), not server-resynced like the
CSV wizard's `stepper.setCurrentStep(res.data.step)` — nothing is
persisted server-side until step 5's submit, so there is no
resume-a-half-finished-wizard behavior, and none is wanted (an abandoned
wizard should just vanish, unlike the CSV wizard's staged-upload state
which deliberately survives a closed tab).

## 4. The listing

`index.tsx` becomes a thin shell: header, persistent attention banner
(schedule refused/missed/errored — unchanged content from today, shown
regardless of active tab so it's never missed), a "New import" button
(opens the wizard) + "Manage connection" affordance, and a 3-tab body.

The shell keeps the data plumbing: both queries
(`getDatasetHmisImportRuns` + `getDatasetHmisDhis2Scheduling`), the 2 s
poll-while-active loop, and the SSE wake-up effect stay in `index.tsx`
and run regardless of which tab is visible — a run must keep progressing
while the user sits on History.

Tabs carry count badges (Current: running + queued; Future: enabled
schedules). The tabbed layout hides two-thirds of the surface at any
moment, so the at-a-glance activity signal today's single page gives for
free moves into the tab strip; the attention banner covers failures.

- **Current** — merges today's `_run_view` + `_queued`: a list with the
  one running run (if any) plus queued runs beneath it in FIFO order.
  Clicking the running row opens its detail (today's `_run_view` progress
  bar/phase/active-pairs/Cancel, unchanged content, now behind a click
  rather than always-inline). Queued rows keep Remove as a direct row
  action — the same single-click state-flip reasoning as the Future
  tab's Enable/Delete; a queued row has almost no detail to reveal, so a
  click-through would add a click for nothing. Empty state: "No imports
  running" + the New import button, plus the next scheduled fire time
  when one exists (data already in the scheduling summary) to orient
  toward the Future tab.
- **Future** — today's `_schedules.tsx` table (enabled toggle, when,
  selection, last outcome, created-by), minus the inline editor (moved
  into the wizard). Clicking a row (or its Edit action) opens the wizard
  prefilled (§3). Enable/disable toggle and Delete stay as direct row
  actions — they're single-click state flips, not configuration, so they
  don't need the wizard.
- **History** — today's `_run_history.tsx`, unchanged, moved to its own
  tab instead of sitting at the page bottom.

## 5. Scope

**Client-only.** No new routes, no schema changes, no server action
changes — every `serverActions.*` call listed above already exists and
keeps its current signature (`launchDatasetHmisDhis2Run`,
`enqueueDatasetHmisDhis2Run`, `createDatasetHmisDhis2Schedule`,
`updateDatasetHmisDhis2Schedule`, `setDatasetHmisDhis2ScheduleEnabled`,
`deleteDatasetHmisDhis2Schedule`, `cancelDatasetHmisDhis2Run`,
`getDatasetHmisImportRuns`, `getDatasetHmisDhis2Scheduling`, the
credentials save/delete routes). This is a restructuring of
`dhis2_run/` components, not a change to what the app can do.

**File-level sketch** (builder may adjust names, not the shape):

- New: `dhis2_run/_wizard/index.tsx` (step controller) +
  `_step_credentials.tsx`, `_step_indicators.tsx`, `_step_time.tsx`,
  `_step_config.tsx`, `_step_review.tsx`.
- New: `dhis2_run/_tab_current.tsx`, `_tab_future.tsx`,
  `_tab_history.tsx` (thin wrappers; `_tab_history.tsx` is close to a
  rename of today's `_run_history.tsx`).
- Retired: `_launcher.tsx` (replaced by the wizard); the inline-editor
  half of `_schedules.tsx` (replaced by the wizard; its table-rendering
  half moves into `_tab_future.tsx`); `_queued.tsx` as a standalone file
  (its table logic moves into `_tab_current.tsx`).
- Reused as-is: `_indicator_picker.tsx`, `_run_view.tsx`,
  `Dhis2CredentialsEditor`, `PeriodSelector`.
- `_stored_credentials.tsx`'s save/replace/delete logic moves into the
  wizard's step 1 component, reused by the standalone "Manage connection"
  entry point (§3, step 1).
- `index.tsx` shrinks to the tab shell described in §4.

All new/changed strings inline `t3` en/fr/pt per DOC_TRANSLATION.md, same
as the rest of this feature.

## 6. Explicitly out of scope

- Phase 5 (CSV wizard re-flow, PLAN_DHIS2_IMPORTER.md §9) is untouched by
  this plan — it rides on whatever the imports surface looks like once
  this ships, per that plan's own sequencing.
- Folding CSV upload attempts/versions into the tabs — Tim ruled against
  (2026-07-15); Phase 5 territory. The tabs are named source-neutrally
  now (§2) so that fold-in needs no restructure later. Acknowledged
  consequence until then: the History tab (DHIS2 runs, operational
  granularity) and the HMIS sidebar's "View previous imports"
  (`_previous_imports.tsx` — dataset versions, both sources,
  click-through to `ImportInformation`) remain two overlapping history
  surfaces one click apart, joined by the Version column. This plan does
  not touch `PreviousImports`; Phase 5 should resolve the duplication
  (likely by absorbing version rows into History and retiring the
  sidebar entry — the versions table's "DHIS2 Failures" column is
  run-history drift evidence).
- No change to scheduler tick semantics, the unattended gate, queue
  draining, or any DB-layer behavior — this is presentation only.
- No validate-only connection route (see §3 step 1's validation
  contract) — adding one is a possible future nicety, not part of this
  client-only plan.

## 7. Open items for Tim to confirm before build

- Should "Manage connection" (the standalone step-1-only entry point,
  §3) be a button next to "New import," or folded into a small icon/menu
  — cosmetic, builder's call unless Tim wants to weigh in.
- Whether the Current tab's running-row click-through should be a full
  navigation (push a detail view) or an inline expand-in-place — both
  satisfy "click to see progress/cancel"; builder's call unless Tim has a
  preference from other parts of the app.
- Confirmed 2026-07-15: the wizard is a modal (`openComponent`/
  `ModalContainer` + `getStepper`/`StepperChipsWithTitles`, matching "Add
  visualization"), not a full-screen editor — see §3.
- Confirmed 2026-07-15: CSV rows are not folded into the tabs (§2, §6);
  queued rows keep direct Remove rather than a click-through (§4).
