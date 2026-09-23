# PLAN: One coherent set of text sizes

Status: ready once [PLAN_BASE_TEXT_SIZE.md](PLAN_BASE_TEXT_SIZE.md) is done.
Brings every piece of UI text onto a small set of roles drawn from the rem
scale, so the same kind of text is the same size everywhere, and adds a lint
that keeps it that way.

**Next step:** Do 2

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
