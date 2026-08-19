# FASTR MCP — user guide (connect Claude to FASTR)

Connect any Claude client (Claude Code CLI, Claude Desktop, claude.ai
web/mobile) to a FASTR instance so you can ask questions about the instance's
national results package — its metrics and their data, its analysis modules'
scripts, logs and settings — from a Claude chat, with the same permissions you
have in the browser.

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

No repo checkout, no local process, nothing to configure per country. **One
connection reads the instance's pinned results package** — the package an
instance admin has blessed as the national one — at national scope. There is
nothing to pick per question.

---

## What you get

The `/mcp` endpoint is for **seeing results**: it exposes the FASTR AI
Assistant's **shared** metric tools — the same tool definitions the in-app chat
uses to query data — over the pinned package: **6 read-only tools, no writes**.
Module internals (R scripts, logs, settings), the content of your decks and
reports, and the browser-only editor tools are **not** exposed —
they are the in-app assistant's, or need a live browser
tab.

| Area      | Tools                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Overview  | `get_overview` (call this first)                                       |
| Metrics   | `get_available_metrics`, `get_metric_data` (CSV output)                |
| Reference | `get_methodology_docs_list`, `get_methodology_doc_content`, `get_info` |

No tool takes a package id: every call reads whatever package is
pinned **right now** (an admin re-pinning moves the connector on the next
call). Reading a package needs the instance permission **can_view_data**;
global admins always have it.

If **nothing is pinned**, `get_overview` still answers and says so; the
package tools return the same message until an admin with `can_configure_data`
pins a package under Results packages.

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

---

## Step 3 — Use it

Start a Claude session with the FASTR connector enabled. A good first move is to
let the assistant orient itself:

- **"Use the FASTR tools. Call get_overview and tell me which results
  package is pinned and what metrics it holds."**

`get_overview` carries the live grounding — the pinned package's name, its
datasets and indicators, its analysis modules — and how to query metric data.
Then ask naturally:

- **Explore data** — "What's the trend in <metric> over the last two years?
  Break it down by region." The assistant calls `get_available_metrics` to find
  ids, then `get_metric_data` (returns CSV) and reasons over it.
- **Reference docs** — "Load the ICEH methodology and explain the equity
  measures." (`get_info` / methodology tools.)

### Good habits

- The assistant discovers ids with `get_available_metrics`; it should never
  invent an id. If it does, correct it and point it at the discovery tool.
- Every tool is read-only — nothing you ask can change anything in FASTR.
- The data is the pinned package at **national** scope: there is no area scope
  here. To work on a deck or a report — or on figures under a state or district
  scope — use the in-app assistant.

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
- **You log in and consent, but the tools then say your account lacks
  `can_view_data`.** Either the OAuth login matched a Clerk account whose
  **primary email** is not a FASTR user (or a different address from the one
  your FASTR account uses — check which email you signed in with), or your
  FASTR user really lacks the instance permission. Ask an instance admin.
- **"No results package is pinned on this instance".** Nothing is wrong with
  your connection — no package is pinned yet. An admin with
  `can_configure_data` pins one under Results packages; the tools work from the
  next call.
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
  read-only package routes the assistant needs — it can never mint or revoke
  tokens, reach admin/user routes, or write anything), and the instance
  `can_view_data` gate on every read.
- The surface is **read-only by construction**: it exposes no write tool at
  all, so a leaked credential can read exactly what your own instance
  permissions already show you in the app, and change nothing.
- PATs **do not expire** — revoke them when you're done (step 1, "Revoking").
