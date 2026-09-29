# PLAN_CONTAINER_MODEL_MIGRATION: take the kit's container model

> **Status (2026-09-29):** Not started. Written in the panther session that
> built the model; the site counts are from that session's audits of this app on
> 2026-09-29 and are re-grepped by each step. The app protocol binds plans to
> `tim-branch`; this plan binds to `version2`, where the tree is today, and Tim
> confirms which before Do 1.

**Next step:** Review 3

Panther's UI kit now puts a container's inset and stack spacing on its slot
(`pad` / `spy` on every Frame content slot, `panelPad` / `panelSpy` on side
frames, `pad` / `spy` on `Card`, `ModalContainer` and `CollapsibleSection`), and
makes `StateHolderWrapper` a pass-through with no inset of its own. Three props
this app uses are gone or renamed: `noPad` on `StateHolderWrapper` and
`LoadingIndicator`, `noContentPadding` on `ModalContainer`, and `padding` on
`CollapsibleSection`. The next sync breaks the client typecheck until they are
migrated. This plan syncs, makes the client typecheck again, then moves the
insets the app builds by hand onto the slots the kit now provides, and rewrites
the app's own layout guidance to match.

The model is `panther/DOC_CONTAINER_MODEL.md`. The rules app code follows are
rule 11 of `panther/protocols/PROTOCOL_UI_COMPONENTS.md`, rules 20 to 22 of
`panther/protocols/PROTOCOL_UI_STYLING.md`, and rule 8 of
`panther/protocols/PROTOCOL_UI_STATE.md`. A worked migration of a small app is
panquery's commit `8804117`.

## 0. How to work this plan

The bindings are `PROTOCOL_APP_PLANS.md`; the cadence, session shapes and the
two-things rule are `panther/protocols/PROTOCOL_ALL_PLANS.md`. This plan adds:

- Instruction: "Do the next step of PLAN_CONTAINER_MODEL_MIGRATION.md."
- Branch: `version2` (see the status line). Repo: this one. The kit is never
  edited here: `panther/` changes only through `./sync wb-fastr-v2` run in the
  panther repo (`/Users/timroberton/projects/panther/timroberton-panther`),
  which refuses a dirty tree and commits the copied files itself.
- Floor: the app protocol's (`deno task typecheck`, `deno task test`,
  `./validate_protocols`, `./run`). No step touches migrations, the schema, the
  query engine or help text, so no conditional gate applies.
- No step adds, moves or deletes a file, so no SYSTEM manifest changes. The
  prose that moves with the code is `PROTOCOL_APP_UI_CONVENTIONS.md`, in step 3.
- Build log: §8. Last step: 3. The reviewer of step 3 deletes this file.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_14_client_shell.md`, `panther/DOC_CONTAINER_MODEL.md`, §2 and §3 of
  this plan, the step's own section in §4, and §8.
- Vocabulary is the DOC's: container, slot, inset, stack spacing, pass-through.

## 1. The problem

The client builds every inset by hand around kit containers, and the kit's old
wrapper pads only some of its states:

- 74 Frame slots. About 22 content slots and 4 panel slots hold a
  `<div class="ui-pad [ui-spy]">` that does nothing the slot now does (some
  adding only a redundant `h-full` or `overflow-auto`); the app's own protocol
  names that shape "Pattern A". About 16 content slots and 7 panel slots hold an
  `overflow-auto` div inside a slot that already scrolls, which rule 20 now
  forbids.
- 60 `StateHolderWrapper` sites. 28 pass `noPad`, 25 of those inside a padded
  parent. Of the 32 without it, 7 pad the ready branch by hand to match the old
  built-in loading inset, 21 leave a flush ready branch under a padded loading
  message, and 5 double-inset because the wrapper sits in a padded parent
  (`figure_editor.tsx`, `dataset_display_presentation.tsx`,
  `report_version_compare.tsx`, `step_4_recode.tsx` twice). 10
  `LoadingIndicator` sites, 5 with `noPad`.
- 6 `noContentPadding` modals, 4 of which re-apply `ui-pad` on their own body
  child. 3 `CollapsibleSection padding="sm"` in
  `products/copilot/ai_prompt_library/prompt_library_modal.tsx`.
- 66 `ModalContainer` sites. The kit's modal inset is now the kit's 1rem token
  on every row; nothing in the app compensates for the old `px-6 py-5`.

After the sync, `noPad`, `noContentPadding` and `padding` are type errors, and
the wrapper's loading and error blocks render bare, so the 21 flush sites and
the 5 bare `LoadingIndicator` sites lose an inset they had.

## 2. The model

A slot owns the space around its content and between its children; a Frame slot
owns scrolling; the slot knob comes first, and a raw element is for what the
slot cannot say. App code composes kit containers with no padding `<div>`
between a container and its content, and passes `loadingAndErrorPad` only where
a wrapper's ready branch is flush in a `none` slot.

## 3. Rulings

1. `noPad` on `StateHolderWrapper` and `LoadingIndicator` is deleted, nothing
   added in its place. `noPad` on `TabsNavigation` is a different prop and
   stays.
2. `noContentPadding` becomes `pad="none"`. Where the body's own child is a
   `ui-pad` div that exists only to re-apply the inset, both the prop and the
   div go and the body takes the default `md`. Where the body is flush on
   purpose (a diff, a figure picker, a wizard step that manages its own inset),
   `pad="none"` stays and the child is untouched.
3. `padding="sm"` on `CollapsibleSection` becomes `headerPad="sm"`.
4. `loadingAndErrorPad` is set only where the wrapper's ready branch is flush in
   a `none` slot, at the size of the content's own inset: `"md"` over a default
   `Table`, `"sm"` over a compact one. Where a centred indicator reads better
   than a bare line (a full-height pane), `spinner` instead. Inside a padded
   parent or a padded slot, nothing is set. A bare `LoadingIndicator` that had
   the built-in inset passes `pad="md"` or becomes `Spinner`.
5. A padding div that is a Frame slot's direct child moves its inset and stack
   spacing to `pad` / `spy` (`panelPad` / `panelSpy` on a panel slot) and is
   deleted when it carries nothing else. It stays, with its inset moved to the
   slot where the slot can carry it, when it also carries a width limit, a
   background, a `data-*` attribute (Frames do not forward `data-*`; eight
   `data-tour` divs are known: `settings.tsx`, `assets.tsx` twice,
   `slide_list.tsx`, `list_view.tsx`, `results_packages.tsx`, `users.tsx`,
   `report.tsx`), a `h-full` host for a table, or a scroll element app code
   reads. A one-axis inset (`ui-pad-x`, `ui-pad-t`) and a slot that mixes a
   padded branch with a flush one stay raw elements as they are.
6. A `<Show>` passed as `panelChildren` never gets `panelPad`: the side frame
   draws the panel even when the `Show` is false, and the knob would pad an
   empty strip. Five `FrameRight` sites do this; their panel divs also carry a
   width and stay.
7. A `h-full w-full overflow-auto` (or `overflow-auto`) div that is a Frame
   slot's direct child and does nothing else is deleted (rule 20). One that
   carries a background, an `overflow-y-scroll` gutter, or is read by app code
   stays.
8. The modal inset is the kit's. No app site adds a wrapper to restore the old
   metric. If the 1rem look is rejected, the fix is in the panther repo (revert
   its commit `8b2e073` and re-sync), never here.
9. `Card` keeps its explicit `pad` values; no site is changed to use `spy` on
   `Card`, `ModalContainer` or `CollapsibleSection` unless it already stacks its
   body with a `ui-spy` div that exists for nothing else.
10. Nothing outside the sites a step names is touched. A typecheck error the
    sync exposes that is not one of the three props is reported in §8, not
    fixed.

## 4. Steps

### Step 1: sync and the mechanical migration

**Surface.** `panther/` (through the sync only), and every client file that
passes `noPad` to `StateHolderWrapper` or `LoadingIndicator`, `noContentPadding`
to `ModalContainer`, or `padding` to `CollapsibleSection`.

**Deliverable.** Rulings 1, 2, 3, 10. The tree is clean before the sync (Tim's
own uncommitted work is committed or stashed by Tim, never by the session).
`./sync wb-fastr-v2` has run from the panther repo at its `main` head and made
its own commit. Every one of the three props is gone from `client/src`, and the
client typechecks. A `noContentPadding` site whose body child re-applied
`ui-pad` has lost both (ruling 2); the other sites pass `pad="none"`.

**Not in this step.** `loadingAndErrorPad` anywhere. Any Frame slot. Any doc.

**Gates.** Floor. `grep -rn "noPad" client/src` returns only `TabsNavigation`
sites. `grep -rn "noContentPadding" client/src` and
`grep -rn 'padding="sm"' client/src/components/products/copilot` return nothing.
`git log --oneline -3` shows the sync's own commit followed by this step's one
migration commit.

**Ends with.** Two commits: the sync's, then one migration commit.

### Step 2: the wrapper's message blocks

**Surface.** Every client file with a `StateHolderWrapper` or `LoadingIndicator`
site.

**Deliverable.** Ruling 4. The Do session greps every wrapper site, decides for
each whether its ready branch is flush in a `none` slot, and records the count
and the decision rule in §8 (the audit expects about 23 flush sites: 21 that had
a padded loading message over a flush ready branch, plus the 2 that passed
`noPad` there). Each flush site passes `loadingAndErrorPad` or `spinner`. Each
of the bare `LoadingIndicator` sites (`slide_list.tsx`, `slide_deck.tsx`,
`copilot.tsx`, `package_page.tsx`) passes `pad="md"` or becomes `Spinner`. The 7
sites that padded the ready branch by hand to match the old loading inset are
left for step 3, which moves that inset to the slot; they are listed in §8 by
file and line.

**Not in this step.** Any Frame slot or padding div. Any doc.

**Gates.** Floor. §8 has one row listing every `loadingAndErrorPad` and
`spinner` added, by file and line, and one row listing the 7 deferred sites.

**Ends with.** One commit.

### Step 3: the Frame slots and the app's guidance

**Surface.** Every client file with a Frame whose slot's direct child is a
padding div or an `overflow-auto` div, including the 7 sites deferred from step
2; `PROTOCOL_APP_UI_CONVENTIONS.md`.

**Deliverable.** Rulings 5, 6, 7, 9. Every exact-fit padding div under a Frame
slot is gone and its inset and spacing are on the slot. Every padding div that
stays has a reason from ruling 5, recorded in §8 by file and line. Every
redundant `overflow-auto` div under a slot is gone; every one that stays has a
reason from ruling 7, recorded the same way. In
`PROTOCOL_APP_UI_CONVENTIONS.md`, Pattern A reads `FrameTop pad="md" spy="md"` +
`HeadingBar` with no div, the settings-page line under "Recurring scaffolds"
says the page's inset is the Frame's `pad` / `spy`, and the "What panther owns"
list points at rule 11 of `PROTOCOL_UI_COMPONENTS.md` for insets and scrolling.
The file restates no panther fact.

**Not in this step.** `panelPad` on a `<Show>` panel (ruling 6). Any div that
carries a one-axis inset, a background or a `data-*` attribute, beyond moving
its symmetric inset to the slot where ruling 5 allows.

**Gates.** Floor.
`grep -rn -A2 -E '<Frame(Top|Left|Right)[A-Za-z]*' client/src
| grep -E '<div class="ui-pad( ui-spy)?"'`
returns nothing, and every remaining `ui-pad` div directly under a Frame slot
(found by reading the 74 sites, not by grep alone) is in the §8 reasons row.
`grep -rn 'class="h-full w-full
overflow-auto"' client/src` returns nothing.
`grep -n "ui-pad.ui-spy\|div.ui-pad" PROTOCOL_APP_UI_CONVENTIONS.md` returns
nothing.

**Ends with.** One commit. After this step's review passes, the reviewer deletes
this file in the same commit that records the review.

## 5. Gates catalogue

| Gate                                                                      | First reached |
| ------------------------------------------------------------------------- | ------------- |
| Floor (§0)                                                                | Step 1        |
| Sync commit present; `panther/` matches panther `main`                    | Step 1        |
| No `noPad` outside `TabsNavigation`, no `noContentPadding`, no `padding=` | Step 1        |
| §8 rows: every `loadingAndErrorPad` / `spinner`, the 7 deferred sites     | Step 2        |
| No exact-fit `ui-pad` div under a Frame slot; reasons row for the rest    | Step 3        |
| No `h-full w-full overflow-auto` div under a slot                         | Step 3        |
| `PROTOCOL_APP_UI_CONVENTIONS.md` names no padding div                     | Step 3        |

## 6. Out of scope

- `spy` on `Card`, `ModalContainer` or `CollapsibleSection` at sites that do not
  already stack with a `ui-spy` div (ruling 9).
- `panelPad` on the five `<Show>` panels (ruling 6); passing `undefined` instead
  of an empty `<Show>` there is a separate change.
- A `data-*` forwarding on Frame slots, which would delete the eight `data-tour`
  divs: a kit decision, taken in the panther repo.
- Any change to the modal metric (ruling 8).
- The `_237_deck` module, excluded from this target's sync.
- Hand-built flex columns with a `flex-1 overflow-auto` region that are
  `FrameTop`s written by hand (about 22): a later plan, since each is a layout
  rewrite, not a slot migration.

## 7. Rollout and rollback

Nothing ships. Each step's commits land on `version2`; `./deploy_testing` is not
run by any step.

Rollback of step 2 or 3 is `git revert` of its commit. Rollback of step 1 is
`git revert` of the migration commit and of the sync commit together, which
restores the previous kit copy and the props it accepted; a panther fix instead
goes through the panther repo and a fresh sync.

## 8. Build log

| When | Step | Row |
| ---- | ---- | --- |
| 2026-09-29 | 1 | Sync done by Tim before the session: `8b92d4e7f` (panther `5683c15`). The Explore plan's `a9f098143` landed between the sync and this step's commit, so `git log -3` does not show the two adjacent. |
| 2026-09-29 | 1 | Counts: 27 `StateHolderWrapper` and 6 `LoadingIndicator` `noPad` sites (33), not 28 and 5. The sixth indicator is `prompt_library_modal.tsx:299`, whose tag sits more than three lines above the prop. |
| 2026-09-29 | 1 | Ruling 2 gap: all four re-applying modal bodies (`hfa/imports/wizard.tsx`, `hmis/imports/csv_wizard.tsx`, `hmis/imports/wizard/wizard.tsx`, `iceh/imports/wizard.tsx`) also carry `min-h-[24rem]`, three with `ui-spy`, so the div does not exist only for the inset. Resolved as ruling 5 does for a Frame slot: the prop is gone, the body takes the default `md`, the div keeps its min-height and its own stack spacing. Render is unchanged (`ui-pad` moved one element up). |
| 2026-09-29 | 1 | Ruling 2, the other two: `insert_figure.tsx` (a fixed-height picker) and `markdown_diff.tsx` (a CodeMirror mount) pass `pad="none"`, child untouched. |
| 2026-09-29 | 1 | Floor, typecheck: red mid-session from `explore/module_view.tsx`, the Explore plan's uncommitted work in the same tree (outside this surface, not fixed); HEAD plus exactly this step's hunks typechecked clean in a scratch copy meanwhile. Green in the tree once that work landed as `95c8f4f3b`. |
| 2026-09-29 | 1 | Floor, test: the first run failed 9 tests while `./run` (Tim's) was replacing the Postgres container; the rerun passed 469, 0 failed. `./validate_protocols` passes; its one stale baseline entry is `instance/email_opt_in_modal.tsx`, deleted on 2026-09-23 before this plan, not pruned. `./run` not started by this session: the app was already running from this tree on 8000 and 3000, and `./run` replaces the containers. |
| 2026-09-29 | 1 | `explore/data_table/data_table.tsx` and `explore/timeseries.tsx` held both workstreams' edits during the session; the Explore hunks went out in `95c8f4f3b`, leaving only this step's one `noPad` hunk in each. |
| 2026-09-29 | 1 | Step 1 built. |
| 2026-09-29 | 1 | Review: the ruling 2 gap row's "render is unchanged" is inexact. `min-h-[24rem]` is border-box under Tailwind's preflight, so it used to include the div's own 1rem inset; with the inset on the body the minimum body height is 24rem plus the body's 2rem in `hfa/imports/wizard.tsx:303`, `hmis/imports/csv_wizard.tsx:356` and `iceh/imports/wizard.tsx:169` (`hmis/imports/wizard/wizard.tsx:555` sits under a fixed `height="lg"`, unaffected). The resolution stands: the div is a min-height host, not a padding div, which is §2's shape, and a `22rem` literal would encode the old inset. No code change. |
| 2026-09-29 | 1 | Review: §0's reading list names `panther/DOC_CONTAINER_MODEL.md`, but the sync copies only `protocols/*.md` (the manifest's `protocols` list), so the file is not in this tree. It is read from the panther repo root, `/Users/timroberton/projects/panther/timroberton-panther/DOC_CONTAINER_MODEL.md`, and steps 2 and 3 read it there. |
| 2026-09-29 | 1 | Review: surface clean (32 client files, each hunk one of the three props, plus this file). Rulings 1, 2, 3, 10 present in the code; the old `CollapsibleSection padding` padded only the header row, so `headerPad="sm"` keeps the render. Floor: typecheck green, test 469 passed 0 failed on the first run, `./validate_protocols` passed with the one stale baseline entry already logged. `./run` not started: `docker ps` showed `pg` and `valkey-local` up (Tim's, restarted during the review) and deno on 8000 and vite on 3000 listening. Greps: `noPad` only at the two `TabsNavigation` sites (`hmis/imports/imports.tsx:350`, `hfa/indicators/unused_variables_modal.tsx:59`); `noContentPadding` and `padding="sm"` none. |
| 2026-09-29 | 1 | Step 1 reviewed: 2 findings. |
| 2026-09-29 | 2 | Decision rule, applied to all 60 wrapper sites by reading each parent: a site is flush in a `none` slot when the nearest ancestor element carries no `ui-pad` (a Frame slot, a modal body with `pad="none"`, a bare `h-full` or `flex-1` div) and the ready branch starts at the edge. Such a site whose ready branch fills the pane (a Frame, an editor, a full-height table, a preview column) gets `spinner`; one whose ready branch is inline content gets `loadingAndErrorPad` at the content's inset. A site under a `ui-pad` or `ui-pad-x` ancestor, in a default modal or `Card` body, or with its own `loadingRenderer`, gets nothing. |
| 2026-09-29 | 2 | Added, `spinner` (17): `results_packages/package_page.tsx:303`, `explore/explore.tsx:192`, `explore/data_table/data_table.tsx:81`, `hfa/indicators/indicator_code_editor.tsx:157` and `:159`, `hmis/dataset/dataset.tsx:364`, `hfa/dataset/dataset_items_holder.tsx:56`, `iceh/dataset/dataset_items_holder.tsx:54`, `version_history/deck_version_preview.tsx:209`, `version_history/report_version_preview.tsx:172` and `:322`, `figure_editor/visualization_editor.tsx:92`, `figure_editor/view_results_object.tsx:62`, `hfa/hfa_weights.tsx:141`, `facilities/with_csv.tsx:60`, `facilities/import/upload_attempt_form.tsx:215`, `hmis/population/grid.tsx:228`. Added, `loadingAndErrorPad` (2): `instance/logged_in_wrapper.tsx:155` `"md"` (the page root has no definite height for a centred spinner), `version_history/version_history.tsx:166` `"sm"` (rows are `px-3 py-2`). Bare `LoadingIndicator`: `slide_list.tsx`, `slide_deck.tsx`, `package_page.tsx:99` pass `pad="md"`; `copilot.tsx:102` is `Spinner` (a full-height side panel). 19 wrapper sites, not the audit's 23: `access_tokens.tsx:178` sits in a `p-8` div, `xlsx_upload_form.tsx:225` and `step_4_recode.tsx` sit in the editor host and the wizard body, and the audit's "21 flush" count included the 7 hand-padded sites' neighbours. |
| 2026-09-29 | 2 | Deferred to step 3, the ready branch padded by hand under a `none` Frame slot (7, plus one nested): `results_packages/module_defaults.tsx:86` (`ui-pad ui-spy` root of `ModuleDefaultsInner`), `package_view/view_script.tsx:47`, `package_view/view_files.tsx:49`, `package_view/view_logs.tsx:47`, `hfa/imports/imports.tsx:129`, `iceh/imports/imports.tsx:123`, `hmis/imports/imports.tsx:291` with its nested `:293`. |
| 2026-09-29 | 2 | Floor: `deno task typecheck` exit 0, `deno task test` 469 passed, `./validate_protocols` pass (same stale entry). `./run` not started: the app is still running from this tree. |
| 2026-09-29 | 2 | Step 2 built. |
| 2026-09-29 | 2 | Review: `_shared/figure_editor/figure_editor.tsx:908` is flush in a `none` parent and was neither handled nor deferred. Its nearest element is the `flex h-full w-full` row at `:849`, the `FrameLeftResizable` content slot's direct child, reached through element-less `Show`s; its ready branch is hand-padded (`ui-pad` at `:915` and `:928`, the `ui-pad h-full w-full overflow-auto` preview div at `:1016`). The loading text now renders bare as the row's first flex item, and step 3 will not reach it: `:849` is not a padding div, and `:1016` is not a slot's child and carries `data-cursor-zone`. Under the step's rule the site takes `spinner` (`:849` is definite) or `loadingAndErrorPad="md"`. Code change. |
| 2026-09-29 | 2 | Review: the reason given for `instance/logged_in_wrapper.tsx:155` is wrong. `html`, `body` and `#app` are `h-full` (`client/src/app.css:450-453`) and the wrapper's blocks reach `#app` through element-less `Show`s (`:98-99`) and the router, so a spinner would centre; by the step's rule (a ready branch that fills the pane) the site would be `spinner`. Whether it flips turns on the next row, since `"md"` is what insets this site's error block. No code change on its own. |
| 2026-09-29 | 2 | Review: `spinner` replaces only the indicator (`state_holder_wrapper.tsx:69-79`); the error block and the `ErrorBoundary` fallback still take `loadingAndErrorPad`, and the kit accepts both props together. None of the 17 `spinner` sites passes it, so their error blocks now sit bare at the slot edge where the old kit inset them, and two route ordinary outcomes through the error state: `data/facilities/with_csv.tsx:33-38` and `:50-53` ("No rows", "No structure data"), `data/hfa/dataset/dataset_items_holder.tsx:40-42` ("No data"). Ruling 4 and the DOC present `spinner` as the alternative to the pad, so the code follows the ruling. The fix needs Tim's ruling: `loadingAndErrorPad="md"` beside `spinner` at the 17 sites, or the kit insetting the error block under `spinner`. No code change under the rulings as written. |
| 2026-09-29 | 2 | Review: surface clean (20 client files, each hunk a wrapper or indicator prop plus the `LoadingIndicator` to `Spinner` import swap in `copilot.tsx`, and this file). The added row matches the tree: 17 `spinner`, 2 `loadingAndErrorPad`, the four bare indicators; the deferred row's 7 (+1) sites read as hand-padded under `none` Frame slots. 44 of the 60 sites read with their parents; every `spinner` site sits in a Frame slot or a `h-full` / `flex-1` host with a pane-filling ready branch. Floor: typecheck exit 0; test 469 passed, 0 failed, 3 ignored on the first run; `./validate_protocols` passed with the one stale entry already logged. `./run` not started: `docker ps` showed `pg` and `valkey-local` up, deno on 8000 and vite on 3000 listening. |
| 2026-09-29 | 2 | Step 2 reviewed: 3 findings. |
| 2026-09-29 | 2 | Fix, finding 1: `figure_editor/figure_editor.tsx:908` passes `spinner` (its host row at `:849` is `h-full`). |
| 2026-09-29 | 2 | Fix, finding 3, a choice ruling 4 does not cover, taken so the plan can proceed and open to Tim's overruling: every `spinner` site also passes `loadingAndErrorPad="md"`, since the kit's `spinner` replaces only the loading indicator and the error block would otherwise sit bare at the slot edge, a regression from the old kit at all of them and a visible one at `with_csv.tsx` and `hfa/dataset/dataset_items_holder.tsx`, which route "No data" through the error state. 19 sites: the 17 of step 2, `figure_editor.tsx:908`, and `logged_in_wrapper.tsx:155`, which per finding 2 now passes `spinner` too (`#app` is `h-full`) and keeps `"md"` for its error block. The alternative, insetting the error block under `spinner` in the kit, is a panther change and was not taken. Reverting this choice is one substitution: `spinner loadingAndErrorPad="md"` to `spinner` at the 19 sites. |
| 2026-09-29 | 2 | Floor: `deno task typecheck` exit 0, `deno task test` 469 passed, `./validate_protocols` pass. `./run` not started: the app is still running from this tree. |
| 2026-09-29 | 2 | Step 2 fixed. |
| 2026-09-29 | 2 | Re-review after the fix: one commit since `64d63c58e` (`8142c4ddc`), 17 client files plus this file, every hunk a prop on a `StateHolderWrapper` tag, and the plan hunk only the Next step line and four appended rows. Finding 1: `figure_editor.tsx:908` passes `spinner loadingAndErrorPad="md"`, its host row `:849` is `flex h-full w-full`. Finding 2: `logged_in_wrapper.tsx:155` passes `spinner` and keeps `"md"`; `html`, `body`, `#app` are `h-full` (`app.css:450-453`). Finding 3: the row matches the tree, 19 `spinner` props (the twentieth grep hit is a comment in `hmis/indicators/refresh_dhis2_labels_modal.tsx:12`), each with `loadingAndErrorPad="md"` on the same tag (`view_results_object.tsx:62-63` and `upload_attempt_form.tsx:215-216` on adjacent lines), plus `version_history.tsx:166` `"sm"`: 20 pad sites, no `spinner` without the pad. The choice stays open to Tim as logged. The step 2 rows and the fix rows together name every site by file and line, and the deferred row holds the 7 (+1). Floor: typecheck exit 0; test 469 passed, 0 failed, 3 ignored on the first run; `./validate_protocols` passed with the one stale entry already logged. `./run` not started: `docker ps` showed `pg` and `valkey-local` up, deno on 8000 and vite on 3000 listening. |
| 2026-09-29 | 2 | Step 2 reviewed: pass. |
| 2026-09-29 | 3 | Method: a parser over every `<Frame*` tag listed each site's panel and content slot's first element (74 sites); each padding div was read with its children before deciding. Deleted, inset and spacing on the slot (26 content divs, 4 panel divs): `geojson/manager.tsx`, `hfa/_shared/time_points.tsx`, `hfa/dataset/delete_data.tsx`, `hfa/dataset/time_points_view.tsx`, `hfa/imports/imports.tsx`, `hfa/imports/run_detail.tsx`, `hfa/imports/run_view.tsx` (panel and content), `hfa/indicators/manager.tsx:1006`, `hmis/dataset/dataset_display_presentation.tsx`, `hmis/dataset/delete_data.tsx`, `hmis/dataset/import_ledger_indicator_detail.tsx`, `hmis/imports/csv_run_detail.tsx`, `hmis/imports/csv_run_view.tsx` (panel and content), `hmis/imports/dhis2_run_detail.tsx`, `hmis/imports/dhis2_run_view.tsx` (panel and content), `hmis/imports/import_information.tsx`, `hmis/indicators/manager.tsx`, `iceh/dataset/delete_data.tsx`, `iceh/imports/imports.tsx`, `iceh/imports/run_detail.tsx`, `iceh/imports/run_view.tsx` (panel and content), `insert_figure/step_1_metric.tsx` (content), `results_packages/package_page.tsx:394`, `package_view/view_files.tsx` (`spy="sm"`), `users/user.tsx`, `results_packages/module_defaults.tsx` (the `ModuleDefaultsInner` root div became a fragment, so its children are the slot's). The 7 (+1) sites step 2 deferred are all among these or the next row. |
| 2026-09-29 | 3 | Padding divs that stay, inset moved to the slot (ruling 5), by current line: width limit: `family_configuration.tsx:207` and `general/admin_area_labels.tsx:71` (`ui-spy max-w-3xl`; their `overflow-auto` dropped under rule 20 since the div is the slot's direct child), `hfa/hfa_weights.tsx:219` (`ui-spy max-w-xl`), `hfa/indicators/xlsx_upload_form.tsx:130` and `hmis/population/import_form.tsx:133` (`ui-spy max-w-3xl`), `insert_figure/step_1_metric.tsx:59` (panel, `h-full w-56`, `panelPad`); `data-tour`: `assets/assets.tsx:95` (`h-full w-full`), `slide_deck/settings.tsx:160` (`ui-spy`); flex columns written by hand (§6): `users/users.tsx:152` (`flex h-full w-full flex-col gap-4`), `hmis/imports/imports.tsx:296` (`ui-spy flex h-full w-full flex-col overflow-auto`, its `overflow-auto` kept with the column); text styling: `package_view/view_logs.tsx:51` and `view_script.tsx:51` (`font-mono text-xs whitespace-pre`). `ui-spy` stays on a div that stays, since the slot's `spy` would space the div, not its children. |
| 2026-09-29 | 3 | Slot children left as they are, with the reason: one-axis inset, `explore/data_table/data_table.tsx:261` and `explore/timeseries.tsx:94` (`ui-pad-x`), and the three `ui-pad-x ui-pad-t` header panels `assets.tsx:86`, `results_packages.tsx:248`, `users.tsx:85`; `FrameTop` header panels, which have no knob and pad themselves: `figure_editor.tsx:733`, `dataset_display_presentation.tsx:160`, `data_table.tsx:232`, `timeseries.tsx:67`, `instance/instance.tsx:209`, `explore/module_view.tsx:152`; `<Show>` panels (ruling 6): `facilities.tsx:175`, `hfa/dataset/dataset.tsx:66`, `hfa_weights.tsx:84`, `hmis/population/manager.tsx:89`, `iceh/dataset/dataset.tsx:80`, plus `copilot.tsx:102`, whose `Show` holds a component; not padding divs: `figure_editor.tsx:849` (`flex h-full w-full`), the `h-full w-full` content divs `facilities.tsx:215`, `hfa/dataset/dataset.tsx:118`, `hfa_weights.tsx:107`, `iceh/dataset/dataset.tsx:116`, the panel `hmis/population/grid.tsx:68` (`h-full`), `hmis/dataset/dataset.tsx:325` (a flex column); background, width, `data-*` or a handler: `version_history.tsx:154` panel, `slide_list.tsx:764` panel; a slot mixing a padded branch with a flush one: `dhis2_indicator_select_form.tsx:420` (`ui-pad h-full w-full overflow-auto` in one `Show` branch, a flex column in the other). Ruling 7: no `h-full w-full overflow-auto` div is a slot's direct child; `figure_editor.tsx:1016` is not one (a nested row, `data-cursor-zone`). Ruling 9: no `spy` added to `Card`, `ModalContainer` or `CollapsibleSection`. |
| 2026-09-29 | 3 | Deviations: `hfa/imports/imports.tsx` and `iceh/imports/imports.tsx` wrap the wrapper's ready branch in a fragment, since the deleted div was the callback's single root. The inner lines of every deleted div were dedented by two spaces by hand; prettier was not run because the touched files were not prettier-clean at HEAD (`users.tsx` among them), so a run would have reformatted unrelated code. The step gate `grep -A2 ... '<div class="ui-pad( ui-spy)?"'` returns one line, `explore/module_view.tsx:152`, a `FrameTop` header panel written by the Explore plan after this plan's audit; `FrameTop` has no `panelPad`, so the div is the slot's own header and stays. `PROTOCOL_APP_UI_CONVENTIONS.md`: Pattern A, the settings-page line and the "What panther owns" pointer rewritten as the step says; the card-grid and select-list scaffolds (hand-built layouts, §6) keep their `ui-pad` classes. |
| 2026-09-29 | 3 | Floor: `deno task typecheck` exit 0, `deno task test` 469 passed, `./validate_protocols` pass (same stale entry). `./run` not started: the app is still running from this tree. |
| 2026-09-29 | 3 | Step 3 built. |
| 2026-09-29 | 3 | Review: surface clean. One commit since the Do 3 line, `52b64380b`: 37 client files, `PROTOCOL_APP_UI_CONVENTIONS.md` and this file. `1dfd1deb9` between them is the Explore plan's (`explore.tsx`, `module_view.tsx`, `SYSTEM_11`), not this step's. Every removed or added line that is not a two-space re-indent is a `pad` / `spy` / `panelPad` prop, a deleted or trimmed `ui-pad` div, or a fragment; the whitespace-only hunks are only indentation (the stripped removed and added lines were compared as multisets). |
| 2026-09-29 | 3 | Review: rulings 5, 6, 7, 9 present. The 30 deleted divs (26 content, 4 panel) and the 12 that stay match the tree; each kept div carries a width limit, `data-tour`, a flex column or text styling and lost only `ui-pad`. 24 sites read from the Frame tag through the slot's content: where a `ui-spy` div went, the slot's `spy` spaces the same children (the three `delete_data` pages, the four `run_detail` and four `run_view` pages, `import_information.tsx`, `user.tsx`, `view_files.tsx` at `sm`, `module_defaults.tsx`); no child depended on a deleted `h-full` or `overflow-auto` (the `h-full` children that remain, `hmis/indicators/manager.tsx:253`, `hfa/indicators/manager.tsx:1015` and `FigureHolder height="flex"` in `dataset_display_presentation.tsx`, are each the slot's only rendered child and resolve against the padded slot's content box as they did against the deleted div's); the `hfa` and `iceh` `imports.tsx` fragments and `ModuleDefaultsInner`'s render the deleted div's children unchanged. The `-A2` gate's one hit, `explore/module_view.tsx:152`, is read right: a `FrameTop` panel has no knob, so its `ui-pad` div is the header itself. The other two greps return nothing. |
| 2026-09-29 | 3 | Review, finding 1: `PROTOCOL_APP_UI_CONVENTIONS.md:203-205`, the "Grouping sidebar" scaffold, still tells an author to put `ui-pad h-full overflow-auto` around a `SelectList` as a resizable panel's direct child ("Without one: just ..."), the exact-fit padding and overflow div rulings 5 and 7 remove; under the model it is `panelPad="md"` with the `SelectList` bare. No live site has that shape any more (`insert_figure/module_sidebar.tsx` sits under a `panelPad` panel; `family_pane.tsx:59` is a `w-64` column, not a slot). The step's row files it under §6's hand-built layouts, which covers only the "With a controls section" column. Doc change. |
| 2026-09-29 | 3 | Review, finding 2: the reasons row omits eight `ui-pad` divs that are a slot's direct child through a `Show`, a `Match` or the wrapper's callback, which the parser's first-element listing hides: `figure_editor/view_results_object.tsx:72` (the no-data `Match`; the other renders a `TableFromCsv`), `facilities/import/upload_attempt_form.tsx:260` (the `Switch` fallback), `hmis/population/grid.tsx:233` (the `Show` fallback beside a flex column), `explore/explore.tsx:198` (beside `FamilyExplorer`), `instance/instance.tsx:349` (the approval fallback beside the `FrameLeft`), `results_packages/package_page.tsx:315` and `:324` (the failed and generating `Match`es beside `FamilyTabs`), and `results_packages/results_packages.tsx:285` (`ui-pad h-full w-full` over the catalogue `Table`, beside an `EmptyState` fallback). Each is a padded branch beside a flush one, which ruling 5 leaves as it is, so no code change. The last is open to Tim: `EmptyState` pads itself and is `h-full`, the DOC accepts its double inset in a padded slot, the same `ui-pad h-full w-full` div over a `Table` went at `import_ledger_indicator_detail.tsx`, and `pad="md"` on the slot with the `Table` bare is the DOC's own example. The bordered blocks that are also slot children (`hfa`, `hmis` and `iceh` `run_detail.tsx:39` and their error boxes, `hfa/imports/imports.tsx:141`, `iceh/imports/imports.tsx:135`) are content with their own inset, like a `Card`, and need no reason. |
| 2026-09-29 | 3 | Review, fact: moving `ui-pad` off a div that keeps a width changes the width, since Tailwind's preflight makes the div border-box and the old inset was inside it. `insert_figure/step_1_metric.tsx:59`: the module sidebar's panel is 16rem wide, not 14rem (`w-56` plus the panel's inset either side). `family_configuration.tsx:207`, `admin_area_labels.tsx:71`, `xlsx_upload_form.tsx:130`, `import_form.tsx:133` (`max-w-3xl`) and `hfa_weights.tsx:219` (`max-w-xl`): the content's maximum is 2rem wider. Same shape as the step 1 `min-h-[24rem]` row; ruling 5 stands, no code change. |
| 2026-09-29 | 3 | Review, floor: `deno task typecheck` exit 0; `deno task test` 469 passed, 0 failed, 3 ignored on the first run; `./validate_protocols` passed with the one stale baseline entry already logged. `./run` not started: `docker ps` showed `pg` and `valkey-local` up, deno on 8000 and vite on 3000 listening. |
| 2026-09-29 | 3 | Step 3 reviewed: 2 findings. |
| 2026-09-29 | 3 | Fix, finding 1: the "Grouping sidebar" scaffold in `PROTOCOL_APP_UI_CONVENTIONS.md` now says `panelPad="md"` on the frame with the `SelectList` bare, no wrapper. Finding 2 changed no code: the eight padded branches beside a flush one stay as ruling 5 says; `results_packages.tsx:285` is left for Tim, as the review put it. |
| 2026-09-29 | 3 | Floor: `deno task typecheck` exit 0, `deno task test` 469 passed, `./validate_protocols` pass. `./run` not started: the app is still running from this tree. |
| 2026-09-29 | 3 | Step 3 fixed. |
