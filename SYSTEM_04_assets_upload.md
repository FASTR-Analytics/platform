---
system: 4
name: Assets & Upload
globs:
  - client/src/components/_file_upload_selector.tsx
  - client/src/components/_uppy_file_upload.ts
  - client/src/components/instance/instance_assets.tsx
  - lib/types/assets.ts
  - server/db/instance/assets.ts
  - server/routes/instance/assets.ts
  - server/routes/instance/upload.ts
docs_absorbed:
---

# S4 — Assets & Upload

The file-upload front door — a hand-rolled TUS resumable-upload server, the
instance asset store it lands files in, and the client upload primitives —
shared by every feature that ingests a file. Written fresh from code 2026-07-17
(first review cycle, review-only — no DOC_* absorbed).

Boundaries: **serving** the stored bytes back out is S1's static middleware
(`server/middleware/static.ts` — public unauthenticated carve-out for image
extensions, everything else behind `requireGlobalPermission()`; downloads hit
`GET /<fileName>` at root). What consumers **do** with an uploaded file is
theirs: the dataset import wizards are S6; structure/geojson/HFA-weights/
indicator batch uploads are S5; report images and embeds are S12; batch user
upload is S15; module runs read `assetsToImport` (e.g. `population.csv`) out of
the assets dir at execution time (S8). S13's AI documents do **not** pass
through here — they multipart-POST to the S13-owned `/ai/files` proxy. The
`upload.ts` routes are raw Hono by design (custom TUS headers/handshake) — one
of S1's enumerated off-registry endpoints; `assets.ts` is normal
registry/`defineRoute`.

## The TUS upload server (`routes/instance/upload.ts`)

A minimal implementation of the TUS 1.0.0 resumable protocol (extensions:
`creation,termination`), mounted at `/upload`:

| Route                   | Guard                               | Role                                           |
| ----------------------- | ----------------------------------- | ---------------------------------------------- |
| `POST /upload`          | `requireGlobalPermission()` + `log` | create upload, return `Location: /upload/<id>` |
| `GET /upload/:id`       | **none — deliberate**               | TUS HEAD resume check (`Upload-Offset`)        |
| `PATCH /upload/:id`     | `requireGlobalPermission()` + `log` | append chunk at `Upload-Offset`                |
| `DELETE /upload/:id`    | `requireGlobalPermission()` + `log` | cancel + remove temp file                      |
| `OPTIONS /upload(/:id)` | none                                | CORS preflight, advertises the extensions      |

State is an **in-memory `Map`** of
`{ id, filename, size, offset, createdAt,
metadata, uploaderEmail }`; bytes
stream into `<_ASSETS_DIR_PATH>/.tus-uploads/<uuid>`. A server restart forgets
the map — the client's next HEAD gets a 404 and Uppy restarts the upload from
zero (graceful, not resumed). Uploads older than 24 h are swept — but only map
entries, and only when a new POST arrives (Open items).

**The HEAD-via-GET quirk (load-bearing).** The resume check is registered with
`.get()`, NOT `.on("HEAD", …)`: Hono's dispatch converts HEAD to GET before
route matching, so a HEAD-registered route never matches, and without a `.get()`
handler the request would fall through to `main.ts`'s catch-all redirect and
break the protocol. It is also **unauthenticated by design** — the TUS client
probes upload status before it has credentials attached; the route leaks nothing
but offset/length of a random UUID.

**Filename safety.** The TUS `Upload-Metadata` filename is attacker-controllable
and is later joined onto `_ASSETS_DIR_PATH`: `sanitizeUploadFilename` strips
every path component and Windows separator, falling back to a generated name.
The read-side twin is `resolveAssetFilePath` in `db/instance/assets.ts` — every
join of a client-supplied name onto the assets dir must go through it (it
rejects separators and `..`).

**Completion.** When `offset >= size`, the temp file is `Deno.rename`d to
`<_ASSETS_DIR_PATH>/<filename>` (silently replacing any same-named asset),
ownership is upserted into `asset_metadata`, the map entry is deleted, and
`notifyInstanceAssetsUpdated` broadcasts the refreshed list (S3). The response
carries `X-Upload-Complete` / `X-Upload-Filename`.

## The asset store (`db/instance/assets.ts` + `routes/instance/assets.ts`)

**The filesystem is the source of truth.** `getAssetsForInstance` walks
`_ASSETS_DIR_PATH` (`readDir` + `stat`), skipping directories and dot-files
(which hides `.tus-uploads`); the `asset_metadata` table contributes only
`uploaderEmail` (null → shown as "system"). Type flags (`isCsv`/`isXlsx`/
`isImage`/`isZip`) are extension-based. Registry routes: `getAssets`
(`GET /assets`) and `deleteAssets` (`POST /assets/delete`), both zero-key
`requireGlobalPermission()`.

**Delete authorization** is ownership-based: a non-admin may delete only assets
whose `asset_metadata.uploader_email` matches them (assets with no metadata row
are admin-delete-only); admins delete anything. Deletion removes the file
(missing file tolerated) then the metadata rows.

## Client primitives

- **`_uppy_file_upload.ts`** — `createUppyInstance(config)`: Uppy Dashboard
  modal + TUS plugin (5 MB chunks, retry delays 0/1s/3s/5s, `withCredentials`,
  `storeFingerprintForResuming: false` — resume works within one attempt, not
  across page loads). Restrictions carry only `maxNumberOfFiles` (default 1; `0`
  = unlimited, as the instance-assets page uses) — no type/size caps (Open
  items). State is cleared on every modal open/close; `cleanupUppy` clears +
  destroys on unmount.
- **`_file_upload_selector.tsx`** — the shared upload-or-pick control: a
  filtered `Select` over `instanceState.assets` plus an upload button. After a
  _new_ file uploads it shows "Processing upload…" and waits for the asset to
  appear in the T1 store via SSE before selecting it (re-uploads of an existing
  name select immediately). Used by the S5/S6/S12 wizards.
- **`instance/instance_assets.tsx`** — the Assets admin page: type tabs
  (CSV/Excel/Images/ZIP/Other), size/modified/owner columns, per-row download
  (root-path `GET`, S1 static serve) and delete; delete buttons and the
  admin-only bulk delete mirror the server's ownership rule.

## Contract

One upload front door: anything that ingests a user file goes through TUS + the
assets dir — don't add parallel upload endpoints (S13's Anthropic files proxy is
the deliberate exception). Client-supplied asset names never touch the
filesystem except through `sanitizeUploadFilename` (write) /
`resolveAssetFilePath` (read). The asset list is filesystem-derived — a file
placed in `_ASSETS_DIR_PATH` by any means IS an asset; `asset_metadata` is
ownership annotation, not a registry.

## Open items

- **Upload size/type caps** — the client Uppy config restricts only
  `maxNumberOfFiles` (no `allowedFileTypes`/`maxFileSize`), and the server
  accepts any `Upload-Length` with no MIME/size check. Needs a per-file-type
  policy ruling first: these primitives also carry large dataset CSVs, so a
  blanket cap can't be picked from the geojson case alone.
- **TUS temp-file sweep** — orphan cleanup only walks the in-memory upload Map
  and only on a new POST; temp files from crashed/restarted servers have no map
  entry and accumulate in `.tus-uploads` forever. Sweep the directory by mtime
  instead.
- **Any user can overwrite any asset.** Completion `rename`s over an existing
  same-named file and the ownership upsert transfers it to the new uploader — so
  a non-admin who cannot _delete_ someone else's asset can still _replace_ it,
  including files that feed module runs (`population.csv`). Decide: reject
  same-name uploads by non-owners, or version the target name.
- **Zero-key guards throughout** — upload, list, and the delete route all use
  bare `requireGlobalPermission()` ("any authenticated user"); S1's rule is to
  be deliberate about that. A `can_configure_data`-style key may fit.
- **Cruft:** `deleteAssets`' handler re-checks
  `Array.isArray(body.assetFileNames)` — the registry schema
  (`z.array(z.string())`) already guarantees it; the `onBeforeRequest` no-op
  hook in `_uppy_file_upload.ts`.
