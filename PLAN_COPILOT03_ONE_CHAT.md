# PLAN_COPILOT03_ONE_CHAT: one chat beside the whole shell, every place a view of it

> **Status (2026-10-08):** Not started. Child 03 of the COPILOT program
> (`PLAN_COPILOT_ORCHESTRATION.md` in the panther repo). Waits on G1, G2 and GF;
> opens G3.

The copilot stops being a chat mounted per open product. One chat sits beside
the whole shell, with one thread list per user, and every place the user can be
(each tab page, each full-page view, each nested editor, the HFA indicator
manager and its two editors) sets a view of it. The view decides which tools of
one fixed set may run and what the next message tells the model. Every user and
every session registers the same tools, so the prompt cache survives every move;
a tool outside the current view, or beyond the user's permissions or product
level, refuses when called. The tools that touch a results package run against
the package the current view shows, bound per call over an inner tool set cached
per (package, scope), and every package read names its package and scope. The
HFA indicator assistant becomes three views of the same chat. The chat's
shell-level code moves from `client/src/components/products/copilot/` to
`client/src/components/instance/copilot/`. The engine work this needs (E1 to E8)
is PLAN_COPILOT01_ENGINE's and the frames fix is PLAN_FRAME_PANELS step 1; both
land in panther before step 1 here, and step 7 syncs the frames fix here when
G1's sync predates it.

**Next step: Do 1**

Branch: `version2`. Repos touched: this app; the panther repo only for the
commit that opens G3 (step 7 runs panther's `./sync`, which writes only here).
Read first: what §0's reading order names.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's floor, conditional gates
and sections are `PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_COPILOT03_ONE_CHAT.md."
- Branch: `version2`, overriding PROTOCOL_APP_PLANS's `tim-branch`: the product
  plane, and with it the copilot, lives on `version2` until
  PLAN_PRODUCTS_RESTRUCTURE step 13 merges it into `main`.
- Floor: PROTOCOL_APP_PLANS's. No step touches a migration, the base schema, the
  seed, the query engine or help text, so no conditional gate applies. In every
  step `./validate_protocols` also prints no new tier-2 flag and no
  stale-baseline note, and `validate_protocols_baseline.json` changes only as
  step 1 says (R9).
- Build log: §8. Last step: 11.
- Reading order: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_13_ai_assistant.md` and the
  SYSTEM file of each other area the step's Surface names,
  `PROTOCOL_APP_AI_TOOLS.md`, `panther/protocols/PROTOCOL_UI_AI_CHAT.md`,
  `panther/protocols/PROTOCOL_UI_STRUCTURE.md`, §2 and §3, the step's own
  section in §4, §8, and the `PLAN_COPILOT_FINDINGS.md` entries it cites.
- Citations: Program rulings by number from `PLAN_COPILOT_ORCHESTRATION.md` §3
  (R1 one chat, R2 the catalogue, R3 the risk-tier rule, R5 cross-repo steps, R6
  gates are facts, R8 the findings companions, R9 the folder move, R10 no step
  waits on Tim); this plan's rulings 1 to 13 (§3); the companion's A01 to H53
  and F01 to F13 (its C01 to C29 are engine facts).
- Paths: Repo-relative, except that `components/`, `state/` and `onboarding/`
  stand for `client/src/components/`, `client/src/state/` and
  `client/src/onboarding/`, and `SYSTEM_NN` for the repo's `SYSTEM_NN_*.md`. A
  file a step's Gates name without its directory is its Surface entry.

**The gates this plan waits on.** G1, G2 and GF, as
`PLAN_COPILOT_ORCHESTRATION.md` §5 states them. Before `Do 1` the session runs
each check there and stops, naming the gate, if one is not open. `<panther>` is
`/Users/timroberton/projects/panther/timroberton-panther`, branch `main`;
`<pantherGitCommit>` is `panther/.panther-manifest.json`'s.

**The gate this plan opens.** G3 (`PLAN_COPILOT_ORCHESTRATION.md` §5), opened by
R6; the review that deletes this file deletes `PLAN_COPILOT_FINDINGS.md` too
(R8).

Rules peculiar to this plan:

- **The engine is named by number.** E1 to E8 are COPILOT01's changes under the
  names §2.1 gives (documented in `<panther>/DOC_AI_CHAT.md` and
  `panther/_305_ai/README.md`); where a landed name differs, the code wins and
  §8 records it. A step that adopts an opt-in change (R3) sets its field.
- **COPILOT02's defects are not this plan's** (§6) unless a step names them; a
  session that finds one still open records it in §8 and leaves it.
- **Every step lands whole.** No step leaves a path half-moved, so `version2`
  may be deployed at any step boundary (§7); the floor is the evidence (R10).
- **The sync-site check.** A step's Gates pair view ids with the files that set
  them; for each pair the reviewer runs `git grep -n '"<id>"' -- <file>`, which
  prints the line that sets the view (for a figure view, where the host names it
  in `aiView`).

Vocabulary:

- **place**: a tab page, a full-page view opened through `openShellEditor`, or a
  nested editor or viewer inside one; modals are not places.
- **view**: a panther view id in the one registry, set by every place in ruling
  1; its **sync site** is the code that sets it.
- **hold**: capture the current view when a place mounts and restore it when the
  place unmounts (`holdCopilotView`, ruling 6).
- **pair**: a results package and a scope, `(runId, scopeId)`; a view's pair is
  the one its place shows.
- **package view**: a view whose ruling 1 row has a package in view; its context
  carries `getScope` and `getRunId` (ruling 7).
- **chat-wide tool**: a tool every view admits and no move refuses.
- **outer tool, inner set**: a package tool as registered, bound per call (E5)
  to the same-named tool of an inner set built for the view's pair.
- **blocks**: what a message carries before the user's text under E7: the **view
  line** and the view's **state** on every message, its **instructions** and the
  **package block** when their text is new to the conversation, the **date
  block** when the date changes, and the digest.
- **panel, opener**: the shell-level `FrameRightResizable` holding the chat, and
  the handle on the window's right edge that opens it.

## 1. The problem

Facts and line numbers are as of 2026-10-08, `version2` at `dba8b7887`, whose
copilot, HFA and `/mcp` code is the companion's (`4d6d6050b`). COPILOT02 (G2)
and this plan's earlier steps edit many of the files cited here first, so a step
finds each cited line by its content.

- **One chat per open product** (A18, A19): keyed on the product's pair, with
  env, tools, level and the prompt's pair fixed per mount, threads per product
  and settings per browser (H05), and four views on a module-singleton
  controller whose fallback is `opening_product` (A05;
  `components/products/copilot/_shared/ai_views.ts:107-176`).
- **A second chat for HFA indicators** (A51, A52, B.2) on `/ai-instance` (B54).
- **No other place has a chat or a view** (A14, A35 to A50, A56 to A60).
- **R1** (Tim, 2026-10-08) supersedes PLAN_PRODUCTS_RESTRUCTURE D15
  (`PLAN_PRODUCTS_RESTRUCTURE.md:649-680`; H03 to H07).

That design leaves broken the companion's D.2 (D44 to D63), two engine facts one
chat per user makes defects (C07, C27), and a reload under a running turn once
the panel sits beside the header (A07, A08, the note under A.2). Each step names
what it fixes: those, D34 and the D.3 rows for 03.

## 2. The model

### 2.1 What the engine provides (G1, GF)

- E1, `createMarkdownIt`'s `images` option: panther's chat renders image syntax
  as a link.
- E2, `AIChat`'s `chat` prop (`AIChatInstance`): `AIChat` uses its pane's
  `createAIChat()` instance.
- E3, a view's `identity` (`AIViewIdentity`): a flat record of strings, or a
  function of params and context returning one; a view-limited call whose live
  view id or identity differs from the turn's latest view line is refused,
  naming both views and saying nothing was applied, and its pending approval
  closes; a tool without `availableIn` is never refused for a move.
- E4, `tool_display`'s `view` (`AIViewSnapshot`): the item stores
  `{ id, identity }`, which its display component receives.
- E5, `bindAIToolToView(viewRegistry, template, resolve, options?)`: the bound
  tool keeps the template's name, description, schema and metadata
  (`availableIn` and its hint included), and `options.availableIn` gates a
  template that declares none, such as a headless one; each call passes one view
  snapshot to `resolve`, the inner tool and its approval's `propose`.
- E6, `digestAcrossViews` (`createAIViewController`): an interaction is admitted
  against the view it happens in and its line names that view; a conversation's
  cursor moves to the log's end when it is activated.
- E7, `appendOnlyTurns` (`AIChatConfig`); a view's `state`;
  `getNextTurnPreview()`: view line, state and digest ride every message, one
  typed mid-turn included; instructions and consumer blocks
  (`getEphemeralContext` may return several) ride when their text is new; an
  unanswered message loses its blocks; a changed system-and-tools hash strips
  stored thinking once; the accessor returns the system text and the next
  message's blocks.
- E8, `crossTabTurns` (`AIChatConfig`): a turn holds a cross-tab lock on its
  conversation; list writes are serialized in place.
- GF, PLAN_FRAME_PANELS step 1: every frame builds its panel once (C08).

### 2.2 The panel and the conversation

One `FrameRightResizable` in `components/instance/instance.tsx` wraps
`ShellEditorWrapper`, beside every tab page, full-page view and nested editor
(A06); its slot is always passed and built once (GF), and the chat mounts once
the user is approved. An instance-stream reset (`reconnectForApproval`, on
approval or a change to the user's own scope access) unmounts the shell until
the new `starting` lands (A02); the chat remounts with it and reopens the same
thread, which its scope and last-active id pick. No panel before sign-in, for an
unapproved user, or on `/access-tokens` (A01, A03, A04). One opener, outside
`ShellEditorWrapper`, shows while the panel is closed; the six local AI buttons
(deck header, report header, figure editor, three in the HFA manager) and the
HFA manager's `showAi` go, and `showAi` in `state/t4_ui.ts` is the panel's one
open state (H38).

Thread and settings scope are `copilot:<Clerk user id>`, which survives an email
change (ruling 13 without a Clerk user); the thread list and New conversation
stay, and the current thread follows the user through every view and tab. Old
threads (`copilot:<productId>`, `hfa-indicators`) and settings keys
(`panther-ai-settings-copilot`, `panther-ai-settings-hfa-indicators`) stay
unlisted and unread (H33). The chat clears the interaction log when it mounts
and stops its turn when it unmounts (sign-out, a user switch without a reload,
the stream reset). While a turn runs, the language menu and the profile's Clear
data cache, Clear AI chat history, Sign out and Change email ask first, because
a reload loses the turn and its record of applied changes.

### 2.3 Views, tools and what the model is told

Every place sets its view (`shell` until a page does) with a live label, an
identity (E3), and the instructions and state its ruling 1 row attaches (E7),
read at send (ruling 6). Every user registers the same tools, assembled once per
shell mount in `copilot_tools.ts`, gated by ruling 5's `availableIn` and refused
at execution by ruling 11; every package tool is an outer tool bound per call to
the inner set of the view's pair (step 6), and a view with no package admits
none. Each block stays on the message it rode, so the model can tell where every
earlier turn happened; the system prompt is instance level (step 4).

## 3. Rulings

1. **The catalogue** (Tim, 2026-10-08; program R2). As accepted:

   Tool groups. Every view admits the chat-wide group.

   | Group               | Tools                                                                                                                                                     | Notes                                                                                                    |
   | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
   | Chat-wide           | `ask_user_questions`, `get_methodology_docs_list`, `get_methodology_doc_content`, `get_info`, web search                                                  | never refused for a move                                                                                 |
   | Package reads       | `get_available_metrics`, `get_metric_data`, `get_available_modules`                                                                                       | the view's pair                                                                                          |
   | Module internals    | `get_module_r_script`, `get_module_log`, `get_module_settings`                                                                                            | the view's pair; refuse without the permission                                                           |
   | Deck reads          | `get_deck`, `get_slide`                                                                                                                                   |                                                                                                          |
   | Deck writes         | `create_slide`, `replace_slide`, `update_slide_content`, `update_slide_header`, `modify_slide_layout`, `delete_slides`, `duplicate_slides`, `move_slides` | direct; `delete_slides` takes modal approval                                                             |
   | Slide editor        | `get_slide_editor`, `update_slide_editor`, `update_figure`                                                                                                | live edits                                                                                               |
   | Drafts              | `show_draft_slide_to_user`                                                                                                                                | the card renders under the package it was drafted in; Add shows only in an editable deck on that package |
   | Report reads        | `get_report_editor`, `get_report_figure`, `get_report_pages`                                                                                              |                                                                                                          |
   | Report writes       | `rewrite_report`, `rewrite_section`, `replace_text`, `insert_figure`, `replace_figure`, `update_report_figure`                                            | first five with diff approval                                                                            |
   | Figure editor (new) | `get_figure_editor`, `update_figure_editor`                                                                                                               | the open figure editor's draft config, live                                                              |
   | HFA reads           | `get_hfa_indicators`, `get_hfa_taxonomy`, `get_hfa_variable_dictionary`, `inspect_hfa_variable`, `get_hfa_indicator_code`, `validate_hfa_indicators`      | `validate_hfa_indicators` returns its issues and writes nothing                                          |
   | HFA writes          | `update_hfa_indicator_labels`, `assign_hfa_indicator_categories`, `create_hfa_indicators`, `set_hfa_indicator_code`, `delete_hfa_indicators`              | modal approval                                                                                           |
   | HFA editor (new)    | `get_hfa_indicator_editor`, `update_hfa_indicator_editor`                                                                                                 | the open code editor's unsaved state, live                                                               |
   | Products (new)      | `list_products`                                                                                                                                           | the products you can see: name, type, folder, package, scope, your level                                 |

   `/mcp` has no view and keeps its six reads; its source line names scope "All
   data". The three reference tools stay as they are on both surfaces.

   Views:

   | View                             | Where                                                               | Package in view                                    | Groups beyond chat-wide                                                           | Attached on entry                                               |
   | -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
   | `products`                       | Products page                                                       | none                                               | Products                                                                          |                                                                 |
   | `opening_product`                | a product editor while it loads                                     | product                                            | Package reads, Module internals, Drafts                                           | product name                                                    |
   | `editing_slide_deck`             | a deck with no slide editor mounted                                 | product                                            | Package reads, Module internals, Drafts, Deck reads, Deck writes, `update_figure` | deck workflow, your level                                       |
   | `editing_slide`                  | a deck with a slide open, its normal state                          | product                                            | Package reads, Module internals, Drafts, Deck reads, Deck writes, Slide editor    | deck and slide workflow, your level                             |
   | `editing_slide_figure`           | figure editor opened from a slide                                   | product                                            | Package reads, Module internals, Drafts, Figure editor                            | the figure being edited                                         |
   | `deck_settings`                  | deck settings                                                       | product                                            | Package reads, Module internals, Drafts                                           |                                                                 |
   | `deck_history`, `report_history` | version history                                                     | product                                            | Package reads, Module internals, Drafts                                           |                                                                 |
   | `editing_report`                 | a report                                                            | product                                            | Package reads, Module internals, Drafts, Report reads, Report writes              | format, style brief, your level                                 |
   | `editing_report_figure`          | figure editor opened from a report                                  | product                                            | Package reads, Module internals, Drafts, Figure editor                            | the figure being edited                                         |
   | `results_file`                   | the results file viewer a figure editor opens from Download         | the figure's pair                                  | Package reads, Module internals, Drafts                                           | module and results object                                       |
   | `explore`                        | Explore                                                             | Explore's selection; none when no package is ready | Package reads, Module internals, Drafts                                           | family, module, view, type and its settings                     |
   | `results_packages`               | Results list                                                        | none                                               |                                                                                   | the pinned package, counts by status                            |
   | `package`                        | a package page and its script, log and file viewers                 | the page's package at the page scope               | Package reads, Module internals, Drafts                                           | status, failure stage and error, progress, open module          |
   | `viewing_package_figure`         | a package's default visualization viewer                            | the page's pair                                    | Package reads, Module internals, Drafts, Figure editor                            | the figure shown                                                |
   | `module_defaults`, `scopes`      | those full-page views                                               | none                                               |                                                                                   |                                                                 |
   | `data`                           | the Data switchboard                                                | none                                               |                                                                                   | each item's label and status (Ready, Partial, Missing, Not set) |
   | `data_page`                      | every other Data page and the views it opens (params: page, family) | none                                               |                                                                                   | page and family                                                 |
   | `hfa_indicators`                 | HFA indicators manager                                              | none                                               | HFA reads, HFA writes                                                             | HFA guidance (today's prompt), open tab                         |
   | `hfa_indicator_editor`           | HFA code editor                                                     | none                                               | HFA reads, HFA editor                                                             | open indicator and round                                        |
   | `hfa_indicator_import`           | HFA Excel import                                                    | none                                               | HFA reads                                                                         |                                                                 |
   | `assets`, `users`, `user`        | those pages                                                         | none                                               |                                                                                   | page only: no roster, no emails                                 |
   | `shell`                          | fallback until a page sets its view                                 | none                                               |                                                                                   |                                                                 |

   **1, continued.** While a package is generating or has failed, `package`
   attaches no package block, its Package reads refuse with that reason, and its
   Module internals read by run id; the view is set again when the status
   changes. `data_page` covers registry configuration, facilities and the
   facility import, GeoJSON maps with their upload wizard and mapping editor,
   admin area labels, HMIS indicators and the DHIS2 indicator search, HMIS data
   with its ledger detail, delete data, imports and run details, population and
   its import, HFA time points, sampling weights and their import, HFA data with
   its imports, run detail and delete, and ICEH data with its imports, run
   detail and delete. Modals are not views: they cover the panel, and the view
   beneath stays current. Two earlier rulings move: `list_products` reverses
   D15's "no product-registry tools" (`PLAN_PRODUCTS_RESTRUCTURE.md:667-668`;
   H06), and the `package` and `explore` blocks narrow SYSTEM_13's "nothing
   about modules goes into the AI context" (`SYSTEM_13_ai_assistant.md:104-106`;
   H25) to the package grounding: on those two pages the module and its status
   are what the user is looking at.

2. **What the folder move moves** (R9). The shell-level code R9 moves: the panel
   and pane, settings, documents, prompt library, debug panel, view registry,
   controller and interactions, system prompt, tool binding, and the package and
   module tools. The HFA chat's wrapper, pane and SDK client go.

3. **Imports point one way** _(proposed)_. `components/instance/copilot/`
   imports nothing at runtime from `components/` but
   `components/_shared/mod.ts`; every page, product tool and HFA tool imports
   its `mod.ts`; R9's assembly is `components/instance/copilot_tools.ts`,
   imported by `instance.tsx` alone, which keeps lint:structure's `entry-cycle`
   green once the figure editor sets its view. The folder has no `_shared/` (its
   registry, controller, interactions, prompts and types have one consuming
   child; `shared-consumers` wants two), so they sit at its root with the env.
   The module tools flatten into its `tools/`, which reads `ClientAIToolEnv`
   from `../mod.ts` as a type only (`mod.ts` re-exports `tools/mod.ts`, so a
   runtime import back is a folder cycle), and declare
   `availableIn: COPILOT_TOOL_VIEWS.<name>` in `createAITool`'s plain shape,
   strings the chat checks against its registry when the tool registers (C11).

4. **"Save this report's style…" reaches the pane through the view**
   _(proposed)_. The `editing_report` view's context gains
   `getSaveStyleAction()`, the action for an HTML report the user can edit and
   `undefined` otherwise; `report.tsx` supplies it, `save_report_style.tsx`
   stays in `components/products/copilot/`, and the pane's menu item shows when
   the current view supplies the action. Moving the modal with the pane would
   make the chat's folder import `components/products/_shared/`, a cycle once
   the figure editor sets its view.

5. **The catalogue is data in lib** _(proposed)_.
   `lib/ai_tools/copilot_catalogue.ts` holds as `const` data the view ids
   (`COPILOT_VIEW_IDS`), the package views, each gated tool's views
   (`COPILOT_TOOL_VIEWS`), the chat-wide tool names, each tool's requirement,
   `COPILOT_APPROVAL_EXEMPT` (the direct-apply editor writes) and each view's
   identity parts, with the pure `copilotViewIdentity`, `copilotToolRefusal` and
   `packageToolsKey`. Requirements: `get_module_r_script` and
   `get_module_settings` need `can_view_data`, `get_module_log` `can_view_logs`,
   the HFA reads `can_configure_data` (`inspect_hfa_variable` `can_view_data`),
   the HFA writes and `update_hfa_indicator_editor` the HFA write gate (ruling
   12), and a deck's, slide's, report's or product figure's writes edit level on
   the view's product. Every client tool's `availableIn` is
   `COPILOT_TOOL_VIEWS.<name>`, the registry's keys satisfy
   `Record<CopilotViewId, …>`, and `server/tests/copilot_catalogue_test.ts` pins
   the data to ruling 1. Identity parts: `opening_product` product and pair;
   `editing_slide_deck`, `deck_settings`, `deck_history` deck and pair;
   `editing_slide` deck, slide and pair; `editing_slide_figure` deck, slide,
   figure and pair; `editing_report`, `report_history` report and pair;
   `editing_report_figure` report, figure and pair; `results_file` results
   object and pair; `explore` pair; `package` run, and the pair while the
   package is ready; `viewing_package_figure` figure and pair; `data_page` page
   and family; `hfa_indicator_editor` indicator; every other view none. The pair
   part is run id, scope id and the scope's definition hash.

6. **Places hold the view they cover** _(proposed)_. `holdCopilotView()` in
   `components/instance/copilot/ai_views.ts`, called synchronously when a place
   mounts, captures `copilotViewController.current()` and restores it in the
   place's cleanup (`restoreCopilotView`, exhaustive over every view); Solid
   cleans a node's children before its own cleanups
   (`client/node_modules/solid-js/dist/solid.js:944-951`), so nested places
   unwind in order. A place sets its own view when its state is ready (after its
   load's await, for a place that loads) and never once unmounted. The Data
   switchboard's `openSubPage` (`components/data/data.tsx:87-92`) sets
   `data_page` with the page and family before it opens any page and restores
   the captured view when the page closes: one sync site for the switchboard's
   pages, the views a Data page opens keeping its `data_page`, the HFA
   indicators manager setting its own view on top. The figure editor sets the
   view its host names in a required `aiView` prop (`editing_slide_figure`,
   `editing_report_figure`, `viewing_package_figure`); deck settings, the
   version histories and the results file viewer set theirs from their props.
   `returnToContext` goes from every editor.

7. **A package view's context carries `getScope` and `getRunId`** _(proposed)_.
   `getScope()` returns the view's pair or throws `AIToolFailure` naming why
   there is none ("No results package is ready yet. An admin generates one under
   Results.", "This package is still generating.", "This package failed.", "This
   product no longer exists."); `getRunId()` returns the run the view shows, for
   Module internals.

8. **The inner-set key includes the instance's HFA time points** _(proposed)_.
   `packageToolsKey({ runId, scopeId, definitionHash, timePoints })`,
   `timePoints` being the label and period id of each round
   `hfaTimePointsForAI(instanceState.hfaTimePoints)` keeps (COPILOT02 ruling 9:
   the imported rounds, in order), so an import changes the key: the inner set
   lists each as `- <label> (period <periodId>)`
   (`lib/ai_tools/format_metrics_list_for_ai.ts:247-250`) and they are instance
   state outside the authoring context
   (`lib/types/run_authoring_context.ts:18-19`). `hfaCacheHash` is not the key
   part: it omits the period id (`server/db/instance/dataset_hfa.ts:34-44`),
   which `updateHfaTimePoint` changes on its own
   (`server/routes/instance/hfa_time_points.ts:110-117`).

9. **Module internals bind by run id** _(proposed)_. They resolve to an inner
   set built over the view's `getRunId()` alone, so a failed or generating
   package's script and log reads work.

10. **One source line for both surfaces** _(proposed)_. `formatSourceHeader`
    takes an optional scope label; `withSourceHeader` moves from
    `server/mcp/context_cache.ts:213-233` to `lib/ai_tools/source_header.ts`,
    takes the header as a function read at call time, and wraps `run`,
    `runWithView` and `runStructured`. `/mcp` passes "All data"; the chat
    applies it to every package-bound read, never to a write or a failure, and a
    Module internals read, bound by run id alone (ruling 9), names the package
    and no scope: a run's script, log and settings do not depend on the scope,
    and a generating or failed package has none.

11. **Refusals come from one table through one wrapper** _(proposed)_.
    `copilotToolRefusal` (ruling 5) decides from the tool's requirement, the
    user's live permissions and, where the requirement names it, the live level
    on the view's product; `tool_guard.ts` wraps each tool where the set is
    assembled and refuses with `AIToolFailure` before the handler or the
    approval's `propose` runs. Below edit level a product view's instructions
    say the user can only view.

12. **HFA ownership stays with S5** _(proposed)_. The HFA manager's write gate
    is one predicate, `canWriteHfaIndicators()` in
    `components/data/hfa/indicators/_shared/`, read by the manager's indicator
    write controls and the HFA write tools, so SYSTEM_05's open write-gate
    decision moves both (H32). The HFA guidance moves from that folder's
    `ai/system_prompt.ts` to `ai/instructions.ts` and reaches the
    `hfa_indicators` view through the context the manager supplies; the registry
    imports nothing from `components/data/`.

13. **The thread key without a Clerk user** _(proposed)_. Under
    `VITE_BYPASS_AUTH` there is no Clerk user
    (`components/instance/logged_in_wrapper.tsx:25-26, 98`); the key is then
    `copilot:dev`.

## 4. Steps

### Step 1: The chat's shell-level code moves to `components/instance/copilot/`

**Surface.**

- Moved with `git mv` to the root of `components/instance/copilot/`:
  `components/products/copilot/_shared/{ai_views.ts, build_system_prompt.ts, client_env.ts, client_info_topics.ts, interactions.ts, types.ts}`.
- Moved with `git mv` to the same relative path under
  `components/instance/copilot/`:
  `components/products/copilot/{ai_configs/defaults.ts, ai_configs/mod.ts, ai_debug_panel.tsx, chat_pane.tsx}`,
  `components/products/copilot/ai_documents/{ai_document_list.tsx, ai_document_selector_modal.tsx, ai_documents_store.ts, mod.ts}`,
  `components/products/copilot/ai_prompt_library/{mod.ts, parse_prompts.ts, prompt_library_modal.tsx, prompt_library_store.ts, save_to_prompt_library_modal.tsx, saveable_user_text_renderer.tsx, types.ts}`.
- Moved with `git mv` to `components/instance/copilot/tools/`:
  `components/products/copilot/ai_tools/tools/{modules.ts, format_for_ai/format_module_settings_for_ai.ts, format_for_ai/format_modules_list_for_ai.ts}`.
- New; deleted: `components/instance/copilot/{mod.ts, tools/mod.ts}`;
  `components/products/copilot/ai_tools/tools/format_for_ai/mod.ts`.
- Import lines only, unless the Deliverable names more:
  `components/products/copilot/{mod.ts, _shared/mod.ts, _shared/format_figure_config_for_ai.ts, copilot.tsx, build_tools.ts, save_report_style.tsx}`,
  `components/products/copilot/ai_tools/tools/{mod.ts, add_slide_to_deck.ts, draft_slide_preview.tsx, drafts.tsx, get_slide.ts, report_editor.ts, slide_editor.tsx, slides.tsx}`,
  `components/products/copilot/slide_ai/{extract_blocks_from_layout.ts, resolve_figure_from_metric.ts}`,
  `components/products/slide_deck/{slide_list.tsx, slide_deck.tsx, slide_editor/slide_editor.tsx}`,
  `components/products/report/{body_editor.tsx, report.tsx}`,
  `onboarding/{index.ts, catalogue.ts}`, the moved
  `components/instance/copilot/{chat_pane.tsx, ai_views.ts, types.ts}`.
- Comments and docs: `lib/ai_tools/mod.ts` (:1-3),
  `lib/ai_tools/build_system_prompt.ts` (:17-29, :376-377),
  `lib/ai_tools/info_catalog.ts` (:13), SYSTEM_13 (globs, links to moved files,
  the save-style sentence at :422-425), SYSTEM_08 (:319),
  `validate_protocols_baseline.json`.

**Deliverable.** Rulings 2 to 4 for these files. A moved file changes only its
import lines (and, in `chat_pane.tsx` and `ai_views.ts`, ruling 4), so
`git diff -M` reports a rename. `types.ts` drops its `SkippedRange` import from
`components/products/_shared/` (lint:structure's `shared-scope`) and types
`commit`'s result as
`Promise<{ skipped: { fromLine: number; toLine: number }[] }>`, the shape
`components/products/copilot/ai_tools/tools/report_editor.ts:62` writes.
`components/products/copilot/mod.ts` exports `ProductCopilotHost` and
`SaveReportStyleModal`; every importer of the registry, the controller or their
types reads `components/instance/copilot/mod.ts`;
`components/products/copilot/_shared/` keeps `content_validators.ts` and
`format_figure_config_for_ai.ts`. SYSTEM_13's globs gain
`client/src/components/instance/copilot/**`, its links follow the moves, and its
prose says where each half lives. The baseline entries for
`ai_documents_store.ts`, `prompt_library_modal.tsx` and
`save_to_prompt_library_modal.tsx` take the new `file`, same id and text: a move
is not a new hit (R9). The lints pass: no `entry-cycle` (ruling 3), two
consuming children (`ai_tools/`, `slide_ai/`) for each file left in
`components/products/copilot/_shared/`, no `unimported` file, and lint:systems
claims each moved file once (SYSTEM_14 claims `components/instance/` files one
by one).

**Not in this step.** Any behaviour change. `copilot.tsx` and `build_tools.ts`
stay in `components/products/copilot/` until step 7. **Gates.** The floor.
`git diff -M --stat <the commit before this step>..HEAD -- client/src` lists the
24 moved files as renames.
`git grep -n 'from "~/components/' -- client/src/components/instance/copilot | grep -v '"~/components/_shared/mod.ts"' | grep -v 'import type'`
prints nothing.
`git grep -n "products/copilot/mod.ts" -- client/src | grep -v "^client/src/components/products/"`
prints nothing. **Ends with.** One commit.

### Step 2: The catalogue in lib, pinned by tests; the source line names its scope

**Surface.** `lib/ai_tools/copilot_catalogue.ts` (new),
`lib/ai_tools/{source_header.ts, mod.ts}`, `server/mcp/context_cache.ts`,
`server/tests/copilot_catalogue_test.ts` (new),
`server/tests/mcp_tools_source_header_test.ts`, SYSTEM_13 (globs: the new test;
the source-header sentences at :116-125).

**Deliverable.** Ruling 5's module, exported through `lib/ai_tools/mod.ts`, with
no client reader yet. Ruling 10 on both sides of the seam: the line gains
`, scope "<label>"`; `withSourceHeader` lives in lib and wraps `run`,
`runWithView` and `runStructured` (D34); `/mcp`'s results read
`Source: results package "<label>" (generated <createdAt>), scope "All data"`.
`server/tests/copilot_catalogue_test.ts` holds these cases, each against data
written in the test from ruling 1's two tables: "the view ids are the
catalogue's views"; "each gated tool is admitted in exactly the views its
group's rows give"; "chat-wide tools carry no views"; "every tool belongs to
exactly one group"; "a view with no package admits no package tool"; "the
approval exemptions are exactly the direct-apply editor writes"; "refusals
follow the permission bits, the product level and the HFA write gate"; "an
identity changes with the entity, the pair and the definition hash, and with
nothing else"; "packageToolsKey separates run, scope, definition hash and time
points, and never collides across separators".
`server/tests/mcp_tools_source_header_test.ts` imports from lib and holds
"withSourceHeader: runStructured carries the Source line"; every case expects
the scope.

**Not in this step.** Any client change. **Gates.** The floor; `deno task test`
runs both files. **Ends with.** One commit.

### Step 3: Every place's view is declared; the gate knows identities; the digest follows the views

**Surface.**

- Code:
  `components/instance/copilot/{ai_views.ts, interactions.ts, build_system_prompt.ts, mod.ts, chat_pane.tsx}`,
  `components/products/copilot/copilot.tsx`,
  `components/products/copilot/ai_tools/tools/{slides.tsx, get_slide.ts, slide_editor.tsx, report_editor.ts, drafts.tsx}`,
  `components/products/slide_deck/{slide_deck.tsx, slide_editor/slide_editor.tsx}`,
  `components/products/report/report.tsx`.
- Docs: SYSTEM_13 (the view registry, interactions and sync sites, :317-362),
  SYSTEM_12 (the slide editor's copilot paragraph, :645-650).

**Deliverable.**

- The registry declares every view of ruling 1 (keys satisfy
  `Record<CopilotViewId, AnyAIView>`), each with a live label, its `identity`
  (E3) through `copilotViewIdentity`, its instructions, and its params and
  context types; package views carry ruling 7's `getScope` and `getRunId`. The
  four existing views keep their instruction text; every other view gets the
  instructions its ruling 1 row attaches, in the step that sets its view, and a
  view whose row attaches nothing, or only the page, which the view line already
  names, declares none. The registry's header comment describes the one registry
  (D83). The controller's fallback is `shell`, with `digestAcrossViews: true`
  (E6). Ruling 6's `holdCopilotView`; `restoreCopilotView` covers every view.
- The deck and report editors hold at mount and set `opening_product` (params:
  the product id; label: the product's name, read live; D47); the deck sets
  `editing_slide_deck` and the report `editing_report` once loaded; the slide
  editor holds the deck view. `returnToContext` goes
  (`slide_deck.tsx:61, 113-114, 526`, `report.tsx:207, 1490-1491`,
  `slide_editor.tsx:131, 744-746`; D46).
- Every product tool (deck, slide editor, report, draft) is built with the
  registry and `availableIn: COPILOT_TOOL_VIEWS.<name>`; the module tools
  declare theirs and the lib metric tools are bound with theirs in step 6
  (ruling 3, E5), the HFA tools in step 11.
- E6: the `edited_slide` and `product_updated` producers move from
  `copilot.tsx:190-217` into the deck and report editors, each for its own
  product, removed on cleanup; `copilot.tsx` keeps the log clear at mount, its
  comment and SYSTEM_13 saying what D72's change says. The interactions'
  `relevantIn` lists name ruling 1's ids and their header comment names these
  producers (D64). The pane's placeholder covers every view.
- D44's first half: E3 refuses a view-limited call planned before a move.

**Not in this step.** E7 (state, blocks). Sync sites beyond the product
editors'. New tools. **Gates.** The floor.
`git grep -n "availableIn:" -- client/src/components | grep -v "COPILOT_TOOL_VIEWS"`
prints nothing. The sync-site check (§0) for `opening_product` in
`slide_deck.tsx` and `report.tsx`, `editing_slide_deck` in `slide_deck.tsx`,
`editing_slide` in `slide_editor.tsx`, and `editing_report` in `report.tsx`.
**Ends with.** One or two commits, each green.

### Step 4: What the model is told (E7)

**Surface.**

- Code:
  `components/instance/copilot/{ai_views.ts, build_system_prompt.ts, mod.ts, chat_pane.tsx}`,
  `components/products/copilot/copilot.tsx`,
  `lib/ai_tools/build_system_prompt.ts`, `server/mcp/mcp_tools.ts`,
  `server/tests/copilot_prompt_test.ts` (new).
- Docs: SYSTEM_13 (principle 2's prompt sentences, :127-130; the system prompt
  section; the per-turn delivery paragraph; the FASTR paragraph, :462-489;
  globs).

**Deliverable.**

- The chat sets `appendOnlyTurns: true` (E7). Each view's live bits (entity ids,
  the slide selection, the report selection preview) move from its instructions
  into its `state`; instructions keep the static guidance.
- The chat's consumer blocks (`getEphemeralContext`) are the date block and the
  package block, which rides when its text is new (D53) and names the package
  and its generation time, the scope with one line per dataset family (excluded,
  unlimited, or its limits), the datasets, the HMIS and ICEH indicator lists and
  the calendar. Its text is a pure `buildPackageBlock` in
  `lib/ai_tools/build_system_prompt.ts` over the package's label and date, the
  scope's label (a string) and definition, and the authoring context's
  grounding; the family lines move there from
  `components/instance/copilot/build_system_prompt.ts:21-66`.
- The chat's system prompt is instance level (D55): country, terminology, data
  coverage, `ai_context`, reference docs, role, principles and interpretation;
  no package section, viewer sentence, date or `# Available Tools` (F04), and
  the app's role text, not one product's. `buildSystemPrompt` takes the date and
  the catalogue as options, which `server/mcp/mcp_tools.ts:93-114` passes, so
  `get_overview` keeps both. The comments at `copilot.tsx:171-173`,
  `components/instance/copilot/build_system_prompt.ts:73-77` and
  `lib/ai_tools/build_system_prompt.ts:25-29`, and SYSTEM_13:129-130, say what
  changes the prompt now (D67, D80).
- Below edit level a product view's instructions carry the level line ("the user
  can view this product but not change it"), read live (D48).
- `getEditingReportInstructions` drops `FASTR_MD_SYNTAX_DOC`
  (`lib/ai_tools/build_system_prompt.ts:716`) and points at `rewrite_report`'s
  description, which keeps it (D55). SYSTEM_13's FASTR paragraph says the brief
  rides in `rewrite_report`'s description alone.
- View system prompt shows the system prompt and the next message's blocks
  through `getNextTurnPreview()` in place of `_turnSectionParts()`
  (`chat_pane.tsx:343-370`; D60's first half).
- `server/tests/copilot_prompt_test.ts` cases: "the chat's system prompt carries
  no date and no tool catalogue", "buildSystemPrompt keeps the date and the
  catalogue when asked, as get_overview asks", "the FASTR editing instructions
  do not carry the syntax doc", "the package block names the package, the scope
  and each family's limits".

**Not in this step.** Moving the chat out of the product. **Gates.** The floor;
`deno task test` runs the new file. **Ends with.** One or two commits, each
green.

### Step 5: Tools refuse what the user cannot do; drafts remember their package; no chat text loads a remote image

**Surface.**

- Code: `components/instance/copilot/tool_guard.ts` (new),
  `components/instance/copilot/{mod.ts, ai_configs/defaults.ts, ai_prompt_library/saveable_user_text_renderer.tsx}`,
  `components/products/copilot/{build_tools.ts, copilot.tsx}`,
  `components/products/copilot/ai_tools/tools/{slides.tsx, drafts.tsx, draft_slide_preview.tsx, add_slide_to_deck.ts}`.
- Docs: SYSTEM_13 (the `builtInTools` bullet, :287-290; tools, gating and
  approval, :366-376; "A viewer's catalogue"; the Open item on `webFetch`),
  SYSTEM_12 (the level table, :195-198).

**Deliverable.**

- Every user gets the same tools: the level filter (`build_tools.ts:59-61`), its
  comment (`:31-32`; D82) and the level read (`copilot.tsx:154-156`) go, and
  ruling 11's wrapper refuses before the handler or `propose` (D48's second
  half, D49). SYSTEM_13's tools paragraph gives no tool count and says the deck
  writes go through the product routes (D66).
- The approval policy
  `{ requireForKind: "write", requireKind: true, exempt: COPILOT_APPROVAL_EXEMPT }`;
  HFA writes keep their modal approval and the five staged report tools their
  diff; `delete_slides` declares a modal approval (intent danger) whose preview
  lists the slides by title and whose commit deletes and marks the echo keys;
  `validateAIChatConfig` passes in DEV (D50).
- `DEFAULT_BUILTIN_TOOLS` is `{ webSearch: true }`; SYSTEM_13's `webFetch` Open
  item goes (D56).
- `SaveableUserTextRenderer` builds its instance with
  `createMarkdownIt({ images: false })` (E1) in place of the
  `md.disable("image")` COPILOT02 added (D97).
- E4: D63's change; a card stored without `view` renders under the current
  view's pair with no Add.

**Not in this step.** Binding per view (step 6). **Gates.** The floor.
`git grep -n "webFetch" -- client/src` prints nothing.
`git grep -n "COPILOT_APPROVAL_EXEMPT" -- client/src` shows the copilot's
`approvalPolicy`. **Ends with.** One or two commits, each green.

### Step 6: Package tools follow the view (E5)

**Surface.**

- Code: `components/instance/copilot/bind_package_tools.ts` (new),
  `components/instance/copilot/{mod.ts, ai_views.ts, client_env.ts, tools/modules.ts, tools/mod.ts}`,
  `components/products/copilot/{build_tools.ts, copilot.tsx}`,
  `lib/ai_tools/{tools_metrics.ts, env.ts, source_header.ts}`.
- Docs: SYSTEM_13 (principle 2, its SPA header sentence at :121-123 included;
  "Tools are built once per mount"; the traps), SYSTEM_08 (:314-327).

**Deliverable.** Under the product host, every package tool (ruling 1's Package
reads, Module internals, Deck, Slide editor, Drafts, Report and Figure editor
groups) becomes an outer tool. `bindPackageTools(buildInner)` makes the
templates by running the inner builder once over a throwing env and an empty
authoring context, as `server/mcp/mcp_tools.ts:47-64` does, and binds each with
`bindAIToolToView`; a call resolves the view's pair and runs the same-named tool
of the inner set built over `createCopilotAIToolEnv(pair)`, the pair's T2
authoring context and the HFA taxonomy with the rounds `hfaTimePointsForAI`
keeps (COPILOT02 step 8 calls it at `copilot.tsx:145-152`, which step 7
deletes), cached by `packageToolsKey` (ruling 8), so a reattach, rescope, scope
edit or time-point change binds at the next call. Module internals bind by run
id (ruling 9); a view whose `getScope` throws refuses with its reason; reads
carry the source line (ruling 10; D53); an inner set whose authoring-context
read fails refuses the call with the read's error and is retried at the next
call (D54). Each outer tool carries its views: the module tools declare
`COPILOT_TOOL_VIEWS.<name>` in the plain shape (ruling 3), which E5 keeps, and
the two metric tools, headless templates that `/mcp` shares, are bound with E5's
`{ availableIn: COPILOT_TOOL_VIEWS.<name> }`, so `getSharedToolsForMetrics` and
`/mcp` keep their shape. For ruling 9 the three Module internals leave
`getClientToolsForModules` for `getClientToolsForModuleInternals`, built over
`createModuleInternalsEnv(runId)` in `client_env.ts` (the run-keyed
`getModuleScript`, `getModuleLogs` and `getModuleSettings`, which
`createCopilotAIToolEnv` composes); `get_available_modules` stays with the
package reads. `build_tools.ts` becomes the inner builder over one pair, without
its level argument, and the chat registers the outer tools. A completion message
that read the template's catalogue becomes input-only (`tools_metrics.ts:41-44`;
B01, D79). The comments at `lib/ai_tools/env.ts:9-19` and
`lib/ai_tools/source_header.ts:1-8`, and SYSTEM_13:121-123, say what binds the
pair on each surface and that both add the source line (D78, D81).

**Not in this step.** The panel. **Gates.** The floor. **Ends with.** One
commit.

### Step 7: The chat moves to the shell

**Surface.**

- First, when the vendored copy predates GF: `panther/` (the sync), `deno.lock`
  (when the typecheck rewrites it).
- New; moved with `git mv` and rewritten; deleted:
  `components/instance/copilot/{panel.tsx, turn_guard.ts}`;
  `components/products/copilot/build_tools.ts` to
  `components/instance/copilot_tools.ts`;
  `components/products/copilot/copilot.tsx`.
- Edited: `components/instance/{instance.tsx, profile.tsx}`,
  `components/instance/copilot/{mod.ts, chat_pane.tsx, ai_debug_panel.tsx, build_system_prompt.ts}`,
  `components/products/{copilot/mod.ts, products.tsx, slide_deck/slide_list.tsx, report/report.tsx}`,
  `components/_shared/figure_editor/figure_editor.tsx`,
  `state/products/t4_ai_documents.ts` (:3-7).
- Docs: `SYSTEMS.md` (the S13 row), SYSTEM_13 (globs:
  `client/src/components/instance/copilot_tools.ts`; the opening paragraph,
  :25-27; "The client copilot"), SYSTEM_14 (the shell paragraph, :182-205; UI
  preferences, :255-279), SYSTEM_12 (`openProduct`, the deck and report
  headers), SYSTEM_11 (the figure editor header), SYSTEM_15 (the self-profile,
  :305).

**Deliverable.**

- Before any other change, when GF's commit
  (`git -C <panther> log --format=%H -S'Next step: Do 2' -- PLAN_FRAME_PANELS.md | tail -1`)
  is not an ancestor of `<pantherGitCommit>`: from `<panther>`, on a clean
  `main` whose `deno task typecheck` passes,
  `./sync wb-fastr-v2 --force --no-commit`, once `git status --porcelain` here
  lists no tracked change and no untracked path under `panther/`, `client/`,
  `server/` or `lib/`, and `panther/` here is tracked files, not a submodule;
  else the step stops, §8 saying why. `--force` skips the dependency gate, which
  this step's typecheck replaces, and the clean-tree check, which refuses any
  untracked file (panther `cli/main.ts:78-94`, `cli/git.ts:53-61`); then one
  green commit here staging only `panther/` and a rewritten `deno.lock` (R5).
- §2.2: the panel, with no `onToggleShow` (D62), and the opener
  (`id="copilot-opener"`) in `instance.tsx`; `CopilotPanel` in `panel.tsx` with
  the per-user thread and settings scope (D52), the log clear at mount (D53),
  the stop at unmount (D44's second half), the pane's instance passed to
  `AIChat` as `chat` (E2; C07), `crossTabTurns: true` (E8; C27), the
  instance-level system prompt, the consumer blocks from the view's pair and its
  T2 authoring context, the approval policy and `validateAIChatConfig` in DEV.
- `copilot_tools.ts` assembles the one set (§2.3): the outer package tools over
  the inner builder, the reference tools with `SPA_INFO_TOPICS`, one
  `ask_user_questions`, all through ruling 11's wrapper.
- `openProduct` opens `PRODUCT_TYPE_REGISTRY[type].editor` directly, and the
  host's spinner goes with the host (D54).
- The deck header's, report header's and figure editor's AI buttons go
  (`slide_list.tsx:661-670`, `report.tsx:2548-2558`,
  `figure_editor.tsx:829-837`; D45's opener).
- `turn_guard.ts` holds whether a turn runs (set by the pane) and the question
  the reload guards ask; the language menu (`instance.tsx:326-358`) and the
  profile's Clear data cache, Clear AI chat history, Sign out and Change email
  ask it first (A07, A08).
- View AI tool output shows `get_available_metrics`' text for the current view's
  package and is hidden in a view with none (D60's second half).
- SYSTEM_13's opening paragraph and "The client copilot" describe the one chat:
  no tool count (D66) and no explorer that mounts its own (D70).

**Not in this step.** Sync sites outside the product editors. The tours.
**Gates.** The floor. `git grep -n "ProductCopilotHost" -- client/src` prints
nothing. `git grep -n "setShowAi(true)" -- client/src` shows the opener in
`instance.tsx` and the HFA manager's own signal (`manager.tsx:66`), which step
11 removes.
`git grep -c "createAskUserQuestionsTool()" -- client/src/components/instance`
prints `client/src/components/instance/copilot_tools.ts:1`. A sync commit, if
made, lists only `panther/` paths and `deno.lock` in `git show --stat`. **Ends
with.** The sync commit when the vendored copy predates GF's commit, then one or
two commits, each green.

### Step 8: Results and Explore are views

**Surface.**

- Code: `components/explore/{explore.tsx, module_view.tsx, view_frame.tsx}`,
  `state/t4_explore.ts`,
  `components/results_packages/{results_packages.tsx, package_page.tsx, module_defaults.tsx}`,
  `components/scopes/scopes.tsx`,
  `components/instance/copilot/{ai_views.ts, build_system_prompt.ts}`.
- Docs: SYSTEM_08 (:112-120, the package page), SYSTEM_11 (the Explore page,
  :207-229), SYSTEM_15 (the Scopes page), SYSTEM_13.

**Deliverable.** Sync sites for `explore`, `results_packages`, `package`,
`module_defaults` and `scopes`, each holding at mount. `explore`'s state names
the resolved family, module, view, type and its settings, read live from where
they resolve, and its `getScope` is the resolved pair or ruling 7's no-package
reason. `package`'s state names status, failure stage and error, progress and
the open module; its pair is the page's package at the page scope; the page sets
the view again when the status changes. `results_packages`' state names the
pinned package and counts by status. SYSTEM_13:104-106 states ruling 1's
narrowing for the `package` and `explore` blocks (H25); SYSTEM_11 no longer says
Explore has no copilot.

**Not in this step.** The package figure viewer's view (step 10). **Gates.** The
floor. The sync-site check (§0) for `explore` in `explore.tsx`,
`results_packages` in `results_packages.tsx`, `package` in `package_page.tsx`,
`module_defaults` in `module_defaults.tsx`, and `scopes` in `scopes.tsx`. **Ends
with.** One commit.

### Step 9: Products, Data, Assets and Users are views; `list_products`; the tours key on views

**Surface.**

- Code: `components/products/products.tsx`,
  `components/products/copilot/{mod.ts, ai_tools/tools/products.ts (new), ai_tools/tools/mod.ts}`,
  `lib/ai_tools/format_products_list_for_ai.ts` (new), `lib/ai_tools/mod.ts`,
  `server/tests/format_products_list_for_ai_test.ts` (new),
  `components/instance/copilot_tools.ts`,
  `components/instance/copilot/{ai_views.ts, build_system_prompt.ts}`,
  `components/{data/data.tsx, assets/assets.tsx, users/users.tsx, users/user.tsx}`,
  `onboarding/{index.ts, catalogue.ts, tours.ts}`.
- Docs: SYSTEM_04, SYSTEM_06 (the switchboard), SYSTEM_12 (the Products page),
  SYSTEM_14 (the tours' pages, :33-42; its Open item on tour pages), SYSTEM_15
  (Users and the user detail), SYSTEM_13 (globs: the new test; "There is no
  product registry", :372-376).

**Deliverable.**

- Sync sites for `products`, `data`, `data_page` (ruling 6, in `openSubPage`,
  with page ids `registry_configuration`, `facilities`, `geojson_maps`,
  `admin_area_labels`, `hmis_indicators`, `hmis_data`, `population`,
  `hfa_time_points`, `hfa_weights`, `hfa_indicators`, `hfa_data`, `iceh_data`),
  `assets`, `users` and `user`. `data`'s state is each row's label and status,
  never its summary; `data_page`'s instructions name its page and, on a family's
  page, the family; `user`'s label names the page, never the email.
- `list_products` (Products group; H06): every product in T1 with name, type,
  folder path, package label, scope label and the user's level, formatted by the
  pure `formatProductsListForAI`, registered in `copilot_tools.ts` beside the
  chat-wide tools. `server/tests/format_products_list_for_ai_test.ts` cases: "a
  product row names its folder path, package, scope and level", "a product on a
  package that is no longer ready names its run id".
- The tours (D61): `pages` keys `products`, `instance-data`,
  `instance-results-packages`, `instance-assets` and `instance-users` on the
  views `products`, `data`, `results_packages`, `assets` and `users`;
  `isEditingView` (`catalogue.ts:63-64`) goes; the report intro tour's AI step
  targets `#copilot-opener` (`tours.ts:604-622`); SYSTEM_14's Open item on tour
  pages goes.

**Not in this step.** Views inside products. **Gates.** The floor;
`deno task test` runs the new file. The sync-site check (§0) for `products` in
`products.tsx`, `data` and `data_page` in `data.tsx`, `assets` in `assets.tsx`,
`users` in `users.tsx`, and `user` in `user.tsx`.
`git grep -n "isEditingView" -- client/src` prints nothing. **Ends with.** One
or two commits, each green.

### Step 10: Views inside products; the figure editor tools

**Surface.**

- Code:
  `components/products/slide_deck/{settings.tsx, slide_deck.tsx, slide_editor/slide_editor.tsx}`,
  `components/products/report/report.tsx`,
  `components/products/_shared/version_history/version_history.tsx`,
  `components/results_packages/package_view/visualizations.tsx`,
  `components/_shared/figure_editor/{visualization_editor.tsx, figure_editor.tsx, view_results_object.tsx}`,
  `components/products/copilot/{mod.ts, ai_tools/tools/figure_editor.ts (new), ai_tools/tools/mod.ts}`,
  `components/instance/copilot_tools.ts`,
  `components/instance/copilot/{ai_views.ts, build_system_prompt.ts}`.
- Docs: SYSTEM_11 (the figure editor; its Open item on the three pair comments),
  SYSTEM_12 (deck settings, the editors), SYSTEM_16 (version history), SYSTEM_08
  (the default visualization viewer), SYSTEM_13.

**Deliverable.**

- Ruling 6 for the nested editors (D46): `SlideDeckSettings` (given the deck id)
  sets `deck_settings`; `VersionHistoryEditor` sets `deck_history` or
  `report_history` by its `kind`; `VisualizationEditor` takes the required
  `aiView` and sets the figure view it names, with a context exposing its pair,
  its metric and its draft config live (read and apply), and instructions naming
  the figure it edits or shows by its metric label (the `label` prop);
  `ViewResultsObject` sets `results_file` from its props, with instructions
  naming the module and the results object it shows (`moduleId`,
  `resultsObjectId`).
- `get_figure_editor` and `update_figure_editor` in
  `components/products/copilot/ai_tools/tools/figure_editor.ts`, built by the
  inner builder: the read formats the draft with `formatFigureConfigForAI`; the
  write runs `update_figure`'s validate-before-commit pipeline on the draft and
  applies it through the context (D45).
- The comments at `figure_editor.tsx:103-104, 124-125` and
  `visualization_editor.tsx:65-66` say the pair is fixed for the editor's life,
  which the figure views' identity needs; SYSTEM_11's Open item on them goes.

**Not in this step.** The HFA views. **Gates.** The floor. The sync-site check
(§0) for `deck_settings` in `settings.tsx`, `deck_history` and `report_history`
in `version_history.tsx`, `editing_slide_figure` in `slide_editor.tsx`,
`editing_report_figure` in `report.tsx`, `viewing_package_figure` in
`visualizations.tsx`, and `results_file` in `view_results_object.tsx`. **Ends
with.** One or two commits, each green.

### Step 11: HFA joins the chat

**Surface.**

- New; moved with `git mv`; deleted:
  `components/data/hfa/indicators/{ai/editor_tools.ts, _shared/write_gate.ts}`;
  `components/data/hfa/indicators/ai/system_prompt.ts` to
  `components/data/hfa/indicators/ai/instructions.ts`;
  `components/data/hfa/indicators/ai/{wrapper.tsx, chat_pane.tsx, sdk_client.ts}`,
  `server/routes/instance/ai_proxy.ts`.
- Edited:
  `components/data/hfa/indicators/{ai/tools.ts, ai/mod.ts, manager.tsx, indicator_code_editor.tsx, xlsx_upload_form.tsx, _shared/mod.ts}`,
  `components/instance/{copilot_tools.ts, copilot/ai_views.ts}`, `main.ts` (:44,
  :176), `server/routes/anthropic_messages_proxy.ts` (:17-21).
- Docs: SYSTEM_13 (globs; the boundaries paragraph, :43-48; the proxies section
  and table, :149-159; "The HFA satellite"; Open items), SYSTEM_05 (the
  Permissions bullet, :1077-1085; the write-gate Open item), SYSTEM_01 (:275),
  `PROTOCOL_APP_AI_TOOLS.md` (:3-4).

**Deliverable.**

- The HFA tools join the set: they type against the one registry with
  `availableIn: COPILOT_TOOL_VIEWS.<name>` (D57) and refuse through ruling 11's
  wrapper, the HFA write gate being `canWriteHfaIndicators()` (ruling 12), which
  the manager's indicator write controls also read (`manager.tsx:1073-1085`,
  `:1139-1141`, `:1170-1201`); every HFA route keeps its own guard.
  `tools.ts:1097`'s `ask_user_questions` goes (B47).
- Sync sites: the manager holds and sets `hfa_indicators` (state: the open tab;
  instructions from `instructions.ts` through its context, without the
  hand-written tool list at `system_prompt.ts:36-40` or the diff promise at
  `:46`; D59); the code editor's inner component, where its store lives, sets
  `hfa_indicator_editor` (state: the open indicator and round; context: the
  unsaved state, read and apply); the Excel import sets `hfa_indicator_import`.
- `get_hfa_indicator_editor` and `update_hfa_indicator_editor` in
  `editor_tools.ts`: the read returns the open editor's unsaved fields and live
  validation; the write sets labels, categories, type, aggregation and per-round
  code in the editor's store and marks it unsaved, for the user to save (D51).
- The manager's `showAi` signal, its wrapper and its three AI buttons go
  (`manager.tsx:65-66, 1088, 1101-1110`, `indicator_code_editor.tsx:181-190`,
  `xlsx_upload_form.tsx:134-143`, and their `showAi`/`openAi` props), with the
  wrapper's `onToggleShow` (D62), its empty conversation per visitor (D58) and
  its 4,096-token cap (D59).
- `/ai-instance` goes: the route file, its mount and import in `main.ts`, and
  the two-mounts sentence in the proxy handler's comment (H07); SYSTEM_13's
  proxies section cites the remaining mounts' `main.ts` lines (D68).
- SYSTEM_13's HFA Open items: item 1 states what remains (no diff, a create
  preview without code or categories, a delete preview of ids only; D75), item 3
  loses the hardcoded `max_tokens`, item 6 goes (D76), and the hygiene item on
  the HFA SDK client's duplicated 429 wrapper goes.

**Not in this step.** HFA taxonomy or variant tools. **Gates.** The floor.
`git grep -n "ai-instance\|routesInstanceAiProxy\|HfaIndicatorAiWrapper\|createHfaIndicatorAiSDKClient\|HfaIndicatorChatPane" -- . ':!panther' ':!PLAN_*.md'`
prints nothing. `git grep -c "createAskUserQuestionsTool()" -- client/src`
prints `client/src/components/instance/copilot_tools.ts:1` alone. The sync-site
check (§0) for `hfa_indicators` in `manager.tsx`, `hfa_indicator_editor` in
`indicator_code_editor.tsx`, and `hfa_indicator_import` in
`xlsx_upload_form.tsx`. **Ends with.** One or two commits, each green.

## 5. Gates catalogue

| Gate                                                                                                         | First reached |
| ------------------------------------------------------------------------------------------------------------ | ------------- |
| The floor (PROTOCOL_APP_PLANS)                                                                               | Step 1        |
| `./validate_protocols`: no new tier-2 flag, no stale-baseline note; baseline changes only by step 1          | Step 1        |
| `components/instance/copilot/` imports nothing at runtime from `components/` but `components/_shared/mod.ts` | Step 1        |
| `server/tests/copilot_catalogue_test.ts`                                                                     | Step 2        |
| `server/tests/mcp_tools_source_header_test.ts` with the scope                                                | Step 2        |
| Every client `availableIn` reads `COPILOT_TOOL_VIEWS`                                                        | Step 3        |
| `server/tests/copilot_prompt_test.ts`                                                                        | Step 4        |
| No web fetch; the approval policy reads `COPILOT_APPROVAL_EXEMPT`                                            | Step 5        |
| No `ProductCopilotHost`; one `ask_user_questions`; a sync commit holds only `panther/` and `deno.lock`       | Step 7        |
| `server/tests/format_products_list_for_ai_test.ts`                                                           | Step 9        |
| Every view of ruling 1 but `shell` has a sync site                                                           | Step 11       |
| No `/ai-instance` and no HFA chat                                                                            | Step 11       |

## 6. Out of scope

Named so it is not reopened:

- The fixes of PLAN_COPILOT02_FIXES (G2): the companion's D01 to D33, D35 to
  D43, D97 and its D.3 rows marked 02.
- The engine (PLAN_COPILOT01_ENGINE, G1) and the frames (PLAN_FRAME_PANELS step
  1, GF). Deleting the opt-in fields and the latest-turn render
  (PLAN_COPILOT04).
- The proposal's findings outside the AI (deck rename reverted, the Indicators
  rows for view-only users, HMIS re-imports, configure without view, limiting
  scopes on the package page and Explore, the GeoJSON editor's Cancel, the Users
  tab's gates, Escape in dialogs, the help request's context, HMIS selection
  reset): not in this program.
- PLAN_REFERENCE_DOCS_ONE_PAIR: the three reference tools stay as they are.
- PLAN_BUG_FIXES's onboarding fixes; step 9 edits the same `pages` map and keeps
  whatever that plan has landed.
- A navigation tool or any AI-driven move; product management from chat (create,
  rename, move, reattach, rescope, share, delete); cross-product writes.
- Re-scoping, migrating or deleting the old threads and settings keys.
- Moving `client/src/state/products/t4_ai_documents.ts` out of
  `state/products/`.
- HFA taxonomy and variant-group tools; a server-side model allowlist; usage
  telemetry per view; compaction; a new default model; hard per-view tool sets.
- `/mcp` gains no view and no tool.

## 7. Rollout and rollback

Everything lands on `version2`. Every step ends green with the app working, so
`version2` may be deployed at any step boundary, PLAN_PRODUCTS_RESTRUCTURE step
11's redeploys to the three v2 testing instances included. Between steps the
chat is partial: per product with the new views, refusals and wire until step 7,
then beside the shell, the other views arriving in steps 8 to 11 and the HFA
assistant its own chat until step 11. The fleet receives the plan with
PLAN_PRODUCTS_RESTRUCTURE step 13; COPILOT04 starts once `main` carries this
plan's last commit (GM).

From the deploy carrying step 7, the `copilot:<productId>` scopes (in
`ai-conv-list`, with their `ai-conv/<id>` records and
`ai-conv-last-active-<scope>` keys) stay unlisted and
`panther-ai-settings-copilot` unread, so a user's first chat starts on panther's
default model and max tokens; from the deploy carrying step 11, so does
`hfa-indicators` (its settings key is never written, A52). Clear AI chat history
removes old and new together.

Rollback is the image of an earlier step boundary; no step writes a migration or
a server-side record. An image before step 11 restores `/ai-instance` and the
HFA chat; one before step 7 lists `copilot:<productId>` and reads
`panther-ai-settings-copilot` again, while what `copilot:<Clerk user id>` holds
stays in the browser, unlisted, until a later image. Records stay within
panther's conversation format 2, whose fields COPILOT01 added (`prefixHash`,
`revision`, a card's `view`) an earlier engine ignores (COPILOT01's rollout).

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date | Step | Row |
| ---- | ---- | --- |
