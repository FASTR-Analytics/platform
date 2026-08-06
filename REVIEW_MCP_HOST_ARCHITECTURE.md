# REVIEW: How should the wb-fastr MCP server host the AI-Assistant tools?

> **Purpose (2026-08-06):** An architectural disagreement needs independent
> adjudication before implementation continues. You (the reviewing agent) are
> asked to rule on the question below on its merits. You were not involved in
> the prior work; do not defer to either position. Verify every factual claim in
> this file against the code and plans it cites before relying on it. Deliver a
> written ruling (see §Deliverable) and change no code.

## The question

The wb-fastr app ("FASTR") is exposing its in-app AI assistant over MCP so
external MCP clients (Claude Code CLI) can operate the app. The AI assistant's
tools live in the SPA client code
(`client/src/components/project_ai/ai_tools/tools/*`, built by
`client/src/components/project_ai/build_tools.ts`), written with panther's
`createAITool`, and run today inside the browser.

**How should the MCP server execute those tools?** The candidates:

- **A. Headless host (the current plan's design).** A standalone Deno process,
  spawned by the MCP client over stdio, imports the _same tool source code_ the
  SPA uses and executes it headlessly. Auth is a per-user personal access token;
  app state is hydrated over SSE; browser-only APIs are guarded at source. The
  tool _code_ is shared; the tool _instances_ run in a separate process, not in
  the user's browser session.
- **B. Browser bridge.** The MCP stdio process is a thin relay: each
  `tools/call` is forwarded into a live, logged-in browser tab (WebSocket or
  similar), where the _already-running_ tool instances execute with the real
  session, live view state, and collab presence. The tools run truly "in the
  client"; the MCP process holds no app logic.
- **C. Thin fresh host.** A small spawned stdio process that does NOT import the
  SPA graph at all: its ~16 tools are authored fresh as plain HTTP calls against
  the existing API (PAT auth via the committed transport seam), with
  schemas/descriptions and any shared shaping logic living in `lib/` — the tier
  already compiled into BOTH the Deno server and the Vite client, i.e. the app's
  existing no-duplication mechanism. No Solid, no T1 stores, no SSE hydration,
  no browser-API guards, no special bundle (plain `deno run`). Cost: a second
  tool registry that can drift from the chat's, and the empirical crux below.
- **D. Anything better you identify.** Examples worth considering: an MCP
  endpoint served by the app's own Deno server (`main.ts`) rather than a spawned
  process; a Node-hosted bundle; hybrid designs. If you rule for a variant not
  listed, specify it concretely.

**C's reuse ceiling (verify, then price C with it):** C need not mean duplicated
tool definitions. `lib/` compiles into both tiers, and the committed transport
seam removed `create_server_action.ts`'s browser coupling (its one residual
client import is the connection-monitor hook — check whether that is
injectable). If the generated server-action layer moves to `lib/`, then (a) the
thin host gets the entire typed API client for free under a PAT transport, and
(b) most candidate tools become shared factories in `lib/` —
`(projectId, serverActions) => createAITool({...})` — one definition AND one
handler consumed by both the SPA chat and the MCP host, leaving only the
cache-backed reads needing injected data-getters (SPA injects cached getters,
host injects direct fetches). Prerequisite: panther must export the
tool-authoring core (`createAITool`, `AIToolFailure`) and `createMCPServer` from
`mod.deno.ts` as well as `mod.ui.ts` — verify `tool_helpers.ts` and the MCP core
are Solid-free at runtime (Solid appears there as type imports only) before
treating that as small.

**C's factory taxonomy (the answer to "but tools do client-side things"):** the
shared-factory model does NOT claim every tool is shareable. Verify this
three-way split against the tool inventory: (a) tools whose _purpose_ is the UI
— `switch_tab`, `show_draft_*`, and the 22 view-gated editor tools — stay
client-resident and simply are not on the MCP surface; (b) **approval is
surface-owned in panther, not client-side**: a plain-shape `propose` returns
`{preview, commit}` and the surface decides presentation — the SPA chat renders
its inline card, the MCP server renders an elicitation form and runs the same
commit on accept (verify in `panther/_305_ai/_core/mcp_server.ts`'s approval
driver; `create_report`'s new approval already works on both surfaces with zero
branching); (c) client side-effects inside otherwise-pure tools (`markAIEdit`
echo suppression, presence checks) become optional injected environment hooks —
the SPA passes the real callbacks, the headless host passes none. If you find a
candidate tool that does not fit this taxonomy, name it; that is evidence
against C.

**Empirical crux for C (measure it, don't guess):** how much data-shaping logic
do the heavier read tools carry _client-side_? Specifically trace
`get_metric_data` (`ai_tools/tools/metrics.tsx` → `getMetricDataForAI`,
`validateMetricInputs`, the PO-items cache) and `get_visualization_data`
(`visualizations.tsx` → `getPODetailFromCacheorFetch`, `getDataFromConfig`) down
to where the server's work ends and client assembly begins. If that assembly is
thin or cleanly movable to `lib/`, C is far simpler than A; if it is entangled
with the client figure pipeline (`generate_visualization/*`), C quietly grows
back into A — quantify which, with file-level evidence. The other ~13 candidate
tools are thin (serverActions call + pure formatter) per the tool inventory;
spot-check that claim too.

### The disagreement, honestly stated (including how it evolved)

- **The project owner's original position:** the entire point of the preceding
  panther work was that the MCP surface "simply uses the existing tools on the
  client." A design that requires a separate Deno process, a second Vite build
  config, SSR-compilation workarounds, source-level browser-API guards, and a
  parallel auth path looks like it has _not_ reused the client tools — it has
  built a second runtime environment around them. That complexity was not
  clearly surfaced or agreed to.
- **The implementing agent's position:** an MCP stdio server is definitionally a
  spawned local process; no MCP client can reach into a running SPA tab, so "the
  tools run somewhere headless" is forced the moment MCP is the transport.
  Design A does reuse the existing tools — the same source files and
  `createAITool` objects, zero forked tool code — and the plan
  (PLAN_305_MCP_SERVER.md in the panther repo) explicitly considered and
  rejected the browser bridge as "fragile and session-dependent." The Deno
  runtime, bundling, and guards are the cost of running browser-authored code in
  a process, not a parallel implementation.
- **Where the discussion has since landed (context, NOT a verdict):** in
  conversation, the owner accepted that a browserless MCP forces _some_ second
  environment, and — after the C reuse-ceiling and factory-taxonomy arguments
  below were laid out — described themselves as "beginning to be convinced"
  toward C. Treat that lean as an artifact of one persuasive conversation, not
  as evidence. Your job is specifically to check whether the pro-C argument
  survives contact with the code: if the empirical crux or anything else breaks
  it, rule against it without hesitation. Do not rubber-stamp the direction the
  discussion was drifting.

One framing from that discussion worth testing rather than accepting: "A's
complexity is permanent and implicit (guards spread through client state files,
an invisible second build any future module-scope browser API can break), while
C's is one-time and explicit (a lib/ refactor paid in the open)." Assess whether
that asymmetry is real — e.g. does C carry its own permanent implicit rule
("shared factories in lib/ must never grow a browser dependency"), and if so,
which rule is easier to enforce mechanically (note `lib/` is already compiled
into the Deno server today, so a browser dependency in lib/ breaks the server
typecheck loudly, while a browser dependency in the client tool graph breaks
only the MCP bundle)?

Adjudicate the substance, not the process complaint: the question is which
architecture is _right for this app going forward_, given what each actually
costs and delivers.

## Verified context (check these yourself)

1. **Panther capability (already shipped, not in question).** The panther repo
   (`/Users/timroberton/projects/panther/timroberton-panther`, synced copy in
   `wb-fastr/panther/`) provides `createMCPServer` in `_305_ai`: tool→MCP
   mapping, a `headless: true` opt-in contract on `createAITool`, approval over
   MCP via elicitation, a `ready` gate, stdio transport. See
   `panther/_305_ai/_core/mcp_server.ts`, `mcp_types.ts`, `tool_helpers.ts`, and
   the panther repo's `PLAN_305_MCP_SERVER.md` (design record, including the
   browser-bridge rejection under "Rejected alternatives" and the "Encapsulation
   boundary" section). Note the capability itself is transport-shaped around a
   _server process_; a browser bridge would use little of its protocol layer
   from inside the tab, or would need the relay process to speak MCP and the tab
   to speak something else.
2. **The tool population (verified 2026-08-06).** 42 tools; 22 are view-gated
   (live editor state, `availableIn` + `viewRegistry`), 20 ungated. The
   headless-eligible subset under design A is 15 reads + `create_report` (now
   approval-gated). The view-gated 22 — all slide/report/viz _editor_ tools —
   are structurally impossible headlessly (they operate on unsaved editor state)
   and are only reachable under design B or a future bridge.
3. **What design A has cost so far in wb-fastr** (judge the evidence, not the
   sunk cost; committed work is on `tim-branch`):
   - Committed: PAT auth seam (migration 073, middleware branch, `getGlobalUser`
     refactor, mint/list/revoke routes) + a client `server_actions/transport.ts`
     seam severing the Clerk import (commit 2b9fb449). Note: the PAT + transport
     seam is _also_ what any future headless automation (CLI, scheduled jobs)
     would use — assess how much of it is MCP-specific.
   - Committed: `headless: true` annotations + plain-shape approval on
     `create_report` (this piece is transport-agnostic and benefits the chat
     too, via the approval card).
   - Uncommitted working-tree changes: browser-API guards
     (`state/project/collab.ts` module-scope listeners,
     `state/t4_connection_monitor.ts` silent `navigator.onLine`,
     `state/_infra/reactive_cache.ts` IndexedDB degradation,
     `ai_tools/tools/info.ts` absolute base), a fetch-based SSE hydration reader
     (`client/src/headless_mcp/sse_hydration.ts`), the host entry
     (`client/src/headless_mcp/assistant.ts`), a second Vite config
     (`client/vite.config.mcp.ts`), and a `build:mcp` task in `deno.json`.
   - Open defect: the bundled artifact crashes at import because Solid's DOM
     runtime calls `delegateEvents(...)` → `window.document` at module scope;
     the attempted fix (Solid SSR compile in the MCP-only Vite config) does not
     build yet. Treat this as evidence about design A's fragility, and also
     assess how deep the remaining unknowns go (fonts/canvas were kept out of
     scope for v1 by restricting to reads + one write — check whether that
     restriction is load-bearing for A's viability).
4. **MCP transport facts.** Verify against the MCP spec (2025-11-25 era, as
   measured in the panther plan's Phase 0): stdio servers are spawned local
   processes; the client cannot connect to code running in a browser tab;
   Streamable HTTP exists as an alternative transport (which an app-server
   endpoint under design C could use, or local stdio could stay).
5. **The consumer's actual use case.** One user (the developer/owner), driving
   one project's assistant from Claude Code CLI against a dev or production
   instance. Not a multi-tenant fleet. Weigh robustness and maintenance
   accordingly — but also check `PROTOCOL_APP_AI_TOOLS.md`,
   `SYSTEM_13_ai_assistant.md`, and the tool handlers themselves so you
   understand what the tools genuinely need at runtime (server actions, reactive
   caches, T1 store hydration, collab presence for deck writes).

## Criteria for the ruling

Weigh at minimum:

- **Fidelity to "reuse the existing tools."** For each design: is the tool
  _code_ shared? Are the _running instances_ shared? Which of the 42 tools are
  reachable? Does the design fork or duplicate anything that will drift?
- **Robustness.** What breaks when: no tab is open / the tab sleeps or is
  backgrounded (B); the SPA adopts a new browser API at module scope (A); the
  app server redeploys (A, B, C). Who notices, and how loudly?
- **Security & auth.** A and C both use a real per-user PAT resolved server-side
  (the committed seam); B inherits the live session (broader: whatever the tab
  can do, the bridge can do — including the 22 editor tools); a D app-server
  endpoint would authenticate like any other route. Which failure modes are
  acceptable for a write-capable assistant?
- **Complexity honestly totaled.** A: second build config + runtime guards + SSE
  hydration + PAT (PAT arguably amortized). B: a relay process, a WebSocket
  control channel into the tab, tab-lifecycle management, reconnect/queue
  semantics, a way to launch or find the tab, and approval UX routed through a
  tab the user may not be looking at. C: a second tool registry (drift risk vs
  the chat's), the lib/ migration of shared shaping, and one panther delta
  (exporting `createMCPServer` from `mod.deno.ts` — the protocol core is pure
  TS, verify that claim in the packaging section of the panther plan). D
  (app-server endpoint): MCP protocol surface inside the production server, plus
  how the _client-authored_ tool code would even run there (the same headless
  problem, relocated). Count what each design still needs that does not exist
  yet.
- **The view-gated 22.** Only B reaches them. How much real value do they add
  for the CLI use case, given the chat already has them and the plan's v1 scope
  (reads + one gated write) was accepted as useful?
- **Precedent.** The panther plan records the bridge rejection and the
  "server-side MCP endpoint" rejection with reasons — engage with those reasons;
  overturn them explicitly if you disagree, don't ignore them.

## Deliverable

Write your ruling into this file (replace everything below the line you're
instructed to, or append a `## RULING` section) covering:

1. **The decision:** A, B, C, or a concrete D — stated in one sentence.
2. **Reasoning** against each criterion above, engaging the strongest version of
   the losing side (including the owner's "whole point" objection: say plainly
   whether the premise "MCP should use the existing tools on the client" is
   satisfied, satisfiable, or ill-posed under your ruling, and in what sense of
   "use").
3. **Consequences for the work in flight:** which committed pieces stand
   regardless (assess: PAT seam, transport seam, annotations, approval), which
   uncommitted pieces proceed / are discarded, and what the next three concrete
   steps are under your ruling.
4. **If you rule A:** settle the bundling sub-question (Vite SSR-compile vs
   Deno-native import map with jsx/CSS shims vs another mechanism), with the
   Solid `delegateEvents` crash accounted for.
5. **If you rule C:** report the empirical crux findings (the `get_metric_data`
   / `get_visualization_data` trace) with file-level evidence, and list exactly
   what moves to `lib/`.
6. **If you rule B or D:** scope the build honestly — enumerate the new moving
   parts and their failure modes at the same level of detail this file applies
   to A.

Do not soften the ruling to split the difference; pick one and defend it.

---

## RULING (2026-08-06)

### 1. Decision

**C — thin fresh host, in its shared-factory form**: a plain `deno run` stdio
process whose ~16 tools are `createAITool` factories living in `lib/`, consumed
identically by the SPA chat and the MCP host, with cache-backed reads taking
injected data-getters. A and B are rejected; D adds nothing C doesn't get
cheaply later (see §8 — once factories exist, a Streamable-HTTP endpoint is a
transport add, not an architecture).

### 2. The empirical crux (this decided it)

The pro-C argument survives contact with the code, decisively.

**`get_metric_data`**: the handler
(`client/src/components/project_ai/ai_tools/tools/metrics.tsx:36-47`) is
find-metric + validate + one call into
`ai_tools/tools/_internal/format_metric_data_for_ai.ts` (618 lines). That file
imports **only** `lib` types/helpers, panther's `AIToolFailure`, and exactly
three client items — `_PO_ITEMS_CACHE`, `serverActions`, `poItemsQueue` — all
confined to the single fetch site (lines 103–138). Everything else is pure:
fetchConfig assembly (58–101) over lib types, markdown/CSV pivoting (158–586)
over plain rows. The server does the aggregation (`getPresentationObjectItems`);
the client "assembly" is text formatting. **Zero imports from
`generate_visualization/*`.**

**`get_visualization_data`**: a 46-line wrapper
(`_internal/format_visualization_data_for_ai.ts`) — PO-detail cache-or-fetch,
then `getDataFromConfig` (pure config→query mapping via lib's
`getFiltersWithReplicant`), then the same formatter.
`getPODetailFromCacheorFetch` (`state/project/t2_presentation_objects.ts:301`)
is cache + `serverActions.getPresentationObjectDetail` only. The figure pipeline
(`buildFigureInputs`) is imported by that _file_ but used by a _different
export_ (`getPOFigureInputsFromCacheOrFetch`) not on this tool's path. The
feared entanglement does not exist.

**Inventory & taxonomy verified (2026-08-06)**: 41 `createAITool` +
`createAskUserQuestionsTool` = 42. View-gated: 8 (report_editor) + 3
(slide_editor) + 2 (viz_editor) + 9 (slides) = 22. `headless: true` = 16 (15
reads + `create_report`). Remaining 4 are client-purpose (drafts ×2, nav,
ask-user). Spot-checked the other headless handlers (`modules`, `reports`,
`slide_decks`, `methodology_docs`, `info`, `get_slide` → `simplifySlideForAI`):
all serverAction/cache-getter + pure formatter over lib types. `create_report`'s
plain-shape `{preview, commit}` approval (`reports.tsx:64-102`) runs unmodified
under panther's MCP approval driver. **No candidate tool falls outside the
three-way taxonomy.**

### 3. Why not A — the evidence is worse than §Verified-context states

Both failure modes reproduced live (2026-08-06):

- The current 6MB bundle (1437 modules) throws `window is not defined` at
  import; `delegateEvents` appears 41× in the artifact.
- The attempted SSR-compile fix **fails at build**:
  `"ssrStyleProperty" is not
  exported by node_modules/solid-js/web/dist/web.js`
  (compile output targets a newer Solid API than installed). Two failed bundling
  mechanisms; the fix path is a Solid upgrade or web-dist aliasing, with no
  guarantee about the next incompatibility.

Structurally: A makes the entire SPA graph (codemirror, yjs, pptxgenjs, the
figure pipeline, `@anthropic-ai/sdk` with `node:fs`…) a permanent dual-target
compile artifact for ~16 tools that need none of it. Panther's own plan records
that the crash tripwire catches only one failure class — `localStorage` works
_silently_ under Deno, `navigator.onLine` is `undefined`, `EventSource` exists —
so guard-at-source is a forever regime across client state files, enforced by
nothing mechanical. The v1 reads-only restriction is load-bearing for A (the
figure/font/canvas surface stays un-triggered but in-graph); under C it is
structural — that code is not in the process.

The asymmetry framing is real, with a clean enforcement answer: `lib/` compiles
into the Deno server today, so a browser dependency creeping into a shared
factory breaks the server typecheck loudly at commit time. A browser API
creeping into A's graph breaks only the MCP bundle, at runtime, for one user —
or worse, silently.

A's honest defense: it shares tool _source_ with zero refactor, and its forced
move is correct — MCP does mandate a second runtime (stdio servers are spawned
processes; no client reaches into a tab). But A answers that with "run the whole
browser app headlessly" when the tools' verified runtime needs are HTTP calls +
pure formatting. C answers with exactly what is needed.

### 4. Why not B / D

**B**: the panther plan's rejection stands on its own terms — tab lifecycle,
reconnect semantics, approval routed through a tab nobody is watching — plus
auth: B inherits the live session, i.e. all 22 editor tools, broader than a
write-capable CLI should get. The view-gated 22 operate on unsaved editor state;
for the stated use case they add little the chat doesn't do better in situ. Not
relitigated.

**D (app-server MCP endpoint)**: the plan's rejection was premised on A's frame
("handlers alias client state"). Under C's factories that premise dissolves —
which is exactly why D is unnecessary _now_: with factories in `lib/`, a
Streamable-HTTP endpoint in the app server becomes a cheap later transport add
(panther's core is transport-agnostic). For one user, spawned stdio with a PAT
is simpler and keeps MCP protocol surface out of production.

### 5. The "whole point" premise

"MCP should simply use the existing tools on the client" is **ill-posed in its
literal sense** — only B executes in the tab, and B is rightly rejected. Its
defensible reading — _one tool definition, one handler, no forked logic_ — is
**satisfied by C** via factories, more honestly than by A: A shares source by
hosting a second copy of the whole app around it; C shares the unit that matters
(`(projectId, deps) => createAITool({...})`) with both surfaces consuming the
same object. C's advertised drift risk collapses under the factory model: there
is no second registry, only a second _registration list_, and the MCP filter
already enforces the headless subset.

### 6. C's true cost — the panther delta, measured (this corrects §C's "one

panther delta" framing)

Verified empirically (2026-08-06, plain `deno eval` from the panther repo):

- Importing `_305_ai/_core/tool_helpers.ts` dies on the katex CSS import via
  `_305_ai/deps.ts` → `_303_components` (`content/markdown_presentation.tsx:3` —
  the only CSS import in the module tree).
- **Katex is NOT the only blocker.** With the CSS shimmed, every `.tsx` in
  `_303_components` fails next (Deno's `react-jsx` emit needs
  `solid-js/h/jsx-runtime`; the default `jsx-runtime` entry exports no runtime
  `jsx`). With that mapped, `@solidjs/router` throws "Client-only API called on
  the server side" at module scope. The `_303` graph is structurally not
  plain-Deno-loadable — which is why the `ai_parity` rig shims the entire `_303`
  barrel. Removing katex is neither necessary nor sufficient for C.
- **The hoist is sufficient, proven by simulation**: with `_305_ai/deps.ts`
  remapped to a slim version (runtime deps: `buildAvailabilityHint` from
  `_110_ai_types` + `zod`; Solid as type-only), `tool_helpers.ts`,
  `mcp_server.ts`, and `tool_catalog.ts` all load and expose working functions
  under plain Deno.

Therefore: **rework the module assignment.** Hoist the Solid-free tool/MCP core
(`tool_failure`, `view_types`, `tool_helpers`, `tool_catalog`, `mcp_types`,
`mcp_protocol`, `mcp_server`) to a lower-tier module with exactly that slim deps
surface; keep `mod.ui.ts` re-exports (zero consumer import churn); export from
`mod.deno.ts`. `lib/` already imports runtime panther symbols on both tiers
(`lib/legacy_cf_presets.ts:1`), so the consumption mechanism exists. This
**explicitly overturns** the panther plan's "no module split" decision — it was
correct on its 2026-08-05 facts (testability-only benefit); C is a new, decisive
reason that draft did not have.

### 7. Follow-up ruling: "MCP must appear like a user using the app"

Under C this holds **by construction**, because the host's only capability is
the generated server-action client over `routeRegistry` with a PAT that resolves
to the real user (`getGlobalUser` branch on `patAuthEmail`). The right mental
model: the MCP host is another tab the same user has open. Same routes, same
middleware, same validation, same user id on every row, same SSE broadcasts to
collaborators. (This is also an argument for C over D: an in-server endpoint
_could_ accidentally call server internals directly; the thin host physically
cannot — it holds nothing but an HTTP client.)

The three places parity is not automatic:

1. **Identity parity at the auth fork** — the PAT branch must resolve to the
   identical user context as the Clerk branch (same permission set, same project
   scoping). Make it a committed server test: hit a representative route both
   ways, assert identical user context and effect. That one test is most of the
   guarantee.
2. **Presence** — the host does not open the collab socket, and should not:
   presence means "a human may be editing in a tab." Irrelevant for v1 scope (15
   reads + `create_report`, none presence-coupled). Standing decision: if
   deck-editing tools ever reach the MCP surface, the host must _read/respect_
   presence (`assertSlidesNotBusy`) via the factory taxonomy's injected
   environment hooks — not broadcast its own.
3. **Effects only via `serverActions`** — written doctrine for factory authors.
   Verified today: the only non-serverAction effect among the 16 is `get_info`
   fetching static `/info/*.md`, the same files the SPA fetches.

Parity of effect is independent of provenance: optionally tag host requests
(e.g. `X-Client: mcp`, logged and otherwise ignored) for later debugging without
changing behavior.

### 8. Follow-up ruling: API compartmentalisation — subpath, not separate server

A separate server must reuse the same handlers anyway (§7 parity), so it buys
ops burden (second deployment, mirrored SSE + `/info` statics) and no drift
protection. The robust-yet-workable shape, given the current
`server/middleware/auth.ts` design (PAT branch inside the shared middleware —
PATs accepted anywhere Clerk is):

- Mount the **same route registrations twice** on the one Hono server: the
  normal mount behind Clerk-only auth, and a `/pat` mount behind PAT-only
  middleware. Remove the PAT branch from the cookie router.
- The `/pat` mount gets: a **deny-by-default route allowlist** (PATs can never
  reach token mint/revoke or user/admin routes; a route added next year is
  PAT-closed until opted in), **CORS fully closed** (no browser holds a PAT),
  and separate proxy-level observability/rate-limiting if wanted.
- The SSE streams (`/instance_updates`, `/project_sse_v2/:id`) and `/info/*.md`
  must be reachable under the PAT mount.
- Client side is nearly free: the transport seam already carries `baseUrl`; the
  host points at `…/pat`.

### 9. Consequences for the work in flight

**Stands regardless (committed):** the PAT seam (migration 073, mint/list/
revoke, middleware — tightened per §8), the transport seam (2b9fb449),
`headless: true` annotations (they are the eligibility declaration C's filter
reads), `create_report` plain-shape approval (transport-agnostic, benefits the
chat card).

**Uncommitted, under this ruling:**

- **Discard**: `client/vite.config.mcp.ts`, the `build:mcp` task,
  `client_dist_mcp/`, and the browser-API guards in `state/project/collab.ts`,
  `state/t4_connection_monitor.ts`, `state/_infra/reactive_cache.ts` (revert —
  the SPA graph never loads headlessly under C).
- **Reuse in a new home**: `headless_mcp/sse_hydration.ts`'s fetch-based SSE
  reader is browser-free — retarget it to fill a plain snapshot object instead
  of Solid T1 stores (or add a snapshot route). `headless_mcp/assistant.ts`'s
  composition (transport registration, instructions, grounding,
  `createMCPServer` config) carries over nearly verbatim. `info.ts`'s base-URL
  change survives as the factory's injected transport base.

**What moves to `lib/`:** the server-action layer (`create_server_action.ts`,
`try_catch_server.ts`, `transport.ts` — the sole residual client import is
`reportNetworkFailure/Success`; make them optional transport callbacks; guard
the module-scope `process.env.NODE_ENV` read), `format_metric_data_for_ai.ts`
(inject `getItems`), `format_visualization_data_for_ai.ts` (inject
`getPODetail`), the list formatters, `content_validators.ts` (inject
`getResultsValueInfo`), the `simplifySlideForAI` path (inject `getSlide`), then
the ~16 factories themselves. The SPA injects its cached getters — chat behavior
identical.

**Next steps, in order:**

1. **Panther**: hoist the Solid-free tool/MCP core down-tier per §6 (same symbol
   names, `mod.ui.ts` re-exports intact), export from `mod.deno.ts`; record the
   overturned "no module split" decision in the plan/doc.
2. **wb-fastr**: lib-ify the server-action layer and shared shaping/validators
   with injected getters; define the factories; repoint `build_tools.ts` at them
   (behavior-identical chat pass first). Add the §8 `/pat` mount + allowlist and
   the §7 identity-parity test.
3. Write the thin host entry (plain `deno run`: PAT transport → `/pat` base,
   snapshot hydration, factories, `createMCPServer(...).serveStdio()`), delete
   the MCP Vite build and guards, live-test with `claude mcp add` against dev.

**Risk to watch (named honestly):** the factory model is verified piecewise but
no factory exists yet. Build `get_metric_data` first — it is the hardest — and
validate the getter-injection ergonomics before converting the other fifteen.
