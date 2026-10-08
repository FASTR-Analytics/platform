# PLAN: Assistant surfaces

Status: open.

The AI panel becomes ever-present and the assistant's brain stays local. One
panel at the shell level hosts whichever chat instance the current context owns:
today's product copilot while a deck or report is open, a read-only instance
assistant on every other page, and the HFA indicator assistant inside its
manager. A context change swaps the instance, never the thread, so no chat
instance ever holds tools, a prompt or a conversation about a context it is not
in. Before any of that is built, a review settles the catalogue: every view a
user can be in, every AI tool that exists on the three surfaces, and which tools
are available in which view. The proposed catalogue is presented to Tim in the
chat and signed off in §3 before step 2 starts.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 5 deletes this
file and its companion `PLAN_ASSISTANT_SURFACES_CATALOGUE.md`.

Branch: `version2`. Repos touched: this app only; panther is not changed. Read
first: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_14_client_shell.md`, "The Explore page" in `SYSTEM_11_viz_authoring.md`,
`PROTOCOL_APP_AI_TOOLS.md`, `panther/protocols/PROTOCOL_UI_AI_CHAT.md`.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. The app's floor, conditional gates
and section numbers are `PROTOCOL_APP_PLANS.md`. This plan binds them as
follows.

- Instruction: "Do the next step of PLAN_ASSISTANT_SURFACES.md."
- Branch: `version2`. PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides
  it, as PLAN_PRODUCT_OWNERSHIP did, because the product plane lives on
  `version2` until PLAN_PRODUCTS_RESTRUCTURE step 13 merges it into `main`.
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them. Step 5 touches
  a migration and the base schema, so it also passes `./validate_migrations` and
  `./validate_fresh_boot`.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, §8,
  and, from step 2 on, the signed catalogue in
  `PLAN_ASSISTANT_SURFACES_CATALOGUE.md`.

Rules peculiar to this plan:

- **Step 1 is a review, not code.** Its deliverable is the companion file
  `PLAN_ASSISTANT_SURFACES_CATALOGUE.md`: the inventory of views and tools, the
  defects found, and the proposed catalogue. Review 1 checks that document
  against the code the way a code review checks a diff: every row is read
  against the file and line it cites.
- **The catalogue is signed off before any code.** `Do 2` starts only when §3
  holds the ruling `RS` in Tim's words, with a date, and the companion file's
  catalogue section is headed "Signed". A session that finds `RS` absent stops
  and says so. Sessions never write `RS`; only Tim does.
- **The proposal is presented in the chat.** The Do 1 session's final message
  lays out the proposed catalogue (contexts, instances, views, the tools per
  view) and the questions it raises, so the discussion happens there. Tim never
  opens the companion file to find a question.
- **Sign-off may change the plan.** If the signed catalogue differs from the
  working catalogue in §2.4, Tim amends §2.4, §3 and the step sections at
  sign-off, before `Do 2`, and §8 records that he did. Sessions never make those
  edits.
- Vocabulary: **surface** = a page or editor an assistant instance can be
  mounted beside; **context** = the thing an instance is attached to, one of
  `product`, `instance` and `hfa_indicators`; **instance** = one
  `AIChatProvider` with its tools, system prompt and thread scope; **view** = a
  panther view id inside one instance's registry; **catalogue** = the table of
  contexts, instances, views and the tools available in each view; **panel** =
  the shell-level `FrameRightResizable` that shows the current instance;
  **pair** = a results package and a scope, `(runId, scopeId)`; **hand-off** =
  the one-line note the instance assistant can leave for a product's copilot.

---

## 1. The problem

Facts as of 2026-10-08, HEAD `d75ea3801`.

- **The copilot exists only inside a product editor.** `openProduct` is the one
  mount site and it opens `ProductCopilotHost` as a full-page view
  (`client/src/components/products/products.tsx:96-101`); the host renders its
  own `FrameRightResizable` around the editor
  (`client/src/components/products/copilot/copilot.tsx:106`). The shell's tab
  switch mounts no assistant on Products, Explore, Results, Data, Assets or
  Users (`client/src/components/instance/instance.tsx:435-468`;
  `SYSTEM_13_ai_assistant.md:263`), and the Explore page states it has no
  copilot (`SYSTEM_11_viz_authoring.md:228`).
- **Every deep page covers the shell.** `ShellEditorWrapper` wraps header, rail
  and tab page (`client/src/state/t4_ui.ts:26-42`; `instance.tsx:410`), and a
  view opened through `openShellEditor` renders as an `absolute inset-0 z-10`
  overlay inside that wrapper
  (`panther/_303_components/special_state/generic_editor_wrapper.tsx:60`). A
  panel that must stay beside every page and every editor has to sit outside the
  wrapper.
- **The HFA indicator assistant is a second, isolated surface**: own scope
  `hfa-indicators`, own proxy, approval on every write, no view registry
  (`client/src/components/data/hfa/indicators/ai/wrapper.tsx:34-36`), mounted by
  the manager with its own `showAi` signal (`manager.tsx:1088`, button at
  `:1101`, global admins only).
- **The tool catalogue was never reviewed as a whole after D15.** The product
  copilot registers 33 tools built once per mount
  (`client/src/components/products/copilot/build_tools.ts`), gated by a
  four-view registry (`_shared/ai_views.ts:107`, controller at `:170`): one
  fallback and three editing views. The figure editor that opens inside the
  slide editor and the report editor has no view of its own, although it has an
  AI button
  (`client/src/components/_shared/figure_editor/figure_editor.tsx:829`). Every
  deck-level tool is available in the slide view. The plan of record disagrees
  with itself about Explore: D6 and §8 of PLAN_PRODUCTS_RESTRUCTURE speak of
  "the copilot's `viewing_explore` view" (`:345`, `:2083`) while D15 says the
  results explorer "mounts its own copilot with its own tools" (`:649`).
- **One AI button is dead.** The figure editor's button is gated only on
  `!showAi()` (`figure_editor.tsx:829-836`), so it also renders in the Results
  tab's view-only package view
  (`client/src/components/results_packages/package_view/visualizations.tsx:42-49`),
  where nothing reads `showAi`.
- **Two bits of residue.** `lib/ai_tools/env.ts:13-15` still says the SPA reads
  its pair per call, which D15 made false. The FASTR Markdown syntax doc (14,612
  bytes) rides `rewrite_report`'s cached description
  (`client/src/components/products/copilot/ai_tools/tools/report_editor.ts:557`)
  and again, uncached, on every turn of a FASTR report through the
  `editing_report` view instructions
  (`lib/ai_tools/build_system_prompt.ts:716`).
- **Usage telemetry cannot see surfaces.** `ai_usage_logs` records email, model
  and four token counts per request (`server/db/instance/ai_usage_logs.ts:37`);
  migration 202 dropped `project_id`
  (`server/db/migrations/instance/202_drop_project_layer.sql:35`). Nothing says
  which surface or which product a request served.

Why the shape in §2 and not one assistant whose context follows the user,
decided in the review of 2026-10-08 (Tim, with the evidence below):

- The app built the following design once, as step 8 of the restructure (commit
  `4cd224f40`), and the next day's review (`d96325175`) backed it out: its
  call-time scope resolver, reconcile-in-place store, per-result source header
  and draft re-resolve existed only because one conversation spanned packages,
  and Tim re-ruled D15 to one copilot per open product.
- The engine fixes a chat's tools and its thread scope at construction:
  `config.tools` is registered once
  (`panther/_305_ai/_components/_create_ai_chat.ts:262-267`) and the
  conversations manager takes a static scope when the provider mounts
  (`panther/_305_ai/context.tsx:21-23`). Every registered tool is sent on every
  request; gating refuses execution only. Anthropic's prompt cache is a prefix
  in the order tools, system, messages, and `claude-sonnet-5` has no
  mid-conversation tool or system channel, so re-keying tools or the system
  prompt per context cold-starts the whole prefix on every switch (measured
  135,359 bytes, about 59K tokens).
- The product-local design keeps the one property worth most to this app: a
  wrong-product or wrong-package action is impossible by construction, because a
  chat instance only ever knows one context. The ever-present panel is a shell
  change; it does not touch that property.

---

## 2. The model

### 2.1 The panel

One `FrameRightResizable` at the shell, wrapping `ShellEditorWrapper` in
`instance.tsx`, toggled by the existing global `showAi` (`t4_ui.ts:169`) and by
a new AI button in the header cluster. The editor overlay covers only the
wrapper's own box, so the panel stays beside every tab and every full-page view.
A hidden panel keeps its children mounted (`display: none`,
`panther/_303_components/layout/frames.tsx:386`), so opening and closing the
panel never remounts a chat instance. The editor-local AI buttons (deck rail,
report header, figure editor) keep calling `setShowAi(true)`.

### 2.2 Contexts and instances

The panel shows exactly one instance, chosen by the context:

| Context          | When                                                              | Instance                                                                                                                                        | Thread scope                  |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `product`        | a deck or report editor is open                                   | today's `ProductCopilot`, unchanged: env, tools, prompt and level fixed per mount, keyed on the product's resolved pair (`copilot.tsx:139-223`) | `copilot:<productId>`         |
| `hfa_indicators` | the HFA indicator manager is open and the user is a global admin  | today's HFA assistant, unchanged (`wrapper.tsx:28-37`), rendered in the shell panel instead of its own frame                                    | `hfa-indicators`              |
| `instance`       | everything else: the six tabs, the package page, every other page | the instance assistant (§2.4): read-only, no view registry, bound to one explicit pair                                                          | `assistant:<runId>:<scopeId>` |

Persisted chat settings (model, max tokens) stay shared by the product and
instance assistants under `settingsScope: "copilot"`; the HFA assistant keeps
its own.

### 2.3 The context signal

A T4 accessor, `assistantContext`, in a new `client/src/state/t4_assistant.ts`.
Three publishers, each publishing at mount and unpublishing in the `onCleanup`
it already has: `ProductCopilotHost` publishes `{ kind: "product", productId }`,
the HFA manager publishes `{ kind: "hfa_indicators" }`, and the package page
publishes `{ kind: "instance", pair }` so the assistant beside it reads the
package the page shows. Everything else publishes nothing and gets `instance`. A
forgotten publisher therefore degrades to the read-only assistant beside an
editor, never to an editor assistant pointed at the wrong product. The
derivation from the published context and the user's flags is a pure function in
`lib/`, tested under `deno task test`.

### 2.4 The catalogue (working hypothesis; step 1 replaces it, `RS` signs it)

What step 1 must settle, context by context. Tim's candidate list is the
starting point: instance (everything non-product), report, report visualization
editor, slide deck, specific slide, slide visualization editor.

| Context           | Views (today)                                            | Candidates for step 1                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instance`        | none (no registry)                                       | one instance with a per-send location line (tab, Explore family, module, view); or sub-contexts where the pair differs (Explore's selection vs the package page's package); which reads it offers; whether `switch_tab` and `open_product` are worth having |
| `product`, deck   | `opening_product`, `editing_slide_deck`, `editing_slide` | a `editing_slide_figure` view for the figure editor open inside a slide (live config as context, the v1 `editing_visualization` shape); which deck-level tools stay available inside a slide                                                                |
| `product`, report | `opening_product`, `editing_report`                      | a `editing_report_figure` view for the figure editor open inside a report; whether `get_report_pages` and the staged text tools stay as they are                                                                                                            |
| `hfa_indicators`  | none (no registry)                                       | unchanged, or a view-less catalogue trimmed by the review                                                                                                                                                                                                   |

The tools the review inventories, by surface. Product copilot (33):
`get_available_metrics`, `get_metric_data`, `get_available_modules`,
`get_module_r_script`, `get_module_log`, `get_module_settings`,
`get_methodology_docs_list`, `get_methodology_doc_content`, `get_info`,
`get_deck`, `get_slide`, `create_slide`, `delete_slides`, `duplicate_slides`,
`move_slides`, `replace_slide`, `update_slide_content`, `modify_slide_layout`,
`update_slide_header`, `update_figure`, `get_slide_editor`,
`update_slide_editor`, `get_report_editor`, `get_report_figure`,
`get_report_pages`, `rewrite_report`, `rewrite_section`, `replace_text`,
`insert_figure`, `replace_figure`, `update_report_figure`,
`show_draft_slide_to_user`, `ask_user_questions`. HFA assistant (12):
`get_hfa_indicators`, `get_hfa_taxonomy`, `get_hfa_variable_dictionary`,
`inspect_hfa_variable`, `get_hfa_indicator_code`, `validate_hfa_indicators`,
`update_hfa_indicator_labels`, `assign_hfa_indicator_categories`,
`set_hfa_indicator_code`, `create_hfa_indicators`, `delete_hfa_indicators`,
`ask_user_questions`. Headless `/mcp` (6): `get_overview`,
`get_available_metrics`, `get_metric_data`, `get_methodology_docs_list`,
`get_methodology_doc_content`, `get_info`.

The instance assistant's working tool set, read-only by ruling R5: the five
shared reads (`lib/ai_tools`), the four module-internals reads, `list_products`
(every visible product with id, type, label, folder path, package label, scope
label and the caller's level), `open_product`, `switch_tab`, `get_context`, and
`ask_user_questions`. Its pair is the Explore selection, one signal shared with
the Explore page, shown in the pane header; the package page overrides it while
open. A restricted user gets it without the package and module reads, the
posture `/mcp` takes.

### 2.5 The hand-off

`open_product` may carry a one-line note. The product copilot's pane shows it as
a banner with Send and Dismiss; Send calls `sendMessage` on the product thread,
the path the prompt library already uses. Nothing is sent without the click, and
only text crosses.

### 2.6 What never crosses a context

Threads, tools, the system prompt, live editor state, the interaction log and
echo marks. A context change disposes the outgoing instance; a turn in flight
completes into its own conversation store and persists (instance disposal is
inert, `panther/_305_ai/_core/conversation_store.ts:19-21`; there is no
`onCleanup` in `_create_ai_chat.ts`), so the reply is there when that context is
reopened. The panel closes on a context change (R3); reopening shows a header
naming the context and that context's own thread list, empty on a first visit.

### 2.7 Telemetry

`ai_usage_logs` gains `surface` (`copilot`, `instance`, `hfa`) and `context_id`
(the product id, the pair, or null), sent by the SDK clients as request headers
and read by the shared proxy handler. The product-switch rate, unmeasurable
today, becomes a query.

---

## 3. Rulings

- **R1. Ever-present panel, product-local brain** (Tim, 2026-10-08). One panel
  at the shell; the instance it shows is owned by the current context; a context
  change swaps the instance.
- **R2. No thread spans contexts** (Tim, 2026-10-08). A conversation holds one
  product, or one pair, or the HFA manager. The hand-off note is the only
  bridge, and the user sends it.
- **R3. The switch is loud** _(proposed)_. The panel closes on a context change;
  reopened, it shows a header that names the context ("Deck B assistant",
  "Explore assistant: package X at scope Y", "HFA indicators") and that
  context's thread list. A first visit shows an empty-state card saying where
  the previous conversation is.
- **R4. Review before code** (Tim). Step 1 is the inventory and the proposed
  catalogue; `Do 2` is blocked until `RS` exists.
- **R5. The instance assistant writes nothing** _(proposed)_. No `kind: "write"`
  tool and no `approval` on that surface; a boot-time assertion and
  `approvalPolicy: { requireForKind: "write", requireKind: true }` enforce it.
  Product management from chat (create, rename, move, delete, access) stays on
  the Products page.
- **R6. The product copilot is unchanged except by the signed catalogue**
  _(proposed)_. Step 2 moves its frame and nothing else; step 4 applies only
  what `RS` says.
- **R7. No panther change in this plan** _(proposed)_. The design uses
  `AIChatProvider`, `FrameRightResizable`, `createAITool`,
  `getEphemeralContext`, `validateAIChatConfig` and the conversations manager as
  shipped. If the signed catalogue needs an engine change, it is its own panther
  plan and this plan waits at the step that needs it, recorded in §8.
- **R8. One pair for Explore and the instance assistant** _(proposed)_. The
  Explore page's package and scope memos
  (`client/src/components/explore/explore.tsx:98-115`) move to `t4_explore.ts`
  as one resolved pair that both read, so the header, the prompt and the data
  source cannot disagree.
- **R9. Telemetry columns** _(proposed)_. §2.7, one new numbered migration, text
  columns, nullable, additive.
- **R10. The FASTR syntax doc rides once** _(proposed)_. The per-turn copy in
  the `editing_report` view instructions goes; the cached description copy
  stays.
- **RS. Catalogue signed off.** Written by Tim at sign-off, with the date, after
  Review 1 passes. Absent until then.

---

## 4. Steps

### Step 1: Inventory, review, proposed catalogue

**Surface.** `PLAN_ASSISTANT_SURFACES_CATALOGUE.md` (new). Nothing else.

**Deliverable.** The companion file, with these sections, every claim carrying a
file and line:

1. **Views.** Every place a user can be: the six tabs; every full-page view
   opened through `openShellEditor` (the product editors, the package page,
   module defaults, the Scopes page, the Data hub's sub-pages, user detail); the
   slide editor inside the deck editor; the figure editor inside the slide
   editor and inside the report editor; the Explore selectors; the HFA manager.
   For each: how it is reached and left, what live unsaved state it holds, which
   panther view id covers it today or none, and which sync sites set and clear
   that view.
2. **Tools.** Every tool on the three surfaces (§2.4 lists the names): kind,
   `availableIn`, what it reads, what it writes, whether it writes live state or
   persists, whether it is approval-gated, what context it needs (the pair, the
   authoring context, the live editor), and the headless flag.
3. **Defects and drift** found on the way, each with its change: the dead AI
   button, the stale `env.ts` comment, the FASTR triple carriage, any tool whose
   gating does not match its needs, any view with no sync site.
4. **The proposed catalogue.** Contexts, instances, views and the tools per
   view, with the reason for each placement, and each of Tim's six candidates
   ruled in or out with the reason. For the instance assistant: the tool list,
   the pair rule and the location line. For the product copilot: which tools
   stay available in which view, and whether the figure editors become views.
5. **Questions for Tim.** Each with the options still open and the author's
   lean.
6. **Impact.** What the proposal changes in §2 and in steps 2 to 5 if signed as
   proposed.

**Not in this step.** Code. SYSTEM edits. Any change to the plan file beyond the
two things.

**Gates.** `deno fmt --check PLAN_ASSISTANT_SURFACES_CATALOGUE.md`. No em-dash
in the file (`grep -c $'\xe2\x80\x94'` prints 0). Every tool name in section 2
matches a `name: "..."` in the code, checked by
`grep -rhoE 'name: "[a-z_]+"' client/src/components/products/copilot/ai_tools lib/ai_tools client/src/components/data/hfa/indicators/ai server/mcp | sort -u`
against the inventory. Every view row's file and line resolves.

**Ends with.** One commit. The session's final message in the chat presents
section 4 and section 5. **Next step** becomes `Review 1`. After Review 1
passes, the line reads `Do 2`, and `Do 2` waits for `RS`.

### Step 2: The shell panel and the context signal

**Surface.** `client/src/components/instance/instance.tsx`,
`client/src/state/t4_ui.ts`, `client/src/state/t4_assistant.ts` (new),
`lib/ai_tools/assistant_context.ts` (new, the pure derivation),
`server/tests/assistant_context_test.ts` (new),
`client/src/components/assistant/{mod.ts,panel.tsx}` (new),
`client/src/components/products/copilot/copilot.tsx` and `mod.ts`,
`client/src/components/data/hfa/indicators/ai/wrapper.tsx`, `ai/mod.ts` and
`manager.tsx`, `client/src/components/_shared/figure_editor/figure_editor.tsx`
(the AI button only, if the signed catalogue gates it),
`SYSTEM_13_ai_assistant.md` (globs and the host section),
`SYSTEM_14_client_shell.md` (the shell).

**Deliverable.** R1, R3, R7. The panel wraps `ShellEditorWrapper`; the header AI
button; the context signal with its three publishers; the panel's `Switch` over
contexts with the product slot (today's host minus its frame, keyed on the
productId the host publishes) and the HFA slot (today's wrapper minus its frame,
admin-gated); the instance context shows a placeholder until step 3.
`validateAIChatConfig` still runs in DEV for both instances. The lint manifests
claim the new files.

**Not in this step.** The instance assistant's tools and prompt. The hand-off.
Any change to the product copilot's registry, tools or prompt.

**Gates.** The floor. `server/tests/assistant_context_test.ts` green.
`./validate_protocols` with no new baseline entry.

**Ends with.** One or two commits, each green.

### Step 3: The instance assistant

**Surface.**
`client/src/components/assistant/{instance_assistant.tsx,instance_tools.ts,instance_system_prompt.ts,handoff_banner.tsx}`
(new), `client/src/state/t4_explore.ts` and
`client/src/components/explore/explore.tsx` (R8),
`client/src/components/results_packages/package_view/**` (publishes its pair),
`client/src/components/products/copilot/chat_pane.tsx` (placeholder, header
extras, the banner),
`client/src/components/products/copilot/_shared/build_system_prompt.ts` and
`lib/ai_tools/scope_lines.ts` (new; the scope lines move to lib so both prompts
share them), `lib/ai_tools/format_products_list_for_ai.ts` (new, pure) and
`server/tests/format_products_list_for_ai_test.ts` (new), `lib/ai_tools/env.ts`
(the comment), `SYSTEM_13_ai_assistant.md`, `SYSTEM_11_viz_authoring.md`,
`SYSTEM_14_client_shell.md`.

**Deliverable.** The instance assistant as the signed catalogue says: its tools,
R5 enforced at boot, the pair per R8 with the picker or chip in the pane header,
the location line through `getEphemeralContext`, the thread scope per pair, the
restricted-user posture, the hand-off banner (R2, §2.5), the stale `env.ts`
comment rewritten.

**Not in this step.** Any write tool. Any change to the product copilot's
registry or tools. Telemetry.

**Gates.** The floor. The new lib test green. `./validate_protocols` with no new
baseline entry.

**Ends with.** One or two commits, each green.

### Step 4: The product copilot per the signed catalogue

**Surface.** `client/src/components/products/copilot/**`,
`lib/ai_tools/build_system_prompt.ts` (R10), the editors' sync sites
(`client/src/components/products/slide_deck/slide_deck.tsx`,
`slide_deck/slide_editor/slide_editor.tsx`, `report/report.tsx`,
`client/src/components/_shared/figure_editor/figure_editor.tsx` if the catalogue
gives the figure editor a view), `client/src/onboarding/**` only if a view id
the tours key on changes, `SYSTEM_13_ai_assistant.md`,
`PROTOCOL_APP_AI_TOOLS.md` if a convention changes.

**Deliverable.** The product copilot's registry, `availableIn` lists and tool
set equal the signed catalogue; R10; the tours' predicates still fire
(`client/src/onboarding/index.ts` keys on the `editing_*` ids and the live
contexts); SYSTEM_13's tool and view prose rewritten to match.

**Not in this step.** Anything the signed catalogue does not name.

**Gates.** The floor. `./validate_protocols` with no new baseline entry. The
reviewer compares every `availableIn` and every tool group in `build_tools.ts`
against the signed catalogue's table and lists each difference as a finding.

**Ends with.** One or several commits, each green.

### Step 5: Telemetry

**Surface.** `server/db/migrations/instance/211_ai_usage_surface.sql` (new),
`server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`,
`server/db/instance/ai_usage_logs.ts`,
`server/routes/anthropic_messages_proxy.ts`, the two SDK client factories
(`client/src/components/products/copilot/ai_configs/defaults.ts`,
`client/src/components/data/hfa/indicators/ai/sdk_client.ts`) and the instance
assistant's client, `main.ts` only if the dev origin's CORS header list must
name the two headers, `SYSTEM_13_ai_assistant.md` (governance storage),
`SYSTEM_02_persistence.md` if its migration list is enumerated there.

**Deliverable.** R9: two nullable text columns, written from two request headers
the clients send, read once in the shared handler so the two mounts cannot
drift. No `json` or `jsonb`.

**Not in this step.** Any reporting UI over the new columns.

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** One commit. After Review 5 passes, the reviewer deletes this file
and the companion file in its last commit.

---

## 5. Gates catalogue

| Gate                                                                | First reached |
| ------------------------------------------------------------------- | ------------- |
| Companion file fmt-clean, no em-dash, every tool name grep-matched  | Step 1        |
| `RS` present in §3, catalogue section headed "Signed"               | before Do 2   |
| `server/tests/assistant_context_test.ts`                            | Step 2        |
| `./validate_protocols`, no new tier-2 entry                         | Step 2        |
| `server/tests/format_products_list_for_ai_test.ts`                  | Step 3        |
| `build_tools.ts` and every `availableIn` equal the signed catalogue | Step 4        |
| `./validate_migrations`, `./validate_fresh_boot`                    | Step 5        |

The floor (PROTOCOL_APP_PLANS) is green at the end of every step.

---

## 6. Out of scope

Named so it is not reopened:

- One thread that follows the user across contexts, and any memory bridge
  between contexts beyond the hand-off note (R2).
- Cross-product tasks from chat: comparing products, copying slides between
  decks, creating a report from a deck.
- Product management writes from chat: create, rename, move, reattach, rescope,
  share, delete (R5).
- Folding the HFA assistant into another instance, or changing its gate, proxy
  or approval policy.
- Explore write tools ("Add to deck or report") and the results-explorer page
  itself (PLAN_PRODUCTS_RESTRUCTURE §8).
- The panterra ops migration, an awareness digest, a nav index, a server-side
  session (panther `FUTURE_IDEAS_WBFASTR_OPS_MIGRATION.md`, `PLAN_RUNS.md`).
- Any panther change (R7), including the ephemeral-section decision that gates a
  Fable 5.1 or Opus 5.5 default (panther `FUTURE_IDEAS_AI_CHAT.md` §1).
- Shortening the system prompt's tool catalogue or the HFA assistant's prompt.
- Cross-device or server-side threads.

---

## 7. Rollout and rollback

Everything lands on `version2`. Step 1 changes no code. From `Do 2` until the
review that passes step 4, `version2` is not deployed: step 2 shows a
placeholder where step 3 puts the instance assistant, and step 4 may move tools
between views. Step 5 is additive and may ship on its own. After Review 5
passes, the next ad-hoc deploy to the v2 testing instances carries the whole
plan, and the fleet receives it with PLAN_PRODUCTS_RESTRUCTURE step 13.

Rollback is the previous image. Migration 211's columns are nullable and inserts
name their columns, so the previous code writes rows without them. Browser
threads are keyed by scope and are untouched by every step: the product threads
keep `copilot:<productId>`, the HFA threads keep `hfa-indicators`, and the
instance assistant's `assistant:<pair>` records are simply unused under the
previous image.

---

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date | Step | Row |
| ---- | ---- | --- |
