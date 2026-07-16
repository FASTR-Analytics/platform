# Plan — wire the timezone-aware datetime input into the "Later" schedule step

**Status: blocked on a precondition, otherwise purely mechanical.** Depends
on `PLAN_DATETIME_TIMEZONE_INPUT.md` in the panther source repo
(`~/projects/panther/timroberton-panther`) landing **and** being synced into
this repo's `panther/` copy (via that repo's `./sync`, run from panther —
never edit `panther/` directly here). Do not start this plan until both
exist and typecheck:

```
grep -n "DateTimeWithTimezone\|resolveDateTimeWithTimezoneToUtcMs" panther/_303_components/form_inputs/dates.tsx panther/_000_utils/timezone.ts
```

If that comes back empty, stop — the precondition isn't met yet.

## The bug this fixes (recap; full detail in the panther plan's §0)

The wizard's "Later" (one-shot) time choice uses a bare
`<Input type="datetime-local">` with no timezone field. Submit computes
`fields.runAt = new Date(runAtLocal()).toISOString()` — `new Date()` on a
timezone-naive `datetime-local` string silently uses the **browser's**
ambient timezone. An admin scheduling "midnight tonight" from a browser in a
different zone than the DHIS2 server's intended low-traffic window gets the
wrong real-world fire instant, with no indication anything is wrong.
Recurring already does this correctly (explicit IANA `timezone` field,
resolved server-side) — this plan brings Later up to the same standard using
the new shared component/utility instead of hand-rolling a second copy.

**No server/schema/route change in this plan.** `runAt` stays exactly what
it is today — a single resolved ISO instant, `DatasetHmisScheduledImportFields.runAt?:
string`, unchanged Zod schema, unchanged `validateScheduleFields` "must be in
the future" check (it compares an already-resolved instant to `Date.now()` —
correct regardless of which timezone produced that instant). The fix is
entirely in *how the client computes* the instant it sends, not in what gets
stored. This is possible specifically because the panther utility guarantees
client and server (if the server ever needs the same math — it doesn't, for
one-shot) use identical zone arithmetic; there's nothing left to validate or
reconcile server-side beyond what already exists.

## §1. `client/src/components/instance_dataset_hmis/dhis2_run/_wizard/_step_time.tsx`

Replace the "Later" branch's bare datetime-local `Input` with the new
panther component:

```tsx
<Match when={p.timeChoice() === "later"}>
  <DateTimeWithTimezone
    localDateTime={p.runAtLocal()}
    onChangeLocalDateTime={p.setRunAtLocal}
    timezone={p.runAtTimezone()}
    onChangeTimezone={p.setRunAtTimezone}
    label={t3({ en: "Run at", fr: "Exécuter le", pt: "Executar em" })}
  />
</Match>
```

Import `DateTimeWithTimezone` from `panther`. Add `runAtTimezone: () => string`
and `setRunAtTimezone: (v: string) => void` to this file's `Props` type,
next to the existing `runAtLocal`/`setRunAtLocal` pair.

## §2. `client/src/components/instance_dataset_hmis/dhis2_run/_wizard/index.tsx`

**New signal**, next to `runAtLocal`:

```ts
const [runAtTimezone, setRunAtTimezone] = createSignal<string>(
  Intl.DateTimeFormat().resolvedOptions().timeZone,
);
```

(No `editSchedule` prefill source — see §4's accepted limitation. Same
browser-timezone default Recurring already uses for its own `timezone`
signal — consistent, not a new pattern.)

**Pass the new prop** at the `Dhis2StepTime` call site (alongside the
existing `runAtLocal`/`setRunAtLocal`):

```tsx
runAtTimezone={runAtTimezone}
setRunAtTimezone={setRunAtTimezone}
```

**`timeSummary()`** — the "later" branch currently does
`new Date(runAtLocal()).toLocaleString()`, which has the same
browser-ambient bug in the *preview* text (today it's at least
self-consistent with the buggy stored value; after this fix it would be
inconsistent unless also corrected). Change to:

```ts
if (timeChoice() === "later") {
  return runAtLocal()
    ? new Date(resolveDateTimeWithTimezoneToUtcMs(runAtLocal(), runAtTimezone())).toLocaleString()
    : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
}
```

(`toLocaleString()` on the correctly-resolved instant still displays in the
*viewer's* local time — that's correct and expected for a sanity-check
preview; only the underlying instant needed fixing, not the display
convention.)

**`submit`** — change the one line:

```ts
// before
fields.runAt = new Date(runAtLocal()).toISOString();
// after
fields.runAt = new Date(
  resolveDateTimeWithTimezoneToUtcMs(runAtLocal(), runAtTimezone()),
).toISOString();
```

Import `resolveDateTimeWithTimezoneToUtcMs` from `panther`.

## §3. Verify

1. `deno task typecheck` (server + client + `lint:systems`).
2. Manual: with the OS/browser timezone set to something far from the
   instance's usual timezone (e.g. switch to `Pacific/Auckland` or similar),
   schedule a one-shot for a specific local time; confirm the review step's
   preview and the eventual `dataset_hmis_scheduled_imports.run_at` row
   (inspect directly) both reflect the *selected* timezone, not the
   browser's.
3. Regression check: Recurring is untouched by this plan — confirm its
   existing behavior is unaffected (it already had its own timezone field;
   this plan doesn't touch `_step_time.tsx`'s recurring branch or its
   signals).

## §4. Accepted limitation (not fixed here, documented on purpose)

Editing an existing one-shot schedule seeds `runAtLocal` from the stored
`runAt` ISO instant via `toDatetimeLocalValue` (existing code, unchanged) —
which converts using the **editor's current browser timezone**, not
whatever timezone was used to originally create the schedule (only the
resolved instant is stored; the originating timezone is not). The edited
instant is correct if left alone (round-trips exactly), but the displayed
local-time-plus-timezone pairing on re-open may differ from what the
original creator saw, if they're now being edited from a different
timezone. This mirrors how most calendar/scheduling UIs handle one-off
events (store the resolved instant, not the authoring timezone) and is not
a regression — today's code has the identical round-trip property, just
with the ambient-timezone bug baked into both directions symmetrically.

**Optional future enhancement** (not part of this plan, needs a migration —
flag to Tim if wanted): add a nullable `run_at_timezone text` column to
`dataset_hmis_scheduled_imports`, store `runAtTimezone()` alongside `runAt`
on create/update, and prefill from it on edit instead of re-deriving from
the browser. Purely a UX nicety for the edit-from-a-different-timezone
case; the stored fire instant is already correct without it.

## Out of scope

- Any change to Recurring's time picker (already correct; already has its
  own timezone field).
- Any panther-repo work — that's `PLAN_DATETIME_TIMEZONE_INPUT.md`, a
  separate repo, separate plan, precondition for this one.
- wb-fastr's own `scheduler.ts` keeping its private copy of the zone-math
  functions — retiring that in favor of importing from `@timroberton/panther`
  is a worthwhile cleanup but touches recurring-fire code that's been
  twice-reviewed; do it as its own deliberate, separately-verified change,
  not bundled into this plan.
- The optional `run_at_timezone` storage enhancement (§4) — noted, not
  built, unless Tim asks for it.
