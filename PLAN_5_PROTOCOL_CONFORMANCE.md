# PLAN_5: the client's baselined protocol exceptions are rewritten or ruled

`./validate_protocols` passes today with no new hit and 12 baselined. The
baseline is a list of reviewed exceptions, not debt, so each entry is either
rewritten here under a ruling or ruled permanent with its reason in the code.
Every live entry was re-read against the code and the protocols on 2026-10-27 by
three independent reviewers. The validator itself is blind to two forms of the
rules it names, so it is fixed first and the hits it then surfaces are in scope.

**Next step: Review 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`. Last step: 1. The review that passes
step 1 deletes this file.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md),
[panther/protocols/PROTOCOL_UI_SOLIDJS.md](panther/protocols/PROTOCOL_UI_SOLIDJS.md)
(rules 3 and 6),
[panther/protocols/PROTOCOL_UI_STATE.md](panther/protocols/PROTOCOL_UI_STATE.md)
(rules 7, 9, 11 and 12), `validate_protocols.ts`.

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_5_PROTOCOL_CONFORMANCE.md." Floor as the protocol lists it; no migration,
query engine or help text is touched. Build log: §8.

## 1. The problem

- Two baseline entries match no code: `organisation_modal.tsx` was deleted in
  c662bee93, and `body_editor.tsx` moved into report-forge in e434d4870, outside
  the validator's root (`client/src`).
- The validator's `jsx-and-and` check is per line, so the form `deno fmt`
  writes, `&& (` at line end with the JSX on the next line, is never flagged:
  six such sites exist. Its `raw-loading-signal` regex matches only `loading`,
  `isLoading`, `fetchError` and `loadError`, so in-flight flags named `saving`,
  `busy`, `editorLoading`, `saveError` and `mintError` are never flagged: six
  exist. Its labels say STATE 8 and STATE 11 where the protocol numbers those
  rules 9 and 12.
- The four `&&` sites in `report_version_preview.tsx` are a defect, not style:
  `VizChangeRow` reads `p.old` twice (in `<Show when>` and as its child), and a
  getter prop builds the figure embed twice per change card, the discarded image
  still fetching.
- The other ten live entries are real hits of STATE 9, STATE 12 and SOLIDJS 3,
  ruled one by one in §3.

## 2. The model

The validator proves the rules it names. Every hit is rewritten to the
protocol's own primitive (`createQuery`, `createFormAction`,
`createButtonAction`, `createDeleteAction`, `StateHolderWrapper`, a request
counter, `<Show>`) or ruled a permanent exception with its reason in the code.
The baseline ends holding only the ruled exceptions.

## 3. Rulings

1. **The validator first**, so the gate proves the rest. `jsx-and-and` scans the
   file text and catches `&& (` at line end before a JSX line;
   `raw-loading-signal` also catches flags ending in `Saving`, `Busy` or
   `Loading` and `save` or `mint` error signals; the labels read STATE 9 and
   STATE 12.
2. **Effect hoists** (SOLIDJS 3): `whats_new_modal.tsx` (three effects),
   `instance.tsx`, `report_figure_embed.tsx` (both `hydrated().ok` and
   `p.onMeasured`). Nothing visible changes.
3. **`cond && <JSX>`** (SOLIDJS 6): `VizChangeRow<T>` takes `old?: T`, `neu?: T`
   and `render: (v: T) => JSX.Element` and does `<Show when={p.old} keyed>`
   itself, which also ends the double build. The two indicator-editor footers
   (`edit_indicator_form.tsx`, `edit_indicator.tsx`) become
   `<Show when={...} keyed>`; both modals carry actions, so the footer row
   renders either way. Not a ternary with a JSX arm, and not a `<Show>` passed
   as a prop value, which is always truthy.
4. **`save_to_prompt_library_modal.tsx`**: `createFormAction` with both
   validations inside; the modal action carries the action's state, so the modal
   renders the error and the spinner; the button stays disabled while loading,
   since panther's Button shows a spinner without disabling. The categories
   fetch becomes a `createQuery`.
5. **`data/geojson/edit_modal.tsx`**: one `createQuery` for the feature groups
   and the admin-area options, the body in a child component under
   `StateHolderWrapper`; the draft holds overrides only (effective value is the
   override, else the stored mapping), so no seeding effect; close is the
   wrapper's error button and the save action's success callback. Visible:
   panther's indicator and error in place of the custom text, and a way out on
   error.
6. **`report.tsx`**: `isLoading` folds into the existing `loadState` (loading at
   mount, ready after the detail read; the four consumers read the status). The
   wrapper scopes to the main area, so the header and cursors stay, and a
   loading indicator replaces today's blank area.
7. **`prompt_library_modal.tsx`**: two `createQuery`s, the GitHub one always
   succeeding (a fetch failure is a parse result with `status: "error"`, as
   today); one derived holder over both feeds one wrapper and the footer gate;
   the delete triple becomes `createDeleteAction`; `silentFetch` after the four
   mutations, allowed because custom prompts have no SSE event, which
   PROTOCOL_APP_STATE's T3 list now states. Visible: a failed custom-prompts
   fetch shows an error instead of an empty list.
8. **`ai_documents_store.ts`**: a request counter replaces the
   re-read-and-compare guard, which accepts a stale first load in the A, B, A
   race and lets the prune effect write IndexedDB from it. The comment says why.
9. **`slide_deck.tsx` `isLoading`**: permanent exception. The boolean means "the
   first fetch landed": it lets the header, toolbar and rail mount before the
   first fetch, the rail shows its own loading state, and the error path already
   goes through `loadState`. The entry stays; its reason is in the code.
10. **The six flags ruling 1 surfaces**: `saving` (`product_title.tsx`), `busy`
    (`stale_figure_badge.tsx`) and `adminAreasLoading` (geojson upload step 2)
    become `createButtonAction`; `editorLoading` (`slide_deck.tsx`) becomes a
    `StateHolder` under the keyed editor mount, which turns a silent failed
    slide fetch into a message; `saveError` (`report.tsx`) and `mintError`
    (`access_tokens.tsx`) become `createFormAction` errors. One that proves
    wrong in the doing is baselined with its reason in §8.
11. **`organisation_modal.tsx` and `body_editor.tsx`**: entries pruned, nothing
    replaces them. The report-forge tree is outside the validator's root (§6).

## 4. Steps

### Step 1: the work list

**Surface.** `validate_protocols.ts`, `validate_protocols_baseline.json`, the
components named in rulings 2 to 10, `PROTOCOL_APP_STATE.md` (the T3 list).

**Deliverable.** Rulings 1 to 11, in commits in this order: the validator; the
hoists and the six `&&` sites; each component rewrite on its own; the six
surfaced flags; then one `./validate_protocols --update-baseline`, which must
leave exactly the slide-deck entry plus any exception recorded in §8. Each
commit hand-deletes the entries it clears.

**Not in this step.** report-forge.

**Gates.** The floor; `./validate_protocols` prints no new hit after every
commit.

**Ends with.** Several commits, each green; the last deletes this file.

## 5. Gates catalogue

| Gate                   | First reached |
| ---------------------- | ------------- |
| `deno task typecheck`  | step 1        |
| `deno task test`       | step 1        |
| `./validate_protocols` | every commit  |
| `./run`                | step 1        |

## 6. Out of scope

- `report-forge/ui`: two guard-before-deps hits in its own tree
  (`body_editor.tsx`, `report_forge.tsx`). A second validator root and the two
  hoists are the submodule's own commit, later.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. No data change. Rollback is
`git revert` of the plan's commits.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-06 | 0    | Catalogue written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-27 | 0    | Rewritten after three independent reviews as a ruled work list: paths updated, two stale entries pruned, the validator's two blind spots and its labels added, the `&&` sites ruled a render prop (the ternary and `<Show>`-as-prop forms both break a rule), the report editor folded into its holder, the deck ruled a permanent exception.                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-27 | 1    | Ruling 1's `raw-loading-signal` regex surfaces 15 hits, not the 6 §1 counts. Eight are off-surface and not in-flight state: `needsSaving` in `admin_area_labels.tsx`, `indicator_code_editor.tsx` and five `data/facilities/import/step_*.tsx` is a dirty flag whose in-flight state is already a `createButtonAction`, and `ownerBusy` in `copilot/tab_owner.ts` is a Web Locks ownership flag with no fetch behind it. No regex separates `needsSaving` from `adminAreasLoading`, so the check stays as ruled and those eight are permanent baseline entries, their reason this row. The tenth extra, `isSaving` in `save_to_prompt_library_modal.tsx`, is cleared by ruling 4. |
| 2026-10-27 | 1    | Ruling 10, `stale_figure_badge.tsx`: `createFormAction`, not `createButtonAction`. The badge's contract is that a failed update says why on the figure; a button action raises it in an alert instead. The form action's state drives both the spinner and `StateHolderFormError`, which also retires the separate `reason` signal.                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-27 | 1    | Ruling 10, `report.tsx` `saveError`: not a `createFormAction`. All three writers are debounced autosave paths rather than clicks, and the indicator needs a fourth state, "unsaved", that a form action cannot express. Folded into the existing save-status signal as a discriminated union, so one value carries the status and its message. A failed theme change now shows its message too, which it previously swallowed behind a red dot.                                                                                                                                                                                                                                   |
| 2026-10-27 | 1    | Ruling 10, `slide_deck.tsx` `editorLoading`: the holder drives the keyed mount's fallback through `<Switch>`, not a `StateHolderWrapper` around the editor. The wrapper's ready branch is keyed on the data object, so every confirming refetch would remount the slide editor and the header rows portaled out of it. The loading state also leaves the peeked slide on screen rather than replacing it.                                                                                                                                                                                                                                                                         |
| 2026-10-27 | 1    | Ruling 10 side effects: `minting` in `access_tokens.tsx` went with `mintError`, being the same action, and its error line takes `StateHolderFormError`'s class in place of `mb-4 text-sm`. In geojson upload step 2 a failed admin-area fetch no longer advances to step 3; it used to, silently, leaving an empty mapping table.                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-27 | 1    | Step 1 built. `./validate_protocols` ends with nine baselined entries: the slide deck's `isLoading` under ruling 9, and the eight off-surface flags of the row above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
