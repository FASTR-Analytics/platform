---
system: 13
name: AI Copilot & Usage Governance
globs:
  - client/src/components/instance/copilot/**
  - client/src/components/instance/copilot_tools.ts
  - client/src/components/products/copilot/**
  - client/src/components/data/general/ai_context_form.tsx
  - client/src/state/products/t4_ai_documents.ts
  - lib/ai_tools/**
  - server/mcp/**
  - lib/types/ai_input.ts
  - lib/types/custom_prompts.ts
  - lib/report_live_figures.ts
  - server/db/instance/ai_usage_logs.ts
  - server/db/instance/custom_prompts.ts
  - server/routes/anthropic_messages_proxy.ts
  - server/routes/instance/custom_prompts.ts
  - server/routes/instance/ai_files.ts
  - server/routes/instance/copilot_ai_proxy.ts
  - server/tests/ai_context_sections_test.ts
  - server/tests/copilot_catalogue_test.ts
  - server/tests/copilot_prompt_test.ts
  - server/tests/format_hfa_indicators_for_ai_test.ts
  - server/tests/format_products_list_for_ai_test.ts
  - server/tests/hfa_time_points_for_ai_test.ts
  - server/tests/mcp_context_cache_test.ts
  - server/tests/mcp_principal_key_test.ts
  - server/tests/mcp_tools_source_header_test.ts
  - server/tests/reference_docs_test.ts
  - server/tests/report_live_figures_test.ts
---

# S13: AI Copilot & Usage Governance

The Anthropic proxies with token-limit governance, plus the browser-side
copilot: one chat beside the whole shell, whose client-executed tools act on the
view the user is in (through panther's view registry and the product routes),
every place a view of it. Reviewed against code (first review cycle; absorbed
and deleted DOC_AI_PROXY_AND_USAGE_GOVERNANCE and DOC_AI_TOOL_SCHEMAS, the
authoring recipe from the latter now lives in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)); AI-surface prose
re-verified after the copilot and the HFA tools adopted panther's
views/gating/interactions/approval system. Two same-day fix batches
(governance + panther turn-logic, then the client-copilot findings) are folded
into the prose; remaining triaged findings are in Open items below.

Boundaries: the chat engine (request shaping, turn/continuation logic,
tool-execution loop, display registry, conversation persistence) is panther's
`_305_ai` + `_110_ai_types` (vendored; fixes land in the panther repo and
re-sync). Guards themselves are **S1**; the daily token counters are columns on
`users` (`db/instance/users.ts` is S1-owned with S13 a mandatory reader, per
SYSTEMS.md §4.1). The unguarded health routes that surface usage are **S15**.
The HFA tools (`client/src/components/data/hfa/indicators/ai/**`) are
**S5-owned**: S13 owns the chat they register in, the panther engine contract
and the tool-schema conventions they follow; S5 owns their semantics, the HFA
guidance the manager and the code editor attach to their views, and the write
gate they refuse under (`indicators/write_gate.ts`). The slide/figure shapes the
slide_ai helpers produce are **S10/S12**; the query pipeline the data tools call
is **S9**.

## Principles

1. **The server is a thin proxy with governance.** The client speaks the
   Anthropic Messages API; the server forwards to Anthropic, enforces token
   limits, logs usage, and streams the response straight back. All model calls
   traverse a proxy; nothing else server-side talks to Anthropic.
2. **Tools run over the same serverActions the human UI uses**, in the browser
   SPA, or headlessly at the remote MCP endpoint (`server/mcp/`, mounted at
   `/mcp`), so the AI inherits the user's permissions for free (Clerk session in
   the SPA, personal access token at `/mcp`, whose actions dispatch in-process
   through the full PAT middleware chain, see S1) and can never do what the user
   can't. **Two classes of tool, one env seam**: `lib/ai_tools` holds exactly
   the tools BOTH surfaces expose (metrics ×2, reference docs ×2) over
   `AIToolEnv`: a data source for ONE (package, scope) pair (items, value info;
   no run id ever crosses the seam or appears in a schema). Shared tool OUTPUT
   states only what both surfaces can act on: `from_metric` authoring guidance
   is the SPA prompt's and block schema's contract, never a shared formatter's;
   the metrics listing keeps its per-metric presets (grain, filters, replicant
   requirement) as reference data about the metric, and lists metrics in module
   order (`compareModules`: family, the primary module first, then declared sort
   order) under one heading line per module, so both `getSharedToolsForMetrics`
   callers pass the package's module summaries (the SPA from the authoring
   context, MCP from `getModuleSummariesFromManifest`); the copilot's
   `get_available_modules` lists modules in the same order with their family and
   tier. **The reference documents are one catalog behind one pair**
   (`lib/ai_tools/tools_reference_docs.ts`): `get_reference_docs` lists every
   document the surface exposes and `get_reference_doc({ id })` reads one, the
   resolver picking the source by id. Two sources: the app's own documents,
   served from `client/public/info/<id>.md` and declared as entries
   (`REFERENCE_DOCS` in lib, shared: `iceh`; the client's `SPA_REFERENCE_DOCS`
   adds the equity-profile report recipe, which presupposes the authoring
   tools), and the FASTR methodology hub on GitHub, whose ids are paths under
   its `methodology/` directory. The catalog is text, not parsed entries: one
   line per app entry, its `readWhen` trigger in the line, then the hub's
   `index.md` for the instance language (`fr/`, `pt/` when the mirror exists,
   else English) verbatim, under one line saying its link targets are ids; the
   read accepts any guarded `.md` path under the hub, since the index omits
   chapters. An entry may declare the `dataset` it is about, and the list drops
   it when the instance's `datasetsWithData` holds no such data
   (`resolveInstanceState` per call on `/mcp`, the live store in the SPA); the
   read serves every entry it was given. Hub reads go through the GitHub
   contents API, unauthenticated, under its 60 requests per hour per IP, so
   every hub read is memoised per process with a ten-minute TTL (a failed read
   is dropped as it settles), and a hub failure degrades the list to the app
   entries plus one line. The triggers ride the entries: the list tool's
   description names every entry with its `readWhen`, so the model knows when to
   read a document before its first call, and the system prompt's reference
   section is one line pointing at the pair
   (`server/tests/reference_docs_test.ts` pins the catalog text, the relevance
   filter, the description and the base64 decode). The SPA binds one env per
   inner tool set (`createCopilotAIToolEnv(pair)`, cache-backed over the
   run-keyed package routes; `ClientAIToolEnv` adds the module
   script/logs/settings getters and the figure-shaping helpers) and registers
   outer tools bound per call to the pair of the view the call runs in
   ([bind_package_tools.ts](client/src/components/instance/copilot/bind_package_tools.ts),
   panther's `bindAIToolToView`): the inner builder in
   [copilot_tools.ts](client/src/components/instance/copilot_tools.ts)
   concatenates the shared metric tools with its own client tools (the module
   list, the editors and the draft preview), and the three module internals
   (`/mcp` is for seeing results, ruled) bind by run id alone. `/mcp` binds the
   instance's **pinned** results package (under the reserved "All data" scope,
   `scopeId: "all-data"`, on the run-keyed instance routes, gate = an approved
   unrestricted user: `resolvePackageContext` refuses a restricted one with a
   tool failure when it builds a context, and the routes refuse them "All data"
   on every read, since a restricted user cannot hold that scope) and exposes
   only the shared tools + `get_overview`: 5 read-only tools, no writes, all
   five listed under `# Available Tools` in the overview, which renders the same
   list the server returns. Only `get_available_metrics` and `get_metric_data`
   read the pin; the reference tools read reference docs, and the server's
   instructions, the overview and the endpoint's file comment say so. A renamed
   tool is a rename and nothing else: a stored conversation's call to an old
   name fails once with "Unknown tool" and the model re-lists, and a connected
   MCP client keeps its cached tool list until it refreshes (USER_GUIDE_MCP's
   troubleshooting says how). **Interpretation context rides the grounding and
   the shared reads, not extra tools**: `buildPackageGroundingSections` lists
   every HMIS indicator of the package with its format, direction, thresholds,
   target and, for a calculated indicator, its flattened formula (the manifest's
   `hmisIndicators`, in dictionary order; the indicator's type is deliberately
   absent, an implementation detail no reader needs), and `get_metric_data`
   fetches value info beside the items and states the metric's full period
   coverage plus, per indicator in the Dimension Summary, the same facts
   (`describeIndicatorFacts`: direction on its own line item whatever the rule's
   shape, thresholds in display units mirroring the scorecard's inclusive cutoff
   rule, target); `buildPackageGroundingSections` states the package's calendar
   and period coverage (finest physical time column; `/mcp` only, since the SPA
   holds no manifest), and the boundary maps a figure on the package can draw
   (`mapLevels`: the package's geojson stamp, else, for a package without a
   capture, the instance's maps; the SPA reads the run-geo store, which the
   copilot panel awaits beside the authoring context before it counts the
   package loaded, and `/mcp` reads the manifest). The map line rides only the
   package block, never the instance context, which both surfaces share. Nothing
   about modules, provenance, or unavailable metrics goes into the package
   grounding: it does not help read a metric (ruled). The `package` and
   `explore` views are the narrowing: on those two pages the module and the
   package's status are what the user is looking at, so their view state names
   the open module, and the package page's its status, stage, error and
   progress. A separate indicator-dictionary tool was considered and dropped as
   redundant. The `/mcp` surface is stateless above the wire: the metric tools
   read the pin from the DB on every call (a pin-move is visible on the next
   call; `get_overview` answers without a pin), and package tools are boot-time
   templates bound per call via panther's `bindAITool` because panther caches a
   principal's tool set per core. A core is keyed per credential:
   `buildMcpPrincipal` gives each PAT or OAuth access token its own principal,
   whose key is the email plus a 16-digit prefix of the token's SHA-256
   (`server/tests/mcp_principal_key_test.ts`), so a second PAT or a rotated
   token of one user never runs over another credential's token. The catalog is
   fixed per process: a client sees a catalog change only when it re-lists (a
   chat client: refresh the connector's tools, or a new conversation, though
   neither claude.ai nor Claude Code reliably re-lists on a new conversation
   alone), and the server does not advertise `listChanged` (panther's
   DOC_AI_CHAT §Headless tools). So results are self-identifying instead: every
   package-tool result starts with a
   `Source: results package "<label>" (generated <createdAt>), scope "All data"`
   line naming the run and the scope it read. The line is `formatSourceHeader`
   in `lib/ai_tools/source_header.ts`, whose scope label is optional so a read
   bound by run id alone can name the package and no scope, and the wrapper is
   `withSourceHeader` beside it: it prepends the header, read at call time, on
   `run`, `runWithView` and `runStructured`, and lets a failure through
   unheadered. `context_cache.ts` applies it where run and session tools meet,
   passing "All data"; `server/tests/mcp_tools_source_header_test.ts` pins both
   functions and the `/mcp` line. The SPA applies the same line to every read of
   a pair-bound inner set, with the scope's display label, and to a module
   internals read with the package and no scope (`bind_package_tools.ts`): the
   pair behind a registered tool follows the view between two calls of one
   thread, so every package read on both surfaces opens with its own source
   line. `serverInfo.version` reports the deployed `SERVER_VERSION` (hygiene: no
   client re-lists on it). A client's re-list behaviour is observed from
   panther's per-request stderr line, `[panther mcp] fastr: <era> <method> …`;
   `./mcp_probe <origin> --info` shows the handshake. The system prompt splits
   the same way: shared grounding blocks in
   `lib/ai_tools/build_system_prompt.ts`, each surface assembling its own
   context, with the instance `ai_context` after its data coverage through the
   shared `buildAiContextSections` (nothing for a blank context,
   `server/tests/ai_context_sections_test.ts`), so `get_overview` carries what
   the admin wrote for the assistant. The SPA's system prompt is instance level:
   only an instance input changes it, so one conversation keeps one prompt
   through every view and every package (the prompt-cache breakpoint and a
   preserved thinking block's prefix check both need that). The package
   grounding rides the package block (`buildPackageBlock`), a per-turn consumer
   block the chat attaches to a message whenever its text is new to the
   conversation, and the date rides the date block the same way; `get_overview`,
   a one-shot text with no message or tools array behind it, asks
   `buildSystemPrompt` for the date and the tool catalogue
   (`server/tests/copilot_prompt_test.ts`).
3. **Editors expose live mutators via the view registry's context**: each
   editing view's live context carries the editor's store getters/setters AND
   the package view contract, `getScope()` (the product's pair with its scope's
   definition hash) and `getRunId()`
   ([ai_views.ts](client/src/components/instance/copilot/ai_views.ts)), so the
   AI edits exactly the same in-memory editor state the user is looking at,
   never a parallel copy. The pair rides the opaque CONTEXT half: no run id
   crosses the tool seam. A mid-edit reattach moves the view's identity, so a
   call planned before it refuses, and the next call binds to the new pair.
4. **Anthropic shapes in, Anthropic shapes out.** The proxies return
   Anthropic-shaped bodies and errors (not the `APIResponse` envelope) because
   the client Anthropic SDK parses them, the enumerated exception to the
   envelope rule (S1).
5. **AI input schemas derive from storage schemas** (`configDStrict` et al.) so
   AI-built configs are storage-compatible by construction. See
   [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

## The proxy

One handler,
[anthropic_messages_proxy.ts](server/routes/anthropic_messages_proxy.ts)
(governance, usage logging and beta policy live there), behind one thin raw Hono
route (deliberately outside the S1 route registry): `POST /ai/v1/messages`
([copilot_ai_proxy.ts](server/routes/instance/copilot_ai_proxy.ts)), mounted at
`/ai` in [main.ts:179](main.ts#L179) beside the Files proxy
([main.ts:180](main.ts#L180)), guarded by `requireApprovedUser()` and nothing
finer: the chat's tools run in the browser and reach a product or the HFA
indicators only through the routes, which guard themselves. Its client is the
copilot's SDK client
([defaults.ts](client/src/components/instance/copilot/ai_configs/defaults.ts)).

The flow:

1. Key and URL come from the boot-validated `_ANTHROPIC_API_KEY` /
   `_ANTHROPIC_API_URL` (`exposed_env_vars.ts`; the URL env is the **full**
   messages endpoint, `https://api.anthropic.com/v1/messages`).
2. **Daily limit**: `_DAILY_TOKEN_LIMIT !== null && !unlimitedAi` →
   `GetUserDailyTokenUsage >= limit` → `LogAiLimitHit(email, "daily_user")` +
   Anthropic-shaped 429 whose message embeds the next-UTC-midnight reset ISO.
3. **Weekly limit**: same gate shape → `GetInstanceWeeklyTokenUsage >= limit` →
   `LogAiLimitHit("__instance__", "weekly_instance")` (sentinel, not the
   email) + 429 with next-Monday-UTC reset.
4. **Beta headers**: client-supplied `anthropic-beta` values **filtered through
   the `FORWARDABLE_BETAS` allowlist** (web-fetch, structured-outputs: the set
   panther actually sends; SDK ≥0.110 sends betas via the header, not the body).
   The proxy adds none of its own: the Files API is GA, so a `document` block by
   `file_id` needs no beta. Unknown client betas are dropped so users can't
   enable cost-changing betas under the same token limits.
5. `fetch(_ANTHROPIC_API_URL)`, `anthropic-version: 2026-10-21`.
6. `!ok` → Anthropic's error body forwarded unchanged at the upstream status
   (type and message intact, so the SDK's `err.type` classification works); a
   non-JSON upstream body is wrapped as an Anthropic-shaped `api_error` carrying
   the text.
7. **Streaming**: a `TransformStream` tees SSE lines. `message_start` seeds
   input/cache token counts; `message_delta.usage` is **cumulative** for the
   whole response and overrides every non-null field (server-tool turns run
   multiple internal sampling iterations and only the delta carries the true
   input totals: assign, never add). Accounting settles exactly once via an
   idempotent `settle()` wired to both `flush()` (graceful completion) and the
   transformer's `cancel()` hook (client abort: Stop button, tab close), so
   aborted streams log their partial counts instead of nothing. (Deno's
   `Transformer` lib type predates `cancel`; the runtime honors it, empirically
   verified.)
8. **Non-streaming**: parse `data.usage`, same log + increments.
9. Increment amount is `inputTokens + outputTokens` only. Cache tokens are
   logged but never counted against limits (an implicit policy; Open items). The
   daily increment runs even for `unlimitedAi` users (tracked, never enforced);
   the weekly increment is skipped for them. The asymmetry is the point, not an
   oversight: the daily counter is PER USER, so counting an unlimited user costs
   nobody else and keeps the number honest if the flag is later cleared mid-day,
   while the weekly counter is SHARED and gates every limited user, so the same
   increment would spend their quota. Counting unlimited users in while the
   weekly gate still exempts them (`:82`) would let one of them lock out
   everyone else, and "unlimited" would come to mean "unbounded for me, and it
   shrinks everyone else's pool". The weekly counter is therefore a QUOTA
   measure, not a spend measure: it is written only when `_WEEKLY_TOKEN_LIMIT`
   is set, it excludes cache tokens, and its only readers are the gate, whose
   429 names no number, and the two surfaces that print it beside the limit, the
   profile panel and the health route. Real spend is `ai_usage_logs`, written
   unconditionally for every user and every token kind.

   The profile panel must therefore not imply the two figures are comparable:
   its rows read "Today (you)" and "This week (country quota)", and the week row
   tells a user whose own use is not counted that it is not
   ([profile.tsx](client/src/components/instance/profile.tsx)). Without that, an
   unlimited user sees their own day at more than double the whole country's
   week, which as displayed is impossible.

**Governance storage.** Daily counter = columns on `users`
([users.ts:279-311](server/db/instance/users.ts#L279-L311), S1 seam): the read
compares the stored date to today in JS UTC, the write uses Postgres
`CURRENT_DATE`, identical only while the DB session runs UTC. Weekly counter =
`instance_weekly_token_usage` upserted on `date_trunc('week', CURRENT_DATE)`
([ai_usage_logs.ts:4-20](server/db/instance/ai_usage_logs.ts#L4-L20)). Per-call
rows = `ai_usage_logs` (email, model, 4 token counts). Limit hits =
`ai_limit_hits`, PK `(user_email, limit_type,
hit_date)` so
`ON CONFLICT DO NOTHING` dedupes to one row per day. `unlimitedAi` = `H_USERS`
membership or `users.unlimited_ai`
([global_user.ts:110](server/auth/global_user.ts#L110)). `_DAILY_TOKEN_LIMIT` /
`_WEEKLY_TOKEN_LIMIT` are `parseInt`-or-`null`, with a boot-time throw on an
unparseable value
([exposed_env_vars.ts:210-223](server/exposed_env_vars.ts#L210-L223)); `null` =
disabled. All logging and increments are `.catch(() => {})` fire-and-forget.
Accounting is best-effort, not transactional, and the limits are check-before /
increment-after, so concurrent requests can overshoot: a courtesy bound, not a
hard one.

**The error contract, as built.** Three deliberate non-envelope shapes: the 429
rate-limit object, the upstream error body at its status, and anything _thrown_
in the handler (malformed request JSON, upstream fetch network failure), which
the shared handler catches and returns as an Anthropic-shaped 502
([anthropic_messages_proxy.ts:50-63](server/routes/anthropic_messages_proxy.ts#L50-L63))
rather than letting it fall to `app.onError`'s envelope-at-HTTP-200. The one
envelope shape on the surface: guard rejections are `{success:false, err}` at
401/403.

**Health surfacing (S15).** `GET /ai_usage` (full `SELECT *`, optional `since`),
`/ai_weekly_usage`, `/ai_limit_hits`
([health.ts:176-194](server/routes/instance/health.ts#L176-L194)). Health routes
are public by design, but `/ai_usage` returns per-user emails and per-call
behavior, unbounded (Open items).

## The Files proxy

[ai_files.ts](server/routes/instance/ai_files.ts): ONE raw route,
`POST /ai/files`, guarded by `requireApprovedUser()` like the copilot proxy it
is mounted beside, proxying the Anthropic Files API (GA, no beta header) at
`anthropic-version: 2026-10-21`. It is **not** a client-upload passthrough: the
body is `{assetFilename}`, the server reads that file from the instance assets
dir on disk (traversal-guarded via `resolveAssetFilePath`) and multiparts it to
Anthropic, hardcoded as `application/pdf` regardless of actual type. Uploaded
files are referenced as `document` blocks in later `/v1/messages` calls. Nothing
calls the Files API by file id, so there is no GET or DELETE passthrough.

## The client copilot

The chat's code has two homes. The shell-level half is
`client/src/components/instance/copilot/`: the panel
([panel.tsx](client/src/components/instance/copilot/panel.tsx)) and its tab
ownership ([tab_owner.ts](client/src/components/instance/copilot/tab_owner.ts)),
the pane
([chat_pane.tsx](client/src/components/instance/copilot/chat_pane.tsx)), the SDK
client and built-in tools (`ai_configs/`), documents (`ai_documents/`), the
prompt library (`ai_prompt_library/`), the debug panel, the view registry,
controller and interactions, the system prompt, the env (`client_env.ts`), the
package-tool binder (`bind_package_tools.ts`), the guard (`tool_guard.ts`), the
reload guard (`turn_guard.ts`) and the module tools (`tools/`), exported through
its `mod.ts`, which the shell reads for the panel and every page and product
tool reads for the registry, the controller and their types. It imports nothing
at runtime from `components/` but `components/_shared/mod.ts`, and has no
`_shared/`: the registry, controller, interactions, system prompt, env and types
sit at the folder's root. The tool assembly sits beside it, outside the folder,
in [copilot_tools.ts](client/src/components/instance/copilot_tools.ts), because
it reads the product tools, which read the folder's registry; `instance.tsx`
alone imports it. The product half stays in
`client/src/components/products/copilot/`: the product tools (`ai_tools/`), the
slide conversion layer (`slide_ai/`), the two `_shared/` files both of those
read (`content_validators.ts`, `format_figure_config_for_ai.ts`); its `mod.ts`
exports the five tool builders. (The save-style modal went with the html report
format on 2026-10-13, S12.)

One chat sits beside the whole shell. `instance.tsx` wraps `ShellEditorWrapper`
in a `FrameRightResizable` whose panel is
[`CopilotPanel`](client/src/components/instance/copilot/panel.tsx), so the chat
is beside every tab page, full-page view and nested editor; the slot is always
passed and built once (every frame builds its panel once) and the chat inside
mounts once the user is approved, so there is no chat before sign-in, for an
unapproved user, or on `/access-tokens`, which is another route. The panel's one
open state is `showAi` (T4, in localStorage, open until the user closes it): its
own header button closes it and the opener (`#copilot-opener`, a button on the
window's right edge outside the editor wrapper, shown while the panel is closed)
opens it. The product opener (`openProduct` in
`client/src/components/products/products.tsx`) opens the registry's editor
directly; the editors set their views (below) and the chat follows. Threads and
settings are the user's: the thread scope and the settings key are
`copilot:<Clerk user id>` (`copilot:dev` under `VITE_BYPASS_AUTH`, where there
is no Clerk user), read live from Clerk's listener and keyed on, so a cross-tab
user switch without a reload stops the previous user's turn and opens the next
user's threads; the thread list, New conversation and the last-active id follow
the user through every view and tab, and the old per-product scopes
(`copilot:<productId>`) and the old settings key (`panther-ai-settings-copilot`)
stay unlisted and unread. One browser tab owns the chat: the panel requests the
Web Lock `copilot-owner/<scope>` when it mounts and mounts the chat only while
it holds it; another tab's panel shows the notice ("The AI chat is open in
another tab.") and the Use it here button in the chat's place, and the button
posts `takeover` on a `BroadcastChannel` of the lock's name, on which the owner
stops its turn (`stopGeneration`), awaits the record's save (`whenIdle`),
releases the lock, shows the notice and queues a new request, unless its turn is
running (`isLoading`), when it answers `busy` and keeps the chat and the taker's
notice says the AI is answering in another tab; the browser grants the taker's
pending request, releases a closed or crashed owner's lock by itself, releases
at once a grant that lands after the panel's cleanup (the abort is ignored once
a lock is granted), and without the Web Locks API (an insecure context) the tab
is the owner at once. A store is therefore always built from a record no other
live tab writes. The panel stops the chat's turn and awaits its save the same
way when it unmounts (sign-out, a user switch, the instance-stream reset on
approval or a change to the user's own scope access, which remounts the shell
and with it the chat on the same thread). The panel creates the one engine
instance (`createAIChat`, inside the provider once the lock is granted), keeps
it to stop and await at a hand-over and at its own cleanup, and hands it to the
pane, which hands it to `AIChat` as `chat`, so the pane and the chat share one
registry, one settings copy and one queue drain. The panel builds one panther
`AIChatProvider` config, validated in dev by panther's no-mount construction
check: the panel calls `validateAIChatConfig(config)` under
`import.meta.env.DEV` at config assembly:

- **sdkClient**
  ([defaults.ts](client/src/components/instance/copilot/ai_configs/defaults.ts)):
  Anthropic browser SDK, `baseURL {host}/ai`, no credential (`apiKey: null`,
  `authToken: null`, `defaultHeaders: {Authorization: null}`, so the guard
  judges the Clerk session cookie alone), plus a fetch wrapper that rewrites the
  ISO reset timestamp inside 429 bodies to the user's locale.
- **modelConfig**: omitted, so panther's `DEFAULT_MODEL_CONFIG` applies
  (`claude-sonnet-5`, `max_tokens: 32_000`, `output_config: {effort: "high"}`,
  [anthropic_consts.ts:248-252](panther/_110_ai_types/anthropic_consts.ts#L248-L252);
  effort is re-resolved per model by panther and dropped where unsupported;
  max_tokens fits every listed model's output cap, and a report rewrite is one
  tool_use block that must fit inside it). Panther resolves the config into
  per-instance state, so the shared default is never mutated. The settings panel
  exposes model + max_tokens (`adjustable`,
  [chat_pane.tsx](client/src/components/instance/copilot/chat_pane.tsx)); the
  model list is panther's `MODEL_OPTIONS`, client-side only. The proxy forwards
  any `model` verbatim (Open items).
- **builtInTools** = `{webSearch: true}`: Anthropic's server-side web search,
  resolved per model by panther (the dynamic `_20260209` variant on 4.6+, the
  basic one otherwise). No web fetch: it would carry anything the conversation
  holds (a tool result, an error quoting its input) to any host the model names.
  Search is unrestricted: no `max_uses` / `allowed_domains` (Open items).
- **scope** = `copilot:<Clerk user id>`: conversations are the user's (one
  IndexedDB registry, filtered by scope, with a last-active id per scope), so
  the current thread follows the user through every view and tab, and the
  persisted chat settings (model, max tokens) default to the same key
  (`panther-ai-settings-copilot:<Clerk user id>`).
- **system** = `buildSystemPromptForContext` memo over the instance (instance
  level, see below); **getEphemeralContext** = the date block and the package
  block (`buildCopilotPackageBlock` over the pair the current view shows and its
  T2 authoring context, which the panel resolves live from the view's
  `getScope()` and fetches when the pair changes; a view with no package, or
  whose context is still loading, sends no package block); **getDocumentRefs**
  from `useAIDocuments`; **viewController** = `copilotViewController` (below).
- **the HFA survey rounds** (instance-wide T1, not in the per-run payload) are
  merged into each inner set and into the pane's View AI tool output through
  `hfaTimePointsForAI` (lib), which keeps the imported rounds in the order
  given, the label as the id: the same function `/mcp`'s package context calls
  over the `hfa_time_points` rows in `sort_order` (`getHfaTimePointsForAI`,
  `server/tests/hfa_time_points_for_ai_test.ts`), so both surfaces list the same
  rounds. The registered tools close over nothing of the panel: the array is one
  set for every pair, each package tool bound per call to the inner set of the
  view's pair (`bind_package_tools.ts`, below).

The chat pane (`ConsolidatedChatPane`,
[chat_pane.tsx](client/src/components/instance/copilot/chat_pane.tsx)) fills the
panel while this tab owns the chat, and registers three custom renderers, keyed
to panther's `DisplayRegistry`: `toolError`, `systemNotice`
(refusals/truncation/context-exceeded/ continuation caps arrive as
`system_notice` items), and `userText` (`SaveableUserTextRenderer`: adds
save-to-prompt-library and renders the text as typed, with image syntax
disabled, so a user's or a library prompt's text never fetches an image URL as
it renders).

The pane also keeps the reload guard
([turn_guard.ts](client/src/components/instance/copilot/turn_guard.ts)) current:
`turnRunning`, set from the instance's `isLoading` (true from the turn's start
to its `finally`, so a turn parked on an approval or an ask_user_questions card
counts) and cleared when the pane unmounts (a hand-over, a user switch), and
`confirmReloadUnderTurn()`, the only one of the two that `mod.ts` exports, true
at once with no turn and otherwise the user's answer to a warning confirm. Every
control that reloads the page asks it first (the language menu, S14; the
profile's Clear data cache, Clear AI chat history, Sign out and Change email,
S15), because a reload loses the turn and the conversation's record of what it
applied, which the engine writes only in the turn's `finally`.

**The view registry.**
[`copilotViews`](client/src/components/instance/copilot/ai_views.ts) is the one
registry of the chat: a view per place the user can be, keyed by the catalogue's
`COPILOT_VIEW_IDS` (`lib/ai_tools/copilot_catalogue.ts`, whose
`server/tests/copilot_catalogue_test.ts` pins the views, each gated tool's
views, the requirements and the identity parts; the registry's keys satisfy
`Record<CopilotViewId, AnyAIView>`, so the two cannot drift), and the
module-level singleton `copilotViewController` (fallback `shell`). Per view,
params are the serializable model-visible half (ids, and the report's format and
style); context is the live payload (editor getters/setters plus, on every
package view, `getScope()` and `getRunId()`) delivered to tool handlers
opaquely. Labels and the state that names things are read live from the context,
never captured into params: the deck's name (`getDeckLabel`), the open slide's
id, type and title (`getOpenSlide()`, the title by `getSlideTitle` over its
draft) and the report's name (`getLabel`), so a rename, a title edit or a type
switch never leaves the view line, the state, the instructions or a tool's
read-back stale. Every view that shows something declares its `identity` through
`copilotViewIdentity` (the entity ids, and for a package view the pair with its
definition hash), so the engine refuses a view-limited call once the live
identity differs from the one the turn last saw: a call planned before a
reattach does not run against the new package. The deck view's identity is the
deck and its pair; the open slide is its state, not a part of it, so a switch of
slides, the AI's delete of the open slide and the first slide of an empty deck
opening are not moves, and every call of the turn stays valid, since every slide
tool names its slide.

A place holds the view it covers and sets its own: `holdCopilotView()` (called
synchronously in the place's component body) captures the controller's current
view and restores it in the place's cleanup through `restoreCopilotView`,
exhaustive over every view, and Solid cleans a node's children before its own
cleanups, so nested places unwind in order. The sync sites are the product
editors: the deck and the report editor hold at mount and set `opening_product`
(params: the product id; label: the product's name, read live), whose
instructions tell the model the product is still loading or failed to load; the
report sets `editing_report` after its first fetch succeeds, and the deck sets
`editing_slide_deck` on its first successful fetch and keeps it while slides
open and close beside the rail: the slide editor sets no view, and hands the
deck its draft (S12), which the view's context serves as `getOpenSlide()`. A
load that fails before that renders the error through `StateHolderWrapper` in
place of the editor, writes nothing (no autosave, no room, no deck-config save)
and leaves the controller on `opening_product`. The Results and Explore pages
set their own: Explore (`components/explore/explore.tsx`) holds at mount and
sets `explore`, whose `getScope` is the resolved package at the resolved scope
or a refusal naming why while none is ready, and whose state names the family,
module, view and type the panes resolve (the same resolution functions) and the
settings of the view the frame resolved (`resolveView`'s result in
`MetricFrame`, reported up through `onView`: the metric, the switch option, the
level, each pin's value, the laid-out category's values and the grain, each by
the id a package tool takes, and the period by its choice's label, as the
toolbar's select shows it), so the model is told what is on screen, once the
package's authoring context is in; the Results page sets `results_packages`,
whose state names the pinned package and the counts by status from the
catalogue; the package page holds in `ResultsPackagePage` and sets `package`
from `PackageBody` on every status change (params: the run id; its pair the
page's package at the page scope, which `getScope` has only while the package is
ready, so the package reads refuse with the status's reason while the module
internals read by run id; its state the status, stage, error, progress and open
module); Module defaults sets `module_defaults` and the Scopes page `scopes`.
The Products page sets `products`, whose instructions point at `list_products`;
the Data switchboard sets `data`, whose state is each row's label and status
mark (`formatDataState` over the `DataSectionForAI` rows the page supplies,
never a summary), and its `openSubPage` sets `data_page` (params: the page id
and, on a family's page, the family; instructions name both) for every page it
opens and restores the covered view when the page closes (S6); the Assets page
sets `assets`, the Users page `users` and the user detail `user`, each with
instructions that name the page and nothing of its contents: no roster, no
email. Inside products, deck settings (`SlideDeckSettings`, given the deck id)
sets `deck_settings` and the version history (`VersionHistoryEditor`) sets
`deck_history` or `report_history` by its `kind`, each with
`productViewContext(productId)`, the product's live row as label and pair (a
refusal naming why once the row is gone) and instructions that name the screen
and the step back to the editor (its back button), so the model never invents a
view name for the user to find; the figure editor (S11) holds in
`VisualizationEditor` and sets, from `VisualizationEditorInner` once the draft
exists, the view its host names in the required `aiView` prop
(`editing_slide_figure`, `editing_report_figure`, `viewing_package_figure`, each
with the params its identity needs) through `setFigureEditorView`, with a
`FigureEditorContext` of the pair, the metric and the draft (`getDraftConfig`,
`applyDraftConfig`), and instructions naming the figure by its label
(`getFigureEditorInstructions`); the results file viewer sets `results_file`
from its props with the same pair, and instructions naming the module and the
results object. The HFA indicators manager (S5) holds the switchboard's
`data_page` and sets `hfa_indicators`, whose state is the open tab and whose
instructions are the manager's own lines (`getHfaIndicatorsInstructions`) and
the HFA guidance S5 keeps in
`components/data/hfa/indicators/ai/instructions.ts`, supplied through the view's
context (`getGuidance`), so the registry imports nothing from
`components/data/`; its code editor holds in `HfaIndicatorCodeEditor` and sets
`hfa_indicator_editor` from `EditorInner` once the draft store exists, with the
indicator id as identity, the open round in its state, and an
`HfaIndicatorEditorContext` of the saved label, the selected round, the draft
read live (`getDraft`: the fields, the code per round, the variant group and the
current group's variant rows), the taxonomy the editor offers (variant groups
and items included), what the manager handed the editor (`getIndicators`,
`getAllCode`, `getAllVariantCode`, `getDictionary`), the HFA guidance
(`getGuidance`) and `applyDraft`, which writes the store with the controls'
semantics, a group change before the patch's variant rows, and marks the draft
unsaved; its Excel import sets `hfa_indicator_import`. There is no tab-to-view
map.

**What a message carries** (panther's append-only turns). Every message carries
the view line, the view's `state` and the interactions digest; a view's
`instructions` and the chat's consumer blocks ride a message only when their
text is new to the conversation, so each is sent once per text; a message the
model never answered loses its blocks, and a changed system-and-tools hash
strips the stored thinking blocks once. Per view, `instructions` is the static
guidance (the deck and report briefs; below edit level a product view's
instructions carry the level line, read live, so the model is told not to call
the editing tools, which refuse) and `state` is what changes without a
navigation: the entity ids (deckId, reportId), the deck's open slide
(`Open slide: <id> (<n> of <total>, <type>): "<title>"`, the title read from its
draft, or `Open slide: none` while none is open, with "(the deck has no slides)"
when it has none) and its selected slide ids, and the report editor's CodeMirror
selection preview, a few lines. The deck's instructions are one text whether or
not a slide is open (`getEditingSlideDeckInstructions`): the deck's name and the
package line, the slide types, the content blocks, the text length, never
showing the user an id, the open slide (the state names it; an edit to it shows
on the canvas at once and saves automatically, an edit to any other slide is
saved immediately, and the model never asks the user to open, close or switch a
slide or a view) and the workflow over the nine slide tools. The chat's consumer
blocks (`getEphemeralContext`) are the date block and the package block: the
package's label and generation time, the scope with one line per dataset family
(excluded, unlimited, or its limits), the datasets, the HMIS and ICEH indicator
lists and the calendar, built by the pure `buildPackageBlock` in lib over values
the panel resolves live from the current view's pair
(`buildCopilotPackageBlock`), so a move to another package, a reattach, a
rescope or a scope edit puts the new package in front of the model once, on the
message where it happened. The engine stores the sections as typed data on the
turn and renders every carrier permanently as a `<<<[…]>>>` block, so each
request's messages are a prefix of the next request's and each block stays on
the message it rode: the model can tell where every earlier turn happened. A
write-only wire, one format for every model.

**Interactions and echo suppression.**
[`copilotInteractions`](client/src/components/instance/copilot/interactions.ts)
(`defineAIInteractions`, 6 typed interactions) replaced the hand-rolled
pendingInteractions queue + `reduceInteractions` pipeline. Producers call
`copilotViewController.notify(...)`: the deck and report editors, each listening
to the INSTANCE SSE side-channel for its own product (the deck notifies
`edited_slide` for every `last_updated("slides")` id and `product_updated` for
its own row, whose deck line says the deck's slides or its settings changed,
since every slide write bumps the deck's row; the report notifies
`product_updated` for its own row from the listener that also keeps its
optimistic-save timestamp fresh; both listeners are removed on cleanup), and the
editors and selection UIs (`edited_*_locally`, `selected_slides`, and
`draft_added_to_deck`, the accepted-draft signal the model would otherwise never
hear, since the write's own SSE echo is marked as an AI edit). The three slide
interactions are admitted in the deck view alone: `edited_slide` for a slide of
the deck, `selected_slides`, and `edited_slide_locally` for the open slide. The
local-edit lines carry the id of the slide or report that changed and a `filter`
keeps only the one open when the edit is recorded; neither names an author,
since a collaborator's edit invalidates the AI's read as the user's own does.
The report's reads "The report body changed"; the slide's names the slide ("The
content of slide <id> changed while it was open"), one line per slide, because
the deck view's line names only the deck and the user may have opened another
slide by the next message. Every rail selection path notifies `selected_slides`:
the click paths through `updateSelection`, the clear paths through
`clearSelection`, whose line reads "Cleared the slide selection". Each editor
filters `products_upserted` to its OWN product: another product changing is not
its business. An entry is admitted (`relevantIn`, then `filter`) against the
view the user is in when it is recorded, and its digest line names that view.
The engine owns the transactional drain at turn creation (restored on a failed
send, so entries are never lost or double-delivered) and the reduction pipeline
(coalesce per id), plus a coalesced `__navigation` line. The old "SSE echoes the
AI's own tool edits" defect is fixed in the general case: every persist-path
write tool marks its `slide:` and `product:` echo keys via `markAIEdit` once its
write has landed (a report tool marks its `product:` key after the accepted
commit, or after a figure update saves), so the AI's own server writes are
dropped at drain (TTL-scoped, either-order). A write to the open slide's draft
marks the same keys, since the room's checkpoint of it notifies `slides` and the
deck's row as a stored write does; within the 30s TTL a collaborator's
checkpoint of the same slide drops too, which the workflow absorbs, since the
model re-reads a slide before it edits one. The controller is a module singleton
whose log outlives a mount. The manager activates a conversation on every mount,
which starts its digest at the log's end, so actions retained from before (the
previous user's on a Clerk cross-tab user switch, this tab's while another tab
owned the chat) never ride this chat's digest; the panel still calls
`clearInteractionLog()` when the chat mounts, which drops them and, with them,
the echo marks and any open AI-navigation window the previous user's chat left,
which would otherwise drop or misattribute this user's first actions within
their TTLs.

## Tools, view gating, and approval

[`buildCopilotTools`](client/src/components/instance/copilot_tools.ts) assembles
one flat array once per shell mount, the same for every user, every view and
every pair and always registered with the API: the outer package tools
(`bindPackageTools` over the inner builder: metrics, the module list, the
editors, the figure editor and the draft preview, each bound per call to the
inner set of the view's pair; the module internals, bound by its run id), the
Products page's `list_products`, the two reference tools and panther's one
`ask_user_questions`. Every tool declares a `kind` (`"read"` / `"write"`); no
tool is `"nav"`: a navigation tool or any AI-driven move is out of the chat's
scope, so the user moves and the view line tells the model where. The slide
tools are nine, one set, admitted in the deck view
([slides.tsx](client/src/components/products/copilot/ai_tools/tools/slides.tsx)
builds it): `get_deck`, `get_slide`, `create_slide`, `update_slide`,
`update_figure`, `replace_slide`, `delete_slides`, `duplicate_slides` and
`move_slides`. Every tool that names a slide takes its `slideId`, and one rule
routes it
([slide_target.ts](client/src/components/products/copilot/ai_tools/tools/slide_target.ts)):
`readSlideTarget` reads the open slide (`getOpenSlide()` on the deck view's
context) from the editor's draft, so the model sees what the canvas shows, saved
or not, and any other slide as stored through `getSlide`, with the version its
write is checked against; `writeSlideTarget` writes back where the read was,
reconciling into the draft through the store's raw setter (the AI's edit is
never reported as the user's) or calling `updateSlide` under the optimistic
lock, whose `CONFLICT` becomes a re-read message. The write, not the read,
refuses a slide another collaborator has open (`assertSlidesNotBusy`), so a read
is never refused; it also refuses when the open slide the read saw is no longer
open (the user switched slides) and when a slide read as stored has since been
opened, so the open slide is only ever written through its draft. No handler
routes a slide by `getOpenSlide()` itself; `get_deck` reads it only to hand the
open slide to `getDeckSummaryForAI`, which prints the outline with the open
slide's line from its draft, marked "(open)". `update_slide` changes a slide in
place through a per-type union that must match the slide's type (a cover's or a
section's fields; a content slide's header, and either `blockUpdates` or
`layoutChange`, whose layout-spec resolution names the blocks it removes),
`update_figure` tweaks one figure's config, and `replace_slide` rebuilds a slide
or changes its type. The two writes that run the page optimizer (`create_slide`
and `replace_slide`) write the slide as asked and, when the layout they kept
overflows the page (`convertAiInputToSlide`'s `overflow`, the optimizer's
page-level `score.overflow`), append one sentence to their result naming the
slide's figure block ids and the fix: filter the indicator dimension, or choose
a preset with fewer rows, through `update_figure`. Text blocks autofit, so the
figure blocks are the cause; a slide with no figure block reports the overflow
alone. Nothing throws: the user can see the canvas badge and fix the slide by
hand, and the model has a line to act on in the same turn. The flag is sound and
incomplete: the optimizer scores the whole page box while the render gives the
layout that box minus its header and footer, so a layout it calls overflowing
always draws the badge, while a slide the header's height pushes over the edge
is written with no word to the model (Open items). The structure writes
(`create_slide`, `duplicate_slides`, `move_slides`) go through the product
routes and never open a slide: the deck's own rule (the first slide when none is
open) is the only thing that moves the editor on the AI's behalf.
`delete_slides` commits through the deck's `deleteSlides` (S12), the rail's own
sequence, so a deleted open slide hands the editor to its neighbour before the
request. The report's writes go through the live view context. The Figure editor
group
([figure_editor.ts](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts),
in the inner set, admitted in the three figure views): `get_figure_editor`
formats the draft with `formatFigureConfigForAI`, and `update_figure_editor`
runs `update_figure`'s validate-before-commit pipeline over the draft (apply the
patch, validate the edit, validate the metric inputs, resolve the bundle, check
slot collisions, all before anything changes) and then reconciles the new config
into the editor's store through `applyDraftConfig`, after checking the editor
that set the view is still current; its schema is `AiVizConfigUpdateSchema`, the
figure patch plus the chart type and the timeseries grouping, which the editor
can change and the figure tools cannot; it is approval-exempt, since the user
keeps or discards the draft with the editor's own buttons. `list_products`
([products.ts](client/src/components/products/copilot/ai_tools/tools/products.ts),
admitted on the Products page alone) lists the products the user can see, which
is what T1 holds, each with its folder path, its package by label (a package no
longer ready by its run id), its scope by display label and the user's level,
through the pure `formatProductsListForAI`
([lib/ai_tools/format_products_list_for_ai.ts](lib/ai_tools/format_products_list_for_ai.ts),
pinned by `server/tests/format_products_list_for_ai_test.ts`); the model never
opens or creates a product, since no tool navigates, and a draft slide goes only
into a deck on the pair it was drafted under. The preview card stores the view
its call ran in (panther's `AIViewSnapshot`, the id and identity) and renders
under that identity's pair, with the pair's metrics from the T2 authoring
context, so an old card keeps its package after a reattach; a card stored before
the engine recorded the view renders under the current view's pair and offers no
Add. The card offers "Add to this deck" from the deck view when the open deck is
on the draft's pair and the user can edit it, and is preview-only in a report,
on another package and for a viewer. From the deck view on the draft's pair the
card lays out under the open deck's config; elsewhere under the starting draft
config. Add runs through `createButtonAction`, so a failed `createSlide` alerts;
the button is disabled while the write runs and reads "Added to this deck" once
it has landed, so one draft adds once, and the expanded view offers Add only
while the card's button is enabled.

**Refusals come from one table through one wrapper.** Every user registers the
same tools, so the prompt cache survives every move; what a user may not do
refuses at the call.
[`tool_guard.ts`](client/src/components/instance/copilot/tool_guard.ts) wraps
each tool where the set is assembled and, before the handler or an approval's
`propose` runs, asks `copilotToolRefusal` (`lib/ai_tools/copilot_catalogue.ts`)
over the tool's requirement, the user's live permissions
(`instanceState.currentUserPermissions`), the live level on the view's product
(`productLevel`, S12, from the view's `productId`, `deckId` or `reportId`; null
in a view with no product) and the HFA write gate the assembler supplies, and
throws the table's reason as an `AIToolFailure`. So a viewer can read a deck or
report and ask about it while its writes refuse, `get_module_r_script` and
`get_module_settings` refuse without `can_view_data` and `get_module_log`
without `can_view_logs`, and a demotion reaches the next call. A tool outside
the catalogue fails the assembly. Below edit level a product view's instructions
carry the level line (above). The chat menu has no view-specific items: its one
such item, "Save this report's style…" for an html report, went with that format
on 2026-10-13, so the pane imports nothing from `components/products/`.

**The approval policy** is the chat's
`{ requireForKind: "write", requireKind: true, exempt: COPILOT_APPROVAL_EXEMPT }`
(`panel.tsx`), so a write tool is either exempt, as the direct editor writes to
what the user is looking at are (the catalogue's `COPILOT_APPROVAL_EXEMPT`: the
deck's slide writes but deletion, whether they land in the open slide's draft or
a stored slide, a report's figure by stable id, the figure editor's draft and
the HFA code editor's unsaved state), or declares its approval: `delete_slides`
takes a modal approval with intent danger whose preview lists the slides by
title and whose commit runs the deck's delete and marks the echo keys, and the
five staged report tools their diff. `validateAIChatConfig` runs on the
assembled config in DEV, so a write tool with neither fails on page load.

**Gating is declarative.** Every product tool (the slide tools, the report tools
and the draft preview) is a standalone
`createAITool({viewRegistry: copilotViews, availableIn: COPILOT_TOOL_VIEWS.<name>})`
declaration, its views the catalogue's (`lib/ai_tools/copilot_catalogue.ts`), so
no client tool carries a hand-typed view list: the engine refuses out-of-view
_executions_ before the handler runs (all tools stay in the API request:
definitions are cached prompt prefix), and it injects the live view state
(params + context) into the handler, typed to the declared views. The ~23
hand-rolled `aiContext()` mode guards are deleted.

The editing views' contexts carry the live-mutator closures the old union did,
each beside the product's `getScope()` and `getRunId()`: the deck's
`getDeckConfig`/`getSlideIds`/`getSelectedSlideIds`, `getOpenSlide` (the open
slide's id, its draft store and the store's raw setter, one object per editor
mount, so a handler that captured it compares it by reference before writing)
and `deleteSlides`; and the report contract
(`getLabel`/`getBody`/`getFigures`/`getImages`/`getSelection`/`proposeEdit`/
`applyFigureUpdate`). See
[ai_views.ts](client/src/components/instance/copilot/ai_views.ts).

**Report edits are never silent**: they ride panther's approval lifecycle. The
five staged tools (`rewrite_report {body}`, `rewrite_section {newBody}`,
`replace_text`, `insert_figure`, `replace_figure`) declare `approval.propose`
([report_editor.ts](client/src/components/products/copilot/ai_tools/tools/report_editor.ts)).
There is ONE report format, FASTR Markdown (S12), so nothing here branches on a
format any more. The html and plain-markdown formats were retired on 2026-10-13
and took their AI surface with them: the html authoring branch of the
instructions, the `REPORT_STYLE_BRIEFS` and the custom-style design briefs with
the chat menu's "Save this report's style...", the stylesheet check on
`rewrite_report`, the html well-formedness validators and the wrapper/flat
section modes. The `editing_report` view params are the report's id alone (its
label is read live through the context's `getLabel`), and its instructions are
`getEditingReportInstructions(label, { untouched })`
([lib/ai_tools/build_system_prompt.ts](lib/ai_tools/build_system_prompt.ts)).
`untouched` is `isUntouchedReport` over the live body, figures and images (a
title line alone, no embeds): while it holds, the instructions carry "Starting
this report", which has the model ask a brief (at most three questions, one
message), read the data, propose a data-grounded outline in chat and wait for
approval, then write the draft in one `rewrite_report` and add the outline's
figures with `insert_figure` after it is accepted. The text changes once the
body holds anything, so the next message carries the plain editing brief. Tokens
are built and parsed through the engine's helpers
(`report-forge/engine/embeds.ts`). `get_report_editor` prints the body, a
headings index (each top-level heading's 1-based line and the exact section
range, from `report-forge/engine/report_sections.ts`), a one-line index of the
figures (one that reads as a retired metric's successor, or has no metric in the
package, says so beside its stored id), the image ids and the user's selection;
`rewrite_section` splices that range; `insert_figure.afterHeading` lands on the
line after the heading (`insertAfterReportHeading`). A proposed body is refused
before anything is staged when it names an embed id the report does not have,
writes an embed as an html `<img>` token (the message gives the correct
spelling), exceeds the body cap or breaks one of the format's rules below.

Nothing in the copilot MINTS a report: creation is the products page's
`createProduct`, which always mints FASTR Markdown (S12). The copilot's report
surface is therefore the open report alone, `editing_report`, and it includes
`get_report_pages`: the draft or the live body laid out as the printed pages, so
a rewrite can be checked against the page budget BEFORE it is proposed. The
three text tools (`rewrite_report`, `rewrite_section`, `replace_text`) carry the
literal-colour gate delta-based (`checkFastrNewLiteralBackgrounds`): only
literals whose value is not already in the current body trip it, so
user-sanctioned colours survive rewrites, and `allowLiteralColors` is the
deliberate escape hatch for when the user asked for exact colours.

**A figure tool sees what the reader sees.** Every report figure tool, read or
write, and the page map, resolve their figures through `reportLiveFigures`
([lib/report_live_figures.ts](lib/report_live_figures.ts)): registered in the
report AND referenced by the body. References come off the RENDERER's tokens
(`fastrBodyReferences`), not a scan for the canonical token text, for the same
reason `checkReportTokensResolve` does: the document resolves an embed written
any markdown way (a title after the destination, a reference link, an
angle-bracket destination), and a figure the reader can see must not be one the
tools refuse to index, read or lay out. `get_report_editor` indexes those only,
`get_report_figure` refuses an id outside them and lists only live ids in its
message, `update_report_figure` and `replace_figure` need no separate
"registered but its token isn't in the body" branch because the one lookup is
that check, and `get_report_pages` lays out those only, so the paginator stops
measuring a raster box for every orphan and waiting out `SIZE_WAIT_MS` on sizes
that never land. The registry and the body do drift: `replace_figure` swaps a
body token for a fresh id and leaves the old entry registered, and unreferenced
entries are pruned at LOAD, never in session, so an editor undo can bring a
token back (S12). An orphan is not the model's to see. Indexing it cost a turn:
its line carried the caption the user had asked to keep, so a model aiming at
"the figure with that caption" picked the orphan and was refused. `embedIdsOf`,
the allowed-id set for a PROPOSED body and what `readReportText` is handed as
`embeds`, keeps reading the full registry, because a proposed body may re-embed
a still-registered id. `server/tests/report_live_figures_test.ts` pins the
helper.

**The text core of these tools is Report Forge's, not the copilot's.** The body
half of `get_report_editor` and the three write tools run on the package's pure
operations (`readReportText`, `rewriteReportBody`, `rewriteReportSection`,
`replaceReportText` in
[report-forge/ai/operations.ts](report-forge/ai/operations.ts)): each takes the
current body and the model's arguments and returns the new body with its
summary, or the message the model reads. The checks a proposed body must pass,
and every message, live beside them as `check*` functions returning the message
or undefined ([report-forge/ai/validators.ts](report-forge/ai/validators.ts)).
The copilot keeps the tool names, zod schemas, descriptions and the approval
flow
([report_editor.ts](client/src/components/products/copilot/ai_tools/tools/report_editor.ts)),
turns a refusal into an `AIToolFailure` and an unchanged body into `{skip}`, and
owns everything about figures; `report_validators.ts` is now two throwing
wrappers for the figure tools. The same core is offered to any other host as
ready-made tools (`createReportTextTools`), so there is one implementation of
each text edit; `report-forge/tests/ai_tools_test.ts` pins the messages.

`proposeEdit` stages the package's CodeMirror diff (`ReportMarkdownDiff`) as the
`customProposalUI`, an identical-body proposal short-circuits to panther's
`{skip}` (a normal no-decision result), `stillValid` guards a stale accept
against a torn-down editor, and `commit` rebases over concurrent collaborator
edits (reporting skipped hunks); leaving the view auto-declines via
`availableIn`. `applyFigureUpdate` is the stable-id figure path that persists
directly and reports save failure (`update_report_figure`: no diff, the figure's
body token doesn't change).

**The model never designs.** The retired html format had it write a stylesheet
per report; in FASTR Markdown the design already exists as a real theme
stylesheet, so the brief is `FASTR_MD_SYNTAX_DOC`
([report-forge/engine/fastr_markdown_spec.ts](report-forge/engine/fastr_markdown_spec.ts),
the ONE reference: `rewrite_report`'s description and the package's own
ready-made tools embed it, so they cannot drift) plus an explicit "never write
CSS, a `<style>` block or raw layout HTML; reach for a block instead": such
markup would be INERT and would break the user's ability to re-theme. The brief
deliberately never NAMES the theme, because the theme is changeable at any time
(S12's theme modal) and a name in the view params would go stale. The brief
rides `rewrite_report`'s description alone (in the request's tools array, cached
once per conversation); the `editing_report` instructions point at it, so a
report's first request carries the doc once
(`server/tests/copilot_prompt_test.ts`). `checkFastrContainers`
([report-forge/ai/validators.ts](report-forge/ai/validators.ts)) rejects an
unbalanced or misspelt `:::` before staging (an unclosed container runs to EOF)
and it checks the SPLICED result, not the fragment, so a locally balanced
`newBody` that unbalances the document is still caught. The brief moved into
`rewrite_report`'s description on 2026-09-23: with the chat's one-shot
`create_report` gone in v2, `rewrite_report` on a fresh report IS how a report
gets written from a prompt, and the brief in the per-turn view section alone
left the model writing plain markdown into FASTR reports (the lesson
`create_report` had already learned on 2026-09-02). The contract is hard:
`checkFastrRewriteUsesBlocks` refuses a whole-body rewrite of twelve or more
non-blank lines that uses no `:::` block unless the model passes `plain: true`,
which it does only when the user asked for a plain document; `rewrite_section`'s
description points at the same blocks for a section. Same day, at Nick's
request: a stat is a tile of its own, never nested in a card or a column (the
brief used to say a stat "reads well inside a card"); `checkFastrStatPlacement`
(over `listFastrNestedStats` in the engine) refuses such a body on all three
staged text tools.

**Validate-before-commit.** `update_figure` (any slide, open or stored) and
`update_report_figure` share one pipeline, run on the metric and config
`resolveFigureMetric` gives the stored figure (S10 "The captured pair and
staleness": its own metric, or a retired metric's successor with the config
carried across, so an edit of such a figure stores it as its successor and
reports the move in its success message; a figure with neither refuses, naming
the retired module and the missing successor when the metric is a retired one,
else the bare id), the same resolution `get_slide` and `get_report_figure` print
above a figure whose metric is not the package's own: `applyFigureConfigPatch` →
`validateFigureConfigEdit` (pure config checks: slots, a map's mapArea
dimension, field liveness, roll-up structure, pre-write collision) →
`validateMetricInputs` (live data) → `describeFigureConfigPatchEffect` (the
per-field leave-one-out change report in the success message) →
`resolveBundleFromMetricAndConfig` (the replicant against its options, a map's
boundary file against the instance's map list, the items read, then
`buildFigureInputs` over the bundle, the renderer's own derivation, so a bundle
the figure would show as "could not be displayed" is refused with the render
message instead of committed), _before_ any store write, so a throw provably
means "nothing changed". The from_metric create path and the report figure tools
share the resolver, so they share its two refusals. Pure config checks live
beside the pipeline in `client/src/generate_visualization/` (S10's glob,
deliberately: they are S13 machinery); the fetched-data check
(`validateMetricInputs`, the SPA's fetching wrapper around
`validateMetricInputsAgainstValueInfo`, the check `/mcp` runs inside
`getMetricDataForAI`) lives in `lib/ai_tools/content_validators.ts`. The
accepted-but-inert-patch rule (Type 1 / Type 2) is stated once, in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

**Tools are registered once and bind per call.** Panther registers
`config.tools` into its `ToolRegistry` once at chat construction and never
re-reads the array, so the registered set closes over nothing that moves: every
package tool is an outer tool
([bind_package_tools.ts](client/src/components/instance/copilot/bind_package_tools.ts),
panther's `bindAIToolToView`) whose call resolves the pair of the view it runs
in (`getScope` on the view's context) and runs the same-named tool of an inner
set built over that pair's env, its T2 authoring context and the HFA rounds
`hfaTimePointsForAI` keeps, cached by `packageToolsKey` (run, scope, definition
hash, rounds), so a reattach, rescope, scope edit or time-point import binds at
the next call with no remount; the module internals bind by the view's run id
alone (`getRunId`, `createModuleInternalsEnv`), so they answer for a package
that is still generating or has failed. A view whose `getScope` throws refuses
the call with its reason; an authoring-context read that fails refuses the call
with the read's error and the next call reads again; every read of a pair-bound
set opens with the Source line, a run-bound read with the package and no scope,
and writes and failures pass through. The templates the chat registers come from
one run of the inner builder over a throwing env and an empty authoring context,
as `/mcp` builds its boot-time templates.

## Tool input schemas

The architecture half of the schema story (the authoring recipe is
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)):

- **AI schemas derive from storage schemas.** `configDStrict`
  ([lib/types/_metric_installed.ts:161](lib/types/_metric_installed.ts#L161), a
  strip-mode `z.object` despite the name; `filterBy[].values` and `valuesFilter`
  carry `.min(1)`) is the source of truth. Two derived surfaces exist, both in
  [ai_input.ts](lib/types/ai_input.ts): `AiMetricQuerySchema`
  (filters/disaggregations/valuesFilter via `.shape.*`) and
  `AiFigureConfigPatchSchema` + `LayoutSpecSchema`, used by
  `update_figure`/`update_report_figure`. The documented exception pattern
  (`startDate`/`endDate` instead of the full `periodFilter` union, converted
  against the metric's most-granular time column) is preserved everywhere, as is
  the patch schemas' open-ended `periodFilter {min?, max?}`, where an omitted
  max stores `from_month` "to present".
- **Layer-1 enforcement lives in panther**: `createAITool` re-parses input
  inside `run()` and converts a ZodError to `AIToolFailure`
  ([tool_helpers.ts:590-602](panther/_112_ai_tool_core/tool_helpers.ts#L590-L602));
  the engine catches any throw and returns `is_error: true` so the model
  self-corrects
  ([tool_engine.ts:333-343](panther/_305_ai/_core/tool_engine.ts#L333-L343)).
  **The failure channel** (authority: DOC_AI_CHAT.md "Failure channel", panther
  repo root): handlers throw `AIToolFailure` for ANY anticipated failure (bad
  id, missing referent, failed server call) with the message as the complete
  user-presentable record (clean display, no stack; ~64 sites across the copilot
  tools); plain `Error` is reserved for genuine bugs (full-stack display).
  Handlers must throw, never return error strings.
- **Layer-2 (data-dependent) validation** splits by surface. The metric-query
  validators both surfaces run (dimension availability per metric, date
  format/ordering, filter values and period bounds against live data:
  `validateAiMetricQuery`, `validateMetricInputsAgainstValueInfo`) live in
  [lib/ai_tools/content_validators.ts](lib/ai_tools/content_validators.ts); the
  SPA reaches the second through `validateMetricInputs`, which fetches the value
  info from `env` first, while `/mcp` calls it directly from the
  `get_metric_data` read that already holds the value info. The SPA-only
  slide/report content checks live in
  [content_validators.ts](client/src/components/products/copilot/_shared/content_validators.ts)
  (`validatePresetOverrides` composing lib's filter and date-range primitives,
  block count, word count, markdown tables) and
  [report_validators.ts](client/src/components/products/copilot/ai_tools/validators/report_validators.ts)
  (token resolution, body caps).

## The slide_ai conversion layer

The S13-owned files in `client/src/components/products/copilot/slide_ai/`
convert between AI input shapes and stored `Slide`/`FigureBundle` shapes; every
slide tool calls the same resolvers, whichever slide it writes:

- [build_config_from_preset.ts](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts)
  converts AiFigureFromMetric → `PresentationObjectConfig`: preset spread over
  defaults, AI overrides applied (filters gated by `preset.allowedFilters`,
  startDate/endDate → `custom` periodFilter via `convertPeriodValue`).
- [resolve_figure_from_metric.ts](client/src/components/products/copilot/slide_ai/resolve_figure_from_metric.ts)
  is the AI adapter over the shared bundle resolver, taking the target product's
  `PackageScope` as its first argument: what the figure resolves under is the
  caller's decision, never the file's. AI paths get _strict_ replicant
  validation (`assertReplicantValid` throws) where non-AI callers keep the
  lenient auto-default.
- [convert_ai_input_to_slide.ts](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts)
  converts AiSlideInput → stored `Slide` under a `PackageScope`: resolve blocks,
  run a provisional slide through `convertSlideToPageInputs` so the optimizer
  gets the page's chrome, style and items exactly as the renderer draws them,
  `optimizePageLayout` at the canonical page frame, restore the blocks by id,
  and `slideConfigSchema.parse` the result (validate-at-construction, the
  add-to-deck ZodError lesson). It returns `{ slide, overflow }`, the kept
  layout's page-level overflow beside the slide, the same flag the deck's page
  holder badges; the draft tools ignore it, the deck writes report it.
- [get_slide_with_updated_blocks.ts](client/src/components/products/copilot/slide_ai/get_slide_with_updated_blocks.ts)
  is targeted block replacement preserving what the AI schema can't express
  (text styles, node-level layout overrides);
  [layout_spec_helpers.ts](client/src/components/products/copilot/slide_ai/layout_spec_helpers.ts)
  is `LayoutSpec` (rows/12-col spans, `normalizeSpans` enforces sum-to-12) ↔
  `LayoutNode`;
  [extract_blocks_from_layout.ts](client/src/components/products/copilot/slide_ai/extract_blocks_from_layout.ts)
  is `simplifySlideForAI`, the model-facing slide view;
  [get_deck_summary.ts](client/src/components/products/copilot/slide_ai/get_deck_summary.ts)
  is the deck outline for `get_deck` (slides read through
  `getSlideFromCacheOrFetch`, so a fresh session's first call sees content).

## System prompt, documents, prompt library

**System prompt**
([build_system_prompt.ts](client/src/components/instance/copilot/build_system_prompt.ts)):
instance/terminology section (country, admin-area labels, data sources) + data
coverage + the instance-level `ai_context` (`buildAiContextSections`, the shared
block `/mcp`'s `get_overview` also carries after its data coverage) + the
one-line reference-docs pointer + base instructions (the app's role,
read-data-first, no fabrication, the standard a written claim must meet, ask
when uncertain, indicator directionality).

The claim standard (`getBaseInstructions` in
[lib/ai_tools/build_system_prompt.ts](lib/ai_tools/build_system_prompt.ts),
pinned by `server/tests/copilot_prompt_test.ts`) covers the shapes a model gets
wrong while reading its own tool results correctly: a comparative or superlative
is a claim about EVERY row returned, so it is re-read before it is written and a
series is described by its whole shape rather than smoothed into a trend; a
claim that a value is near a declared threshold band is checked against the
band's own cutoffs, which the Dimension Summary prints with their operators, so
a value already inside the band is not "approaching" it; a period that
`get_metric_data`'s "Period coverage" line shows ending short of its unit is
labelled partial wherever it is used, an endpoint included; and a change to a
product is described only as the tool result reports it, so nothing is narrated
as having drifted from a state no result shows. It lives in the shared base and
not in either brief, so one edit reaches every view and `/mcp`, and the deck and
report briefs cannot drift apart. It is prompt text, not a guarantee: nothing in
code validates a claim.

The prompt is **instance level**: no date, no package section, no viewer
sentence and no tool catalogue, so only an instance input changes it and one
conversation keeps one prompt through every view and package. What used to ride
it rides elsewhere: the date and the package in view are the consumer blocks
above (the package block holds the package label and generation time, the
scope's label and one line per dataset family saying what its section does:
excluded, included with no limits, or limited to an area, years, time points,
modules, indicators, HFA categories and HFA service categories, each listed in
full, with the rule that a limit applies only to a table that has a column for
it; then the package's datasets, indicator lists and calendar); the level line
rides a product view's instructions below edit; the per-view instructions (still
exported from this file, with short primary-tool pointers; the Products, Data
page, Assets, Users and user detail views name their page, the figure views the
figure by its label and its host, and the results file view its module and
object) and the view states of the Results, Explore and Data pages
(`formatExploreState`, `formatPackageState`, `formatResultsPackagesState` and
`formatDataState`, this file too) are composed per view by the view registry
([ai_views.ts](client/src/components/instance/copilot/ai_views.ts)); and the
tools ride the request's tools array, never a catalogue in the prompt
(`server/tests/copilot_prompt_test.ts` pins the absence; `get_overview` is the
one surface that asks `buildSystemPrompt` for a date and a catalogue). The
`AI_DEBUG` flag in `state/t4_ui.ts` (localStorage `fastr:ai-debug` = `"1"`, read
at page load, off by default) makes each new user bubble the exact text sent,
its context block then what was typed (panther `showSentContext`), and installs
`window.__copilot`
([debug_api.ts](client/src/components/instance/copilot/debug_api.ts)) while this
tab owns the chat: `requests()` holds every POST the SDK made to the proxy with
its body as serialised (recorded in the SDK client's fetch wrapper, bounded to
the last 100), which is what the model received; `nextTurn()`, `messages()`,
`tools()`, `config()`, `view()`, `conversationId()` and `isLoading()` read the
engine and the view controller live. The chat menu's View system prompt shows
the blocks the next message would carry, through the instance's
`getNextTurnPreview()`, then the system text; the debug panel
([ai_debug_panel.tsx](client/src/components/instance/copilot/ai_debug_panel.tsx))
renders the metric-list formatter verbatim so a human sees exactly what the
model sees. AI data payloads exclude the admin-area roll-up row (double-counting
guard, S9).

The instance `ai_context` is one `instance_config` row (`ai_context`), edited
from a row on the Data page behind `can_configure_settings`
([ai_context_form.tsx](client/src/components/data/general/ai_context_form.tsx),
`updateAiContextConfig`), and rides `InstanceState` with the rest of the config,
so the SPA prompt reads it from T1 with no fetch and `/mcp`'s `get_overview`
reads it from the instance state its context cache holds per user for 30 s
(`resolveInstanceState`, `server/mcp/context_cache.ts`).

**Documents.** `useAIDocuments` keeps `{assetFilename, anthropicFileId}` pairs
in IndexedDB, one instance-wide upload registry shared by every product's
copilot and pending attachments per conversation id
([t4_ai_documents.ts](client/src/state/products/t4_ai_documents.ts), keys
`ai-documents/copilot` and `ai-attachments/copilot/<conversationId>`; T4:
per-browser, no server copy, no invalidation when the underlying asset is
replaced). The selector modal lists instance PDF assets and uploads new
selections through `POST /ai/files`; `getDocumentRefs` feeds panther, which
attaches each configured document to the next user message the conversation
hasn't yet sent it in, so mid-conversation attach works. The remaining lifecycle
gap is asset replacement, which the IndexedDB pairing never notices (Open
items).

**Prompt library.** Shared prompts fetched at open from the GitHub
`fastr-resource-hub` (`prompts.md`/`prompts_fr.md`, cache-busted; parsed by
[parse_prompts.ts](client/src/components/instance/copilot/ai_prompt_library/parse_prompts.ts))
plus custom prompts, user-scoped and country-scoped rows in the main DB
([lib/types/custom_prompts.ts](lib/types/custom_prompts.ts); registry routes
[custom_prompts.ts](server/routes/instance/custom_prompts.ts)). Reads return
country-scoped ∪ own user-scoped; create stamps a server UUID + `createdBy`;
update/delete require author-or-admin in SQL. Because
`requireGlobalPermission()` with zero permissions never checks `approved`, every
handler rejects unapproved users itself, and creating or re-scoping a prompt to
`"country"` (a prompt-injection surface offered to every user's copilot) is
admin-only. `created_by` is FK-cascade on user delete, so deleting a user
silently deletes their country-scoped prompts too.

## The panther engine (what this app depends on)

First synced at commits 62ed6c03/ca3ae868 (SDK 0.71 → 0.110) and repeatedly
since. The chat also depends on the engine's views/gating/interactions/approval
surface (`defineAIViews`, `createAIViewController`, `defineAIInteractions`,
`availableIn` gating, `approval.propose`, `buildToolCatalog`,
`validateAIChatConfig`). The consumer rulebook is the vendored
[PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md); the full
contract doc is DOC_AI_CHAT.md at the panther repo root (not vendored). The
parts S13 relies on, verified this cycle:

- **Request shaping**
  ([request_shaping.ts](panther/_110_ai_types/request_shaping.ts)): ≤3
  prompt-cache breakpoints placed per send (system, last user message, last
  document block of the last document-carrying user message; stored state never
  carries `cache_control`); per-model resolution of thinking and effort
  (prevents 400s across the whole allowed-models list, including adaptive-only
  Opus 4.8); persisted settings sanitized against retired model ids and caps at
  init.
- **Turn logic** ([turn_logic.ts](panther/_110_ai_types/turn_logic.ts)):
  stop_reason → done / halt (refusal, truncation, context-exceeded) / pause_turn
  resume / tool loop / caps, recursion bounded by `MAX_TURN_CONTINUATIONS = 24`
  (`panther/_305_ai/_components/_create_ai_chat.ts`). Both capped **and halted**
  turns synthesize cancelled tool_results, so persisted history never ends in
  unresolved `tool_use` (which would 400 every later send); a cap-pause trim
  that empties an assistant message persists a placeholder text instead. Halts
  render as `system_notice` display items.
- **Built-in server tools**
  ([builtin_tools.ts](panther/_305_ai/_core/builtin_tools.ts)):
  webSearch/webFetch resolved per model; on non-dynamic models the basic
  variants + `web-fetch-2025-09-10` beta, which only works because the proxy
  forwards allowlisted client beta headers.
- **Every continuation round is a separate proxy POST**, so each round is
  independently limit-gated and logged. The multi-turn design has no unlogged
  turns; the remaining accounting gap is server-tool request fees (Open items).
- `one_shot.ts` (`callAI`/`callAIStructured`) exists in the barrel but has
  **zero consumers in this app**.

## The HFA tools (S5-owned, S13-governed)

`client/src/components/data/hfa/indicators/ai/` holds the HFA reads, HFA writes
and HFA editor groups of the catalogue, registered in the one chat by
`copilot_tools.ts` like every other tool and gated by view: the four reads in
the three HFA views, the three writes (`create_hfa_indicators`,
`update_hfa_indicators`, `delete_hfa_indicators`) in `hfa_indicators` alone, and
the editor tools (`get_hfa_indicator_editor`, `update_hfa_indicator_editor`,
`editor_tools.ts`) in `hfa_indicator_editor` alone. Who may call them refuses
through the guard: the reads need `can_configure_data`, the writes and
`update_hfa_indicator_editor` the manager's write gate,
`canWriteHfaIndicators()` (`indicators/write_gate.ts`, today global admin),
which the manager's indicator write controls read too, so SYSTEM_05's open
decision on that gate moves both at once. Every HFA route keeps its own guard.
The three writes declare `approval.propose` with `presentation: "modal"`
(panther owns the propose → modal → commit lifecycle); the editor write is
exempt, since it lands in the open editor's unsaved draft, which the user saves
or discards. The HFA guidance (the model, type and aggregation, the grammar and
how m010 evaluates the code, scope, how to work) is `instructions.ts`'s
`getHfaIndicatorsGuidance`; it rides both the manager's view and the editor's,
each through its context and under its own lines
(`getHfaIndicatorsInstructions`, `getHfaIndicatorEditorInstructions`), is
neutral between them, names no tool, since the registered tools describe
themselves, and promises no diff.

Every read returns English text built by a pure formatter in
`lib/ai_tools/format_hfa_indicators_for_ai.ts`, pinned by
`server/tests/format_hfa_indicators_for_ai_test.ts`, over the indicators, the
taxonomy, the main and variant code, the dictionary, the status core's result
(SYSTEM_05) and the display rows. `get_hfa_indicators` prints the taxonomy
(categories with their sub-categories, service categories, variant groups with
their items, each `id: label`), a count line and one line per indicator (id,
long label, type and aggregation, category, sub-category and service categories,
variant group, rounds with main code out of all rounds, round status counts,
consistency); it filters by `search` (the manager's search text, through
panther's `searchTokens` and `matchesSearch`), category, service category,
status (`error`, `warning` with no error, `inconsistent`, `none`), missing
category, missing short label and `namesVariable` (indicators whose main, filter
or variant code names one of the ids, through `hfaVariableUsage`); a status
filter adds each round's issues, and `withCode` ends each line with the main
code and filter, once when every round holds the same, "differs by round" when
they differ and "none" without code; variant code is not shown.
`get_hfa_indicator_details` prints the detail block for its ids: each indicator
in full (labels, measure, categories, variant group and items, per round the
code, filter, variant code, status and issues), then every variable the set's
code names, once (per round its label, type, options with their sentinel class
and a mark on a text code, which m010 reads as missing, and the facility counts
and values present), then every other indicator the code names, once.
`get_hfa_variables` prints one line per variable (label, type, and per round it
is in the number of indicators whose code names it), filtered by `search`,
round, and `unusedOnly` (a variable no code names in some round it is in,
structural columns excluded). `get_hfa_variable_details` prints each variable's
per-round detail with the indicators naming it, and lists an id in no round as
not found. Every per-round block, of an indicator or a variable, prints once
when its lines are identical in several rounds, headed by those rounds' names
and "(identical)". The two detail reads take at most 20 ids and refuse more,
naming the cap. The display rows are read only when the user also holds
`can_view_data` (the route's own guard); otherwise the output carries one line
saying the counts and values present need that permission.

A write refuses before it proposes: `propose` loads fresh state and throws
`AIToolFailure` on an unknown category, sub-category, service category, variant
group, item or round, a sub-category outside its category, an item outside the
indicator's group, a composed variant column (`composeHfaVariantColumnName`)
that is reserved or names an indicator or a survey variable, and an error issue
the status core finds in a field the call writes (for a create, every field).
Issues in fields the call leaves alone, and every result-type warning, ride the
preview and the result. `create_hfa_indicators` takes each indicator's fields,
variant group, per-round code and per-item variant code. `update_hfa_indicators`
takes any mix of an indicator's fields, group, code and variant code: a round or
variant row not listed is kept, an omitted `rCode` or `rFilterCode` is kept and
`""` clears it, clearing `rCode` removes the round's code, and a variant row's
`rCode: ""` removes it; a category change clears a sub-category that no longer
fits and a group change drops the previous group's variant code. It returns
`skip` when nothing given differs from stored state; its result reports each
given field as changed or no change, the dropped variant code and the issues
left in place. It commits through `saveHfaIndicatorsBatch`, passing main or
variant code only for the indicators whose call wrote it. Both present through
`customProposalUI`, as the report editor's writes do: `HfaProposalDiff`
(`ai/proposal_diff.tsx`) is a wide modal holding a CodeMirror `MergeView` that
highlights what changed and folds what did not, so a batch of many indicators
stays readable. Its two panes are the preview's `diff`, which the timeline
records: every indicator the call creates or changes laid out as text (its
header, fields, and per round the code, the filter and each item's variant code,
warnings beside the round), stored against proposed, the stored pane empty for a
create. `delete_hfa_indicators` keeps panther's built-in dialog and labels each
change with the id and the full label. `create_hfa_indicators` reports what the
batch route created and, on a "Not created:" line, each id another save took
between the proposal and the acceptance. Every anticipated failure throws
`AIToolFailure` carrying the server's error (zero plain-`Error` throws in
[tools.ts](client/src/components/data/hfa/indicators/ai/tools.ts), the
failure-channel ruling above). The survey dictionary and the dataset display are
read through the manager's T2 caches; the indicators, the taxonomy (variant
groups and items included) and the main and variant code are read fresh on every
call, so the model acts on current state, its own earlier writes included. Write
commits do whole-object load → propose → save, last write wins: the app-wide
concurrency model, deliberate (a re-read-after-confirm refactor was rejected as
an inconsistent outlier); an update batch carries only the indicators it
changes. `get_hfa_indicator_editor` reads the draft the view's context returns
synchronously, then awaits the display rows as the reads do, and prints the
detail block (`formatHfaIndicatorDetailsForAI`) over the manager's indicators
and code with the draft in place of the indicator's saved state, headed as the
unsaved state and naming the round the user is looking at.
`update_hfa_indicator_editor` never awaits, so the editor that set the view is
the one the write reaches: it checks its ids against the taxonomy, its rounds
against the rounds the editor offers, its items against the group the patch
leaves, and a round or a variant row listed twice, before the draft changes;
applies the patch through `applyDraft` (a group change drops the previous
group's variant code); and reports each given field as changed or as no change,
the dropped variant code, and each round's status from the core. The write and
editor schemas derive from the contract schemas in
`lib/api-routes/instance/hfa_indicators.ts` (`hfaIndicatorEditSchema`,
`hfaIndicatorCodeSchema`, `hfaIndicatorVariantCodeSchema`) through `.shape` and
`.omit`; every schema complies with the S13 conventions (storage field names,
throw-don't-catch, `.min(1)` on inclusion lists, no strictObject / strict:true).
S13 convention changes must be checked against this directory; its tool
semantics are S5's.

## Traps

- **The proxy is a body-verbatim forwarder.** Anything panther's shaping adds
  (mid-conversation system messages, new SSE event types) passes through
  untouched, but the _usage parser_ reads specific event shapes
  (`message_start`/`message_delta`); an Anthropic event-shape change silently
  zeroes logged usage. New betas panther starts sending must be added to
  `FORWARDABLE_BETAS` or they are silently dropped.
- **Governance changes go in `anthropic_messages_proxy.ts`**, never in the mount
  file, which is deliberately logic-free.
- **Don't wrap proxy responses in `APIResponse`**: the client SDK parses
  Anthropic shapes. Equally: don't let new failure paths fall to `app.onError`,
  which returns an envelope at HTTP 200 the SDK can't parse.
- **Tools are registered once at pane mount.** Nothing a registered tool closes
  over may move afterwards: a value that depends on the pair (the env, the
  authoring context, the HFA rounds) lives in an inner set the outer tool binds
  to per call (`bind_package_tools.ts`), keyed by `packageToolsKey`. Do not
  build a package tool over a mount's pair, and do not reintroduce a store the
  tools read live.
- **`z.strictObject` and `strict: true` are banned in tool schemas**. See
  PROTOCOL_APP_AI_TOOLS.md.
- **Token limits are token-denominated, not dollar-denominated.** Cache tokens
  don't count, model price varies 10× and is client-chosen, server-tool fees are
  flat-rate per invocation. Treat the limits as volume brakes, not budget
  enforcement, until the Open items below are decided.

## Open items

Triaged findings from the first review cycle. Two same-day fix batches closed
the governance HIGHs (delta-based usage parsing, cancel-hook accounting, beta
allowlist, NaN boot validation, shared-handler extraction), the custom-prompts
gate, the truncation brick (panther turn-logic + max_tokens raise/expose), the
panther modelConfig/labels/cap-pause items, and the client-copilot findings
(filter-schema template, mid-conversation PDF attach, file DELETE on remove,
`update_viz_config` live-data validation, `switch_tab` reports, `get_deck`
fetch-on-miss, tools-reactivity memo removal, ai_files env/URL cleanup,
Anthropic-shaped thrown errors, CORS header enumeration, and the LOW hygiene
tail). The HFA whole-object read-modify-write finding was **rejected**: it
matches the app-wide last-write-wins model (see the HFA tools section).
Remaining:

**Report figure references (fixes in `report-forge/`, the submodule)**

Both are gaps between what `fastrBodyReferences` reports and what the document
resolves, so they land in the shared reader, not here. Its own contract comment
(`report_fastr_markdown.ts:733-735`) says "Every figure:/image: the document
will try to resolve", which is what `reportLiveFigures` relies on.

- **[MED] A raw-HTML `<img src="figure:<id>">` is resolved by the document and
  is not reported as a reference.** `html: true` is set, the compiler leaves
  author HTML as written, and `REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP`
  whitelists the `figure:` scheme, so `materializeReportEmbeds` rasterises it
  exactly like a token's. The figure tools therefore refuse to index, read or
  lay out a figure the reader can see. Such bodies are expected to exist:
  `checkReportTokensResolve` refuses an HTML embed only on the delta,
  deliberately leaving one already in the user's document alone. Edit: in
  `report_fastr_markdown.ts`, walk `html_inline` and `html_block` content for an
  `<img>` `src` and feed it to the same `embed` helper.
- **[LOW] `bg=figure:<id>` is reported as a figure reference and renders
  nothing.** `fastrBodyReferences` calls `embed(v, line)` on every
  `bg`/`background` value and `EMBED_REF_RE` accepts `figure|image`, but the
  renderer's `EMBED_BG_RE` accepts `image:` only, so the value is dropped. That
  makes a figure live that is on no page: the orphan failure mode from the other
  side. Only reachable from a hand-typed body, because `checkFastrContainers`
  refuses the attribute on the AI write path. Edit: in
  `report_fastr_markdown.ts`, guard that call with
  `if (v.trim().startsWith("image:"))`, which also makes the code agree with its
  own doc comment.

**Governance policy (decisions, not bugs)**

- **[MED] Cache tokens excluded from limit counting** while panther now
  guarantees cache breakpoints on every request, so most long-conversation input
  is limit-free. Decide the policy (count at a weight, or state it's
  intentional).
- **[MED] No server-side model allowlist**: the proxy forwards any `model`; the
  client list is advisory. Per-token price varies ~10× under the same numeric
  limits.
- **[MED] Server-tool request fees invisible**: `server_tool_use` counts are
  neither logged (needs an `ai_usage_logs` column/migration) nor bounded
  (`max_uses` unset).
- **[LOW] Check-before/increment-after race**: concurrent requests overshoot
  limits by ~concurrency × max_tokens; acceptable for a courtesy limit, stated
  here so it's deliberate.
- **[LOW]** Daily-counter date compared in JS UTC but written with Postgres
  `CURRENT_DATE`, which drifts if the DB isn't UTC.

**Security / access**

- **[MED] Public `/ai_usage`** returns per-user emails + per-call behavior,
  unbounded full-table scan; the other health routes expose aggregates. Decide
  the exception or add guard/limit.
- **[LOW]** The Files upload hardcodes `application/pdf` for all assets.

**Client copilot**

- **[MED] Documents never invalidate on asset replace**: the per-browser
  IndexedDB `{assetFilename, anthropicFileId}` pairing keeps serving the old
  Anthropic file after the underlying instance asset is replaced.

**HFA tools (fixes are S5's to land; contract is S13's)**

- **HFA tool hardening** (S–M, from the retired HFA plan). The tools are in
  [client/src/components/data/hfa/indicators/ai/](client/src/components/data/hfa/indicators/ai/),
  registered in the one chat with a modal approval per batched write. Remaining,
  in priority order: (1) **Taxonomy editing**: the tools can assign categories
  but cannot create or rename them; decide whether that stays manual. (2) No
  per-conversation cost cap (only the shared instance/user token limits). (3) No
  telemetry on the tools' accept and reject rates.

**Surface gaps: read-projection ≠ write-schema ≠ stored-shape**

From the read-only audit that hunted the bug _class_ behind the slide-figure
replicant bug. Every item below is one shape:

> The AI's **read-projections** (`simplifySlideForAI`, `get_report_editor`, the
> `format_*_for_ai.ts` formatters in `lib/ai_tools/` and in
> `client/src/components/instance/copilot/tools/`) and its **write-schemas**
> (`lib/types/ai_input.ts` `Ai*Schema`) were each designed around a minimal
> title/text/figure-data mental model, while the stored shapes (`Slide` /
> `ContentBlock` / `FigureBundle` / `PresentationObjectConfig`) are far richer.
> Anywhere **stored shape > (read projection ∪ write schema)**, the AI can set
> things it can't read, read things it can't edit, or must blind-guess.

The fix principle everywhere is **drive the read-projection and the write-schema
from the stored schema**. Closed since the audit: the text-block `style` drop
(now merged in `getSlideWithUpdatedBlocks`), the `chartType='table'`
hallucinated field in three tool descriptions, and the `replace_figure` caption
clobber (a caption override rewrites every embed of the id, and the tool input
has no occurrence selector, so it is now stated in the tool description and the
embed count is surfaced in the proposal summary). Remaining:

- **[HIGH] Filter/disaggregation VALUES are undiscoverable for common
  dimensions.** The highest-impact item; it touches the core query path, not
  just figures. The metric list surfaces dimension _names_ but _values_ only for
  ICEH/HFA (`format_metrics_list_for_ai.ts`). For `admin_area_2/3/4`,
  `facility_type`, `facility_ownership`, `indicator_common_id` (non-HFA),
  `denominator`, `target_population` etc., no tool returns the valid values. The
  data exists server-side (`disaggregationPossibleValues`) and
  `validateMetricInputs` already fetches it, but only to _reject_ a bad guess
  after the fact. So to set a `filters` array the AI must guess and learn valid
  values from validation-error strings: the replicant "binary-reduction" pattern
  generalized. Fix direction: a discovery surface, either a
  `get_dimension_values(metricId, disOpt)` tool (lazy, scales) or a bounded
  value list folded into the metric-list formatter. Note `get_metric_data`
  already lists values for dimensions you _disaggregate_ by (capped at 20); the
  gap is _filter-only_ dimensions.
- **[HIGH as a cluster] Slide/report STYLE surface is invisible and
  uneditable.** Same root cause, different fields. **Images:** no image input
  schema at all: the AI cannot create, edit or read image blocks and resolvers
  reject the type; `ImageBlock` carries `imgFile` + `style` but read-back shows
  only `Image: <imgFile>`, and reports have no image tool either. **Slide-level
  style:** cover/section/content carry `footer`, `subHeader`,
  `showLogos`/`showHeaderLogos`/`showFooterLogos`, `split` (left/right panel
  with placement/size/fill) and bold/italic/relFontSize fields; none are
  readable or settable, create schemas expose only
  title/subtitle/presenter/date/header, and `replace_slide` silently wipes the
  rest. Fix direction: extend `simplifySlideForAI` + the create/update schemas
  to cover block `style` and slide-level style, plus an image input schema and
  insert/update image verbs.
- **[MED]** `get_metric_data` hard-codes `rollupDim: undefined`, so explored
  data differs from a roll-up-enabled figure, and the disclosure lives in a
  different tool's formatter.
- **[MED] Value ordering is entirely outside the AI's reach.**
  `s.customValueOrder` (S11) is the first `s` field that aliases something users
  routinely ask the AI for: the order values appear in. No read-projection
  surfaces it, and `applyFigureConfigPatch` leaves `config.s` untouched by
  design (only a `type` change rewrites it), while the write schemas carry no
  sort field at all. Two consequences: the AI cannot honor "put X first", and a
  saved custom order silently outranks the axis order the AI reads back, so its
  description of a figure can disagree with what renders, the accepted-but-inert
  class (PROTOCOL_APP_AI_TOOLS.md), reached without any patch being applied. Fix
  direction: project the order in the figure read-projection, and either admit
  an ordering verb or have `validateFigureConfigEdit` reject/annotate edits a
  custom order would override.
- **[LOW]** Complex (non-3×3) layouts read back as `structure: null`, so only
  `replace_slide` (destructive rebuild) can edit them. **[LOW]**
  `get_module_settings` formats only `parameterSelections`, omitting other
  `ModuleConfigSelections` fields its description implies. **[LOW]**
  `sanitizeReportCaption` (`report-forge/engine/embeds.ts`) silently strips
  brackets/newlines from report captions with no feedback (mangles e.g. "95% CI
  [0.4, 0.6]").
- **[MED, reuse/quality, not a bug] Unify the figure-RESOLUTION cores.** AI
  figure create/edit already share replicant validation (`assertReplicantValid`,
  applied uniformly, no flags). Assembly is already unified: both
  `resolveFigureBundleFromMetric` (caller precomputes the fetchConfig) and
  `resolveFigureBundleInteractively` (items fetch auto-defaults the replicant)
  build through `makeFigureBundleFromFetchedData`. What is still split is the
  item fetch in front of it. Goal: one `resolveFigureBundle(source, config)`
  used by every create/edit/render path, with the metric-vs-PO difference
  reduced to how the source is produced. The friction to design around is the
  two item-fetch routes (`_PO_ITEMS_CACHE` with a precomputed fetchConfig vs
  `getPresentationObjectItemsFromCacheOrFetch`, which runs
  `resolveDefaultReplicant`). Higher blast radius (the figure editor, slide
  decks and reports all render through the PO core), so it wants its own scoped
  refactor and review pass, not improvisation.

This inventory is also the **spine of a SYSTEM_13 restructuring**: organize this
doc around the "read-projection = write-schema = stored-shape" principle and
inventory every tool against it.

**Hygiene**

- Rename the PascalCase DB log functions; decide the `can_use_ai` permission
  question (any-member remains the deliberate state until then).
