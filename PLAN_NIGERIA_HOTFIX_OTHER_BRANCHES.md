# Nigeria hotfix (on `main`, 1.64.7)

Bugs reported by Angélica López Hernández for the Nigeria state-level training
(email "Nigeria state-level training small bugs to fix for training next week",
2026-08-06; sorting also reported 2026-07-30).

## Why this work is on `main` and not `tim-branch`

Nigeria runs **1.64.7**, which is exactly `origin/main` (deploy commit
`d7be89e7`, 2026-08-04, plus one `[skip ci]` changelog commit). `tim-branch` is
157 commits ahead and carries the results-runs, effective-format and
custom-value-ordering work — none of it deployable to Nigeria mid-training.

`main` pins panther at **`1a901f2`** (2026-07-28); the panther working tree is
at `e793b47` (2026-08-07). **Do not run `./sync` while this work is open** — it
would drag 10 days of panther changes onto the release branch.

Both fixes below turned out to be **app-side only**. No file under `panther/`
was touched, so there is nothing to hand-port into panther source and nothing
that a later sync can clobber.

`tim-branch` does **not** contain `origin/main` (the last 10 commits, including
`Add What's New release-notes popup` and the version-history diff work). A
`main` → `tim-branch` merge is needed regardless of this hotfix; these two fixes
come across with it.

## Fix 1 — Coverage modules fail to install

**Symptom.** Activating the Coverage module fails with
`Invalid definition for module "…"` (thrown at
`server/module_loader/load_module.ts:155`).

**Root cause.** `main`'s `assetsToImport` was `z.array(z.string())`. The modules
repo switched the pinned entries to objects (`{name, repoPath, sha256}`) at
`83618a1`, 2026-07-13. Validating the live GitHub definitions against `main`'s
schema fails on exactly two modules:

```text
FAIL m004  assetsToImport.0/.1 -> expected string, received object
FAIL m005  assetsToImport.0/.1 -> expected string, received object
```

m004 = "M4. Coverage estimates", m005 = "M5. Coverage estimates ~ new, part 1".
All eight other modules pass.

**Fix.** Two parts, deliberately kept apart:

1. `lib/types/_module_definition_github.ts` — `assetsToImport` is declared as
   `z.union([z.string(), repoAssetPinGithub])`. The schema states that both
   shapes are valid input and coerces nothing. `repoPath`/`sha256` are declared
   but optional (documentation, not a tripwire); `name` is required, so a
   malformed pin is still a hard error.
2. `getAssetName(asset)` — an exported, named collapse called explicitly by each
   consumer of a github definition's `assetsToImport`.

**No `.transform()`.** PROTOCOL_APP_MIGRATIONS.md "GitHub-Authored Schemas"
forbids silent normalization at this boundary, and `.transform()` appears
nowhere else in `lib/`, `server/` or `client/src`. That section has been
extended to record the distinction this fix turns on: a declared union is
breadth, not coercion; the narrowing belongs in a named function.

The collapse mirrors at ingest what the persistence layer already does at rest
(`server/db/migrations/data_transforms/module_definition.ts` Block 1b, commented
*"results-runs branch shape, not on main"*).

**Both consumers must map.** There are two, and missing either is a bug:

- `server/module_loader/load_module.ts` — stores the definition; the INSTALLED
  schema is `z.array(z.string())`.
- `server/module_loader/compare_definitions.ts` — stringify-compares incoming
  against stored. Unmapped, every pinned module would report a permanent
  spurious "assets changed".

**Runtime is unchanged.** The collapsed names are
`survey_data_unified.csv` and `population_estimates_only.csv` — byte-identical
to the plain strings m004 carried before 2026-07-13, which is what
`server/worker_routines/run_module/run_module_iterator.ts:184` feeds to
`importAsset(name)` against the instance's uploaded assets.

**Verified.** All 10 GitHub definitions parse; m004/m005 yield exactly the two
expected asset names.

## Fix 2 — Table rows not in chronological order

**Symptom.** A Health Sector Scorecard with month rows renders
`Apr 2026, Feb 2026, Jan 2026, Jun 2026, Mar 2026, May 2026` — alphabetical by
display label.

**Root cause.** Two sorts, both wrong for a period axis, in
`client/src/generate_visualization/get_data_config_from_po.ts`:

- `"by-label"` compares the relabelled text (`getDateLabelReplacements` turns
  `202604` into `"Apr 2026"`).
- For the special scorecard, `tableSort` is
  `{ byIdOrder: buildIndicatorSortOrder(...) }` and is applied to **all four**
  axes. Period ids match no indicator id, so every row ties at
  `POSITIVE_INFINITY` and falls through to `sortByIdOrder`'s
  `localeCompare(label)` tie-break (`panther/_001_render_system/header_types.ts:44`)
  — the same alphabetical result.

**Fix.** `getPeriodAxisSort(prop)` — a lookup from period dimension to sort
rule, taking precedence over `tableSort` / `"by-label"`. Applied to the table
axes (row/rowGroup/col/colGroup) and the chart + timeseries
series/lane/tier/pane axes:

| dimension | id format | sort |
| --- | --- | --- |
| `period_id` | `YYYYMM` | `"by-id"` |
| `quarter_id` | `YYYYQ` | `"by-id"` |
| `year` | `YYYY` | `"by-id"` |
| `month` | `1`–`12` | `{ byIdOrder: MONTH_ID_ORDER }` |

**The order is a rule, not data — this matters.** The first cut derived a
numeric-ascending id list from `jsonArray`. That is wrong in a way tests on
current data would not catch: the array gets baked into stored FigureInputs, so
re-rendering a stored figure against a period it did not contain when saved
leaves that new id out of the frozen list, dropping it to `POSITIVE_INFINITY`
and back onto the alphabetical tie-break. A rule cannot go stale.

Ids are numeric, and all except `month` are fixed-width (see panther's
`decodePeriod`), so panther's existing `"by-id"` string compare is already
chronological for those three. `month` is the only variable-width case — a
string compare gives `1, 10, 11, 12, 2` — and its domain is closed, so it gets
an explicit 12-entry constant. No new panther primitive was needed.

Notes:

- Declarative (`"by-id"` / a constant array, never a function) so it stays
  `structuredClone`-safe inside stored FigureInputs, matching
  `getRollupAwareSort`.
- No roll-up collision: `ROLLUP_DIMENSIONS` is admin levels + facility columns,
  so a period dimension is never the rolled axis.
- The chart **indicator** axis is deliberately excluded — panther keeps it in
  data order whenever `sortIndicatorValues` is a string, so it never reaches the
  alphabetical path.

**Verified.** A harness over panther's real `sortHeaderItems` covers: the
reported scorecard case (reproduced exactly from the old config, correct under
the new one), a year boundary, `month` under both the rule and plain `"by-id"`
(showing why the constant exists), `quarter_id`, `year`, and the staleness case
above.

### Known design debt (do NOT fix on this branch)

`getPeriodAxisSort` is the **fifth** special case in this file, alongside
`getChartIndicatorSort`, `getRollupAwareSort`, `getRollupPinOnlySort` and
`customSortHeaders`/`tableSort`. The underlying shape is wrong: **ordering is a
property of the dimension, not of the axis**, but the code computes one
`tableSort` and sprays it across all four axes, then bolts exceptions on top.
The right design is a single `getAxisSort(dimension, context)` dispatching on
what the dimension is.

That refactor also closes a live bug this one only papers over: on a scorecard,
`{ byIdOrder: indicatorIds }` is applied to **every** axis, so any non-indicator
axis matches nothing, ties, and falls to the `localeCompare(label)` tie-break.
Period axes made it visible; admin-area axes are in the same state and merely
*look* right because alphabetical is a plausible answer there.

Deliberately not done here: it touches the sort of every figure, days before a
three-week training, on the deploy branch, and would conflict badly with
`tim-branch`'s custom-value-ordering work. **Do it on `tim-branch`.**

## Not fixed (deliberate)

- **State vs national scorecard discrepancy** (third bullet of the 2026-08-06
  email). Ruled not a bug — their comparison error. Note the email's own figures
  agree (62% both sides).
- **"Sort by a value column to rank districts"** (2026-07-30 email). This is a
  *different* request from the chronological bug: sorting rows by a value column
  under disaggregation. Tables have no value sort on `main`
  (`sortIndicatorValues` is chart-only). Unimplemented feature, not a
  regression.
- **`time_point`** (HFA survey rounds) is not in the period set. Its ids are not
  numeric and it carries its own `sortOrder` concept; out of scope here.

## Hazard — hold the modules repo

`wb-fastr-modules` has **one unpushed commit**, `e758c69` (2026-08-09,
`formatAs "indicator"`, HFA variant metrics, vizPreset fixes). Against `main`'s
schema it fails **five** modules:

```text
FAIL m004 m005       (assetsToImport — fixed above)
FAIL m007 m008 m010  (formatAs "indicator"; m010 also new disaggregation options)
```

Pushing it would take out both scorecards and HFA on Nigeria. It must stay
unpushed until the app side ships — the standing "deploy app before pushing
modules" rule.

Fix 1 does **not** cover `formatAs: "indicator"`; that is a genuine schema
capability that only exists on `tim-branch`, and deliberately was not
back-ported.

## Gates run

- `deno task typecheck` (server + client + `lint:systems`) — pass
- `./validate_migrations` — pass
- Module schema harness — pass: all 10 GitHub definitions parse; m004/m005
  collapse to the two expected names; m007/m008 plain-string assets unaffected;
  legacy pins carrying `commit` still parse; mixed string+pin arrays work; a pin
  without `name` is still rejected; `compareDefinitions` reports no spurious
  change and still detects a real one
- Period-sort harness against panther primitives — pass (7 cases, see Fix 2)

## Open — needs a look, not necessarily a fix

- `importAsset`'s return value is **discarded** at
  `run_module_iterator.ts:191`. A missing asset fails silently and surfaces
  later as an opaque R `cannot open file` error. Pre-existing.
- `importAsset` joins the asset name onto `_ASSETS_DIR_PATH` directly instead of
  via `resolveAssetFilePath`, whose own doc comment says every such join must go
  through it. The name here comes from an external GitHub definition.
  Pre-existing; `tim-branch` already has related hardening.
- Consequence for this fix: if Nigeria's assets dir lacks
  `survey_data_unified.csv` / `population_estimates_only.csv`, Coverage will now
  install and then fail at run time. Unlikely — the module worked before
  2026-07-13 and its asset list has only shrunk since — but the silent failure
  above would make it hard to read. Instance asset *vintage* is out of scope:
  on `main` these have always come from instance uploads, never the repo.

## Port-back checklist

- [ ] Merge `main` → `tim-branch` (brings both fixes plus the 10 commits
      `tim-branch` is missing).
- [ ] On `tim-branch`, Fix 1 is redundant — that branch already has the full
      `repoAssetToImportGithub` union and fetches pinned assets. Resolve the
      merge in favour of `tim-branch`'s richer schema; do not let the collapsing
      transform overwrite it.
- [ ] Fix 2 applies unchanged to `tim-branch` and should be kept. Check it
      against that branch's `customValueOrder` work — an explicit user ordering
      on a period axis should win over `getPeriodAxisSort`.
- [ ] No panther source changes required.
