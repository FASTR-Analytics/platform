# FASTR MCP — user guide (connect Claude to FASTR)

Connect any Claude client (Claude Code CLI, Claude Desktop, claude.ai
web/mobile) to a FASTR instance so you can ask questions about your projects'
data, read metrics / visualizations / slide decks / reports, and draft new
reports — from a Claude chat, driving the app the same way you would in the
browser.

There are **two ways to connect**, and both end up in exactly the same place —
the assistant acts as **you**, with your user and your permissions:

|                           | Sign in with FASTR (OAuth)                                | Personal Access Token                      |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| What you enter            | the **URL only** — `https://<your-instance>/mcp`          | the URL **plus** an `Authorization` header |
| How you authorize         | your normal FASTR login + a consent screen                | mint a token first                         |
| Works in                  | claude.ai web/mobile, Claude Desktop, **and Claude Code** | anything that can set a header             |
| Needs a browser to set up | yes, once                                                 | no                                         |
| Expires                   | yes — refreshes silently in the background                | never, until you revoke it                 |

**Prefer OAuth wherever you can**: there is no secret to copy, paste or leak,
and access ends when you revoke the connection. Every current Claude client
supports it, Claude Code included.

**Use a PAT when no browser is available** — `claude -p`, the Agent SDK, CI
jobs, or any scripted run. Those cannot complete an OAuth sign-in on their own
(there is no interactive prompt to approve it), so a header is the only option.
This is why PATs are not going away.

No repo checkout, no local process, no per-project configuration. **One
connection serves every project you can access**; you pick the project per
question.

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

## Step 1 — Choose how you authenticate

### Option 1 — Sign in with FASTR (OAuth) — URL only

Nothing to mint, nothing to paste. In **Claude Desktop** or **claude.ai**, add a
custom connector with **only** the URL:

- **URL**: `https://your-instance.org/mcp`
- Leave the OAuth client ID / secret and the request-headers fields **blank**.

Click **Connect**. Claude discovers that the endpoint is protected, sends you to
your instance's normal login, and shows a **consent screen** naming what it is
about to be granted. Approve it and the connector is live.

The connection is tied to the FASTR user you logged in as, matched on your
**primary email address** — the same account and the same permissions you have
in the browser. If you have no FASTR user for that email, the connector will
connect but see nothing, exactly as a first-time browser login would.

Access tokens are short-lived and refresh silently, so you should not have to
re-approve anything day to day.

> Requires the instance's Clerk instance to have **dynamic client registration**
> enabled. If Connect spins and fails, see Troubleshooting.

### Option 2 — Mint a Personal Access Token

Use this wherever no browser sign-in is possible — `claude -p`, the Agent SDK,
CI jobs — or if you simply prefer a static header. A PAT is a `fastr_pat_…`
string that resolves to **your** user identity server-side, so everything the
assistant does is scoped to your permissions.

#### Minting it: the token panel (works everywhere)

Log in to the instance in your browser and go to **`/access-tokens`** (e.g.
`https://your-instance.org/access-tokens`). The page is unlisted — no menu links
to it — but it is behind the normal login and only ever shows YOUR tokens. Enter
a label, click **Create token**, and copy the `fastr_pat_…` value: it is shown
only once (only its SHA-256 hash is stored). If you lose it, revoke it and mint
a new one. The panel also shows each token's last-used time and has a **Revoke**
button.

#### Minting it: the mint task (local dev)

From a checkout of this repo, with your app `.env` present (it carries the DB
credentials):

```bash
deno task mint-pat you@example.com claude
```

Use YOUR account email (the one you log into FASTR with) and any label you like.

> The email must already exist as a FASTR user. If you normally log in with
> Clerk, use that same email — the PAT then carries your exact permissions.

### Revoking

**A PAT** does **not expire** — it is valid until revoked. Revoke it from the
`/access-tokens` panel (or delete its row in `personal_access_tokens`).
Revocation is instant: the next call fails, including a report creation you have
already been asked to confirm but not yet accepted.

**An OAuth connection** is revoked on the Clerk side (your identity provider),
not in FASTR — removing the connector in Claude stops _that_ client using it,
and revoking the grant in Clerk ends it everywhere. Revocation is **not
instant**: expect access to stop within about 30 seconds rather than on the next
call, because verified tokens are briefly cached (see Security notes).

---

## Step 2 — Connect your Claude client

The connector URL is your instance origin plus `/mcp`:

| Instance                    | Connector URL                   |
| --------------------------- | ------------------------------- |
| Local dev (`deno task dev`) | `http://localhost:8000/mcp`     |
| Deployed                    | `https://your-instance.org/mcp` |

### Claude Code CLI

**With OAuth (recommended)** — add the server with no credential at all, then
sign in once:

```bash
claude mcp add --transport http fastr https://your-instance.org/mcp
claude mcp login fastr
```

`claude mcp login` opens your browser for the FASTR login and consent screen
(inside a session, `/mcp` → the `fastr` entry does the same). Claude Code stores
the token and refreshes it automatically; `/mcp` → **Clear authentication**
signs out. This works because the endpoint advertises its authorization server
in the `WWW-Authenticate` header, which Claude Code discovers on its own.

**With a PAT** — required for non-interactive use (`claude -p`, the Agent SDK,
CI), which cannot run a browser sign-in:

```bash
claude mcp add --transport http fastr https://your-instance.org/mcp \
  --header "Authorization: Bearer fastr_pat_XXXXXXXX"
```

Then in a `claude` session, `/mcp` shows the `fastr` server and its tools.
(Remove it later with `claude mcp remove fastr`.)

> Pick one mode per server entry: if an `Authorization` header is set and the
> server rejects it, Claude Code reports a failed connection rather than falling
> back to OAuth.

### Claude Desktop / claude.ai (web, mobile)

Add a **custom connector** in your Claude settings with **only the URL**
(`https://your-instance.org/mcp`), leave every other field blank, and click
**Connect** — that is the OAuth path from step 1, option 1.

If you would rather use a PAT here, fill in **Request headers** instead:
`Authorization` = `Bearer fastr_pat_XXXXXXXX`. Custom connectors with request
headers are a beta feature; if your account does not offer the headers field,
use OAuth or the Claude Code CLI form above.

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

- **Every call fails with 401 / "unauthorized".** The credential is missing,
  wrong, or revoked. On a PAT, check the header is exactly
  `Authorization: Bearer fastr_pat_…` and re-mint if needed (step 1). On OAuth,
  disconnect and reconnect the connector to re-run the login.
- **503 / "authentication unavailable".** The instance could not reach the
  service that verifies your credential — its database for a PAT, Clerk for an
  OAuth token. It is a server-side problem, **not** your credential: it is
  deliberately a 503 rather than a 401 so your client retries instead of
  throwing away a perfectly good login. Retry shortly.
- **"Connect" spins and then fails, before you ever see a login screen.** The
  OAuth discovery step failed. Check from a terminal that both of these return
  JSON without a login:

  ```bash
  curl -s https://your-instance.org/.well-known/oauth-protected-resource/mcp
  curl -s https://your-instance.org/.well-known/oauth-authorization-server
  ```

  If the second is empty or errors, the instance's Clerk instance most likely
  does not have **dynamic client registration** enabled (Clerk Dashboard →
  Configure → OAuth applications) — without it Claude cannot register itself and
  the flow cannot start.
- **You log in and consent, but every tool then says you have no projects.** The
  OAuth login matched a Clerk account whose **primary email** is not a FASTR
  user, or is a different address from the one your FASTR account uses. Check
  which email you signed in with.
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

- Both credential types act as **you**, and both are checked on **every single
  call** — not once at connection time.
- The PAT is a real credential that acts as **you**. Treat it like a password —
  it lives in your Claude client's config in plaintext. Don't commit it or share
  the config. OAuth avoids this: there is no long-lived secret on your machine.
- **Revocation is instant for a PAT, but not for OAuth.** A PAT is re-checked
  against the database on every call. A verified OAuth token is cached briefly
  (~30 seconds) so that a single request does not hammer the identity provider,
  so a revoked OAuth grant can keep working for up to that long. Plan for
  "within a minute", not "immediately".
- Every tool call runs the same server-side checks as the browser app: token
  verification, a **deny-by-default** route allowlist (a PAT can only reach the
  routes the assistant needs — it can never mint or revoke tokens, or reach
  admin/user routes), project-access resolution, and per-permission gates
  including locked-project write denial.
- Project access is checked **per call** with the `projectId` you pass — a
  connector cannot reach a project you have no role on.
- PATs **do not expire** — revoke them when you're done (step 1, "Revoking").
