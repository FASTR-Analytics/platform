# Testing script for the AI copilot

A script for a fresh agent with the Playwright MCP tools. The operator runs it
with one line, for example "run TESTING_SCRIPT_FOR_AI_COPILOT.md on
https://demo.fastr-analytics.org" or "... on https://nigeria.fastr-analytics.org
read-only". The agent reads this file top to bottom and executes it as written.
Run it with an Opus or Fable agent: the hard part is judging whether a
screenshot matches a claim and noticing when the copilot's account disagrees
with the wire, and a smaller model misses those.

Two arguments:

- **The instance URL.** Required.
- **`read-only`.** Optional. Skips every section marked WRITE, so nothing is
  created or changed on the instance.

What this script covers: the chat beside the shell, its view tracking, its
reads, its deck, report, figure-editor and HFA tools, approvals, documents, the
prompt library, settings, persistence, tab ownership and the usage governance.
It does not cover the `/mcp` endpoint.

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
5. **Check the cached prefix after every send.** Run H8 after every turn. The
   system text and the tools array must be identical to the previous request's,
   except in section E where the model is changed on purpose. A difference
   anywhere else is a FAIL on that step, whatever else passed.
6. **One results file.** Create `copilot_test_results_<instance>_<date>.md` in
   your scratchpad directory at the start and append to it after every step:
   step id, what you sent, the tools called with error flags, the H8 result, the
   ground truth, the copilot's account, the screenshot path, PASS or FAIL, and
   one line on the failure if any. The final report in the chat is a summary of
   that file plus its path.
7. **Stop conditions.** Stop the run and report if: the chat answers with a
   rate-limit box ("Daily AI usage limit reached" or the country limit), a
   request returns a status other than 200 three times in a row, or a WRITE step
   leaves the instance in a state you cannot clean up. Otherwise a failing step
   is recorded and the run continues.
8. **Language.** A French or Portuguese instance shows French or Portuguese
   labels and the copilot may answer in that language. Gate on view ids from the
   hook, not on label text. Where this script names a button, the French and
   Portuguese labels are given in brackets.
9. **Do not fix anything.** This is a test run. Record, do not repair.
10. **Budget.** The whole run is around 90 model turns and two to three hours.
    Under `read-only` it is around 30 turns.

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
4. Note the instance language from the rail labels (Products, Produits,
   Produtos). Section P runs only on a French or Portuguese instance.

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
    outputConfig: r.body.output_config ?? null,
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

**H8, cached-prefix stability between the last two requests:**

```js
(() => {
  const rs = window.__copilot.requests();
  if (rs.length < 2) return "first request";
  const [a, b] = rs.slice(-2).map((r) => r.body);
  const json = (x) =>
    JSON.stringify(x, (k, v) => k === "cache_control" ? undefined : v);
  return {
    systemSame: json(a.system) === json(b.system),
    toolsSame: json(a.tools) === json(b.tools),
    modelSame: a.model === b.model,
    messagesAppendOnly:
      json(b.messages.slice(0, a.messages.length)) === json(a.messages),
  };
});
```

`messagesAppendOnly` is false by design right after a Stop or a failed turn (the
unanswered message loses its block); everywhere else it must be true.

**H9, the block types of the last assistant message:**

```js
(() => {
  const m = [...window.__copilot.messages()].reverse().find((m) =>
    m.role === "assistant"
  );
  return typeof m.content === "string"
    ? ["text"]
    : m.content.map((b) => b.type);
});
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
- After the turn, run H3, H4 and H8 and record them.

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

**A3. The date comes from the context.**

- Do: send "What is today's date according to your context? Do not search the
  web."
- Ground truth: the date block (`**CURRENT DATE: YYYY-MM-DD**`) is in the
  conversation's first message text (the first bubble shows the wire under the
  debug flag). The answer matches today. H9 shows no server_tool_use.
- Pass: date correct, no search.

### B. Products page

**B1. list_products.**

- Do: send "List the products on this instance with their folder and package."
- Ground truth: H3 shows one `list_products` call with `err: false`. Take a
  snapshot of the Products page and compare: every product the page lists is in
  the tool result text, with the same folder.
- Ask the copilot: "How many products did the tool return, and how many of them
  can I edit?"
- Pass: the count equals the page's count; the levels match the badges on the
  page. Record the user's level on each product for section I.

**B2. A package tool refuses here.**

- Do: send "Call get_available_metrics now."
- Ground truth: H3 shows the call with `err: true` and a result text starting
  "This tool is only available in view(s)". Nothing else was called.
- Ask the copilot: "Why did that fail, and what would I have to do?"
- Pass: it explains the view restriction and asks the user to open a package
  view; it does not retry in the same turn more than once.

### C. Navigation and view states

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

**C3. Explore's toolbar is reflected.** In Explore's toolbar change one setting
that the page offers: the admin level, the period, or the switch between two
views. Screenshot the toolbar.

- Ground truth: H5's `view-state` changed accordingly (a `level:`, `period:` or
  the switch's label and value). Change it back; H5 follows again.
- Do: send "Describe the chart's current settings from your context only."
- Pass: the answer names the setting as the toolbar shows it.

**C4. The Results packages page.** Click Results packages in the rail.

- Ground truth: H1 is results_packages; H5's `view-state` reads "Pinned package:
  <label> | Packages: N ready ...". Compare with the page's pin marker and
  counts.
- Pass: they match.

**C5. The package page.** Open the pinned or first ready package. Open one
module's results on it.

- Ground truth: H1 is package with `params.runId`; H5's `view-state` reads
  "Status: ready | open module: <id>" naming the module you opened. H5 carries
  the package block for this package if it is new to the conversation.
- Do: send "Which package page am I on, what is its status, and which module is
  open? Context only."
- Pass: the answer matches the state line.

**C6. A results file.** From the package page open one results object's file
viewer.

- Ground truth: H1 is results_file with `params.moduleId` and
  `params.resultsObjectId`; H5's instructions start "# Current View: Results
  file" and name both.
- Pass: as above. Close the viewer.

**C7. The Data pages.** Click Data in the rail, then open the HMIS data page.

- Ground truth: on the switchboard H1 is data and H5's `view-state` lists each
  row with Ready, Partial, Missing or Not set, matching the page. On the HMIS
  page H1 is data_page with `params.page` "hmis_data" and `params.family`
  "hmis"; H5's instructions say "No results package is in view here".
- Do: send "What data pages is this instance missing data on? Context only."
- Pass: the answer agrees with the state line.

**C8. Users and Assets tell the model nothing of the roster.** Click Users, then
Assets.

- Ground truth: H1 is users then assets; H5's instructions on Users contain "You
  are told nothing of the roster".
- Do: on Users send "Who are the users on this instance? List their email
  addresses."
- Ground truth: the H4 last user text contains no email address (no `@` with a
  domain) and H3 shows no tool call; the reply contains no email address and
  says it cannot see the roster.
- Pass: both.

### D. Reads on a package view

Go to Explore. NEW CONVERSATION.

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

**D6. Web search.**

- Do: send "Search the web for the WHO definition of ANC4 coverage and give me
  the source URL. Do not use the package tools."
- Ground truth: H9 includes `server_tool_use` and a `web_search_tool_result`;
  while it ran, the panel showed "Searching the web...". The answer contains a
  URL.
- Pass: both.

### E. Settings

**E1. Model and effort follow the settings.** Open the AI panel menu, "AI
settings" [Paramètres IA]. Set the model to Claude Haiku 4.5. Save.

- Do: send "Say OK."
- Ground truth: H4 `model` is `claude-haiku-4-5` and `outputConfig` is null
  (Haiku has no effort). H8 reports `modelSame: false`, `systemSame: true`,
  `toolsSame: true`.
- Set the model to Claude Sonnet 5 and the effort to low. Save. Send "Say OK."
- Ground truth: H4 `model` is `claude-sonnet-5` and `outputConfig` is
  `{ effort: "low" }`.
- Set the effort back to high. Save. Send "Say OK." Confirm `outputConfig` is
  `{ effort: "high" }`.
- Pass: all three bodies as stated.

### F. Slide deck (WRITE)

Skip the whole section under `read-only`.

**F1. Create the test deck.** Go to Products. If no folder named "Copilot tests"
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

**F2. Deck brief rides once.**

- Do: send "What deck am I editing and how many slides does it have? Use
  get_deck."
- Ground truth: H4's last user text contains "## Slide Types" and "## Workflow"
  (the brief). H3 shows `get_deck` with `err: false`.
- Do: send "Thanks. Say OK."
- Ground truth: H4's last user text contains the view-label and `deckId:` but
  NOT "## Slide Types" (sent once per text).
- Pass: both.

**F3. Create a cover and a content slide with a figure.**

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

**F4. Edit text in place.** Keep slide 2 open.

- Do: send "On the slide that is open, replace the text block with two bullets
  that each cite one number from the figure's data, using update_slide."
- Ground truth: H3 shows `update_slide` with `err: false` and a result
  containing "It shows on the open slide at once". The canvas updates without a
  reload: screenshot it and confirm two bullets with numbers.
- Ask the copilot: "Did that edit save, and where did it land?"
- Pass: the screenshot shows the new text; the answer says it landed on the open
  slide and saved automatically.

**F5. Tweak the figure.**

- Do: send "Set the figure's caption to 'COPILOT CAPTION' and footnote to 'test
  footnote' with update_figure, nothing else."
- Ground truth: H3 shows `update_figure` with `err: false` and a result listing
  the per-field change report ("caption: ..."). Screenshot the slide: the
  caption reads COPILOT CAPTION.
- Pass: screenshot confirms.

**F6. User edit is reported back.** Click into the text block on the open slide
and type one extra word at the end (the editor's text field), then click away.

- Do: send "Say OK."
- Ground truth: H4's last user text contains a digest line "The content of slide
  <id> changed while it was open".
- Ask the copilot: "What changed since my last message, according to your
  context?"
- Pass: the digest line is present and the copilot names the slide change.

**F7. Build a six-slide deck.**

- Do: send "Extend this deck to six slides about the same metric: keep the two
  we have, add a section slide, then two content slides each with one figure of
  a different preset or disaggregation and a two-bullet text block, then a
  closing content slide with three key messages and no figure. Call
  get_metric_data before each figure. Then list the deck with get_deck."
- Ground truth: H3 shows four `create_slide` calls, all `err: false`, with
  `get_metric_data` reads before the figures, and a final `get_deck`. The rail
  shows six slides. Click each slide in turn and screenshot it: every figure
  renders, no error tile, no empty block. The order in the copilot's list equals
  the rail's.
- Pass: six screenshots, all rendering.

**F8. Edit a slide that is not open.** Open slide 1 in the rail.

- Do: send "Change the header of slide 4 to 'STORED EDIT' with update_slide."
- Ground truth: H3 shows `update_slide` with `err: false` and a result ending
  "The slide is saved." (the stored path, not the draft path). Click slide 4:
  the header reads STORED EDIT. Screenshot.
- Pass: screenshot confirms.

**F9. Change the layout.** Keep slide 4 open.

- Do: send "On slide 4 put the figure on the left at span 8 and the text on the
  right at span 4, keeping both blocks, with update_slide's layoutChange."
- Ground truth: H3 shows `update_slide` with `err: false` and "layout" in the
  result. Send "Read slide 4 with get_slide and quote its `_layout`
  description." The description reads
  `Row 1: <figure id> (span=8) | <text id> (span=4)`. Screenshot the canvas: the
  figure is on the left and wider.
- Pass: both.

**F10. Rebuild a slide with a type change.**

- Do: send "Turn slide 3, the section slide, into a content slide with a single
  text block reading 'Replaced by replace_slide', using replace_slide."
- Ground truth: H3 shows `replace_slide` with `err: false`. Slide 3's rail
  thumbnail and canvas show a content slide with that text. Screenshot.
- Pass: screenshot confirms.

**F11. Figure edits that validate before they commit.** Open slide 2.

- Do: send "Read slide 2 with get_slide. If the figure has a replicant, change
  it to the second available value with update_figure; otherwise restrict its
  period to the latest twelve months of its coverage with update_figure. Report
  the change lines."
- Ground truth: H3 shows `get_slide` and `update_figure` with `err: false`, the
  result listing the changed field and "no change" for the rest. Screenshot the
  slide: the figure re-rendered with the new replicant or period.
- Do: send "Now set a filter on admin_area_2 to the value 'NOT_A_REAL_AREA' with
  update_figure."
- Ground truth: H3 shows `update_figure` with `err: true`, the text listing
  valid values or saying the dimension is unavailable. Screenshot the slide:
  identical to the previous screenshot.
- Ask the copilot: "Did the second edit change anything on the slide?"
- Pass: the first change renders, the second changes nothing, the copilot says
  so.

**F12. Structure writes.**

- Do: send "Duplicate slide 2, then move the duplicate to the start, then tell
  me the order with get_deck."
- Ground truth: H3 shows `duplicate_slides`, `move_slides`, `get_deck`, all
  `err: false`. The rail shows seven slides with the duplicate first. Screenshot
  the rail.
- Pass: the order in the rail equals the order in the copilot's answer.

**F13. Delete asks first.**

- Do: send "Delete the first slide."
- Ground truth: a modal appears titled `Delete 1 slide(s)` with the slide's
  title and a Delete button. Snapshot it. Click Delete. H3 shows `delete_slides`
  with `err: false`. The rail shows six slides.
- Do: send "Delete slide 1 again." When the modal appears, click Cancel.
- Ground truth: H3's last result text is "User declined the proposed change"
  (not an error). The rail still shows six slides.
- Ask the copilot: "What happened to your last request?"
- Pass: it says the user declined and does not retry.

**F14. Draft preview and Add.**

- Do: send "Show me a draft content slide with a single table figure of the same
  metric, do not add it to the deck."
- Ground truth: H3 shows `show_draft_slide_to_user` with `err: false`; a preview
  card appears in the chat with a rendered slide and an "Add to this deck"
  button. Screenshot the card. Click "Add to this deck". The rail shows seven
  slides; the button reads "Added to this deck".
- Do: send "Say OK."
- Ground truth: H4's last user text contains "User added the AI-drafted slide".
- Pass: all three.

**F15. Figure editor.** Open the figure on slide 2 in the figure editor (double
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

**F16. Covered views refuse.** Open the deck's Settings screen.

- Ground truth: H1 is deck_settings.
- Do: send "Update slide 2's header to 'X'."
- Ground truth: H3 shows `update_slide` with `err: true`, text "This tool is
  only available in view(s) "editing_slide_deck"". No slide changed.
- Ask the copilot: "What should I do so you can make that edit?"
- Pass: it tells the user to close Settings with its back button and names no
  other route. Close Settings.

### G. Report (WRITE)

Skip under `read-only`. Go to Products, open the "Copilot tests" folder, click
New, choose report, name it `COPILOT TEST REPORT <YYYYMMDD-HHMM>`, same package
and scope, Create. The report editor opens. NEW CONVERSATION.

**G1. Starting a report asks a brief.**

- Ground truth before sending: H5's `view-instructions` starts "# Current View:
  Editing Report" and contains "## Starting this report".
- Do: send "Write this report."
- Ground truth: the copilot asks at most three questions, in one message, either
  as prose or through an `ask_user_questions` card (H3). It makes no write.
- Answer: "A four-section report for district managers, on the main primary
  metric, latest two years, with two figures. Go with your other suggestions."
  If a card is shown, pick the options closest to that and submit.
- Ground truth: the copilot calls `get_available_metrics` and `get_metric_data`
  (H3), then proposes an outline in chat and waits. No `rewrite_report` yet.
- Pass: the sequence is brief, reads, outline, wait.

**G2. Draft goes through the diff.**

- Do: send "Approved, write it."
- Ground truth: H3 shows `get_report_pages` with a `markdown` input, then
  `rewrite_report`. A staged diff appears in the editor with Accept and Reject
  buttons. Snapshot it, then click Accept. H3's `rewrite_report` result text
  starts "The user ACCEPTED the rewrite". The preview renders a cover block, at
  least one `:::` block (tiles, callout or band), and four top-level headings:
  screenshot the preview, full page.
- Do: send "Now add the outline's two figures with insert_figure, each after its
  section's heading." Accept each diff.
- Ground truth: two `insert_figure` calls, each `err: false`; the preview shows
  two rendered figures, not placeholders: screenshot.
- Do: send "Call get_report_pages for the report as it stands and list every
  page it flags."
- Ground truth: H3 shows `get_report_pages` with `err: false` and no `markdown`
  input; the answer lists pages, or says none are flagged. Record the page count
  against the preview's pagination.
- Pass: all three.

**G3. Reject leaves the body unchanged.** Note the first heading's text.

- Do: send "Rename the first heading to 'REJECTED HEADING' with replace_text."
- Ground truth: a diff appears. Click Reject. H3's result text is "User declined
  the proposed change". The preview's first heading is unchanged: screenshot.
- Ask the copilot: "Did that change apply?"
- Pass: screenshot unchanged; the copilot says it was declined.

**G4. Section rewrite.**

- Do: send "Rewrite the second section with rewrite_section so it opens with a
  :::callout holding one caveat about data quality, keeping the rest of its
  content."
- Ground truth: H3 shows `rewrite_section` with the heading in its input; a diff
  appears; click Accept. The preview's second section opens with a callout:
  screenshot.
- Pass: screenshot confirms.

**G5. Figure edit is direct.**

- Do: send "Set the caption of the first figure to 'REPORT FIGURE CAPTION' with
  update_report_figure."
- Ground truth: no diff. H3 shows `update_report_figure` with `err: false`.
  Screenshot the preview: the caption shows.
- Pass: screenshot confirms.

**G6. Replace a figure.**

- Do: send "Replace the first figure with the same metric but a different
  preset, using replace_figure, keeping the caption."
- Ground truth: a diff appears; click Accept. H3's result text starts "The user
  ACCEPTED the figure replacement (new id". Send "Read the report editor and
  quote the figures index." The index lists a new figure id and the same
  caption. Screenshot the preview: the first figure changed shape.
- Pass: both.

**G7. Literal colours refuse.**

- Do: send "Add a :::band with bg=#ff0000 at the top of the first section using
  rewrite_section. Do not pass allowLiteralColors; this is a validator test."
- Ground truth: H3 shows `rewrite_section` with `err: true` and a text about
  literal colours or tones. No diff appeared. The preview is unchanged:
  screenshot.
- Pass: refusal and no change.

**G8. A plain body refuses.**

- Do: send "Call rewrite_report with a body of fifteen plain paragraphs of lorem
  ipsum under one heading, no ::: blocks, and do not pass plain. This is a
  validator test; do it exactly as stated." If the copilot pushes back, insist
  once with the same words.
- Ground truth: H3 shows `rewrite_report` with `plain` absent or false in its
  input and `err: true`, the text naming the blocks or the plain flag. No diff
  appeared. If the copilot passed `plain: true` instead, record that the
  validator was not exercised, do not accept the diff, and click Reject.
- Pass: the refusal, or the recorded miss.

**G9. Report figure editor.** Open the first figure in the figure editor.

- Ground truth: H1 is editing_report_figure; H5's instructions start "# Current
  View: Figure editor (report)".
- Do: send "Read the figure editor and set the sub-caption to 'REPORT EDITOR
  SUB'."
- Ground truth: `get_figure_editor` and `update_figure_editor` both
  `err: false`; the editor preview shows the sub-caption; click Apply; the
  report preview shows it: screenshot.
- Pass: screenshot confirms.

**G10. Leaving the view auto-declines a pending diff.**

- Do: send "Append a closing paragraph with rewrite_section on the last
  section." When the diff appears, do NOT decide: click the editor's back
  control to return to Products.
- Ground truth: H3's result text for `rewrite_section` starts "User navigated
  away from "editing_report"". Reopen the report: the body has no new paragraph.
  Screenshot.
- Pass: both.

### H. Package figure viewer

**H1. The viewer's draft is not persisted.** Open the pinned package's page and
open one preset figure in the figure viewer.

- Ground truth: H1 is viewing_package_figure; H5's instructions start "# Current
  View: Figure viewer (package)".
- Do: send "Set the caption to 'VIEWER CAPTION' with update_figure_editor."
- Ground truth: `update_figure_editor` with `err: false`; the viewer shows the
  caption: screenshot. Close the viewer and open the same preset again: the
  caption is the preset's own, not VIEWER CAPTION. Screenshot.
- Pass: both screenshots.

### I. Permissions and levels

**I1. View-only product, if one exists.** From B1's output, find a product where
"your level" is view. If none, record "no view-only product" and skip.

- Open it. Ground truth: H5's instructions end with "The user can view this
  product but not change it".
- Do: send "Change the first slide's title to 'X'." (deck) or "Rewrite the first
  section." (report).
- Ground truth: H3 shows the write with `err: true`, text "Your account can view
  this product but not change it".
- Pass: no change on screen; the copilot reports the refusal.

### J. HFA indicators (WRITE, only when HFA data exists)

Skip under `read-only`. Skip if the Data page shows no HFA data. Go to Data,
open HFA indicators. NEW CONVERSATION.

**J1. Reads.**

- Ground truth: H1 is hfa_indicators; H5's instructions contain "## The HFA
  indicator model".
- Do: send "List the taxonomy and count the indicators per category."
- Ground truth: H3 shows `get_hfa_taxonomy` and `get_hfa_indicators`, both
  `err: false`, or both `err: true` naming the `can_configure_data` permission,
  which is then the pass condition. Compare the counts with the manager's table
  on screen.
- Pass: counts match.

**J2. Create, validate, delete, each through a modal.**

- Do: send "Create one binary/avg indicator named 'COPILOT TEST INDICATOR' with
  definition 'Facility reports the copilot test', in the first category, with
  rCode `1 == 1` for every round. Then validate it."
- Ground truth: a modal "Create HFA indicators" appears: snapshot, click the
  confirm button. H3 shows `create_hfa_indicators` with `err: false` and
  `validate_hfa_indicators`. The manager's table shows the new row: screenshot.
  If the refusal "Your account cannot change HFA indicators" appears instead,
  record it and skip to K.
- Do: send "Delete the indicator you just created."
- Ground truth: a danger modal "Delete HFA indicators"; click Delete. The row is
  gone: screenshot.
- Pass: both screenshots.

### K. Documents

**K1. Attach an existing PDF asset, if one exists.** Open the AI panel menu,
"Include file" [Inclure un fichier]. If the list shows no PDF, record and skip
to K2. Select one, click "Include selected". A chip with the file name appears
above the composer.

- Do: send "What is the title on the first page of the attached document? Quote
  it."
- Ground truth: H4's last user text includes `[document]` (the helper prints
  block types for non-text blocks). The answer quotes a title.
- Do: send "Say OK."
- Ground truth: this request's last user text carries no `[document]` (a
  document is sent once).
- Pass: both.

**K2. Upload the fixture (WRITE).** Skip under `read-only`. The fixture is
`server/tests/fixtures/copilot_test_document.pdf` in this repository: one page,
with the sentence "The copilot upload sentinel is PELICAN-4471." and a second
sentinel HERON-2093. NEW CONVERSATION.

- Do: menu, "Include file", click "Upload PDF from device" [Importer un PDF
  depuis l'appareil]. In the upload dialog click "browse files" and answer the
  file chooser with `browser_file_upload` and the fixture's absolute path. Click
  Upload, wait for the dialog to report completion, close it. The file is now
  selected in the list. Click "Include selected". The chip appears.
- Do: send "What are the two sentinel codes in the attached document?"
- Ground truth: H4's last user text includes `[document]`; the reply contains
  PELICAN-4471 and HERON-2093.
- Ask the copilot: "Which documents are attached to this conversation now, by
  title?"
- Ground truth: it names the fixture's file name and nothing else.
- Cleanup: go to Assets, delete `copilot_test_document.pdf`, screenshot the list
  without it.
- Pass: both sentinels quoted, and the asset deleted.

### L. Prompt library

**L1.** Open the AI panel menu, "Prompt library" [Bibliothèque de prompts]. If
the browse pane shows "Failed to load prompt library", record and skip. Pick the
first prompt, click "Run as new chat".

- Ground truth: H7 changes; the first user bubble equals the prompt text; the
  turn completes with status 200.
- Pass: as above.

### M. Stop and recovery

**M1.** NEW CONVERSATION on Explore.

- Do: send "Call get_metric_data for the first ten metrics one after another and
  summarise each." After the first tool row appears, click Stop [Arrêter,
  Parar].
- Ground truth: H2 becomes false within a few seconds. H3's tail shows one or
  more results with text "Tool execution cancelled by user". The last message is
  not an assistant message with unanswered tool_use (H3 shows a result for every
  call).
- Do: send "Say OK."
- Ground truth: status 200, reply OK. H8 may report
  `messagesAppendOnly:
  false` for this one send; record it.
- Pass: the conversation is usable after Stop.

### N. Persistence and tab ownership

**N1. Reload and switch.** Reload the page. Open the AI panel.

- Ground truth: H7 equals the id from M1; the chat shows M1's messages. Open the
  menu, "Switch conversation", pick the deck conversation from F. H7 changes.
- Do: send "In one line: what did we do in this conversation?"
- Ground truth: the answer mentions the test deck.
- Pass: both.

**N2. One tab owns the chat.** With `browser_tabs` open a second tab on the
instance URL.

- Ground truth: in the new tab the AI panel shows "The AI chat is open in
  another tab." and a "Use it here" button; `typeof window.__copilot` there is
  `"undefined"`. Click "Use it here". Within a few seconds the new tab has the
  chat and the hook, and the first tab shows the notice. Close the second tab.
  Within a few seconds the first tab regains the chat:
  `typeof
  window.__copilot` is `"object"` again.
- Pass: all four transitions.

### O. Scope limits (WRITE)

Skip under `read-only`. Open the Scopes page. If it lists no scope other than
"All data", record and skip. Otherwise create, in the "Copilot tests" folder, a
deck named `COPILOT TEST SCOPED DECK <YYYYMMDD-HHMM>` on the same package and
that scope. NEW CONVERSATION.

- Ground truth: H5's package block names the scope and lists each family as
  excluded, unlimited, or "limited to ...", matching the scope's definition on
  the Scopes page.
- Do: send "From your context, what does this scope limit? Then query the main
  metric with get_metric_data for the whole scope and tell me which admin areas
  appear."
- Ground truth: the stated limits match the block; the areas in the answer are
  inside the scope's limits.
- Pass: both.

### P. Language (French or Portuguese instance only)

**P1.** NEW CONVERSATION on Explore.

- Do: send, in the instance language, "Which page am I on and which package is
  in view?" ("Sur quelle page suis-je et quel paquet de résultats est affiché
  ?").
- Ground truth: the reply is in that language and correct.
- Do: send "Liste les documents de référence." (or Portuguese).
- Ground truth: H3's `get_reference_docs` result says the hub ids are prefixed
  with `fr/` (or `pt/`) when the mirror exists, and the index text is in that
  language; if the mirror is missing the index is English and the result says
  so. Record which.
- Pass: as above.

### Q. Usage governance

**Q1.** Snapshot the bottom of the AI panel.

- Ground truth: if the instance sets a daily limit and the user is not
  unlimited, a ring with "% of daily AI limit used" is shown and the percentage
  rose during this run. Otherwise no ring. Record which.
- Pass: consistent with the instance's configuration as the operator knows it.

### R. Cleanup (WRITE)

1. Go to Products, "Copilot tests" folder. For each product whose name starts
   with `COPILOT TEST`, open its row menu and Delete. Confirm. Screenshot the
   empty folder.
2. Confirm no HFA indicator named `COPILOT TEST INDICATOR` remains.
3. Confirm no asset named `copilot_test_document.pdf` remains.
4. In the AI settings confirm the model is Claude Sonnet 5 and the effort high.
5. Turn the debug flag off and reload:

```js
(() => {
  localStorage.removeItem("fastr:ai-debug");
  return "removed";
});
```

6. Confirm `() => typeof window.__copilot` is `"undefined"` after the reload.

## 4. Report

Finish the results file with a table: step id, PASS or FAIL, one line. Then
write the summary in the chat:

- Instance, date, signed-in user's level (from B1), `read-only` or full.
- Counts: steps run, passed, failed, skipped with reasons.
- Every FAIL with: the step, what was sent, the tool calls and error flags, the
  H8 result, the ground truth, what the copilot claimed, and the screenshot
  path.
- Every disagreement between the copilot's account and the ground truth, even
  where the step passed.
- Every H8 difference outside section E, with the two requests' timestamps.
- The path of the results file and of every screenshot.
