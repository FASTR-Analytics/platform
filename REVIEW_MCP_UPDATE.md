# REVIEW — MCP reads the pinned package + shared/client AI-tool split

Instructions for an adversarial review of the work shipped 2026-08-19. Whoever
runs this (a Claude session with the Agent tool) launches the agents below,
collects their reports, verifies each finding independently, and reports back.
**Report only — no edits.** No agent, and no orchestrator, changes a file,
commits, stashes, or checks anything out.

## The change under review

Five commits on `main`, in order:

| Commit     | What                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `08a9bcb1` | panther sync — adds `bindAITool` (`panther/_112_ai_tool_core/scope_ai_tool.ts`); the rest of the sync is a concurrent figure-style workstream    |
| `9cc0a4ca` | Run-keyed package-data reads: `getRunReadContextForRun`, handler bodies extracted to `server/run_query/run_data_reads.ts`, 3 new instance routes  |
| `2654d5b7` | MCP reads the pinned package; `lib/ai_tools` = shared only; SPA-only tools moved to client; project settings route deleted; `headless_app` fix    |
| `373da318` | Docs (SYSTEM_13 §principle 2, SYSTEM_08, SYSTEM_09, SYSTEM_01, USER_GUIDE_MCP, PROTOCOL_APP_DEVELOPMENT)                                            |
| `716ac438` | Plan file deleted (`git show 716ac438^:PLAN_MCP_PINNED_PACKAGE.md` recovers the plan, incl. the rulings and the accepted/rejected review items)     |
| `40df6553` | SYSTEM_09 stale reference fix                                                                                                                      |

`git diff c2d9bfbd..40df6553 --stat` is the whole surface (ignore
`panther/` files other than `_112_ai_tool_core/`).

## Claims the work makes (each is a target)

1. **MCP contract.** `/mcp` exposes exactly 10 read-only tools
   (`get_orientation`, `get_available_metrics`, `get_metric_data`,
   `get_available_modules`, `get_module_r_script`, `get_module_log`,
   `get_module_settings`, `get_methodology_docs_list`,
   `get_methodology_doc_content`, `get_info`); no tool schema carries a project
   or package id; every call reads the instance's CURRENT pinned package (pin
   read from the DB per call, never the cached `InstanceState`); no pin →
   `get_orientation` still answers, every other package tool fails with the
   same typed message; gate = instance `can_view_data` (global admin bypass;
   `can_view_logs` for logs), national scope; nothing writes.
2. **One read core, two lenses.** The items / value-info handler bodies exist
   once (`server/run_query/run_data_reads.ts`) and are mounted twice — the
   project routes are behaviourally unchanged (same caches, same queues, same
   validation, same error texts) and the run-keyed instance routes are the
   same body under `requireGlobalPermission("can_view_data")` at national
   scope. A caller-supplied run id is shape-checked before it becomes a path.
3. **Copilot parity.** The SPA copilot has the same tools, same names, same
   schemas, same behaviour as before, EXCEPT `get_module_settings` now reads
   run-keyed under instance `can_view_data` (accepted ruling: a project member
   without the bit loses it, matching what the package tab already hides). The
   assembled system prompt is byte-identical to before for the same inputs;
   tool-catalog order is unchanged.
4. **Shared/client split.** `lib/ai_tools` contains only what BOTH surfaces
   use; `AIToolEnv` is a package data source bound at construction (no
   `projectId`, no `serverActions`); the client extends it
   (`ClientAIToolEnv`, `clientAIToolEnvFor(projectId)` memoized); SPA-only
   tools/formatters/validators live under
   `client/src/components/project_ai/ai_tools/` and
   `client/src/components/slide_deck/slide_ai/`. No shim or dead re-export
   remains.
5. **Security posture.** The headless allowlist admits exactly the run-keyed
   package reads + `getCurrentUser`; the headless app mounts exactly the route
   files those live in; a leaked PAT/OAuth token can read what the user's own
   instance bits reach and change nothing. The provenance-only `projectId`
   dropped from `ItemsHolderPresentationObject` /
   `ResultsValueInfoForPresentationObject` had no consumer.
6. **panther `bindAITool`.** Same invariants as `scopeAITool` (headless-only,
   no view-bound/nav, no view-typed approval, parse present); approval passes
   through structurally; a template handler can never run.

## Agents to launch (independent, in parallel, no shared findings)

Give each agent: this file, the commit list, and its lens. Do NOT give them
the claims section's conclusions as facts — give them the claims as things to
**refute**. Each agent reports findings with `file:line`, a concrete failure
scenario or reproduction, and a severity; "looks fine" is a valid section but
must say what was checked and how.

1. **Wire & auth adversary** (`server/mcp/**`, `server/headless_app.ts`,
   `server/middleware/headless_allowlist.ts`, `server/routes/instance/run_generation.ts`,
   `lib/api-routes/instance/run_generation.ts`). Try to: reach a project route
   through the headless dispatch; reach any run without `can_view_data`; read
   a run's outputs via a crafted `run_id` (traversal, non-UUID, a generating/
   failed run, a deleted run); get a stale pin served after a pin-move; get
   one token's context served to another token; find a write path; find a
   schema that leaks a project/run id; break `get_orientation` on no-pin.
   Execute what you can: `deno task dev` (Postgres/Valkey are up: `./pg_run`,
   `./valkey_run`) then `./mcp_probe local --list`, `--schema <tool>`, calls.
   Note `BYPASS_AUTH` in the dev `.env` short-circuits identity — say which
   claims that leaves unexercised.
2. **Two-lenses correctness** (`server/run_query/run_read.ts`,
   `run_data_reads.ts`, `server/routes/project/presentation_objects.ts`,
   `server/server_only_funcs_presentation_objects/*`, `query_rig/`). Diff the
   project routes' pre/post behaviour line by line
   (`git show 9cc0a4ca -- server/routes/project/presentation_objects.ts`):
   validation order, cache keys, queue sharing, `firstPeriodOption`
   derivation, error texts, the replicant route's continued use of the shared
   queue. Confirm the holder `projectId` drop has no consumer (client state,
   IndexedDB caches, exports, panther). Run `./validate_queries`.
3. **Copilot parity adversary** (`client/src/components/project_ai/**`,
   `client/src/components/slide_deck/slide_ai/**`, `lib/ai_tools/**`). Try to
   find any SPA tool whose name, schema, description, gating, `headless` flag
   consequence, or behaviour changed; any call site where the old
   singleton-env semantics differ from the memoized per-project env (e.g.
   navigation between projects, tools built once per mount, `attachedRunId`
   resolution at call time); any leftover shim; any prompt byte drift. The
   parity harness recipe: build `buildSystemPromptForContext` from
   `lib` at `c2d9bfbd` and from `client/src/components/project_ai/build_system_prompt.ts`
   at HEAD on the same fixture, strip the date, compare. Reproduce it — do
   not take the claim.
4. **Structure & duplication adversary** (whole diff). Is `lib/ai_tools` now
   exactly the shared set? Is anything duplicated between lib and client, or
   between the two route mounts? Are `getSharedTools*` / `getClientTools*`
   names, file homes, and comments honest? Does anything violate
   `panther/protocols/PROTOCOL_ALL_*` / `PROTOCOL_UI_STRUCTURE` / the app
   protocols (`PROTOCOL_APP_ROUTES.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`)? Any
   invented pattern, default argument, legacy breadcrumb, or comment that
   restates a contract owned elsewhere?
5. **Docs adversary** (`SYSTEM_13`, `SYSTEM_08`, `SYSTEM_09`, `SYSTEM_01`,
   `USER_GUIDE_MCP.md`, `PROTOCOL_APP_DEVELOPMENT.md`, and every other `*.md`
   that mentions MCP, `projectId` in an MCP context, `create_report`,
   `get_projects`, or the moved files). Find every sentence the code now
   contradicts, every claim the code does not support, and every place two
   docs restate the same contract (one authoritative statement, pointers
   elsewhere).
6. **panther adversary** (`panther/_112_ai_tool_core/scope_ai_tool.ts`,
   `mcp_server.ts`, `mcp_http_handler.ts`). Try to break `bindAITool`:
   approval tools, `runWithView`, error propagation from `resolve()`,
   the per-core tool-set cache vs a moving pin, argsKey staging with no scope
   param, `assertHeadlessTemplate` parity with the pre-refactor checks
   (`git show 08a9bcb1^:panther/_112_ai_tool_core/scope_ai_tool.ts`).

## Verification the orchestrator runs itself

- `deno task typecheck` at HEAD (server + client + `lint:systems`).
- `./validate_queries`.
- The `/mcp` probe sequence from agent 1 (list, schemas, orientation,
  `get_available_modules`, `get_module_settings`, `get_module_r_script`,
  `get_module_log`, `get_metric_data`).
- For every finding an agent reports: reproduce it before it goes in the
  report. Findings that do not reproduce are listed separately as
  "unconfirmed", not dropped.

## Report shape

Confirmed findings first (severity, `file:line`, scenario, evidence), then
unconfirmed, then per-agent "checked and held" summaries, then a one-paragraph
verdict on each of the six claims. Nothing gets fixed as part of this review.
