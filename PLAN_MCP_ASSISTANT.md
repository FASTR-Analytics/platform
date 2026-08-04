# PLAN: MCP server for the project AI Assistant

Status: NOT STARTED — design plan, written 2026-08-05.

Goal: let an external MCP client (Claude Code CLI, etc.) operate a project as
the AI Assistant — same curated tool surface, same grounding — without a
browser session.

## Verified facts this plan builds on

- Every registered tool already carries `sdkTool: { name, description,
  input_schema (JSON schema), run(input) → Promise<string> }`
  (`panther/modules/_305_ai/_core/tool_helpers.ts`). This is exactly the MCP
  tool contract — conversion is mechanical.
- The full project tool list is assembled in one place:
  `buildToolsForContext` (client/src/components/project_ai/build_tools.ts).
- Handlers close over `projectState` (Solid store) and call serverActions.
  No tool handler touches `document`/`window` — solid-js stores run fine
  headless.
- Token acquisition lives in exactly two files:
  client/src/server_actions/create_server_action.ts:53 and
  try_catch_server.ts:35 (`clerk.session?.getToken()`).
- Hydration: the SPA gets its full initial `ProjectState` from the project
  SSE `starting` message (server/routes/project/project-sse-v2.ts, applied by
  `applyProjectSseMessage` in client/src/state/project/t1_store.ts). The SSE
  connects with `withCredentials` (cookie auth).
- `_305_ai` is exported ONLY from `mod.ui.ts`, and the tool files are `.tsx`
  with Solid display components — a headless host cannot be a plain Deno
  entry; it must be bundled with the client's Vite/babel-solid pipeline.

## Architecture (decided)

Headless client host: a Vite-bundled entry that imports
`buildToolsForContext` + a hydration shim, and serves MCP over stdio. The
bundle runs under Deno (node compat is not needed if the stdio loop is
hand-rolled). Display components compile but never render.

Rejected alternatives, recorded so they aren't relitigated:

- Server-side MCP endpoint in Hono: requires hoisting the tool layer out of
  client/ or duplicating it against DB functions — fights the deliberate
  design where handlers alias client state.
- Browser bridge (relay tool calls into a live tab): only way to get
  view-gated editor tools + navigation, but fragile and session-dependent.
  Explicitly OUT OF SCOPE; revisit as a later layer if CLI editing of open
  documents becomes a real need.

## Open decisions (settle before Phase 0)

1. **Credential.** Nothing headless-capable exists today. Options:
   (a) Clerk machine/M2M token, (b) server-minted per-instance API key
   (env var, like the existing special modes in SYSTEM_01). Whichever is
   chosen must work for BOTH serverActions fetches (Authorization header)
   and the SSE route (currently cookie-auth'd; headless needs a
   header-based or token-param path, likely a fetch-based SSE reader).
2. **MCP protocol implementation.** Hand-rolled minimal stdio JSON-RPC loop
   (initialize / tools/list / tools/call / prompts/list / prompts/get —
   small, no dependency) vs `@modelcontextprotocol/sdk`. Lean hand-rolled
   per the minimize-dependencies rule; the SDK is the fallback if protocol
   drift becomes a maintenance tax. Hand-rolled is also what lets the whole
   MCP layer live in panther with zero added dependencies.

## Encapsulation boundary (the ruling)

Panther owns everything MCP-shaped and app-agnostic: tool→MCP conversion,
metadata-driven filtering, approval delegation, error funnel, the JSON-RPC
protocol loop, stdio transport, prompt/resource plumbing. Reusable by any
app with a _305_ai tool registry.

wb-fastr owns only what is irreducibly app-specific: which tools exist
(buildToolsForContext), the system prompt / catalog / docs content, project
state hydration (SSE + projectState), the credential + auth seam, and the
Vite build config. The app-side entry should read as ~50 lines of
composition with zero protocol code.

## Phases

### Phase 0 — auth seam (wb-fastr, server + client)

- Implement the chosen credential; add header-based auth acceptance where
  needed (serverActions routes already read Authorization; verify SSE).
- Client side: inject a token provider into the two serverActions files so
  the browser path (`clerk.session.getToken()`) and the headless path (static
  credential) share the call sites. No behavior change for the SPA.

### Phase 1 — panther MCP module (panther repo, then ./sync)

Panther owns the ENTIRE MCP layer — adapter, protocol, transport. The app
contributes only data (tools, strings) and environment (auth, hydration).
New export in `_305_ai` (UI barrel is fine — the host is Vite-bundled;
`Deno.stdin`/`stdout` access is runtime-guarded so the barrel stays
browser-safe):

- `createMCPServer(config)` where config is
  `{ name, version, tools, prompts?, resources?, approvalMode }`:
  - **Tool conversion**: walks the same `AIToolWithMetadata[]` the chat
    takes; `sdkTool` maps 1:1 to MCP tool defs.
  - **Filtering** (inside panther, driven by metadata already on the
    tools): drops `availableIn`-gated tools (no views headless), the
    navigation tool (`attributesNavigation`), `awaitsUserAction` tools
    (ask_user_questions).
  - **Approval**: `approvalMode: "delegate"` runs propose+apply as one
    step — the MCP client's own permission prompt is the approval. No
    silent default.
  - **Error funnel**: `run()` failures become MCP tool errors, never
    process crashes.
  - **Prompts/resources**: generic pass-through surface — the app hands
    strings/providers, panther speaks the protocol.
- `.serveStdio()`: hand-rolled JSON-RPC loop (initialize, tools/list,
  tools/call, prompts/list, prompts/get, resources/list, resources/read).
  Transport-agnostic core so an HTTP binding can be added later without
  touching consumers.

### Phase 2 — headless host (wb-fastr, thin composition only)

The app-side entry is deliberately minimal — everything in it is stuff that
CANNOT move to panther (app tools, app state, app auth):

- Entry `client/src/headless_mcp/main.ts` (inside client/ so `~` and
  `"panther"` aliases resolve), bundled via a second Vite config;
  `deno task build:mcp`.
- Hydration: connect to `project_sse_v2/{projectId}` with the headless
  credential, apply the `starting` message via `applyProjectSseMessage`,
  and keep the SSE subscription for the process lifetime — handlers alias
  `projectState`, so staleness between calls is otherwise real (and
  `getToolsForModules` resolves `attachedRunId` at call time through the
  store).
- Then a single composition call:
  `createMCPServer({ tools: buildToolsForContext(...), prompts: ...,
  resources: ... }).serveStdio()`. Project id + credential from argv/env.
  Registered with `claude mcp add` as a stdio server.

### Phase 3 — grounding parity (app data, panther plumbing)

- Hand `buildSystemPromptForContext` output to panther's prompt surface and
  the tool catalog + methodology docs to its resource surface. This is what
  makes the CLI agent "the AI Assistant" rather than a bag of endpoints.
  The no-view catalog is already byte-stable (index.tsx CACHE RULE), so the
  prompt is computable headless. No protocol code in the app.

## Verification

- Probe script speaking stdio JSON-RPC: initialize, tools/list (assert the
  filtered set — no navigation/ask_user_questions/view-gated tools), then
  one read tool and one write tool against a disposable fixture
  (create + delete; never a real row).
- Live check: `claude mcp add` the host against the dev instance and drive
  one end-to-end assistant task from the CLI.

## Non-goals

- View-gated editor tools, navigation, ask_user_questions (browser bridge
  territory).
- Multi-project routing in one server process — one process per project id
  first.
