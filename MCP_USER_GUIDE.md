# FASTR MCP — user guide (local Claude)

Connect your local Claude (Claude Code CLI or Claude Desktop) to a FASTR project
so you can ask questions about the project's data, read its metrics /
visualizations / slide decks / reports, and draft new reports — all from a Claude
chat, driving the app the same way you would in the browser.

This guide is written for **one developer running FASTR locally** (or against a
deployed instance you have an account on). One MCP connection = **one project**,
acting as **you** (your user, your permissions).

---

## What you get

The MCP server exposes the FASTR AI Assistant's **shared** tools — the same tool
definitions the in-app chat uses. On the MCP surface that is **15 read tools +
one write** (`create_report`, which always asks you to confirm before it
commits). The browser-only editor tools (live slide/report/viz editing,
navigation, "ask me a question") are **not** exposed — they need a live browser
tab and are SPA-only by design.

Available tools, by area:

| Area | Tools |
|---|---|
| Metrics | `get_available_metrics`, `get_metric_data` (CSV output) |
| Modules | `get_available_modules`, `get_module_r_script`, `get_module_log`, `get_module_settings` |
| Visualizations | `get_available_visualizations`, `get_visualization_data` |
| Slide decks | `get_available_slide_decks`, `get_slide` |
| Reports | `get_available_reports`, `get_report`, **`create_report`** (write, confirms) |
| Reference | `get_methodology_docs_list`, `get_methodology_doc_content`, `get_info` |
| Orientation | `get_orientation` (call this first — live project context) |

You act as yourself via a **Personal Access Token (PAT)**: same routes, same
permission checks, same user id on every row as if you were in a browser tab.

---

## Prerequisites

- **Deno** (2.6+) — `deno --version`.
- **The FASTR repo** checked out locally (this repo). The MCP host lives at
  `mcp_host/main.ts` and resolves `lib` / `@timroberton/panther` through this
  repo's `deno.json`, so `node_modules` must be installed (they are, if you run
  the app normally).
- **A running FASTR server** the host can reach (see step 1).
- **Claude** — either the Claude Code CLI (`claude`) or Claude Desktop.

---

## Step 1 — Have a FASTR server running

The host talks to a normal FASTR server over HTTP (it adds a `/pat` suffix to the
base URL itself — you give it the plain origin).

**Local dev server:**

```bash
deno task dev          # serves on http://localhost:8000 by default
```

Your **base URL** is then `http://localhost:8000`.

For a deployed instance, the base URL is that instance's origin (e.g.
`https://fastr.example.org`). You need a normal login on it to mint a token.

---

## Step 2 — Log in: mint a Personal Access Token

The MCP host authenticates with a per-user PAT (a `fastr_pat_…` string). The
token resolves to **your** user identity server-side, so everything the assistant
does is scoped to your permissions. There is **no UI for minting yet**, so mint
one of these two ways.

### Option A (recommended for local dev): the mint task

From the repo root, with your app `.env` present (it carries the DB
credentials):

```bash
deno task mint-pat you@example.com local-claude
```

Use YOUR account email (the one you log into FASTR with) and any label you
like. Copy the printed `fastr_pat_…` value. Only its SHA-256 hash is stored;
you cannot read it back later — if you lose it, mint a new one.

> The email must already exist as a FASTR user. If you normally log in with
> Clerk, use that same email — the PAT then carries your exact permissions.

### Option B: mint over the API (deployed instance, while logged in)

The mint route is `POST /user/personal-access-tokens` behind normal Clerk auth.
If you have a valid session, call it with your session credentials and a label
`{"label":"local-claude"}`; the response contains `{ token, pat }`. (Option A is
simpler locally because it avoids extracting a browser session cookie.)

### Revoking

A PAT does **not expire** — it is valid until revoked. To revoke, delete the row
(or call `DELETE /user/personal-access-tokens` with `{ "id": <n> }` while logged
in):

```bash
deno run -A --env-file - <<'EOF'
import { getPgConnectionFromCacheOrNew } from "./server/db/mod.ts";
import { closeAllConnections } from "./server/db/postgres/connection_manager.ts";
const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
await db`DELETE FROM personal_access_tokens WHERE user_email = 'you@example.com'`;
console.log("revoked all PATs for that user");
await closeAllConnections();
EOF
```

---

## Step 3 — Find your project ID

One connection serves one project. The project ID is the id in the app URL when
you have the project open in the browser (the long id segment in the path). If
you are unsure, open the project in FASTR and copy the id from the address bar,
or ask a FASTR admin.

You'll pass it as `FASTR_MCP_PROJECT_ID`.

---

## Step 4 — Register the MCP with Claude

The host needs three environment variables:

| Var | Value | Notes |
|---|---|---|
| `FASTR_MCP_BASE_URL` | `http://localhost:8000` | plain origin — the host appends `/pat` itself |
| `FASTR_MCP_TOKEN` | `fastr_pat_…` | the token from step 2 |
| `FASTR_MCP_PROJECT_ID` | your project id | from step 3 |

The launch command is **cwd-independent** by pinning this repo's config (Claude
spawns the process from its own directory, so pass `--config` with an absolute
path):

```
deno run -A --config /ABS/PATH/TO/wb-fastr/deno.json /ABS/PATH/TO/wb-fastr/mcp_host/main.ts
```

Replace `/ABS/PATH/TO/wb-fastr` with this repo's absolute path
(`/Users/timroberton/projects/apps/wb-fastr`).

### Claude Code CLI

```bash
claude mcp add fastr \
  --env FASTR_MCP_BASE_URL=http://localhost:8000 \
  --env FASTR_MCP_TOKEN=fastr_pat_XXXXXXXX \
  --env FASTR_MCP_PROJECT_ID=YOUR_PROJECT_ID \
  -- deno run -A \
       --config /Users/timroberton/projects/apps/wb-fastr/deno.json \
       /Users/timroberton/projects/apps/wb-fastr/mcp_host/main.ts
```

Then in a `claude` session, `/mcp` shows the `fastr` server and its tools once it
connects. (To remove it later: `claude mcp remove fastr`.)

### Claude Desktop

Edit the MCP config file (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`) and add a
server entry, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "fastr": {
      "command": "deno",
      "args": [
        "run", "-A",
        "--config", "/Users/timroberton/projects/apps/wb-fastr/deno.json",
        "/Users/timroberton/projects/apps/wb-fastr/mcp_host/main.ts"
      ],
      "env": {
        "FASTR_MCP_BASE_URL": "http://localhost:8000",
        "FASTR_MCP_TOKEN": "fastr_pat_XXXXXXXX",
        "FASTR_MCP_PROJECT_ID": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

> `deno` must be on the PATH Claude Desktop sees. If the server shows as failed,
> use the absolute path to the `deno` binary (`which deno`) as `"command"`.

---

## Step 5 — Use it

Start a Claude session with the FASTR server connected. A good first move is to
let the assistant orient itself:

- **"Use the FASTR tools. Call get_orientation, then tell me what metrics,
  visualizations, slide decks, and reports exist in this project."**

`get_orientation` carries the live project context (what exists right now, and
how to query metric data). Then ask naturally:

- **Explore data** — "What's the trend in <metric> over the last two years? Break
  it down by region." The assistant calls `get_available_metrics` to find ids,
  then `get_metric_data` (returns CSV) and reasons over it.
- **Inspect existing content** — "Show me the data behind visualization <id>."
  "Read report <id> and summarize its main points." "What does slide <id>
  contain?"
- **Reference docs** — "Load the ICEH methodology and explain the equity
  measures." (`get_info` / methodology tools.)
- **Debug a module** — "Why hasn't module <id> run? Show me its log."

### Writing a report (the one write, with confirmation)

- **"Draft a short report titled 'Q2 immunization review' summarizing <metric>
  by region, then create it."**

Before anything is written, Claude shows you the **preview** — the report title
and the full markdown body that would be committed (quoted verbatim, so you
consent to the actual content, not a summary) — and asks you to confirm.
Nothing is committed until you accept — declining is a normal outcome, not an
error. Other tool calls (reads) keep working while the confirmation dialog is
open. Once created, open the report in
FASTR's report editor to review, add figures, and finalize (the assistant
deliberately does not embed figures — those are added in the editor).

### Good habits

- The project is **fixed** for the connection — all ids are project-scoped.
- The assistant discovers ids with the `get_available_*` tools; it should never
  invent an id. If it does, correct it and point it at the discovery tool.
- Reads are safe to call freely; only `create_report` mutates, and it always
  confirms.

---

## Troubleshooting

- **Server shows "failed to connect" / exits immediately.** Almost always a
  missing env var — the host logs `missing required env var …` to stderr and
  exits. Check all three are set in the Claude config. Also confirm `deno` is on
  Claude's PATH (use an absolute `deno` path if not).
- **`lib` / import errors at startup.** You omitted `--config` (or the path is
  wrong), so Deno couldn't find this repo's `deno.json`. Use the absolute
  `--config /…/wb-fastr/deno.json` form; Claude does not spawn from the repo dir.
- **Every tool fails with a 401 / "not authenticated".** The token is wrong or
  revoked, or the base URL is wrong. Re-mint (step 2), and make sure
  `FASTR_MCP_BASE_URL` is the plain origin **without** `/pat` (the host adds it).
- **First tool call hangs, then errors about hydration.** The host hydrates the
  project's state over SSE before the first tool runs. Confirm the FASTR server
  is up and reachable at the base URL and that the project id is valid. A
  failed hydration is retried automatically on the next tool call, and a brief
  server restart mid-session reconnects on its own (capped backoff) — no need
  to restart the Claude session.
- **403 on `get_module_r_script` / `get_module_log`.** These are gated on the
  project's `can_view_script_code` / `can_view_logs` permissions — you lack
  that bit on this project (the other tools keep working).
- **Nothing is being written but you asked for a report.** That's the approval
  gate — Claude is waiting for you to confirm the preview. Accept it to commit.

---

## Security notes

- The PAT is a real credential that acts as **you**. Treat it like a password —
  it lives in the Claude config in plaintext. Don't commit it or share the config.
- The `/pat` surface is **deny-by-default**: a PAT can only reach the specific
  routes the assistant needs (project reads + report create/update + the SSE
  hydration streams). It cannot mint or revoke tokens, or reach admin/user
  routes.
- PATs **do not expire** — revoke them when you're done (step 2, "Revoking").
- One process = one project = one user. To work on a different project, register
  a second server (e.g. `fastr-projectB`) with a different
  `FASTR_MCP_PROJECT_ID`.
