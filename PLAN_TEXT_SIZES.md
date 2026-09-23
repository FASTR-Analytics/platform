# PLAN: One coherent set of text sizes

Status: ready once [PLAN_BASE_TEXT_SIZE.md](PLAN_BASE_TEXT_SIZE.md) is done.
Brings every piece of UI text onto a small set of roles drawn from the rem
scale, so the same kind of text is the same size everywhere, and adds a lint
that keeps it that way.

**Next step:** Do 4

Branch: `version2` (app), `main` (panther). Repos: panther
(`/Users/timroberton/projects/panther/timroberton-panther`) and this app.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`, bound by
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md), with these differences:

- Instruction: "Do the next step of PLAN_TEXT_SIZES.md."
- Branch: `version2` in the app, `main` in panther.
- Floor, app: `deno task typecheck`, `deno task test`, `./validate_protocols`.
  Floor, panther: `deno task typecheck`, `deno task test`.
- Prerequisite: PLAN_BASE_TEXT_SIZE.md has closed (its file is deleted).
  Body text is then 14px, declared by panther.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, §2 and §3 of this plan, the step's own
  section in §4, and §8.

## 1. The problem

A review of the shell and the six main pages (Products, Explore, Results,
Data, Assets, Users) found text sized by component and call site, not by
role:

- Section headings come in four sizes (12, 14, 16, 18) reached five ways
  (`text-lg font-700`, bare `font-700`, `text-md`, `font-700 text-sm`,
  `ui-text-caption font-700`). `text-md` is not a token, so it emits nothing.
- Titles are large: HeadingBar titles are 20, their subheadings inherit 20,
  empty-state titles are 20, the two indicators pages put a 20px
  "Indicators (N)" title under the heading bar, and the instance name is 24.
- Tables disagree: some display tables mix 12 and 14 cells, and the Products
  and Results listings use their own sizes.
- Some text is sized in pixels (`text-[9px]` to `text-[11px]`, inline pixel
  sizes in the CodeMirror editors).
- The kit clears the `--text-*` tokens, which also clears their line-heights,
  so most text falls back to a 1.5 line-height.
- Nothing enforces any of this.

## 2. The model

The html root is the browser default. Every size is a rem token. Text takes a
role, and the role sets its size:

| Role | Size | Used for |
| --- | --- | --- |
| Caption | 12 (`ui-text-caption`, `text-xs`) | Metadata, dates, badges, help text under a control, column headers, every cell of a data grid |
| Body | 14 (inherited from `body`) | Everything else: body text, list and table cells, buttons, inputs, tabs, menus, dialog text, empty and loading messages, errors |
| Heading | 16/700 (`ui-text-heading`) | Section, card, modal and alert headings, and the label of a full-screen view |

There is no title role. `em` is used only where a size must follow the text
around it (icons, markdown).

## 3. Rulings

1. Every text size comes from the rem token scale. No pixel sizes, no
   arbitrary `text-[...]` sizes, no class that is not a token.
2. The three roles in §2 are the whole UI type scale.
3. `ui-text-heading` becomes 16/700. `ui-text-title` and `ui-text-display`
   are deleted from panther.
4. The six top-level pages have no title; the side nav names the page.
5. A full-screen view (one with a back button) keeps a label that says which
   package, user or module it shows, at the heading role. A HeadingBar
   subheading is body size, muted. The instance name in the shell is the
   heading role.
6. The two in-body titles under an indicators heading bar, "Indicators (N)"
   in HMIS indicators (`data/hmis/indicators/manager.tsx`) and HFA indicators
   (`data/hfa/indicators/manager.tsx`), become a plain body-size count beside
   the search box: "123 indicators", or "12 of 40" while searching.
7. Data grids (DataGrid, the CSV table, PresenceGrid) are caption size
   throughout.
8. Display tables (DisplayTable) and listings (the Products list, the
   Results package list) use one cell size, body. Secondary values are
   muted, not smaller; a name may be 700. A second line stacked under a
   cell's main value is caption. A listing's column header matches the
   DisplayTable header.
9. Each size token carries Tailwind's default line-height again, and `body`
   takes the `text-sm` pair, so unsized text and `text-sm` text agree:

   ```css
   --text-xs--line-height: calc(1 / 0.75);
   --text-sm--line-height: calc(1.25 / 0.875);
   --text-base--line-height: calc(1.5 / 1);
   --text-lg--line-height: calc(1.75 / 1.125);
   --text-xl--line-height: calc(1.75 / 1.25);
   --text-2xl--line-height: calc(2 / 1.5);
   --text-3xl--line-height: calc(2.25 / 1.875);

   body {
     line-height: var(--text-sm--line-height);
   }
   ```

   This lands in its own step, before any size changes, so a vertical shift
   is attributable to it alone.
10. _(proposed)_ Icons in `sm` controls are drawn smaller inside their
    existing box, so no control changes height.
11. Text currently below 12px moves to 12. If a badge or avatar is then
    cramped, its container grows; there is no `em` exception.
12. Control sizes (default vs `sm` buttons, inputs, selects) are out of this
    plan and stay case by case.
13. A lint in `deno task typecheck` fails on any text size outside the token
    scale.

## 4. Steps

### Step 1: panther, the line-heights

**Surface.** In the panther repo: `modules/_303_components/_fixed.css`; then
`./sync wb-fastr-v2`.

**Deliverable.** Ruling 9: the seven line-height tokens in `@theme` beside
the sizes they pair with, and the `body` line-height in `@layer base` beside
the font-size rule PLAN_BASE_TEXT_SIZE.md added.

**Not in this step.** Any size change.

**Gates.** Panther floor, then the app floor after the sync.

**Ends with.** One panther commit, then one app commit for the sync.

### Step 2: panther, the roles

**Surface.** Panther's `_303_components` and `_304_actions` type classes and
the components that use them, `PROTOCOL_UI_STYLING.md` and the
`_303_components` README; then `./sync wb-fastr-v2`.

**Deliverable.** Rulings 3, 5 (HeadingBar heading and subheading) and 10 in
panther. The EmptyState title and the delete-confirmation title use the
heading role. The protocol and README list the roles in §2 and no longer name
the deleted classes.

**Not in this step.** Any app file other than the sync.

**Gates.** Panther floor, then the app floor after the sync.

**Ends with.** One panther commit, then one app commit for the sync.

### Step 3: app headings and titles

**Surface.** App components in the shell and on the six pages, including the
views, modals and wizards they open, that set a heading or title size.
`PROTOCOL_APP_UI_CONVENTIONS.md`.

**Deliverable.** Every heading uses `ui-text-heading`, including the instance
name in the shell (ruling 5). Rulings 4 to 6 applied. No `text-lg`, `text-xl`,
`text-2xl` or `text-md` is left serving as a heading.

**Not in this step.** Tables, pixel sizes, the lint.

**Gates.** App floor.

**Ends with.** One commit.

### Step 4: app tables and listings

**Surface.** The Products list, the Results package list, and display tables
whose cells set their own size.

**Deliverable.** Rulings 7 and 8.

**Not in this step.** The kit's table components, which step 2 settles.

**Gates.** App floor.

**Ends with.** Two commits: the display tables, then the listings, so the
listing change reverts alone.

### Step 5: rem only, enforced

**Surface.** Every file with a pixel or arbitrary text size, a new root lint
script, and `deno.json`.

**Deliverable.** Rulings 1, 11 and 13. The lint covers `client/src` and
`panther/_303_components`, runs in `deno task typecheck`, and passes.

**Not in this step.** Canvas-rendered text (figures, slides, the report theme
miniature), which follows `PROTOCOL_ALL_SIZING.md`.

**Gates.** App floor, including the new lint.

**Ends with.** Two commits: the conversions, then the lint.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| Panther floor | Step 1 |
| App floor | Step 1 |
| Text-size lint | Step 5 |

## 6. Out of scope

Control sizes (ruling 12). Canvas-rendered text. Large numbers shown as data
values in import progress and summaries. The sign-in and landing screen.
Label wording and letter case.

## 7. Rollout and rollback

Step 1 changes panther for every consumer that syncs its UI modules; their
line-heights, headings and titles change on their next sync. Nothing ships
before step 5's review passes. Each step is its own commit or pair of commits
and reverts cleanly; steps 1 and 2 are undone by reverting the panther commit
and re-syncing.

## 8. Build log

| Step | Row |
| --- | --- |
| 1 | `./sync wb-fastr-v2` runs `deno fmt` on panther before copying and commits its own result in the app, so a panther step runs `deno fmt` before its commit and the app's sync commit is the tool's. |
| 1 | Step 1 built. Panther commit "Give each text size token its line-height back" (40e0db0); app sync commit 6245a1c7. Panther floor: typecheck clean, 501 tests. App floor: typecheck clean, 428 tests, protocols passed. |
| 1 | Step 1 reviewed: pass. Surface held (panther: `_fixed.css` only; app: the sync's two files under `panther/`). Ruling 9 present in `@theme` after the `--text-*: initial;` reset and in the `@layer base` body rule; app copy byte-identical to panther 40e0db0; Tailwind 4.1.17 emits `line-height` from `text-*` only when `--text-<size>--line-height` resolves. Panther floor: typecheck exit 0, 501 tests. App floor: typecheck clean, 428 tests, protocols passed. |
| 2 | Ruling 10 implemented as: IconRenderer centres the icon in its `--ui-form-content-h-em` box and, for `sm`, passes the icon `h-[1em] w-[1em]` (12px glyph in a 15px box). The default size is unchanged. |
| 2 | Ruling 5: the HeadingBar subheading is `text-sm text-base-content-muted font-400`; `text-sm` is needed because it sits inside the 16px heading and cannot inherit body. |
| 2 | The delete confirmation keeps `text-danger` on top of `ui-text-heading`; the utility layer wins over the component class, as `alert.tsx:290` already relies on. |
| 2 | After the sync, `client/src/components/data/hmis/indicators/manager.tsx:635` still names `ui-text-title`, which no longer exists, so that title renders at body size until step 3 (ruling 6) replaces it. |
| 2 | Step 2 built. Panther commit "Three type roles: heading is 16/700, title and display are gone" (adf1f91); app sync commit 3d38ea6e. Panther floor: typecheck exit 0, 501 tests. App floor: typecheck exit 0, tests exit 0, protocols passed. |
| 2 | Step 2 reviewed: pass. Surface held (panther: the seven files of adf1f91, all in `_303_components`, `_304_actions`, the README and `PROTOCOL_UI_STYLING.md`; app: those seven under `panther/` plus `.panther-manifest.json`). Ruling 3: `.ui-text-heading` is `font-700 text-base-content text-base` at `_fixed.css:1318`; `ui-text-title` and `ui-text-display` appear nowhere in panther. Ruling 5: `heading_bar.tsx:125` and `:128`. Ruling 10: `icon_renderer.tsx:25` keeps the `--ui-form-content-h-em` box and `:32` passes `h-[1em] w-[1em]` for `sm` only; `icon_types.ts:5` takes `class`, and `icons_tabler.tsx:17` uses it in place of the 1.25em default. EmptyState (`empty_state.tsx:21`) and the delete confirmation (`confirm_delete_form.tsx:36`) use `ui-text-heading`. README and protocol list the three roles and name neither deleted class. All seven app copies match panther adf1f91 apart from the sync header on the four `.tsx` files. Log claims hold: `.ui-text-heading` sits in `@layer components` (`_fixed.css:755`) so the `text-danger` utility wins, as `alert.tsx:290` relies on; `manager.tsx:635` is the only non-panther `ui-text-title` left in the app. Panther floor: typecheck exit 0, tests exit 0 (501 passed). App floor: typecheck exit 0, tests exit 0 (428 passed, 2 ignored), protocols exit 0. |
| 3 | Scope rule applied: a heading is a site that sets a heading size (`text-lg`, `text-xl`, `text-2xl`, `text-md`, or `font-700 text-base`). Bare `font-700` sets no size and is outside this step's Surface; it renders as bold body text, which is a label, not a heading. `font-700 text-sm` column headers go to step 4 with the tables. |
| 3 | Left as is, per §6: the sign-in screen (`instance/logged_in_wrapper.tsx:239,268`) and the `font-mono text-xl` counts in `data/hfa/imports/staging_summary.tsx` and `data/iceh/imports/staging_summary.tsx`, which are data values. |
| 3 | The chat pane headings (`products/copilot/chat_pane.tsx:486`, `data/hfa/indicators/ai/chat_pane.tsx:105`) sit on a primary bar, so they carry `text-primary-content` over `ui-text-heading`. |
| 3 | Ruling 6: both indicators pages show "N indicators" or "N of M" (fr "sur", pt "de") in a plain `flex-1` div beside the search box. |
| 3 | The client tree is excluded from `deno fmt` and 41 of the 48 files touched already failed Prettier at HEAD, so no formatter was run. |
| 3 | Step 3 built. 48 files: 47 under `client/src/components` and `PROTOCOL_APP_UI_CONVENTIONS.md`. Floor: typecheck exit 0, tests exit 0 (428 passed), protocols exit 0. |
| 3 | Finding: the Data page's 17 card headings (`data/data.tsx:132,190,231,272,313,378,421,452,484,560,602,667,706,752,795,824,864`, `font-700 pb-2 text-sm`) are card headings that set a size, so they sit inside the Surface as written, and the §8 scope rule's `text-sm` carve-out covers only column headers. They render at 14/700 and should be `ui-text-heading`. |
| 3 | Finding: the §8 scope rule for bare `font-700` matches the Surface's wording but not the Deliverable ("every heading") or §1, which names bare `font-700` as one of the five ways section headings are reached, and no later step covers it. The result is the same kind of text at two sizes: the facilities import wizard's step heading (`data/facilities/import/step_0.tsx:42`) is now 16/700 while the geojson upload wizard's (`data/geojson/upload_wizard/step_0.tsx:21`, `step_1_file.tsx:35`, `step_1_dhis2.tsx:40`, `step_2.tsx:163,215`, `step_4.tsx:129`) stays 14/700; likewise the card headings in `data/hmis/imports/csv_staging_summary.tsx:42,158` and the modal section headings in `data/hmis/indicators/manager.tsx:787,815,836`. Block-level bare `font-700` labels of a section, card or wizard step become `ui-text-heading`; inline `font-700` spans in prose (emphasis) and bold names in list rows do not. |
| 3 | Finding, log only: the closing row's count is wrong. The commit touches 48 files under `client/src/components`, not 47, plus `PROTOCOL_APP_UI_CONVENTIONS.md` and this plan (50 in `git show --stat 7f03ccc7`). |
| 3 | Step 3 reviewed: 3 findings. Surface held: every code file is under `client/src/components` in the shell, the six pages or what they open. Deliverable as built holds: 77 `ui-text-heading` sites, no `ui-text-title`, no size class left beside `ui-text-heading`, no mangled class; ruling 4 (none of the six pages passes `heading` to HeadingBar), ruling 5 (`instance/instance.tsx:211`), ruling 6 (`data/hmis/indicators/manager.tsx:635` and `data/hfa/indicators/manager.tsx:1017`, en/fr/pt, `flex-1` div beside the search input) verified in the code. Remaining `text-lg`/`text-xl`/`text-3xl` hits are the sign-in screen (`instance/logged_in_wrapper.tsx:239,268`), the `font-mono text-xl` counts in the two `staging_summary.tsx` files, and the `font-700 text-3xl` progress percentages in the four `run_view.tsx` files, all data values or the sign-in screen per §6 (the run_view sites are not named in the §6 row but are covered by it). Both chat pane headings carry `text-primary-content` on a `bg-primary` bar. `client/` is excluded from `deno fmt` (`deno.json:6`); spot-check of three HEAD~1 files: two fail Prettier, one passes. The `ui-text-caption font-700` group labels in `results_packages/package_view/module_pane.tsx:64,92,113`, `status_bar.tsx:85` and `wizard/step_2_modules.tsx:143` are left as caption-role labels, not headings. Floor: typecheck exit 0, tests exit 0 (428 passed, 2 ignored), protocols exit 0. |
| 3 | Fix, finding 1: the 17 Data page card headings in `data/data.tsx` are `ui-text-heading pb-2`. |
| 3 | Fix, finding 2, applying the review's rule: block-level bare `font-700` labels of a section, card, callout or wizard step became `ui-text-heading` at 33 sites in 23 files (the geojson upload wizard steps, the import run-detail and needs-review callouts, the DHIS2 future-imports sections, the CSV staging summary cards, the HMIS indicators modal sections, time points, facilities, recode). Left as bold body text: names in list rows and cards (`prompt_library_modal.tsx:438,482`, `metric_card.tsx:57`, `dhis2_indicator_select_form.tsx:652`, `type_facts.tsx:130`), the labels of the two selectable source cards in `geojson/upload_wizard/step_0.tsx:33,49`, and bold sentences in prose (`refresh_dhis2_labels_modal.tsx:78`, `population/import_form.tsx:163,214`, `dhis2_indicator_select_form.tsx:489`, `wizard/step_4_review.tsx:59`). |
| 3 | Fix, finding 3: the step 3 closing row's count was wrong; the commit touched 48 files under `client/src/components`, the protocol and the plan. |
| 3 | Step 3 fixed. 24 files. Floor: typecheck exit 0, tests exit 0 (428 passed), protocols exit 0. |
| 3 | Finding: the fix's rule (block-level `font-700` that sets no size and labels a section, card, callout or wizard step) was applied to `class="font-700"` and to `font-700 mb-3` in one file, and missed the same kind of label where a margin or colour utility sits beside `font-700`: `products/copilot/ai_documents/ai_document_selector_modal.tsx:162`, `products/copilot/ai_prompt_library/prompt_library_modal.tsx:534` (the prompt title heading the edit phase), `products/_shared/insert_figure/step_3_configure.tsx:56,76`, `data/geojson/upload_wizard/step_4.tsx:152`, `data/iceh/imports/wizard.tsx:97` (an `h4`), `data/facilities/import/step_5_import.tsx:313,370,414,439`, `data/hmis/imports/csv_staging_summary.tsx:94` (`font-700 text-danger mb-3`, whose siblings at `:42,158` were converted) and `data/facilities/import/upload_attempt_form.tsx:235` (`text-danger font-700`, the same callout heading as the converted "Run error" sites). The coloured ones keep their colour utility over `ui-text-heading`, as the chat panes and the delete confirmation do; `step_4.tsx:152` sits in a `text-warning-subtle-content` box, so it needs that colour on the heading. Left: `data/hmis/imports/dhis2_run_view.tsx:121`, a `font-700 mb-1` label inside a `text-xs` block, which is a caption-role group label like those the first review left. |
| 3 | Finding: section labels that set `text-sm` beside their weight are still 14/700, the same case as finding 1's Data page card headings, which the first review did not name: `data/hmis/indicators/edit_indicator_form.tsx:750,958`, `data/hfa/indicators/indicator_code_editor.tsx:634,826,984`, `products/_shared/version_history/deck_version_preview.tsx:811` and `products/_shared/version_history/report_version_preview.tsx:390` (`text-sm font-semibold`). Left as bold body text under the fix's rule: names and list rows (`instance/profile.tsx:193`, `instance/whats_new_modal.tsx:503`, `products/_shared/version_history/version_history.tsx:157`, `products/report/theme_modal.tsx:161,186`) and bold sentences (`data/hfa/indicators/xlsx_upload_form.tsx:614`, `data/facilities/import/step_5_import.tsx:455`). Left as a choice the rulings do not cover: the muted `text-base-content-muted font-700 text-sm` sub-labels under a Card header in `products/slide_deck/settings.tsx:211`, `logo_section_editor.tsx:33` and `slide_editor/markdown_guide.tsx:53`, treated like the caption-role group labels the first review left. |
| 3 | Step 3 reviewed: 2 findings. Surface held: `8b5c8e35` touches 24 files under `client/src/components/data` and this plan (25 in `git show --stat`; the fix row's 24 counts the code files). Every changed code line is `font-700 pb-2 text-sm` to `ui-text-heading pb-2` (17, all in `data/data.tsx`) or `font-700` to `ui-text-heading` (33 sites in 23 files, margin utilities kept); the plan diff is the Next step line and the four fix rows. Finding 1 resolved: the 17 `data.tsx` card headings at the lines the review named are `ui-text-heading pb-2`. Finding 2 resolved for every site the review named (`geojson/upload_wizard/step_0.tsx:21`, `step_1_file.tsx:35`, `step_1_dhis2.tsx:40`, `step_2.tsx:163,215`, `step_4.tsx:129`, `csv_staging_summary.tsx:42,158`, `hmis/indicators/manager.tsx:787,815,836`) and the fix row's left-as-is list holds under the rule: `prompt_library_modal.tsx:438,482`, `metric_card.tsx:57`, `dhis2_indicator_select_form.tsx:652` and `type_facts.tsx:130` are names in list rows or cards, `geojson/upload_wizard/step_0.tsx:33,49` are radio option labels inside a `label`, and `refresh_dhis2_labels_modal.tsx:78`, `population/import_form.tsx:163,214`, `dhis2_indicator_select_form.tsx:489` and `wizard/step_4_review.tsx:59` are bold sentences. Finding 3's correction is accurate: `git show --stat 7f03ccc7` lists 48 files under `client/src/components`, the protocol and the plan. Floor: typecheck exit 0, tests exit 0 (428 passed, 2 ignored), protocols exit 0 (16 baselined). |
| 3 | Second fix, finding 1: the 12 section, card, callout and wizard-step labels with a margin or colour utility beside `font-700` are `ui-text-heading`, keeping their margin and colour utilities. `dhis2_run_view.tsx:121` left, as the review ruled. |
| 3 | Second fix, finding 2: the seven `font-700 text-sm` (and one `font-semibold`) section labels are `ui-text-heading`; the redundant `text-base-content` went with the size. The three muted `font-700 text-sm` sub-labels under a Card header (`slide_deck/settings.tsx:211`, `logo_section_editor.tsx:33`, `markdown_guide.tsx:53`) stay as the review left them: no ruling covers a muted sub-label, and this session does not add one. |
| 3 | Step 3 fixed. 12 files. Floor: typecheck exit 0, tests exit 0 (428 passed), protocols exit 0. |
| 3 | Finding: `data/geojson/upload_wizard/step_4.tsx:152` is `ui-text-heading mb-1` inside the `text-warning-subtle-content` box, and `.ui-text-heading` applies `text-base-content` (`panther/_303_components/_fixed.css:1319`), so the heading now renders in the base colour where the bare `font-700` it replaced inherited the box's warning colour. The review named this site as needing that colour on the heading; the fix row's "keeping their colour utilities" covers only the two `text-danger` sites, which had a utility to keep. Add `text-warning-subtle-content` beside `ui-text-heading`, as the chat panes carry `text-primary-content`. No other site this fix converted sits in a coloured wrapper. |
| 3 | Step 3 reviewed: 1 finding. Surface held: `5bc173f1` touches 12 files under `client/src/components/data` and `client/src/components/products` and this plan (13 in `git show --stat`). Every changed code line (19) converts `font-700` or `font-semibold` to `ui-text-heading`, dropping only `text-sm` and, at `edit_indicator_form.tsx:750,958`, the redundant `text-base-content`; the plan diff is the Next step line and the three fix rows. Finding 1 resolved at 11 of its 12 sites (`ai_document_selector_modal.tsx:162`, `prompt_library_modal.tsx:534`, `step_3_configure.tsx:56,76`, `iceh/imports/wizard.tsx:97`, `step_5_import.tsx:313,370,414,439`, and `csv_staging_summary.tsx:94` and `upload_attempt_form.tsx:235` with `text-danger` kept); the twelfth is the finding above. `dhis2_run_view.tsx:121` left as ruled. Finding 2 resolved at all seven sites it named (`edit_indicator_form.tsx:750,958`, `indicator_code_editor.tsx:634,826,984`, `deck_version_preview.tsx:811`, `report_version_preview.tsx:390`); the fix row's "seven `font-700 text-sm` (and one `font-semibold`)" reads as eight, but the finding named six `font-700 text-sm` and one `font-semibold`. The three muted sub-labels (`slide_deck/settings.tsx:211`, `logo_section_editor.tsx:33`, `markdown_guide.tsx:53`) are unchanged, as the review left them. Floor: typecheck exit 0, tests exit 0 (428 passed, 2 ignored), protocols exit 0 (16 baselined). |
| 3 | Third fix: `geojson/upload_wizard/step_4.tsx:152` carries `text-warning-subtle-content` beside `ui-text-heading`. |
| 3 | Step 3 fixed. 1 file. Floor: typecheck exit 0, tests exit 0, protocols exit 0. |
| 3 | Step 3 reviewed: pass. Surface held: `c932c109` touches `client/src/components/data/geojson/upload_wizard/step_4.tsx` and this plan (2 in `git show --stat`). The one changed code line adds `text-warning-subtle-content` beside `ui-text-heading` at `step_4.tsx:152`, keeping `mb-1`, so the heading carries the box colour over `.ui-text-heading`'s `text-base-content`, as `chat_pane.tsx:486` carries `text-primary-content`; the plan diff is the Next step line and the two fix rows. Finding resolved. Floor: typecheck exit 0, tests exit 0 (428 passed, 2 ignored), protocols exit 0 (16 baselined). |
