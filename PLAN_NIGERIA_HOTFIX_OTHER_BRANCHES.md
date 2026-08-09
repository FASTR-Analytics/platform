# Nigeria hotfix — OTHER branches (`tim-branch`, panther, modules repo) — DO LATER

> **What this file is.** Everything that has to happen on a branch **other than
> `main`** as a consequence of the Nigeria hotfix. None of it is urgent, and none
> of it should be started during the three-week training freeze.
>
> **What belongs here.** Two kinds of item, and the first is easy to forget:
>
> 1. **Every change landed on `main`** — because `tim-branch` does **not** contain
>    `origin/main`, so nothing reaches it by itself. Each `main` change needs an
>    explicit reconciliation decision, and several must resolve *against* `main`
>    (see below).
> 2. Work deliberately deferred off `main` — the design debt, and any open
>    question adjudicated as "do it on tim-branch".
>
> **What does NOT belong here.** The immediate `main` work — that was
> FOR_REVIEW_NIGERIA_HOTFIX.md, deleted after the independent review passed
> (2026-08-09). Its still-live remnants (deploy-day notes) are at the bottom
> of this file; everything else lives in git history.
>
> **Keep this file in sync.** Whenever anything is decided or implemented on
> `main`, add the corresponding port-back entry here in the same pass. A `main`
> fix that never gets an entry is a fix that silently disappears at merge.

## Changes landed on `main` — all must be reconciled

Commits `1e3d47c3`, `6f43326f`, `287769dd` (the 2026-08-09 adjudication batch,
Q1–Q6 of the this-branch plan), and `86929f84` (2026-08-09, post-review:
scorecard tables get the full CF look). Complete file list, so nothing is lost:

| file | change | reconciliation |
| --- | --- | --- |
| `lib/types/_module_definition_github.ts` | `assetsToImport` union + `getAssetName()` | **resolve against `main`** — see below |
| `lib/types/mod.ts` | barrel-exports `getAssetName`, `AssetToImportGithub` | drop if `getAssetName` is dropped |
| `server/module_loader/load_module.ts` | `.map(getAssetName)` at the store | **drop** — tim-branch honours the pin |
| `server/module_loader/load_module.ts` | Q3: `formatValidationIssues` flattens `invalid_union` branch errors | **keep** — benefits every union on every branch |
| `server/module_loader/compare_definitions.ts` | `.map(getAssetName)` in the diff | file may not exist on tim-branch |
| `server/worker_routines/run_module/run_module_iterator.ts` | Q2: `importAsset` failure now fatal (`throwIfErrNoData`) | **keep** |
| `server/db/project/modules.ts` | Q6: dead `fetchModuleFiles` import removed | **keep** |
| `lib/types/disaggregation_options.ts` | exports `PERIOD_DISAGGREGATION_OPTIONS` (single home for the period-column set, `satisfies DisaggregationOption[]`) | **keep**; fold into `getAxisSort` context later |
| `lib/normalize_po_config.ts` | private `TIME_COLUMNS` replaced by the shared set | **keep** |
| `client/src/generate_visualization/get_data_config_from_po.ts` | period axis sort rule; group-only axis fix; Q1 narrow slice (period dim on chart bars axis → `"by-id"` under `"none"`); set imported from lib | **keep** — re-verify `month` |
| `client/src/generate_visualization/get_date_label_replacements.ts` | corrected month-id comment | **keep** — the comment is wrong on every branch |
| `PROTOCOL_APP_MIGRATIONS.md` | "no silent normalization" clarification | **keep** — branch-independent |
| `client/src/generate_visualization/get_style_from_po/_0_common.ts` | `86929f84`: `getTableLayoutStyle` takes `cfOn` explicitly (CF look = white gridlines, `borderWidth: 0`, tightened header padding); new shared `getCfCellTextColorStrategy` | **keep** — the CF look is one contract for both colour sources |
| `client/src/generate_visualization/get_style_from_po/_1_standard.ts` | `86929f84`: passes its `cfOn` to `getTableLayoutStyle`; cell text colour via the shared helper | **keep** |
| `client/src/generate_visualization/get_style_from_po/_5_scorecard.ts` | `86929f84`: scorecard always gets the CF look (`cfOn: true`) and the deck-aware cell text colour (was hardcoded palette keys, ignored deck presets) | **keep** — scorecard colouring IS conditional formatting, per-indicator; do NOT unify its threshold evaluation into panther's `thresholdColorFunc` (strict-`<` upward would flip exact-boundary `lower_is_better` values, e.g. 90.0, from green to yellow) |

## panther — nothing to do

**No panther file was touched, and none needed to be.** Verified: zero `panther/`
paths in either commit, `.panther-manifest.json` unchanged at `1a901f2`, panther
working tree clean against HEAD.

- The module-install fix lives entirely at the app's GitHub-ingest boundary;
  panther has no involvement in module definitions.
- The sort fix needed only *existing* panther primitives. `HeaderSortConfig`
  already exposes `"by-id"` and `{ byIdOrder }`, so the work was choosing the
  right config, not adding a sort. The one thing that would have forced a
  vendored edit — a numeric comparator for `month` — turned out to be unnecessary
  once the ids were found to be zero-padded and therefore fixed-width.

So there is nothing to hand-port into panther source and nothing a later `./sync`
can clobber. **Do not `./sync` while the hotfix is open** (`main` pins
`1a901f2`, 2026-07-28; the panther working tree is at `e793b47`, 2026-08-07).

## `tim-branch` — merge and reconcile

`tim-branch` does **not** contain `origin/main`. It is missing the last 10
commits, including `Add What's New release-notes popup` (`c44474b2`) and the
version-history viz/image diff work. A `main` → `tim-branch` merge is needed
regardless of this hotfix; both fixes come across with it.

### Merge resolution

- [ ] **Module schema — resolve in favour of `tim-branch`.** Fix 1 is redundant
      there: `tim-branch` already has the full `repoAssetToImportGithub` union
      (`{name, repoPath, sha256}` with both **required**) and actually fetches
      pinned assets via `module_loader/repo_assets.ts`. Do **not** let `main`'s
      deliberately-lenient optional `repoPath?`/`sha256?` overwrite it, and do
      **not** carry across `getAssetName`'s collapse-to-name — on `tim-branch`
      the pin is honoured, not discarded.
- [ ] Note the structural divergence when resolving: `main` has
      `module_loader/compare_definitions.ts`; `tim-branch` has
      `module_loader/module_source.ts` + `repo_assets.ts` and no
      `compare_definitions.ts`. The `getAssetName` call site in
      `compare_definitions.ts` may not exist there at all.
- [ ] **Sort fix — keep it, but re-verify `month`.** The rule (all four period
      dims → `"by-id"`) should carry over unchanged. Confirm `tim-branch` has not
      introduced its own period ordering, and specifically that nothing there
      assumes unpadded `"1".."12"` month ids — that assumption is what produced
      the regression fixed in `6f43326f`. The authoritative fact:
      `PERIOD_COLUMN_EXPRESSIONS.month` is
      `LPAD((period_id % 100)::text, 2, '0')`.
- [ ] **Check the `customValueOrder` interaction.** `tim-branch` has the
      custom-value-ordering work (closed 2026-08-06, `e489cbc6`). An explicit
      user-chosen order on a period axis should win over `getPeriodAxisSort`;
      on `main` there is no such feature, so the precedence question does not
      arise and was not designed for.
- [ ] **`formatAs: "indicator"`** already exists on `tim-branch`. It was
      deliberately **not** back-ported to `main` — it is a real rendering
      capability, not a leniency question.
- [ ] Carry across the `PROTOCOL_APP_MIGRATIONS.md` clarification ("no silent
      normalization" bans coercion, not breadth; narrowing belongs in a named
      function). It is branch-independent guidance.

### The design debt this hotfix deliberately did not pay

**Ordering is a property of the dimension, not of the axis.** The current code
computes one `tableSort` and sprays it across all four table axes, then bolts
exceptions on top. There are now five: `getChartIndicatorSort`,
`getRollupAwareSort`, `getRollupPinOnlySort`, `customSortHeaders`/`tableSort`,
and `getPeriodAxisSort`. The right shape is a single
`getAxisSort(dimension, context)` dispatching on what the dimension **is**.

That refactor also closes two things the hotfix only worked around:

- On a scorecard, `{byIdOrder: indicatorIds}` is applied to **every** axis, so
  any non-indicator axis matches nothing, ties, and falls to the
  `localeCompare(label)` tie-break. Period axes made this visible; admin-area
  axes are in the same state and merely *look* right because alphabetical is a
  plausible answer there.
- `getChartIndicatorSort` is **dead code** — `sortIndicatorValues` is a required
  enum, so panther never applies `sort.indicator` except on the one
  `pinIndicatorAxis` path. See Q1 in the this-branch plan for the full mechanism
  and the proposed semantics.

Deliberately deferred: it touches the sort of every figure, days before a
three-week training, on the deploy branch, and would conflict badly with
`tim-branch`'s custom-value-ordering work.

- [ ] Implement `getAxisSort(dimension, context)` on `tim-branch`.
- [ ] **Q1 remainder (adjudicated 2026-08-09).** The proposed semantics were
      accepted: `sortIndicatorValues` means "rank by value", `"none"` means "the
      dimension's natural order". Only the period slice shipped on `main` (a
      period dim on the bars axis → `"by-id"` under `"none"`; asc/desc
      untouched). The remainder lands here with the dispatcher: indicator dim →
      catalog `byIdOrder`, other real dims → `"by-label"`, `"--v"` keeps
      declared order (+ rollup pin). That is the part that retroactively
      reorders existing `"none"` charts, which is why it was kept off `main`.
      Interacts with `customValueOrder` — explicit user order wins.
- [ ] **Q4 (adjudicated 2026-08-09): maps ruled untouched on `main`** — the
      hotfix churned tables and charts but no map figure, and reordering
      Angélica's stored maps mid-training for an unreported issue was judged
      wrong. Give maps their `sort` (pane/tier/lane; panther already supports
      it) in the dispatcher, period dims first.

## `wb-fastr-modules` — hold, then lockstep

- [ ] **Keep `e758c69` unpushed until the app side ships.** (2026-08-09;
      `formatAs "indicator"`, HFA variant metrics, vizPreset fixes.) Against
      `main`'s schema it fails **five** modules — m004, m005 (assetsToImport,
      fixed by this hotfix) and m007, m008, m010 (`formatAs: "indicator"`, plus
      new disaggregation options in m010). `fetchModuleFiles` resolves gitRef
      from the **default branch**, so pushing it reaches every live instance on
      its next install or update. Standing rule: deploy the app before pushing
      modules.
- [ ] **Do not run `./vendor_schema` while wb-fastr is on `main`.** It
      unconditionally copies `lib/types/_module_definition_github.ts` from
      whatever branch is checked out, and `set -e` fires only *after* the copy —
      so it leaves the modules repo broken. From `main` it produces a `TS2345` at
      `build_definitions.ts:66` (`new URL(entry.repoPath, root)`, now
      `string | undefined`) on top of 8 pre-existing `formatAs: "indicator"`
      errors. Vendor from `tim-branch`, or after the merge.
- [ ] **Record the `name` constraint while `main` is live.** In the modules repo
      `name` is the *destination* filename for the file fetched from `repoPath`;
      on `main` it means "a file the instance uploaded". They coincide only
      because authors set `name === repoPath === basename`. A future definition
      with `name: "survey.csv", repoPath: "data/survey_v3.csv"` is valid under the
      modules repo's own schema and build, and would make `main` look for
      `survey.csv` in the instance assets dir.

## Deploy-day notes for the `main` hotfix

Moved here when FOR_REVIEW_NIGERIA_HOTFIX.md was deleted (review complete
2026-08-09, no defects). The standing don'ts (keep `e758c69` unpushed, no
`./sync`, no `./vendor_schema` on `main`) are already itemised above.

- Deploy when nobody is editing — `maybeReloadOnServerVersionChange`
  (`state/project/collab.ts:872`) force-reloads collab tabs and its own comment
  says edits in the disconnection window are discarded.
- Post-deploy: anyone with a tab open should reload once. Tabs not in a collab
  session do not auto-reload and will keep showing the old sort order.
- Post-deploy: install m004/m005 and actually **run** one, before anyone uses
  "Update all modules". (A missing asset now fails loudly at the import step,
  but the reinstall path is still destructive-before-run by design.)
- Expected visible effect: stored figures **reorder and recolour** (series
  palette is assigned by axis index), and scorecards gain white gridlines —
  pre-training handouts will not match. Worth warning Angélica.
- Rollback is re-pointing at `timroberton/comb:wb-fastr-server-v1.64.7`;
  everything the new build writes is valid for 1.64.7's boot sweep. Only
  consequence is that the two bugs return.

## Ordering

1. Land/deploy on `main` (timing is Tim's call — Angélica asked for a freeze
   during the three-week training).
2. Merge `main` → `tim-branch`, resolving as above.
3. Then, and only then, push `wb-fastr-modules` `e758c69`.
4. `getAxisSort` dispatcher + Q1/Q4 on `tim-branch`.
5. Re-vendor the modules schema from `tim-branch`.
