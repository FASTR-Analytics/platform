# PLAN_COPILOT02_FIXES: the AI defects that can be fixed before the one chat

> **Status (2026-10-08):** Written, not started. Child 02 of the copilot program
> (`PLAN_COPILOT_ORCHESTRATION.md` in the panther repo, ruling R2). Waits on no
> gate. Opens G2.

**Next step: Do 1**

This plan fixes the AI defects the 2026-10-08 review found in the product
copilot, the HFA assistant and `/mcp` that need no panther change and whose fix
COPILOT03's one chat keeps, as `PLAN_COPILOT_FINDINGS.md` records them (§1):
editors written over after a failed load, views and tool texts that lie, a
digest that blames the user, garbled French, silent HFA errors, and `/mcp`
acting as the first credential it saw. Every other defect is COPILOT03's (§6).

Branch: `version2`. Repos touched: this app; the panther repo only when the last
review opens G2 in `PLAN_COPILOT_ORCHESTRATION.md`.

Read first: what §0's reading order names.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are panther's
`protocols/PROTOCOL_ALL_PLANS.md` at `209a0f5`; until a panther sync brings that
version here (R4), read it with
`git -C /Users/timroberton/projects/panther/timroberton-panther show 209a0f5:protocols/PROTOCOL_ALL_PLANS.md`.
The app's bindings are `PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_COPILOT02_FIXES.md."
- Branch: `version2`, overriding PROTOCOL_APP_PLANS's `tim-branch`: the product
  plane lives on `version2` until PLAN_PRODUCTS_RESTRUCTURE step 13 merges it
  into `main`, and the copilot, report and HFA assistant files this plan edits
  do not exist on `main` or `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols` and
  `./run`, as PROTOCOL_APP_PLANS lists them. No step touches a migration, the
  base schema, the seed, the query engine or help text, so no conditional gate
  applies. Every step also keeps `./validate_protocols` at
  `0 new tier-2 flag(s)` with `validate_protocols_baseline.json` unchanged.
- Build log: §8. Last step: 8.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, `PROTOCOL_APP_AI_TOOLS.md`, §2 and §3 of this plan, the
  step's own section in §4, the D IDs it cites in `PLAN_COPILOT_FINDINGS.md`,
  and §8.

Program:

- Parent: `PLAN_COPILOT_ORCHESTRATION.md` in the panther repo
  (`/Users/timroberton/projects/panther/timroberton-panther`, branch `main`),
  whose rulings R2, R4, R6, R8, R9 and R10 apply, cited by number. Gates waited
  on: none. Gate opened: G2, whose fact is in the parent's §5.
- Companion: `PLAN_COPILOT_FINDINGS.md` (this repo), never edited by a session
  (R8). "D07: its change" means the edit that entry gives where it says. Where
  the entry and the code disagree, the code wins and §8 records it; where it and
  a ruling here differ, the ruling decides. COPILOT03's last review deletes it.
- Closing: R6, opening G2 in the orchestration plan on panther's `main`; the
  session that deletes this file keeps `PLAN_COPILOT_FINDINGS.md`, which
  COPILOT03 still cites (R8).

Rules peculiar to this plan:

- **Every step stands alone**, leaving `version2` deployable (§7). **Paths are
  today's**: COPILOT03 moves the copilot's shell-level files to
  `client/src/components/instance/copilot/` (R9); this plan edits them where
  they are and anticipates nothing of the move.
- **Lines are as of `dba8b7887`**; a step editing a file an earlier step edited
  finds each line by its content. A Surface entry with lines may touch only
  those lines.

Vocabulary: paths use the companion's prefixes (`copilot/`, `ctools/`, `deck/`,
`report/`, `hfa/`, `state/`, in its Paths table). A **D ID** is an entry's ID
there, written with a short name, for example D03 (failed report load). A
**view** is a view id of `copilotViews` (`copilot/_shared/ai_views.ts:107-164`),
whose fallback is `opening_product` (`:174`); the **digest** is the lines under
`User actions since last message:` (`panther/_110_ai_types/view_logic.ts:219`).
A **core** is the per-principal server core panther's `/mcp` handler caches
(`panther/_220_mcp_http/mcp_http_handler.ts:331-364`); a **credential** is a PAT
or an OAuth access token; **the pin** is the pinned package `/mcp` reads.

## 1. The problem

The companion's section D assigns this plan D01 to D33, D35 to D43, D97 and the
prose rows D65, D69, D71, D73, D74, D77 and D84 to D96, fixed here in this
grouping:

| Step | Entries                                                              | Today                                                                                                                                            |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | D03, D04, D05, D06, D17, D93                                         | a report or deck that fails to load can be written over; a closed report still sets its view; the deck's first view is wrong; labels go stale    |
| 2    | D01, D02, D07 (texts and comments), D08, D09, D10, D11, D43          | the slide tools describe a Save button and a deck rule that do not exist and edit the wrong slide; the draft card lays out wrong and duplicates  |
| 3    | D07 (digest line), D12, D13, D14, D15, D16, D65                      | the AI's own writes and other people's edits reach the digest as the user's; three selection paths never report                                  |
| 4    | D18, D19, D35, D36, D40, D41, D42, D69, D71, D73, D74, D94, D96, D97 | garbled French docs, attachments lost on deploy, English-only pane strings, a renderer that strips the user's text and loads images, false prose |
| 5    | D20, D21, D22 (descriptions), D23, D24, D25, D26, D77, D90, D91, D92 | HFA tools that ask approval for an invisible write, report skipped ids as created, drop the server's error and never say HFA                     |
| 6    | D27, D22 (language)                                                  | `set_hfa_indicator_code` costs 2N requests and can apply a batch partly; HFA approval text is English only                                       |
| 7    | D28, D33, D37, D38, D39, D84, D85, D86, D87, D88, D89                | `/mcp` runs every credential as the first; its guide and the headless chain's comments promise what it does not do                               |
| 8    | D29, D30, D31, D32, D95                                              | the overview lists 2 of 6 tools, says every tool reads the pin and omits `ai_context`; the surfaces list different HFA rounds                    |

## 2. The model

- **The views and the tools tell the truth.** An editor that fails to load shows
  the error, writes nothing and leaves the copilot in `opening_product`; a deck
  sets its view before its slide list opens a slide; labels and the slide's type
  are read live; the tools touch only the open slide and describe the editor as
  it is; the draft card adds once. **The digest reports what the user did.**
  **Text arrives as written**, in the user's language, an image as a link.
- **The HFA tools say what they do**, one request per batch, with the server's
  error. **`/mcp` acts as the credential that called it** and says what it reads
  and checks; both surfaces take the AI-context section and the HFA rounds from
  lib.

## 3. Rulings

Program rulings R2, R4, R6, R8, R9 and R10 apply (§0). A ruling below marked
"(Tim, 2026-10-08, R2)" is a fix of the proposal Tim accepted; a part marked
_(proposed)_ was derived here and stands unless Tim overrules it here before
`Do 1`.

1. **What this plan fixes**: the companion's child-02 entries (§1), none of
   which needs an engine change; each holds through COPILOT03.
2. **A report that fails to load** (Tim, 2026-10-08, R2) shows the error and
   returns before `setView`; a deck does the same _(proposed)_.
   `getOpeningProductInstructions` returns the text below.
3. **The slide editor saves on its own** (Tim, R2): its six texts below.
4. **`update_figure` in the slide editor edits only the open slide** (Tim, R2):
   another `slideId` is refused, with the texts below.
5. **The local-edit lines** (Tim, R2: carry the id, say the content changed).
   `edited_slide_locally` takes `{ slideId: string }`, `edited_report_locally`
   `{ reportId: string }`, and a `filter` keeps an entry only when it names the
   open slide or report; their formats, D13's, are below _(proposed)_.
6. **The HFA validation tool is a read; the create tool reports the server's
   result** (Tim, R2). `batchUploadHfaIndicators` returns
   `{ createdIndicatorIds: string[] }` from
   `INSERT ... ON CONFLICT (indicator_id) DO NOTHING RETURNING indicator_id` and
   writes code only for those; `create_hfa_indicators` reports them as `created`
   and the rest under `notCreated`; `validate_hfa_indicators` returns
   `{ validated, withIssues }` _(proposed)_. Their texts are below.
7. **One `/mcp` core per credential** (Tim, R2). `McpPrincipal`
   (`server/mcp/context_cache.ts:63`) gains `key: string` from an exported
   `buildMcpPrincipal(token: string, email: string): Promise<McpPrincipal>`:
   `<email>#<the first 16 hex digits of the SHA-256 of the token>` _(proposed)_,
   secret-free as panther asks (`mcp_http_handler.ts:86-90`) and readable.
8. **What `/mcp` says its tools read** (Tim, R2: the metric tools read the pin):
   the instructions' first line and the overview's sentence below.
9. **Rules the two surfaces share live in lib** (Tim, R2, for the AI context and
   the HFA rounds). Their names _(proposed)_:
   `buildAiContextSections(aiContext: string): string[]` in
   `lib/ai_tools/build_system_prompt.ts`, and
   `hfaTimePointsForAI(timePoints: HfaTimePoint[]): HfaTaxonomyForAI["timePoints"]`
   in a new `lib/ai_tools/hfa_time_points_for_ai.ts`.
10. **Tests** _(proposed)_. A pure function a fix adds or changes gets cases in
    `server/tests/`, named in its step. A UI, handler or database fix is proven
    by the floor and by the reviewer reading the code.
11. **The deck workflow in the slide view** (Tim, R2). Its steps
    (`copilot/_shared/build_system_prompt.ts:184-192`) become one constant the
    deck instructions keep under `## Workflow` and the slide instructions add
    after their own under `## Other slides and the whole deck` _(proposed)_.
12. **One request per code batch** _(proposed)_: `saveHfaIndicatorsCode`,
    `POST /hfa-indicators/save-code`, `can_configure_data`, body
    `{ indicators: { indicator: HfaIndicator; code: { timePoint: string; rCode: string; rFilterCode?: string }[] }[] }`
    with `.min(1)`, returning no data.

The texts, all _(proposed)_:

| Ruling | Where                                                                                               | Text                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2      | `getOpeningProductInstructions`, under its heading                                                  | `The product is still loading, or it failed to load and the page shows the error. Do not call editing tools yet. Tell the user to wait a moment or, if the page shows an error, to close the product and open it again.`               |
| 3      | `update_slide_editor`'s description, for "Changes are LOCAL (preview only) until user clicks Save." | `Changes apply to the open slide at once and save automatically.`                                                                                                                                                                      |
| 3      | its result's tail, after `Updated <changes>.`                                                       | `The change is applied to the open slide and saves automatically.`                                                                                                                                                                     |
| 3      | `update_figure`'s description, for its slide-editor sentence                                        | `In the slide editor the change applies to the open slide at once and saves automatically; at the deck level the slide is saved immediately.`                                                                                          |
| 3      | its editor result's tail, after the effect lines                                                    | `The change is applied to the open slide and saves automatically.`                                                                                                                                                                     |
| 3      | the slide workflow's step 4                                                                         | `4. Changes apply to the open slide at once and save automatically`                                                                                                                                                                    |
| 3      | the slide instructions' first two "Important" bullets, as one                                       | `- Changes apply to the open slide at once and save automatically; there is no Save button`                                                                                                                                            |
| 4      | `update_figure`'s refusal, ids filled in                                                            | `Slide "<slideId>" is not the open slide ("<open slideId>"). While a slide is open, update_figure edits only that slide: omit slideId, or ask the user to open slide "<slideId>".`                                                     |
| 4      | the sentence its `slideId` field's description gains                                                | `A slideId that is not the open slide is refused.`                                                                                                                                                                                     |
| 5      | `edited_slide_locally`'s format                                                                     | `The open slide's content changed (re-read with get_slide_editor before editing it)`                                                                                                                                                   |
| 5      | `edited_report_locally`'s format                                                                    | `The report body changed (re-read with get_report_editor before proposing edits)`                                                                                                                                                      |
| 6      | the reason under `notCreated`                                                                       | `an HFA indicator with this id was saved after the proposal; nothing was created for it`                                                                                                                                               |
| 6      | the opening of `validate_hfa_indicators`'s description                                              | `Validate HFA indicators' r-code against the HFA survey dictionary. Writes nothing.`                                                                                                                                                   |
| 8      | `/mcp`'s instructions, the first line                                                               | `FASTR Analytics assistant. get_available_metrics and get_metric_data read this instance's pinned national results package; get_methodology_docs_list, get_methodology_doc_content and get_info read reference docs, not the package.` |
| 8      | the overview's sentence                                                                             | `get_available_metrics and get_metric_data read all data in the package. Discover metric ids with get_available_metrics; never invent them.`                                                                                           |

## 4. Steps

### Step 1: The editors set their views over what they loaded, and name them live

**Surface.** `report/report.tsx`; `deck/slide_deck.tsx`;
`deck/slide_editor/slide_editor.tsx` (its props, :121 and :146-150, and
`setView`, :591-610, and its `getSlideTitle` import, :18);
`copilot/_shared/ai_views.ts` (its `lib` imports, :3-13; :61-163);
`copilot/_shared/build_system_prompt.ts` (:138-142); `ctools/slide_editor.tsx`
(:88-90); `ctools/report_editor.ts` (:216); `copilot/chat_pane.tsx` (:251-261);
`SYSTEM_13_ai_assistant.md` (:317-330); `SYSTEM_12_documents_sharing.md`
(:818-822, :2407-2421).

**Deliverable.**

- D03, ruling 2: on a failed detail read the report's `onMount`
  (`report/report.tsx:1112-1279`) returns before `setIsLoading(false)`, the
  theme modal and `setView`; its error, a `StateHolder`, renders through
  `StateHolderWrapper` where `MainArea` does (`:2684-2686`), and
  `getOpeningProductInstructions` returns ruling 2's text.
- D04, ruling 2: its change.
- D05, D06 and D93: their changes.
- D17: its change.
- SYSTEM_13 :317-330 and SYSTEM_12's autosave paragraph say the report sets its
  view after a successful first fetch and the deck before its slide list, that
  labels are read live, and that a failed load writes nothing.

**Not in this step.** The views of deck settings and the version histories
(D46), and `opening_product`'s empty label (D47), both COPILOT03's. A failed
authoring-context read (`deck/slide_deck.tsx:204-208`,
`report/report.tsx:866-869`), outside the AI.

**Gates.** The floor. **Ends with.** One commit.

### Step 2: The slide and deck tools describe the editor as it is

**Surface.** `ctools/slide_editor.tsx`; `ctools/slides.tsx`;
`ctools/draft_slide_preview.tsx`; `ctools/add_slide_to_deck.ts`;
`copilot/slide_ai/get_deck_summary.ts`; `copilot/_shared/build_system_prompt.ts`
(:146-235); `deck/slide_editor/slide_editor.tsx` (the comments at :411-414,
:707-709 and :747-750); `SYSTEM_13_ai_assistant.md` (:372-376).

**Deliverable.**

- D07, ruling 3: the texts D07 names are ruling 3's, the comment at
  `ctools/slide_editor.tsx:565` goes, and the comments D07 names, with
  `deck/slide_editor/slide_editor.tsx:747-750`, name the deck's `flush` before a
  slide swap and the unmount save. D09: ruling 11.
- D01 (with ruling 4's refusal, and its sentence on the `slideId` field,
  `ctools/slide_editor.tsx:381-383`), D02, D08, D10 and D43: their changes.
- D11: `addSlideToDeck` returns the `createSlide` response instead of throwing
  (`ctools/add_slide_to_deck.ts:16`); the card's Add runs through
  `createButtonAction` (`panther/protocols/PROTOCOL_UI_STATE.md` rule 6), which
  alerts a failure, and is disabled while it runs and after it succeeds, reading
  "Added to this deck" _(proposed)_ in the three languages; the expanded view
  (`ctools/draft_slide_preview.tsx:115-128`, `:222-230`) offers Add only while
  that button is enabled. SYSTEM_13 :372-376 says so.

**Not in this step.** The `(unsaved)` digest line
(`copilot/_shared/interactions.ts:63`; step 3). A stored draft card under the
pair current now (D63, engine change E4) and a slide switch between two calls
(D44, engine change E3), both COPILOT03's.

**Gates.** The floor. **Ends with.** One commit.

### Step 3: The digest stops reporting the AI's own edits, and names what changed

**Surface.** `ctools/slides.tsx`; `ctools/report_editor.ts`;
`copilot/_shared/interactions.ts`; `deck/slide_editor/slide_editor.tsx`
(:179-182); `deck/slide_list.tsx` (:186-229); `report/report.tsx` (:1565-1578);
`SYSTEM_13_ai_assistant.md` (:339-362).

**Deliverable.**

- D12: its change, except that each mark is made after its write lands
  (`applyFigureUpdate` returned true; after `prep.commit()`) rather than before,
  so the sentences D65 names hold _(proposed)_. D13 and D07's digest line:
  ruling 5, the producers sending their ids
  (`deck/slide_editor/slide_editor.tsx:179-182`, `report/report.tsx:1569`). D14,
  D15 and D16: their changes.
- SYSTEM_13 :339-362 says AI writes mark their product, the local-edit lines
  name the open slide or report, not an author, and all selection paths report.

**Not in this step.** The editor-path writes' collab echo (`Edited slide <id>`),
a design question in SYSTEM_13's Open items (:791-797). Filtering the log by the
view an action arrives in (engine change E6), and the producer named at
`interactions.ts:6-8` (D64), both COPILOT03's.

**Gates.** The floor. **Ends with.** One commit.

### Step 4: Text reaches the model and the user as written

**Surface.** `lib/ai_tools/tools_methodology_docs.ts`; `lib/ai_tools/env.ts`;
`lib/ai_tools/format_metric_data_for_ai.ts` (:148-152);
`lib/ai_tools/content_validators.ts` (:132-136); `copilot/_shared/client_env.ts`
(:63-65); `server/tests/methodology_docs_decode_test.ts` (new);
`state/clear_caches.ts`; `copilot/chat_pane.tsx` (:478-502, :557-560);
`copilot/ai_documents/ai_document_selector_modal.tsx`;
`copilot/ai_prompt_library/saveable_user_text_renderer.tsx`;
`copilot/save_report_style.tsx` (:19-24); `lib/fastr_markdown_spec.ts` (:1-6);
`SYSTEM_13_ai_assistant.md` (the globs, :276-280, :310-315, :421-428, :462-468);
`SYSTEM_03_realtime_cache.md` (:434-436).

**Deliverable.**

- D18: its change, through an exported
  `decodeBase64Utf8(content: string): string` both tools call.
- D19, D35 (with its `PeriodOption` import, `lib/ai_tools/env.ts:5`), D36, D40,
  D41, D42, D69, D71, D73, D74, D94, D96 and D97: their changes.
- SYSTEM_13's globs claim the new test.

**Not in this step.** Folding the three reference tools into one pair
(PLAN_REFERENCE_DOCS_ONE_PAIR, unruled). The env comment on a per-call pair
(`lib/ai_tools/env.ts:13-16`, D78) and moving the pane's files (R9), both
COPILOT03's. Panther's chat renderers (engine change E1, COPILOT01).

**Gates.** The floor, and
`deno test -A --no-check server/tests/methodology_docs_decode_test.ts` green on
its own, with two cases whose expected text is encoded by the test itself
(`TextEncoder`, then `btoa`):

- "decodeBase64Utf8: UTF-8 text, French accents included, decodes as written"
- "decodeBase64Utf8: base64 in 60-character lines, as GitHub sends it, decodes"

**Ends with.** Two commits, each green: `lib/ai_tools` and the attachment
prefix; then the pane, its documents and the prose.

### Step 5: The HFA tools do what they say, and tell the model why they failed

**Surface.** `hfa/ai/tools.ts`; `server/db/instance/hfa_indicators.ts` (:927-986
and :1360-1362); `lib/api-routes/instance/hfa_indicators.ts` (:318-326);
`SYSTEM_05_facilities_indicators.md` (:496-500, :1203-1207);
`SYSTEM_13_ai_assistant.md` (:694-717).

**Deliverable.**

- D20 and D21, ruling 6: their changes; `statusText` (`hfa/ai/tools.ts:94-98`)
  goes with the preview that used it, and the batch route gains
  `response: {} as { createdIndicatorIds: string[] }`.
- D22's descriptions, D23 (every call still failing after D20), D24 (the
  loaders' comment, `hfa/ai/tools.ts:26-29`, says which reads are cached), D25,
  D26 (with `.min(1)` on `validate_hfa_indicators.indicatorIds` too, so D77
  holds), D90, D91 and D92 (naming `create_hfa_indicators` and
  `set_hfa_indicator_code` for "the AI validation tools"): their changes.
- SYSTEM_13 :694-717 counts five write tools, a read validation and the server's
  error on every failure; SYSTEM_05 :496-500 says the batch route inserts only
  new ids and returns them.

**Not in this step.** `set_hfa_indicator_code`'s per-indicator saves, and the
approval and progress text (step 6). The code editor reverting an AI write
(D51), and the HFA chat's frame, proxy and prompt, all COPILOT03's.

**Gates.** The floor. **Ends with.** One commit.

### Step 6: `set_hfa_indicator_code` saves in one request, and the HFA tools speak the user's language

**Surface.** `hfa/ai/tools.ts`; `SYSTEM_05_facilities_indicators.md`
(:1102-1104); `SYSTEM_13_ai_assistant.md` (:801-803);
`server/db/instance/hfa_indicators.ts` (a new `saveHfaIndicatorsCode` beside
`saveHfaIndicatorFull`, :1269-1347); the new route in
`lib/api-routes/instance/hfa_indicators.ts` and its handler in
`server/routes/instance/hfa_indicators.ts`.

**Deliverable.**

- D27, ruling 12: in one transaction the route writes each indicator's row and
  main code as `saveHfaIndicatorFull` does
  (`server/db/instance/hfa_indicators.ts:1282-1335`, the `updated_at` bump
  included), leaves its variant code, runs `assertVariantIntegrity` once and
  broadcasts once. The tool's commit (`hfa/ai/tools.ts:944-999`) calls it once,
  reads no variant code, and on a failure applies nothing and carries `res.err`;
  the comment at `:937-942` goes. SYSTEM_05 :1102-1104 names both routes whose
  code writes bump the row; SYSTEM_13's open item (:801-803) goes.
- D22, its English-only text: every string the HFA tools show the user goes
  through `t3({ en, fr, pt })` (approval titles, descriptions and the confirm
  label, the change rows' fixed words, each `inProgressLabel` and
  `completionMessage`), interpolating ids, counts and labels as today; what a
  tool returns to the model stays English.

**Not in this step.** The code editor's own Save (`saveHfaIndicatorFull`),
unchanged. The copilot tools' progress labels, English too (for example
`ctools/slides.tsx:75`); the companion names the HFA tools only.

**Gates.** The floor. **Ends with.** Two commits, each green: the route and the
tool's commit; then the text.

### Step 7: `/mcp` keeps one core per credential, and the headless chain says what it checks

**Surface.** `server/mcp/context_cache.ts` (:12-17, :29-35, :45-115, :282-313);
`server/mcp/mcp_endpoint.ts` (:8, :37-78); `main.ts` (its imports, :1-63;
:226-232); `server/middleware/headless_allowlist.ts`; `server/headless_app.ts`
(:11-26, :48-50); `lib/server_actions/transport.ts` (:17-21);
`lib/api-routes/instance/run_generation.ts` (:35-40, :105-107); in
`server/tests/`, `mcp_principal_key_test.ts` (new), `mcp_context_cache_test.ts`
(:26, :72-73) and `pat_identity_parity_test.ts`; `USER_GUIDE_MCP.md`;
`SYSTEM_13_ai_assistant.md` (the globs; principle 2's `/mcp` sentences,
:85-130); `SYSTEM_01_api_contract.md` (:421-426).

**Deliverable.**

- D28, ruling 7: `authenticate` returns `buildMcpPrincipal`'s principal on both
  branches (`server/mcp/mcp_endpoint.ts:55-57`, `:68`) and `principalKey`
  (`:70`) its key, so each credential gets its own core over its own token;
  `mcp_context_cache_test.ts` builds its principals with it. D86 then holds.
- D38: `main.ts` runs `validateMCPServerConfig` over the handler's exported
  config, with the tools built for `buildMcpPrincipal("", "dev@offline.local")`,
  beside `validateHeadlessMounts()` (`main.ts:229-232`).
- D33, D37, D39 with D84, D85, D87, D88 and D89: their changes. The guide also
  says at lines 52-53 that the metric tools read the pin and at 270-272 what a
  read checks, in sentences with no em-dash. SYSTEM_13 principle 2 says the core
  is keyed per credential; its globs claim the new test.

**Not in this step.** The overview, the instructions and the shared sections
(step 8). Passing the request's own credential into a tool call, which would be
a panther change. `withSourceHeader`'s `runStructured` (D34, COPILOT03).

**Gates.** The floor;
`deno test -A --no-check --env-file server/tests/mcp_principal_key_test.ts`
green on its own, with three cases:

- "buildMcpPrincipal: two credentials of one email get two keys"
- "buildMcpPrincipal: one credential gets the same key every time"
- "buildMcpPrincipal: the key names the email and holds no part of the
  credential"

and, with this tree's server up as the floor boots it (§8 names its port,
`<port>`), `./mcp_probe http://localhost:<port> get_overview` answers.

**Ends with.** Two commits, each green: the credential key, its tests and the
guide; then the boot check, the derivation and the chain's comments.

### Step 8: `/mcp`'s overview, and the sections both prompts share

**Surface.** `server/mcp/mcp_tools.ts`; `server/mcp/mcp_endpoint.ts` (:11-35);
`lib/ai_tools/build_system_prompt.ts`; `lib/ai_tools/hfa_time_points_for_ai.ts`
(new); `lib/ai_tools/mod.ts`; `copilot/_shared/build_system_prompt.ts` (:1-17,
:78-133); `copilot/copilot.tsx` (:10-16, :141-152);
`server/db/instance/dataset_hfa.ts` (:2-7, :17-33); in `server/tests/`,
`ai_context_sections_test.ts` and `hfa_time_points_for_ai_test.ts` (new);
`SYSTEM_13_ai_assistant.md` (the globs, :85-130, :301-307, :620-624).

**Deliverable.**

- D29 and D95: their changes. D30, ruling 8: the instructions' first line
  (`server/mcp/mcp_endpoint.ts:29`), the overview's sentence
  (`server/mcp/mcp_tools.ts:102`), and the file comment's pin sentence
  (`mcp_endpoint.ts:14-16`) on the metric tools.
- D31, ruling 9: `buildAiContextSections` returns nothing for a blank AI
  context, else what `copilot/_shared/build_system_prompt.ts:113-118` adds
  today; the SPA prompt calls it there and `get_overview` after
  `buildDataCoverageSections` (`mcp_tools.ts:100`), and the lib file's header
  comment (`lib/ai_tools/build_system_prompt.ts:17-23`) says so.
- D32, ruling 9: `hfaTimePointsForAI` keeps the rounds with `importedAt` set, in
  order, as `{ id: label, label, periodId }`, exported from
  `lib/ai_tools/mod.ts`; `copilot/copilot.tsx:145-152` calls it over
  `instanceState.hfaTimePoints`, and `getHfaTimePointsForAI`
  (`server/db/instance/dataset_hfa.ts:17-33`) calls it over every round,
  selected with its import stamp in `sort_order` order.
- SYSTEM_13's principle 2, survey-rounds sentence and `ai_context` paragraph say
  what changed; its globs claim the two new tests.

**Not in this step.** COPILOT03's: the SPA prompt's tool catalogue (D55), the
package grounding's move into message blocks (engine change E7), and the lib
header's sentence on one conversation
(`lib/ai_tools/build_system_prompt.ts:25-29`, D80).

**Gates.** The floor;
`deno test -A --no-check server/tests/ai_context_sections_test.ts server/tests/hfa_time_points_for_ai_test.ts`
green, with these cases:

- "buildAiContextSections: a blank AI context adds no section"
- "buildAiContextSections: the AI context is trimmed under its heading"
- "hfaTimePointsForAI: a round never imported is left out"
- "hfaTimePointsForAI: imported rounds keep their order, the label as the id"

and, with this tree's server up as the floor boots it (§8 names its port,
`<port>`), against the dev instance's ready pinned package (which
`server/tests/product_access_db_test.ts:6` already needs),
`./mcp_probe http://localhost:<port> --info` prints ruling 8's first line, and
`./mcp_probe http://localhost:<port> get_overview` names all six tools under
`# Available Tools` and carries ruling 8's sentence.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                                                | First reached |
| --------------------------------------------------------------------------------------------------- | ------------- |
| The floor (PROTOCOL_APP_PLANS)                                                                      | Step 1        |
| `./validate_protocols`: `0 new tier-2 flag(s)`, baseline unchanged                                  | Step 1        |
| `server/tests/methodology_docs_decode_test.ts`                                                      | Step 4        |
| `server/tests/mcp_principal_key_test.ts`                                                            | Step 7        |
| `./mcp_probe http://localhost:<port> get_overview` answers against this tree's server               | Step 7        |
| `server/tests/ai_context_sections_test.ts`, `server/tests/hfa_time_points_for_ai_test.ts`           | Step 8        |
| `./mcp_probe http://localhost:<port> --info` and `get_overview` show ruling 8's texts and six tools | Step 8        |

Every gate stays green in every later step.

## 6. Out of scope

Named so it is not reopened:

- The entries the companion assigns to COPILOT03, D34 among them (COPILOT03
  ruling 10).
- The engine changes E1 to E8 (COPILOT01) and PLAN_FRAME_PANELS step 1; the
  defects of the proposal's section 6, outside the AI; the same defects on
  `main` and `tim-branch` (§7); folding the three reference tools into one pair
  (PLAN_REFERENCE_DOCS_ONE_PAIR).

## 7. Rollout and rollback

Every step stands alone and leaves `version2` green. `version2` is in
PLAN_PRODUCTS_RESTRUCTURE step 11, deployed to the three v2 testing instances
and refined there, so Tim's next deploy of `version2` ships every step landed by
then; nothing in this plan deploys on its own. The fleet receives the plan with
PLAN_PRODUCTS_RESTRUCTURE step 13. Until then `main` and `tim-branch` keep D18,
D19, D28, D33 and the `/mcp` half of D29 to D31 in the same files
(`server/mcp/mcp_endpoint.ts:70`, `lib/ai_tools/tools_methodology_docs.ts:30`
and `:85`, `client/src/state/clear_caches.ts:4` and `USER_GUIDE_MCP.md:5-6` read
as on `version2`).

What changes for a user beyond the fixes themselves: pending attachments now
survive a deploy and go with Clear AI chat history. Each PAT and each OAuth
token gets its own `/mcp` core, so a refreshed OAuth token builds a new core; a
client on the 2025-era wire, whose sessions are bound to the core's key
(`panther/_220_mcp_http/mcp_http_handler.ts:644-658`), gets one 404
`Session not found` after a refresh and starts a new session, as it does after
every deploy. Requests on the 2026 wire hold no session.

No step adds a migration, changes stored JSON or a cached payload's shape, or
needs a Valkey prefix bump. The batch route's response gains data that only the
AI tool reads, the new code route has the AI tool as its one caller, and the
client and server deploy together.

Rollback is `git revert` of a step's commits on `version2`.

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date | Step | Row |
| ---- | ---- | --- |
