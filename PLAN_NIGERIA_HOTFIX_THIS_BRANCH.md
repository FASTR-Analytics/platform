# Nigeria hotfix — THIS branch (`main`, 1.64.7) — DO NOW

> **What this file is.** The immediate work. `main` is the deploy branch and is
> exactly the version Nigeria runs (1.64.7). A three-week in-person training
> starts imminently, so everything here is either already shipped or is a
> decision needed **before** the deploy.
>
> **What belongs here.** Bugs to fix on `main` now; decisions that gate the
> deploy; verification of that work; deploy preconditions.
>
> **What does NOT belong here.** Anything that lands on `tim-branch`, in panther,
> or in `wb-fastr-modules`. That is
> [PLAN_NIGERIA_HOTFIX_OTHER_BRANCHES.md](PLAN_NIGERIA_HOTFIX_OTHER_BRANCHES.md),
> which is explicitly **not** urgent and must not be started during the freeze.
>
> **Keep the two files in sync.** Every question below that gets resolved and
> implemented on `main` must also be added to the other-branches plan as a
> port-back item — `tim-branch` does not contain `origin/main`, so nothing here
> reaches it by itself.

**Status 2026-08-09: all open questions adjudicated and committed.** Q1
(narrow), Q2, Q3, Q6 plus a type-reuse consolidation landed as `287769dd`; all
gates re-run green. The branch is renamed `FOR_REVIEW_NIGERIA_HOTFIX` pending
an independent check. **Nothing remains to implement on this branch** — what's
left is the review, then deploy (timing is Tim's call, deploy preconditions at
the bottom of this file). Everything in "Already ruled — do not reopen" was
decided deliberately and re-litigating it wastes the pass.

## Commits since the 1.64.7 deploy (`d7be89e7`)

| commit | what |
| --- | --- |
| `56852fc2` | auto-changelog for v1.64.7 `[skip ci]` — deploy machinery, no code |
| `1e3d47c3` | Bug A (Coverage installs: `assetsToImport` union + `getAssetName`) and Bug B (chronological period sort) |
| `6f43326f` | fixes from the adversarial review of `1e3d47c3`: `month` by-id (zero-padded ids), group-only axis sort, two false comments |
| `287769dd` | 2026-08-09 adjudication batch: Q1 narrow (period dim on chart bars axis → `"by-id"` under `"none"`), Q2 (`importAsset` failure fatal), Q3 (union error flattening), Q6 (dead import), `PERIOD_DISAGGREGATION_OPTIONS` consolidated into `lib/types/disaggregation_options.ts`; plus the plan split into THIS_BRANCH/OTHER_BRANCHES files |
| (this commit) | plan catalogue + adjudication records in both plan files |

## Why this work is on `main`

Nigeria runs **1.64.7**, which is exactly `origin/main` (deploy commit
`d7be89e7`, 2026-08-04, plus one `[skip ci]` changelog commit). This branch —
local `main`, renamed `FOR_REVIEW_NIGERIA_HOTFIX` for the independent check —
is `origin/main` plus the hotfix commits catalogued above and nothing else.
`tim-branch` is 157 commits ahead of the old base and carries the results-runs,
effective-format and custom-value-ordering work — none of it deployable
mid-training.

`main` pins panther at `1a901f2` (2026-07-28); the panther working tree is at
`e793b47` (2026-08-07). **Do not run `./sync` while this work is open.** No file
under `panther/` was touched — verified: zero `panther/` paths in either commit
and the manifest is unchanged.

A three-week in-person training starts imminently, and Angélica explicitly asked
that updates be held for its duration. Deploy timing is Tim's call.

## The two reported bugs

**Bug A — Coverage modules would not install.** Activating m004 ("M4. Coverage
estimates") or m005 ("M5. Coverage estimates ~ new, part 1") failed with
`Invalid definition for module "…"` thrown at `server/module_loader/load_module.ts:155`.

Root cause: `main`'s `assetsToImport` was `z.array(z.string())`; the modules repo
moved pinned entries to `{name, repoPath, sha256}` objects at `83618a1`
(2026-07-13). Validating the live GitHub definitions against `main`'s schema
failed on exactly those two modules and no others.

**Bug B — table rows not in chronological order.** A Health Sector Scorecard with
month rows rendered `Apr 2026, Feb 2026, Jan 2026, Jun 2026, Mar 2026, May 2026`.

Root cause: two sorts, both wrong for a period axis. `"by-label"` compares the
text `getDateLabelReplacements` produced; and on a scorecard `tableSort` is
`{byIdOrder: buildIndicatorSortOrder(...)}` applied to **all four** axes, where
period ids match nothing, tie at `POSITIVE_INFINITY`, and fall through to
`sortByIdOrder`'s `localeCompare(label)` tie-break
(`panther/_001_render_system/header_types.ts:44`). Both produce the same
alphabetical result.

## Work done — commit by commit

### `1e3d47c3` — the two fixes

**Bug A.** `lib/types/_module_definition_github.ts`: `assetsToImport` declared as
`z.union([z.string(), repoAssetPinGithub])` — the boundary states both shapes are
valid and coerces nothing. `name` required; `repoPath`/`sha256` declared but
optional. New exported `getAssetName()` narrows explicitly at **both** consumers:

- `server/module_loader/load_module.ts:243` — stores the definition; the
  installed schema is `z.array(z.string())`.
- `server/module_loader/compare_definitions.ts:90` — stringify-compares incoming
  against stored. Unmapped, every pinned module would have shown a permanent
  spurious "assets changed" in the update preview.

Runtime unchanged: the collapsed names are `survey_data_unified.csv` and
`population_estimates_only.csv`, byte-identical to the plain strings m004
carried at `3ab83f7` (2026-07-12), which is what
`run_module_iterator.ts:184` feeds to `importAsset`.

`PROTOCOL_APP_MIGRATIONS.md` "GitHub-Authored Schemas" extended to record the
distinction this turns on: **"no silent normalization" bans coercion, not
breadth** — a declared union is fine; the narrowing belongs in a named function.

**Bug B.** `getPeriodAxisSort(prop)` in
`client/src/generate_visualization/get_data_config_from_po.ts`, taking precedence
over `tableSort`/`"by-label"`, applied to table row/rowGroup/col/colGroup and
chart + timeseries series/lane/tier/pane.

### `6f43326f` — fixes from the adversarial review of `1e3d47c3`

**The `month` rule was wrong, and worse than what it replaced.** Month ids are
**zero-padded**: the column is derived as `LPAD((period_id % 100)::text, 2, '0')`
(`server_only_funcs_presentation_objects/period_helpers.ts:21`), and
`run_module_iterator.ts:437-442` excludes any physical `month` column from
results tables, so that expression is the only source. An explicit `"1".."12"`
order list matched only `"10".."12"`, hoisting Q4 to the front and dropping
`"01".."09"` onto the label tie-break:

```text
OLD (alphabetical)   Apr, Aug, Dec, Feb, Jan, Jul, Jun, Mar, May, Nov, Oct, Sep
1e3d47c3 (shipped)   Oct, Nov, Dec, Apr, Aug, Feb, Jan, Jul, Jun, Mar, May, Sep
6f43326f (by-id)     Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
```

Because the ids are fixed-width, `"by-id"` is correct for `month` too, so all
four period options now share one rule and the constant is gone. Note a
partial-year axis was byte-identical to the old output — which is why the
original harness, built from the same wrong premise as the code, passed.

**Period on a group-only axis was silently unfixed.** panther's
`promoteGroupPropIfNoItemProp` (`panther/_010_table/get_table_data.ts:178`)
collapses a group axis with no item axis and carries `itemSort ?? groupSort`, so
always supplying a sort for the absent item axis discarded the group's own. An
axis with no prop now gets **no** sort, which is what the per-axis optional type
intends. Verified: `Apr, Feb, Jan, Mar` → `Jan, Feb, Mar, Apr`.

**Two false comments corrected.** `get_date_label_replacements.ts:55` claimed
month values are 1-12 (harmless there only because it uses `parseInt` — and the
source of the bug above). And the claim that a row-derived order would be baked
into stored FigureInputs: those were converted to FigureBundles by
`data_transforms/_figure_block.ts` and are rebuilt at every render, so the real
argument for a rule is totality, not staleness.

### `287769dd` — the 2026-08-09 adjudication batch

Six code files (details in the adjudicated Q sections below):

- `client/src/generate_visualization/get_data_config_from_po.ts` — Q1 narrow:
  `periodIndicatorSort` (period dim on bars axis under `"none"` → pass
  `sortIndicatorValues: undefined` + `sort.indicator: "by-id"`); local period
  set replaced by the lib import.
- `lib/types/disaggregation_options.ts` — new exported
  `PERIOD_DISAGGREGATION_OPTIONS`, `satisfies DisaggregationOption[]`.
- `lib/normalize_po_config.ts` — private `TIME_COLUMNS` replaced by the shared
  set. No behavior change.
- `server/worker_routines/run_module/run_module_iterator.ts` — Q2:
  `throwIfErrNoData(await importAsset(...))`.
- `server/module_loader/load_module.ts` — Q3: `formatValidationIssues` flattens
  `invalid_union` branch issues with the union's path prefixed.
- `server/db/project/modules.ts` — Q6: dead `fetchModuleFiles` import removed.

Also carries the rename `PLAN_NIGERIA_HOTFIX.md` →
`PLAN_NIGERIA_HOTFIX_OTHER_BRANCHES.md` (staged before the batch).

## Current sort rule

All four period dimensions → `"by-id"`, because every id is fixed-width:

| dimension | id format |
| --- | --- |
| `period_id` | 6-digit `YYYYMM` |
| `quarter_id` | 5-digit `YYYYQ` |
| `year` | 4-digit `YYYY` |
| `month` | 2-digit zero-padded `"01"`–`"12"` |

`time_point` (HFA survey rounds) is excluded: non-numeric ids with their own
`sortOrder` concept.

## Coverage — what the sort fix does and does not reach

| builder | axes | status |
| --- | --- | --- |
| table | row, rowGroup, col, colGroup | fixed |
| timeseries | series, lane, tier, pane | fixed (but see below) |
| chart-ov | series, lane, tier, pane | fixed |
| chart-oh | series, lane, tier, pane | fixed |
| chart **bars** (indicator axis) | — | period dims fixed under `"none"` (Q1 narrow, 2026-08-09); other dims → tim-branch |
| map | pane, tier, lane | ruled untouched — tim-branch (Q4) |

Both chart variants spread one `getChartJsonDataConfig`, so OV and OH are covered
by a single change.

Of the four special configs, only `isSpecialScorecardTableActive` touches
ordering (it supplies `customSortHeaders`), and the period rule now takes
precedence over it. `isSpecialBarChartActive`, `isSpecialCoverageChartActive` and
`isSpecialDisruptionsChartActive` are consumed only by `get_style_from_po.ts` and
`conditional_formatting.ts`, so they never reach a sort.

The timeseries arm is believed unreachable — period dims are restricted to
`["table","chart"]` — so it is defensive only.

## Verification

- `deno task typecheck` (server + client + `lint:systems`) — pass
- `./validate_migrations` — pass
- `./validate_queries` — 46/46
- `cd client && npm run build` — pass (an unconditional `./deploy` step)
- **Module schema harness** — all 10 live GitHub definitions parse; m004/m005
  collapse to the two expected names; m007/m008 plain-string assets unaffected;
  legacy pins carrying `commit` still parse; mixed string+pin arrays work; a pin
  without `name` is still rejected; `compareDefinitions` reports no spurious
  change and still detects a real one.
- **Full install derivation** for all 10 modules through every write schema
  (github → `translateMetrics` → `metricStrict` → `deriveDefaultPresentationObjects`
  → `presentationObjectConfigSchema` → `moduleDefinitionInstalledSchema`) — all pass.
- **Sort harnesses** against panther's real `sortHeaderItems` and
  `getTableDataTransformed`: reported scorecard case reproduced from the old
  config and correct under the new; year boundary; full-year and partial-year
  `month` with real zero-padded ids; `quarter_id`; `year`; group-only axis
  promotion; non-period props untouched.

**2026-08-09 adjudication batch** (Q1 narrow, Q2, Q3, Q6, type consolidation):

- `deno task typecheck` (server + client + `lint:systems`) — pass
- `./validate_queries` — pass (lib changed, so re-run)
- `cd client && npm run build` — pass
- **Q3 harness** against the real github schema + real m004 `definition.json`:
  intact definition parses; typo'd-key corruption now reports both union
  branches with full paths.
- **Q1 harness** against panther's real `getChartOVDataJsonTransformed`:
  scrambled zero-padded months on the bars axis under `"none"` → `Jan..Jun`
  with the new config, data order with the old; `"descending"` still ranks by
  value.

## Reviewed

Six agents reviewed `1e3d47c3` adversarially — three briefed on the objectives,
three given only the commit. Findings acted on are in `6f43326f`; the rest are
the open questions below. Confirmed independently by multiple reviewers:

- **Rollback is clean.** Everything the new build writes is valid for 1.64.7's
  boot sweep (verified via the full install derivation, not by reasoning). Only
  consequence of rolling back is that Bug A returns. Roll back by re-pointing at
  `timroberton/comb:wb-fastr-server-v1.64.7`.
- **No boot-failure path** — no boot-path file touched, installed schema
  byte-identical, no transform added. The skip-gate works the right way round:
  object-shaped stored assets are a *type* mismatch, so the row enters the
  transform rather than being skipped.
- **No Valkey prefix bump and no figure sweep needed** — the sort is computed
  client-side at render, and no stored row contains a sort config.
- **`getAssetName` coverage is complete** — exactly two consumers of the github
  shape, verified by independent grep including implicit spreads. A missed one
  could not ship silently: `prepareModuleDefinitionForStorage` hard-parses
  against `z.array(z.string())`.
- **No roll-up interaction** — `ROLLUP_DIMENSIONS` is admin levels + facility
  columns, so a period dim is never the rolled axis and no sentinel pin is lost.
- **Conditional formatting is order-independent** (id-keyed lookups), so
  reordering cannot mis-colour cells.

## Expected visible effect

Stored figures **reorder and recolour**. Series palette colour is assigned by
axis *index* (`get_style_from_po/_0_common.ts` `getIndex`), so a reordered period
axis reassigns series colours and legend order on already-approved decks. This is
inherent to the fix being retroactive, which is what we want. Worth warning
Angélica: pre-training handouts will not match.

---

## Open questions — ADJUDICATED 2026-08-09

All six resolved. Q1 (narrow), Q2, Q3 and Q6 are implemented in the working
tree (uncommitted); Q1's remainder and Q4 are ruled to `tim-branch` and recorded
in the other-branches plan. Every claim below was re-verified against the code
before ruling; the Q3 message and the Q1 sort behaviour were verified by
executing harnesses against the real schema and panther's real
`getChartOVDataJsonTransformed`.

## Q1 — chart bars axis: RULED, split. Period slice on `main`; the rest to `tim-branch`

**Verified mechanism (all re-confirmed).** `s.sortIndicatorValues` is a required
enum, so it is always a truthy string; panther applies `sort.indicator` only
when `sortIndicatorValues` is `undefined`
(`_010_chartov/get_chartov_data.ts:139-141`, identical in `_010_chartoh`);
`pinIndicatorAxis` was the only `undefined` path; `getChartIndicatorSort` was
dead code; the items query has no `ORDER BY`. `collectHeaders` returns declared
`valueProps` order for `"--v"` but row-encounter order for real dims.

**Ruling.** The proposed semantics are right — `"none"` should mean "the
dimension's natural order" — but only the **period** slice belongs on `main`
during the freeze:

- **Shipped on `main`:** when `s.sortIndicatorValues === "none"` and the bars
  axis carries a period dim, pass `sortIndicatorValues: undefined` +
  `sort.indicator: "by-id"` (`periodIndicatorSort` in
  `get_data_config_from_po.ts`). This completes the Bug-B class — the bars axis
  was the ONLY chart axis left arbitrary for periods, an incoherent boundary a
  trainee would read as "still broken". Only charts whose current order is
  meaningless change. Mutually exclusive with `pinIndicatorAxis` (roll-up dims
  are never period dims). `"ascending"`/`"descending"` untouched — verified by
  harness (scrambled months → `Jan..Jun`; `"descending"` still ranks by value).
- **Deferred to `tim-branch`:** indicator dim → catalog order, other dims →
  `"by-label"`. That retroactively reorders every existing `"none"` chart with
  no reported bug behind it — wrong to ship days before the training — and it
  interacts with `tim-branch`'s custom-value-ordering work. Lands with the
  `getAxisSort` dispatcher.

## Q2 — `importAsset` failure: RULED fatal, implemented

`run_module_iterator.ts:191` is now
`throwIfErrNoData(await importAsset(asset, moduleDirPath))` — the same helper
and pattern as `storeResultsObject` at line 329. The iterator's catch writes
`Error running module: …` as `bad-close`, so a missing asset now fails loudly at
the exact step, not as R's opaque `cannot open file`.

Re-verified before ruling: the reinstall path (`update_all_modules.tsx:50`,
`reinstall: true, rerun: true` → `updateModuleDefinition`) really does `DELETE`
the module row and `DROP` every `ro_*` table before the run, and m006 declares
`prerequisites: ["m005"]`.

**Pre-flight asset check in the reinstall path: RULED no.**
Destructive-before-run is inherent to reinstall+rerun for every failure mode
(bad script, bad data, missing asset alike); a pre-flight would special-case one
of them. Fatal-with-clear-log is the fix.

## Q3 — union error message: RULED fix, implemented

`formatValidationIssues` in `load_module.ts` now recursively flattens
`invalid_union` branch issues with the union's path prefixed. Verified by
executing against the real schema and the real m004 `definition.json`
(still parses), then corrupted:

| input | before | now |
| --- | --- | --- |
| `[{assetName: "a.csv"}]` | `assetsToImport.0: Invalid input` | `assetsToImport.0: Invalid input: expected string, received object; assetsToImport.0.name: Invalid input: expected string, received undefined` |

## Q4 — maps: RULED leave on `main`, port to `tim-branch`

The hotfix churned tables and charts but no map figure; keeping maps wholly
untouched is a coherent boundary, and reordering stored maps mid-training for
an unreported issue — for a heavy map user — is exactly the churn to avoid.
Verified panther's map transform does honour `sort` (pane/tier/lane) when
given one, so the tim-branch fix is config-only, in the dispatcher.

## Type reuse — the period set now has one home

`PERIOD_DISAGGREGATION_OPTIONS` moved to `lib/types/disaggregation_options.ts`,
typed `satisfies DisaggregationOption[]` so the compiler ties it to the enum.
It replaces both the client's hand-rolled copy and lib's private `TIME_COLUMNS`
(`normalize_po_config.ts` — byte-identical semantics, now imports the shared
set). Deliberately NOT merged with `TIME_DISAGGREGATIONS`, `periodOption`, or
`INTEGER_FILTER_COLUMNS`: all three exclude `month` on purpose (it is a derived
zero-padded text column, not a queryable period format).

## Q5 — `repoPath`/`sha256` optional (decision made, flagging the cost)

Declared optional so an unrelated modules-repo change cannot break installs
again — the exact failure being fixed. Two consequences:

- The modules repo's vendored copy (synced from tim-branch) has them
  **required**, so a `{name}`-only pin installs on `main` and would be rejected
  after upgrading to the results-runs branch.
- `wb-fastr-modules/vendor_schema` unconditionally copies from whatever branch
  wb-fastr has checked out. Run while on `main`, it adds a `TS2345` at
  `build_definitions.ts:66` (`new URL(entry.repoPath, root)`) to an already-broken
  vendoring (8 pre-existing `formatAs: "indicator"` errors). **Do not run
  `./vendor_schema` while wb-fastr is on `main`.**

Also latent: `name` is the *destination* filename in the modules repo but means
"a file the instance uploaded" on `main`. They coincide only because authors set
`name === repoPath === basename`. Worth recording as a constraint while `main` is
live.

## Q6 — dead import: removed

`server/db/project/modules.ts:36` imported `fetchModuleFiles`; unused. Removed.

---

## Already ruled — do not reopen

- **Instance vs repo asset data.** RULED not an issue (Tim, twice). `importAsset`
  copies the instance's uploaded asset into the module working dir on every run —
  exactly as `main` has always done. m004 read the instance uploads before
  2026-07-13 and reads them again now: identical behaviour, no new exposure. The
  repo's pinned copy is a `tim-branch` concept that was never live on `main`, so
  "main discards the pin" is not a finding for this branch. Whether an instance's
  survey data should be refreshed is data ops, independent of this commit. One
  reviewer raised this as HIGH; it is not.
- **State-level vs national scorecard discrepancy** (third bullet of the
  2026-08-06 email). Their comparison error, not a bug — the email's own figures
  agree at 62%.
- **"Sort both columns to rank districts"** (2026-07-30 email). A different,
  unimplemented feature — sorting rows by a *value* column. Tables have no value
  sort on `main`. Not the chronological bug and not a regression.
- **`.transform()` in the schema.** Rejected: PROTOCOL_APP_MIGRATIONS.md forbids
  silent normalization at this boundary, and `.transform()` appears nowhere else
  in `lib/`, `server/` or `client/src`.
- **Reverting `wb-fastr-modules`.** Rejected: fights the sha-pin work, breaks
  tim-branch, and the repo has no per-instance branching.
- **Pinning the module fetch to an older gitRef.** Rejected: no mechanism exists
  on `main` (`load_module.ts:124` always resolves HEAD for the path).
- **A data-derived `byIdOrder` for periods.** Rejected in favour of a rule. The
  `month` bug is the evidence: a derived list is only correct for the values that
  happened to be present.
- **An explicit `1..12` month order list.** Rejected — those ids do not exist.

---

## Deploy preconditions

1. Keep `wb-fastr-modules` `e758c69` **unpushed**. Against `main`'s schema it
   fails **five** modules — m004, m005 (assetsToImport) and m007, m008, m010
   (`formatAs: "indicator"`, plus new disaggregation options in m010).
   `fetchModuleFiles` resolves gitRef from the **default branch**, so pushing it
   reaches every live instance on its next install or update.
2. Do **not** run `./sync` (panther pinned at `1a901f2`, working tree 10 days ahead).
3. Do **not** run `wb-fastr-modules/vendor_schema` while on `main` (Q5).
4. Deploy when nobody is editing — `maybeReloadOnServerVersionChange`
   (`state/project/collab.ts:872`) force-reloads collab tabs and its own comment
   says edits in the disconnection window are discarded.
5. Post-deploy: anyone with a tab open should reload once. Tabs not in a collab
   session do not auto-reload and will keep showing the old order.
6. Post-deploy: install m004/m005 and actually **run** one, before anyone uses
   "Update all modules". (A missing asset now fails loudly at the import step —
   Q2 — but the reinstall path is still destructive-before-run by design.)
