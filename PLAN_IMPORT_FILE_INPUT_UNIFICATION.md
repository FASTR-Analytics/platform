# PLAN — One file-input mechanism: everything becomes an asset

> **Supersedes the Thread-1/Thread-2 verdicts in
> `PLAN_CSV_IMPORT_SURFACE_REVIEW.md`** (that file's Thread 3 verdicts —
> keep the shell `no-cache` hardening, the honest comment, the notFound
> envelope — stand and are already in the working tree).
>
> **Ruling (Tim, 2026-08-07):** the token-keyed temp-upload mechanism is
> abolished. Every file a wizard consumes is an instance asset — uploaded
> through the one TUS asset path (asset row + SSE notify) or picked from the
> existing assets list. Rationale: one uniform pattern for something that
> appears in many places; less code and less mental overhead; and asset-dir
> "pollution" is a feature — import inputs persist, which is good for
> reproducibility and never losing data.
>
> **Also ruled:** the collapsed one-button sidebar was bad UX. The direct
> action buttons come back.

---

## 1. End state

One client component, one server resolution path, one reference type:

- **Client:** `FileUploadSelector` is the only choose-a-file component
  (the 5 existing consumer files + the 4 wizard slots). Upload a new file
  or pick one from assets; either way the wizard holds an asset
  `fileName: string`.
- **Contract:** every launch/parse payload names files by asset `fileName`.
  No tokens anywhere.
- **Server:** every file read goes through `resolveAssetFilePath()`
  (`server/db/instance/assets.ts` — already the traversal-safe chokepoint).
- **Integrity:** an asset name is a *mutable* reference where a token was
  an immutable one. Launched runs therefore pin their input bytes with a
  size+mtime stamp taken at launch validation and re-checked at every
  deferred read (§4.4). Overwrite-after-launch fails loudly, never
  silently ingests unpreviewed bytes.
- **Exposure:** data-file assets (`.csv`/`.xlsx`/`.xls`/`.zip`) are served
  only to users with `can_view_data` or `can_configure_data` (§4.5) —
  import inputs are raw facility-level health data and must not become
  downloadable by every authenticated user just because they now persist.
- **Lifecycle:** import inputs are ordinary assets. Nothing deletes them at
  run finalize; they outlive the run. Users manage them on the assets page
  like any other asset (non-admins can delete only their own uploads —
  existing `deleteAssets` ownership rule). No wizard-origin tagging —
  `uploaderEmail` is enough.

Deleted outright:

- `server/import_temp_uploads.ts` (store/resolve/delete/orphan-sweep — the
  whole file) and the `sweepOrphanImportTempUploads` call in
  `server/db_startup.ts:98`
- the `wizardTemp` branch of the TUS completion handler
  (`server/routes/instance/upload.ts:284-316`)
- `client/src/components/_temp_file_upload.tsx`
- every `uploadToken` field in lib types/schemas (§3)
- **this session's uncommitted half-measures** (§6): the
  `createDatasetImportUploadFromAsset` route + `copyToImportTempUpload` +
  the `assetFilter` picker bolted onto `TempFileUpload`

## 2. Client

### 2.1 `FileUploadSelector` gains one prop

`allowedFileTypes?: string[]`, passed through to `createUppyInstance` (the
param already exists there; `TempFileUpload` used it, `FileUploadSelector`
never did). Nothing else changes — the SSE wait-for-asset logic is exactly
what the wizards need after an upload.

### 2.2 Wizards

State changes from `TempUpload {token, fileName}` signals to plain
`fileName: string` signals. Per slot:

| Wizard slot | filter | allowedFileTypes |
| --- | --- | --- |
| HMIS CSV (`_csv_wizard.tsx`) | `a.isCsv` | `[".csv"]` |
| HFA data CSV (`_wizard.tsx`) | `a.isCsv` | `[".csv"]` |
| HFA XLSForm (`_wizard.tsx`) | `a.isXlsx` | `[".xlsx"]` |
| ICEH zip (`_wizard.tsx`) | `a.isZip` | `[".zip"]` |

Parse/preview calls fire on selection change exactly as they do today —
only the body field changes (token → fileName). **Keep the callback shape**
(the wizards' existing `onUploaded` pattern, wired to `FileUploadSelector`'s
`onChange`), NOT a `createEffect` on the fileName signal: re-uploading the
same name yields an unchanged signal value, and only the direct callback
(which `FileUploadSelector` fires even for the `alreadyExists` re-upload
case) re-parses the new bytes. An effect-on-signal would show stale headers
for a replaced file.

Note `isXlsx` also matches `.xls`; a picked `.xls` XLSForm fails at the
server parse step with the existing sheet-check error. Acceptable — don't
add a special filter.

### 2.3 Sidebar restore (the UX ruling)

Revert this session's collapse in all six files — back to exactly the
pre-change behavior:

- HMIS `index.tsx`: "Import from DHIS2" + "Upload CSV file" buttons,
  `openImports(autoOpenCsvWizard)`.
- HMIS `imports/index.tsx`: restore the `autoOpenCsvWizard` prop and the
  `csvAutoOpened` readiness-gated latch (the CSV wizard reads `runsQuery`
  for its Start-vs-Queue fork, so the gate is load-bearing, not cruft).
- HFA + ICEH `index.tsx` / `imports/index.tsx`: "Start new import" +
  "View imports", `autoOpenWizard` prop + latch.

The latch-and-gate is the accepted cost of one-click wizard entry. Do not
redesign it in this pass.

## 3. Contract changes (lib)

The renames are chosen so **every key that historical rows are displayed
from survives unchanged** — only token keys are dropped, and the pin keys
are additive (§5).

New shared type (`lib/types/assets.ts`):

```ts
AssetFilePin = { size: number; mtimeMs: number }
```

Pins are **server-stamped at launch validation** (§4.4) — they appear in
the *stored* config types only, never in client-sent launch/parse bodies.

`lib/types/dataset_hmis_import.ts` + `hmisCsvRunConfigSchema`
(`lib/api-routes/instance/datasets.ts`):

```ts
DatasetHmisCsvRunConfig = { fileName, filePin, mappings, resumeFromStaging? }  // drop uploadToken
parseDatasetHmisCsvHeaders body: { fileName: string }                          // was { uploadToken }
```

`lib/types/dataset_hfa_import.ts` + `hfaCsvRunConfigSchema`:

```ts
HfaCsvRunLaunchInput = { csvFileName, xlsFormFileName, mappings }      // drop both tokens
HfaCsvRunConfig     = { csvFileName, csvFilePin, xlsFormFileName, xlsFormFilePin,
                        mappings, resumeFromStaging? }
parseDatasetHfaCsvHeaders body:    { csvFileName, xlsFormFileName }
previewDatasetHfaDuplicates body:  { csvFileName, facilityIdColumn, rowFilters }
```

The "file names are re-derived server-side from the temp uploads, which are
the authority" doc note on `HfaCsvRunLaunchInput` dies — the client-sent
asset name IS the reference; the server validates existence and stamps the
pin.

`lib/types/dataset_iceh_import.ts` + `lib/api-routes/instance/iceh.ts`:

```ts
IcehRunConfig = { zipFileName, zipFilePin, skipReviewGate? }           // drop zipUploadToken
parseDatasetIcehZipPreview / launchDatasetIcehRun body: { zipFileName }
```

Also delete the `createDatasetImportUploadFromAsset` registry entry added
this session.

## 4. Server

### 4.1 Resolution sites (token → asset)

Each `resolveImportTempUpload(token)` becomes a `resolveAssetFileOrThrow`
call (below), keeping the existing loud-failure shapes (the `failClaim`
messages become "The file is no longer in assets. Upload or select it
again and relaunch."):

| Site | Today |
| --- | --- |
| `dataset_hmis_import_runs.ts:488` | launch/enqueue validation |
| `dataset_hmis_import_runs.ts:537` | `spawnCsvRunWorker` (skipped when `resumeFromStaging`) |
| `dataset_hfa_import_runs.ts:150-151` | launch validation + fileName derivation |
| `dataset_hfa_import_runs.ts:212-213` | `spawnHfaRunWorker` (skipped when `resumeFromStaging`) |
| `dataset_iceh_import_runs.ts:99` | `validateIcehRunLaunch` (zip preview + country check) |
| `dataset_iceh_import_runs.ts:150` | `spawnIcehRunWorker` (ALWAYS re-reads — ICEH integrate-anyway re-runs the full ingest) |
| `routes/instance/datasets.ts:376` (HMIS parse-headers), `:551-552` (HFA parse), `:582` (HFA duplicate preview); `routes/instance/iceh.ts:54` (zip preview) | stateless wizard-step reads |

A shared helper is warranted, in `server/db/instance/assets.ts`:

```ts
resolveAssetFileOrThrow(
  fileName: string,
  expectedPin: AssetFilePin | null,   // null = stateless wizard read, no pin check
): Promise<{ filePath: string; pin: AssetFilePin }>
```

resolve + stat + the two canonical error messages ("file gone" and "file
changed", §4.4), so each wording exists once, not nine times. Launch
validations call it with `null` and store the returned pin; spawn sites
call it with the stored pin.

### 4.2 Workers stop deleting their inputs

Remove all seven `deleteImportTempUpload` calls and their surrounding
retention comments:

- `import_hmis_data_csv/worker.ts:155,169`
- `import_hfa_data_csv/worker.ts:77-78`
- `import_iceh_data/worker.ts:106,127,153`

This is the reproducibility half of the ruling: the input survives the run.
If a worker's only remaining use of a finalize hook is the deletion, remove
the hook too — no dead scaffolding.

### 4.3 TUS front door

Delete the `wizardTemp` metadata branch in `upload.ts`. All uploads take
the asset path: sanitize → rename into `_ASSETS_DIR_PATH` → metadata row →
`notifyInstanceAssetsUpdated`. **Same-name upload overwrites the asset
(existing `Deno.rename` semantics, last write wins)** — this is today's
behavior for every `FileUploadSelector` consumer and becomes the wizards'
behavior too. Accepted; do not build versioning. Known sharp corner, also
accepted: the metadata upsert transfers `uploaderEmail` (and therefore
non-admin delete rights) to the overwriter. Launched runs are protected
from overwrites by the pin (§4.4); pre-launch, the wizard re-parses on
every upload (§2.2) and launch validation re-checks the file, so the user
always previews and launches against current bytes.

### 4.4 Launch-time byte pinning

What tokens gave us for free — a launched run's input bytes cannot change
under it — the asset name does not. The window is real: HMIS runs queue
behind the single-running slot, and an ICEH `needs_review` hold can sit
for days before "Integrate anyway" re-reads the zip. Any authenticated
user can upload, so a same-name upload during that window would otherwise
silently swap the bytes (a structural change fails loudly at staging —
columns are mapped by header name — but same-headers/different-rows would
integrate data nobody previewed).

Mechanism:

- At launch validation (`validateCsvRunConfig`, the HFA launch-input
  builder at `dataset_hfa_import_runs.ts:150`, `validateIcehRunLaunch`),
  `resolveAssetFileOrThrow(name, null)` returns the pin (size and mtimeMs
  from `Deno.stat`); it is stored in the run config (§3).
- At every deferred read — `spawnCsvRunWorker`, `spawnHfaRunWorker`,
  `spawnIcehRunWorker` — the same helper is called with the stored pin.
  Mismatch → the existing `failClaim` path with: "The file has changed
  since this run was launched. Start the import again." A config with a
  *missing* pin fails the same way (belt-and-braces for a pre-deploy row
  whose temp-file name happens to match a real asset).
- Stateless wizard-step reads (parse headers, duplicate preview, zip
  preview) pass `null` — they always want current bytes.

An overwrite with identical bytes still changes mtime and still fails the
pin. Accepted — relaunching is cheap, silent swaps are not. No content
hashing: stat is free, hashing a multi-hundred-MB CSV on a user-facing
launch request is not, and mtime granularity is more than enough for a
human-scale race.

### 4.5 Serving tier for data files (the exposure ruling)

Today the assets static mount has two tiers (`middleware/static.ts`):
image extensions are public (dashboard logos), everything else is served
to *any* authenticated user. Import inputs are raw facility-level health
data; leaving their bytes readable by users with no data permission would
contradict the run-outputs precedent (the `/:run_id/outputs/*` mount was
deliberately locked to `can_configure_data` for exactly this reason).

Add a third extension-scoped tier, same pattern as `PUBLIC_IMAGE_RE`:
`.csv`/`.xlsx`/`.xls`/`.zip` require `can_view_data` OR
`can_configure_data` (global admins pass as always). That matches the
assets *page* gate exactly (`instance/index.tsx` shows it under the same
OR), so the page's download buttons keep working for everyone who can see
the page, and users with neither permission — who could never see this
data in the app — can no longer fetch the bytes. Note
`requireGlobalPermission(a, b)` is AND; this tier needs a small OR check,
written where the mount lives.

Asset *names* remain visible to all authenticated users (the instance SSE
starting payload carries the assets list) — already the codebase's stated
position ("Asset filenames are already public"), unchanged here. `.pdf`
(AI documents) stays in the any-authenticated tier: the AI document flow
reads bytes server-side, and this plan doesn't relitigate its exposure.

## 5. Compatibility — why there is NO migration

Verified against the code, not assumed:

- **Stored configs are parsed leniently.** `parseCsvConfig` /
  `parseJsonOrThrow` are plain `JSON.parse` with a TS cast — no Zod, no
  strip mode, and configs are never re-serialized through a schema on read.
  A leftover `uploadToken` key in an old row is inert; a missing one in a
  new row breaks nothing.
- **Every display path reads a key that survives.** HMIS summary reads
  `config.fileName` (`dataset_hmis_import_runs.ts:69`), HFA reads
  `config.csvFileName` (`:40`), ICEH reads `config.zipFileName` (`:39`).
  All three keys already exist in historical rows and keep their names.
  History renders identically. No transform block, no skip-gate.
- **Pin keys are additive.** Historical rows simply lack `filePin` /
  `csvFilePin` / `xlsFormFilePin` / `zipFilePin`; no display path reads
  them, and the only code that does (the spawn sites) treats a missing pin
  as a loud failure — which is correct, because any pre-deploy run that
  still needs its file is exactly the in-flight case below.
- **In-flight runs across the deploy fail loudly, not weirdly.** A queued
  HMIS run or an ICEH `needs_review` hold launched pre-deploy names a file
  that was a temp upload, not an asset → the new resolution finds no asset
  → the existing `failClaim` path errors the run with the "no longer
  available, relaunch" message. HMIS/HFA "Integrate anyway"
  (`resumeFromStaging`) never touches the file and is unaffected.
  **Ops note: drain queued runs and ICEH review holds before deploying
  this.** No compat shim — one-time operational step, per the no-transition-
  cruft rule.
- **`.import-uploads/` leftovers:** one-time manual `rm -rf` on each
  instance after deploy (or fold into the deploy's release note). Do not
  add permanent cleanup code for a dir nothing writes to anymore.

## 6. Working-tree state (implementer: read first)

Uncommitted in the tree from the 2026-08-07 session, sharing the tree with
the large PLAN_EFFECTIVE_FORMAT workstream (check `git status` before
staging anything):

- **Superseded, remove/rework per this plan:** sidebar collapse (6 dataset
  component files → §2.3 revert); `createDatasetImportUploadFromAsset`
  (lib registry + server route) and `copyToImportTempUpload`; the
  `assetFilter` picker inside `_temp_file_upload.tsx` (whole file dies);
  the `assetFilter` props on the 4 wizard slots (replaced by
  `FileUploadSelector` per §2.2); the SYSTEM_06 "Client" paragraph
  describing the from-asset copy (rewrite per §8).
- **Keep as-is:** `server/middleware/cache.ts` (shell no-cache + honest
  comment + Vite-hash fix), `main.ts` (`serveShell` headers + `notFound`
  envelope).

## 7. What does NOT change

Staging legs, per-run staging tables, the integrate transactions, the run
model (queue/hold/discard), the DHIS2 path, scheduler, SSE machinery,
`FileUploadSelector`'s existing consumers, and the assets page. This
plan moves where wizard bytes live and how they're named — nothing about
how they're processed.

## 8. Docs

- `SYSTEM_06_ingestion.md`: the wizard-temp contract paragraphs (~line 99
  bullet, the Client section) rewritten: wizard inputs are instance assets;
  launch payloads name asset fileNames; inputs persist after the run. The
  orphan-sweep sentence dies with the sweep.
- `SYSTEM_04` (assets/upload): remove the wizard-temp TUS mode from its
  prose; note that import wizards are now ordinary asset consumers; add
  the third serving tier (§4.5) to the static-serving paragraph alongside
  the existing public-image tier; document `AssetFilePin` +
  `resolveAssetFileOrThrow` as the deferred-read contract.
- `lint:systems` will flag the two deleted files' manifest entries —
  update the manifests in the same commit.

## 9. Verification

1. `deno task typecheck` (includes `lint:systems`), `./validate_protocols`.
2. **Per-family end-to-end with disposable fixtures** (create → import →
   delete; never touch existing named rows): upload via wizard → asset row
   appears (SSE) → launch → run completes → **asset still present** →
   re-import the same file via the picker (no re-upload) → delete fixture
   asset + fixture data.
3. **Hold semantics:** force an HMIS `needs_review` (dirty fixture CSV) →
   "Integrate anyway" works with the asset deleted (staging survives);
   force an ICEH hold → "Integrate anyway" with the asset deleted errors
   loudly (it re-reads) — that error message is the UX for a user who
   deletes an input mid-hold, so read it critically.
4. **Pin semantics:** launch an HMIS run while another run holds the slot
   (so it queues), overwrite the fixture asset with different bytes, let
   the queue fire → run errors with the "file has changed" message, never
   integrates the new bytes. Same play against an ICEH hold + "Integrate
   anyway". Re-upload with *identical* bytes also fails the pin (mtime) —
   confirm the message makes relaunching obvious.
5. **History display:** against the testing DB (read-only), confirm
   pre-change completed runs still show their file names.
6. Same-name overwrite pre-launch: upload `fixture.csv` twice with
   different bytes before launching → wizard re-parses (§2.2), launch
   pins and imports the second bytes.
7. **Serving tier:** as a user with neither data permission, fetch a
   `.csv` asset URL → 403; an image asset still serves; as a
   `can_view_data`-only user, the assets-page download button still works.
