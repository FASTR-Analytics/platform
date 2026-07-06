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

The file-upload front door — the hand-rolled TUS resumable upload protocol,
asset storage and metadata — shared by every feature that ingests a file.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); written fresh from code (no docs to absorb).

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
Server: `routes/instance/upload.ts` (TUS protocol, in-memory upload map, the
deliberately-unauthenticated HEAD-via-GET quirk), `routes/instance/assets.ts`,
`db/instance/assets.ts`; client: `_uppy_file_upload.ts`,
`_file_upload_selector.tsx`, `components/instance/instance_assets.tsx`;
lib: `types/assets.ts`.

## Contract

Files land in `ASSETS_DIR` via resumable TUS and are referenced by metadata
rows; the upload HEAD is intentionally unauthenticated (protocol resume).
Consumed by S6, S12, S13.

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, SYSTEMS.md §5)._

Seeded from the retired PLAN_GEOJSON_NEAR_TERM WS7-P2 (2026-07-06):

- **Upload size/type caps** — the client Uppy config restricts only
  `maxNumberOfFiles` (no `allowedFileTypes`/`maxFileSize`), and the server
  accepts any `Upload-Length` with no MIME/size check. Needs a per-file-type
  policy ruling first: these primitives also carry large dataset CSVs, so a
  blanket cap can't be picked from the geojson case alone.
- **TUS temp-file sweep** — orphan cleanup only walks the in-memory upload
  Map and only on a new POST; temp files from crashed uploads accumulate.
