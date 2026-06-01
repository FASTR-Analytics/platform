# AI Proxy & Usage Governance

The runtime AI subsystem: the `/ai/v1/messages` Anthropic passthrough, the `/ai/files` Files-API proxy, the daily-user / weekly-instance token-limit governance, the `unlimitedAi` exemptions, usage logging, dynamic prompt-caching / Files beta headers, and the deliberately non-`APIResponse` Anthropic-shaped error contract.

> This is the AI **runtime/proxy**. The Zod schemas for AI tool *inputs* (derive-from-storage, two-layer validation) are a separate concern in [DOC_AI_TOOL_SCHEMAS.md](DOC_AI_TOOL_SCHEMAS.md). The `ai_tools.ts` endpoint that lists visualizations for the assistant is registry-based (`defineRoute`) and follows [DOC_API_ROUTES.md](DOC_API_ROUTES.md) — only the proxy + files routes here are raw. The `unlimitedAi`/`H_USERS` exemption model is [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

---

## Principles

1. **The server is a thin proxy with governance.** The client speaks the Anthropic Messages API; the server forwards to Anthropic, enforces token limits, logs usage, and streams the response straight back.
2. **Two-tier rate limiting.** A per-user daily limit and a per-instance weekly limit, each independently enabled by an env var and each bypassable by `unlimitedAi` users.
3. **Anthropic shapes in, Anthropic shapes out.** The proxy intentionally returns Anthropic-shaped bodies (and Anthropic-style `429`/error objects), not the `APIResponse` envelope, because the client SDK expects them. This is the documented exception to the envelope rule.
4. **Every call is logged.** Token usage (input/output/cache) is recorded per call regardless of success path.

---

## The System

```text
  client (Anthropic Messages API shape)
    POST /ai/v1/messages   (requireProjectPermission(), no specific perm)
        │
        ▼
  daily-user limit?   _DAILY_TOKEN_LIMIT set && !unlimitedAi && usage >= limit
        → LogAiLimitHit("daily_user") → 429 rate_limit_error (resets next UTC midnight)
  weekly-instance limit?  _WEEKLY_TOKEN_LIMIT set && !unlimitedAi && usage >= limit
        → LogAiLimitHit("weekly_instance") → 429 (resets next Monday UTC)
        │
        ▼
  build beta headers: prompt-caching (if stream/cache_control), files-api (if document block)
        │
        ▼
  fetch https://api.anthropic.com/v1/messages  (x-api-key, anthropic-version)
        ├─ !ok → { error: "Anthropic API error: <status> - <text>" } @ upstream status
        ├─ stream → TransformStream tees SSE: accumulate usage → on flush: log + increment
        └─ json  → parse usage → log + increment → c.json(data)
```

### The proxy route (`server/routes/project/ai_proxy.ts`)

`POST /ai/v1/messages`, raw Hono, guarded by `requireProjectPermission()` with **no specific permission** (any project member). It:
1. reads `ANTHROPIC_API_KEY` (via raw `Deno.env.get` — see enforcement), 500s if missing;
2. enforces the daily and weekly limits (below);
3. builds `anthropic-beta` headers dynamically: `prompt-caching-2024-07-31` when streaming or any `system` block has `cache_control`; `files-api-2025-04-14` when any message has a `document` content block;
4. `fetch`es `https://api.anthropic.com/v1/messages` (hardcoded URL) with `x-api-key` + `anthropic-version: 2023-06-01`;
5. **streaming:** pipes the response through a `TransformStream` that parses SSE events (`message_start` → input/cache tokens, `message_delta` → output tokens) and, on `flush`, logs + increments usage; returns `text/event-stream`;
6. **non-streaming:** reads `data.usage`, logs + increments, returns `c.json(data)`.

### Token-limit governance

| Limit | Env | Scope | Check (skipped if `unlimitedAi`) | Reset |
|-------|-----|-------|----------------------------------|-------|
| Daily | `_DAILY_TOKEN_LIMIT` (`number\|null`) | per user | `GetUserDailyTokenUsage(email) >= limit` | next UTC midnight |
| Weekly | `_WEEKLY_TOKEN_LIMIT` (`number\|null`) | per instance | `GetInstanceWeeklyTokenUsage() >= limit` | next Monday UTC |

`null` = limit disabled. On a hit, `LogAiLimitHit(email, "daily_user" | "weekly_instance")` and a `429 { type: "error", error: { type: "rate_limit_error", message } }`. `unlimitedAi` comes from `GlobalUser` (`H_USERS` membership or `users.unlimited_ai`) — see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md).

### Usage logging (`server/db/instance/ai_usage_logs.ts`)

| Function | Purpose |
|----------|---------|
| `AddAiUsageLog(db, email, projectId, model, in, out, cacheRead, cacheCreation)` | per-call usage row |
| `GetUserDailyTokenUsage` / `IncrementUserDailyTokenUsage` | per-user daily counter |
| `GetInstanceWeeklyTokenUsage` / `IncrementInstanceWeeklyTokenUsage` | instance weekly counter |
| `LogAiLimitHit` / `GetAiLimitHits` | record + report limit hits |
| `GetAiUsageLogs` | usage history |

These are surfaced by the `health.ts` diagnostics routes (`/ai_usage`, `/ai_weekly_usage`, `/ai_limit_hits`) — which are themselves unguarded (see [DOC_ACCESS_CONTROL.md](DOC_ACCESS_CONTROL.md)). All increment/log calls are fire-and-forget (`.catch(() => {})`).

### The Files proxy (`server/routes/project/ai_files.ts`)

Raw Hono, same `requireProjectPermission()` + raw `ANTHROPIC_API_KEY`. `POST /ai/files` (upload), `GET /ai/files/:file_id`, and delete — proxying Anthropic's Files API with the `files-api-2025-04-14` beta header. Uploaded files are referenced as `document` blocks in subsequent `/v1/messages` calls (which triggers the proxy's Files beta header).

### The non-envelope error contract

The proxy returns three non-`APIResponse` shapes, by design (the client's Anthropic SDK expects them):
- `429 { type: "error", error: { type: "rate_limit_error", message } }` (governance);
- `500 { error: { message } }` (missing key);
- upstream-error `{ error: "Anthropic API error: <status> - <text>" }` at the upstream status.

This is the **enumerated exception** to the "routes return `APIResponse`" rule in [DOC_API_ROUTES.md](DOC_API_ROUTES.md).

---

## Rules

1. **Route all model calls through `/ai/v1/messages`.** Don't add a second path that calls Anthropic directly — governance + logging live in the proxy.
2. **Gate new limits on `unlimitedAi`** consistently (and `null`-check the env so a disabled limit is a true no-op).
3. **Log usage on every terminal path** (`AddAiUsageLog` + the relevant increment), as the streaming `flush` and the JSON path both do.
4. **Keep beta-header derivation feature-driven** (caching when caching is used; files when a document block is present) so requests don't carry unused betas.
5. **The Anthropic-shaped error contract is deliberate** — keep it, and keep it enumerated as an exception, don't "fix" it into the envelope.

---

## What NOT to do

- **Don't read `ANTHROPIC_API_KEY` (or the URL) with raw `Deno.env.get`.** `exposed_env_vars.ts` already exports `_ANTHROPIC_API_KEY` and `_ANTHROPIC_API_URL`, both **validated at boot** (throw if missing). The proxy + files routes re-read the key raw in 4 places (and hardcode `https://api.anthropic.com/...` instead of `_ANTHROPIC_API_URL`) — duplicating the env contract and defeating the boot-time check.
- **Don't leave AI behind a no-permission gate without deciding that's intended.** `requireProjectPermission()` means *any* project member can spend tokens; there is no `can_use_ai`-style permission.
- **Don't forget the increment after a successful call** — an un-incremented call lets a user exceed their limit silently.
- **Don't return the `APIResponse` envelope from the proxy** — the client SDK parses Anthropic shapes.

---

## Gotchas

- **Daily increment isn't gated on `unlimitedAi`; weekly increment is.** `IncrementUserDailyTokenUsage` runs whenever `_DAILY_TOKEN_LIMIT` is set (even for unlimited users), but `IncrementInstanceWeeklyTokenUsage` is skipped for `unlimitedAi`. So unlimited users still accrue *daily* usage numbers (tracked, never enforced) but contribute nothing to the *weekly* instance total. Be deliberate about which counters unlimited users should affect.
- **Usage is parsed from the stream.** For streaming calls, token counts come from teeing the SSE (`message_start`/`message_delta`); a change to Anthropic's event shape would silently zero the logged usage.
- **Limits use UTC reset boundaries** (next UTC midnight / next Monday UTC) regardless of instance locale.
- **Logging is fire-and-forget.** A failed `AddAiUsageLog`/increment is swallowed — usage accounting is best-effort, not transactional.

---

## Enforcement opportunities

- **Use `_ANTHROPIC_API_KEY` / `_ANTHROPIC_API_URL`** from `exposed_env_vars.ts` in the proxy and files routes; ban raw `Deno.env.get("ANTHROPIC_API_KEY")` (a server-conventions rule — no raw env reads outside `exposed_env_vars.ts`).
- **Decide the AI permission model** — a dedicated `can_use_ai` permission vs the current "any project member".
- **Enumerate the Anthropic-shaped error exception** in [DOC_API_ROUTES.md](DOC_API_ROUTES.md)'s raw-route list (this doc is the rationale).
- **Reconcile the daily-vs-weekly increment gating** so unlimited users are handled consistently.
- **Give this subsystem a home** (this doc) so the governance invariants — who is exempt, where limits are enforced, how usage is recorded — stop being inline-only.
- **Rename the PascalCase log functions** to camelCase (the DB-layer convention — see [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md)).

---

## Touching the AI runtime — checklist

- [ ] Model calls go through `/ai/v1/messages`; reuse the governance + logging path
- [ ] Read the API key/URL from `_ANTHROPIC_API_KEY` / `_ANTHROPIC_API_URL`
- [ ] New limits: `null`-check the env, gate on `unlimitedAi`, `LogAiLimitHit` on hit, increment on success
- [ ] Derive beta headers from features actually used
- [ ] Preserve the Anthropic-shaped response/error contract (don't wrap in `APIResponse`)
- [ ] Confirm usage is logged on every terminal path (stream `flush` and JSON)

---

## Key files

| File | Purpose |
|------|---------|
| `server/routes/project/ai_proxy.ts` | `/ai/v1/messages` proxy + governance + usage logging |
| `server/routes/project/ai_files.ts` | `/ai/files*` Files-API proxy |
| `server/db/instance/ai_usage_logs.ts` | usage counters, per-call log, limit-hit log |
| `server/exposed_env_vars.ts` | `_DAILY_TOKEN_LIMIT`, `_WEEKLY_TOKEN_LIMIT`, `_ANTHROPIC_API_KEY`, `_ANTHROPIC_API_URL` |
| `server/routes/instance/health.ts` | unguarded dashboards consuming the usage logs |
| `server/routes/project/ai_tools.ts` | registry-based tool-list endpoint (not part of the proxy) |
