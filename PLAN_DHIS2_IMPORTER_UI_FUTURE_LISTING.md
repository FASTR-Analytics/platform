# Plan — DHIS2 Future listing: no Enabled column, recurring vs one-time sections, human wording

**Status (2026-07-15): proposal only, nothing built.** Follow-up to the
imports-surface revision (`fdbcf49e`) and the period-selection change
(working tree). Design agreed with Tim in conversation 2026-07-15; this doc
is the mechanical build spec. All file/line references verified against the
working tree (post period-selection).

## 0. Tim's rulings (the why — decisions, not open questions)

- **The Enabled column makes no sense and goes away.** With set-and-forget
  scheduling there must be ONE place to configure (the wizard, via Edit)
  and ONE off-switch (Delete). A visible on/off toggle implied one-at-a-time
  semantics and created zombie "Off" rows.
- **The pause concept is removed entirely**, not just hidden. A schedule is
  either listed in Future (live) or deleted. Pausing a recurring import =
  delete it, recreate it later in the wizard (cheap).
- **A one-shot that already ran must not linger in the Future tab.** A past
  event in a "Future" list is a category error. Its run is already in
  History with "(scheduled)" attribution — nothing is lost by removing the
  spent row.
- **Recurring and one-time rows get separate sections** — their columns
  genuinely differ ("Last run" is meaningless for a pending one-shot;
  "Runs at" is meaningless for recurring).
- **"Fire" never appears user-facing.** "Run" everywhere ("Last run",
  "Runs at", "Didn't run"). "Fire" stays in code/scheduler-land.

**What survives server-side:** `enabled` remains in the DB as the one-shot
**spent latch** (the tick disables a one-shot after handling its occurrence
so it can never fire twice; editing re-arms it — unchanged Phase 4
semantics, including the unattended-gate re-check on one-shot edits). It is
no longer a user control: after this change, recurring rows are always
`enabled = true`, and `enabled = false` occurs only on handled one-shots.

**Lifecycle after this change (one-shots):**

| State | `enabled` | `last_outcome` | Future tab | Cleanup |
|---|---|---|---|---|
| Pending | true | NULL | One-time section, "Scheduled" | — |
| Fired, run running | false | launched | hidden (run is in Current tab) | swept when run ends ok/cancelled |
| Fired, run ok/cancelled | false | launched | hidden | **swept by tick (§3)** |
| Fired, run errored | false | launched (+run error) | One-time section, "Run failed — see History" | user Edit (re-arms) or Delete |
| Refused / missed | false | refused/missed | One-time section, "Didn't run" | user Edit (re-arms) or Delete |

Recurring rows are always visible in the Recurring section; refusals/
failures show in its "Last run" column (and the attention banner, unchanged).

## §1. `server/db/instance/dataset_hmis_scheduled_imports.ts`

**1a. Delete `setDatasetHmisScheduledImportEnabled`** (lines 203–246, the
whole function including its re-arm/refuse-past-one-shot logic — that logic
exists only to serve the toggle and moves nowhere).

**1b. Add the sweep primitive.** Place it after
`recordScheduledImportOutcome` (line ~362), before
`hasScheduledImportAttention`:

```ts
// Spent one-shots leave the listing once they have nothing left to say: the
// occurrence was handled (enabled=false latch), the outcome was 'launched',
// and the launched run is no longer running or errored (complete, cancelled,
// or deleted). Refused/missed one-shots and launched-but-errored ones are
// deliberately NOT swept — they carry the attention state until the user
// edits (re-arms) or deletes them. Every condition lives in the one atomic
// DELETE, so a concurrent edit (which re-enables and clears the outcome)
// can never lose a just-re-armed row.
export async function sweepSpentOneShotScheduledImports(
  mainDb: Sql,
): Promise<number> {
  const deleted = await mainDb`
    DELETE FROM dataset_hmis_scheduled_imports s
    WHERE s.kind = 'one_shot'
      AND s.enabled = false
      AND s.last_outcome = 'launched'
      AND NOT EXISTS (
        SELECT 1 FROM dataset_hmis_import_runs r
        WHERE r.id = s.last_run_id
          AND r.status IN ('running', 'error')
      )
  `;
  return deleted.count;
}
```

(The `NOT EXISTS` form deliberately also sweeps a launched one-shot whose
run row has vanished — outcome with no run to show is a zombie. A
schedule-launched run is never `queued`, so those two statuses are the
complete keep-list.)

**1c. Update the stale comment** on `recordScheduledImportOutcome`'s
`disable` arg (lines 349–351). It currently says "the row is kept — the
listing shows it fired, linking to its run", which is exactly the policy
this plan removes. Replace with:

```ts
    // One-shots disable after their occurrence is handled — the spent latch
    // that stops refires. Launched-and-completed rows are swept from the
    // table by the tick (sweepSpentOneShotScheduledImports); refused/missed/
    // run-errored rows stay until the user edits (re-arms) or deletes them.
```

Nothing else in this file changes: `claimScheduledImportOccurrence`'s
`enabled = true` condition, `updateDatasetHmisScheduledImport`'s re-arm
(`enabled = CASE WHEN one_shot THEN true …`), and `createDatasetHmis…`'s
`enabled = true` insert are all still correct under the new model.

## §2. Migration `060_scheduled_imports_no_pause.sql`

New file `server/db/migrations/instance/060_scheduled_imports_no_pause.sql`
(059 is the latest). Data-only, no schema change — the `enabled` column
stays (spent latch, §0):

```sql
-- The pause concept is removed (PLAN_DHIS2_IMPORTER_UI_FUTURE_LISTING):
-- delete rows that only the removed enable/disable toggle could have
-- produced. Deleting (not re-enabling) is deliberate — a migration must
-- never silently re-activate unattended fetching the user had switched
-- off. Handled one-shots (last_outcome set) are NOT touched: launched ones
-- are swept by the scheduler tick once their run completes; refused/missed
-- ones stay for the attention flow.
DELETE FROM dataset_hmis_scheduled_imports
WHERE enabled = false
  AND (
    kind = 'recurring'
    OR (kind = 'one_shot' AND last_outcome IS NULL)
  );
```

Nothing has been deployed (P1–4 deploy is still outstanding), so this can
only ever touch dev-instance rows — but it is the difference between "the
toggle never existed" and invisible rows that render as live yet never
fire.

Run `./validate_migrations` after adding (a `.sql` file is touched, unlike
the period-selection plan).

## §3. `server/worker_routines/import_hmis_data_dhis2/scheduler.ts` — tick

In `tickDhis2ImportScheduler` (line 338), add the sweep as the first action
inside the `try` block, immediately after the `mainDb` acquisition (line
344) and **before** the busy-skip checks (lines 346–356) — sweeping is
bookkeeping on rows whose work is finished, so it must run even while an
import is active, otherwise a spent row lingers for the whole duration of
the next long-running import:

```ts
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

    // Spent-one-shot sweep (§0 lifecycle table): runs every tick, even when
    // the import slot is busy — it only deletes rows whose story has ended.
    const swept = await sweepSpentOneShotScheduledImports(mainDb);
    if (swept > 0) {
      await notifyDatasets(mainDb);
    }
```

Import `sweepSpentOneShotScheduledImports` from `../../db/mod.ts` (same
barrel the file already uses for the other schedule primitives). The
notify pushes the SSE summary so an open imports surface refreshes its
listing within the tick, not on next manual load.

No other scheduler change: `disable: schedule.kind === "one_shot"` at
lines 385/467 stays (it IS the spent latch), and the sweep will collect
the row on a later tick once the launched run leaves
`running`/`error`.

## §4. Route + client-action deletion (registry-as-contract)

Per DOC_API_ROUTES.md the registry drives everything — delete top-down and
let typecheck surface any missed consumer:

- **`lib/api-routes/instance/datasets.ts`** — delete the
  `setDatasetHmisDhis2ScheduleEnabled` registry entry (lines 201–205).
- **`server/routes/instance/datasets.ts`** — delete the whole
  `defineRoute(... "setDatasetHmisDhis2ScheduleEnabled" ...)` block (lines
  412–436) and remove `setDatasetHmisScheduledImportEnabled` from this
  file's imports.
- **Client** — `serverActions` is generated from the registry, so the
  action disappears with the registry entry; the only call site is the
  toggle removed in §5.

`assertUnattendedReady` keeps its two remaining callers (create; update of
one-shots) — the gate itself is untouched.

## §5. Client — `_tab_future.tsx` rewrite

Replace the single table with two sections. Full component spec (builder
may adjust trivial layout, not the structure, filters, or copy):

**5a. Exported visibility helper** (also consumed by §6's badge — export it
from this file, `index.tsx` already imports from siblings):

```ts
// One-time rows the Future tab shows: pending, or terminally attention-
// worthy. Launched rows whose run is running/complete/cancelled are hidden
// (Current tab shows the running run; the tick sweeps the row after) —
// keep this filter in lockstep with sweepSpentOneShotScheduledImports.
export function visibleFutureSchedules(
  schedules: DatasetHmisScheduledImport[],
): DatasetHmisScheduledImport[] {
  return schedules.filter((s) => {
    if (s.kind === "recurring") return true;
    if (!s.lastOutcome) return true;
    if (s.lastOutcome === "refused" || s.lastOutcome === "missed") return true;
    return s.lastOutcome === "launched" && s.lastRunStatus === "error";
  });
}
```

**5b. Section split** inside the component:

```ts
const recurring = () => visibleFutureSchedules(p.schedules).filter((s) => s.kind === "recurring");
const oneTime = () =>
  visibleFutureSchedules(p.schedules)
    .filter((s) => s.kind === "one_shot")
    .sort((a, b) => (a.runAt ?? "").localeCompare(b.runAt ?? ""));
```

**5c. Recurring section.** Heading
`t3({ en: "Recurring imports", fr: "Importations récurrentes", pt: "Importações recorrentes" })`,
then a `Table` with columns:

1. `kind` → header `t3({ en: "When", fr: "Quand", pt: "Quando" })`, render
   = existing `whenLabel` (recurring branch; `dayOfWeekLabel` stays).
2. `selection` → header/render unchanged from today (the per-kind label
   from the period-selection change).
3. `lastOutcome` → header
   `t3({ en: "Last run", fr: "Dernière exécution", pt: "Última execução" })`
   (replaces "Last fire"), render via a rewritten `outcomeLabel`:
   - no `lastOutcome` →
     `t3({ en: "Not run yet", fr: "Pas encore exécutée", pt: "Ainda não executada" })`, plain.
   - `refused` →
     `t3({ en: "Skipped", fr: "Ignorée", pt: "Ignorada" })`, danger,
     `title={s.lastError}` (tooltip carries the reason, as today).
   - `missed` →
     `t3({ en: "Missed", fr: "Manquée", pt: "Falhada" })`, danger, tooltip.
   - `launched` + `lastRunStatus === "error"` →
     `t3({ en: "Run failed — see History", fr: "Échec de l'importation — voir l'historique", pt: "Importação falhou — ver o histórico" })`, danger.
   - `launched` otherwise →
     `t3({ en: "Ran", fr: "Exécutée", pt: "Executada" })`, plain.
   - Keep today's ` — {new Date(s.lastFiredAt).toLocaleString()}` suffix
     when `lastFiredAt` is set.
4. `createdBy` → unchanged ("By").
5. Actions → **Edit and Delete only** (today's pencil + trash buttons,
   verbatim). The Enabled column, its toggle handler, and the `openAlert`
   import (used only by the toggle's error path) are deleted.

**5d. One-time section.** Heading
`t3({ en: "One-time imports", fr: "Importations ponctuelles", pt: "Importações pontuais" })`,
then a `Table` with columns:

1. `runAt` → header
   `t3({ en: "Runs at", fr: "Exécution le", pt: "Execução em" })`, render
   `(s) => s.runAt ? new Date(s.runAt).toLocaleString() : ""`, sortable
   (`sortValue: (s) => s.runAt ?? ""`).
2. `selection` → same column as 5c.
3. `lastOutcome` → header
   `t3({ en: "Status", fr: "Statut", pt: "Estado" })`:
   - no `lastOutcome` →
     `t3({ en: "Scheduled", fr: "Planifiée", pt: "Agendada" })`, plain.
   - `refused` / `missed` →
     `t3({ en: "Didn't run", fr: "Non exécutée", pt: "Não executada" })`,
     danger, `title={s.lastError}`.
   - `launched` (only the run-errored ones pass the filter) →
     `t3({ en: "Run failed — see History", fr: "Échec de l'importation — voir l'historique", pt: "Importação falhou — ver o histórico" })`, danger.
4. `createdBy` → unchanged ("By").
5. Actions → identical Edit/Delete to 5c (Edit on a refused/missed row is
   the re-arm gesture — server semantics unchanged, the update route
   re-checks the unattended gate for one-shots).

**5e. Section/empty-state logic.** Render each section only when its list
is non-empty (`Show when={recurring().length > 0}` etc.). When
`visibleFutureSchedules(p.schedules)` is empty, render today's whole-tab
empty state ("No scheduled imports yet — create one from the wizard's Time
step…", unchanged copy).

## §6. Client — `dhis2_run/index.tsx` badge

`tabItems()` currently computes
`futureCount = schedules.filter((s) => s.enabled).length`. Change to the
visible-row count so the badge always equals what the tab shows:

```ts
import { Dhis2TabFuture, visibleFutureSchedules } from "./_tab_future";
...
const futureCount =
  schedulingState.status === "ready"
    ? visibleFutureSchedules(schedulingState.data.schedules).length
    : 0;
```

`nextScheduleOf` is untouched — its `s.enabled` filter is still exactly
right (pending one-shots are enabled; spent ones aren't; recurring rows are
always enabled after §2).

No wizard changes anywhere in this plan.

## §7. Doc updates — `PLAN_DHIS2_IMPORTER.md`

The Phase 4 plan doc is the authoritative as-built record and describes the
old keep-the-row policy in three places. Update them (prose only), and add
a dated line to its Status block pointing at this plan:

- ~line 207: "One-shots disable after their occurrence is handled (row
  kept, …)" → row swept after the launched run completes; refused/missed
  kept for attention.
- ~line 1178: "edit / enable / disable / delete; last-fired outcome…" →
  "edit / delete" (enable/disable removed — no pause concept).
- ~line 1292: "after firing set `enabled=false`, keep the row (the listing
  shows…)" → same correction as line 207.

Do NOT rewrite the historical review-finding entries (lines ~32, ~84,
~104–138) — they record what was true when found.

## §8. Verify

1. `deno task typecheck` — the deleted registry entry/db function must
   surface every stale consumer; fix until clean.
2. `./validate_migrations` — a `.sql` file is added (unlike the
   period-selection plan).
3. Sweep harness (repo verify-by-executing convention, rolled-back txn on
   the dev DB): inside `BEGIN … ROLLBACK`, insert four one-shot rows —
   (enabled=false, launched, run complete), (enabled=false, launched, run
   error), (enabled=false, refused), (enabled=true, no outcome) — run
   `sweepSpentOneShotScheduledImports`, assert exactly the first row
   deleted and return value 1. Also assert the §2 DELETE removes a
   (recurring, enabled=false) row and keeps a (one_shot, enabled=false,
   refused) row.
4. Manual click-through: Future tab shows two sections with the new
   wording and no Enabled column; create a one-shot for two minutes out
   (gate willing), watch it fire, confirm the row disappears from Future
   within ~a tick of the run completing while the run sits in History;
   confirm a refused one-shot (e.g. delete stored credentials first)
   stays visible with "Didn't run" and that Edit re-arms it; confirm the
   Future badge equals the visible row count.

## Out of scope

- No change to the wizard, the unattended gate, occurrence math, queue
  semantics, or the attention banner's conditions
  (`hasScheduledImportAttention` is already exactly the kept-row set).
- `enabled` stays in the DB schema and in `DatasetHmisScheduledImport`
  (internal spent latch + `nextScheduleOf` consumer) — no type or schema
  change.
- No "pause" replacement feature. If real users ever ask for pause, that's
  a new conversation, not a regression of this one.
