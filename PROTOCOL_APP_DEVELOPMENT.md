# PROTOCOL — App: Development & Verification Loop

> **App-specific working protocol.** How to get from "I changed some code" to
> "I have watched this behave correctly," with the **MCP surface as a
> first-class system under test** rather than an incidental instrument.
>
> This is about **verification mechanics**. What to build lives in the
> `SYSTEM_NN_*.md` files; how to author a route / worker / migration / AI tool
> lives in the sibling `PROTOCOL_APP_*.md` recipes. The one rule this file
> inherits from `CLAUDE.md` and never restates elsewhere: **verify by
> executing, not by reading.**

---

## The end-to-end test

The thing we actually want to be true is a **chain**, and it is only proven by
traversing all of it:

1. A **real Claude client** — claude.ai, Claude Desktop, or Claude Code
2. **Discovery** — an unauthenticated call returns `401` with
   `WWW-Authenticate: Bearer resource_metadata="…"`, which resolves to
   `/.well-known/oauth-protected-resource/mcp`, which names the Clerk
   authorization server, whose document must expose a `registration_endpoint`
   (dynamic client registration) or the client cannot register itself
3. **Clerk sign-in + consent**, matched to a FASTR user on **primary email**
4. A **deployed instance** over TLS, serving the built client and real config
5. **Per-call credential verification** — every tool call, not once at connect
6. **Pin resolution and the `can_view_data` door check** for that identity
7. A **tool returning real results-package data**

Each rung below is defined by **which links it skips**. A rung is not "less
thorough"; it is blind to specific links, and you have to know which.

| Rung | Instrument | Skips |
| --- | --- | --- |
| 0 | Direct execution + validators | 1–7 — no server at all |
| 1a | JSON-RPC probe → localhost | 1, 2, 3 (and 5 under `BYPASS_AUTH`) |
| 1b | Local dev + a real client over OAuth | 4 — and uses the **dev** Clerk instance, not prod's |
| 2a | JSON-RPC probe → testing-tim + PAT | 1, 2, 3 — PATs never touch OAuth |
| 2b | Real client → testing-tim over OAuth | **nothing — this is the end-to-end test** |
| 3 | `ssh` + `psql`, **read-only** | all of it — a diagnostic, never a verification |

Rung 2b has historically been the missing one. Reaching it is the point of this
loop.

---

## The session boundary — design the loop around it

**`claude mcp add` does not make tools callable in the session that is already
running.** It writes connector config; the client binds MCP servers at session
start. An agent that adds a connector mid-task and then tries to use it gets
nothing, and no amount of retrying fixes it.

Consequences, which are structural rather than annoyances:

- **Connector setup is a between-sessions step**, done once by a human.
- **In-session, the agent's instrument is the raw JSON-RPC probe** (below). It
  needs no connector, works against any origin, and returns the wire response
  rather than a model's paraphrase of it — which is what you want when the
  thing under test *is* the tool.
- **Sequence the work accordingly**: change + deploy in one session, exercise
  the connector in the next. Do not plan a single session that both ships an
  MCP change and dogfoods it through a connector.

---

## Rung 0 — execute it directly

A ten-line harness settles most questions decisively and costs nothing:

```bash
deno run --allow-all -c deno.json /tmp/check.ts   # absolute-path imports into lib/ or server/
```

Plus the standing validators, each a real gate:

```bash
deno task typecheck        # server + client + lint:systems
./validate_protocols       # client/src SolidJS + state rules
./validate_migrations      # migration + data-transform boundaries
./validate_queries         # the viz query rig (PROTOCOL_APP_QUERY_RIG.md)
```

If a change is expressible as "does this function return X for input Y," it
needs no server, no deploy and no database session.

---

## Rung 1 — local dev

```bash
./pg_run        # local Postgres, container `pg`, host port 7001
./valkey_run    # Valkey on 7379 — `VALKEY_URL` is set in .env, so boot expects it
deno task dev   # server on :8000, /mcp mounted exactly as in production
cd client && npm run dev   # SPA on :3000, hot-reloads
```

Boot is a few seconds (one migration pass on `main`), plus
~2s for the dev-only self-checks: the route validation, the headless mount
check, and the whole server test suite (`deno task test`, run as a
subprocess) — a failing test fail-stops the boot, so a red test is never
something you find later. `deno task test` alone runs the same suite.

### 1a — the JSON-RPC probe: `./mcp_probe`

```bash
./mcp_probe <origin> --info                 # initialize result: serverInfo (deployed version), capabilities, instructions
./mcp_probe <origin> --list                 # tool names + summaries
./mcp_probe <origin> --schema <tool>        # that tool's full input schema
./mcp_probe <origin> <tool> [json-args]     # call it
./mcp_probe <origin> --discovery            # OAuth discovery + the 401 challenge

# origin: `local`, `testing-tim`, or any http(s) origin
# auth:   set FASTR_PAT to send `Authorization: Bearer $FASTR_PAT`
```

```bash
./mcp_probe local get_overview
./mcp_probe local get_metric_data '{"metricId":"m10-02-01"}'
FASTR_PAT=fastr_pat_… ./mcp_probe testing-tim --list
```

It handles the streamable-HTTP handshake (initialize → session id →
`notifications/initialized` → call), prints the tool's text content, and exits
non-zero on a JSON-RPC error, a tool-level `isError`, or a bad credential —
with the 401-vs-503 distinction spelled out, since those mean different things.

**This is the agent's default MCP instrument**: no connector, so no session
restart. It proves links 4–7 and says nothing about 1–3.

**Reach for `--schema` before guessing an argument name.** Read projections,
write schemas and stored shapes diverge in this codebase, and the schema is the
only authority on what a tool actually accepts.

### The three local auth modes — pick deliberately

| Mode | Boot | Identity | What it skips |
| --- | --- | --- | --- |
| `BYPASS_AUTH` (the `.env` default) | `deno task dev` | seeded admin `dev@offline.local` | link 5 entirely — **and because that identity is an instance admin, permission gating is never exercised** |
| PAT | `BYPASS_AUTH= deno task dev` | whoever you minted for | links 1–3 |
| OAuth | `BYPASS_AUTH= deno task dev` + `claude mcp login` | the Clerk account you sign in as | link 4 only |

```bash
deno task mint-pat you@example.com claude   # PAT, for the probe or a header connector
```

**Local OAuth is a real rehearsal, against a different Clerk instance.** Local
dev advertises the dev Clerk instance; a deployed instance advertises
`clerk.fastr-analytics.org`. Both currently expose `registration_endpoint`, so
the flow is genuinely exercisable locally — but a fault in the **production**
Clerk configuration cannot reproduce there. Config-level OAuth failures are
rung-2b findings by construction.

### Two local frictions to plan around

- **The server has no `--watch`.** Every server or `lib/` change needs a manual
  restart; only the client hot-reloads. Batch server edits before restarting.
- **A restart invalidates every MCP session**, returning
  `HTTP 404 {"code":-32001,"message":"Session not found"}` on the old session
  id. Re-run `initialize` in the probe, or reconnect the connector. A tool
  failure immediately after a restart is almost always this, not your change.

---

## Rung 2 — `./deploy_testing`

```bash
./deploy_testing [--validate-migrations] [--validate-queries]
```

- Deploys the **working tree** — uncommitted changes included. No git
  operations, no `VERSION` bump. That is what makes it an iteration tool rather
  than a release.
- Gates on `deno task typecheck` and `./validate_protocols` **before** the
  expensive build; the migration and query rigs are opt-in flags.
- Pushes to the **fixed** tag `timroberton/comb:wb-fastr-server-vtesting-tim`,
  preserving the superseded manifest registry-side as `…-vtesting-tim-prev` and
  printing the rollback command on both success and failure.
- Verifies by polling `/health_check` for `"running":true` **and** matching the
  running container's `RepoDigest` against the pushed manifest digest — so
  "deploy succeeded" means the new bytes are actually serving. On failure it
  dumps the last 100 container log lines.

Target: `testing-tim` (app port 9151, Postgres 19151),
`https://testing-tim.fastr-analytics.org`.

### What only rung 2 can reach

- **Production auth** — real PAT and Clerk-OAuth verification, the deliberate
  401-vs-503 split, the deny-by-default route allowlist.
- **Rung 2b, the end-to-end MCP test** — the only place links 1–7 are all real.
- **The built client** (`client_dist/`), not the Vite dev server.
- **Docker/R module execution** and the results-package pipeline.
- **Cross-client SSE and multi-user collaboration.**

### A deploy target proves only as much as the data on it

`get_overview` reporting "no results package is pinned" on an unseeded
instance is the correct answer, not a bug — it means the only claim that target
supports is "the new bytes boot and serve." Before treating an instance as a
verification rung, confirm it carries a PINNED package with known data, and a
user (with instance `can_view_data`) whose primary email matches the credential
you connect with.

**Verify with disposable fixtures**: create what you need, use it, delete it.
Never arrange a fixture by editing an existing named row, and never by writing
to the database directly.

---

## Testing the MCP surface itself

The footprint is expanding, so treat these as the standing checks for any MCP
change.

**Discovery needs no client and no credential:**

```bash
./mcp_probe testing-tim --discovery
```

It reads the protected-resource document, the Clerk authorization-server
document (warning loudly if `registration_endpoint` is absent — without it
Claude cannot register itself and "Connect" spins and fails), and the
unauthenticated `401` challenge. On local dev with `BYPASS_AUTH` that last check
returns 200 and says so; anywhere else a non-401 is a real finding.

**The exposed surface is the AI assistant's *shared* tools over the pinned
package**: 6 reads, no writes (S13 principle 2). Module internals (script,
logs, settings), product content and the browser-only editor tools —
decks, reports, live editing, navigation, ask-the-user — are
SPA-only by design and must stay out.

So MCP exercises: the route registry and `APIResponse` envelope, server actions,
the run-keyed metric reads (items, value info), the query/formatting layer,
`get_overview` and prompt assembly, the pin resolution, and the instance
`can_view_data` gate. It does **not**
exercise ingestion, module execution, figure or slide authoring, exports, client
rendering, or SSE — drive those with Playwright
against testing-tim.

**Writes.** `approvalMode: "delegate"` means the gate is the client's own
tool-permission prompt, not a second in-protocol elicitation — so a user who has
"always allow"-ed the tool sees no prompt, which is the same posture as every
other MCP write tool. `approvalPolicy` is a **construction-time** guard: a
`kind: "write"` tool with no approval block fails to build. Rely on that rather
than on remembering.

**When adding a tool**, check all four: it appears in `--list`, its `--schema`
matches what you meant to accept, it is reachable via a real call, and its
permission gate actually denies. The first three are probe one-liners; the
fourth needs a non-admin identity, which means `BYPASS_AUTH= deno task dev`
with a PAT, or rung 2.

**Shared-tool content stays surface-neutral** (S13 principle 2). Three greps,
each expected to print nothing:

```bash
grep -rn "from_metric" lib/ai_tools/ | grep -v content_validators.ts:   # authoring guidance is SPA-prompt/schema only
grep -rn -E "getModuleScript|getModuleLogs|getModuleSettings" lib/ai_tools/ server/mcp/   # module tools are client-only
grep -rn "getRunModule" server/middleware/headless_allowlist.ts          # the allowlist admits only what /mcp calls
```

---

## Rung 3 — read-only DB access

Connection recipes and credentials live in
[PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) — one database per instance,
`main`.
That document is written for production instances; the same commands work
against any `testing*` instance by swapping the container name.

**Read-only, always** — `SELECT` and `information_schema` only, on testing
instances as much as on production. A `psql` session finds out what is stored;
it is never how you arrange a fixture, because a hand-mutated row makes every
later result unfalsifiable.

**Batch remote queries into a single `ssh` invocation.** A loop that opens one
connection per table will trip the host's connection limits and start returning
`Connection refused`, which reads exactly like an outage.

Locally the equivalent is free and needs no SSH — prefer it:

```bash
docker exec pg psql -U postgres -d main -c 'SELECT id, type, label, run_id FROM products;'
./pg_connect   # interactive psql on the local main DB
```

---

## Choosing a rung

| Question | Rung |
| --- | --- |
| Does this function / SQL / gate return the right thing? | 0 |
| Does this route, tool, or query behave end to end? | 1a |
| Does the client render / behave correctly? | 1 (`:3000`) |
| Does a permission gate actually deny? | 1 auth-on, or 2 |
| Does the OAuth flow work at all? | 1b |
| **Does the whole MCP chain work for a real user?** | **2b** |
| Does auth, caching, the built bundle, or R execution work? | 2 |
| What is actually stored on a deployed instance? | 3 |

A change touching persistence needs **all three** persistence layers enumerated
before it is done — DB JSON (migration), Valkey (cache prefix), and stored
`FigureInputs` (slide_config sweep). See `PROTOCOL_APP_MIGRATIONS.md`.

---

## Standing rules

- **Never mutate data to make a test pass.** Disposable fixtures created and
  deleted; never a write to an existing named row; never a write on rung 3.
- **`./deploy_testing` ships the working tree.** Check `git status` first —
  parallel workstreams in this repo are normal, and you will deploy theirs too.
- **Report which links you traversed.** "The probe returned the tool result" and
  "a real client reached it over OAuth" are different claims; so are
  "typechecks", "deployed and health-verified", and "verified working".
- **A green deploy is not a green feature.** The digest check proves the new
  bytes are serving, nothing more.
