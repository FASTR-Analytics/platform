# PLAN: run input transforms, the input mirrors move to the transformed-forward side

Status: OPEN. Rulings agreed (Tim, 2026-09-15). Not started.

**Next step: Do 1.**

Branch: `tim-branch`. Repos: this app only.

What this plan does. A results package's `manifest.json` is transformed
forward at boot by numbered, version-gated blocks. Its input mirrors are
not: they sit on the immutable side of the package, so a stored value whose
vocabulary the app renames (today `type: "derived"` in
`inputs/indicators.json`, now `"calculated"`) fails the strict row schema
at boot and stops the server. This plan adds an input transform stage to
the same mechanism, behind the same version gate, with the same rules, so
a vocabulary change in a stored input is a numbered block and a version
bump that the deploy carries to every instance. The first block carries
the `derived` rename. The docs move so a future agent finds the mechanism
and its rules where the manifest's already are.

Read first: [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)
"Four invariants" and "The indicators mirror has two writer formats",
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) § "Run Manifest
Transforms", `server/runs/manifest_transform.ts` (whole file),
`server/runs/indicator_catalog.ts` (`runDirInputRowsReader`,
`RunInputReadError`, `RunInputRowSchemaError`, `buildRunHmisIndicators`).

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
The app bindings (branch, shared tree, floor, conditional gates, docs move
with the code, reading order) are
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan binds them as
follows.

- Instruction: "Do the next step of PLAN_RUN_INPUT_TRANSFORMS.md."
- Branch: `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches migrations, the base schema, the query engine
  or help text, so no conditional gate applies.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, SYSTEM_08, §2 and §3
  of this plan, the step's own section in §4, and §8.
- Peculiar to this plan: step 1 lands the mechanism, the first block and
  the SYSTEM_08 prose for the contract it changes, as the binding
  requires. Step 2 lands the protocol recipe, which is instruction for
  future agents rather than a description of a contract, and is reviewed
  against the code step 1 landed. Nothing ships between them (§7).

## 1. The problem

Every production instance runs v1.72.1, whose package writer stamps each
row of `inputs/indicators.json` with `type: "base"` or `type: "derived"`.
Eleven packages carry a `derived` row (uganda 6, demo 3, mozambique 1,
nigeria-v2-testing 1, and one in the dormant nigeria-ai directory).
Verified read-only on the host on 2026-09-15.

Commit `b9c6d518` renamed the formula indicator type to `calculated`
everywhere, including `PACKAGE_INDICATOR_TYPES`
(`lib/types/indicators.ts:235`), which is the enum the v2 mirror row
schema `indicatorRowV2` reads with (`server/runs/indicator_catalog.ts:141`).
At boot, `transformRunManifestFile` (`server/runs/manifest_transform.ts`)
finds those packages' manifests fail the strict parse (their catalog also
says `derived`), forces the transform, and blocks 1 and 4 read the mirror
through `runDirInputRowsReader`. A `derived` row fails the row schema,
which raises `RunInputRowSchemaError`, which nothing catches by design
(PROTOCOL_APP_MIGRATIONS failure table, last row): boot fails on those
four instances.

The mechanism to fix a stored file forward already exists for the
manifest and is the right one: numbered blocks, version-gated, idempotent,
atomic write, retained pre-transform copy, run at boot and again on the
read path for packages that arrive later. It stops at the mirror because
the doctrine puts input mirrors on the immutable side ("Blocks may READ
anything under `runDir` and must never write to it",
`manifest_transform.ts:82`), and because no block runs before the first
read.

Release 1.73.0 already exists: `VERSION` says so, commit `3543da7c` is
its deploy commit, its image is on Docker Hub, and it contains
`b9c6d518` and no transform. Rolling it to demo, mozambique,
nigeria-v2-testing or uganda fails boot. It is never rolled to any
instance (§7).

The alternatives were rejected. A legacy value accepted by the reader
(`PackageIndicatorType = HmisIndicatorType | "base" | "derived"`) is paid
for years for a few packages, against the no-cruft rule. A hand edit of
the eleven files on the host before the deploy fixes nothing for the next
rename and has a timing window against the running version.

## 2. The model

A results package has three kinds of file.

- **Outputs**: module scripts, logs, raw CSVs, the query parquet, the
  facilities parquet, assets. Immutable. Never rewritten by anything.
- **The manifest**: a descriptor recomputed from the package's own files
  and the app's code. Transformed forward in place. Already so.
- **Input mirrors**: `inputs/*.json`, the dictionary and configuration a
  generation captured. Their rows are provenance, but their vocabulary is
  the app's: a stored enum value or key name is a fact of the code that
  wrote it, not of the generation. **This plan moves the vocabulary of an
  input mirror to the transformed-forward side.** A row's facts are never
  invented or dropped; the names those facts are stored under follow the
  app.

**Input transform blocks** live in `server/runs/input_transform.ts`,
numbered from 1 in their own sequence, appended and never reordered. The
stage runs at the top of `transformRunManifest`, before manifest block 1,
so every manifest block reads a mirror that is already current. The stage
runs only on a forced pass, so it sits behind the one version gate the
manifest already has: `RUN_MANIFEST_SCHEMA_VERSION`. An input block names
the manifest version that first carries it, and that version's manifest
block is the stamp. There is no second version integer.

An input block is a pure function of the package's files and the app's
code, as a manifest block is. It may rename a value or a key, or recompute
a field from files already in the package. It may not add a fact those
files do not hold, remove a row, or read the database or live instance
state. It checks its own precondition and is idempotent. It does not validate rows: the strict row schema in
`indicator_catalog.ts` stays where it is and runs after the stage, so a
mirror the stage could not bring current still fail-stops boot as drift.

Writing an input file follows the manifest's rule exactly: transform in
memory, parse, then persist. The stage returns the rewritten mirrors as
pending writes; the manifest blocks read the rewritten rows from memory;
nothing touches disk until `runManifestSchema.parse` has passed. Then the
mirrors are persisted first and the manifest second, so a crash between
the two leaves a current mirror beside an old manifest, which the next
forced pass repairs (the stage finds nothing to rename and the blocks
complete). The reverse order would stamp the new version over a mirror
still in the old vocabulary, and no later pass revisits a current
manifest. Each file is serialized byte-identically to its writer
(`JSON.stringify(rows)` for a mirror, as `writeInputJson` in
`prepare_inputs.ts` does), skipped when the bytes are unchanged, retained
as `inputs/<name>.v{n}.json` where `n` is the stored manifest version (the
same label `persistRunManifest` uses), written to a unique temp name and
renamed over the original, with the temp file cleaned in a `finally`.
Retained copies are never in `inputFiles`, so no reader opens them; they
are what makes an image rollback recoverable.

The stage and the readers share code rather than restate it: one function
reads a listed mirror's bytes and parses them as JSON, raising
`RunInputReadError` (today the first half of `runDirInputRowsReader`);
one function persists a package file with the retain, temp, rename and
`finally` discipline (today `persistRunManifest`). Both persist paths and
both read paths go through those two.

A mirror rewrite is visible. The `ok` outcome of `transformRunManifestFile`
names the mirrors it rewrote, and the boot sweep line counts them beside
the manifests it transformed, so an instance whose packages needed the
stage can be told from one that only took the stamp.

Failure policy is unchanged. Bytes unavailable or not JSON:
`RunInputReadError`, the `unreadable` outcome, package degrades, boot
proceeds. A block that throws for any other reason is a code defect and
fails boot, as a manifest block does.

Vocabulary used below: **stage** is the input transform run as a whole;
**input block** is one numbered function in it; **forced pass** is a
transform run because the stored manifest version is below current or the
manifest fails its schema; **mirror** is one `inputs/*.json` file.

## 3. Rulings

1. **One version gate.** Input blocks run behind `RUN_MANIFEST_SCHEMA_VERSION`
   and nothing else. An input vocabulary change bumps the manifest version
   even when the manifest's own shape is unchanged, and a manifest block
   with only a stamp carries it (block 7 is the precedent).
2. **Input blocks run first.** The stage runs before manifest block 1 on
   every forced pass. A manifest block never reads a mirror the stage has
   not seen.
3. **Rename or recompute, never invent.** An input block renames values
   and keys, or recomputes a field from files already in the package and
   the app's code, as a manifest block does. It never adds a fact those
   files do not hold, fills a null, drops a row, or reads the database or
   live instance state. The manifest's recompute-never-invent rule applies
   to it word for word.
4. **Same write discipline as the manifest.** No-op guard on bytes,
   retained `inputs/<name>.v{n}.json`, unique temp name, rename, `finally`.
   `runs.summary` and `diskSizeBytes` are not touched.
5. **The strict readers stay strict.** `indicatorRowV2` and
   `PACKAGE_INDICATOR_TYPES` accept the current vocabulary and `base` only.
   No legacy value is added to any reader.
6. **Input block 1**: in `inputs/indicators.json`, every row whose `type`
   is `"derived"` becomes `"calculated"`. Precondition: the file is listed
   in `inputFiles` and at least one row carries the old value. Carried by
   manifest version 10, stamped by manifest block 8, which does nothing
   else. Manifest blocks 1 and 4 recompute the catalog and `hmisIndicators`
   from the rewritten mirror on the same pass, so a package's manifest
   catalog also stops saying `derived` without a block of its own.
7. **`base` stays as it is.** A `base` row is a count whose real type
   (`uploaded`, `dhis2_element`, `sum`) is knowable only from the live
   dictionary, which ruling 3 forbids a block to read. It remains an
   accepted value the display projection strips (SYSTEM_08, PLAN_A5
   ruling 10). Whether to resolve it some other way is a separate
   decision (§6).
8. **The PO caches bump with the version**, per the existing checklist:
   `PO_CACHE_VERSION` and the `_PO_DETAIL_CACHE` key prefix in
   `server/routes/caches/visualizations.ts` (precedent `9d7200e8`).
9. **Fourth persistence layer audited: none.** The mirror row's `type`
   reaches no stored `FigureBundle`; the display projection strips it and
   `hmisIndicators` never carried it. No figure-block transform.
10. **The test is a committed file** that exercises the public entry point
    `transformRunManifestFile` over a scratch package directory, not the
    stage in isolation, so the gate and the ordering in rulings 1 and 2 are
    what it proves. _(proposed)_
11. **Parse before any write, mirrors before the manifest.** The stage
    returns pending writes; nothing is persisted until the manifest parses;
    then the mirrors, then the manifest (§2 gives the reason for the
    order). "Transform in memory, parse, then persist" holds for both
    files.
12. **Shared helpers, not restated ones.** One read-and-parse function for
    a listed mirror, used by `runDirInputRowsReader` and the stage; one
    persist function for a package file, used for the manifest and for a
    mirror. Neither path keeps its own copy of the other's half.
13. **A rewrite is reported.** The `ok` outcome carries the names of the
    mirrors rewritten, and the sweep line in `db_startup.ts` counts them.
    Step 1's `./run` gate and §7 read that count.

## 4. Steps

### Step 1: the stage, input block 1, version 10, the test, the SYSTEM prose

**Surface.**

- `server/runs/input_transform.ts` (new; claimed by SYSTEM_08's
  `server/runs/**`, no manifest edit)
- `server/runs/manifest_transform.ts`
- `server/runs/indicator_catalog.ts` (the shared read helper of ruling
  12, and the comment at line 137 that says a mirror is never rewritten)
- `server/db_startup.ts` (the sweep line, ruling 13)
- `lib/types/run_manifest.ts`
- `lib/types/indicators.ts` (the comment at line 231 only)
- `server/routes/caches/visualizations.ts`
- `server/tests/run_input_transform_test.ts` (new)
- `SYSTEM_08_results_packages.md`

**Deliverable.**

- `input_transform.ts` exports one function, `transformRunInputs(runDir,
  inputFiles)`, which runs every input block in order over the mirrors
  the package lists and returns, per rewritten mirror, its name, the
  rewritten rows and the pending write; it persists nothing (ruling 11).
  Its header names the pattern's authority (PROTOCOL_APP_MIGRATIONS
  § "Run Input Transforms", written in step 2, so the header says
  "see PROTOCOL_APP_MIGRATIONS.md" and the step 2 review confirms the
  section exists) and lists `INPUT TRANSFORM BLOCKS:` the way
  `manifest_transform.ts` lists its own. Block 1 as ruling 6. It reads a
  mirror through the shared read helper (ruling 12), so unavailable bytes
  or invalid JSON raise `RunInputReadError` from one place, and anything
  else throws.
- `indicator_catalog.ts`: the first half of `runDirInputRowsReader` (read,
  parse, `RunInputReadError`) becomes the exported helper the stage also
  uses; the reader keeps the row-schema half. The rows reader used by the
  manifest blocks on a forced pass serves a rewritten mirror from the
  stage's rows, not from disk, through an optional overlay argument on
  `runDirInputRowsReader` that only the transform passes; the finalize
  writer's call at `build_run_package.ts:243` is unchanged, and that file
  is not in the surface. The comment at line 137, "a mirror is never
  rewritten", becomes: a mirror's rows are never rewritten; its vocabulary
  is brought current by the input stage before any block reads it.
- `manifest_transform.ts`: the stage is called at the top of
  `transformRunManifest`, before block 1, with the manifest's
  `inputFiles`. `persistRunManifest` becomes the shared persist helper of
  ruling 12 (retain as `<name>.v{n}`, unique temp, rename, `finally`) and
  `transformRunManifestFile` calls it for each pending mirror write and
  then for the manifest. Pending mirror writes land whenever the parse
  passes, independent of whether the manifest bytes changed: the no-op
  guard at line 285 gates the manifest write alone, never the mirrors,
  and `transformed` reports the manifest alone while `rewrittenInputs`
  reports the mirrors. (Today a forced pass always changes the stamp, so
  the guard cannot fire after a rewrite; the rule is stated so a later
  change cannot leave a rewritten mirror unwritten and the stage repeating
  on every boot.)
  Manifest block 8 stamps 10 and says why it is only a stamp. The header
  comment's rule "Blocks may READ anything under `runDir` and must never
  write to it" is rewritten to: manifest blocks never write to the
  package; the input stage is the one writer of a mirror, runs before
  them, and its writes land only after the manifest parses. The
  `TRANSFORM BLOCKS:` list gains block 8 and a pointer line to the input
  blocks list. The `ok` outcome gains `rewrittenInputs: string[]`
  (ruling 13).
- `db_startup.ts`: the sweep counts rewritten mirrors across packages and
  the sweep line reports them beside the manifest counts.
- `lib/types/indicators.ts`: the comment at line 231 says packages
  written before PLAN_A5 "are never rewritten"; it becomes: their `base`
  rows are never resolved (ruling 10 of that plan), though a mirror's
  vocabulary is otherwise brought current by the input stage.
- `lib/types/run_manifest.ts`: `RUN_MANIFEST_SCHEMA_VERSION = 10`, and the
  header's version history gains "10: the indicators mirror's `derived`
  rows read `calculated` (input block 1); the manifest's own shape is
  unchanged".
- `visualizations.ts`: ruling 8.
- The test, per ruling 10: a scratch package with a v9 manifest whose
  `inputFiles` lists `inputs/indicators.json`, and a mirror in the exact
  production row shape (`indicator_common_id`, `indicator_common_label`,
  `format_as`, `thresholds`, `sort_order`, `type`, `expression`,
  `slot_map`) holding `base` rows and one `derived` row with an expression
  and slot map. Asserts: the outcome is `ok` and `transformed`; the mirror
  now says `calculated` and is byte-identical to `JSON.stringify` of the
  rewritten rows; `inputs/indicators.v9.json` holds the original bytes;
  the manifest is at 10 and its `hmisIndicators` entry for the rewritten
  row carries the expression; the outcome's `rewrittenInputs` names
  `inputs/indicators.json`; a second call returns `transformed: false`
  with an empty `rewrittenInputs`, and afterwards no
  `inputs/indicators.v10.json` and no `manifest.v10.json` exist (the
  retain rule is the observable; mtimes are not); a package whose mirror
  has no `derived` row gets no retained mirror copy and an empty
  `rewrittenInputs`; a package whose listed mirror is missing returns
  `unreadable`; a mirror with a row of an unknown type still throws
  `RunInputRowSchemaError` from the manifest blocks (ruling 5), and after
  that throw the mirror on disk is unchanged and no retained copy exists
  (ruling 11). The scratch manifest must satisfy `runManifestSchema`
  after the blocks run; build it from the smallest valid shape the schema
  accepts, read off `run_manifest.ts`, not from a production file.
- SYSTEM_08, three edits, each replacing the sentences named:
  1. "Four invariants", item 1 **Immutable**: after "no published file is
     ever rewritten", add: "Immutability covers outputs: scripts, logs, raw
     CSVs, parquet and assets. The manifest and the input mirrors are
     descriptors and are transformed forward (below)."
  2. The paragraph beginning "Invariant 1's immutability covers package
     **outputs**; the manifest is a derived descriptor and **is
     transformed forward in place**" becomes: "Invariant 1's immutability
     covers package **outputs**. The manifest is a derived descriptor and
     **is transformed forward in place** (`server/runs/manifest_transform.ts`),
     and an input mirror's **vocabulary** is transformed forward by the
     input stage that runs before the manifest blocks
     (`server/runs/input_transform.ts`): a stored enum value or key name is
     a fact of the code that wrote it, so it follows the code; a row's
     facts are never invented or dropped. Both exist because a schema
     change would otherwise orphan every existing package and regenerating
     mints a new `runId`. Manifest blocks may only recompute from files
     already in the package and may never invent provenance; input blocks
     rename, or recompute from files already in the package, and never
     invent either. The authoring rules, the failure policy and the
     add-a-block checklists are in PROTOCOL_APP_MIGRATIONS.md § "Run
     Manifest Transforms" and § "Run Input Transforms." The consequences
     sentence that follows gains: "a transformed mirror additionally
     carries its pre-transform `inputs/<name>.v{n}.json`".
  3. "The indicators mirror has two writer formats": after "the row's
     `type` is the stored type under its code name (`uploaded`,
     `dhis2_element`, `sum`, `calculated`)", add: "a package written while
     the formula type was named `derived` was brought to `calculated` by
     input block 1 (manifest version 10)". The sentence about `base`
     stays as it is. The target-state block quote "Input mirrors are raw
     provenance" becomes "Input mirrors are provenance in the app's
     current vocabulary."

**Not in this step.** The protocol section and its checklist (step 2).
Any change to `indicatorRowV2`, `PACKAGE_INDICATOR_TYPES` or the `base`
value. Any change to `manifest_cache.ts`: it calls
`transformRunManifestFile` and gets the stage through it.

**Gates.** The floor. The new test passes under `deno task test`. The
existing indicator tests still pass. `./run` boots against the dev
database with the sweep line reporting every package checked, every one
transformed (the stamp to 10), zero mirrors rewritten and none failed.
Every package under `_example_instance_dir/runs` carries a v1 mirror
with no `type` field, so `./run` proves the stamp and the no-op stage
only; the committed test is the sole proof of the rewrite path, and the
reviewer should expect nothing more from the log.

**Ends with.** One commit: the mechanism and its first block, the version
bump with its cache bump, the test, and the SYSTEM_08 prose.

### Step 2: the protocol recipe

**Surface.**

- `PROTOCOL_APP_MIGRATIONS.md`

**Deliverable.** A new subsection **"Run Input Transforms"** directly after
"Run Manifest Transforms" (before "Validation"), saying, in this order and
in prose a fresh agent can act on:

1. What it is: `server/runs/input_transform.ts` applies the manifest
   pattern to a package's `inputs/*.json` mirrors. Same numbered blocks,
   appended and never reordered, each idempotent and precondition-checked,
   same no-op write guard. It runs inside `transformRunManifest` before
   manifest block 1, on a forced pass only, behind
   `RUN_MANIFEST_SCHEMA_VERSION`, so it reaches boot and the read path
   through the one entry point `transformRunManifestFile`.
2. Why it exists, in two sentences: the strict row schemas in
   `indicator_catalog.ts` fail-stop boot on a value they no longer name;
   without a forward transform, renaming a stored vocabulary means either
   a legacy value accepted forever in the reader or a hand edit on every
   host. State the `derived` to `calculated` rename of 2026-09-15 as the
   worked example, with the count of production packages it reached.
3. The rule, the manifest's own: **rename or recompute, never invent,
   and never read outside the package.** An input block is a pure
   function of the package's files and the app's code. It may rename a
   value or a key, or recompute a field from files already in the
   package. It may not add a fact those files do not hold, fill a null,
   drop a row, or read the database or live instance state. Give the
   `base` case as the boundary: a `base` row's real type lives in the
   live dictionary, so no input block may resolve it.
4. Versioning: there is no second version integer. An input block names
   the manifest version that first carries it; that version's manifest
   block is the stamp, and is allowed to be only a stamp (block 7 and
   block 8 are the precedents). The forced-gate corollary applies
   unchanged: a mirror fix requires a version bump to reach existing
   packages.
5. Writing: transform in memory, parse, then persist, for both files.
   The stage returns pending writes and nothing lands until the manifest
   parses; then the mirrors are written first and the manifest second,
   with the reason (a crash between the two leaves a state the next pass
   repairs; the reverse order would not). Serialize exactly as
   `writeInputJson` does (`JSON.stringify(rows)`, no indent), skip when
   unchanged, retain `inputs/<name>.v{n}.json` with `n` the stored
   manifest version, through the one persist helper the manifest uses.
   Retained copies are not in `inputFiles` and no reader opens them; they
   are the rollback path. A rewrite is reported in the sweep line.
6. Failure policy: the two input-mirror rows of the existing table are
   unchanged and the stage raises the same two classes. Bytes unavailable
   or not JSON: `RunInputReadError`, `unreadable`, boot proceeds. A block
   that throws otherwise is a code defect and fails boot. A mirror the
   stage leaves in a shape the row schema rejects is drift and fails boot
   through `RunInputRowSchemaError` exactly as before: the stage does not
   validate, the readers do.
7. **Checklist for adding an input block**:
   - Append the block at the end of `input_transform.ts`, numbered,
     idempotent, precondition-checked, renaming or recomputing from
     package files only
   - Add it to the `INPUT TRANSFORM BLOCKS:` list in that file's header
   - Bump `RUN_MANIFEST_SCHEMA_VERSION`; add a manifest block that stamps
     it (and does nothing else if the manifest's shape is unchanged); add
     the version to the history in `run_manifest.ts`
   - Update the strict row schema in `indicator_catalog.ts` and its enum
     in `lib` to the new vocabulary in the same commit; never add the old
     value to a reader
   - Bump `PO_CACHE_VERSION` and the `_PO_DETAIL_CACHE` prefix
   - Audit the fourth persistence layer (stored `FigureBundle`s) for the
     renamed value
   - Extend `server/tests/run_input_transform_test.ts` with a mirror
     carrying the old value

   And one line added to the existing manifest checklist: "A change to a
   value or key stored in an input mirror is an input block, not a
   reader accommodation: see Run Input Transforms."

The existing "Run Manifest Transforms" section changes in two places.
Its bold doctrine sentence, "package outputs are immutable; the manifest
is a derived descriptor and may be transformed forward", becomes "package
outputs are immutable; the manifest is a derived descriptor and an input
mirror's vocabulary is the app's, and both may be transformed forward".
Its sentence "Blocks may only RECOMPUTE from files already in the
package" gains a cross-reference: "Input mirrors are brought to the
current vocabulary before any block reads them (§ Run Input Transforms)".

**Not in this step.** Any code. Any SYSTEM file (step 1 wrote the
contract prose).

**Gates.** The floor. `./validate_protocols` is in the floor and is the
only automated check over this file; the reviewer additionally reads the
section against `input_transform.ts` and `manifest_transform.ts` as
landed by step 1 and treats any sentence the code does not bear out as a
finding.

**Ends with.** One commit: the protocol section, the checklist line and
the cross-reference.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| `deno task typecheck` (server, client, `lint:systems`) | Step 1 |
| `deno task test`, including `run_input_transform_test.ts` | Step 1 |
| `./validate_protocols` | Step 1 |
| `./run` boots; the sweep line reports every package transformed, zero mirrors rewritten, no failures | Step 1 |
| Reviewer reads the protocol section against the landed code | Step 2 |

## 6. Out of scope

- Resolving `base` rows in v2 mirrors to their real count type. Needs the
  live dictionary or a rule that does not, so it is its own decision.
  Until then `PACKAGE_INDICATOR_TYPES` keeps `base` and SYSTEM_08 keeps
  its sentence.
- Transforming any output file, parquet, CSV, script or log. Outputs are
  immutable and stay so.
- The ICEH and HFA snapshot readers that still open their mirrors per
  request (SYSTEM_08's mirror-tolerance open item). The stage rewrites
  only `inputs/*.json` files an input block names; today that is one.
- `runs.summary.manifestSchemaVersion` and `diskSizeBytes`, untouched by
  ruling 4.
- The dormant `nigeria-ai` runs directory on the host. It has no running
  container; its package is transformed if and when that instance boots.
- Deleting or regenerating any production package. The mechanism makes
  that unnecessary.

## 7. Rollout and rollback

Ships with the next release, after step 2's review passes, through the
normal `./deploy`. Release 1.73.0 (`3543da7c`, image on Docker Hub) is
never rolled to any instance: it carries the rename and no transform, and
fails boot on the four instances with a `derived` row. The fleet goes
from 1.72.1 straight to the release carrying this plan. Nothing ships
between steps; `./deploy_testing` may be used after step 1 to watch the
sweep on the testing instance, whose packages predate `b9c6d518`.

At boot on each instance, in this order: SQL migrations 085 to 089 run
(089 renames the stored dictionary type); then the manifest sweep forces a
pass on every package below version 10. On the four instances with a
`derived` row the stage rewrites the mirror and retains
`inputs/indicators.v{n}.json`; on every instance every package's manifest
is re-stamped to 10 and retains `manifest.v{n}.json`. The sweep line
reports packages checked, manifests transformed and mirrors rewritten,
so the four instances read differently from the rest. No hand edit on
the host before or after.

Rollback of the image alone is not enough, as it is not for the manifest
today: the previous reader accepts only `base` and `derived`. To roll
back, restore each package's `inputs/indicators.v{n}.json` over
`inputs/indicators.json` and `manifest.v{n}.json` over `manifest.json`,
then start the previous image. Record that the retained copies are the
rollback path in the protocol section (step 2, item 5).

## 8. Build log

Append-only, newest last.

| Date | Step | Row |
| --- | --- | --- |
| 2026-09-15 | plan | Written. Facts verified read-only on the host: every instance at v1.72.1 and migration 084; eleven mirrors with a `derived` row across demo, mozambique, nigeria-v2-testing, uganda, nigeria-ai; a `derived` row carries the full v2 shape; only `inputs/indicators.json` and `manifest.json` hold the value. |
| 2026-09-15 | plan | Ruling 3 widened to the manifest's rule (rename or recompute from package files and app code, never the database). |
| 2026-09-15 | plan | Review before `Do 1`, every claim verified: release 1.73.0 exists and is never rolled (§1, §7); rulings 11 to 13 added (parse before write and mirrors before manifest, shared read and persist helpers, rewrites reported in the sweep line); `indicator_catalog.ts`, `db_startup.ts` and `lib/types/indicators.ts` join step 1's surface for the two stale comments, the helpers and the sweep line; the no-write assertion is the absence of `.v10.json` retained copies; the dev packages are all v1, so `./run` proves only the stamp; step 2 amends the bold doctrine sentence; the §1 line reference is 82. |
| 2026-09-15 | plan | Second review, verified: two "rename only" leftovers aligned with ruling 3; the manifest no-op guard (line 285, not 232 as the review said) gates the manifest write alone, stated; the reader overlay is an optional argument so `build_run_package.ts` stays outside the surface. |
