# PLAN: Feedback during results-package generation

Status: agreed 2026-09-24, no code yet.

A generating package tells the viewer what the pipeline is doing at every
moment, not only while an R script runs. The stored progress gains a typed
**stage**; the pipeline pushes it at every stage boundary through the
channel it already has; the package page shows a striped, animated progress
bar with a stage sentence, pulses the chip of whichever module is current
(reused or running), and a failed package names the stage it failed in.
Panther's `ProgressBar` gains a `busy` prop for the stripe.

**Next step: Do 2.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N` for steps 1 to 3. The review of
step 3 deletes the file.

Repos: this app on `version2`, and the panther source repo
(`/Users/timroberton/projects/panther/timroberton-panther`, branch `main`).
The app `wb-fastr` (version 1) is never touched: its sync config is locked,
and every sync in this plan names `wb-fastr-v2` explicitly, never `--all`.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule, the step rules and the build
log are `panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_GENERATION_FEEDBACK.md."
- Branch: `version2` here (this repo's live plans bind `version2`, not the
  `tim-branch` PROTOCOL_APP_PLANS names); `main` in the panther repo.
- Floor here: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Step 2 touches migrations and also passes `./validate_migrations`.
- Floor in panther (step 1 only): `deno task typecheck`,
  `deno run -A clean.ts --dry-run`, `deno task test`, per panther's
  `CLAUDE.md`.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_08_results_packages.md` (steps 2 and 3), §2 and §3 of this plan,
  the step's own section in §4, and §8. Step 1 also reads panther's
  `CLAUDE.md` and `panther/protocols/PROTOCOL_UI_STYLING.md`.
- Panther is edited only in its source repo and reaches this app through
  `./sync wb-fastr-v2` run from that repo, which refuses a dirty target and
  auto-commits the sync here. Nothing under `panther/` in this repo is ever
  edited by hand.

## 1. The problem

The pipeline's first progress push is
[pipeline.ts:93](server/worker_routines/generate_run/pipeline.ts#L93), after
prepare, resolve and reuse planning have all finished. Until then the page
shows the launch-time payload from
[launch.ts:134-141](server/worker_routines/generate_run/launch.ts#L134-L141):
every chip "pending" in neutral grey, no "Running" row (`currentModuleId` is
null, [status_bar.tsx:105](client/src/components/results_packages/package_view/status_bar.tsx#L105)),
and the body line at
[package_page.tsx:326](client/src/components/results_packages/package_page.tsx#L326).
Everything that scales with dataset size runs inside that silence:

- Prepare ([prepare_inputs.ts](server/worker_routines/generate_run/prepare_inputs.ts)):
  a Postgres `COPY` of the full dataset per family, a DuckDB CSV to parquet
  conversion per family, a streamed sha256 of each extract (multi-GB at
  Nigeria scale, per the file's own comment), and the population expansion.
- Resolve ([resolve_modules.ts](server/worker_routines/generate_run/resolve_modules.ts)):
  a definition fetch per module at the pinned git ref, and script generation.
- Plan reuse ([resolve_reuse.ts](server/worker_routines/generate_run/resolve_reuse.ts)):
  manifest reads across every ready run and asset hashing.

The end is silent too. [pipeline.ts:147](server/worker_routines/generate_run/pipeline.ts#L147)
clears `currentModuleId` but never pushes it, so during finalize
(`buildRunPackageIntoTmp`: a DuckDB parquet build and metadata read per
results object, asset copies, the indicator catalog, the manifest, a full
directory size walk) the last push on the wire still says "last module,
done, current": a green chip beside a "Running" row frozen on "Finished R
script".

A reused module's green chip is pushed before its copy starts
([pipeline.ts:114-116](server/worker_routines/generate_run/pipeline.ts#L114-L116)),
and the chip pulse at
[status.tsx:116](client/src/components/results_packages/package_view/status.tsx#L116)
keys on `status === "running"`, so a multi-GB copy shows no activity.

All three capture functions take an `onProgress` callback
([hmis.ts:113](server/runs/capture_inputs/hmis.ts#L113),
[hfa.ts:66](server/runs/capture_inputs/hfa.ts#L66),
[iceh.ts:30](server/runs/capture_inputs/iceh.ts#L30)) that the pipeline, their
only caller, never passes. It is dead, and its messages are English literals.

Locally the whole prepare stage takes under a second because the example
data is tiny, which is why none of this shows in development.

## 2. The model

Vocabulary, used throughout:

- **Stage**: what the pipeline is doing right now, one value of `RunStage`,
  stored on `runs.progress` and pushed with every other progress change.
- **Step**: a unit of the fraction. Prepare is one step, resolve plus plan
  is one, each module is one, finalize is one. Total steps =
  `moduleOrder.length + 3`.
- **Fraction**: completed steps over total steps, derived on the client from
  the stage alone, never stored.
- **Busy**: the striped, animated fill on a determinate bar. The width says
  how far; the stripe says it has not stalled.

### The stage

```ts
// lib/types/datasets.ts
export const datasetTypeSchema = z.enum(["hmis", "hfa", "iceh"]);
export type DatasetType = z.infer<typeof datasetTypeSchema>;

// lib/types/run_generation.ts
export const runStageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("queued") }),
  z.object({ kind: z.literal("exporting"), family: datasetTypeSchema }),
  z.object({ kind: z.literal("converting"), family: datasetTypeSchema }),
  z.object({ kind: z.literal("resolving") }),
  z.object({ kind: z.literal("planning") }),
  z.object({ kind: z.literal("module"), moduleId: z.string() }),
  z.object({ kind: z.literal("finalizing"), moduleId: z.string().nullable() }),
  z.object({ kind: z.literal("publishing") }),
  z.object({ kind: z.literal("ended") }),
]);
export type RunStage = z.infer<typeof runStageSchema>;

export const runProgressSchema = z.object({
  moduleOrder: z.array(z.string()),
  moduleStatus: z.record(z.string(), runModuleProgressStatusSchema),
  currentModuleId: z.string().nullable(),
  stage: runStageSchema,
  errorDetail: z.string().nullable(),
});
```

`stage` is required. Nothing English rides the wire: the client translates
every stage from its kind and payload.

### Where the pipeline sets it

`pushProgress` in `pipeline.ts` is unchanged: one `updateRunProgress` and one
`notifyInstanceRunProgress` per call. The stage changes at these points, each
followed by a push:

| Where                                          | Stage                                   |
| ---------------------------------------------- | --------------------------------------- |
| `launch.ts`, the minted row and its first push | `queued`                                |
| `prepareRunInputs`, before each family capture | `exporting {family}`                    |
| `prepareRunInputs`, before each parquet write  | `converting {family}`                   |
| `pipeline.ts`, before `resolveRunModules`      | `resolving`                             |
| `pipeline.ts`, before `createReuseSearch`      | `planning`                              |
| `pipeline.ts`, top of each module iteration    | `module {moduleId}`                     |
| `pipeline.ts`, after the loop                  | `finalizing null`, with `currentModuleId` set to null in the same push |
| `buildRunPackageIntoTmp`, before each module's results objects | `finalizing {moduleId}` |
| `pipeline.ts`, before the rename               | `publishing`                            |
| `publishReadyRun`'s final progress             | `ended`                                 |

`prepareRunInputs` and `buildRunPackageIntoTmp` each take an
`onStage: (stage: RunStage) => Promise<void>` parameter; the pipeline passes
a closure that sets `progress.stage` and pushes. The pipeline is the only
caller of both. A push happens per stage boundary, never per R line and
never per results object. For a twelve-module run that is about 30 row
updates over the whole generation.

`markRunGenerationFailed` re-reads the stored progress and leaves `stage`
as it found it, so a failed run keeps the stage it failed in. Its fallback
shape for an unparsable blob gets `stage: { kind: "ended" }`.

### The fraction and the sentence

`lib/run_progress.ts`, pure, tested by `deno task test`:

```ts
export function runProgressSteps(progress: RunProgress): {
  done: number;
  total: number;
};
export function runStageLabel(progress: RunProgress): string; // t3 inside
```

`total` is `moduleOrder.length + 3`. `done` is set by the stage alone, so it
is monotonic whatever the reuse plan pre-marks:

| Stage kind                            | done                                        |
| ------------------------------------- | ------------------------------------------- |
| `queued`, `exporting`, `converting`   | 0                                           |
| `resolving`, `planning`               | 1                                           |
| `module`                              | 2 + index of `moduleId` in `moduleOrder`    |
| `finalizing`, `publishing`            | 2 + `moduleOrder.length`                    |
| `ended`                               | total                                       |

The sentences, English (French and Portuguese are authored in the step per
`PROTOCOL_ALL_TRANSLATION.md`; family and module names come from
`getModuleFamilyLabel` and the registry label):

| Stage         | Sentence                                       |
| ------------- | ---------------------------------------------- |
| `queued`      | Starting                                       |
| `exporting`   | Exporting {family} data                        |
| `converting`  | Converting {family} data to parquet            |
| `resolving`   | Resolving module definitions                   |
| `planning`    | Checking earlier packages for reusable outputs |
| `module`      | Running {module}, or Reusing outputs for {module} when its status is `reused` |
| `finalizing`  | Building the package, or Building parquet for {module} |
| `publishing`  | Publishing                                     |
| `ended`       | Complete                                       |

### The page

The status bar, for a generating package only, opens with a full-width
panther `ProgressBar small busy`, `progressFrom0To100` from
`runProgressSteps` and `progressMsg` from `runStageLabel`. The existing
"Running" row keeps the R line and shows only in a `module` stage.
`ModuleProgressChip` pulses when its module is `currentModuleId`, whatever
its status. The failed body's error detail is prefixed with the stage
sentence, so a run that died in prepare reads "Exporting HMIS data" above
its error.

Progress reaches the page exactly as it does today: the page-local
`run_progress` listener in `results_packages.tsx` for the live value, the
catalogue row for the stored one, `liveProgress() ?? run.progress`. No new
state tier, no new fetch, no new SSE message type, no change to the notify
catalog in `SYSTEM_03`, and the ruling that per-module pushes never signal
the catalogue stands.

### Existing rows

`toRunListingItem` parses `runs.progress` with `safeParse` and degrades a
failure to null, so a required `stage` would strip the chips from every
package generated before this plan. A data transform,
`server/db/migrations/data_transforms/runs_progress.ts`, registered in
`INSTANCE_DATA_TRANSFORMS` right after `runs_summary`, rewrites every row
whose progress is non-null and lacks the `"stage"` key to carry
`stage: { kind: "ended" }`. Its skip gate is that raw key scan (the
Skip-Gate Gotcha in `PROTOCOL_APP_MIGRATIONS.md`); a row it cannot parse or
validate is skipped, not fatal (ruling 13). A run still generating at
migration time is marked failed by boot recovery moments later and keeps
`ended`, which is what a run with no recorded stage can honestly say.

### The panther change

`ProgressBar` gains `busy?: boolean`. When true, the fill (not the track)
carries the `ui-progress-busy` utility; when false or omitted the component
renders byte-for-byte as today. The utility lives in `_fixed.css` with the
other public utilities, built from the primary tokens so it needs no new
colour token and holds on both schemes, and it honours reduced motion:

```css
@utility ui-progress-busy {
  background-image: repeating-linear-gradient(
    -45deg,
    color-mix(in oklch, var(--color-primary-content) 20%, transparent) 0 0.75rem,
    transparent 0.75rem 1.5rem
  );
  background-size: 2.12rem 100%;
  animation: uiProgressBusy 0.8s linear infinite;
}
@keyframes uiProgressBusy {
  to { background-position: 2.12rem 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-progress-busy { animation: none; }
}
```

CSS, not JSX: a moving stripe needs a `@keyframes`, which Tailwind's
built-in animations do not provide, and `PROTOCOL_UI_STYLING.md` rule 2
forbids the arbitrary gradient class that a JSX-only version would need.
The `data-[busy=true]:` variant on the fill selects it, in the style of the
component's existing `data-[small=true]:h-6`.

## 3. Rulings

1. The stage is a typed field on `RunProgress`, a discriminated union with
   no free text. No new SSE message type, no change to `r_script`, no new
   notify wrapper.
2. The fraction is equal-weighted steps as §2 tables it, derived on the
   client, never stored. No timing-based weights: there is no data to
   justify any.
3. Existing rows are brought forward by the `runs_progress` transform; the
   schema requires `stage` with no `.catch` and no `.optional`.
4. The bar is panther's `ProgressBar` with `small` and `busy`, full width at
   the top of the status bar while generating. It is not placed in the body
   and not in a labelled row.
5. The chip pulses on `currentModuleId`, not on `status === "running"`.
6. The failed body prefixes the error detail with the stage sentence.
7. The dead `onProgress` parameter is deleted from all three capture
   functions in step 2.
8. `busy` is additive in panther: no existing caller's render changes.
   The stripe is a CSS utility, not JSX arbitrary classes. Reduced motion
   disables the animation.
9. Panther reaches this app only by `./sync wb-fastr-v2` from the panther
   repo. `--all` is never used. The app `wb-fastr` (version 1) is never
   synced or edited.
10. Stage pushes are per boundary as §2 tables them; never per R line and
    never per results object.
11. `lib/run_progress.ts` is claimed by `SYSTEM_08_results_packages.md`'s
    manifest in the same commit that creates it.
12. `DatasetType` becomes `z.infer` of a new `datasetTypeSchema` in
    `lib/types/datasets.ts`, the same three literals, so the type is
    unchanged for its 35 importers. `moduleFamily` and the inline enum in
    `dataSourceDataset` (`lib/types/_module_definition_installed.ts`) become
    references to it. The GitHub schema's own copy
    (`_module_definition_github.ts`) stays independent: it is the external
    boundary and is kept separate by design (PROTOCOL_APP_MIGRATIONS,
    "GitHub-Authored Schemas"). Verified 2026-09-24: `datasets.ts` imports
    nothing, so no cycle.
13. The `runs_progress` transform is as tolerant as the read path. A row
    whose progress JSON does not parse, or does not validate against
    `runProgressSchema` once `stage` is added, is logged and skipped, never
    thrown: `toRunListingItem` already degrades such a row to null chips so
    an admin can still see and delete it, and a boot must not fail over it.
    The `runs_summary` transform is the precedent.

## 4. Steps

### Step 1: `busy` on panther's `ProgressBar`, synced

**Surface.** In the panther repo:
`modules/_303_components/form_inputs/progress_bar.tsx`,
`modules/_303_components/_fixed.css`. In this repo: only the files
`./sync wb-fastr-v2` writes under `panther/`.

**Deliverable.** Ruling 8: the `busy` prop, the `ui-progress-busy` utility
with its keyframes and reduced-motion rule, the fill selecting it through
`data-busy`. The panther floor green. `./sync wb-fastr-v2` run from a clean
tree in both repos; the sync commit here contains nothing but the synced
files, and `deno task typecheck` is green after it.

**Not in this step.** Any file of this app outside `panther/`. Any other
panther component. Folding the app's `ui-running` utility into panther.

**Gates.** Panther: `deno task typecheck`, `deno run -A clean.ts --dry-run`,
`deno task test`. Here: `deno task typecheck`.

**Ends with.** One commit in the panther repo (the prop and utility), then
the sync's auto-commit here.

### Step 2: the stage, the pushes, the transform, the helpers

**Surface.** `lib/types/datasets.ts`,
`lib/types/_module_definition_installed.ts`, `lib/types/run_generation.ts`,
`lib/run_progress.ts` (new), `lib/mod.ts` (export),
`server/worker_routines/generate_run/launch.ts`,
`server/worker_routines/generate_run/pipeline.ts`,
`server/worker_routines/generate_run/prepare_inputs.ts`,
`server/runs/build_run_package.ts`,
`server/runs/capture_inputs/hmis.ts`, `hfa.ts`, `iceh.ts`,
`server/db/instance/run_generation.ts`,
`server/db/migrations/data_transforms/runs_progress.ts` (new),
`server/db_startup.ts`, `server/tests/run_progress_test.ts` (new),
`SYSTEM_08_results_packages.md`, `PROTOCOL_APP_MIGRATIONS.md`.

**Deliverable.** Rulings 1, 2, 3, 7, 10, 11, 12, 13. The schema of §2; every
`RunProgress` literal in the surface carries `stage` (`launch.ts`,
`pipeline.ts`, the fallback in `markRunGenerationFailed`); the pushes at
exactly the boundaries §2 tables, with `onStage` on `prepareRunInputs` and
`buildRunPackageIntoTmp`; the `onProgress` parameter gone from the three
captures; `runs_progress.ts` registered after `runs_summary`;
`lib/run_progress.ts` with `runProgressSteps` and `runStageLabel` and a
test that pins the `done`/`total` table of §2 for every stage kind,
including a `module` stage whose reuse plan pre-marked later modules
`reused`. `SYSTEM_08` rewritten where it describes the progress shape, the
generation stages and their pushes, and the manifest gains
`lib/run_progress.ts`. `PROTOCOL_APP_MIGRATIONS.md`'s directory listing and
transform order name `runs_progress`.

**Not in this step.** Any client file. The status bar, the chip, the failed
body.

**Gates.** The floor, `./validate_migrations`, and
`deno test -A --env-file server/tests/run_progress_test.ts` passing on its
own.

**Ends with.** Two commits, each green: the schema, transform and helper
with its test; then the pipeline pushes and the capture cleanup.

### Step 3: the page

**Surface.** `client/src/components/results_packages/package_view/status_bar.tsx`,
`client/src/components/results_packages/package_view/status.tsx`,
`client/src/components/results_packages/package_view/failed_detail.tsx`,
`SYSTEM_08_results_packages.md`.

**Deliverable.** Rulings 4, 5, 6. The bar as §2 describes, reading
`p.progress` in a memo before any branch, rendered under `<Show>` on the
generating status; the "Running" row shown only in a `module` stage;
`ModuleProgressChip` taking the active module from its caller and pulsing on
it; the failed body's prefix. Props stay `p`, no destructuring, control flow
through `Show`/`Switch`. `SYSTEM_08`'s status-bar prose rewritten to match.

**Not in this step.** A step list in the generating body. Any change to the
listeners in `results_packages.tsx` or to `package_page.tsx`.

**Gates.** The floor and `./validate_protocols` with no new baseline entry.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                        | First reached |
| ------------------------------------------- | ------------- |
| Panther floor (typecheck, clean, test)      | Step 1        |
| `deno task typecheck`                       | Step 1        |
| `deno task test`, `./validate_protocols`, `./run` | Step 2  |
| `./validate_migrations`                     | Step 2        |
| `server/tests/run_progress_test.ts`         | Step 2        |
| `./validate_protocols` with no new baseline entry | Step 3  |

## 6. Out of scope

- A step list or log view in the generating body.
- Timing-based step weights or an estimated time remaining.
- An indeterminate (fraction-less) bar mode in panther.
- Folding the app's `ui-running` stripe into panther.
- Any change to the `r_script` message, the catalogue nonce ruling, the SSE
  filter, or the notify catalog.
- Progress for import runs (HMIS, HFA, ICEH), which have their own rigs.
- The app `wb-fastr` (version 1) and every other panther consumer.

## 7. Rollout and rollback

Nothing ships before the review of step 3 passes. Tim then deploys; the
`runs_progress` transform runs at first boot and is idempotent. Rollback is
reverting the app commits: the previous schema strips the unknown `stage`
key on read, so rows the transform rewrote stay readable. The panther change
is additive and needs no rollback for the app to revert.

## 8. Build log

Append-only. One row per decision, deviation, correction or defect, plus one
closing row per session.

| When | Step | Row |
| --- | --- | --- |
| 2026-09-24 | 1 | Deviation from §2's CSS: the reduced-motion rule is nested inside the `@utility` (`@media (prefers-reduced-motion: reduce) { animation: none; }`), not a bare `.ui-progress-busy { animation: none; }` beside it. The fill selects the utility through the `data-[busy=true]:` variant, so Tailwind emits `.data-\[busy\=true\]\:ui-progress-busy[data-busy="true"]` and never a bare `.ui-progress-busy`; the plan's rule would have matched nothing. Proven by compiling the synced `_fixed.css` with the client's Tailwind (`tailwindcss/dist/lib.mjs`, candidates `data-[busy=true]:ui-progress-busy`): the variant rule carries the gradient, the animation and the nested reduced-motion `animation: none`, and `@keyframes ui-progress-busy` is emitted at top level. |
| 2026-09-24 | 1 | Choice the plan did not cover: the keyframes are named `ui-progress-busy`, after panther's existing `ui-blink`, not §2's `uiProgressBusy`. Same name as the utility, one vocabulary. |
| 2026-09-24 | 1 | The sync refused once: the app tree was dirty for a few seconds while a parallel session committed `4b75892c` (a results-package table change, outside this plan). The tree was clean at session start and clean again on the retry. Panther commit `ffe91cd`; sync commit here `e4b63705`, holding `_fixed.css`, `progress_bar.tsx` and the manifest only. |
| 2026-09-24 | 1 | Gates green. Panther at `ffe91cd`: `deno task typecheck`, `deno run -A clean.ts --dry-run`, `deno task test` (501 passed), and `deno lint modules/` through the sync gate. Here at `e4b63705`: `deno task typecheck`. `ProgressBar` has no other caller in panther, and this app's eight callers pass no `busy`, so no existing render changes. |
| 2026-09-24 | 1 | Step 1 built. |
| 2026-09-24 | 1 | Reviewer's reading. Surface: panther `ffe91cd` touches only `progress_bar.tsx` and `_fixed.css`; `e4b63705` holds only what the sync writes (those two files and `.panther-manifest.json`); `6ad1b183` edits only the Next step line and §8. Every tracked file under `panther/` matches panther `ffe91cd` apart from the sync's copyright header (780 files compared; the three that differ, two vendored files and `mod.deno.ts`, are untouched since the previous sync), and `panther/` is unchanged between `e4b63705` and HEAD, so nothing was hand-edited. Deliverable read in the code: `busy?: boolean`; `data-busy={p.busy}` and `data-[busy=true]:ui-progress-busy` on the fill, not the track; the utility in the public-utilities section of `_fixed.css`, built from `--color-primary-content`, with its keyframes and the nested reduced-motion rule. Both logged deviations are justified: compiling the synced `_fixed.css` with the client's Tailwind 4.1.17 emits `.data-\[busy\=true\]\:ui-progress-busy[data-busy="true"]` carrying the gradient, the animation and the nested `animation: none`, plus a top-level `@keyframes ui-progress-busy`, and never a bare `.ui-progress-busy`; the keyframes name follows `ui-blink` in the same file. A caller omitting `busy` renders no `data-busy` attribute (Solid 1.9 `setAttribute` removes the attribute for `undefined`); the fill's class attribute gains the variant token, which matches nothing without `data-busy="true"`, so no existing render changes. The eight app callers pass no `busy`. No other panther component changed; `ui-running` stays in `app.css`. No DOC or PROTOCOL file names `ProgressBar`'s props, so no prose drifts. The range since `c1c09ba8` (the last commit to set `Do 1`) also holds `a302aaef`, `8e450606` and `bf53a6fc`, the parallel text-size workstream, beside the logged `4b75892c`: none is step 1's. No em-dash in any commit of the step. |
| 2026-09-24 | 1 | Gates green, run by the reviewer. Panther at `ffe91cd`, clean tree: `deno task typecheck` exit 0, `deno run -A clean.ts --dry-run` exit 0, `deno task test` 501 passed. Here at `6ad1b183`: `deno task typecheck` (server, client, `lint:systems`, `lint:structure`, `lint:text-sizes` all OK), `deno task test` 460 passed, 0 failed, 3 ignored, `./validate_protocols` passed with 0 tier-1 violations and 0 new tier-2 flags. Its note about one stale baseline entry names `client/src/components/instance/email_opt_in_modal.tsx`, last touched 2026-09-23 before this plan existed, and the validator scans only `client/src`, so it is outside the step: reported, not fixed. `./run` skipped: it replaces machine-global containers, and step 1 changed nothing it exercises. |
| 2026-09-24 | 1 | Step 1 reviewed: pass. |
