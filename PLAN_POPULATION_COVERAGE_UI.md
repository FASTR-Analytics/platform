# PLAN: show users what a results package left out of population rates

Status: OPEN. Rulings agreed (Tim, 2026-09-07). Not started.

Repos: this app only.

Read first: [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)
"population.csv", `lib/types/run_manifest.ts` (`runPopulationSchema`),
`lib/types/run_generation.ts` (`RunDetail`,
`ResultsPackageCompatibilityIssue`), `server/runs/package_internals.ts`
(`getRunDetail`), `client/src/components/instance_results_packages/detail.tsx`,
the compatibility modal under `client/src/components/project/`, and
[PROTOCOL_APP_DEVELOPMENT.md](PROTOCOL_APP_DEVELOPMENT.md).

## 1. The problem

m012 works on the intersection of population and HMIS data. A package
records what it covered in the manifest's `population` stamp (`active`, the
level used, the types, and per type the areas covered out of the total and
the first and last covered month). Nothing in the UI reads the stamp, so a
population-rate chart that starts in 2021 beside a count chart that starts
in 2015, or a scorecard blank for two districts, has no explanation
anywhere. And when a project's figure asks for a level the package lacks
because population moved every indicator to a coarser level, the
compatibility modal says "This package does not produce: District" with no
reason.

## 2. Rulings

0. **Population is invisible unless a formula names it.** An instance whose
   dictionary has no population term sees nothing about population in the
   package detail or the compatibility modal. No "not used" lines: a line
   about a feature the user has never touched invites a question and
   answers nothing.
1. **Proportionate to other issues, and no new client state.** Both
   surfaces below are fed by data the server already derives from the
   manifest and the client already holds. Rejected on that ground: a
   population line in the wizard confirm step (needs the resolved catalog
   on the client), a note in the indicator editor when a formula first
   names a population (needs every other saved formula in the editor),
   translated refusal messages (the dictionary refusal in the same flow is
   English-only; treat both or neither, later), and carrying the stamp into
   the AI copilot's per-package context (the caveat in m12-01-01's metric
   text is enough).
2. **The package detail shows the stamp.** `RunDetail` gains
   `population: RunPopulation | null`, copied from the manifest by
   `getRunDetail`. The detail view renders, only when `active`, one line
   per type: the level label, areas covered out of the total, and the
   covered month range; "not recorded" when `coverage` is null (a package
   written before the stamp existed). `RunDetail` is immutable per run and
   already cached in T2, so nothing else changes.
3. **The compatibility modal gives the reason.** The
   `dimensions_not_in_package` issue gains an optional `populationLevel`,
   set by the server when a missing dimension is an admin level and the
   candidate package's stamp is active at a shallower level. The modal
   appends "because population data is at <level label>" to that issue.
   The report is already a manifest lookup, so this is a field, not a query.
4. **The instance Data page stops painting a missing population red.**
   The "No population level set" / "No population data" text in
   `instance_data.tsx` becomes muted, not danger. Doing it properly (hide
   unless a formula names a population) needs "active" in instance state,
   which ruling 1 forbids; neutral text is the zero-state answer.

## 3. Implementation

- `lib/types/run_generation.ts`: the two type additions above.
- `server/runs/package_internals.ts`: `getRunDetail` copies
  `manifest.population`; the compatibility builder sets `populationLevel`.
- `client/src/components/instance_results_packages/detail.tsx`: the
  population lines, in the block that lists the package's datasets, using
  the instance's admin area labels for the level.
- The compatibility modal: the appended reason.
- `client/src/components/instance/instance_data.tsx`: the class change.
- SYSTEM_08 "population.csv": one sentence naming the two surfaces.
  SYSTEM_15 (instance administration) if the Data page text is described
  there.

## 4. Verification

- `deno task typecheck`, `./validate_protocols`.
- Harness: `getRunDetail` over a scratch package with an active stamp, an
  inactive stamp, and a null stamp returns the field verbatim; the
  compatibility builder sets `populationLevel` only for the active,
  shallower case.

## 5. Out of scope

- The Population page and its complete/incomplete rule.
- The one-directional intersection (a cell with population but no reported
  HMIS data keeps its person-years at roll-ups). Needs its own ruling.

## 6. Done when

The gates and the harness pass, the SYSTEM sentence is written, and this
file is deleted in the same commit.
