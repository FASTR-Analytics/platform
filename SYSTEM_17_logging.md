---
system: 17
name: Activity Logging & Audit Trail
globs:
  - server/middleware/logging.ts
  - server/db/instance/user_logs.ts
docs_absorbed:
---

# S17: Activity Logging & Audit Trail

Who did what, when, on which instance. Two tables in the main DB (`user_logs`
raw, `user_logs_aggregate` weekly roll-up), two writers (the per-route `log()`
middleware and S16's edit-session hook), one retention cron, and a read surface
that spans the instance Users tab, S15's unauthenticated health endpoints, and
the external Admin-Website. Tiny code surface, two files, but fleet-wide data:
the Admin-Website's activity analytics are built entirely on these rows.

## Write path 1: the `log()` middleware

[server/middleware/logging.ts](server/middleware/logging.ts) exports
`log(routeName)`, applied per-route between the permission guard and the handler
(so only authorized requests write rows). Mechanics:

- Captures the JSON body for POST/PUT/PATCH/DELETE (Content-Type-gated:
  `application/json` or empty), redacting `password`/`secret`/`token`/`apikey`
  keys recursively. Credential fields must never reach `user_logs`, since rows
  are retained for the raw window and readable through S15's unauthenticated
  health endpoints.
- After the handler: writes one row via `AddLog` with the route name, result
  status (`"500"` if the handler threw; the error is re-thrown after), params,
  headers minus `authorization`/`cookie`, and the body, with a two-rung 64 KiB
  truncation ladder (first the body collapses to `{ _truncated, bytes }`, then
  the whole details blob).
- A row is written only for an approved user (`globalUser.approved === true`),
  under their email: the `user_logs` FK needs a users row. An unapproved
  caller and a machine call (no `globalUser`, the status-key paths) write
  nothing; `renameUserEmail` writes its own audit row in its transaction.
- Fire-and-forget (`.catch(() => {})`) and the whole middleware body is wrapped
  in try/catch: logging must never break a response.

## Write path 2: collab edit sessions

S16's `createVersionTracker` `onSessionEnd` hook
([version_capture.ts](server/collab/version_capture.ts)) writes one row per
(session × editor) with endpoint `reportEditSession` / `deckEditSession`,
details `{ docId }`, skipping `H_USERS` so counts reflect country usage only.
These rows ride the same retention/aggregation as route rows and feed the
Admin-Website document-activity views.

## Storage & retention

[server/db/instance/user_logs.ts](server/db/instance/user_logs.ts).
`DeleteOldLogs` (boot + 24 h cron, wired in `main.ts`) transactionally rolls
rows older than 7 days into `user_logs_aggregate`, keyed
`(user_email, endpoint, endpoint_result, week_start)` (the
`idx_user_logs_aggregate_unique` index) with additive `ON CONFLICT` counts, then
deletes the raw rows. **Exception: `getCurrentUser` rows are never aggregated
and never deleted**. They are the forever-retained sign-in trail behind "last
active", the health endpoints, and every Admin-Website activity chart. Never
remove that exemption and never de-log the `getCurrentUser` route.

## Readers

- `getUsersLastActive` (instance `can_view_logs`): the latest raw row per user,
  one `GROUP BY user_email` query, for the Users tab's "Last active" column
  (`users/users.tsx`). No route returns a row's `details`; only the health
  endpoints below read them.
- S15's unauthenticated health endpoints (`server/routes/instance/health.ts`):
  `/user_logs` (getCurrentUser trail), `/user_logs_all`, `/user_logs_aggregate`,
  plus `/health_check` and `/user_activity` derived views. S15 owns the file;
  S17 is a mandatory reader of the queries.
- Admin-Website (separate repo) fetches the health endpoints per instance (and
  via its `/all/:endpoint` aggregate proxy) for sign-in heatmaps,
  currently-active users, and per-user activity. Its ServerActivityModal counts
  every non-`getCurrentUser` row as "user activity", so logging noise directly
  inflates the fleet's activity metrics.

## Coverage conventions

`log()` is **not** applied to every route (187 call sites across the 243
registry routes and the raw ones): coverage is a
deliberate audit-value judgment, re-baselined against fleet-wide volume data
(all-history aggregate across 35 instances):

- **Logged**: instance-level admin/config/data mutations, dataset import steps,
  user/permission changes, the HFA time-point and prompt library writes, and
  audit-worthy product events (product
  create/duplicate/delete/rename, package and scope changes, folder
  create/update/delete and moves, slide create/move/delete/duplicate/copy, deck
  and report config updates, version restore/copy).
- **Deliberately unlogged**: product reads (`getSlides`, `getReportDetail`,
  version lists, …) and high-frequency editor autosaves (`updateSlide`,
  `updateReportBody`, …: edit activity comes from the S16
  session rows instead).
- **Never log a client poll loop or per-render fetch.** That audit found 85% of
  all rows ever written came from a handful of these (`getDatasetUploadStatus`
  alone was 44%); logging was removed from `getDatasetUploadStatus`,
  `getDatasetHmisImportRuns`, the raw geojson serving
  route, `getDatasetUpload`, `getDatasetHfaUploadStatus`. When adding a
  status/poll route, do not attach `log()`.

## Open items

- Logged routes with zero rows ever across the fleet (client never calls them):
  `searchDhis2Indicators`, `searchDhis2DataElements`. Candidates for route
  removal, not just log removal.
