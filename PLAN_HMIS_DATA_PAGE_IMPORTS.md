# Plan: dataset pages — one Imports entry, ledger inside Imports

**Status 2026-08-17: agreed design, not implemented.** Client-only. Gates:
`deno task typecheck` (includes `lint:systems`; the S6 globs are
`instance_dataset_*/**`, so the file moves below need no manifest edit).

## Problem

The HMIS Data page ([instance_dataset_hmis/index.tsx](client/src/components/instance_dataset_hmis/index.tsx))
has an admin sidebar with two "action" buttons that are really one navigation
and one shortcut: **Import from DHIS2** opens the Imports surface (it doesn't
import anything) and **Upload CSV file** opens the same surface with the CSV
wizard auto-opened — whose toolbar has its own Upload CSV file button. The
sidebar's third button, **Import status by indicator**, opens the ledger as a
separate editor which then opens the *whole Imports surface* as a nested
editor just to reach the DHIS2 wizard with preset pairs
([_import_ledger.tsx:239](client/src/components/instance_dataset_hmis/_import_ledger.tsx#L239),
[_import_ledger_indicator.tsx:88](client/src/components/instance_dataset_hmis/_import_ledger_indicator.tsx#L88)),
so the stack can be Data → Ledger → Imports → Wizard while Data → Imports also
exists. HFA/ICEH have the same two-button sidebar (Start new import / View
imports) with honest labels but the same shortcut duplication.
[SYSTEM_06 §Client](SYSTEM_06_ingestion.md#L315) already rules "one imports
surface per family, opened from a single sidebar button (the surface's toolbar
owns the actions — no shortcut buttons replaying toolbar clicks)". The
shortcuts predate that ruling — `autoOpenCsvWizard` landed in d81a96cb
(2026-08-05), HFA/ICEH `autoOpenWizard` in 04dfd51f / 973311aa (2026-08-06) —
and the ruling was written in 0cef208b (2026-08-07) without the code being
brought into line.

## Rulings (agreed 2026-08-17)

1. **One entry card.** The instance Data page's per-family "Data" card is the
   only entry for everything about that dataset — content *and* audit trail.
   No sibling "Imports" card.
2. **Data page = viewer + seam.** The page content is the viewer. The admin
   sidebar is the seam to the imports layer: the SSE status flags (running /
   queued / attention), **one** `Imports` button, and `Delete data` (HFA also
   keeps `Manage time points`). Nothing else; no wizard shortcuts.
3. **The ledger is import history pivoted by indicator**, not a view of the
   data. It becomes the fourth tab of the HMIS Imports surface — Current /
   Future / History / **By indicator** — and its retry actions call the
   shell's own `openWizard`, exactly as History → run detail already does.
   The nested-surface trick and the `presetPairs` / `presetLabel` /
   `autoOpenCsvWizard` / `autoOpenWizard` props go away.
4. Delete stays on the Data page (windowed op on what's there; no run row, no
   history entry). `Manage connection` stays in the Imports toolbar (the
   wizard's credentials step needs it reachable there); the DHIS2 connection
   card on the instance Data page is unchanged.
5. Out of scope: last-run / next-schedule lines in the sidebar (needs a
   datasets-summary payload extension — server + SSE type + T1 store; a
   separate small piece if wanted). Renaming the `Dhis2Tab*` prefix on the
   existing tab components (a shared legacy misnomer — History already spans
   CSV runs); the new tab matches its siblings.

## Step 1 — HMIS ledger indicator detail → `imports/_ledger_indicator_detail.tsx`

```
git mv client/src/components/instance_dataset_hmis/_import_ledger_indicator.tsx \
       client/src/components/instance_dataset_hmis/imports/_ledger_indicator_detail.tsx
```

Then edit. It becomes the twin of `Dhis2RunDetail`: an editor that closes
with the pair list to re-import; the shell feeds it to the wizard.

Imports — replace

```ts
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Table,
  formatPeriod,
  getEditorWrapper,
  toNum0,
  type TableColumn,
} from "panther";
import { DatasetHmisImports } from "./imports";
import { sourceLabel, type LedgerPeriodWindow } from "./_import_ledger";
```

with

```ts
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Table,
  formatPeriod,
  toNum0,
  type TableColumn,
} from "panther";
import { sourceLabel, type LedgerPeriodWindow } from "./_tab_by_indicator";
```

Signature + action — replace

```ts
export function ImportLedgerIndicatorDetail(
  p: EditorComponentProps<
    {
      indicatorRawId: string;
      items: DatasetHmisImportLedgerItem[];
      window: LedgerPeriodWindow;
      silentFetch: () => Promise<void>;
    },
    undefined
  >,
) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const itemsByPeriod = ...
```

with

```ts
// The per-indicator ledger surface: every month in the window with its
// import status. Closes with a pair list when the user asks to re-import the
// indicator; the shell feeds it to the wizard's presetPairs entry (same
// contract as Dhis2RunDetail).
export function ImportLedgerIndicatorDetail(
  p: EditorComponentProps<
    {
      indicatorRawId: string;
      items: DatasetHmisImportLedgerItem[];
      window: LedgerPeriodWindow;
    },
    Dhis2RunPair[] | undefined
  >,
) {
  const itemsByPeriod = ...
```

Replace the whole `reimportIndicator` function (the comment through its
closing brace) with

```ts
  function reimportIndicator() {
    const pairs: Dhis2RunPair[] = enumerateMonthsDescending(p.window).map(
      (periodId) => ({ indicatorRawId: p.indicatorRawId, periodId }),
    );
    p.close(pairs);
  }
```

Render — remove the `<EditorWrapper>` / `</EditorWrapper>` pair around
`<FrameTop …>` (the component opens no nested editors). Everything else
(columns, `splitError`, `enumerateMonthsDescending`, the table) is unchanged.
`t3` stays imported (used by columns); `getCalendar` stays.

In passing (the file is moving anyway): put the exported component above the
`MonthRow` / `enumerateMonthsDescending` / `splitError` helpers
(PROTOCOL_ALL_TYPESCRIPT rule 12, exports first).

## Step 2 — HMIS ledger → `imports/_tab_by_indicator.tsx`

```
git mv client/src/components/instance_dataset_hmis/_import_ledger.tsx \
       client/src/components/instance_dataset_hmis/imports/_tab_by_indicator.tsx
```

Then edit. It becomes tab content (no frame, no heading bar): owns the ledger
+ indicator-label queries (created on mount, so the tab is lazy and fresh on
every switch — `createQuery` fetches once at creation), refetches on the
shell's `refreshTick`, and delegates both actions to shell callbacks. The tab
never refetches on its own after an action: every path that can change the
ledger (wizard return, Current/Future actions, SSE wake-up) goes through the
shell's `refresh()`, which bumps the tick.

Imports — replace

```ts
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  Table,
  createQuery,
  getEditorWrapper,
  toNum0,
  type TableColumn,
} from "panther";
import { Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import { DatasetHmisImports } from "./imports";
import { ImportLedgerIndicatorDetail } from "./_import_ledger_indicator";
```

with

```ts
import {
  Button,
  StateHolderWrapper,
  Table,
  createQuery,
  toNum0,
  type TableColumn,
} from "panther";
import { Show, createEffect, createMemo, on } from "solid-js";
import { serverActions } from "~/server_actions";
```

Component head — replace

```ts
export function ImportLedger(p: EditorComponentProps<{}, undefined>) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const ledger = createQuery(
```

with

```ts
type Props = {
  // Bumped by the shell's refresh() (wizard return, Current/Future actions,
  // SSE wake-up) — the ledger query lives here so the tab stays lazy, and
  // this is how the shell reaches it. (The toolbar refresh remounts the tab
  // instead: runs.fetch() is non-silent.)
  refreshTick: number;
  onOpenIndicator: (
    indicatorRawId: string,
    items: DatasetHmisImportLedgerItem[],
    window: LedgerPeriodWindow,
  ) => Promise<void>;
  onRetryFailedPairs: (pairs: Dhis2RunPair[]) => Promise<void>;
};

// Import history pivoted by indicator: one row per raw indicator across the
// dataset's period window, click-through to the per-month detail. Same
// history as the History tab, different axis.
export function Dhis2TabByIndicator(p: Props) {
  const ledger = createQuery(
```

After the `indicatorLabels` memo, add

```ts
  createEffect(
    on(
      () => p.refreshTick,
      () => {
        void ledger.silentFetch();
      },
      { defer: true },
    ),
  );
```

Replace `viewIndicator` and `retryFailedPairs` (from the `async function
viewIndicator` line through the closing brace of `retryFailedPairs`,
including the "Checklist action" comment) with

```ts
  function viewIndicator(rollup: IndicatorRollup, window: LedgerPeriodWindow) {
    void p.onOpenIndicator(rollup.indicatorRawId, rollup.items, window);
  }

  function retryFailedPairs(items: DatasetHmisImportLedgerItem[]) {
    const failedPairs: Dhis2RunPair[] = items
      .filter((item) => item.status === "error")
      .map((item) => ({
        indicatorRawId: item.indicatorRawId,
        periodId: item.periodId,
      }));
    void p.onRetryFailedPairs(failedPairs);
  }
```

(No `ledger.silentFetch()` here — the shell's `refresh()` after the wizard
returns bumps `refreshTick`, and a cancelled detail/wizard changes nothing.)

Replace the whole `return (…)` block with

```tsx
  return (
    <StateHolderWrapper state={ledger.state()} noPad>
      {(keyedItems) => {
        const { rollups, window } = buildRollups(keyedItems);
        const failedCount = keyedItems.filter(
          (item) => item.status === "error",
        ).length;
        return (
          <div class="ui-spy-sm">
            <Show when={failedCount > 0}>
              <div class="">
                <Button
                  onClick={() => retryFailedPairs(keyedItems)}
                  intent="danger"
                  outline
                  iconName="refresh"
                >
                  {t3({
                    en: "Retry failed pairs",
                    fr: "Réessayer les paires en échec",
                    pt: "Repetir os pares falhados",
                  })}{" "}
                  ({toNum0(failedCount)})
                </Button>
              </div>
            </Show>
            <Table
              data={rollups}
              columns={columns}
              keyField="indicatorRawId"
              noRowsMessage={t3({
                en: "No imports recorded yet",
                fr: "Aucune importation enregistrée pour le moment",
                pt: "Ainda não há importações registadas",
              })}
              onRowClick={(rollup) => {
                if (window) {
                  viewIndicator(rollup, window);
                }
              }}
            />
          </div>
        );
      }}
    </StateHolderWrapper>
  );
```

(The shell already wraps tab content in `div.ui-pad.ui-spy.h-full.w-full.overflow-auto`,
and the History tab renders a bare `Table` there — same here; the old
`fitTableToAvailableHeight` flex column and the toolbar refresh button go.)

`buildRollups`, `IndicatorRollup`, `LedgerPeriodWindow` (exported),
`sourceLabel` (exported), `countMonthsInclusive`, and the `columns` array are
unchanged in content. In passing: order the file exports-first
(PROTOCOL_ALL_TYPESCRIPT rule 12) — `Dhis2TabByIndicator`, then the exported
`sourceLabel` / `LedgerPeriodWindow`, then the private helpers. Left alone,
deliberately: the `sourceLabel` name also exists in `_tab_history.tsx` (a
different signature, never co-imported), and the raw
`serverActions.getIndicators({})` label query is the same shape as
`_run_detail.tsx` / `_indicator_picker.tsx` — a folder-wide switch to the T2
`getIndicatorsFromCacheOrFetch` is a separate small piece if wanted.

## Step 3 — HMIS Imports shell `imports/index.tsx`

Imports: add `type DatasetHmisImportLedgerItem` to the `lib` import; add

```ts
import { ImportLedgerIndicatorDetail } from "./_ledger_indicator_detail";
import { Dhis2TabByIndicator } from "./_tab_by_indicator";
```

Props — replace the whole `type Props = EditorComponentProps<{ … }, undefined>;`
block with

```ts
type Props = EditorComponentProps<{}, undefined>;
```

TabId — replace with

```ts
type TabId = "current" | "future" | "history" | "by_indicator";
```

After `const [tab, setTab] = createSignal<TabId>("current");` add

```ts
  const [refreshTick, setRefreshTick] = createSignal(0);
```

`refresh()` — replace with

```ts
  async function refresh() {
    await runs.silentFetch();
    await scheduling.silentFetch();
    setRefreshTick((n) => n + 1);
  }
```

SSE wake-up effect (the `createEffect(on(() => [instanceState.hmisImportRunActive, …]` block) — its body is now
exactly `refresh()`, and run completion is the one moment the ledger actually
changes, so replace the body:

```ts
      async () => {
        await refresh();
      },
```

(Currently it calls the two `silentFetch`es directly, which would leave the
By-indicator tab stale after a background run completes.)

After `openRunDetail`, add

```ts
  async function openIndicatorDetail(
    indicatorRawId: string,
    items: DatasetHmisImportLedgerItem[],
    window: LedgerPeriodWindow,
  ) {
    const pairs = await openEditor({
      element: ImportLedgerIndicatorDetail,
      props: { indicatorRawId, items, window },
    });
    if (pairs && pairs.length > 0) {
      await openWizard({
        kind: "presetPairs",
        pairs,
        label: `${t3({
          en: "Re-importing",
          fr: "Réimportation de",
          pt: "A reimportar",
        })} ${indicatorRawId}:`,
      });
    }
  }

  async function retryFailedPairs(pairs: Dhis2RunPair[]) {
    await openWizard({
      kind: "presetPairs",
      pairs,
      label: t3({
        en: "Retrying all failed pairs:",
        fr: "Nouvelle tentative pour toutes les paires en échec :",
        pt: "Nova tentativa para todos os pares falhados:",
      }),
    });
  }
```

(`LedgerPeriodWindow` — add `type LedgerPeriodWindow` to the
`./_tab_by_indicator` import.)

Delete both auto-open effects: from the comment `// The wizard reads
schedulingQuery.state() …` keep only the `schedulingReady` const (the toolbar
still uses it), and remove the `let autoOpened …` effect and the whole
`// The CSV wizard needs the runs query ready …` + `let csvAutoOpened …`
effect. Update the surviving comment to:

```ts
  // The wizard reads schedulingQuery.state() to seed its initial signals
  // (stored-connection toggle, credentials prefill) — the New-import button
  // waits for readiness so it never seeds from "not loaded yet".
  const schedulingReady = () => scheduling.state().status === "ready";
```

Toolbar refresh button — unchanged: `runs.fetch()` is non-silent, so the
`StateHolderWrapper` unmounts and remounts the tab area, and the remounted
By-indicator tab's fresh `createQuery` already refetches; a tick bump there
would be a duplicate request.

`tabItems()` — add after the history entry:

```ts
      {
        id: "by_indicator",
        label: t3({ en: "By indicator", fr: "Par indicateur", pt: "Por indicador" }),
      },
```

Switch — add after the history `Match`:

```tsx
                    <Match when={tab() === "by_indicator"}>
                      <Dhis2TabByIndicator
                        refreshTick={refreshTick()}
                        onOpenIndicator={openIndicatorDetail}
                        onRetryFailedPairs={retryFailedPairs}
                      />
                    </Match>
```

Also replace the shell's header comment (lines 89–92) with

```ts
// The unified imports surface: a thin tab shell — Current / Future / History
// / By indicator — plus one wizard per source (DHIS2 runs, CSV file runs).
// The shell owns the runs + scheduling queries, the poll loop and the SSE
// wake-up effect, so a run keeps progressing even while the user sits on a
// different tab; the ledger query is tab-local (lazy) and reached via
// refreshTick.
```

## Step 4 — HMIS Data page `instance_dataset_hmis/index.tsx`

Imports: drop `import { ImportLedger } from "./_import_ledger";`.

Replace `openImports` and delete `viewImportLedger`:

```ts
  async function openImports() {
    await openEditor({ element: DatasetHmisImports, props: {} });
  }
```

Replace the entire `<FrameRight panelChildren={…}>` panel (the
`<Show when={instanceState.currentUserIsGlobalAdmin}>` block) with

```tsx
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <Show when={instanceState.hmisScheduledImportAttention}>
                  <div class="ui-pad border-danger bg-danger-subtle rounded border text-sm">
                    {t3({
                      en: "A scheduled DHIS2 import needs attention.",
                      fr: "Une importation DHIS2 planifiée nécessite votre attention.",
                      pt: "Uma importação DHIS2 agendada precisa de atenção.",
                    })}
                  </div>
                </Show>
                <Show when={instanceState.hmisImportRunActive}>
                  <div class="ui-pad bg-base-200 rounded border text-sm">
                    {t3({
                      en: "An import is running — see Imports for progress.",
                      fr: "Une importation est en cours — voir Importations pour la progression.",
                      pt: "Há uma importação em curso — ver Importações para o progresso.",
                    })}
                  </div>
                </Show>
                <Show when={instanceState.hmisImportRunsQueued > 0}>
                  <div class="ui-pad bg-base-200 rounded border text-sm">
                    {instanceState.hmisImportRunsQueued}{" "}
                    {t3({
                      en: "import(s) queued.",
                      fr: "importation(s) en file d'attente.",
                      pt: "importação(ões) em fila.",
                    })}
                  </div>
                </Show>
                <div class="">
                  <Button onClick={openImports} iconName="databaseImport" fullWidth>
                    {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                  </Button>
                </div>
                <Show when={instanceState.hmisNVersions > 0}>
                  <div class="">
                    <Button
                      onClick={deleteData}
                      intent="danger"
                      iconName="trash"
                      outline
                      fullWidth
                    >
                      {t3({
                        en: "Delete data",
                        fr: "Supprimer les données",
                        pt: "Eliminar os dados",
                      })}
                    </Button>
                  </div>
                </Show>
              </div>
            </Show>
```

(No sidebar heading: the old "Imports" heading sat above a button now
labelled Imports and above Delete, which isn't an import. Same shape in
Steps 5–6.)

## Step 5 — HFA

`instance_dataset_hfa/index.tsx`:

```ts
  async function openImports() {
    await openEditor({ element: DatasetHfaImports, props: {} });
  }
```

Replace the sidebar panel's inner `div` (from `<div class="font-700 text-lg">`
through the end of the `<Show when={instanceState.hfaTimePoints.length > 0}>`
block) with

```tsx
                <div class="">
                  <Button onClick={openImports} iconName="databaseImport" fullWidth>
                    {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                  </Button>
                </div>
                <Show when={instanceState.hfaTimePoints.length > 0}>
                  <div class="">
                    <Button
                      onClick={() => viewTimePoints(instanceState.hfaTimePoints)}
                      outline
                      fullWidth
                      iconName="pencil"
                    >
                      {t3({ en: "Manage time points", fr: "Gérer les points temporels", pt: "Gerir os pontos temporais" })}
                    </Button>
                  </div>
                  <div class="">
                    <Button
                      onClick={() => deleteData(instanceState.hfaTimePoints)}
                      intent="danger"
                      iconName="trash"
                      outline
                      fullWidth
                    >
                      {t3({ en: "Delete data", fr: "Supprimer les données", pt: "Eliminar os dados" })}
                    </Button>
                  </div>
                </Show>
```

`instance_dataset_hfa/imports/index.tsx`: Props → `EditorComponentProps<{}, undefined>`
(delete the comment + `autoOpenWizard?: boolean;`); delete the
`let autoOpened = false; createEffect(…)` block; drop `createEffect` from the
`solid-js` import (its only use).

## Step 6 — ICEH

`instance_dataset_iceh/index.tsx`:

```ts
  async function openImports() {
    await openEditor({ element: DatasetIcehImports, props: {} });
    await fetchDetail();
  }
```

Replace the sidebar panel's inner content (from `<div class="font-700 text-lg">`
through the closing of the `<Show when={detail() && detail()!.dataRows > 0}>`
block) with

```tsx
                <div class="">
                  <Button onClick={openImports} iconName="databaseImport" fullWidth>
                    {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                  </Button>
                </div>
                <Show when={detail() && detail()!.dataRows > 0}>
                  <div class="">
                    <Button
                      onClick={deleteData}
                      intent="danger"
                      iconName="trash"
                      outline
                      fullWidth
                    >
                      {t3({
                        en: "Delete data",
                        fr: "Supprimer les données",
                        pt: "Eliminar os dados",
                      })}
                    </Button>
                  </div>
                </Show>
```

`instance_dataset_iceh/imports/index.tsx`: same three edits as HFA's imports
index (Props → `EditorComponentProps<{}, undefined>`, delete the auto-open
effect, drop `createEffect` from the `solid-js` import).

## Step 7 — SYSTEM_06 §Client

Replace the first paragraph of `## Client` (from "One imports surface per
family" through "…only the callback re-parses the new bytes).") so it reads:

> One imports surface per family, opened from a single `Imports` button in the
> dataset page's admin sidebar — the sidebar is the seam between the viewer
> and the imports layer: the SSE status flags (running / queued / attention),
> that one button, and `Delete data` (HFA also `Manage time points`); no
> wizard shortcuts, no heading (ruled 2026-08-17). The surface's toolbar owns
> the actions; no attempt cards anywhere. The runs query polls every 2 s while
> a run is active,
> needs_review runs render as Current cards with the staging diagnostics +
> Integrate-anyway/Discard, History rows click through to a run detail, and
> the wizard is a client-local modal (nothing persists before launch). Every
> wizard file slot is S4's `FileUploadSelector` — upload a new file or pick an
> existing instance asset; either way the wizard holds an asset `fileName`,
> which is what launch/parse payloads name. Selection re-parses via the
> slot's direct `onChange` callback (never an effect on the fileName signal:
> re-uploading the same name leaves the signal unchanged, and only the
> callback re-parses the new bytes).

And the HMIS bullet becomes:

> - **HMIS** (`instance_dataset_hmis/imports/`): Current / Future / History /
>   By indicator tabs (SSE summary fields as the wake-up signal, routed through
>   the shell's `refresh()`; a `refreshTick` signal from the shell is how the
>   lazily-mounted By-indicator tab's ledger query is refreshed — the tab never
>   refetches on its own). By indicator is the import ledger —
>   import history pivoted by raw indicator, click-through to a per-month
>   detail (`_ledger_indicator_detail.tsx`); its "re-import this indicator" /
>   "retry failed pairs" close with a pair list that the shell feeds to the
>   wizard's `presetPairs` entry, the same contract as History → run detail.
>   Two wizards — DHIS2 (credentials/indicators/time/config/review) and CSV
>   (upload → mappings → review) — both with the launch-or-queue fork. A run
>   detail's Version row opens the version's `_import_information.tsx` — this
>   replaced the "View previous imports" entry point (Phase D); the versions
>   table and detail view are unchanged.

## Gates

- `deno task typecheck` (server + client + `lint:systems`).
- `grep -rn "presetLabel\|autoOpenCsvWizard\|autoOpenWizard\|ImportLedger\b\|_import_ledger" client/src` returns nothing; `presetPairs` survives only as the wizard entry kind (`imports/_wizard/index.tsx`) and the shell's `openWizard({ kind: "presetPairs", … })` calls.

## Protocol touchpoints for the review

- PROTOCOL_UI_STRUCTURE — co-location: the ledger files move next to the
  surface that owns them (`imports/_tab_*.tsx`, `imports/_*_detail.tsx`),
  matching `_tab_history.tsx` / `_run_detail.tsx`.
- PROTOCOL_APP_STATE §T3 — import runs + ledger are already inventoried as T3
  on-demand `createQuery` under `instance_dataset_hmis/imports/` (line 346),
  so the move aligns the code with the inventory, and the shell's existing
  `refresh()` idiom (silentFetch after wizard/Current/Future actions + SSE
  wake-up) is the sanctioned T3 refresh path; `refreshTick` just extends it to
  a tab-local query. The T2 rules ("never a locally flipped version signal",
  "never refetch after a mutation") do not apply — this is not a T2 cache. Not
  the panther `createQuery`-doc conversion (createEffect + StateHolder): that
  is for long-lived live reads, and the ledger is a full-table T3 read that
  should stay lazy.
- PROTOCOL_UI_COMPONENTS / PROTOCOL_APP_UI_CONVENTIONS — Pattern-A editor
  (`FrameTop` + `HeadingBar`) for the detail; the tab renders a bare `Table`
  inside the shell's padded scroll area like its siblings; toolbar groups
  `div.flex.items-center.ui-gap-sm` unchanged; destructive delete unchanged
  (`createDeleteAction` in `_delete_data.tsx`).
- PROTOCOL_ALL_TYPESCRIPT — no default args, no `any`, `undefined` not
  `null`; the two removed props were optional-with-fallback, none introduced.
