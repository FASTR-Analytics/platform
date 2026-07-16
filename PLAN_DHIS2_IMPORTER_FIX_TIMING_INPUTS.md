# Plan — wire the timezone-aware datetime input into the "Later" schedule step

**Status: READY — precondition met.** Panther's `PLAN_DATETIME_TIMEZONE_INPUT`
landed as commit `a39332a "time and date components"` and is already synced
into this repo's `panther/` copy (sync commit `26190db8`). Sanity check:

```sh
grep -n "ZonedDateTimeInput\|zonedDateTimeToUtcMs" panther/_303_components/form_inputs/dates.tsx panther/_000_utils/timezone.ts
```

## The actual panther API (differs from earlier drafts of this plan)

- **Component** `ZonedDateTimeInput` (`panther/_303_components/form_inputs/dates.tsx`)
  — takes a single value object, not parallel string props:
  `value: ZonedDateTime`, `onChange: (v: ZonedDateTime) => void`,
  `dateTimeLabel?`, `timezoneLabel?`, `intent?`, `invalidMsg?`, `disabled?`,
  `size?`. Renders a `DateTimeInput` + `TimezoneSelect` pair.
- **Type** `ZonedDateTime = { dateTime: string; timezone: string }` —
  `dateTime` is the datetime-local string `"YYYY-MM-DDTHH:mm"`, `timezone` an
  IANA name.
- **Utilities** (`panther/_000_utils/timezone.ts`):
  - `zonedDateTimeToUtcMs(v: ZonedDateTime): number` — DST-correct resolve
  - `zonedDateTimeToUtcIso(v: ZonedDateTime): string` — same, as ISO string
  - `utcMsToZonedDateTime(utcMs: number, timezone: string): ZonedDateTime` — reverse
  - `getLocalTimezone(): string`

All exported from the `"panther"` barrel (`mod.ui.ts` → `_000_utils/mod.ts` +
`_303_components/mod.ts`); the `ZonedDateTime` type too.

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
the new shared component/utilities instead of hand-rolling a second copy.

**No server/schema/route change in this plan.** `runAt` stays exactly what
it is today — a single resolved ISO instant, `DatasetHmisScheduledImportFields.runAt?:
string`, unchanged Zod schema, unchanged `validateScheduleFields` "must be in
the future" check (it compares an already-resolved instant to `Date.now()` —
correct regardless of which timezone produced that instant). The fix is
entirely in *how the client computes* the instant it sends, not in what gets
stored.

## §1. `client/src/components/instance_dataset_hmis/dhis2_run/_wizard/_step_time.tsx`

Replace the "Later" branch's bare datetime-local `Input` with the panther
component:

```tsx
<Match when={p.timeChoice() === "later"}>
  <ZonedDateTimeInput
    value={p.runAtZoned()}
    onChange={p.setRunAtZoned}
    dateTimeLabel={t3({ en: "Run at", fr: "Exécuter le", pt: "Executar em" })}
    timezoneLabel={t3({ en: "Timezone", fr: "Fuseau horaire", pt: "Fuso horário" })}
  />
</Match>
```

Import `ZonedDateTimeInput` from `panther`. In `Props`, replace the
`runAtLocal: () => string` / `setRunAtLocal: (v: string) => void` pair with:

```ts
runAtZoned: () => ZonedDateTime;
setRunAtZoned: (v: ZonedDateTime) => void;
```

(`ZonedDateTime` type imported from `panther`.)

**Recurring branch — swap to the panther components** (cosmetic consistency;
same signals, same string values, zero behavior change):

- `<Input type="time" …>` → `<TimeInput value={p.startTime()}
  onChange={p.setStartTime} label={…} />` (same label).
- The timezone `<Select …>` → `<TimezoneSelect value={p.timezone()}
  onChange={p.setTimezone} label={…} />` (same label).
- Delete the local `timezoneOptions` const (`Intl.supportedValuesOf` —
  `TimezoneSelect` builds and caches the same list internally).

Import `TimeInput` and `TimezoneSelect` from `panther`; after both swaps
`Input` has no remaining use in this file — drop it from the import.
`Select`/`SelectOption` stay (day-of-week and interval selects).

## §2. `client/src/components/instance_dataset_hmis/dhis2_run/_wizard/index.tsx`

**Signal** — replace `runAtLocal`/`setRunAtLocal` (line ~154) with one
`ZonedDateTime` signal:

```ts
const [runAtZoned, setRunAtZoned] = createSignal<ZonedDateTime>(
  scheduleDefaults?.runAt
    ? utcMsToZonedDateTime(new Date(scheduleDefaults.runAt).getTime(), getLocalTimezone())
    : { dateTime: "", timezone: getLocalTimezone() },
);
```

**Delete `toDatetimeLocalValue`** (line ~101) — `utcMsToZonedDateTime` is
the same conversion, shared and DST-tested; the edit-prefill above is its
only call site. Browser-timezone default for a new schedule is the same
default Recurring already uses for its own `timezone` signal — consistent,
not a new pattern. (Edit-prefill still re-derives in the *editor's* zone —
see §4's accepted limitation.)

**`computeTimeValid`** (line ~202):

```ts
if (timeChoice() === "later") return runAtZoned().dateTime !== "";
```

**`timeSummary()`** (line ~292) — the "later" branch currently does
`new Date(runAtLocal()).toLocaleString()`, which has the same
browser-ambient bug in the *preview* text (today it's at least
self-consistent with the buggy stored value; after this fix it would be
inconsistent unless also corrected). Change to:

```ts
if (timeChoice() === "later") {
  return runAtZoned().dateTime
    ? new Date(zonedDateTimeToUtcMs(runAtZoned())).toLocaleString()
    : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
}
```

(`toLocaleString()` on the correctly-resolved instant still displays in the
*viewer's* local time — that's correct and expected for a sanity-check
preview; only the underlying instant needed fixing, not the display
convention.)

**`submit`** (line ~434) — change the one line:

```ts
// before
fields.runAt = new Date(runAtLocal()).toISOString();
// after
fields.runAt = zonedDateTimeToUtcIso(runAtZoned());
```

**Call site** (line ~538) — pass `runAtZoned={runAtZoned}`
`setRunAtZoned={setRunAtZoned}` instead of the old pair.

Imports from `panther`: `utcMsToZonedDateTime`, `zonedDateTimeToUtcMs`,
`zonedDateTimeToUtcIso`, `getLocalTimezone`, type `ZonedDateTime`.

## §3. Verify

1. `deno task typecheck` (server + client + `lint:systems`).
2. Manual: with the OS/browser timezone set to something far from the
   instance's usual timezone (e.g. switch to `Pacific/Auckland` or similar),
   schedule a one-shot for a specific local time in a *different* selected
   timezone; confirm the review step's preview and the eventual
   `dataset_hmis_scheduled_imports.run_at` row (inspect directly) both
   reflect the *selected* timezone, not the browser's.
3. Regression check: Recurring's *logic* is untouched — the §1 swap is
   component-for-component with the same signals and string values
   (`"HH:mm"` time, IANA timezone name). Confirm a recurring schedule
   round-trips unchanged: open an existing one in the wizard, verify the
   prefilled time/timezone, save without edits, and check the stored row
   is identical.

## §4. Accepted limitation (not fixed here, documented on purpose)

Editing an existing one-shot schedule seeds the input from the stored
`runAt` ISO instant via `utcMsToZonedDateTime(…, getLocalTimezone())` —
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
`dataset_hmis_scheduled_imports`, store `runAtZoned().timezone` alongside
`runAt` on create/update, and prefill from it on edit instead of re-deriving
from the browser. Purely a UX nicety for the edit-from-a-different-timezone
case; the stored fire instant is already correct without it.

## Out of scope

- Any change to Recurring's *scheduling logic* (already correct; already
  has its own timezone field). Its inputs do swap to panther's
  `TimeInput`/`TimezoneSelect` in §1 — components only, same signals.
- Any panther-repo work — `PLAN_DATETIME_TIMEZONE_INPUT.md` landed
  (`a39332a`); nothing further needed there.
- wb-fastr's own `scheduler.ts` keeping its private copy of the zone-math
  functions — retiring that in favor of importing from `@timroberton/panther`
  is a worthwhile cleanup but touches recurring-fire code that's been
  twice-reviewed; do it as its own deliberate, separately-verified change,
  not bundled into this plan.
- The optional `run_at_timezone` storage enhancement (§4) — noted, not
  built, unless Tim asks for it.
