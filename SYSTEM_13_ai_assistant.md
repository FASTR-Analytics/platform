---
system: 13
name: AI Copilot & Usage Governance
globs:
  - client/src/components/copilot/**
  - client/src/components/project_ai/ai_views.ts
  - client/src/components/instance/ai_context_form.tsx
  - client/src/components/slide_deck/slide_ai/build_config_from_metric.ts
  - client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts
  - client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts
  - client/src/components/slide_deck/slide_ai/get_deck_summary.ts
  - client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts
  - client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts
  - client/src/state/products/t4_ai_documents.ts
  - lib/ai_tools/**
  - server/mcp/**
  - lib/types/ai_input.ts
  - lib/types/custom_prompts.ts
  - server/db/instance/ai_usage_logs.ts
  - server/db/instance/custom_prompts.ts
  - server/routes/anthropic_messages_proxy.ts
  - server/routes/instance/custom_prompts.ts
  - server/routes/instance/ai_files.ts
  - server/routes/instance/ai_proxy.ts
  - server/routes/instance/copilot_ai_proxy.ts
  - server/routes/project/ai_proxy.ts
  - server/routes/project/ai_tools.ts
  - server/tests/mcp_context_cache_test.ts
  - server/tests/mcp_tools_source_header_test.ts
---

# S13: AI Copilot & Usage Governance

The Anthropic proxies with token-limit governance, plus the browser-side
copilot: 32 client-executed tools mutating app state only through the live view
context of panther's view registry, mounted once per open product. Reviewed against code (first
review cycle; absorbed and deleted DOC_AI_PROXY_AND_USAGE_GOVERNANCE and
DOC_AI_TOOL_SCHEMAS, the authoring recipe from the latter now lives in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)); AI-surface prose
re-verified after both assistants adopted panther's
views/gating/interactions/approval system. Two same-day fix batches
(governance + panther turn-logic, then the client-copilot findings) are folded
into the prose; remaining triaged findings are in Open items below.

Boundaries: the chat engine (request shaping, turn/continuation logic,
tool-execution loop, display registry, conversation persistence) is panther's
`_305_ai` + `_110_ai_types` (vendored; fixes land in the panther repo and
re-sync). Guards themselves are **S1**; the daily token counters are columns on
`users` (`db/instance/users.ts` is S1-owned with S13 a mandatory reader, per
SYSTEMS.md §4.1). The unguarded health routes that surface usage are **S15**.
The HFA indicator-manager assistant client
(`client/src/components/indicator_manager_hfa/ai/**`) is an **S5-owned
satellite**: S13 owns the `/ai-instance` proxy it talks to, the panther engine
contract, and the tool-schema conventions it must follow; S5 owns the tool
semantics. `components/project_ai/ai_views.ts` is a REMNANT, not a second
copilot: a chat-less view registry that keeps the dying project shell's
`setView`/`notify` calls typed until step 9a deletes the shell. The slide/figure shapes the slide_ai helpers produce are **S10/S12**;
the query pipeline the data tools call is **S9**.

## Principles

1. **The server is a thin proxy with governance.** The client speaks the
   Anthropic Messages API; the server forwards to Anthropic, enforces token
   limits, logs usage, and streams the response straight back. All model calls
   traverse a proxy; nothing else server-side talks to Anthropic.
2. **Tools run over the same serverActions the human UI uses**, in the browser
   SPA, or headlessly at the remote MCP endpoint (`server/mcp/`, mounted at
   `/mcp`), so the AI inherits the user's permissions for free (Clerk session
   in the SPA, personal access token at `/mcp`, whose actions dispatch
   in-process through the full PAT middleware chain, see S1) and can never do
   what the user can't. **Two classes of tool, one env seam**:
   `lib/ai_tools` holds exactly the tools BOTH surfaces expose (metrics ×2,
   methodology docs ×2, `get_info`) over `AIToolEnv`: a data source for ONE
   (package, scope) pair (items, value info; no run id ever crosses the seam
   or appears in a schema). Shared tool OUTPUT states only
   what both surfaces can act on: `from_metric` authoring guidance is the SPA
   prompt's and block schema's contract, never a shared formatter's; the
   metrics listing keeps its per-metric presets (grain, filters, replicant
   requirement) as reference data about the metric. `get_info` topics are
   inputs, split by location like tools: `INFO_TOPICS` (lib, shared:
   `iceh`) and the client's `SPA_INFO_TOPICS` (shared + the equity-profile
   report recipe); each surface passes its ONE list to both
   `getSharedToolsForInfo` and `buildSystemPrompt`, so tool whitelist and
   prompt never diverge. The SPA binds one env PER MOUNT
   (`createCopilotAIToolEnv(scope)`, cache-backed over the run-keyed package
   routes; `ClientAIToolEnv` adds the module script/logs/settings getters and
   the product-content getters), closed over the open product's pair for the
   life of that mount. It concatenates its own client tools in
   [build_tools.ts](client/src/components/copilot/build_tools.ts): module
   internals ×4 (`/mcp` is for seeing results, ruled), the editors and the
   draft preview. `/mcp`
   binds the instance's **pinned** results package (national scope, run-keyed
   instance routes, gate = instance `can_view_data`) and exposes only the shared
   tools + `get_overview`: 6 read-only tools, no writes.
   **Interpretation context rides the shared reads, not extra tools**:
   `get_metric_data` fetches value info beside the items and
   states the metric's full period coverage plus, per indicator in the
   Dimension Summary, label / format / direction / thresholds (thresholds in
   display units, mirroring the scorecard's inclusive cutoff rule);
   `buildInstanceContextSections` states the instance calendar and
   `buildPackageGroundingSections` the package's period coverage (finest
   physical time column; `/mcp` only, since the SPA holds no manifest). Nothing
   about modules, provenance, or unavailable metrics goes into the AI
   context: it does not help read a metric (ruled). A separate
   indicator-dictionary tool was considered and dropped as redundant.
   The `/mcp` surface is stateless above the wire: the pin is read from the DB
   on every call (a pin-move is visible on the next call; `get_overview`
   answers without a pin), and package tools are boot-time templates bound per call via
   panther's `bindAITool` because panther caches a principal's tool set per
   core. The catalog is fixed per process: a client sees a catalog change only
   when it re-lists (a chat client: refresh the connector's tools, or a new
   conversation, though neither claude.ai nor Claude Code reliably re-lists on
   a new conversation alone), and the server does not advertise `listChanged`
   (panther ruling, DOC_AI_CHAT §Headless tools). So results are self-identifying
   instead: every package-tool result starts with a
   `Source: results package "<label>" (generated <createdAt>)` line naming the
   run it read (`withSourceHeader` in `context_cache.ts`, applied where run and
   session tools meet; failures pass through unheadered; the line is
   `formatSourceHeader` in `lib/ai_tools/source_header.ts`, pinned by
   `server/tests/mcp_tools_source_header_test.ts`). The SPA needs no header:
   its copilot is mounted per product over one fixed pair, so every result in
   a thread comes from the package the system prompt names.
   `serverInfo.version` reports the
   deployed `SERVER_VERSION` (hygiene: no client re-lists on it). A client's
   re-list behaviour is observed from panther's per-request stderr line,
   `[panther mcp] fastr: <era> <method> …`; `./mcp_probe <origin> --info` shows
   the handshake. The system prompt splits the same way: shared grounding blocks
   in `lib/ai_tools/build_system_prompt.ts`, each surface assembling its own
   context. The SPA's assembled prompt is byte-stable for the life of one
   mount (prompt-cache breakpoint); only the instance AI context can change it.
3. **Editors expose live mutators via the view registry's context**: each
   editing view's live context carries the editor's store getters/setters AND
   the open product's `getScope()`
   ([ai_views.ts](client/src/components/copilot/ai_views.ts)), so the AI edits
   exactly the same in-memory editor state the user is looking at, never a
   parallel copy. The pair rides the opaque CONTEXT half: no run id crosses
   the tool seam. A mid-edit reattach remounts the chat beside the editor
   (the host is keyed on the pair) while the editor itself stays up.
4. **Anthropic shapes in, Anthropic shapes out.** The proxies return
   Anthropic-shaped bodies and errors (not the `APIResponse` envelope) because
   the client Anthropic SDK parses them, the enumerated exception to the
   envelope rule (S1).
5. **AI input schemas derive from storage schemas** (`configDStrict` et al.) so
   AI-built configs are storage-compatible by construction. See
   [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

## The proxies

One shared handler,
[anthropic_messages_proxy.ts](server/routes/anthropic_messages_proxy.ts)
(governance, usage logging, and beta policy live there so the two mounts cannot
drift), behind two thin raw Hono routes (deliberately outside the S1 route
registry), mounted in [main.ts:145-147](main.ts#L145-L147):

|                        | Copilot proxy                                                                                                                     | Instance proxy                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Route                  | `POST /ai/v1/messages` ([copilot_ai_proxy.ts](server/routes/instance/copilot_ai_proxy.ts))                                        | `POST /ai-instance/v1/messages` ([ai_proxy.ts](server/routes/instance/ai_proxy.ts))                             |
| Guard                  | `requireApprovedUser()` and nothing finer: every approved user is a full editor of every product (D2)                             | `requireGlobalPermission("can_configure_data")`                                                                 |
| Usage log `project_id` | `null`                                                                                                                            | `null`                                                                                                          |
| Client                 | the copilot ([defaults.ts](client/src/components/copilot/ai_configs/defaults.ts), no `Project-Id` header)                         | HFA indicator-manager assistant ([sdk_client.ts](client/src/components/indicator_manager_hfa/ai/sdk_client.ts)) |

`server/routes/project/ai_proxy.ts` is still on disk, unmounted, until step 9b
deletes the project route tree; `ai_usage_logs.project_id` goes with it.

The shared flow:

1. Key and URL come from the boot-validated `_ANTHROPIC_API_KEY` /
   `_ANTHROPIC_API_URL` (`exposed_env_vars.ts`; the URL env is the **full**
   messages endpoint, `https://api.anthropic.com/v1/messages`).
2. **Daily limit**: `_DAILY_TOKEN_LIMIT !== null && !unlimitedAi` →
   `GetUserDailyTokenUsage >= limit` → `LogAiLimitHit(email, "daily_user")` +
   Anthropic-shaped 429 whose message embeds the next-UTC-midnight reset ISO.
3. **Weekly limit**: same gate shape → `GetInstanceWeeklyTokenUsage >= limit` →
   `LogAiLimitHit("__instance__", "weekly_instance")` (sentinel, not the
   email) + 429 with next-Monday-UTC reset.
4. **Beta headers**: `files-api-2025-04-14` computed when any message carries a
   `document` block, merged with client-supplied `anthropic-beta` values
   **filtered through the `FORWARDABLE_BETAS` allowlist** (web-fetch, files-api,
   structured-outputs: the set panther actually sends; SDK ≥0.110 sends betas
   via the header, not the body). Unknown client betas are dropped so users
   can't enable cost-changing betas under the same token limits.
5. `fetch(_ANTHROPIC_API_URL)`, `anthropic-version: 2023-06-01`. The SDK's
   `?beta=true` query is ignored by the route matcher.
6. `!ok` → `{error: "Anthropic API error: <status> - <text>"}` at the upstream
   status.
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
   the weekly increment is skipped for them. Be deliberate about which counters
   unlimited users should affect.

**Governance storage.** Daily counter = columns on `users`
([users.ts:279-311](server/db/instance/users.ts#L279-L311), S1 seam): the read
compares the stored date to today in JS UTC, the write uses Postgres
`CURRENT_DATE`, identical only while the DB session runs UTC. Weekly counter =
`instance_weekly_token_usage` upserted on `date_trunc('week', CURRENT_DATE)`
([ai_usage_logs.ts:4-20](server/db/instance/ai_usage_logs.ts#L4-L20)). Per-call
rows = `ai_usage_logs` (email, nullable project_id, model, 4 token counts).
Limit hits = `ai_limit_hits`, PK `(user_email, limit_type,
hit_date)` so
`ON CONFLICT DO NOTHING` dedupes to one row per day. `unlimitedAi` = `H_USERS`
membership or `users.unlimited_ai`
([project_auth.ts:204](server/project_auth.ts#L204)). `_DAILY_TOKEN_LIMIT` /
`_WEEKLY_TOKEN_LIMIT` are `parseInt`-or-`null`, with a boot-time throw on an
unparseable value ([exposed_env_vars.ts:142](server/exposed_env_vars.ts#L142));
`null` = disabled. All logging and increments are `.catch(() => {})`
fire-and-forget. Accounting is best-effort, not transactional, and the limits
are check-before / increment-after, so concurrent requests can overshoot: a
courtesy bound, not a hard one.

**The error contract, as built.** Three deliberate non-envelope shapes: the 429
rate-limit object, the upstream-status error string, and anything _thrown_ in
the handler (malformed request JSON, upstream fetch network failure), which the
shared handler catches and returns as an Anthropic-shaped 500
([anthropic_messages_proxy.ts:51-66](server/routes/anthropic_messages_proxy.ts#L51-L66))
rather than letting it fall to `app.onError`'s envelope-at-HTTP-200. The one
envelope shape on the surface: guard rejections are `{success:false, err}` at
401/403.

**Health surfacing (S15).** `GET /ai_usage` (full `SELECT *`, optional `since`),
`/ai_weekly_usage`, `/ai_limit_hits`
([health.ts:168-186](server/routes/instance/health.ts#L168-L186)). Health
routes are public by design, but `/ai_usage` returns per-user emails and
per-call behavior, unbounded (Open items).

## The Files proxy

[ai_files.ts](server/routes/instance/ai_files.ts): ONE raw route,
`POST /ai/files`, guarded by `requireApprovedUser()` like the copilot proxy it
is mounted beside, proxying the Anthropic Files API with the files-api beta
header. It is **not** a client-upload passthrough: the body is
`{assetFilename}`, the server reads that file from the instance assets dir on
disk (traversal-guarded via `resolveAssetFilePath`) and multiparts it to
Anthropic, hardcoded as `application/pdf` regardless of actual type. Uploaded
files are referenced as `document` blocks in later `/v1/messages` calls. (The
GET and DELETE passthroughs by file id were deleted on 2026-08-28 with the
attachments rework; nothing calls the Files API by id any more.)

## The client copilot

[`ProductCopilotHost`](client/src/components/copilot/index.tsx) is the copilot
mount (D15): the product opener (`openProduct` in
`client/src/components/products/index.tsx`, the ONE mount site) renders it
around whichever editor it opens, so there is one copilot per open product and
the panel spans the editor's full height. The host keeps the editor mounted
(a reattach is handled live there, D16) and keys the chat beside it on the
product's (package, scope) pair plus that package's `RunAuthoringContext`
(T2, immutable per run id): the inner `ProductCopilot` remounts when the pair
changes, which is what keeps the env, the tools and the system prompt fixed
for the life of one chat instance. The Products page and every other tab have
no copilot; the results explorer, when it lands, mounts its own with its own
tools, the pattern the HFA indicator manager already uses. Each mount builds
one panther `AIChatProvider` config, validated in dev by panther's no-mount
construction check: both assistants call `validateAIChatConfig(config)` under
`import.meta.env.DEV` at config assembly (HFA
[ai/index.tsx:37-39](client/src/components/indicator_manager_hfa/ai/index.tsx#L37-L39)):

- **sdkClient**
  ([defaults.ts](client/src/components/copilot/ai_configs/defaults.ts)):
  Anthropic browser SDK, `baseURL {host}/ai`, `apiKey: "not-needed"`, no
  default headers, plus a fetch wrapper that rewrites the ISO reset timestamp
  inside 429 bodies to the user's locale.
- **modelConfig** = `DEFAULT_MODEL_CONFIG`: `DEFAULT_ANTHROPIC_MODEL`
  (`claude-sonnet-4-6`, [consts.ts:152](lib/consts.ts#L152)),
  `max_tokens: 32000` (fits every allowed model's output cap; a report rewrite
  is one tool_use block that must fit inside max_tokens),
  `output_config: {effort: "high"}` (re-resolved per model by panther; dropped
  where unsupported). Panther clones the consumer's modelConfig into
  per-instance state, so the shared module-level default is never mutated. The
  settings panel exposes model + max_tokens (`adjustable`; `allowedModels`:
  opus-4-8, opus-4-6, sonnet-4-6, haiku-4-5,
  [chat_pane.tsx](client/src/components/copilot/chat_pane.tsx)); the
  allowlist is client-side only. The proxy forwards any `model` verbatim (Open
  items).
- **builtInTools** = `{webSearch: true, webFetch: true}`: Anthropic server-side
  tools, resolved per model by panther (dynamic `_20260209` variants on 4.6+,
  basic + beta header otherwise). Currently unrestricted: no `max_uses` /
  `allowed_domains` / `max_content_tokens` (Open items).
- **scope** = `copilot:<productId>`: conversations are per product (one
  IndexedDB registry, filtered by scope, with a last-active id per scope), so
  a thread's history is about one deck or report on one package, and reopening
  the product restores it. **settingsScope** = the constant `"copilot"`: the
  persisted chat settings (model, max tokens, `panther-ai-settings-copilot`)
  are shared by every product's copilot (panther's `AIChatConfig.settingsScope`,
  added for this).
- **system** = `buildSystemPromptForContext` memo (byte-stable within one
  package, see below); **getDocumentRefs** from `useAIDocuments`;
  **viewController** = `copilotViewController` (below).
- **the (package, scope) pair** and the package's authoring context (modules,
  metrics, datasets, indicator vocabularies, the HFA taxonomy) are props of
  the inner `ProductCopilot`, fixed for its life; the HFA survey rounds
  (instance-wide T1, not in the per-run payload) are merged in once at
  construction. Nothing moves under the tools, so no store, no reconcile and
  no call-time scope resolver: the tools array is built once over these
  values and registered once.

The chat pane (`ConsolidatedChatPane`,
[chat_pane.tsx](client/src/components/copilot/chat_pane.tsx)) lives
in a `FrameRightResizable` panel toggled by `showAi()` (T4 UI state) and
registers three custom renderers, keyed to panther's `DisplayRegistry`:
`toolError`, `systemNotice` (refusals/truncation/context-exceeded/ continuation
caps arrive as `system_notice` items), and `userText`
(`SaveableUserTextRenderer`: adds save-to-prompt-library, strips ephemeral
markers from display).

**The view registry.**
[`copilotViews`](client/src/components/copilot/ai_views.ts)
(`defineAIViews`, 4 views: `opening_product` + 3 `editing_*`) and the
module-level singleton `copilotViewController` (fallback `opening_product`)
replaced the old `AIContext` discriminated union's interpretation duty. Per
view, params are the serializable model-visible half; context is the live
payload (editor getters/setters plus the product's `getScope()`) delivered to
tool handlers opaquely. `opening_product` is the paramless fallback the
controller sits in between the host mounting and the editor's first `setView`
(each editor sets its view after its first fetch); its instructions tell the
model the product is still loading. Sync is imperative and there is no
tab-to-view map: the only sync sites are each editor's mount (`setView`) and
teardown (`restoreCopilotView(returnToContext)`, the nested-editor stack from
deck editor to slide editor, else `clearView()`).

Per-view `instructions` (default ephemeral delivery) carry what used to be the
per-mode prompt switch plus the live bits the old mode string exposed: entity
ids (deckId/slideId/reportId), the deck's selected slide ids, and the report
editor's CodeMirror selection preview. The engine delivers them as typed
ephemeral sections stored on the turn (view label, view instructions,
interactions digest), rendered as one `<<<[…]>>>` block on the latest carrier
only: a write-only wire, one format for every model.

**Interactions and echo suppression.**
[`copilotInteractions`](client/src/components/copilot/interactions.ts)
(`defineAIInteractions`, 6 typed interactions) replaced the hand-rolled
pendingInteractions queue + `reduceInteractions` pipeline. Producers call
`copilotViewController.notify(...)`: the INSTANCE SSE side-channel
([index.tsx](client/src/components/copilot/index.tsx)), which carries two
things (the per-row `products_upserted` summary, as `product_updated`, and
`last_updated("slides")`, as `edited_slide`), and the editors and selection UIs
(`edited_*_locally`, `selected_slides`, and `draft_added_to_deck`, the
accepted-draft signal the model would otherwise never hear, since the write's
own SSE echo is marked as an AI edit). The host filters `products_upserted`
to the OPEN product: another product changing is not this copilot's business.
The engine
owns the transactional drain at turn creation (restored on a failed send, so
entries are never lost or double-delivered) and the reduction pipeline
(`relevantIn` / per-entry `filter` / coalesce per id), plus a coalesced
`__navigation` line. The old "SSE echoes the AI's own tool edits" defect is
fixed in the general case: every persist-path write tool marks `slide:` /
`product:` echo keys via `markAIEdit`, so the AI's own server writes are
dropped at drain (TTL-scoped, either-order). The collab-checkpoint residual is
in Open items. Because the controller is a module singleton, `ProductCopilot`
calls `clearInteractionLog()` at mount: each mount is a new conversation
scope, and retained actions from the previous product (or, on a Clerk
cross-tab user switch, the previous user) would otherwise arrive in this
product's first digest as fake activity.

## Tools, view gating, and approval

[`buildCopilotTools`](client/src/components/copilot/build_tools.ts)
assembles one flat array of 32 tools (31 app tools + panther's
`ask_user_questions`), all always registered with the API: base data tools
(metrics, modules, methodology docs, info), view-gated editor tools
(deck-level slides, slide editor, report editor), and the draft preview.
Every tool declares a `kind` (`"read"` / `"write"`); no tool is `"nav"`,
because there is nothing for the model to navigate: the copilot lives inside
one product. There is no product registry: the model never lists, opens or
creates products, and a draft slide goes only into the open deck (the preview
card offers "Add to this deck" from the deck and slide views and is
preview-only in a report).

**Gating is declarative.** The editor tools are standalone
`createAITool({viewRegistry: copilotViews, availableIn: […]})` declarations:
the engine refuses out-of-view _executions_ before the handler runs (all tools
stay in the API request: definitions are cached prompt prefix), and it injects
the live view state (params + context) into the handler, typed to the declared
views. The ~23 hand-rolled `aiContext()` mode guards are deleted. `get_slide`
reads the open deck's slides by id from the deck and slide views
([get_slide.ts](client/src/components/copilot/ai_tools/tools/get_slide.ts)).

The editing views' contexts carry the live-mutator closures the old union did,
each beside the product's `getScope()`: `getTempSlide`/`setTempSlide` (slide
editor), `getDeckConfig`/`getSlideIds`/`getSelectedSlideIds` (deck), and the
report contract
(`getBody`/`getFigures`/`getImages`/`getSelection`/`proposeEdit`/
`applyFigureUpdate`). See
[ai_views.ts](client/src/components/copilot/ai_views.ts).

**Report edits are never silent**: they ride panther's approval lifecycle. The
five staged text tools (`rewrite_report`, `rewrite_section`, `replace_text`,
`insert_figure`, `replace_figure`) declare `approval.propose`
([report_editor.ts](client/src/components/copilot/ai_tools/tools/report_editor.ts)):
`proposeEdit` stages the CodeMirror diff as the `customProposalUI`, an
identical-body proposal short-circuits to panther's `{skip}` (a normal
no-decision result), `stillValid` guards a stale accept against a torn-down
editor, and `commit` rebases over concurrent collaborator edits (reporting
skipped hunks); leaving the view auto-declines via `availableIn`.
`applyFigureUpdate` is the stable-id figure path that persists directly and
reports save failure (`update_report_figure`: no diff, the figure's body token
doesn't change).

**Validate-before-commit.** `update_figure` (slide editor, deck level) and
`update_report_figure` share one pipeline:
`applyFigureConfigPatch` → `validateFigureConfigEdit` (pure config checks:
slots, field liveness, roll-up structure, pre-write collision) →
`validateMetricInputs` (live data) → `describeFigureConfigPatchEffect` (the
per-field leave-one-out change report in the success message), _before_ any
store write, so a throw provably means "nothing changed". Pure config checks
live beside the pipeline in `client/src/generate_visualization/` (S10's glob,
deliberately: they are S13 machinery); fetched-data checks stay in
`validators/content_validators.ts`. The accepted-but-inert-patch rule (Type 1 /
Type 2) is stated once, in [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

**Tools are built once per mount over fixed values.** Panther registers
`config.tools` into its `ToolRegistry` once at chat construction and never
re-reads the array, and everything the copilot's tools close over (the env,
the pair, the authoring context, the HFA rounds) is fixed for the life of one
`ProductCopilot`. A value that must change (a reattach, a different product)
changes by remount, never by mutation under the tools.

## Tool input schemas

The architecture half of the schema story (the authoring recipe is
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)):

- **AI schemas derive from storage schemas.** `configDStrict`
  ([lib/types/_metric_installed.ts:160](lib/types/_metric_installed.ts#L160), a
  strip-mode `z.object` despite the name; `filterBy[].values` and `valuesFilter`
  carry `.min(1)`) is the source of truth. Two derived surfaces exist, both in
  [ai_input.ts](lib/types/ai_input.ts): `AiMetricQuerySchema`
  (filters/disaggregations/valuesFilter via `.shape.*`) and
  `AiFigureConfigPatchSchema` + `LayoutSpecSchema`, used by
  `update_figure`/`update_report_figure`. The documented exception
  pattern (`startDate`/`endDate` instead of the full `periodFilter` union,
  converted against the metric's most-granular time column) is preserved
  everywhere, as is the patch schemas' open-ended `periodFilter {min?, max?}`,
  where an omitted max stores `from_month` "to present".
- **Layer-1 enforcement lives in panther**: `createAITool` re-parses input
  inside `run()` and converts a ZodError to `AIToolFailure`
  ([tool_helpers.ts:434-446](panther/_305_ai/_core/tool_helpers.ts#L434-L446));
  the engine catches any throw and returns `is_error: true` so the model
  self-corrects
  ([tool_engine.ts:333-343](panther/_305_ai/_core/tool_engine.ts#L333-L343)).
  **The failure channel** (authority: DOC_AI_CHAT.md "Failure channel", panther
  repo root): handlers throw `AIToolFailure` for ANY anticipated failure (bad
  id, missing referent, failed server call) with the message as the complete
  user-presentable record (clean display, no stack; ~92 sites across the copilot
  tools); plain `Error` is reserved for genuine bugs (full-stack display).
  Handlers must throw, never return error strings.
- **Layer-2 (data-dependent) validation** lives in
  [content_validators.ts](client/src/components/copilot/ai_tools/validators/content_validators.ts)
  (dimension availability per metric, date format/ordering, preset overrides,
  filter values and period bounds against live data) and
  [report_validators.ts](client/src/components/copilot/ai_tools/validators/report_validators.ts)
  (token resolution, body caps).

## The slide_ai conversion layer

The S13-owned files in `client/src/components/slide_deck/slide_ai/` convert
between AI input shapes and stored `Slide`/`FigureBundle` shapes; deck-level and
editor-level tools call the same resolvers, so behavior is identical:

- [build_config_from_metric.ts](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts)
  converts AiFigureFromMetric → `PresentationObjectConfig`: preset spread over
  defaults, AI overrides applied (filters gated by `preset.allowedFilters`,
  startDate/endDate → `custom` periodFilter via `convertPeriodValue`).
- [resolve_figure_from_metric.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts)
  is the AI adapter over the shared bundle resolver, taking the target
  product's `PackageScope` as its first argument: what the figure resolves
  under is the caller's decision, never the file's. AI paths get _strict_
  replicant validation (`assertReplicantValid` throws) where non-AI callers
  keep the lenient auto-default.
  [resolve_figure_from_visualization.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts)
  is the same adapter for the project Visualizations tab's `from_visualization`
  block; no copilot tool accepts one any more, and step 9a deletes the tab and
  this file together.
- [convert_ai_input_to_slide.ts](client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts)
  converts AiSlideInput → stored `Slide` under a `PackageScope`: resolve
  blocks, `optimizePageLayout`
  at the canonical page frame, re-attach bundles, and `slideConfigSchema.parse`
  the result (validate-at-construction, the add-to-deck ZodError lesson).
- [get_slide_with_updated_blocks.ts](client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts)
  is targeted block replacement preserving what the AI schema can't express (text
  styles, node-level layout overrides);
  [layout_spec_helpers.ts](client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts)
  is `LayoutSpec` (rows/12-col spans, `normalizeSpans` enforces sum-to-12) ↔
  `LayoutNode`;
  [extract_blocks_from_layout.ts](client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts)
  is `simplifySlideForAI`, the model-facing slide view;
  [get_deck_summary.ts](client/src/components/slide_deck/slide_ai/get_deck_summary.ts)
  is the deck outline for `get_deck` (slides read through
  `getSlideFromCacheOrFetch`, so a fresh session's first call sees content).

## System prompt, documents, prompt library

**System prompt**
([build_system_prompt.ts](client/src/components/copilot/build_system_prompt.ts)):
date header + instance/terminology section (country, admin-area labels, data
sources) + results-package section (the package label and generation time, the
scope, the package's datasets and indicator lists) + a products section (what a
product is, deck and report counts) + the instance-level `ai_context` +
reference-doc catalog (`INFO_TOPICS`) + base instructions (read-data-first, no
fabrication, indicator directionality) + the tool catalog. The accessor takes
no view argument, so the prompt is **byte-stable across navigation within one
package** and its prompt-cache breakpoint keeps hitting: the per-view
instructions (still exported from this file, with short primary-tool pointers)
are composed by the view registry
([ai_views.ts](client/src/components/copilot/ai_views.ts)) and delivered
ephemerally per turn, and the hand-typed tool list was replaced by panther's
`buildToolCatalog(tools)`, composed ONCE in the wrapper. Cache rule: never pass
`currentView` there (view-grouped ordering would bust the breakpoint on every
navigation). Viewable via the chat menu; the debug panel
([ai_debug_panel.tsx](client/src/components/copilot/ai_debug_panel.tsx))
renders the metric-list formatter verbatim so a human sees exactly what the
model sees. AI data payloads exclude the admin-area roll-up row (double-counting
guard, S9).

The instance `ai_context` is one `instance_config` row (`ai_context`), edited
from a card on the Data page behind `can_configure_settings`
([ai_context_form.tsx](client/src/components/instance/ai_context_form.tsx),
`updateAiContextConfig`), and rides `InstanceState` with the rest of the config
so the prompt reads it from T1 with no fetch. It replaced the per-project
`projects.ai_context`.

**Documents.** `useAIDocuments` keeps `{assetFilename, anthropicFileId}` pairs
for the one copilot scope in IndexedDB
([t4_ai_documents.ts](client/src/state/products/t4_ai_documents.ts), keys
`ai-documents/copilot` and `ai-attachments/copilot/<conversationId>`; T4:
per-browser, no server copy, no invalidation when the underlying asset is
replaced). The selector modal lists instance PDF assets and uploads new
selections through `POST /ai/files`; `getDocumentRefs` feeds panther, which
attaches each configured document to the next user message the conversation
hasn't yet sent it in, so mid-conversation attach works. The remaining
lifecycle gap is asset replacement, which the IndexedDB pairing never notices
(Open items).

**Prompt library.** Shared prompts fetched at open from the GitHub
`fastr-resource-hub` (`prompts.md`/`prompts_fr.md`, cache-busted; parsed by
[parse_prompts.ts](client/src/components/copilot/ai_prompt_library/parse_prompts.ts))
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

`ai_tools.ts` ([routes/project/ai_tools.ts](server/routes/project/ai_tools.ts))
is the one registry-based route in this system: `getVisualizationsListForAI`.
No copilot tool calls it any more; it dies with the project route tree in 9b.

## The panther engine (what this app depends on)

First synced at commits 62ed6c03/ca3ae868 (SDK 0.71 → 0.110) and repeatedly
since. Both assistants also depend on the engine's
views/gating/interactions/approval surface (`defineAIViews`,
`createAIViewController`, `defineAIInteractions`, `availableIn` gating,
`approval.propose`, `buildToolCatalog`, `validateAIChatConfig`). The consumer
rulebook is the vendored
[PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md); the full
contract doc is DOC_AI_CHAT.md at the panther repo root (not vendored). The
parts S13 relies on, verified this cycle:

- **Request shaping**
  ([request_shaping.ts](panther/_110_ai_types/request_shaping.ts)): ≤2
  prompt-cache breakpoints placed per send (system + last user message; stored
  state never carries `cache_control`); per-model resolution of
  thinking/effort/temperature (prevents 400s across the whole allowed-models
  list, including adaptive-only Opus 4.8); persisted settings sanitized against
  retired model ids and caps at init.
- **Turn logic** ([turn_logic.ts](panther/_110_ai_types/turn_logic.ts)):
  stop_reason → done / halt (refusal, truncation, context-exceeded) / pause_turn
  resume / tool loop / caps, recursion bounded by `MAX_TURN_CONTINUATIONS = 24`.
  Both capped **and halted** turns synthesize cancelled tool_results, so
  persisted history never ends in unresolved `tool_use` (which would 400 every
  later send); a cap-pause trim that empties an assistant message persists a
  placeholder text instead. Halts render as `system_notice` display items.
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

## The HFA satellite (S5-owned, S13-governed)

`client/src/components/indicator_manager_hfa/ai/` is a second, fully isolated
assistant: same panther engine, own conversation scope (`hfa-indicators`), own
SDK client pointed at `/ai-instance` (no `Project-Id`; duplicates the
429-localizing fetch wrapper), same model config shape, **no built-in web
tools**. Structural differences from the copilot: no view registry, so every write
goes straight to serverActions. Its six write tools declare `approval.propose`
with `presentation: "modal"` (panther owns the propose → modal diff → commit
lifecycle; the old hand-rolled `confirmChain` serializer is deleted), and the
config sets `approvalPolicy: { requireForKind: "write", requireKind: true }`
([ai/index.tsx:34](client/src/components/indicator_manager_hfa/ai/index.tsx#L34)).
A write tool without approval, or any tool without a `kind`, fails at
construction. Every anticipated failure throws `AIToolFailure` (zero
plain-`Error` throws in
[tools.ts](client/src/components/indicator_manager_hfa/ai/tools.ts), the
failure-channel ruling above). The system prompt deliberately embeds no live
state (the model reads through tools, avoiding staleness with its own edits).
Write commits do whole-object load → propose → save, last write wins: the
app-wide concurrency model, deliberate (a re-read-after-confirm refactor was
rejected as an inconsistent outlier). Its hand-written schemas comply
with the S13 conventions (storage field names, throw-don't-catch, no
strictObject / strict:true). S13 convention changes must be checked against this
directory; its tool semantics are S5's.

## Traps

- **The proxy is a body-verbatim forwarder.** Anything panther's shaping adds
  (mid-conversation system messages, new SSE event types) passes through
  untouched, but the _usage parser_ reads specific event shapes
  (`message_start`/`message_delta`); an Anthropic event-shape change silently
  zeroes logged usage. New betas panther starts sending must be added to
  `FORWARDABLE_BETAS` or they are silently dropped.
- **Governance changes go in `anthropic_messages_proxy.ts`**, never in the two
  mount files, which are deliberately logic-free.
- **Don't wrap proxy responses in `APIResponse`**: the client SDK parses
  Anthropic shapes. Equally: don't let new failure paths fall to `app.onError`,
  which returns an envelope at HTTP 200 the SDK can't parse.
- **Tools are registered once at pane mount.** Nothing they close over may
  move afterwards: the env, the pair and the authoring context are fixed per
  `ProductCopilot`, and a value that must change changes by remount (the host
  keys the chat on the pair). Do not reintroduce a store the tools read live.
- **`z.strictObject` and `strict: true` are banned in tool schemas**. See
  PROTOCOL_APP_AI_TOOLS.md.
- **Token limits are token-denominated, not dollar-denominated.** Cache tokens
  don't count, model price varies 10× and is client-chosen, server-tool fees are
  flat-rate per invocation. Treat the limits as volume brakes, not budget
  enforcement, until the Open items below are decided.

## Open items

Triaged findings from the first review cycle. Two same-day fix batches closed the
governance HIGHs (delta-based usage parsing, cancel-hook accounting, beta
allowlist, NaN boot validation, shared-handler extraction), the custom-prompts
gate, the truncation brick (panther turn-logic + max_tokens raise/expose), the
panther modelConfig/labels/cap-pause items, and the client-copilot findings
(filter-schema template, mid-conversation PDF attach, file DELETE on remove,
`update_viz_config` live-data validation, `switch_tab` reports, `get_deck`
fetch-on-miss, tools-reactivity memo removal, ai_files env/URL cleanup,
Anthropic-shaped thrown errors, CORS header enumeration, and the LOW hygiene
tail). The HFA whole-object read-modify-write finding was **rejected**: it
matches the app-wide last-write-wins model (see the satellite section).
Remaining:

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

- **[MED] `webFetch` unrestricted in a health-data app**: prompt-injected
  exfiltration via `web_fetch` to attacker URLs; Anthropic's own guidance is
  domain allowlisting. Configure `allowed_domains`/`max_uses`.
- **[MED] Public `/ai_usage`** returns per-user emails + per-call behavior,
  unbounded full-table scan; the other health routes expose aggregates. Decide
  the exception or add guard/limit.
- **[LOW]** The Files upload hardcodes `application/pdf` for all assets. (The
  unscoped GET/DELETE-by-id finding is closed: those two routes no longer
  exist.)

**Client copilot**

- **[MED] Documents never invalidate on asset replace**: the per-browser
  IndexedDB `{assetFilename, anthropicFileId}` pairing keeps serving the old
  Anthropic file after the underlying instance asset is replaced.
- **[LOW]** Residual SSE self-echo under live collab only (the general case was
  fixed by `markAIEdit` echo keys on every persist-path write tool): collab
  checkpoints persist AI `setTempSlide` edits and notify `slides`, echoing back
  unmarked as "Edited slide X". Marking those keys would also suppress genuine
  co-editor actions on the same slide, a design question (per-origin echo keys?
  checkpoint-carried origin?), not a missing mark; predates the interactions
  migration.

**HFA satellite (fixes are S5's to land; contract is S13's)**

- **[MED-LOW] `set_hfa_indicator_code` partial application**: sequential
  per-indicator saves; a mid-loop failure leaves earlier saves applied while the
  error implies none were.
- **Indicator-assistant hardening** (S–M, from the retired HFA plan). The first
  pass is shipped: a self-contained assistant in
  [client/src/components/indicator_manager_hfa/ai/](client/src/components/indicator_manager_hfa/ai/),
  instance proxy
  [server/routes/instance/ai_proxy.ts](server/routes/instance/ai_proxy.ts), all
  three tool tiers with a per-write confirm gate. Remaining, in priority order:
  (1) **the visual-diff review UX**: `system_prompt.ts:46` promises writes are
  shown "with a diff", but they render as plain-text summary lines in a confirm
  dialog; build the diff/accept preview or fix the prompt to match (top gap).
  (2) **Taxonomy editing**: the assistant can assign categories but cannot
  create or rename them; decide whether that stays manual. (3) No
  per-conversation cost cap (only the shared instance/user token limits) and
  `max_tokens` is hardcoded. (4) `inspect_hfa_variable` loads the whole dataset
  display then filters client-side: fine now, unbounded at scale. (5) No tests
  and no telemetry on tool accept/reject rate. (6) Graduation from the
  `hfa-ai-testing` label/deploy to production.

**Surface gaps: read-projection ≠ write-schema ≠ stored-shape**

From the read-only audit that hunted the bug _class_ behind the
slide-figure replicant bug. Every item below is one shape:

> The AI's **read-projections** (`simplifySlideForAI`, `get_report_editor`, the
> `_internal/format_*_for_ai.ts` formatters) and its **write-schemas**
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
  description of a figure can disagree with what renders, the
  accepted-but-inert class (PROTOCOL_APP_AI_TOOLS.md), reached without any patch
  being applied. Fix direction: project the order in the figure
  read-projection, and either admit an ordering verb or have
  `validateFigureConfigEdit` reject/annotate edits a custom order would
  override.
- **[LOW]** Complex (non-3×3) layouts read back as `structure: null`, so only
  `replace_slide` (destructive rebuild) can edit them. **[LOW]** (SPA-only
  module tools) `get_available_modules` reduces `dirty:"error"` to the bare
  word "Error" with no message while still showing `metricCount`, and
  remediation needs a `get_module_log` call the list doesn't hint at.
  **[LOW]** `get_module_settings` formats only `parameterSelections`,
  omitting other `ModuleConfigSelections` fields its description implies.
  **[LOW]**
  `sanitizeCaption` silently strips brackets/newlines from report captions with
  no feedback (mangles e.g. "95% CI [0.4, 0.6]").
- **[MED, reuse/quality, not a bug] Unify the figure-RESOLUTION cores.** AI
  figure create/edit already share replicant validation (`assertReplicantValid`,
  applied uniformly, no flags). Still split: two functions do "config → fetch
  items → capture geo → assemble FigureBundle" with different item-fetch
  mechanics: `resolveFigureBundleFromMetric` (caller precomputes the
  fetchConfig) and `resolveFigureBundleFromVizConfig` (items fetch auto-defaults
  the replicant), plus a third assembler, `makeFigureBundleFromFetchedData`.
  Goal: one `resolveFigureBundle(source, config)` used by every
  create/edit/render path, with the metric-vs-PO difference reduced to how the
  source is produced. The friction to design around is the two item-fetch routes
  (`_PO_ITEMS_CACHE` with a precomputed fetchConfig vs
  `getPresentationObjectItemsFromCacheOrFetch`, which runs
  `resolveDefaultReplicant`). Higher blast radius (dashboards, public and
  reports all render through the PO core), so it wants its own scoped refactor
  and review pass, not improvisation.

This inventory is also the **spine of a SYSTEM_13 restructuring**: organize this
doc around the "read-projection = write-schema = stored-shape" principle and
inventory every tool against it.

**Hygiene**

- The duplicated 429 fetch wrapper in the HFA sdk_client is the remaining
  client-side duplication.
- Rename the PascalCase DB log functions; decide the `can_use_ai` permission
  question (any-member remains the deliberate state until then).
