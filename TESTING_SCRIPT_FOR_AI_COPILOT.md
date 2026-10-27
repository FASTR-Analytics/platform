# Testing script for the AI copilot

A script for a fresh agent with the Playwright MCP tools. The operator runs it
with one line, for example "run TESTING_SCRIPT_FOR_AI_COPILOT.md on
https://demo.fastr-analytics.org" or "... on https://nigeria.fastr-analytics.org
read-only". The agent reads this file top to bottom and executes it as written.

Two arguments:

- **The instance URL.** Required.
- **`read-only`.** Optional. Skips every section marked WRITE, so nothing is
  created or changed on the instance.

What this script covers: the chat beside the shell, its view tracking, its
reads, its deck, report, figure-editor and HFA tools, approvals, documents, the
prompt library, persistence and the usage governance. It does not cover the
`/mcp` endpoint.

## 1. Rules for the agent running this

1. **Three sources of truth, in this order.** For every step you have (a) the
   wire and the engine through `window.__copilot`, (b) the page itself through
   snapshots and screenshots, and (c) what the copilot says. A step passes on
   (a) and (b). (c) is recorded and compared with (a) and (b); a disagreement
   between what the copilot says and what actually happened is itself a finding,
   often the most important one.
2. **Every product write is confirmed by a screenshot of the product.** After
   the copilot creates or changes a slide, a report body, a figure, take a
   screenshot of the slide canvas or the report preview and describe in the
   results file what the screenshot shows. A write confirmed only by the
   copilot's reply or by a tool's success row is NOT confirmed.
3. **Ask the copilot what it saw after every action.** The standard follow-up
   is: "In at most five lines, in English: what did you just do, which tools did
   you call, and what do you see now?" Record its answer next to the ground
   truth.
4. **Never trust a tool's success text without the wire.** Read the tool_use and
   tool_result blocks through the hook (helper H3 below). A tool_result with
   `is_error: true` is a refusal or a failure even when the copilot's prose
   sounds fine.
5. **One results file.** Create `copilot_test_results_<instance>_<date>.md` in
   your scratchpad directory at the start and append to it after every step:
   step id, what you sent, the tools called with error flags, the ground truth,
   the copilot's account, the screenshot path, PASS or FAIL, and one line on the
   failure if any. The final report in the chat is a summary of that file plus
   its path.
6. **Stop conditions.** Stop the run and report if: the chat answers with a
   rate-limit box ("Daily AI usage limit reached" or the country limit), a
   request returns a status other than 200 three times in a row, or a WRITE step
   leaves the instance in a state you cannot clean up. Otherwise a failing step
   is recorded and the run continues.
7. **Language.** A French or Portuguese instance shows French or Portuguese
   labels and the copilot may answer in that language. Gate on view ids from the
   hook, not on label text. Where this script names a button, the French and
   Portuguese labels are given in brackets.
8. **Do not fix anything.** This is a test run. Record, do not repair.
9. **Budget.** The whole run is around 40 model turns. If the operator passed
   `read-only`, it is around 15.

## 2. Setup

### 2.1 Browser and sign-in

1. Call `browser_navigate` with the instance URL.
2. Take a snapshot. If the page shows the sign-in form (the text "Sign in to
   FASTR" or an email and password form), tell the operator: "Please sign in in
   the Playwright browser window, then say done." Then poll with
   `browser_wait_for` (time 20) and a snapshot until the shell is visible: the
   left rail with Products, Results packages, Explore and Data, or the AI panel.
   Wait up to fifteen minutes.
3. If the shell shows an "awaiting approval" page instead, stop: the signed-in
   user is not approved on this instance.

### 2.2 Turn the debug hook on

Run with `browser_evaluate`:

```js
(() => {
  localStorage.setItem("fastr:ai-debug", "1");
  return "set";
});
```

Then `browser_navigate` to the instance URL again (a reload). The hook is read
at page load. If the AI panel is closed, open it with the button on the window's
right edge (the opener). Confirm the hook is live:

```js
(() => typeof window.__copilot);
```

Expected: `"object"`. If `"undefined"`, the panel is closed, the user is not
approved, or another tab of this browser owns the chat (the panel then shows
"The AI chat is open in another tab" with a "Use it here" button: click it).

### 2.3 Helpers

Use these with `browser_evaluate`. Refer to them by id in the steps.

**H1, where am I:**

```js
(() => window.__copilot.view());
```

Returns `{ id, label, params }`. The id is one of: products, opening_product,
editing_slide_deck, editing_slide_figure, deck_settings, deck_history,
report_history, editing_report, editing_report_figure, results_file, explore,
results_packages, package, viewing_package_figure, module_defaults, scopes,
data, data_page, hfa_indicators, hfa_indicator_editor, hfa_indicator_import,
assets, users, user, shell.

**H2, is a turn running:**

```js
(() => window.__copilot.isLoading());
```

**H3, every tool call and result in the conversation:**

```js
(() => {
  const ms = window.__copilot.messages();
  return ms.flatMap((m, i) =>
    typeof m.content === "string"
      ? []
      : m.content.flatMap((b) =>
        b.type === "tool_use"
          ? [{ i, call: b.name, input: b.input }]
          : b.type === "tool_result"
          ? [{
            i,
            result: b.tool_use_id,
            err: b.is_error === true,
            text: String(b.content).slice(0, 400),
          }]
          : []
      )
  );
});
```

**H4, the last request as the model received it:**

```js
(() => {
  const r = window.__copilot.lastRequest();
  const u = r.body.messages.at(-1);
  const text = typeof u.content === "string"
    ? u.content
    : u.content.map((b) => b.text ?? `[${b.type}]`).join("");
  return {
    status: r.status,
    model: r.body.model,
    tools: r.body.tools.length,
    systemBlocks: r.body.system.length,
    lastUserText: text.slice(0, 2000),
  };
});
```

**H5, what the next message would carry:**

```js
(() =>
  window.__copilot.nextTurn().sections.map((s) =>
    s.kind + ": " + s.text.slice(0, 300)
  ));
```

**H6, the assistant's last reply text:**

```js
(() => {
  const m = window.__copilot.messages().at(-1);
  return typeof m.content === "string"
    ? m.content
    : m.content.map((b) => b.text ?? "").join("");
});
```

**H7, conversation id:**

```js
(() => window.__copilot.conversationId());
```

### 2.4 Sending a message and waiting

- The composer is the last `textarea` on the page. Use `browser_type` with the
  text and `submit: true`.
- Wait for the turn: poll H2 with `browser_wait_for` (time 10) between polls, up
  to ten minutes. A turn parked on a question card or an approval also reports
  loading, so after each poll take a snapshot and look for:
  - a question card (radio or checkbox options with a submit button): answer it
    as the step says;
  - an approval modal (title, before and after list, Accept [Accepter, Aceitar]
    or a Delete button): decide as the step says;
  - a staged report diff in the editor with Accept [Accepter, Aceitar] and
    Reject [Rejeter, Rejeitar] buttons: decide as the step says.
- After the turn, run H3 and H4 and record them.

### 2.5 New conversation

The AI panel's heading has a menu button (the one with the three dots, beside
the close chevron). Open it and click "New conversation" [Nouvelle conversation,
Nova conversa]. Confirm with H7 that the id changed. Start a new conversation
wherever a step says NEW CONVERSATION.

### 2.6 Baseline record

Record once at the start: H1, the model config
(`() => window.__copilot.config()`), the tool count
(`() => window.__copilot.tools().length`, expected 44), and the first 400
characters of `() => window.__copilot.nextTurn().system`. The system text must
begin with "# Instance Information" and must contain neither "CURRENT DATE" nor
"# Available Tools".

## 3. Tests

Each step has: **Do**, **Ground truth** (what you check with the hook, the page
and screenshots), **Ask the copilot** (the confirmation question), **Pass**.

### A. Baseline conversation

**A1. No-tool reply.** NEW CONVERSATION on the Products page.

- Do: send "Reply with the single word OK and call no tools."
- Ground truth: H4 status 200, tools 45 (44 app tools plus web search), the last
  user text starts with `<<<[[Current view: products` and includes "# Current
  View: Products". H3 shows no tool calls. H6 is "OK".
- Pass: all of the above.

**A2. The copilot's self-description.**

- Ask the copilot: "Without calling any tool: which page am I on, which tools
  can you use here, and what will refuse here? Five lines, English."
- Ground truth: H1 is products. The answer should name the Products page, name
  list_products and the reference tools as usable, and say package and product
  tools refuse here.
- Pass: no claim contradicts the ground truth. Record the wording.

**A3. Web search is present but not needed.**

- Do: send "What is today's date according to your context? Do not search the
  web."
- Ground truth: the date block (`**CURRENT DATE: YYYY-MM-DD**`) is in the
  conversation's first message text (H4 on the first request, or scroll the
  bubble, which shows the wire under the debug flag). The answer matches today.
- Pass: date correct, no web_search in H3.

### B. Products page

**B1. list_products.**

- Do: send "List the products on this instance with their folder and package."
- Ground truth: H3 shows one `list_products` call with `err: false`. Take a
  snapshot of the Products page and compare: every product the page lists is in
  the tool result text, with the same folder.
- Ask the copilot: "How many products did the tool return, and how many of them
  can I edit?"
- Pass: the count equals the page's count; the levels match the badges on the
  page.

**B2. A package tool refuses here.**

- Do: send "Call get_available_metrics now."
- Ground truth: H3 shows the call with `err: true` and a result text starting
  "This tool is only available in view(s)". Nothing else was called.
- Ask the copilot: "Why did that fail, and what would I have to do?"
- Pass: it explains the view restriction and asks the user to open a package
  view; it does not retry in the same turn more than once.

### C. Navigation and view tracking

**C1. Move to Explore mid-conversation.** Same conversation as B. Click Explore
[Explorer, Explorar] in the rail. Wait for the page to render a chart or a
table.

- Ground truth before sending: H1 is explore. H5 includes a `view-label` with
  explore, a `view-state` naming a family and a metric, a `digest` with "User
  navigated from" and a `consumer` section starting "# Results package in view"
  (the first time this package is seen in this conversation).
- Do: send "Where am I now, which results package and scope am I looking at, and
  what metric is on screen? Answer from your context only, no tools."
- Ground truth: H4's last user text contains all four section kinds above; the
  package label in the answer equals the label in the package block; the metric
  id in the answer equals the metric in the view-state line. Screenshot the
  Explore page.
- Pass: the answer matches the block and the screenshot.

**C2. Return does not resend the block.** Click Products in the rail, then
Explore again, then send "Which package is in view now? Context only."

- Ground truth: H4's last user text has the view-label and view-state but NO "#
  Results package in view" section (the text is already in the history). The
  answer still names the right package.
- Pass: as above. If the answer names no package or the wrong one, record it as
  a finding with the H4 text.

### D. Reads on a package view

Stay on Explore. NEW CONVERSATION.

**D1. Metrics list.**

- Do: send "What metrics are available in this package? Give me the first five
  by module."
- Ground truth: H3 shows `get_available_metrics` with `err: false`; the result
  text starts with "Source: results package" naming the package and scope. Open
  the AI panel menu, click "View AI tool output" [Voir la sortie des outils IA],
  and compare the first module heading and metric ids with the answer. Close the
  modal.
- Pass: ids in the answer exist in the modal's text.

**D2. Metric data against the screen.** Pick the metric Explore shows (from the
view-state line in H5).

- Do: send "Using get_metric_data, give me the national value of the metric on
  screen for the latest period available, and state the period coverage."
- Ground truth: H3 shows `get_metric_data` with `err: false`, the result
  starting with the Source line and containing "Period coverage". Screenshot the
  Explore chart or table. Compare the value and period the copilot states with
  what the screenshot shows for the national level, allowing for rounding and
  for percent shown as a fraction in the CSV.
- Ask the copilot: "Was that value read from the data or inferred? Which rows of
  the CSV did you use?"
- Pass: the value matches the screen within rounding, and the copilot says it
  read it from the tool result.

**D3. Bad input self-corrects.**

- Do: send "Call get_metric_data for that metric filtered on admin_area_2 =
  'NOT_A_REAL_AREA'."
- Ground truth: H3 shows a result with `err: true` whose text names the valid
  values, or says the dimension is unavailable. Any retry in the same turn must
  use a value from that list.
- Pass: the error text is present and no retry repeats the invalid value.

**D4. Reference documents.**

- Do: send "List the reference documents you can read, then read the data
  quality assessment chapter and summarise its purpose in three lines."
- Ground truth: H3 shows `get_reference_docs` then `get_reference_doc` with an
  id ending in `.md`, both `err: false`. If the hub could not be read the list
  result says so; record that and skip the rest of D4.
- Pass: the summary names data quality assessment and matches the document's
  opening.

**D5. Module internals.**

- Do: send "Which module produces the metric on screen, and what parameters is
  it configured with? Then show me the first ten lines of its R script."
- Ground truth: H3 shows `get_available_modules`, `get_module_settings` and
  `get_module_r_script`. If the signed-in user lacks `can_view_data`, the last
  two carry `err: true` with a message naming the permission: record which and
  treat that as the pass condition instead.
- Pass: as above.

### E. Slide deck (WRITE)

Skip the whole section under `read-only`.

**E1. Create the test deck.** Go to Products. If no folder named "Copilot tests"
exists, create it with "New folder" [Nouveau dossier, Nova pasta]. Open the
folder. Click "New" [Nouveau, Novo], choose slide deck, name it
`COPILOT TEST DECK <YYYYMMDD-HHMM>`, select the pinned or first ready results
package and the "All data" scope, click Create [Créer, Criar]. The deck editor
opens.

- Ground truth: H1 is editing_slide_deck; `params.deckId` is set. H5 shows
  `view-instructions` starting "# Current View: Editing slide deck" and
  `view-state` with "Open slide: none (the deck has no slides)" or the first
  slide.
- Pass: as above. Record the deck id.

NEW CONVERSATION.

**E2. Deck brief rides once.**

- Do: send "What deck am I editing and how many slides does it have? Use
  get_deck."
- Ground truth: H4's last user text contains "## Slide Types" and "## Workflow"
  (the brief). H3 shows `get_deck` with `err: false`.
- Do: send "Thanks. Say OK."
- Ground truth: H4's last user text contains the view-label and `deckId:` but
  NOT "## Slide Types" (sent once per text).
- Pass: both.

**E3. Create a cover and a content slide with a figure.**

- Do: send "Create a cover slide titled 'Copilot test' with subtitle 'automated
  run', then a content slide with a short three-bullet text block on the left
  and a figure of the metric you consider the main primary result on the right,
  using get_metric_data first. Then tell me what you created."
- Ground truth: H3 shows `get_metric_data`, then two `create_slide` calls, all
  `err: false`. The rail shows two slides. Open slide 2 by clicking it in the
  rail and screenshot the canvas: it must show a text block and a rendered chart
  or table, not an error tile. Screenshot slide 1 too.
- Ask the copilot: "Describe slide 2 exactly as it is now, using get_slide:
  blocks, their ids, and the figure's metric and preset."
- Ground truth: H3 shows `get_slide`; the block ids in the answer match the tool
  result; the metric id equals the one in the create_slide input.
- Pass: both slides render as described in the screenshots.

**E4. Edit text in place.** Keep slide 2 open.

- Do: send "On the slide that is open, replace the text block with two bullets
  that each cite one number from the figure's data, using update_slide."
- Ground truth: H3 shows `update_slide` with `err: false` and a result
  containing "It shows on the open slide at once". The canvas updates without a
  reload: screenshot it and confirm two bullets with numbers.
- Ask the copilot: "Did that edit save, and where did it land?"
- Pass: the screenshot shows the new text; the answer says it landed on the open
  slide and saved automatically.

**E5. Tweak the figure.**

- Do: send "Set the figure's caption to 'COPILOT CAPTION' and footnote to 'test
  footnote' with update_figure, nothing else."
- Ground truth: H3 shows `update_figure` with `err: false` and a result listing
  the per-field change report ("caption: ..."). Screenshot the slide: the
  caption reads COPILOT CAPTION.
- Pass: screenshot confirms.

**E6. User edit is reported back.** Click into the text block on the open slide
and type one extra word at the end (the editor's text field), then click away.

- Do: send "Say OK."
- Ground truth: H4's last user text contains a digest line "The content of slide
  <id> changed while it was open".
- Ask the copilot: "What changed since my last message, according to your
  context?"
- Pass: the digest line is present and the copilot names the slide change.

**E7. Structure writes.**

- Do: send "Duplicate slide 2, then move the duplicate to the start, then tell
  me the order with get_deck."
- Ground truth: H3 shows `duplicate_slides`, `move_slides`, `get_deck`, all
  `err: false`. The rail shows three slides with the duplicate first. Screenshot
  the rail.
- Pass: the order in the rail equals the order in the copilot's answer.

**E8. Delete asks first.**

- Do: send "Delete the first slide."
- Ground truth: a modal appears titled "Delete 1 slide(s)" with the slide's
  title and a Delete button. Snapshot it. Click Delete. H3 shows `delete_slides`
  with `err: false`. The rail shows two slides.
- Do: send "Delete slide 1 again." When the modal appears, click Cancel.
- Ground truth: H3's last result text is "User declined the proposed change"
  (not an error). The rail still shows two slides.
- Ask the copilot: "What happened to your last request?"
- Pass: it says the user declined and does not retry.

**E9. Draft preview and Add.**

- Do: send "Show me a draft content slide with a single table figure of the same
  metric, do not add it to the deck."
- Ground truth: H3 shows `show_draft_slide_to_user` with `err: false`; a preview
  card appears in the chat with a rendered slide and an "Add to this deck"
  button. Screenshot the card. Click "Add to this deck". The rail shows three
  slides; the button reads "Added to this deck".
- Do: send "Say OK."
- Ground truth: H4's last user text contains "User added the AI-drafted slide".
- Pass: all three.

**E10. Figure editor.** Open the figure on slide 2 in the figure editor (double
click the figure or use its edit control).

- Ground truth: H1 is editing_slide_figure; H5 shows instructions starting "#
  Current View: Figure editor (slide)".
- Do: send "Read the figure editor, then change the caption to 'EDITOR
  CAPTION'."
- Ground truth: H3 shows `get_figure_editor` and `update_figure_editor`, both
  `err: false`. The editor's preview shows the new caption before you click
  anything: screenshot. Click Apply. Back on the slide, screenshot: the caption
  is EDITOR CAPTION.
- Pass: both screenshots.

**E11. Covered views refuse.** Open the deck's Settings screen.

- Ground truth: H1 is deck_settings.
- Do: send "Update slide 2's header to 'X'."
- Ground truth: H3 shows `update_slide` with `err: true`, text "This tool is
  only available in view(s) "editing_slide_deck"". No slide changed.
- Ask the copilot: "What should I do so you can make that edit?"
- Pass: it tells the user to close Settings with its back button and names no
  other route. Close Settings.

### F. Report (WRITE)

Skip under `read-only`. Go to Products, open the "Copilot tests" folder, click
New, choose report, name it `COPILOT TEST REPORT <YYYYMMDD-HHMM>`, same package
and scope, Create. The report editor opens. NEW CONVERSATION.

**F1. Starting a report asks a brief.**

- Ground truth before sending: H5's `view-instructions` starts "# Current View:
  Editing Report" and contains "## Starting this report".
- Do: send "Write this report."
- Ground truth: the copilot asks at most three questions, in one message, either
  as prose or through an `ask_user_questions` card (H3). It makes no write.
- Answer: "A two-page brief for district managers, on the main primary metric
  only, latest two years. Go with your other suggestions." If a card is shown,
  pick the options closest to that and submit.
- Ground truth: the copilot calls `get_available_metrics` and `get_metric_data`
  (H3), then proposes an outline in chat and waits. No `rewrite_report` yet.
- Pass: the sequence is brief, reads, outline, wait.

**F2. Draft goes through the diff.**

- Do: send "Approved, write it."
- Ground truth: H3 shows `get_report_pages` with a `markdown` input, then
  `rewrite_report`. A staged diff appears in the editor with Accept and Reject
  buttons. Snapshot it, then click Accept. H3's `rewrite_report` result text
  starts "The user ACCEPTED the rewrite". The preview renders a cover block, at
  least one `:::` block (tiles, callout or band), and headings: screenshot the
  preview, full page.
- Do: send "Now add the outline's figures with insert_figure." Accept each diff.
- Ground truth: one `insert_figure` per figure, each `err: false`; the preview
  shows rendered figures, not placeholders: screenshot.
- Pass: both screenshots.

**F3. Reject leaves the body unchanged.** Note the first heading's text.

- Do: send "Rename the first heading to 'REJECTED HEADING' with replace_text."
- Ground truth: a diff appears. Click Reject. H3's result text is "User declined
  the proposed change". The preview's first heading is unchanged: screenshot.
- Ask the copilot: "Did that change apply?"
- Pass: screenshot unchanged; the copilot says it was declined.

**F4. Figure edit is direct.**

- Do: send "Set the caption of the first figure to 'REPORT FIGURE CAPTION' with
  update_report_figure."
- Ground truth: no diff. H3 shows `update_report_figure` with `err: false`.
  Screenshot the preview: the caption shows.
- Pass: screenshot confirms.

**F5. Leaving the view auto-declines a pending diff.**

- Do: send "Append a closing paragraph with rewrite_section on the last
  section." When the diff appears, do NOT decide: click the editor's back
  control to return to Products.
- Ground truth: H3's result text for `rewrite_section` starts "User navigated
  away from "editing_report"". Reopen the report: the body has no new paragraph.
  Screenshot.
- Pass: both.

### G. Permissions and levels

**G1. View-only product, if one exists.** From B1's output, find a product where
"your level" is view. If none, record "no view-only product" and skip.

- Open it. Ground truth: H5's instructions end with "The user can view this
  product but not change it".
- Do: send "Change the first slide's title to 'X'." (deck) or "Rewrite the first
  section." (report).
- Ground truth: H3 shows the write with `err: true`, text "Your account can view
  this product but not change it".
- Pass: no change on screen; the copilot reports the refusal.

### H. HFA indicators (WRITE, only when HFA data exists)

Skip under `read-only`. Skip if the Data page shows no HFA data. Go to Data,
open HFA indicators. NEW CONVERSATION.

**H1. Reads.**

- Ground truth: H1 is hfa_indicators; H5's instructions contain "## The HFA
  indicator model".
- Do: send "List the taxonomy and count the indicators per category."
- Ground truth: H3 shows `get_hfa_taxonomy` and `get_hfa_indicators`, both
  `err: false`, or both `err: true` naming the `can_configure_data` permission,
  which is then the pass condition. Compare the counts with the manager's table
  on screen.
- Pass: counts match.

**H2. Create, validate, delete, each through a modal.**

- Do: send "Create one binary/avg indicator named 'COPILOT TEST INDICATOR' with
  definition 'Facility reports the copilot test', in the first category, with
  rCode `1 == 1` for every round. Then validate it."
- Ground truth: a modal "Create HFA indicators" appears: snapshot, click the
  confirm button. H3 shows `create_hfa_indicators` with `err: false` and
  `validate_hfa_indicators`. The manager's table shows the new row: screenshot.
  If the refusal "Your account cannot change HFA indicators" appears instead,
  record it and skip to I.
- Do: send "Delete the indicator you just created."
- Ground truth: a danger modal "Delete HFA indicators"; click Delete. The row is
  gone: screenshot.
- Pass: both screenshots.

### I. Documents

**I1. Attach a PDF, if one exists.** Open the AI panel menu, "Include file"
[Inclure un fichier]. If the list shows no PDF, record and skip. Select one,
click "Include selected". A chip with the file name appears above the composer.

- Do: send "What is the title on the first page of the attached document? Quote
  it."
- Ground truth: H4's last user content includes a `[document]` block (the helper
  prints block types for non-text blocks). The answer quotes a title.
- Do: send "Say OK."
- Ground truth: this request's last user message carries no document block (a
  document is sent once).
- Pass: both.

### J. Prompt library

**J1.** Open the AI panel menu, "Prompt library" [Bibliothèque de prompts]. If
the browse pane shows "Failed to load prompt library", record and skip. Pick the
first prompt, click "Run as new chat".

- Ground truth: H7 changes; the first user bubble equals the prompt text; the
  turn completes with status 200.
- Pass: as above.

### K. Stop and recovery

**K1.** NEW CONVERSATION on Explore.

- Do: send "Call get_metric_data for the first ten metrics one after another and
  summarise each." After the first tool row appears, click Stop [Arrêter,
  Parar].
- Ground truth: H2 becomes false within a few seconds. H3's tail shows one or
  more results with text "Tool execution cancelled by user". The last message is
  not an assistant message with unanswered tool_use (H3 shows a result for every
  call).
- Do: send "Say OK."
- Ground truth: status 200, reply OK.
- Pass: the conversation is usable after Stop.

### L. Persistence and switching

**L1.** Reload the page. Open the AI panel.

- Ground truth: H7 equals the id from K1; the chat shows K1's messages. Open the
  menu, "Switch conversation", pick the deck conversation from E. H7 changes.
- Do: send "In one line: what did we do in this conversation?"
- Ground truth: the answer mentions the test deck.
- Pass: both.

### M. Usage governance

**M1.** Snapshot the bottom of the AI panel.

- Ground truth: if the instance sets a daily limit and the user is not
  unlimited, a ring with "% of daily AI limit used" is shown and the percentage
  rose during this run. Otherwise no ring. Record which.
- Pass: consistent with the instance's configuration as the operator knows it.

### N. Cleanup (WRITE)

1. Go to Products, "Copilot tests" folder. For each product whose name starts
   with `COPILOT TEST`, open its row menu and Delete. Confirm. Screenshot the
   empty folder.
2. Confirm no HFA indicator named `COPILOT TEST INDICATOR` remains.
3. Turn the debug flag off and reload:

```js
(() => {
  localStorage.removeItem("fastr:ai-debug");
  return "removed";
});
```

4. Confirm `() => typeof window.__copilot` is `"undefined"` after the reload.

## 4. Report

Finish the results file with a table: step id, PASS or FAIL, one line. Then
write the summary in the chat:

- Instance, date, signed-in user's level (from B1), `read-only` or full.
- Counts: steps run, passed, failed, skipped with reasons.
- Every FAIL with: the step, what was sent, the tool calls and error flags, the
  ground truth, what the copilot claimed, and the screenshot path.
- Every disagreement between the copilot's account and the ground truth, even
  where the step passed.
- The path of the results file and of every screenshot.
