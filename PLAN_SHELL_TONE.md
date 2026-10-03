# PLAN: Tonal top bars and inset rail items

Give the instance shell a surface step. Every top bar (the shell header and the
heading bar of every full-page view) sits on the kit's tonal header surface,
retuned to base-300, with no line under it. The rail stays white and its items
become inset rounded blocks. Page bars, the editors' menu and toolbar rows, and
every content surface stay as they are. Chosen from the mock at
https://claude.ai/artifact/PvQzC1Bm1duXEmXMqTaXVL (option H1, tone base-300,
lines dropped, rail item Inset).

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. Step 3's review deletes the file.

All app work is in this checkout,
`/Users/timroberton/projects/apps/wb-fastr-v2`, on `version2`. Panther work
(Step 1 only) is in the panther source at
`/Users/timroberton/projects/panther/timroberton-panther` and reaches this
checkout by sync. Read first: `CLAUDE.md`, then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_SHELL_TONE.md."
- Branch: `version2`, in this checkout only; the panther source commits to its
  `main`. Nothing is edited under `panther/` here.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Step 1 also runs the panther repo's own four commands (its
  `CLAUDE.md`): `deno task typecheck`, `deno run -A clean.ts --dry-run`,
  `deno task test`, `deno task test:engine`.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.
- Peculiar to this plan: panther is edited only in the panther source repo and
  reaches this repo only through `./sync wb-fastr-v2` run from there. The sync
  refuses a dirty app tree, runs panther's gates, copies the working tree
  wholesale and commits the copy in this repo itself. That commit is a Step 1
  commit and carries nothing else.

## 1. The problem

The shell has no surface step. The header, the rail and every page sit on
base-100, and 1px lines are the only structure.

- The header is a hand-rolled div, `bg-base-100 … border-b`
  (`client/src/components/instance/instance.tsx:216`). Its Help, language and
  bell controls are `intent="base-100"` fills (lines 227, 276, 284, 316, 328)
  and the profile hit area is `ui-hoverable-base-100` (line 337): invisible at
  rest on white, white boxes on anything else.
- The rail is panther's vertical `TabsNavigation`, which paints `bg-base-100` on
  its container (`panther/_303_components/layout/tabs/tabs_navigation.tsx:111`)
  and, for the selected item, `bg-base-200` with a 4px inset primary bar
  (line 86) over full-bleed `py-4 pr-4 pl-5` items (line 81).
- Every full-page view (the deck and report editors, the indicator managers, the
  package page, the Data sub-pages, the user detail) covers the header and the
  rail and opens with its own `HeadingBar`, flush: `<HeadingBar tonal>` is used
  nowhere in `client/src`.
- The kit's one tonal header surface is base-200
  (`panther/_303_components/_fixed.css:327`). Against base-100 that is a 1.10:1
  step, which needs a line to read as an edge; base-300 is 1.24:1 and reads on
  its own. The hairline is 1.55:1.

## 2. The model

- **Top bar.** The shell header, and the `HeadingBar` that opens a full-page
  view: a view reached through `openShellEditor`, `openSubPage`, an editor's own
  `getEditorWrapper()` or a wizard step. Its first slot holds the view's back or
  close control, or the heading of a form that closes from its body.
- **Page bar.** A `HeadingBar` inside a page's content, under a top bar: the
  Products toolbar, the Explore tab bar, the population grid's bar.
- **The tone.** `--ui-heading-bar-tonal-bg`, the kit's one tonal header surface,
  retuned by the app to base-300. `--ui-heading-bar-tonal-fg` stays
  base-content.
- **Inset items.** Rail items drawn as rounded blocks inset from the rail's
  edges, the selected one filled, none with a bar.

End state: every top bar is `<HeadingBar tonal>`, on base-300, with no line
under it, in both schemes. Page bars stay flush. The rail stays base-100 with
its right-hand line, and its items are inset. Quiet controls on a top bar are
`intent="base-300"` fills; outline controls on a top bar declare
`onBackground="base-300"`; primary, success, danger and neutral fills are
unchanged. In the deck and report editors only the `HeadingBar` changes; the
`MenuRow` and toolbar rows under it stay as they are.

## 3. Rulings

1. **The tone is base-300, set once.** `client/src/app.css` adds
   `--ui-heading-bar-tonal-bg: var(--color-base-300);` to its `@theme` block.
   The token is a `light-dark()` pair, so both schemes follow. `-fg` is not
   overridden.
2. **`tonal` stays a boolean.** No call site names a tone.
   `PROTOCOL_UI_COMPONENTS.md` ("`HeadingBar`: every header bar"): "There is
   deliberately no way to pick which tonal colour at a call site. The surface is
   `--ui-heading-bar-tonal-bg` / `-fg`, retuned once per app." The knob in
   ruling 1 is that retune, so `HeadingBar` is not changed.
3. **No line under a top bar.** `tonal` already draws none:
   `heading_bar.tsx:64-69` picks `ui-heading-bar-tonal` instead of `border-b`.
   Nothing is added.
4. **Every top bar is tonal; every page bar stays flush.** The editors' top bars
   are tonal by Tim's instruction; the other full-page views follow so that
   opening a view keeps the tone. The page bars named in §2 keep `border-b`.
5. **In the editors only the `HeadingBar` changes.** `HeaderRows`, `MenuRow` and
   the toolbar rows in `slide_list.tsx` and `report.tsx` keep their surface and
   their lines.
6. **Controls on a tonal bar.** `onBackground` reaches only outline buttons
   (`button.tsx`, `getButtonClasses`), so it is not the answer for the shell's
   fills. On a top bar: a quiet fill (`intent="base-100"`) becomes
   `intent="base-300"`, the same idiom on the new surface; an outline `Button`,
   `MenuButton` or `ButtonGroup` declares `onBackground="base-300"` (styling
   rule 7); primary, success, danger and neutral fills are unchanged; a
   `ui-hoverable-base-100` hit area becomes `ui-hoverable-base-300`.
   `MenuButton` has no ghost form, which is why the fill idiom is kept.
7. **Rail items are inset, the rail is not.** The rail keeps `bg-base-100` and
   `FrameLeft`'s right-hand line. A new `inset?: boolean` on `TabsNavigation`
   (vertical only, like `collapsible`) changes the items: the rows container
   gains `flex flex-col gap-0.5 px-1.5 pt-1.5`; an item is
   `py-2.5 pr-2.5 pl-3.5 rounded` instead of `py-4 pr-4 pl-5` (collapsed:
   `px-0 py-2.5 justify-center`); the selected item is
   `bg-base-200
   text-primary` with no inset bar; unselected items keep
   `ui-hoverable-base-100 text-base-content hover:text-primary`.
8. **The collapse chevron stays `intent="base-100"`.** It sits on the white
   rail.
9. **The shell header becomes a `HeadingBar`.**
   `<HeadingBar tonal leftChildren={ident}>{cluster}</HeadingBar>` as
   `FrameTop`'s panel, where `ident` is the instance name and logo block and
   `cluster` the right-hand controls. Both are built once as `const`s above the
   JSX, because `FrameTop` reads `panelChildren` twice and an inline piece is
   built twice (`report.tsx:2386-2394`). The `data-tour` anchors stay on the
   controls. The name keeps `text-xl font-700` (the one allowed exception in
   `PROTOCOL_APP_UI_CONVENTIONS.md`).
10. **Panther changes arrive by sync.** The panther commit and the sync commit
    are separate commits; the sync diff holds nothing but the Step 1 files and
    the banner the sync prepends.

## 4. Steps

### Step 1: `inset` on `TabsNavigation` (panther)

**Surface.** In the panther source repo:
`modules/_303_components/layout/tabs/tabs_navigation.tsx`,
`protocols/PROTOCOL_UI_COMPONENTS.md`. In this repo: the two synced copies under
`panther/`, by the sync commit only.

**Deliverable.** Ruling 7. The prop is documented in one sentence in
`PROTOCOL_UI_COMPONENTS.md`, next to rule 10 (the `TabsNavigation` rule), and
the prop comment in the source says what it changes. Horizontal strips,
`collapsible`, badges, dots and the collapse button are untouched. A sync into
this repo whose diff is those two files.

**Not in this step.** Using the prop anywhere (Step 2). Any rail surface prop.

**Gates.** The panther repo's four commands, then `./sync wb-fastr-v2` from the
panther repo with this repo clean, then the floor here. The sync diff is checked
with `git show --stat HEAD` on the sync commit: two files.

**Ends with.** One commit in the panther repo, then the sync's own commit here.

### Step 2: the shell

**Surface.** `client/src/app.css`,
`client/src/components/instance/instance.tsx`, `SYSTEM_14_client_shell.md`,
`PROTOCOL_APP_UI_CONVENTIONS.md`.

**Deliverable.** Rulings 1, 3, 6, 7, 8 and 9. In `app.css` the knob, with a
comment naming it as the app's retune of the kit's one tonal header surface. In
`instance.tsx` the header is a tonal `HeadingBar` built from two `const`s; the
Theme, Help, versions, language and bell controls are `intent="base-300"`; the
profile hit area is `ui-hoverable-base-300`; the rail's `TabsNavigation` passes
`inset`. Docs: the shell paragraph in `SYSTEM_14_client_shell.md` (the one that
starts "The shell is `ShellEditorWrapper`") says the header is a tonal
`HeadingBar` and the rail's items are inset; in `PROTOCOL_APP_UI_CONVENTIONS.md`
the "Today's app-level additions" list gains the knob, the "No inverted chrome"
bullet says top bars are tonal `HeadingBar`s and page bars flush, and the
"Instance page" pattern names the tonal header and the inset rail.

**Not in this step.** Any other `HeadingBar` (Step 3). The page bars.

**Gates.** The floor, plus:

```
grep -n 'intent="base-100"\|ui-hoverable-base-100' client/src/components/instance/instance.tsx   # nothing
grep -c 'heading-bar-tonal-bg' client/src/app.css                                                 # 1
```

**Ends with.** One commit.

### Step 3: the full-page top bars

**Surface.** The files under `client/src/components/` that hold a top bar:

```
_shared/figure_editor/view_results_object.tsx
data/facilities/facilities.tsx
data/facilities/import/upload_attempt_form.tsx
data/family_configuration.tsx
data/general/admin_area_labels.tsx
data/geojson/manager.tsx
data/hfa/_shared/time_points.tsx
data/hfa/dataset/dataset.tsx
data/hfa/dataset/delete_data.tsx
data/hfa/dataset/time_points_view.tsx
data/hfa/hfa_weights.tsx
data/hfa/imports/imports.tsx
data/hfa/imports/run_detail.tsx
data/hfa/indicators/indicator_code_editor.tsx
data/hfa/indicators/manager.tsx
data/hfa/indicators/xlsx_upload_form.tsx
data/hmis/dataset/dataset.tsx
data/hmis/dataset/delete_data.tsx
data/hmis/dataset/import_ledger_indicator_detail.tsx
data/hmis/imports/csv_run_detail.tsx
data/hmis/imports/dhis2_run_detail.tsx
data/hmis/imports/import_information.tsx
data/hmis/imports/imports.tsx
data/hmis/indicators/dhis2_indicator_select_form.tsx
data/hmis/indicators/manager.tsx
data/hmis/population/import_form.tsx
data/hmis/population/manager.tsx
data/iceh/dataset/dataset.tsx
data/iceh/dataset/delete_data.tsx
data/iceh/imports/imports.tsx
data/iceh/imports/run_detail.tsx
products/_shared/version_history/version_history.tsx
products/report/report.tsx
products/slide_deck/settings.tsx
products/slide_deck/slide_list.tsx
results_packages/module_defaults.tsx
results_packages/package_page.tsx
results_packages/package_view/view_files.tsx
results_packages/package_view/view_logs.tsx
results_packages/package_view/view_script.tsx
scopes/scopes.tsx
users/user.tsx
```

Not in the surface, because their bars are page bars: `products/products.tsx`,
`explore/explore.tsx`, `data/hmis/population/grid.tsx`.

**Deliverable.** Rulings 4, 5 and 6. Every `<HeadingBar` in the surface carries
`tonal` (a file may hold more than one; each is a top bar of its own view or
wizard step). Every outline control rendered in those bars' slots, including
actions built as a `const` above the bar (`report.tsx` `headerActions`,
`slide_list.tsx` `headerActions`, `settings.tsx`'s pencil), declares
`onBackground="base-300"`; every quiet fill in them (the refresh button at
`version_history.tsx:153` is one) is `intent="base-300"`. Nothing under a top
bar changes: not `HeaderRows`, not a tab strip, not a page bar, not a toolbar in
content.

**Not in this step.** The three page bars. Any control outside a top bar.

**Gates.** The floor, plus, from `client/src/components/`:

```
grep -L "tonal" <every file in the surface>                                              # nothing
grep -n "tonal" products/products.tsx explore/explore.tsx data/hmis/population/grid.tsx   # nothing
```

**Ends with.** One commit, or one per area (products, results packages, data,
users and scopes), each green.

## 5. Gates catalogue

| Gate                                         | First reached |
| -------------------------------------------- | ------------- |
| Panther's four commands and the sync's gates | Step 1        |
| The floor                                    | Step 1        |
| The two shell greps                          | Step 2        |
| The three top-bar greps                      | Step 3        |

## 6. Out of scope

- A tone on the rail, a frame around the page, an inset sheet, a tinted work
  area with cards, tonal page bars, a Deep Green surface anywhere, removing or
  shrinking the header: the mock's other options.
- A surface prop on `TabsNavigation`, or any change to the rail's hover family.
- The dark-scheme logo (dark green on the dark base), which predates this plan.
- Any tone other than base-300, and any per-call-site tone.

## 7. Rollout and rollback

Nothing ships before Step 3's review passes; then the work rides the next
deploy. Rollback in this repo is a revert of the Step 3 and Step 2 commits, in
that order; the Step 1 sync commit can stay, since an unused prop changes
nothing. Rolling back panther is a revert of its commit followed by a sync.

## 8. Build log

| Session | Row |
| ------- | --- |
