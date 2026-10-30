# Testing script for permissions

A script for a fresh agent with the Playwright MCP tools and a shell, run
against a local dev instance. The operator runs it with one line, for example
"run TESTING_SCRIPT_FOR_AI_PERMISSIONS.md". The agent reads this file top to
bottom and executes it as written.

What this script covers: what each persona sees and can do in the browser. The
rail tabs, each page's controls, the Users tab, the product menu at each level,
the access dialog, the folder affordances and Explore for a restricted user. It
does not cover the server's answers to each route, which
`server/tests/permission_matrix_test.ts` asserts for every route and persona.
The browser side asks a different question: does the client offer exactly what
the server admits?

It runs only locally. The persona switch it uses is refused in production, the
same way `BYPASS_AUTH` is.

## 1. Rules for the agent running this

1. **A refusal on a click is a finding.** The client is meant to offer only what
   the caller's routes admit. Any click that answers with a 403, a toast saying
   access is refused or a "do not have permission" message is a FAIL on that
   step, whatever else passed. Record the control, the persona and the message.
2. **A missing control is a finding too.** When the expectations below say a
   persona has a control and the page does not show it, that is a FAIL.
3. **Ground truth is the page.** Use snapshots to read what renders. Take a
   screenshot for every FAIL and for the first visit to each page per persona.
4. **One results file.** Create `permissions_test_results_<date>.md` in your
   scratchpad directory at the start and append after every step: the persona,
   the page, the control, what was expected, what rendered, PASS or FAIL, and
   the screenshot path. The final report in the chat is a summary of that file
   plus its path.
5. **Do not fix anything.** This is a test run. Record, do not repair.
6. **Language.** The dev instance is English. Gate on the labels this script
   names.
7. **Stop conditions.** Stop and report if the server does not boot, a persona
   URL shows the sign-in form instead of the app, or a WRITE step leaves the
   instance in a state you cannot clean up.

## 2. Setup

### 2.1 Boot in persona mode

1. In the repo's `.env`, set `BYPASS_AUTH=` (empty) and `PERSONA_AUTH=1`. The
   server refuses to boot with both set.
2. In `client/.env.development.local`, set `VITE_PERSONA_AUTH=true` and remove
   or empty `VITE_BYPASS_AUTH`.
3. Note both files' previous values in the results file, to restore in section
   9.
4. Start the app with `./run` in the background and wait for
   `All N routes correctly implemented` and the Vite ready line.

### 2.2 Seed the persona rows

Run this against the dev database. Every persona is a plain `users` row, so the
app builds each one's identity exactly as it would for a real account.

```bash
docker exec -i pg psql -U postgres -d main <<'SQL'
INSERT INTO users (email, is_admin, can_view_data, can_configure_data,
  can_view_users, can_configure_users, all_scopes)
VALUES
  ('persona-none@example.com', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('persona-view-data@example.com', FALSE, TRUE, FALSE, FALSE, FALSE, TRUE),
  ('persona-configure-data@example.com', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('persona-view-users@example.com', FALSE, FALSE, FALSE, TRUE, FALSE, TRUE),
  ('persona-manager@example.com', FALSE, FALSE, FALSE, FALSE, TRUE, TRUE),
  ('persona-restricted@example.com', FALSE, TRUE, TRUE, TRUE, TRUE, FALSE),
  ('persona-restricted-other@example.com', FALSE, TRUE, TRUE, TRUE, TRUE, FALSE),
  ('persona-admin@example.com', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('persona-editor@example.com', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('persona-viewer@example.com', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('persona-stranger@example.com', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE)
ON CONFLICT (email) DO NOTHING;
SQL
```

The two restricted personas store every flag on purpose: a restricted user
holds no flag, whatever is stored, so its stored bits must change nothing it
sees.

Two more personas need no row:

- **Unapproved**: `persona-unapproved@example.com`, an email with no `users`
  row.
- **Operator**: the first email in `server/auth/h_users.ts` (untracked, local
  only). Use its existing row as it is. If the dev database has no row for it,
  skip the operator steps and record them as skipped.

### 2.3 Sign in as a persona

A persona is a URL: `http://localhost:3000/?persona=<email>`. The query is
remembered, so a reload keeps the persona. To switch, navigate to the URL with
the next email; the new query replaces the old persona. Profile → Sign out
clears it and shows the persona prompt.

Check the switch first: open the URL for `persona-admin@example.com` and confirm
the profile shows that email. Open `http://localhost:3000/` with no query in a
fresh context and confirm the page asks for `?persona=<email>`.

### 2.4 Fixtures (WRITE, as the admin persona)

1. **Two scopes.** Scopes tab → New scope. Label it `Persona test scope`, keep
   every family included, save. Make a second, `Persona other scope`, the same
   way.
2. **The restricted grants.** Users tab → tick `persona-restricted@example.com`
   → Edit scopes → turn off "All data", choose `Persona test scope`, save. Do
   the same for `persona-restricted-other@example.com` with
   `Persona other scope`.
3. **A folder.** Products → New → New folder, named `Persona test folder`.
4. **A deck.** Products → New → New deck. Rename it `Persona test deck`, set
   its scope to `Persona test scope` with the package and scope chip, and move
   it into `Persona test folder`.
5. **Its access.** On the deck, Manage access…: general access Restricted;
   `persona-editor@example.com` at edit; `persona-viewer@example.com`,
   `persona-restricted@example.com` and `persona-restricted-other@example.com`
   at view. Save. The last grant stays inert: that persona lacks the deck's
   scope.

Record the deck's id (from the URL when it is open) in the results file.

## 3. The rail, per persona

Open the persona URL, wait for the shell, and read the rail. Expected tabs:

| Persona                        | Products                     | Explore | Results | Scopes | Data | Assets | Users |
| ------------------------------ | ---------------------------- | ------- | ------- | ------ | ---- | ------ | ----- |
| none, editor, viewer, stranger | yes                          | yes     | no      | no     | no   | yes    | no    |
| view data                      | yes                          | yes     | yes     | no     | yes  | yes    | no    |
| configure data                 | yes                          | yes     | yes     | yes    | yes  | yes    | no    |
| view users                     | yes                          | yes     | no      | no     | no   | yes    | yes   |
| manager                        | yes                          | yes     | no      | no     | no   | yes    | yes   |
| restricted, restricted-other   | yes                          | yes     | no      | no     | no   | yes    | no    |
| admin                          | yes                          | yes     | yes     | yes    | yes  | yes    | yes   |
| operator                       | by its row's flags, as above |         |         |        |      |        |       |

The unapproved persona shows no rail, only "You are not yet approved. Wait for
an administrator to add you to the platform." Its profile shows no AI usage
section.

## 4. Each page's controls

Visit each tab the persona has. Expectations by flag; a persona holds a flag
when its row stores it, configure implies view, and an admin holds every flag.

- **Data** (`can_view_data`): every row the page lists opens. Only a
  `can_configure_data` holder sees the write controls: the Imports panels on the
  dataset, facilities, HFA weights and ICEH pages, Upload GeoJSON and its edit
  buttons, the HMIS indicators row click, sort and bulk actions, the HFA
  indicators code editor, bulk actions and taxonomy add buttons, editable time
  points, Retry failed pairs, Re-import this indicator, and the configuration
  rows (structure, admin area labels, AI context, DHIS2 connection). A view-data
  persona sees none of them.
- **Results** (`can_view_data`): the package list and each package page with
  its presets, settings, script, logs and output files. Only a
  `can_configure_data` holder sees Generate new results package, Module
  defaults, the bulk Delete, and Pin, Unpin and Delete on a package page.
- **Scopes** (`can_configure_data`): New scope and each row's editor.
- **Assets** (every approved persona): the Download button on a CSV, Excel or
  ZIP asset only for `can_view_data`; image and PDF downloads for everyone.
- **Explore** (every approved persona): the scope select lists the scopes the
  persona holds. For the restricted persona that is `Persona test scope` alone;
  for an unrestricted persona every scope. Pick a module and confirm a view
  renders for the restricted persona under its scope.

## 5. The Users tab

For each persona with the Users tab, open it and then one user's detail (pick
`persona-none@example.com`). Expected:

| Control                                    | view users    | manager | admin |
| ------------------------------------------ | ------------- | ------- | ----- |
| The table and Download                     | yes           | yes     | yes   |
| The Last active column                     | yes           | yes     | yes   |
| Add users, Batch import                    | no            | yes     | yes   |
| Bulk Edit permissions, Remove              | no            | yes     | yes   |
| Bulk Edit scopes                           | no            | yes     | yes   |
| Bulk Make admin, Make non-admin            | no            | no      | yes   |
| Detail: Instance permissions card and Save | no            | yes     | yes   |
| Detail: Make admin or Make non-admin       | no            | no      | yes   |
| Detail: Scopes card                        | no            | yes     | yes   |
| Detail: Contact person card                | no            | no      | yes   |
| Detail: Remove this user                   | no            | yes     | yes   |
| Detail: AI usage card (unlimited AI)       | operator only |         |       |
| Show system users, Hide system users       | operator only |         |       |

Then, as the manager, open `persona-admin@example.com`'s detail and the
manager's own, and tick each row in the table for Edit permissions and Remove.
Expected: neither action is offered for the admin's row or the manager's own
row, in bulk or on the detail page; a refusal is a FAIL by rule 1.

As the manager, toggle one flag on `persona-none@example.com`'s detail and Save.
Confirm the other flags kept their values (reopen the detail).

## 6. The deck at each level

Open Products as each persona and find `Persona test deck` in
`Persona test folder`.

- **Stranger**: the deck is absent; the folder shows only if the persona created
  it, so it is absent too.
- **Restricted-other** (a grant, but not the deck's scope): the deck and the
  folder are absent.
- **The row menu** (the list's menu button on the deck): a viewer is offered
  Duplicate only. An editor is offered Move into, Move to folder…, Settings,
  Results package and scope…, Manage access… and Duplicate. The owner (the
  admin) also has Delete.
- **The open deck**: every level has Present (when the deck has slides),
  History, and File → Download…, Share… and Copy to deck…. An editor also has
  File → Name and folder… and Manage access…, Add slide, the Deck menu, Update
  all figures and a clickable package and scope chip. A viewer's chip renders
  but opens nothing, and the deck is read-only: no Add slide, no Deck menu.
- **Restricted** (view, scope held): as the viewer.

In the access dialog as the editor: the general access select, the grants and
Add person work; the owner row offers no owner change. As the admin: Transfer
ownership… lists `persona-restricted@example.com`, who holds the deck's scope,
and every unrestricted user, and does not list
`persona-restricted-other@example.com`, who lacks it. Cancel without saving.

## 7. Folder affordances

- As any unrestricted approved persona: New → New folder is offered, a folder
  row has its menu button, and folders drag.
- As the restricted persona: no New folder entry, no folder menu button, and a
  folder does not drag.
- Only the admin's folder menu has "Set access for everything in this folder…".

## 8. The prompt library

Open the AI panel → the prompt library → save a prompt. The Visibility choice
"Country prompts (shared)" is offered only to a `can_configure_data` holder.
Cancel without saving.

## 9. Cleanup (WRITE)

1. As the admin: delete `Persona test deck`, then `Persona test folder`, then
   `Persona test scope` and `Persona other scope`.
2. Remove the persona rows:

   ```bash
   docker exec -i pg psql -U postgres -d main <<'SQL'
   DELETE FROM users WHERE email LIKE 'persona-%@example.com';
   SQL
   ```

3. Restore `.env` and `client/.env.development.local` to the values recorded in
   2.1, and stop `./run`.

## 10. Report

Summarise the results file in the chat: the count of PASS and FAIL per section,
then each FAIL in one line (persona, page, control, what happened), then the
file's path.
