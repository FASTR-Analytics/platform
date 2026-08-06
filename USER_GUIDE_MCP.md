# FASTR MCP — user guide (connect Claude to FASTR)

Connect any Claude client (Claude Code CLI, Claude Desktop, claude.ai
web/mobile) to a FASTR instance so you can ask questions about your projects'
data, read metrics / visualizations / slide decks / reports, and draft new
reports — from a Claude chat, driving the app the same way you would in the
browser.

Setup is **two values and nothing else**:

- the instance **URL** — `https://<your-instance>/mcp`
- a **Personal Access Token** — sent as the header
  `Authorization: Bearer fastr_pat_…`

No repo checkout, no local process, no per-project configuration. **One
connection serves every project you can access**; you pick the project per
question, and the assistant acts as **you** (your user, your permissions).

---

## What you get

The `/mcp` endpoint exposes the FASTR AI Assistant's **shared** tools — the same
tool definitions the in-app chat uses: **17 read tools + one write**
(`create_report`, which always asks you to confirm before it commits). The
browser-only editor tools (live slide/report/viz editing, navigation, "ask me a
question") are **not** exposed — they need a live browser tab and are SPA-only
by design.

| Area           | Tools                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| Orientation    | `get_projects`, `get_orientation` (call these first)                                    |
| Metrics        | `get_available_metrics`, `get_metric_data` (CSV output)                                 |
| Modules        | `get_available_modules`, `get_module_r_script`, `get_module_log`, `get_module_settings` |
| Visualizations | `get_available_visualizations`, `get_visualization_data`                                |
| Slide decks    | `get_available_slide_decks`, `get_slide`                                                |
| Reports        | `get_available_reports`, `get_report`, **`create_report`** (write, confirms)            |
| Reference      | `get_methodology_docs_list`, `get_methodology_doc_content`, `get_info`                  |

Every project tool takes an explicit **`projectId`** — discover the ids with
`get_projects`. The two reference/methodology areas and `get_info` are
instance-wide and take no project.

---

## Step 1 — Mint a Personal Access Token

The endpoint authenticates with a per-user PAT (a `fastr_pat_…` string) that
resolves to **your** user identity server-side, so everything the assistant does
is scoped to your permissions.

### Option A (works everywhere): the token panel

Log in to the instance in your browser and go to **`/access-tokens`** (e.g.
`https://your-instance.org/access-tokens`). The page is unlisted — no menu links
to it — but it is behind the normal login and only ever shows YOUR tokens. Enter
a label, click **Create token**, and copy the `fastr_pat_…` value: it is shown
only once (only its SHA-256 hash is stored). If you lose it, revoke it and mint
a new one. The panel also shows each token's last-used time and has a **Revoke**
button.

### Option B (local dev, no browser): the mint task

From a checkout of this repo, with your app `.env` present (it carries the DB
credentials):

```bash
deno task mint-pat you@example.com claude
```

Use YOUR account email (the one you log into FASTR with) and any label you like.

> The email must already exist as a FASTR user. If you normally log in with
> Clerk, use that same email — the PAT then carries your exact permissions.

### Revoking

A PAT does **not expire** — it is valid until revoked. Revoke it from the
`/access-tokens` panel (or delete its row in `personal_access_tokens`).
Revocation is instant: the next call fails, including a report creation you have
already been asked to confirm but not yet accepted.

---

## Step 2 — Connect your Claude client

The connector URL is your instance origin plus `/mcp`:

| Instance                    | Connector URL                   |
| --------------------------- | ------------------------------- |
| Local dev (`deno task dev`) | `http://localhost:8000/mcp`     |
| Deployed                    | `https://your-instance.org/mcp` |

### Claude Code CLI

```bash
claude mcp add --transport http fastr https://your-instance.org/mcp \
  --header "Authorization: Bearer fastr_pat_XXXXXXXX"
```

Then in a `claude` session, `/mcp` shows the `fastr` server and its tools.
(Remove it later with `claude mcp remove fastr`.)

### Claude Desktop / claude.ai (web, mobile)

Add a **custom connector** in your Claude settings:

- **URL**: `https://your-instance.org/mcp`
- **Request headers**: `Authorization` = `Bearer fastr_pat_XXXXXXXX`

Custom connectors with request headers are a beta feature; if your account does
not offer the headers field, use the Claude Code CLI form above.

> **Confirmation flow support varies by client.** Reads work everywhere.
> `create_report` needs the client to support elicitation (the confirm dialog);
> Claude Code does. On a client that does not, the tool **fails closed** with a
> clear message and writes nothing — it never commits silently.

---

## Step 3 — Use it

Start a Claude session with the FASTR connector enabled. A good first move is to
let the assistant orient itself:

- **"Use the FASTR tools. Call get_projects, then get_orientation for the
  <name> project, and tell me what metrics, visualizations, slide decks, and
  reports exist."**

`get_projects` lists the projects you can access (id, label, your role, and
whether the project is locked). `get_orientation` with a `projectId` carries the
live project context — what exists right now and how to query metric data. Then
ask naturally:

- **Explore data** — "What's the trend in <metric> over the last two years?
  Break it down by region." The assistant calls `get_available_metrics` to find
  ids, then `get_metric_data` (returns CSV) and reasons over it.
- **Inspect existing content** — "Show me the data behind visualization <id>."
  "Read report <id> and summarize its main points." "What does slide <id>
  contain?"
- **Reference docs** — "Load the ICEH methodology and explain the equity
  measures." (`get_info` / methodology tools.)
- **Debug a module** — "Why hasn't module <id> run? Show me its log."
- **Switch projects mid-conversation** — just say which project; the assistant
  passes a different `projectId`. No reconnection, no second server entry.

### Writing a report (the one write, with confirmation)

- **"Draft a short report titled 'Q2 immunization review' summarizing <metric>
  by region, then create it."**

Before anything is written, Claude shows you the **preview** — the report title
and the full markdown body that would be committed (quoted verbatim, so you
consent to the actual content, not a summary) — and asks you to confirm. Nothing
is committed until you accept; declining is a normal outcome, not an error.
Other tool calls (reads) keep working while the confirmation is pending. Once
created, open the report in FASTR's report editor to review, add figures, and
finalize (the assistant deliberately does not embed figures — those are added in
the editor).

### Good habits

- The assistant discovers ids with `get_projects` and the `get_available_*`
  tools; it should never invent an id. If it does, correct it and point it at
  the discovery tool.
- Reads are safe to call freely; only `create_report` mutates, and it always
  confirms.
- A **locked** project is read-only — writes are refused server-side even if you
  confirm.

---

## Troubleshooting

- **Every call fails with 401 / "unauthorized".** The token is missing, wrong,
  or revoked. Check the header is exactly `Authorization: Bearer fastr_pat_…`,
  and re-mint if needed (step 1).
- **503 / "authentication unavailable".** The instance could not reach its
  database to verify the token. It is a server-side problem, not your token —
  retry shortly.
- **"No access to project …".** The `projectId` is wrong, or you hold no role on
  that project. Call `get_projects` for the ids you can actually use.
- **403 on `get_module_r_script` / `get_module_log`.** These are gated on the
  project's `can_view_script_code` / `can_view_logs` permissions — you lack that
  bit on this project (the other tools keep working).
- **"This project is locked and cannot be edited".** The project is locked;
  reads still work.
- **Nothing is being written but you asked for a report.** That's the approval
  gate — Claude is waiting for you to confirm the preview. Accept it to commit.
  If your client cannot show a confirmation, the call fails closed instead (see
  step 2).
- **Local dev: everything 401s even with a fresh token.** A dev boot with
  `BYPASS_AUTH` set does not exercise real PAT auth. Boot with
  `BYPASS_AUTH= deno task dev` when testing tokens.

---

## Security notes

- The PAT is a real credential that acts as **you**. Treat it like a password —
  it lives in your Claude client's config in plaintext. Don't commit it or share
  the config.
- Every tool call runs the same server-side checks as the browser app: token
  verification, a **deny-by-default** route allowlist (a PAT can only reach the
  routes the assistant needs — it can never mint or revoke tokens, or reach
  admin/user routes), project-access resolution, and per-permission gates
  including locked-project write denial.
- Project access is checked **per call** with the `projectId` you pass — a
  connector cannot reach a project you have no role on.
- PATs **do not expire** — revoke them when you're done (step 1, "Revoking").
