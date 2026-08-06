# REPORT 1 — Adversarial review of the MCP-host pipeline (PLAN_305)

> **Date:** 2026-08-06 · **Repo:** `wb-fastr` @ `tim-branch` (HEAD `8c4535a4`) ·
> **Scope reviewed:** the whole PLAN_305 pipeline as-built — the `lib/ai_tools`
> shared-factory migration, the `lib/server_actions` move, the `/pat` auth
> mount, and the thin MCP host (`mcp_host/`). · **Method:** four independent
> adversarial agents, each on a non-overlapping lens, read-only, verified every
> claim against code/commands, plus a run of `./validate_migrations` (temporary
> Postgres container). Actionable findings were re-verified by hand. **No code
> was edited.** Pre-migration baseline for parity diffs: commit `1392c86c`.

## Verdict

The pipeline is sound. **One genuine runtime bug** (`get_info` 401 on the host),
**one broken repo gate** (`validate_migrations` fails — the PAT base-schema gap),
**two minor cosmetic/edge issues**, and **two architectural facts worth
recording as explicit doctrine**. Everything else — factory-migration parity,
`/pat` security, and the serverActions→lib cross-tier move — verified clean.

---

## Findings

### F1 — `get_info` fails at runtime on the MCP host (401) — REAL BUG

**Severity: high (host-specific; a tool the prompt actively recommends).**

`lib/ai_tools/tools_info.ts:43-48` — the topic-content branch fetches with no
auth header:

```ts
const base = typeof document === "undefined"
  ? getServerActionTransport().baseUrl   // = "…/pat" on the host
  : "";
const response = await fetch(`${base}/info/${match.topic}.md`, {
  cache: "no-cache",
});
```

On the host the transport `baseUrl` ends in `/pat` (`mcp_host/main.ts:51`) and
the Bearer token is applied **only** via `transport.getHeaders()`
(`mcp_host/main.ts:58`), which this raw `fetch` bypasses. The `/pat` mount runs
`patAuthMiddleware` on `*` (`main.ts:191`), which returns **401** for any request
without `Authorization: Bearer fastr_pat_…` (`server/middleware/auth.ts:36-38`).
So on the host, `get_info` with a topic id always throws
`Could not load info "<topic>" (401)`.

- **List mode** (no `topic`) is fine — it returns `INFO_TOPICS` without fetching.
- **The SPA is unaffected** — there `base=""`, so it hits the same-origin static
  `/info/*.md` with no auth requirement.
- **Why it matters:** the host's `INSTRUCTIONS` (`mcp_host/main.ts:119`) and the
  `get_info` description both tell the model to load a topic before building
  domain-specific reports (e.g. `iceh` before an equity profile), so this path
  is exercised, not incidental.
- **Verified by hand** (not just the agent): `baseUrl` ends in `/pat`; Bearer
  only via `getHeaders()`; `patApp.use("*", patAuthMiddleware)` covers the
  `/info` handler at `main.ts:233`.

**Proposed fix (one line, pick one):**

1. **Apply the transport headers to the fetch** (smallest, most faithful):
   ```ts
   const t = getServerActionTransport();
   const base = typeof document === "undefined" ? t.baseUrl : "";
   const response = await fetch(`${base}/info/${match.topic}.md`, {
     cache: "no-cache",
     headers: typeof document === "undefined" ? t.getHeaders() : undefined,
     credentials: typeof document === "undefined" ? t.credentials : "include",
   });
   ```
   The `/info/*.md` route is already on the PAT allowlist
   (`server/middleware/pat_allowlist.ts`), so an authenticated request succeeds.
2. Route `/info` content through a serverAction (heavier — needs a registry
   route; overkill for a static file).

Recommend option 1. It is a genuine additive fix, not a behavior change to any
existing surface, but it touches shared `lib/ai_tools` code — apply and then
re-run `deno task typecheck` + a host smoke test before considering it closed.

### F2 — `get_metric_data` completion label frozen at "Retrieved 0 metric(s)" — COSMETIC

**Severity: low (status-label only).**

`lib/ai_tools/tools_metrics.ts:39`: `completionMessage: \`Retrieved
${metrics.length} metric(s)\`` is an eager template evaluated when the factory
runs. The host builds its tool list **once at boot** (`mcp_host/main.ts:74-103`),
before hydration, when `metrics` is `[]` — so the label is permanently
"Retrieved 0 metric(s)". The handler reads `metrics` live and returns correct
data; only the status line is wrong. The SPA is unaffected (it rebuilds tools
reactively after state loads).

**Proposed fix (optional):** make `completionMessage` a thunk
(`() => \`Retrieved ${metrics.length} metric(s)\``) so it reads the (mutated-
in-place) array at call time. Cosmetic; fine to leave.

### F3 — Hydration-retry leaks SSE subscriptions — EDGE CASE

**Severity: low (retry path only; no data corruption).**

If `ready()` throws (e.g. the 30 s hydration timeout in
`mcp_host/sse_hydration.ts:145`), panther clears `readyMemo`
(`panther/_112_ai_tool_core/mcp_server.ts:346-353`) and the next `tools/call`
re-invokes `ready()` → `hydrateHeadlessState()` opens a **second** pair of
`runStreamForever` subscriptions (`sse_hydration.ts:123-136`) without cancelling
the first (which loops forever, only rejecting after 3 consecutive connect
failures). Result: duplicate subscriptions double-applying the in-place snapshot
mutations. The mutations are idempotent for `starting`/array payloads, so it is
a connection leak, not corruption.

**Proposed fix (optional):** guard `hydrateHeadlessState` so a second call
reuses/awaits the in-flight hydration instead of starting a new pair, or make
the readers cancellable and tear the first pair down on retry. Edge case; fine
to leave for now.

### F4 — `validate_migrations` fails: PAT table missing from the base schema — BROKEN GATE

**Severity: medium (repo gate is red; latent fresh-init risk).**

`./validate_migrations` (spins up a throwaway Postgres, applies the base schema,
runs every migration, and asserts the schema is unchanged — i.e. migrations are
idempotent no-ops because the base schema already reflects them) **FAILS** on the
instance database. The sole diff is `personal_access_tokens`:

```
Instance schema changed on fresh DB: not idempotent.
> CREATE TABLE public.personal_access_tokens ( … )
> CREATE INDEX idx_personal_access_tokens_user_email …
> ALTER TABLE ONLY public.personal_access_tokens ADD CONSTRAINT … FOREIGN KEY (user_email) …
> …(sequence / identity / columns)…
```

Root cause: migration `server/db/migrations/instance/073_personal_access_tokens.sql`
(added in commit `2b9fb449`, the PAT auth seam — a PLAN_305 prerequisite)
creates the `personal_access_tokens` table + index, but the base schema
`server/db/instance/_main_database.sql` was **never updated to match**. Verified
this is the lone gap: 073 is the last instance migration, and migration 072's
table (`iceh_import_runs`) *is* present in the base schema (so the base tracks
every migration through 072 — only 073 was missed).

- **Not a data-safety bug in practice:** the migration uses `CREATE TABLE IF NOT
  EXISTS` / `CREATE INDEX IF NOT EXISTS`, so it applies cleanly to any real DB,
  and real instances always run migrations after the base schema. The live
  `/pat` auth path works (the smoke tests in this report exercised it).
- **What is actually broken:** (a) the `validate_migrations` gate is red and will
  stay red until the base schema is synced, masking any *future* migration
  regression; (b) latent — a fresh instance initialized from `_main_database.sql`
  **without** running migrations would lack the PAT table.

**Proposed fix:** fold the table + index into
`server/db/instance/_main_database.sql`, in the same hand-written DDL style the
base schema already uses for peer tables (e.g. `iceh_import_runs`):

```sql
CREATE TABLE personal_access_tokens (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_personal_access_tokens_user_email
  ON personal_access_tokens (user_email);
```

Then re-run `./validate_migrations` and confirm it passes (before == after).

---

## Architectural facts to record as doctrine (not bugs)

### D1 — There is NO compiler-enforced browser-free boundary in `lib/`

The ruling's premise that "a browser dependency creeping into a shared factory
breaks the server typecheck loudly" is **refuted**. The server graph compiles
with the TypeScript `dom` lib (`deno.json` → `"lib": ["esnext", "dom",
"dom.iterable", "deno.ns"]`), so a `document`/`window` reference in a `lib/` file
type-checks clean under `deno check main.ts`. Verified with a throwaway probe: a
`document.title` reference passes with the repo config and only fails under a
dom-less lib set.

The boundary is held today by **convention + a runtime guard**
(`typeof document === "undefined"` in `tools_info.ts`, and never reading browser
globals at module scope), not by the compiler. If mechanical enforcement is
wanted, it needs a separate `deno check` of `lib/` under a dom-less lib set or a
lint rule — `deno check main.ts` will not catch it.

### D2 — The transport singleton is now writable from the server tier

`lib/server_actions/transport.ts` holds `_transport` as a module-global mutable
singleton, and because `lib/mod.ts` is compiled into the Deno app server,
`setServerActionTransport` is now *callable* from server code. Nothing does so
today (only callers: the SPA shell `client/src/components/LoggedInWrapper.tsx:40`
and the out-of-process `mcp_host/main.ts:55`). The confused-deputy risk is
latent, not present.

**Invariant to hold (and it is true today):** only the SPA shell and
out-of-process headless hosts ever register a transport or invoke a
serverAction / tool handler. In-process app-server code (`main.ts` graph) must
never call `setServerActionTransport`, `createAllServerActions`, or a tool
factory's handler. Not mechanically enforced (see D1) — treat as a documented
invariant.

---

## Verified clean (each independently, not assumed)

**Factory-migration parity (baseline `1392c86c`).** All 16 shared factories
(`lib/ai_tools/tools_*.ts`, `tools_get_slide.ts`) reproduce the deleted client
originals exactly — name, description, `inputSchema`, `kind`/`headless`/
`approval` metadata, handler logic, and error text — differing only by
`AIToolEnv` injection, name/path rewrites, and `deno fmt` reflow. All moved
shaping files (the 625-line `format_metric_data_for_ai.ts`, the list formatters,
`content_validators.ts`, `format_figure_config_for_ai.ts`,
`format_visualization_data_for_ai.ts`, `extract_blocks_from_layout.ts`,
`layout_spec_helpers.ts`) are logic-identical. `client_env.getItems` reproduces
the exact `_PO_ITEMS_CACHE` get→miss→enqueue→setPromise→await dance with the
same cache key (no `firstPeriodOption` in the key). The 5 client shims preserve
historical signatures. Full `deno task typecheck` (server + client +
lint:systems) passes.

**`/pat` auth & security.** The deny-by-default allowlist matcher
(`server/middleware/pat_allowlist.ts`) was run against all 283 registry routes:
**0 leaks, 0 self-misses**. Adversarial angles all safe — `^…$`-anchored regex,
`[^/]+` params cannot span `/`, boundary-lookahead prefix strip, method checks
enforced, allowlist and Hono read the same raw path so they cannot disagree.
Token mint/list/revoke and user/admin routes are absent from the allowlist and
confirmed unreachable. Cookie mount rejects PATs (`authMiddleware` is Clerk-only;
`patAuthEmail` is set only under `patApp`). `/pat` gets no CORS headers (both
global guards short-circuit via `isPatPath`). `/info` cannot traverse
(`[A-Za-z0-9_-]+\.md` param + allowlist raw pattern; `%`-encoded traversal fails
the class) and returns 404, never the SPA fallback. SSE routes resolve the real
per-user identity via `getGlobalUser`'s PAT branch. The name-poisoning fix is
double-guarded (`|| null` at `users.ts:51` plus `first_name IS NULL` in
`syncUserName`); the `?? ""` coercion in `buildGlobalUserFromDb` bites no
consumer. **Design notes (not vulns):** PATs never expire (manual revocation
only; 192-bit random, SHA-256-hashed, hash-equality lookup — no timing/enum
oracle); `cacheMiddleware` nominally covers `/pat` but emits no cache headers for
those paths.

**serverActions→lib cross-tier move.** Transport singleton starts `null`;
`createAllServerActions()` builds closures only (no network at construction) and
is invoked at module scope **only** off-server (SPA `index.ts`, out-of-process
`mcp_host/main.ts`) — never in the server graph. The "transport not configured"
throw is unreachable from server code. `import.meta.env.DEV` (replacing the old
`process.env.NODE_ENV`) degrades to `false` under Deno without throwing (proven
by `deno eval` of the exact expression); behavior correct in Vite dev (true),
Vite prod (false), and Deno (false). **Zero** new npm dependencies entered the
server graph (`ai_tools` pulls only `zod` + panther `_112_ai_tool_core`, both
already server deps; the Solid import in the deps chain is type-only). Boot-cost
delta is a one-time parse of zod tool schemas + pure factory defs.
`deno check main.ts` passes.

**Thin MCP host runtime.** `mcp_host/env.ts` conforms to `AIToolEnv`
(compiler-enforced; `deno check mcp_host/main.ts` passes) and each getter
delegates to the same serverAction the SPA's cache-miss path uses. Snapshot
hydration is complete — the two SSE `starting` frames carry every field the
factories read (`metrics`, `projectModules`, `icehIndicators`, `hfaTaxonomy`,
`visualizations`, `slideDecks`, `reports`, `attachedRunId`, `adminAreaLabels`,
`facilityColumns`), and the aliasing contract holds because handlers read the
captured arrays lazily and `applyProjectFields` mutates them in place. The
readiness gate blocks the first `tools/call` and the orientation read on
`ready()`. `tryCatchServer` returns the parsed envelope (never treats HTTP 200 as
success on its own), so a status-200 `{success:false}` `onError` body is
correctly surfaced as a failure. Every serverAction the host calls is on the PAT
allowlist. Grounding imports nothing from `client/src`; `create_report`'s
approval flows through the MCP elicit path; all 16 registered tools are
`headless:true` (none silently dropped).

---

## Recommended next actions

1. **Fix F1** (`get_info` 401) — option 1 above; re-run `deno task typecheck` +
   a host smoke test.
2. **Fix F4** (sync the PAT table into `_main_database.sql`) — restores the
   `validate_migrations` gate to green and closes the fresh-init gap.
3. Optionally fix F2 (thunk the completion label) and F3 (dedupe hydration on
   retry) — both low-priority.
4. Record D1 and D2 as explicit doctrine wherever the tier boundary and the
   transport seam are documented (e.g. the SYSTEM manifest / protocol docs that
   already describe the transport seam).
