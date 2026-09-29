# PLAN_CONTAINER_MODEL_MIGRATION: take the kit's container model

> **Status (2026-09-29):** Not started. Written in the panther session that
> built the model; the site counts are from that session's audits of this app on
> 2026-09-29 and are re-grepped by each step. The app protocol binds plans to
> `tim-branch`; this plan binds to `version2`, where the tree is today, and Tim
> confirms which before Do 1.

**Next step:** Do 1

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
