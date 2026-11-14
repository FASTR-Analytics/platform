# PLAN: Results package contents label

Show what each results package contains, as briefly as possible: the data families it captured and how many modules it ran. The catalogue table gets a Data column and a Modules column. One label function, built from the package's label, families and module count, names a package wherever a user picks one.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md), [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md). Start when: any time.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_06_PACKAGE_CONTENTS_LABEL.md." Branch, floor, tests, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 2.

Vocabulary:

- **Families**: the dataset families a package captured, `DatasetType[]` (`hmis`, `hfa`, `iceh`), in `MODULE_FAMILY_ORDER`.
- **Module count**: how many modules a package ran, `RunSummary.moduleIds.length`.
- **Families label**: the family names joined with `+`, for example `HMIS+HFA`.
- **Contents label**: the families label, one space, then the module count followed by `m`, for example `HMIS+HFA 6m`.
- **Display label**: a package's label, one space, then its contents label, for example `2026-11-14 HMIS+HFA 6m`.

## §1 The problem

1. **The table shows no contents.** The catalogue table ([results_packages.tsx:165-216](client/src/components/results_packages/results_packages.tsx#L165-L216)) has Package, Created, Created by, Status and Usage columns. Telling two packages apart means opening each one.
2. **Modules are on the row, families are not.** `RunSummary.moduleIds` ([run_manifest.ts:335-342](lib/types/run_manifest.ts#L335-L342)) is written at launch ([launch.ts:143-150](server/worker_routines/generate_run/launch.ts#L143-L150)) and again at publish ([build_run_package.ts:293-303](server/runs/build_run_package.ts#L293-L303)), so every wizard row carries it. No column or summary field records the families. `MODULE_REGISTRY` has no family, by design: a module's family travels with its definition ([module_registry.ts:3-6](lib/types/module_registry.ts#L3-L6)).
3. **Families cannot be derived from modules.** The wizard lets a package capture a family's data with none of that family's modules: step 1 picks families ([prepare_inputs.ts:150](server/worker_routines/generate_run/prepare_inputs.ts#L150), `:190`, `:269`), and step 2 may leave every module of a picked family unticked.
4. **Pickers name a package by label and date only.** `readyPackageOptionLabel` ([package_label.ts:32-38](client/src/components/_shared/package_label.ts#L32-L38)) feeds the create-product modal, the package-and-scope modal and Explore. `ReadyPackage` ([run_generation.ts:149-153](lib/types/run_generation.ts#L149-L153)) carries only id, label and creation time, and `listReadyPackages` ([run_generation.ts:170-196](server/db/instance/run_generation.ts#L170-L196)) reads only those columns.

## §2 The model

- `RunSummary` carries `families: DatasetType[] | null`. Launch writes the step 1 families. Publish writes the families of the manifest's `datasets`. The `runs_summary` data transform stamps every existing row from its package's manifest, or `null` when the run has no manifest.
- `ReadyPackage` carries `families` and `moduleCount`, read from `runs.summary`.
- `lib/run_contents_label.ts` holds four pure functions: `familiesOfDatasetTypes`, `packageFamiliesLabel`, `packageContentsLabel` and `packageDisplayLabel`.
- The catalogue table has a Data column showing the families label and a Modules column showing the bare module count.
- `readyPackageOptionLabel` starts with the display label.

## §3 Rulings

1. Families are stored in `RunSummary`, not in a new `runs` column. Both writers already write the summary, at launch and at publish, so a generating or failed run carries families with no schema change. _(proposed)_
2. `families` is `null` only on a generating or failed run that has no readable manifest and was launched before launch recorded families. Such a run's families are knowable only at generation time, so the transform never derives them from the modules. _(proposed)_
3. One pure function, `familiesOfDatasetTypes(types: readonly string[]): DatasetType[]` in the new `lib/run_contents_label.ts`, returns `MODULE_FAMILY_ORDER` filtered to the given types. It does not go in `lib/types/`, because `MODULE_FAMILY_ORDER` lives in `lib/group_metrics.ts`, which imports `lib/types/mod.ts`. Publish and the transform both call it on the manifest's `datasets[].datasetType`. Launch's `selectedFamilies` becomes `MODULE_FAMILY_ORDER.filter((family) => step1Result[family])` and goes into the summary as is. _(amended at step 1)_
4. Transform block 2 in `runs_summary.ts` stamps `families` on each row whose raw summary has no `"families"` key. It reads `manifest.json` from `runDirPath(id)` as raw JSON for every row and passes `datasets[].datasetType` through rule 3. Any read, JSON or datasets-shape failure counts as unreadable, as the manifest sweep treats it. Unreadable on a generating or failed run gives `null`. Unreadable on any other status leaves the key absent for the next boot, unlogged, because the manifest sweep already reports the package. Block 1's strip is written even when block 2 defers. A malformed summary is skipped, as block 1 does. The gate is a raw key scan, because `families` is required and a deferred row must not fail boot. _(amended at step 1)_
5. `RunSummary` becomes `z.infer<typeof runSummarySchema>`. `toRunListingItem`'s summary parse becomes `parseRunSummary(text: string | null): RunSummary | null` in `server/db/instance/run_generation.ts`, which returns null for a summary that is not JSON or fails `runSummarySchema`, so a deferred row reads as no summary. Writes are not validated: both writers build the summary from typed values. `listRunCatalog` and `listReadyPackages` both call it. `listReadyPackages` selects `summary` and maps it to `families` and `moduleCount: summary.moduleIds.length`, or `families: null, moduleCount: null` when the summary is null. _(amended at step 1)_
6. Families and module count are facts about the package's contents, not generation telemetry, so `ReadyPackage` carries them to approved users. SYSTEM_08's sentence on `listReadyPackages` says so. _(proposed)_
7. The labels are built as follows:
   - `packageFamiliesLabel(families: DatasetType[] | null)` joins `getModuleFamilyLabel` of each family with `+`. `null` and `[]` give `""`.
   - `packageContentsLabel({ families, moduleCount })` is the families label and `${moduleCount}m`, joined with one space. The `m` is untranslated, because it reads the same in en, fr and pt. `moduleCount` is `number | null`, and the count part is left out when it is null. When one part is empty, only the other is printed. When both are empty, the label is `""`.
   - `packageDisplayLabel({ label, families, moduleCount })` is the label and the contents label, joined with one space. When the contents label is `""`, it is the label alone.

   _(amended at step 1)_
8. The table has two new columns after Package, with no units in their cells, because the headers carry them:
   - **Data** ("Data" / "Données" / "Dados"), key `families`. It renders the families label. It is sortable on that label. Its `filterValue` is the family labels as tags.
   - **Modules** ("Modules" / "Modules" / "Módulos"), key `moduleCount`. It renders the count, or nothing when `summary` is null. It is sortable on the count and not searchable.

   A catalogue row reads `run.summary?.families ?? null` and `run.summary?.moduleIds.length ?? null`. _(amended at step 1)_
9. `readyPackageOptionLabel` returns `${packageDisplayLabel(pkg)} · ${date}${pinned}`. `packageLabel` and `packageScopeCaption` keep the bare label, because product cards, chips and stale badges already sit beside a scope and need to stay short. _(proposed)_
10. Nothing ships. _(proposed)_

## §4 Steps

### Step 1: Families on the summary and the ready list

- **Surface:**
  - new `lib/run_contents_label.ts`
  - [mod.ts](lib/mod.ts)
  - [run_manifest.ts](lib/types/run_manifest.ts)
  - [run_generation.ts](lib/types/run_generation.ts)
  - [launch.ts](server/worker_routines/generate_run/launch.ts)
  - [build_run_package.ts](server/runs/build_run_package.ts)
  - [run_generation.ts](server/db/instance/run_generation.ts)
  - [runs_summary.ts](server/db/migrations/data_transforms/runs_summary.ts)
  - new `server/tests/runs_summary_families_test.ts`
  - [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md), [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)
- **Deliverable:**
  - Rulings 1 to 6.
  - The `RunSummary` doc comment says what `families` holds and when it is null.
  - The transform's header comment lists block 2.
  - The test runs `migrateRunsSummaries` against a schema database from `withSchemaDb`. It covers three runs: one with a manifest whose datasets are `iceh` then `hmis`, one with no manifest, and one already stamped. It writes the manifest under `runDirPath(id)` and removes it afterwards. It asserts:
    - the first run gets `["hmis", "iceh"]`;
    - the second run gets `null`;
    - the third run is unchanged;
    - a second pass rewrites nothing.
  - SYSTEM_02's `runs_summary` sentence names block 2. SYSTEM_08 states `families` in its `RunSummary` paragraph and the new `ReadyPackage` fields. SYSTEM_08's manifest lists `lib/run_contents_label.ts` and the new test.
- **Not in this step:** any client change, and the three label functions.
- **Gates:** `deno task test:files server/tests/runs_summary_families_test.ts`.
- **Ends with:** one commit.

### Step 2: The label functions, the Data and Modules columns and the pickers

- **Surface:**
  - [run_contents_label.ts](lib/run_contents_label.ts)
  - [results_packages.tsx](client/src/components/results_packages/results_packages.tsx)
  - [package_label.ts](client/src/components/_shared/package_label.ts)
  - new `server/tests/run_contents_label_test.ts`
  - [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)
- **Deliverable:**
  - Rulings 7 to 9.
  - The test covers these cases:
    - `hmis`, `hfa` with 6 modules gives `HMIS+HFA 6m`;
    - `hfa` with 1 module gives `HFA 1m`;
    - families only, with a `null` count, gives `HFA`;
    - `null` families with 2 modules gives `2m`;
    - `null` families with a `null` count gives `""`;
    - the display label of `2026-11-14` with `hmis` and 6 modules is `2026-11-14 HMIS 6m`;
    - the display label of an empty contents label is the bare label.
  - SYSTEM_08 describes the label functions, the two columns and the picker label, and its manifest lists the new test.
- **Not in this step:** product captions (ruling 9), and the package page header.
- **Gates:** `deno task test:files server/tests/run_contents_label_test.ts`.
- **Ends with:** one commit. The close of this step runs `deno task test` and deletes this file.

## §5 Out of scope

- The `retired` member of `RunCatalogStatus`, which no code writes.
- Labels in copilot tool output (`format_products_list_for_ai.ts`).

## §6 Log

- Step 1: rulings 2, 3, 4, 5, 7 and 8 amended after an adversarial review, on Tim's instruction to decide. Generating and failed runs can hold a manifest, because publish renames the package dir into place before `publishReadyRun`, so block 2 reads the manifest for every row and uses status only for the unreadable case. A ready run whose package dir is absent, as after a pg-dump restore, is left unstamped instead of losing its families for good. `runSummarySchema` makes the read honest for such a row. `moduleCount` is `number | null` instead of a 0 sentinel. A production read-only scan (39 instances) found every summary carrying all keys of `runSummarySchema` with a known provenance, so the schema reads every stored row.
