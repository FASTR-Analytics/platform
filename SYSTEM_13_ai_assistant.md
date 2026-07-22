---
system: 13
name: AI Copilot & Usage Governance
globs:
  - client/src/components/project_ai/**
  - client/src/components/slide_deck/slide_ai/build_config_from_metric.ts
  - client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts
  - client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts
  - client/src/components/slide_deck/slide_ai/get_deck_summary.ts
  - client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts
  - client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts
  - client/src/state/project/t4_ai_documents.ts
  - lib/types/ai_input.ts
  - lib/types/custom_prompts.ts
  - server/db/instance/ai_usage_logs.ts
  - server/db/instance/custom_prompts.ts
  - server/routes/anthropic_messages_proxy.ts
  - server/routes/instance/custom_prompts.ts
  - server/routes/project/ai_files.ts
  - server/routes/instance/ai_proxy.ts
  - server/routes/project/ai_proxy.ts
  - server/routes/project/ai_tools.ts
---
# S13 — AI Copilot & Usage Governance

The Anthropic proxies with token-limit governance, plus the browser-side
copilot: ~38 client-executed tools mutating app state only through the
AIContext contract. Reviewed against code 2026-07-07 (first review cycle;
absorbed and deleted DOC_AI_PROXY_AND_USAGE_GOVERNANCE and
DOC_AI_TOOL_SCHEMAS — the authoring recipe from the latter now lives in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)). Two same-day fix
batches (governance + panther turn-logic, then the client-copilot findings)
are folded into the prose; remaining triaged findings are in Open items
below.

Boundaries: the chat engine — request shaping, turn/continuation logic,
tool-execution loop, display registry, conversation persistence — is
panther's `_305_ai` + `_110_ai_types` (vendored; fixes land in the panther
repo and re-sync). Guards themselves are **S1**; the daily token counters are
columns on `users` (`db/instance/users.ts` is S1-owned with S13 a mandatory
reader — SYSTEMS.md §4.1). The unguarded health routes that surface usage are
**S15**. The HFA indicator-manager assistant client
(`client/src/components/indicator_manager_hfa/ai/**`) is an **S5-owned
satellite**: S13 owns the `/ai-instance` proxy it talks to, the panther
engine contract, and the tool-schema conventions it must follow; S5 owns the
tool semantics. The slide/figure shapes the slide_ai helpers produce are
**S10/S12**; the query pipeline the data tools call is **S9**.

## Principles

1. **The server is a thin proxy with governance.** The client speaks the
   Anthropic Messages API; the server forwards to Anthropic, enforces token
   limits, logs usage, and streams the response straight back. All model
   calls traverse a proxy; nothing else server-side talks to Anthropic.
2. **Tools execute in the browser** through the same serverActions/caches as
   the human UI, so the AI inherits the user's permissions for free and can
   never do what the user can't.
3. **Editors expose live mutators via the AIContext discriminated union** —
   the AI edits exactly the same in-memory editor state the user is looking
   at, never a parallel copy.
4. **Anthropic shapes in, Anthropic shapes out.** The proxies return
   Anthropic-shaped bodies and errors (not the `APIResponse` envelope)
   because the client Anthropic SDK parses them — the enumerated exception to
   the envelope rule (S1).
5. **AI input schemas derive from storage schemas** (`configDStrict` et al.)
   so AI-built configs are storage-compatible by construction — see
   [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

## The proxies

One shared handler,
[anthropic_messages_proxy.ts](server/routes/anthropic_messages_proxy.ts) —
governance, usage logging, and beta policy live there so the two mounts
cannot drift — behind two thin raw Hono routes (deliberately outside the S1
route registry), mounted in [main.ts:145-147](main.ts#L145-L147):

| | Project proxy | Instance proxy |
|---|---|---|
| Route | `POST /ai/v1/messages` ([ai_proxy.ts](server/routes/project/ai_proxy.ts)) | `POST /ai-instance/v1/messages` ([ai_proxy.ts](server/routes/instance/ai_proxy.ts)) |
| Guard | `requireProjectPermission()` — **no specific permission**; any approved project member can spend tokens | `requireGlobalPermission("can_configure_data")` |
| Usage log `project_id` | `ppk.projectId` | `null` |
| Client | project copilot ([defaults.ts:22](client/src/components/project_ai/ai_configs/defaults.ts#L22), sends `Project-Id` header) | HFA indicator-manager assistant ([sdk_client.ts](client/src/components/indicator_manager_hfa/ai/sdk_client.ts)) |

The shared flow:

1. Key and URL come from the boot-validated `_ANTHROPIC_API_KEY` /
   `_ANTHROPIC_API_URL` (`exposed_env_vars.ts`; the URL env is the **full**
   messages endpoint, `https://api.anthropic.com/v1/messages`).
2. **Daily limit**: `_DAILY_TOKEN_LIMIT !== null && !unlimitedAi` →
   `GetUserDailyTokenUsage >= limit` → `LogAiLimitHit(email, "daily_user")` +
   Anthropic-shaped 429 whose message embeds the next-UTC-midnight reset ISO.
3. **Weekly limit**: same gate shape → `GetInstanceWeeklyTokenUsage >= limit`
   → `LogAiLimitHit("__instance__", "weekly_instance")` (sentinel, not the
   email) + 429 with next-Monday-UTC reset.
4. **Beta headers**: `files-api-2025-04-14` computed when any message
   carries a `document` block, merged with client-supplied `anthropic-beta`
   values **filtered through the `FORWARDABLE_BETAS` allowlist** (web-fetch,
   files-api, structured-outputs — the set panther actually sends; SDK
   ≥0.110 sends betas via the header, not the body). Unknown client betas
   are dropped so users can't enable cost-changing betas under the same
   token limits.
5. `fetch(_ANTHROPIC_API_URL)`, `anthropic-version: 2023-06-01`. The SDK's
   `?beta=true` query is ignored by the route matcher.
6. `!ok` → `{error: "Anthropic API error: <status> - <text>"}` at the
   upstream status.
7. **Streaming**: a `TransformStream` tees SSE lines. `message_start` seeds
   input/cache token counts; `message_delta.usage` is **cumulative** for the
   whole response and overrides every non-null field (server-tool turns run
   multiple internal sampling iterations and only the delta carries the true
   input totals — assign, never add). Accounting settles exactly once via an
   idempotent `settle()` wired to both `flush()` (graceful completion) and
   the transformer's `cancel()` hook (client abort — Stop button, tab
   close), so aborted streams log their partial counts instead of nothing.
   (Deno's `Transformer` lib type predates `cancel`; the runtime honors it —
   empirically verified.)
8. **Non-streaming**: parse `data.usage`, same log + increments.
9. Increment amount is `inputTokens + outputTokens` only — cache tokens are
   logged but never counted against limits (an implicit policy; Open items).
   The daily increment runs even for `unlimitedAi` users (tracked, never
   enforced); the weekly increment is skipped for them — be deliberate about
   which counters unlimited users should affect.

**Governance storage.** Daily counter = columns on `users`
([users.ts:279-311](server/db/instance/users.ts#L279-L311), S1 seam): the
read compares the stored date to today in JS UTC, the write uses Postgres
`CURRENT_DATE` — identical only while the DB session runs UTC. Weekly
counter = `instance_weekly_token_usage` upserted on
`date_trunc('week', CURRENT_DATE)`
([ai_usage_logs.ts:4-20](server/db/instance/ai_usage_logs.ts#L4-L20)).
Per-call rows = `ai_usage_logs` (email, nullable project_id, model, 4 token
counts). Limit hits = `ai_limit_hits`, PK `(user_email, limit_type,
hit_date)` so `ON CONFLICT DO NOTHING` dedupes to one row per day.
`unlimitedAi` = `H_USERS` membership or `users.unlimited_ai`
([project_auth.ts:204](server/project_auth.ts#L204)). `_DAILY_TOKEN_LIMIT` /
`_WEEKLY_TOKEN_LIMIT` are `parseInt`-or-`null`, with a boot-time throw on an
unparseable value
([exposed_env_vars.ts:142](server/exposed_env_vars.ts#L142)); `null` =
disabled. All logging and increments are `.catch(() => {})`
fire-and-forget — accounting is best-effort, not transactional, and the
limits are check-before / increment-after, so concurrent requests can
overshoot: a courtesy bound, not a hard one.

**The error contract, as built.** Three deliberate non-envelope shapes: the
429 rate-limit object, the upstream-status error string, and anything
*thrown* in the handler (malformed request JSON, upstream fetch network
failure), which the shared handler catches and returns as an
Anthropic-shaped 500 ([anthropic_messages_proxy.ts:51-66](server/routes/anthropic_messages_proxy.ts#L51-L66))
rather than letting it fall to `app.onError`'s envelope-at-HTTP-200. The one
envelope shape on the surface: guard rejections are `{success:false, err}`
at 401/403.

**Health surfacing (S15).** `GET /ai_usage` (full `SELECT *`, optional
`since`), `/ai_weekly_usage`, `/ai_limit_hits`
([health.ts:168-186](server/routes/instance/health.ts#L168-L186)) — health
routes are public by design, but `/ai_usage` returns per-user emails and
per-call behavior, unbounded (Open items).

## The Files proxy

[ai_files.ts](server/routes/project/ai_files.ts) — three raw routes, all
`requireProjectPermission()`, proxying the Anthropic Files API with the
files-api beta header. `POST /ai/files` is **not** a client-upload
passthrough: the body is `{assetFilename}`, the server reads that file from
the instance assets dir on disk (traversal-guarded via
`resolveAssetFilePath`) and multiparts it to Anthropic — hardcoded as
`application/pdf` regardless of actual type (:45). `GET`/`DELETE
/ai/files/:file_id` pass through by id with no scoping of ids to the
project. Uploaded files are referenced as `document` blocks in later
`/v1/messages` calls.

## The client copilot

[`AIProjectWrapper`](client/src/components/project_ai/index.tsx#L24) wraps
the whole project UI (inside `ProjectSSEBoundary`, remounted per project via
keyed `?p=` match, so the captured `projectId` is safe). It builds one
panther `AIChatProvider` config (index.tsx:102-161):

- **sdkClient** ([defaults.ts:22-46](client/src/components/project_ai/ai_configs/defaults.ts#L22-L46)):
  Anthropic browser SDK, `baseURL {host}/ai`, `apiKey: "not-needed"`,
  `Project-Id` default header, plus a fetch wrapper that rewrites the ISO
  reset timestamp inside 429 bodies to the user's locale.
- **modelConfig** = `DEFAULT_MODEL_CONFIG`: `DEFAULT_ANTHROPIC_MODEL`
  (`claude-sonnet-4-6`, [consts.ts:152](lib/consts.ts#L152)),
  `max_tokens: 32000` (fits every allowed model's output cap; a report
  rewrite is one tool_use block that must fit inside max_tokens),
  `output_config: {effort: "high"}` (re-resolved per model by panther;
  dropped where unsupported). Panther clones the consumer's modelConfig into
  per-instance state, so the shared module-level default is never mutated.
  The settings panel exposes model + max_tokens (`adjustable`;
  `allowedModels`: opus-4-8, opus-4-6, sonnet-4-6, haiku-4-5,
  [chat_pane.tsx:148](client/src/components/project_ai/chat_pane.tsx#L148));
  the allowlist is client-side only — the proxy forwards any `model`
  verbatim (Open items).
- **builtInTools** = `{webSearch: true, webFetch: true}` — Anthropic
  server-side tools, resolved per model by panther (dynamic `_20260209`
  variants on 4.6+, basic + beta header otherwise). Currently unrestricted:
  no `max_uses` / `allowed_domains` / `max_content_tokens` (Open items).
- **scope** = `projectId` — keys panther's conversation registry (IndexedDB)
  and persisted settings (`panther-ai-settings-{projectId}`).
- **system** = `buildSystemPromptForContext` memo; **getDocumentRefs** from
  `useAIDocuments`; **getEphemeralContext** (below).

The chat pane (`ConsolidatedChatPane`,
[chat_pane.tsx:104](client/src/components/project_ai/chat_pane.tsx#L104))
lives in a `FrameRightResizable` panel toggled by `showAi()` (T4 UI state)
and registers three custom renderers, keyed to panther's `DisplayRegistry`:
`toolError`, `systemNotice` (refusals/truncation/context-exceeded/
continuation caps arrive as `system_notice` items), and `userText`
(`SaveableUserTextRenderer` — adds save-to-prompt-library, strips ephemeral
markers from display).

**Ephemeral context.** `getEphemeralContext` (index.tsx:111-144) runs once
per user send: a `[Current mode: …]` line (vizId/deckId/slideId/reportId,
selected slide ids, or the live CodeMirror selection preview) plus a batched
"User actions since last message" digest from the interactions queue, then
clears the queue. Panther wraps it in `<<<[…]>>>` markers spliced into the
user text (stripped from all but the last user message) — except on Opus
4.8, where it travels as a pruned mid-conversation `{role:"system"}`
message. Interactions come from editors (`edited_*_locally`, selections) and
from SSE `last_updated` events (slides / presentation_objects / slide_decks
→ index.tsx:68-99); `reduceInteractions`
([interactions.ts](client/src/components/project_ai/interactions.ts))
dedupes and filters by mode. The SSE path also echoes the AI's *own* tool
edits back as "user actions" (Open items).

## Tools and the AIContext contract

[`buildToolsForContext`](client/src/components/project_ai/build_tools.ts#L37)
assembles one flat array of ~38 tools, all always registered with the API:
base data tools (metrics, modules, visualizations, slide decks, reports,
methodology docs, info), mode-specific editor tools (deck-level slides,
slide editor, report editor, viz editor), navigation, draft previews, and
panther's `ask_user_questions`. **Mode gating happens inside handlers, not
by tool filtering**: each mode-specific handler calls `aiContext()` and
throws if the mode doesn't match; navigation refuses tab switches while in
any `editing_*` mode.

[`AIContext`](client/src/components/project_ai/types.ts#L119) is the
discriminated union: 7 viewing modes + 4 editing modes carrying live-mutator
closures — `getTempConfig`/`setTempConfig` (viz editor),
`getTempSlide`/`setTempSlide` (slide editor),
`getDeckConfig`/`getSlideIds`/`getSelectedSlideIds` (deck), and the report
contract (`getBody`/`getFigures`/`getImages`/`getSelection`/`proposeEdit`/
`applyFigureUpdate`). Providers: a tab-level `AIContextSync` effect
([project/index.tsx:57-87](client/src/components/project/index.tsx#L57-L87))
plus the four editors, each restoring `returnToContext` on close. Report
edits are never silent: `proposeEdit` stages an accept/reject diff and
resolves with the outcome so the tool reports honestly;
`applyFigureUpdate` is the stable-id figure path that persists directly and
reports save failure.

**Validate-before-commit.** `update_figure` (slide editor, deck level),
`update_report_figure`, and `update_viz_config` build the patched config and
run the full validation stack — `applyFigureConfigPatch`, display-slot
checks, `validateMetricInputs` (live data), replicant assertion — *before*
any store write, so a throw provably means "nothing changed".

**Tool freshness rests on store aliasing, not reactivity.** The tools array
is built exactly once at wrapper setup (index.tsx:44-61) — panther registers
`config.tools` into its `ToolRegistry` once at chat construction, so a
rebuilt array would never reach the chat anyway. Handlers stay fresh only
because they close over Solid store proxies that are updated in place via
`reconcile`. Anything evaluated at tool-*build* time is frozen at mount
(e.g. a `completionMessage` template literal) — keep such reads out of tool
construction. The invariant is documented at the build site.

## Tool input schemas

The architecture half of the schema story (the authoring recipe is
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)):

- **AI schemas derive from storage schemas.** `configDStrict`
  ([lib/types/_metric_installed.ts:160](lib/types/_metric_installed.ts#L160)
  — a strip-mode `z.object` despite the name; `filterBy[].values` and
  `valuesFilter` carry `.min(1)`) is the source of truth. Three derived
  surfaces exist: `AiMetricQuerySchema`
  ([ai_input.ts](lib/types/ai_input.ts) — filters/disaggregations/
  valuesFilter via `.shape.*`), the viz editor's `vizConfigUpdateSchema`
  ([visualization_editor.tsx:24-68](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L24-L68)),
  and `AiFigureConfigPatchSchema` + `LayoutSpecSchema`
  ([ai_input.ts:152-231](lib/types/ai_input.ts#L152-L231)) used by
  `update_figure`/`update_report_figure`. The documented exception pattern
  (`startDate`/`endDate` instead of a full `periodFilter`, converted against
  the metric's most-granular time column) is preserved everywhere.
- **Layer-1 enforcement lives in panther**: `createAITool` attaches
  `parse: schema.parse` and re-parses inside `run()`
  ([tool_helpers.ts:87-102](panther/_305_ai/_core/tool_helpers.ts#L87-L102));
  the engine catches any throw (ZodError or handler) and returns
  `is_error: true` so the model self-corrects
  ([tool_engine.ts:117-146](panther/_305_ai/_core/tool_engine.ts#L117-L146)).
  Handlers must throw, never return error strings.
- **Layer-2 (data-dependent) validation** lives in
  [content_validators.ts](client/src/components/project_ai/ai_tools/validators/content_validators.ts)
  (dimension availability per metric, date format/ordering, preset
  overrides, filter values and period bounds against live data) and
  [report_validators.ts](client/src/components/project_ai/ai_tools/validators/report_validators.ts)
  (token resolution, body caps).

## The slide_ai conversion layer

The S13-owned files in `client/src/components/slide_deck/slide_ai/` convert
between AI input shapes and stored `Slide`/`FigureBundle` shapes; deck-level
and editor-level tools call the same resolvers, so behavior is identical:

- [build_config_from_metric.ts](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts)
  — AiFigureFromMetric → `PresentationObjectConfig`: preset spread over
  defaults, AI overrides applied (filters gated by `preset.allowedFilters`,
  startDate/endDate → `custom` periodFilter via `convertPeriodValue`).
- [resolve_figure_from_metric.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts)
  / [resolve_figure_from_visualization.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts)
  — the AI adapters over the shared bundle resolvers; AI paths get *strict*
  replicant validation (`assertReplicantValid` throws) where non-AI callers
  keep the lenient auto-default.
- [convert_ai_input_to_slide.ts](client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts)
  — AiSlideInput → stored `Slide`: resolve blocks, `optimizePageLayout` at
  the canonical page frame, re-attach bundles, and `slideConfigSchema.parse`
  the result (validate-at-construction — the add-to-deck ZodError lesson).
- [get_slide_with_updated_blocks.ts](client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts)
  — targeted block replacement preserving what the AI schema can't express
  (text styles, node-level layout overrides);
  [layout_spec_helpers.ts](client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts)
  — `LayoutSpec` (rows/12-col spans, `normalizeSpans` enforces sum-to-12) ↔
  `LayoutNode`;
  [extract_blocks_from_layout.ts](client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts)
  — `simplifySlideForAI`, the model-facing slide view;
  [get_deck_summary.ts](client/src/components/slide_deck/slide_ai/get_deck_summary.ts)
  — deck outline for `get_deck` (slides read through
  `getSlideFromCacheOrFetch`, so a fresh session's first call sees content).

## System prompt, documents, prompt library

**System prompt**
([build_system_prompt.ts](client/src/components/project_ai/build_system_prompt.ts)):
date header + instance/terminology section (country, admin-area labels,
data sources) + project section (datasets, indicator lists, counts, the
freeform `projectState.aiContext`) + reference-doc catalog (`INFO_TOPICS`) +
base instructions (read-data-first, no fabrication, indicator
directionality) + per-mode instructions with a Primary Tools list. Viewable
via the chat menu; the debug panel
([ai_debug_panel.tsx](client/src/components/project_ai/ai_debug_panel.tsx))
renders the metric/viz list formatters verbatim so a human sees exactly what
the model sees. AI data payloads exclude the admin-area roll-up row
(double-counting guard, S9).

**Documents.** `useAIDocuments` keeps `{assetFilename, anthropicFileId}`
pairs per project in IndexedDB
([t4_ai_documents.ts](client/src/state/project/t4_ai_documents.ts) — T4:
per-browser, no server copy, no invalidation when the underlying asset is
replaced). The selector modal lists instance PDF assets and uploads new
selections through `POST /ai/files`; `getDocumentRefs` feeds panther, which
attaches each configured document to the next user message the conversation
hasn't yet sent it in — mid-conversation attach works. Removing a document
also best-effort DELETEs the Anthropic-side file; the remaining lifecycle
gap is asset replacement, which the IndexedDB pairing never notices (Open
items).

**Prompt library.** Shared prompts fetched at open from the GitHub
`fastr-resource-hub` (`prompts.md`/`prompts_fr.md`, cache-busted; parsed by
[parse_prompts.ts](client/src/components/project_ai/ai_prompt_library/parse_prompts.ts))
plus custom prompts — user-scoped and country-scoped rows in the main DB
([lib/types/custom_prompts.ts](lib/types/custom_prompts.ts); registry
routes [custom_prompts.ts](server/routes/instance/custom_prompts.ts)).
Reads return country-scoped ∪ own user-scoped; create stamps a server
UUID + `createdBy`; update/delete require author-or-admin in SQL. Because
`requireGlobalPermission()` with zero permissions never checks `approved`,
every handler rejects unapproved users itself, and creating or re-scoping a
prompt to `"country"` — a prompt-injection surface offered to every user's
copilot — is admin-only. `created_by` is FK-cascade on user delete —
deleting a user silently deletes their country-scoped prompts too.

`ai_tools.ts` ([routes/project/ai_tools.ts](server/routes/project/ai_tools.ts))
is the one registry-based route in this system: `getVisualizationsListForAI`.

## The panther engine (what this app depends on)

Synced 2026-07-07 (commits 62ed6c03/ca3ae868, SDK 0.71 → 0.110). The parts
S13 relies on, verified this cycle:

- **Request shaping** ([request_shaping.ts](panther/_110_ai_types/request_shaping.ts)):
  ≤2 prompt-cache breakpoints placed per send (system + last user message;
  stored state never carries `cache_control`); per-model resolution of
  thinking/effort/temperature (prevents 400s across the whole allowed-models
  list, including adaptive-only Opus 4.8); persisted settings sanitized
  against retired model ids and caps at init.
- **Turn logic** ([turn_logic.ts](panther/_110_ai_types/turn_logic.ts)):
  stop_reason → done / halt (refusal, truncation, context-exceeded) /
  pause_turn resume / tool loop / caps, recursion bounded by
  `MAX_TURN_CONTINUATIONS = 24`. Both capped **and halted** turns synthesize
  cancelled tool_results, so persisted history never ends in unresolved
  `tool_use` (which would 400 every later send); a cap-pause trim that
  empties an assistant message persists a placeholder text instead. Halts
  render as `system_notice` display items.
- **Built-in server tools** ([builtin_tools.ts](panther/_305_ai/_core/builtin_tools.ts)):
  webSearch/webFetch resolved per model; on non-dynamic models the basic
  variants + `web-fetch-2025-09-10` beta — which only works because the
  proxy forwards allowlisted client beta headers.
- **Every continuation round is a separate proxy POST**, so each round is
  independently limit-gated and logged — the multi-turn design has no
  unlogged turns; the remaining accounting gap is server-tool request fees
  (Open items).
- `one_shot.ts` (`callAI`/`callAIStructured`) exists in the barrel but has
  **zero consumers in this app**.

## The HFA satellite (S5-owned, S13-governed)

`client/src/components/indicator_manager_hfa/ai/` is a second, fully
isolated assistant: same panther engine, own conversation scope
(`hfa-indicators`), own SDK client pointed at `/ai-instance` (no
`Project-Id`; duplicates the 429-localizing fetch wrapper), same model
config shape, **no built-in web tools**. Structural differences from the
copilot: no AIContext — every write goes straight to serverActions; every
write tool shows an `openConfirm` diff dialog first, serialized through
`confirmChain` because the engine runs a turn's tool calls concurrently; the
system prompt deliberately embeds no live state (the model reads through
tools, avoiding staleness with its own edits). Write tools do whole-object
load → confirm → save, last write wins — the app-wide concurrency model,
deliberate (a re-read-after-confirm refactor was rejected 2026-07-07 as an
inconsistent outlier). Its hand-written schemas
comply with the S13 conventions (storage field names, throw-don't-catch, no
strictObject / strict:true). S13 convention changes must be checked against
this directory; its tool semantics are S5's.

## Traps

- **The proxy is a body-verbatim forwarder.** Anything panther's shaping
  adds (mid-conversation system messages, new SSE event types) passes
  through untouched — but the *usage parser* reads specific event shapes
  (`message_start`/`message_delta`); an Anthropic event-shape change
  silently zeroes logged usage. New betas panther starts sending must be
  added to `FORWARDABLE_BETAS` or they are silently dropped.
- **Governance changes go in `anthropic_messages_proxy.ts`**, never in the
  two mount files — they are deliberately logic-free.
- **Don't wrap proxy responses in `APIResponse`** — the client SDK parses
  Anthropic shapes. Equally: don't let new failure paths fall to
  `app.onError`, which returns an envelope at HTTP 200 the SDK can't parse.
- **Tools are registered once at pane mount.** Handler freshness depends on
  closing over reconciled store proxies; values computed at build time
  freeze. A refactor that *replaces* a projectState array instead of
  reconciling it freezes the AI's world with no error.
- **`z.strictObject` and `strict: true` are banned in tool schemas** —
  see PROTOCOL_APP_AI_TOOLS.md.
- **Token limits are token-denominated, not dollar-denominated.** Cache
  tokens don't count, model price varies 10× and is client-chosen,
  server-tool fees are flat-rate per invocation — treat the limits as
  volume brakes, not budget enforcement, until the Open items below are
  decided.

## Open items

Triaged findings from the 2026-07-07 review. Two same-day fix batches closed
the governance HIGHs (delta-based usage parsing, cancel-hook accounting,
beta allowlist, NaN boot validation, shared-handler extraction), the
custom-prompts gate, the truncation brick (panther turn-logic + max_tokens
raise/expose), the panther modelConfig/labels/cap-pause items, and the
client-copilot findings (filter-schema template, mid-conversation PDF
attach, file DELETE on remove, `update_viz_config` live-data validation,
`switch_tab` reports, `get_deck` fetch-on-miss, tools-reactivity memo
removal, ai_files env/URL cleanup, Anthropic-shaped thrown errors, CORS
header enumeration, and the LOW hygiene tail). The HFA whole-object
read-modify-write finding was **rejected** — it matches the app-wide
last-write-wins model (see the satellite section). Remaining:

**Governance policy (decisions, not bugs)**

- **[MED] Cache tokens excluded from limit counting** while panther now
  guarantees cache breakpoints on every request — most long-conversation
  input is limit-free. Decide the policy (count at a weight, or state
  it's intentional).
- **[MED] No server-side model allowlist** — the proxy forwards any `model`;
  the client list is advisory. Per-token price varies ~10× under the same
  numeric limits.
- **[MED] Server-tool request fees invisible** — `server_tool_use` counts
  are neither logged (needs an `ai_usage_logs` column/migration) nor bounded
  (`max_uses` unset).
- **[LOW] Check-before/increment-after race** — concurrent requests
  overshoot limits by ~concurrency × max_tokens; acceptable for a courtesy
  limit, stated here so it's deliberate.
- **[LOW]** Daily-counter date compared in JS UTC but written with
  Postgres `CURRENT_DATE` — drifts if the DB isn't UTC.

**Security / access**

- **[MED] `webFetch` unrestricted in a health-data app** — prompt-injected
  exfiltration via `web_fetch` to attacker URLs; Anthropic's own guidance is
  domain allowlisting. Configure `allowed_domains`/`max_uses`.
- **[MED] Public `/ai_usage`** returns per-user emails + per-call behavior,
  unbounded full-table scan; the other health routes expose aggregates.
  Decide the exception or add guard/limit.
- **[LOW] Files-API ids unscoped** — any project member can GET/DELETE any
  file under the instance key. **[LOW]** Upload hardcodes
  `application/pdf` for all assets.

**Client copilot**

- **[MED] Documents never invalidate on asset replace** — the per-browser
  IndexedDB `{assetFilename, anthropicFileId}` pairing keeps serving the old
  Anthropic file after the underlying instance asset is replaced (removal
  now cleans up server-side; replace is the remaining stale/orphan path).
- **[LOW]** Residual SSE self-echo under live collab only (the general case
  was fixed 2026-07-22 by `markAIEdit` echo keys on every persist-path write
  tool): collab checkpoints persist AI `setTempSlide`/`setTempConfig` edits
  and notify `slides`/`presentation_objects`, echoing back unmarked as
  "Edited slide X" / "Visualization X updated". Marking those keys would
  also suppress genuine co-editor actions on the same slide/viz — a design
  question (per-origin echo keys? checkpoint-carried origin?), not a
  missing mark; predates the interactions migration.

**HFA satellite (fixes are S5's to land; contract is S13's)**

- **[MED-LOW] `set_hfa_indicator_code` partial application** — sequential
  per-indicator saves; a mid-loop failure leaves earlier saves applied while
  the error implies none were.

**Hygiene**

- The duplicated 429 fetch wrapper in the HFA sdk_client is the remaining
  client-side duplication.
- Rename the PascalCase DB log functions; decide the `can_use_ai` permission
  question (any-member remains the deliberate state until then).
