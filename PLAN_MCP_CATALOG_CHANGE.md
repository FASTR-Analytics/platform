# PLAN — /mcp catalog change: source header on package-tool results, real serverInfo.version

Status: planned 2026-08-19, reviewed (external review adopted: no run id in
the header; `runWithView` unconditional; `mcp_probe --info`), not built.
Companion: panther `PLAN_MCP_CATALOG_CHANGE_HYGIENE.md` (unknown-tool message
+ per-request log). Changes 1, 2 and 4 do not depend on it; only the SYSTEM_13
log pointer and the `get_projects` probe assertion do — sequence panther →
`./sync` → this plan, but the app changes are not blocked on it. Delete this
file when both changes are committed and SYSTEM_13 carries the ruling.

## Facts (verified in code, 2026-08-19)

- The `/mcp` catalog committed 2026-08-19 (2654d5b7) is 10 read-only tools
  over the instance's pinned package, no `projectId`. Production still runs
  the previous 18-tool catalog (`get_projects`, `create_report`,
  visualization/slide-deck/report tools, `projectId` on every call) until
  deploy.
- Panther refuses tool schemas that reject unknown keys
  (`tool_helpers.ts` `assertSchemaAcceptsUnknownKeys`) and parses with plain
  `schema.parse` (z.object strips). So a call carrying an extra `projectId`
  to a retained tool parses and runs.
- No package-tool result names the package it read: `getMetricDataForAI`
  ([format_metric_data_for_ai.ts](lib/ai_tools/format_metric_data_for_ai.ts))
  and the module tools ([tools_modules.ts](lib/ai_tools/tools_modules.ts))
  return content only. `get_orientation` does name it
  ([mcp_tools.ts](server/mcp/mcp_tools.ts): `**Name:**` / `**Generated:**`).
- The pin is read per call (`requirePinnedPackageContext` →
  `resolvePinnedRunId` → `resolvePackageContext`), so the run behind two
  calls in one conversation can differ.
- `serverInfo.version` is the literal `"1.0.0"`
  ([mcp_endpoint.ts:39](server/mcp/mcp_endpoint.ts#L39)); `_SERVER_VERSION`
  is a required env at boot ([exposed_env_vars.ts:313](server/exposed_env_vars.ts#L313))
  and `mcp_endpoint.ts` already imports from that module.
- Package tools are boot-time templates bound per call with panther's
  `bindAITool(template, resolve)`; `resolve` returns the session tool from
  `ctx.sessionTools`, built once per (token, runId) in
  `resolvePackageContext` ([context_cache.ts](server/mcp/context_cache.ts)).
  A tool is `{ sdkTool: { name, description, input_schema, parse?, run,
  runWithView? }, metadata }`; `bindAITool` invokes `inner.sdkTool.runWithView`
  when present, else `run`.

## Problem

1. A conversation that listed the old catalog can call
   `get_metric_data({ projectId: X, metricId, … })`; it succeeds against the
   pinned package and the model presents the answer as project X's. More
   generally: no data result at `/mcp` says which package it came from, and
   the package can change under a conversation (pin-move) — equally
   invisible.
2. After a deploy, whatever a client learns about the server on its next
   handshake says `1.0.0` regardless of what is deployed.

Neither fix accommodates the old catalog — no shims for removed tools, no
`projectId` handling. Both are how the surface should behave for every future
catalog change and every pin-move.

## Rulings

- Every package-tool result at `/mcp` starts with one provenance line, then a
  blank line:
  `Source: results package "<run.label>" (generated <run.createdAt>)`
  No run id: ids are UUIDs no tool accepts as input, so they are noise to
  the model; label + generated timestamp is how `get_orientation` already
  identifies the package. Applies to the 6 package tools (`get_available_metrics`, `get_metric_data`,
  `get_available_modules`, `get_module_r_script`, `get_module_log`,
  `get_module_settings`). Not to `get_orientation` (already names it) nor to
  the methodology-docs and `get_info` tools (package-independent).
- Placement: `resolvePackageContext`, where run and tools meet — the session
  tools of a package context are self-identifying by construction. Not
  `lib/ai_tools` (the shared tools stay surface-agnostic; the SPA shows the
  attached package in its own chrome). `mcp_tools.ts` is unchanged.
- Failures (`AIToolFailure` and other throws) pass through unchanged — the
  header is only on success text.
- `serverInfo.version` = `_SERVER_VERSION`.

## Changes

### 1. [context_cache.ts](server/mcp/context_cache.ts) — wrap `sessionTools`

A local `withSourceHeader(tool, run): AIToolWithMetadata` returning
`{ metadata: tool.metadata, sdkTool: { ...tool.sdkTool, run, runWithView } }`
where `run`/`runWithView` call the originals and prepend the header
(both defined unconditionally — every session tool is `createAITool`-built and
always has both; `runWithView` delegates with the same `getView`). Applied to
every element of `sessionTools` before the context is cached. `buildToolCatalog(ctx.sessionTools)` in `get_orientation` reads only
name/description, unaffected.

### 2. [mcp_endpoint.ts](server/mcp/mcp_endpoint.ts) — `version: _SERVER_VERSION`

Import alongside `_BYPASS_AUTH`. Hygiene only (`Implementation.version` is
what the MCP spec provides for this; `_SERVER_VERSION` is already the deployed
version elsewhere — `serverVersion` in instance.ts, `appVersion` in the run
manifest). It does not cause any client to re-list; nothing may imply it does.

### 3. [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) — principle 2

After "orientation answers without a pin" in the `/mcp` sentence, add: the
catalog is fixed per process and clients see a change only when they re-list
(a chat client: new conversation); the server does not advertise
`listChanged` (panther ruling, DOC_AI_CHAT §Headless tools); every
package-tool result carries a `Source:` line naming the run it read;
`serverInfo.version` reports the deployed server version; panther's
per-request `[panther mcp] fastr: <era> <method> …` log is how a client's
re-list behaviour is observed. Add the new test file to the S13 manifest.

### 4. [mcp_probe](mcp_probe) — `--info` mode; current examples

- `./mcp_probe <origin> --info` prints the `initialize` result (`serverInfo`,
  `capabilities`, `instructions`). Today the response is captured only for
  the session id and HTTP code, so `serverInfo.version` is unobservable
  through the probe.
- Usage examples (header lines 26-28) still show `get_projects` and
  `get_orientation '{"projectId":…}'` — replace with the current catalog
  (`--info`, `get_orientation`, `get_available_metrics`).

## Verification

- `deno task typecheck` (includes `lint:systems`).
- `server/tests/mcp_tools_source_header_test.ts`: build a
  `withSourceHeader`-wrapped tool over a stub whose `run` returns `"body"`;
  assert output starts with the `Source:` line built from a stub
  `RunListingItem` and ends with `"body"`; a stub that throws `AIToolFailure`
  propagates the same error, no header. (`withSourceHeader` exported for the
  test.)
- `./mcp_probe local --info` → `serverInfo.version` equals `SERVER_VERSION`;
  `./mcp_probe local get_available_metrics` → first line is `Source: …`;
  `./mcp_probe local get_projects` → `-32602` with panther's message (only
  after the panther sync; before it, the pre-existing `Unknown tool:
  get_projects`).
