---
system: 4
name: Assets & Upload
globs:
  - client/src/components/_shared/file_upload_selector.tsx
  - client/src/components/_shared/uppy_file_upload.ts
  - client/src/components/assets/asset_sharing.tsx
  - client/src/components/assets/assets.tsx
  - client/src/components/assets/mod.ts
  - lib/types/assets.ts
  - server/db/instance/assets.ts
  - server/middleware/asset_visibility.ts
  - server/routes/instance/assets.ts
  - server/routes/instance/upload.ts
docs_absorbed:
---

# S4: Assets & Upload

The file-upload front door: a hand-rolled TUS resumable-upload server, the
instance asset store it lands files in, and the client upload primitives, shared
by every feature that ingests a file. Written fresh from code (first review
cycle, review-only, no DOC_* absorbed).

Boundaries: **serving** the stored bytes back out is S1's static middleware
(`server/middleware/static.ts`, three extension-scoped tiers; downloads hit
`GET /<fileName>` at root): image extensions are public unauthenticated (logos
and images placed in decks and reports), data-file extensions
(`.csv`/`.xlsx`/`.xls`/`.zip`: import-wizard inputs live here, raw
facility-level health data) require `can_view_data` OR `can_configure_data` (the
assets page's own gate; admins pass), and everything else is behind
`requireApprovedUser()`. A **private** asset is gated ahead of all three tiers
(see Private assets below). Public asset _names_ stay visible to every signed-in
user (the SSE starting payload). Only the bytes are gated. What
consumers **do** with an uploaded file is theirs: the dataset import wizards are
S6; structure/geojson/HFA-weights uploads are S5; report images and embeds are
S12; batch user upload is S15; module runs read `assetsToImport` (e.g.
`population.csv`) out of the assets dir at execution time (S8). S13's AI
documents are uploaded assets: the S13-owned `/ai/files` proxy
(`requireApprovedUser()`) sends a named asset's bytes to Anthropic after an
inline visibility check. The `upload.ts` routes are raw Hono by design (custom TUS
headers/handshake), one of S1's enumerated off-registry endpoints; `assets.ts`
is normal registry/`defineRoute`.

## The TUS upload server (`routes/instance/upload.ts`)

A minimal implementation of the TUS 1.0.0 resumable protocol (extensions:
`creation,termination`), mounted at `/upload`:

| Route                   | Guard                           | Role                                           |
| ----------------------- | ------------------------------- | ---------------------------------------------- |
| `POST /upload`          | `requireApprovedUser()` + `log` | create upload, return `Location: /upload/<id>` |
| `GET /upload/:id`       | **none, deliberate**            | TUS HEAD resume check (`Upload-Offset`)        |
| `PATCH /upload/:id`     | `requireApprovedUser()` + `log` | append chunk at `Upload-Offset`                |
| `DELETE /upload/:id`    | `requireApprovedUser()` + `log` | cancel + remove temp file                      |
| `OPTIONS /upload(/:id)` | none                            | CORS preflight, advertises the extensions      |

State is an **in-memory `Map`** of
`{ id, filename, size, offset, createdAt, metadata, uploaderEmail,
uploaderIsGlobalAdmin, visibility }`;
bytes stream into `<_ASSETS_DIR_PATH>/.tus-uploads/<uuid>`. A server restart
forgets the map. The client's next HEAD gets a 404 and Uppy restarts the upload
from zero (graceful, not resumed). Uploads older than 24 h are swept, but only
map entries, and only when a new POST arrives (Open items).

**The HEAD-via-GET quirk (load-bearing).** The resume check is registered with
`.get()`, NOT `.on("HEAD", …)`: Hono's dispatch converts HEAD to GET before
route matching, so a HEAD-registered route never matches, and without a `.get()`
handler the request would fall through to `main.ts`'s catch-all redirect and
break the protocol. It is also **unauthenticated by design**: the TUS client
probes upload status before it has credentials attached; the route leaks nothing
but offset/length of a random UUID.

**Filename safety.** The TUS `Upload-Metadata` filename is attacker-controllable
and is later joined onto `_ASSETS_DIR_PATH`: `sanitizeUploadFilename` strips
every path component and Windows separator, falling back to a generated name.
The read-side twin is `resolveAssetFilePath` in `db/instance/assets.ts`. Every
join of a client-supplied name onto the assets dir must go through it (it
rejects separators and `..`).

**Completion.** When `offset >= size`, the temp file is `Deno.rename`d to
`<_ASSETS_DIR_PATH>/<filename>` (silently replacing any same-named asset),
ownership is upserted into `asset_metadata`, the map entry is deleted, and
`notifyInstanceAssetsUpdated` broadcasts the refreshed list (S3). The response
carries `X-Upload-Complete` / `X-Upload-Filename`.

**Import wizards are ordinary asset consumers**. There is no wizard-temp TUS
mode: every upload takes the asset path above, and the S6 wizards name their
inputs by asset `fileName` (upload a new file or pick an existing one via
`_shared/file_upload_selector.tsx`). Import inputs persist after the run
(nothing deletes them at finalize) and are managed on the assets page like any
other asset.

**Deferred-read integrity (`AssetFilePin` + `resolveAssetFileOrThrow`).** An
asset name is a _mutable_ reference, so a launched import run pins its input
bytes: `resolveAssetFileOrThrow(fileName, expectedPin)` in
`db/instance/assets.ts` resolves + stats and is the one home of the two
canonical error messages ("no longer in assets" / "has changed since this run
was launched"). Launch validations call it with `null` and store the returned
pin (`{size, mtimeMs}`, `lib/types/assets.ts`) on the run config; every deferred
read (spawn sites, including across queue waits and review holds) re-checks the
stored pin, so an overwrite-after-launch fails loudly instead of silently
ingesting unpreviewed bytes. Stateless wizard-step reads pass `null`: they
always want current bytes.

## The asset store (`db/instance/assets.ts` + `routes/instance/assets.ts`)

**The filesystem is the source of truth.** `getAssetsForInstance` walks
`_ASSETS_DIR_PATH` (`readDir` + `stat`), skipping directories and dot-files
(which hides `.tus-uploads`); the `asset_metadata` table contributes only
`uploaderEmail` (null → shown as "system"). Type flags (`isCsv`/`isXlsx`/
`isImage`/`isZip`) are extension-based. The list reaches the client in the SSE
starting payload and `assets_updated`; the registry routes are `deleteAssets`
(`POST /assets/delete`) and `updateAssetVisibility`, both
`requireApprovedUser()`.

**Delete authorization** is ownership-based: a non-admin may delete only assets
whose `asset_metadata.uploader_email` matches them (assets with no metadata row
are admin-delete-only); admins delete anything, except a private asset, which
only its manager may delete (below). Deletion removes the file (missing file
tolerated), then the metadata and privacy rows.

## Private assets

An asset can be private: visible only to its owner and the viewers they chose.
Admins get no bypass, except for an asset whose owner account has been deleted,
which admins can see and take over so it is never stranded. The one rule is
`canUserSeeAsset` (and `canUserManagePrivateAsset` for change/delete/ overwrite)
in `lib/types/assets.ts`.

- **Storage.** `private_assets (file_name, owner_email)` plus
  `private_asset_viewers (file_name, email)` (migration 218, the same tables an
  instance that ran main's private-assets migration already holds, adopted
  unchanged). `owner_email` has no FK to `users` on purpose: a cascade would
  silently make the file public. Viewers are FK'd and cascade away when their
  user is deleted. An email rename (`rename_user_email.ts`) carries both the
  ownership and the viewer rows across. `AssetInfo.privacy` carries owner,
  viewers and `ownerIsUser`.
- **Set at upload.** The TUS `Upload-Metadata` carries `fastrVisibility`
  (`private`/`public`) and `fastrViewers` (comma-joined emails); the assets
  page's upload dialog sets them on every file (`public` for "Everyone",
  `private` plus the chosen viewers otherwise). Private rows are written before
  the file is renamed into place, so it is never servable as public. No
  visibility field = keep what the file already has (the wizards' uploaders and
  the report editor's image upload), so a re-upload never widens a private file.
- **Changed later** by the owner via `updateAssetVisibility`
  (`POST /assets/visibility`); a public file's uploader (or an admin, for a
  "system" file) may make it private. Viewers must be users on this instance;
  unknown emails and the owner are dropped.
- **Enforced at:** the static serve (a private-asset middleware ahead of the
  image tier; it checks every spelling serveStatic may resolve, answers 404 to
  anyone not permitted and to every unapproved caller, so a deleted owner's
  live session downloads nothing, `Cache-Control: private, no-store`, which
  `cacheMiddleware` leaves in place); the asset list (`getAssetsForUser` in
  `getInstanceDetail`, so the SSE starting payload and the `/mcp` grounding; the
  `assets_updated` broadcast is filtered per connection in
  `createInstanceSseFilter`); delete; same-name overwrite
  (`canUserUploadOverAsset`, at POST and again at completion); and every by-name
  read on a user's behalf: `requireVisibleAssets`
  (`server/middleware/asset_visibility.ts`) on the HMIS CSV, HFA CSV and ICEH
  zip wizard/launch routes, the geojson analyze/save, population preview/import,
  HFA weights read/import, structure step 1, the two HFA facility previews and
  batch user upload routes, and an inline check on the AI files proxy.
- **Not enforced** for module runs' `assetsToImport` (a run reads its fixed
  input names with no user context), for deferred reads of an import run or
  structure upload attempt already launched on a permitted user's behalf, or for
  a private image already embedded in a report or deck: other viewers simply get
  a broken image.

## Client primitives

- **`_shared/uppy_file_upload.ts`** exports `createUppyInstance(config)`: Uppy
  Dashboard modal + TUS plugin (5 MB chunks, retry delays 0/1s/3s/5s,
  `withCredentials`, `storeFingerprintForResuming: false`, so resume works
  within one attempt, not across page loads). Restrictions carry only
  `maxNumberOfFiles` (default 1; `0` = unlimited, as the instance-assets page
  uses). There are no type/size caps (Open items). State is cleared on every
  modal open/close; `cleanupUppy` clears + destroys on unmount.
- **`_shared/file_upload_selector.tsx`** is the shared upload-or-pick control: a
  filtered `Select` over `instanceState.assets` plus an upload button. After a
  _new_ file uploads it shows "Processing upload…" and waits for the asset to
  appear in the T1 store via SSE before selecting it (re-uploads of an existing
  name select immediately). Used by the S5/S6/S12 wizards.
- **`assets/assets.tsx`** is the Assets admin page: one table of every asset
  with a filterable type column (CSV/Excel/Image/ZIP/Other), size/modified/owner
  columns, a "Who can see it" column, per-row sharing (`AssetSharingForm` in
  `assets/asset_sharing.tsx`), download (root-path `GET`, S1 static serve) and
  delete, and one Upload button: `UploadAssetsForm` asks who can see the files
  (Everyone, or only the uploader and the people they choose) above a drop zone,
  and dropping or choosing files closes it and hands them to the page's one Uppy
  instance, which opens only to show progress; the sharing and delete buttons
  mirror the server's ownership and private-asset rules. The page holds and sets
  the chat's `assets` view at mount (S13), whose instructions name the page and
  nothing of its contents.

## Contract

One upload front door: anything that ingests a user file goes through TUS + the
assets dir. Don't add parallel upload endpoints (S13's Anthropic files proxy is
the deliberate exception). Client-supplied asset names never touch the
filesystem except through `sanitizeUploadFilename` (write) /
`resolveAssetFilePath` (read). The asset list is filesystem-derived: a file
placed in `_ASSETS_DIR_PATH` by any means IS an asset; `asset_metadata` is
ownership annotation, not a registry.

## Open items

- **Upload size/type caps.** The client Uppy config restricts only
  `maxNumberOfFiles` (no `allowedFileTypes`/`maxFileSize`), and the server
  accepts any `Upload-Length` with no MIME/size check. Needs a per-file-type
  policy ruling first: these primitives also carry large dataset CSVs, so a
  blanket cap can't be picked from the geojson case alone.
- **TUS temp-file sweep.** Orphan cleanup only walks the in-memory upload Map
  and only on a new POST; temp files from crashed/restarted servers have no map
  entry and accumulate in `.tus-uploads` forever. Sweep the directory by mtime
  instead.
- **Any user can overwrite any asset** (except a private one: only its manager
  may). RULED accepted, with no versioning: completion `rename`s over an
  existing same-named file, last write wins, and the ownership upsert transfers
  delete rights to the overwriter. Launched import runs are protected by the
  byte pin; pre-launch, wizards re-parse on every upload. Files that feed module
  runs (`population.csv`) remain the known sharp corner.
- **Same-name-overwrite residual windows: RULED accepted.** The byte pin covers
  launch→spawn only; the wizard-session window, the spawn→worker-open window,
  and bare-auth upload overwriting a read-gated file are all accepted residual
  risk (small trusted teams; worst case is a discardable bad import). Do not
  raise again.
- **Cruft:** `deleteAssets`' handler re-checks
  `Array.isArray(body.assetFileNames)`, though the registry schema
  (`z.array(z.string())`) already guarantees it; the `onBeforeRequest` no-op
  hook in `_shared/uppy_file_upload.ts`.
