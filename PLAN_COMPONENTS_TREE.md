# PLAN: Components tree

Reorganise `client/src/components/` so the folder tree reads like the app:
one top-level folder per nav tab, pages nested under the page that opens
them, `_shared/` scoped to the nearest common ancestor, one `mod.ts` entry
per folder, and a lint that keeps it that way. The protocol that governs
the tree is rewritten first so every rule is mechanically checkable.

**Next step: Review 8.** Each session sets this line in its final commit.

Branch: `version2`. Repos touched: this app and
`/Users/timroberton/projects/panther/timroberton-panther` (step 1 only).
Read first: `CLAUDE.md`, `SYSTEMS.md`, then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_COMPONENTS_TREE.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches migrations, the seed, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 10.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rules peculiar to this plan:

- **Steps 3 to 10 wait for the merge.** A collaborator branch is open
  against `version2`. Steps 1 and 2 add files and touch no component, so
  they may run now. No session runs `Do 3` until §8 holds a row from Tim
  saying the merge has landed.
- **Two commits per moved folder.** The first is `git mv` plus the import
  path rewrites that keep the typecheck green, nothing else. The second
  adds the folder's `mod.ts`, replaces deep imports into it, and edits the
  SYSTEM manifests and prose. Rename detection at the next merge depends on
  the first commit changing almost nothing inside the files (R8).
- **Deep imports are tolerated until step 10.** A file may keep importing
  an internal path of a folder that has not yet moved. The structure lint
  is run with a scope argument until step 10 chains it into the typecheck.
- **The baseline moves with the files.** `validate_protocols_baseline.json`
  keys entries by path. A step that moves a file runs
  `./validate_protocols --update-baseline` and proves the entry set is
  unchanged apart from paths (G4).

## 1. The problem

`client/src/components/` holds 316 files in 22 top-level folders for an
app whose nav rail has 6 tabs
([instance/index.tsx:63](client/src/components/instance/index.tsx#L63)).
Measured on 2026-09-20:

- 17 files loose at the root, 9 of them PascalCase; 27 PascalCase files in
  all; 30 `index.ts(x)` entries against the protocol's `mod.ts`, and the
  protocol's own example uses a third form (`report/report.tsx`).
- `_shared/` holds 19 files. Only `collab_markdown_editor.tsx` and
  `fastr_logos.ts` have two or more consuming areas. `cursors/*`,
  `results_package/**`, `scope_picker`, `sort_control`,
  `logo_section_editor`, `module_parameter_inputs` and
  `dhis2_credentials/` each have one. The genuinely shared files live in
  feature folders: `slide_deck/presence_avatars.tsx` (4 areas),
  `figure_editor/stale_figure_badge.tsx`, `products/package_label.ts`,
  `_file_upload_selector.tsx` (8 areas).
- `forms_editors/` is a mechanism bucket: 7 files from 4 features, 2 unused.
- 12 top-level folders are Data-tab sub-pages
  (`instance_dataset_{hfa,hmis,iceh}`, `indicator_manager_{hfa,hmis}`,
  `instance_geojson`, `instance_population`, `instance_hfa_time_points`,
  `structure`, `structure_import`, and the two `instance/instance_*.tsx`
  switchboards).
- Of roughly 60 cross-folder imports, 35 reach a folder's internals,
  including underscore files
  (`indicator_manager_hmis/_indicator_display.ts` from
  `instance_dataset_hmis`, `copilot/ai_tools/tools/_internal/*` from
  `slide_deck`). The underscore prefix carries no meaning.
- Non-UI code imports components: `state/instance/collab.ts` (two notice
  sinks), `exports/*` (`report/report_markdown_style.ts`),
  `generate_slide_deck/` (`_shared/fastr_logos.ts`), `onboarding/*`
  (`copilot/ai_views.ts`, `LoggedInWrapper.tsx`).
- Dead: `ConnectionStatus.tsx`, `NotAvailableBox.tsx`, `PasswordGate.tsx`,
  `forms_editors/confirm_update.tsx`, `forms_editors/edit_label.tsx`.
- `panther/protocols/PROTOCOL_UI_STRUCTURE.md` states the right principle
  and nothing checks it. `validate_protocols.ts` covers SOLIDJS and STATE
  rules only; `lint_systems.ts` checks ownership, not layout.

## 2. The model

Vocabulary, used throughout:

- **Area**: a top-level folder under `components/`. One per nav tab, plus
  `instance/` for the shell and `_shared/`.
- **Page**: a component opened full-page through `openShellEditor` or
  mounted by a tab's switch. A page's files live in a folder named for it,
  under the area or page that opens it. One file stays a file.
- **Entry**: a folder's `mod.ts`. The only file another folder may import.
- **Scoped shared**: `X/_shared/`, importable only from files under `X/`,
  and only by two or more distinct children of `X`.
- **Move commit**: `git mv` plus import path rewrites, nothing else.

The end state:

```text
client/src/components/
├── _shared/                       # used by two or more areas
│   ├── figure_editor/             # products (decks, reports) + data (HMIS indicator manager)
│   ├── file_upload_selector.tsx   uppy_file_upload.ts
│   ├── collab_markdown_editor.tsx presence_avatars.tsx  live_cursors.tsx
│   ├── package_label.ts           product_types.ts
├── instance/                      # the shell: header, rail, header modals
│   ├── mod.ts  instance.tsx  logged_in_wrapper.tsx  profile.tsx
│   ├── feedback_form.tsx  instance_meta_form.tsx  change_email_modal.tsx
│   └── theme_modal.tsx  organisation_modal.tsx  whats_new_modal.tsx  email_opt_in_modal.tsx
├── products/                      # nav: Products (the explorer at the root)
│   ├── mod.ts  products.tsx  product_card.tsx  folder_card.tsx  list_view.tsx  …
│   ├── _shared/                   # what two or more of slide_deck, report, copilot, products.tsx import:
│   │   └── insert_figure/  version_history/  and the files the import graph says
│   ├── slide_deck/                # + slide_editor/ style_editor/ slide_transforms/
│   ├── report/
│   └── copilot/                   # + slide_ai/ ai_tools/ ai_documents/ ai_prompt_library/
├── explore/                       # nav: Explore
├── results_packages/              # nav: Results packages (+ wizard/ package_view/)
├── data/                          # nav: Data (data.tsx is the section switchboard)
│   ├── mod.ts  data.tsx
│   ├── _shared/                   # facilities/ (+ import/), geojson/, family_configuration.tsx
│   ├── general/                   # admin_area_labels.tsx  ai_context_form.tsx
│   ├── hmis/                      # dataset/ imports/ indicators/ population/ dhis2_connection/ _shared/
│   ├── hfa/                       # dataset/ imports/ indicators/ (+ ai/)  hfa_weights.tsx  _shared/time_points.tsx
│   └── iceh/                      # dataset/ imports/
├── assets/                        # nav: Assets
└── users/                         # nav: Users
```

Outside `components/`, the client has layers, and imports point one way:

```text
routes/ onboarding/  ->  components/  ->  exports/  ->  generate_*/  ->  state/ lib panther
```

`generate_report/` is new, the twin of `generate_slide_deck/`: the report
document model and its HTML rendering, which the editor and the exporters
both use. `exports/` holds file-format wrappers only. What crosses these
lines today moves down until nothing does (R12).

Import rules the lint enforces, stated once here and restated nowhere but
the protocol (R3, R4, R6):

1. Same folder: any file.
2. Any other folder: its `mod.ts` only. Type-only imports included.
3. `X/_shared/**`: only from files under `X/`, through rules 1 and 2.
4. `state/`, `exports/`, `generate_*/` never import `components/`, and
   `generate_*/` never imports `exports/`. `routes/` and `onboarding/`
   import entries only, by rule 2.
5. No cycle in the graph whose nodes are folders and whose edges are
   runtime (not `import type`) imports of a `mod.ts`.

## 3. Rulings

Rulings marked _(proposed)_ were derived from the code and stand unless
overruled here before `Do 1`.

1. **Top level equals the nav rail plus the shell.** `instance/`,
   `products/`, `explore/`, `results_packages/`, `data/`, `assets/`,
   `users/`, `_shared/`. A nav area is a folder even when it holds one
   file, because the root holds only areas.
2. **Pages nest under what opens them.** The page's own files sit at its
   folder root; each page it opens is a sub-folder, or a file when it is
   one file. `data.tsx` (today `instance/instance_data.tsx`) is the Data
   area's root file; the sections it switches between are its sub-folders.
3. **`mod.ts` is the only entry.** `index.ts(x)` is banned. The main
   component's file is named for the component (`products.tsx`,
   `slide_deck.tsx`, `data.tsx`), and `mod.ts` re-exports what other
   folders may use.
4. **`_shared/` is scoped.** Importable only from under its parent, and
   only when two or more distinct children of the parent import it (the
   parent's own root files count as one child; a sibling `_shared/` folder
   counts as one). Default a file to its feature folder; promote it when
   the second consumer appears.
5. **No underscore prefix on files or folders inside `components/`**
   except `_shared/`. The `mod.ts` rule already says what is internal.
   _(proposed)_ This overrides the `_helpers.ts` example in
   `PROTOCOL_ALL_STRUCTURE.md` for the client, and step 1 says so there.
6. **Direction.** `state/`, `exports/`, `generate_*/` never import
   `components/`. Logic they need moves out (R12).
7. **Naming.** snake_case files and folders. A file is named for its main
   export (`product_card.tsx` exports `ProductCard`). A child never repeats
   its folder's name (`data/hfa/indicators/manager.tsx`, not
   `hfa_indicators_manager.tsx`). Wizard steps are `step_N_name.tsx`.
   Stale vocabulary goes: `presentation_object_*` becomes `editor_panel_*`,
   `visualization_editor_inner.tsx` becomes `figure_editor.tsx`, React-style
   `useX.ts` becomes the noun it manages (`ai_documents_store.ts`,
   `prompt_library_store.ts`). The full list is step 9.
8. **Commit shape.** Move commit first, follow-up commit second, both green.
   Every moved file appears as an `R` row in `git diff -M --name-status`
   for the move commit (G3). Move a folder whole, into one destination,
   wherever the target tree allows, so directory rename detection works at
   the next merge.
9. **The lint is `lint_structure.ts`** at the repo root, task
   `lint:structure`, chained into `typecheck` in step 10, modelled on
   `lint_systems.ts`. Not a `validate_protocols.ts` tier: those checks are
   regexes with a baseline; this one resolves imports and has no
   exceptions. Optional positional argument: a directory; hits are reported
   only for files under it, imports are resolved across the whole client.
   Check ids: `root-file`, `snake-case`, `index-entry`, `entry-only`,
   `shared-scope`, `shared-consumers`, `direction`, `unimported`,
   `entry-cycle`.
10. **`figure_editor/` is top-level `_shared/`.** _(proposed)_ Its
    consumers are products (both editors) and data (the HMIS indicator
    manager uses `conditional_formatting_editor.tsx`, which depends on the
    style panel). `HelpButton.tsx`, `forms_editors/{custom_series_styles,
    download_presentation_object,view_results_object}.tsx` and
    `_shared/cursors/viz_cursors.tsx` have it as their one consumer and
    move into it.
11. **The copilot boundary.** _(proposed)_ `slide_deck/slide_ai/**` is
    S13-owned and moves to `products/copilot/slide_ai/`. Beyond that there
    is no file list: R4 decides. A file that the copilot and an editor both
    import, or that two editors both import, goes to `products/_shared/`;
    a file one editor imports stays with that editor. The import graph at
    the time of the step is the authority, because the collaborator
    branches keep adding to it. The result must satisfy `entry-cycle`:
    editors import the copilot's entry, the copilot imports only
    `products/_shared/` and top-level `_shared/`.
12. **Direction fixes.** _(proposed)_ Import rule 4 of §2 decides; the
    lint's `direction` check finds the files. What moves, and where:
    - Report rendering that `exports/` imports from `components/report/`
      moves to `client/src/generate_report/`. Anything that moved down and
      still imports `exports/` takes what it imports down with it, and so
      on until `generate_report/` imports nothing above itself. The same
      applies to `generate_slide_deck/`, which imports one exports helper
      today. Names are kept; a function whose old home was an `export_*`
      file is not renamed for the move.
    - A singleton or sink that `state/` or `onboarding/` calls moves to
      `state/`: the Clerk instance to `state/_infra/`, the collaboration
      notice sinks beside `state/instance/collab.ts` (S16).
    - A table that only `generate_*/` and its editor read moves to that
      `generate_*/` folder (the FASTR logo table).
    - `copilot/ai_views.ts` stays in the copilot and is exported from its
      entry; `onboarding/` imports the entry.
13. **Data placements.** _(proposed)_ From the section switch in
    `instance_data.tsx`: `general/` gets admin area labels and the AI
    context form; `hmis/` gets dataset, imports, indicators, population
    and the DHIS2 connection (`_shared/dhis2_credentials/manage_connection.tsx`
    plus `Dhis2CredentialsEditor.tsx`); `hfa/` gets dataset, imports,
    indicators (with `ai/` and `forms_editors/edit_hfa_indicator.tsx`),
    weights and time points; `iceh/` gets dataset and imports. Facilities
    (`structure/` with `structure_import/` as `facilities/import/`),
    geojson and `family_configuration.tsx` are opened from both HMIS and
    HFA and go to `data/_shared/`. `PeriodSelector`, `TimeIndexSelector`,
    `WindowingSelector` are used by HMIS dataset and HMIS imports and go to
    `data/hmis/_shared/`, as do `indicator_manager_hmis/{_indicator_display,
    _type_badge,_wrap_on_underscore}` (used by HMIS indicators and HMIS
    dataset). `instance_hfa_time_points/` (used by `data.tsx` and the HFA
    dataset page) goes to `data/hfa/_shared/time_points.tsx` and is
    re-exported from `data/hfa/mod.ts`.
14. **Dead files are deleted in step 3**, not moved: `ConnectionStatus.tsx`,
    `NotAvailableBox.tsx`, `PasswordGate.tsx`,
    `forms_editors/confirm_update.tsx`, `forms_editors/edit_label.tsx`.
15. **Manifests and prose move in the step that moves the file.** SYSTEM
    globs in the follow-up commit; every prose mention of a moved path in
    `SYSTEM_*.md`, `SYSTEMS.md` and `PROTOCOL_APP_*.md` rewritten in the
    same commit (G5). Custody rows in `SYSTEMS.md §4.1` that name a moved
    path are rewritten too. The Data tab interleaves S5 and S6, so its
    globs get longer; that is accepted.

## 4. Steps

### Step 1: Rewrite the structure protocol

**Surface.** In `timroberton-panther`: `protocols/PROTOCOL_UI_STRUCTURE.md`,
`protocols/PROTOCOL_ALL_STRUCTURE.md`, `protocols/README.md`. In this repo:
the synced `panther/protocols/` copies of those three, landed by
`./sync platform` from the panther repo, and nothing else in `panther/`.

**Deliverable.** `PROTOCOL_UI_STRUCTURE.md` states R1 to R7 and the five
import rules of §2 as its Rules, each with a Do/Don't, and a Checklist
whose every item names the `lint_structure.ts` check id that verifies it.
It says that the checker lives in the consuming app until panther ships
its audit tool. `PROTOCOL_ALL_STRUCTURE.md` points at it for everything
under `components/`, and its `_helpers.ts` row no longer applies to the
client. `README.md`'s table row for the protocol matches. The panther
commit lands before the sync; the app commit contains only the synced
protocol files.

**Not in this step.** The lint. Any file under `client/src/`.

**Gates.** Panther typechecks per its own task before the sync.
`git diff --stat` of the app commit lists only `panther/protocols/*`.

**Ends with.** One commit in panther, one commit here.

### Step 2: The structure lint

**Surface.** `lint_structure.ts` (new, repo root), `deno.json` (the
`lint:structure` task only), `server/tests/lint_structure_test.ts` (new).

**Deliverable.** The nine checks of R9, resolving `~/` and relative imports
the way `client/tsconfig.json` does, with the scope argument. `unimported`
treats `client/src/app.tsx` and `client/src/routes/**` as roots.
`entry-cycle` ignores `import type`. Exit code 1 on any hit, with
`file:line` and the check id. The test builds a temporary tree with one
violation per check and one clean tree, and asserts each is reported or
not. Running `deno task lint:structure` against the current tree prints
the counts per check; the numbers go in §8 as the starting point.

**Not in this step.** Chaining into `typecheck` (step 10). Any move.

**Gates.** `deno task test` includes the new test and passes.
`deno task lint:structure client/src/components/_shared` runs and reports
without crashing (hits expected).

**Ends with.** One commit.

### Step 3: The shell, users, assets, explore

**Surface.** `client/src/components/{instance,explore}/**`, the root files
`LoggedInWrapper.tsx`, `ConnectionStatus.tsx`, `NotAvailableBox.tsx`,
`PasswordGate.tsx`, `theme_modal.tsx`, `organisation_modal.tsx`,
`whats_new_modal.tsx`, `email_opt_in_modal.tsx`,
`forms_editors/{confirm_update,edit_label}.tsx`, `client/src/routes/**`,
`client/src/onboarding/storage.ts` and `index.ts` (import lines only),
`SYSTEM_01`, `SYSTEM_04`, `SYSTEM_11`, `SYSTEM_12`, `SYSTEM_14`,
`SYSTEM_15`, `SYSTEMS.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`,
`validate_protocols_baseline.json`.

**Deliverable.** Per R1, R2, R3, R14: `instance/` holds
`mod.ts`, `instance.tsx`, `logged_in_wrapper.tsx`, `profile.tsx`,
`feedback_form.tsx`, `instance_meta_form.tsx`, `change_email_modal.tsx`
and the four header modals. `users/` holds `mod.ts`, `users.tsx`
(from `instance_users.tsx`), `user.tsx`, `add_users.tsx`,
`batch_upload_users_form.tsx`, `bulk_edit_permissions_form.tsx`. `assets/`
holds `mod.ts` and `assets.tsx`. `explore/` holds `mod.ts` and
`explore.tsx`. The five dead files are deleted. `instance_data.tsx` is
left in place for step 4. `routes/` and `onboarding/` import
`~/components/instance/mod.ts`. Manifests and prose per R15.

**Not in this step.** `instance_data.tsx` and everything Data. The clerk
singleton (step 8).

**Gates.** G2 for `client/src/components/{instance,users,assets,explore}`
with `entry-only` hits allowed only where the target has not moved yet,
each listed in §8. G3, G4, G5.

**Ends with.** Two commits per folder as §0 says; the deletions ride the
first `instance/` commit.

### Step 4: Data, except HMIS

**Surface.** `client/src/components/data/**` (new),
`instance/instance_data.tsx`, `instance/ai_context_form.tsx`,
`structure/**`, `structure_import/**`, `instance_geojson/**`,
`instance_hfa_time_points/**`, `indicator_manager_hfa/**`,
`instance_dataset_hfa/**`, `instance_dataset_iceh/**`,
`forms_editors/edit_hfa_indicator.tsx`, `SYSTEM_05`, `SYSTEM_06`,
`SYSTEM_13`, `SYSTEMS.md`, `validate_protocols_baseline.json`.

**Deliverable.** Per R2 and R13: `data/mod.ts`, `data/data.tsx`,
`data/general/{admin_area_labels,ai_context_form}.tsx`,
`data/_shared/facilities/**` (with `import/` from `structure_import/`),
`data/_shared/geojson/**`, `data/_shared/family_configuration.tsx`,
`data/hfa/{dataset,imports,indicators}/**`, `data/hfa/hfa_weights.tsx`,
`data/hfa/_shared/time_points.tsx`, `data/iceh/{dataset,imports}/**`.
Each folder has its `mod.ts`; `data.tsx` imports only entries. Manifests
and prose per R15; the S6/S5 custody row for `instance_data.tsx` in
`SYSTEMS.md §4.1` now names `data/data.tsx`.

**Not in this step.** Anything HMIS, including the three period selectors.
File renames inside the moved folders beyond what R3 needs (step 9).

**Gates.** G2 for `client/src/components/data` with `entry-only` hits
allowed only against HMIS paths, listed in §8. G3, G4, G5.

**Ends with.** Two commits per folder as §0 says.

### Step 5: HMIS and results packages

**Surface.** `client/src/components/data/hmis/**` (new),
`instance_dataset_hmis/**`, `indicator_manager_hmis/**`,
`instance_population/**`, `_shared/dhis2_credentials/**`,
`Dhis2CredentialsEditor.tsx`, `PeriodSelector.tsx`,
`TimeIndexSelector.tsx`, `WindowingSelector.tsx`,
`results_packages/**` (new), `instance_results_packages/**`,
`_shared/results_package/**`, `_shared/module_parameter_inputs.tsx`,
`SYSTEM_05`, `SYSTEM_06`, `SYSTEM_07`, `SYSTEM_08`, `SYSTEM_12`,
`SYSTEMS.md`, `validate_protocols_baseline.json`.

**Deliverable.** Per R13: `data/hmis/{dataset,imports,indicators,population,
dhis2_connection}/**`, `data/hmis/_shared/{period_selector,
time_index_selector,windowing_selector,indicator_display,type_badge,
wrap_on_underscore}.*`. The HMIS indicator manager opens the DHIS2 import
wizard through `data/hmis/imports/mod.ts`. `results_packages/` holds
`mod.ts`, `results_packages.tsx`, `detail.tsx`, `module_defaults.tsx`,
`prune.tsx`, `prune_plan.ts`, `module_parameter_inputs.tsx`, `wizard/**`,
`package_view/**` (from `_shared/results_package/`). The S8/S12 custody row
for `_shared/results_package/**` is deleted: the files are S8's outright.

**Not in this step.** `products/product_types.ts`, which
`results_packages/detail.tsx` imports (step 6 moves it; the deep import is
tolerated until then).

**Gates.** G2 for `client/src/components/data` and
`client/src/components/results_packages`, `entry-only` hits allowed only
against `products/` paths, listed in §8. G3, G4, G5.

**Ends with.** Two commits per folder as §0 says.

### Step 6: Top-level shared

**Surface.** `client/src/components/_shared/**`, `figure_editor/**`,
every file whose one consumer is the figure editor, every file with two
or more top-level consumers by the import graph at the start of the step,
the import lines of their consumers, `SYSTEM_04`, `SYSTEM_11`, `SYSTEM_12`, `SYSTEM_14`, `SYSTEMS.md`,
`PROTOCOL_APP_HELP_BUTTONS.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`,
`validate_protocols_baseline.json`.

**Deliverable.** Per R4 and R10: `_shared/figure_editor/` exists with its
`mod.ts`, and every file whose one consumer is the figure editor has
moved into it. Every file with two or more top-level consumers, by the
import graph at the time of the step, is at the top of `_shared/`; every
file there with one consumer under `products/` is left for step 7 and
listed in §8, and every file there that step 8 moves out of `components/`
is left for step 8 and listed in §8. Nothing else remains in `_shared/`.
`PROTOCOL_APP_HELP_BUTTONS.md` names the new home of the help button and
says it is promoted to `_shared/` at its second consumer. The
`_file_upload_selector` custody row in `SYSTEMS.md §4.1` names the new
paths.

**Not in this step.** Files whose consumers are all under `products/`
(step 7). Files that leave `components/` (step 8).

**Gates.** G2 for `client/src/components/_shared`, `entry-only` hits
allowed only against `products/`, `slide_deck/`, `report/` paths, listed
in §8. `shared-consumers` must be clean. G3, G4, G5.

**Ends with.** Two commits for `figure_editor/`, one move commit and one
follow-up for the loose files.

### Step 7: Products

**Surface.** `client/src/components/products/**`, `slide_deck/**`,
`report/**`, `copilot/**`, `version_history/**`, `figures/**`,
`layout_editor/**`, `_editor_snapshot.ts`, `_markdown_guide.tsx`,
`forms_editors/conflict_resolution_modal.tsx` (and the now-empty
`forms_editors/`), `_shared/{cursors,logo_selector,logo_section_editor,
scope_picker,sort_control}.*`, `client/src/onboarding/{index,catalogue}.ts`
(import lines only), `SYSTEM_12`, `SYSTEM_13`, `SYSTEM_16`, `SYSTEMS.md`,
`PROTOCOL_APP_AI_TOOLS.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`,
`validate_protocols_baseline.json`.

**Deliverable.** Per R2, R4 and R11: the explorer's own files at
`products/` root with `mod.ts` and `products.tsx`; `products/slide_deck/`,
`products/report/`, `products/copilot/` (with `slide_ai/`), each with its
entry and holding every file whose consumers are all inside it, wherever
that file was before (root, `_shared/`, `forms_editors/`,
`layout_editor/`); `products/_shared/` holding `insert_figure/`,
`version_history/` and every file with two or more consumers among the
explorer, the editors and the copilot. `forms_editors/`, `figures/`,
`layout_editor/`, `version_history/` no longer exist at the root. The
`entry-cycle` check is clean across `products/`.

**Not in this step.** Files that leave `components/` (step 8). Renames
inside folders (step 9).

**Gates.** G2 for `client/src/components/products` clean, including
`entry-cycle`. G3, G4, G5. `git diff -M --name-status` for the
`copilot/`, `slide_deck/`, `report/`, `version_history/` move commits
shows every file as `R100` (pure `git mv` is possible for these four).

**Ends with.** Two commits per folder as §0 says.

### Step 8: Direction fixes

**Surface.** The files the `direction` check names at the start of the
step, the files they pull down with them under R12, the new
`client/src/generate_report/`, `client/src/exports/**`,
`client/src/generate_slide_deck/**`, `client/src/state/**`, the import
lines of every consumer of a moved file, the SYSTEM files whose globs or
prose name a moved file (S1, S10, S12, S14, S16 at least), `SYSTEMS.md`,
`validate_protocols_baseline.json`. The session lists the resolved surface
in §8 before its first commit.

**Deliverable.** R12 in full: the `direction` check is clean, and
`generate_report/` and `generate_slide_deck/` import nothing from
`exports/` or `components/`. The `LoggedInWrapper.tsx` custody row in
`SYSTEMS.md §4.1` names `instance/logged_in_wrapper.tsx` and drops the
Clerk seam if the singleton's move makes S1 its sole owner. The S10 and
S12 manifests say which of them owns `generate_report/`.

**Not in this step.** Any behaviour change in the moved code. Splitting a
file: a file moves whole, and a file that mixes a builder with a wrapper
moves to the lower layer with the wrapper still in it, recorded in §8 as
an open item for the owning SYSTEM.

**Gates.** G2 whole tree, `direction` and `entry-only` clean. G3, G4, G5.

**Ends with.** One commit per R12 bullet, each green.

### Step 9: Names

**Surface.** Every file under `client/src/components/` whose name changes
under R5 or R7, their importers (import lines only), the SYSTEM files
whose globs or prose name them, `validate_protocols_baseline.json`.

**Deliverable.** No underscore-prefixed file or folder except `_shared/`
(77 today). No PascalCase file (27 today). The stale names of R7:

| Today | After |
| --- | --- |
| `_shared/figure_editor/visualization_editor_inner.tsx` | `figure_editor.tsx` |
| `_shared/figure_editor/presentation_object_editor_panel*.tsx` and folders | `editor_panel*` |
| `_shared/figure_editor/cf_store_helper.ts` | `conditional_formatting_store.ts` |
| `data/hfa/indicators/hfa_*.tsx` | prefix dropped |
| `data/hfa/indicators/edit_hfa_indicator_*.tsx` | `edit_*.tsx` |
| `data/hmis/dataset/dataset_items_holder.tsx` | `dataset_display_presentation.tsx` (its export); the HFA and ICEH files of that name export `DatasetItemsHolder` and keep it |
| `products/copilot/ai_documents/useAIDocuments.ts` | `ai_documents_store.ts` |
| `products/copilot/ai_prompt_library/usePromptLibrary.ts` | `prompt_library_store.ts` |
| `products/copilot/ai_tools/DraftSlidePreview.tsx` and the other PascalCase files | snake_case of the export |
| `data/hmis/_shared/wrap_on_underscore.tsx` | `wrap_on_underscore.tsx` (name kept; underscore dropped) |

A file whose name and main export disagree after this step is a finding.

**Not in this step.** Any move between folders. Any export rename.

**Gates.** G2 whole tree, `snake-case` clean. G3, G4, G5.

**Ends with.** One commit per folder.

### Step 10: Chain the lint and close

**Surface.** `deno.json` (the `typecheck` task), `SYSTEM_14_client_shell.md`
(one paragraph naming `lint_structure.ts` beside `lint_systems.ts`),
`SYSTEMS.md` (the same, in the gates list), `PLAN_COMPONENTS_TREE.md`.

**Deliverable.** `deno task typecheck` runs `lint:structure` after
`lint:systems` and is green with no scope argument. `SYSTEMS.md` and
`SYSTEM_14` say what the lint enforces in one sentence each and point at
the protocol. G5 over the whole tree: no tracked `.md` outside `PLAN_*.md`
names a pre-plan component path.

**Not in this step.** Anything else. A finding here is a finding against
an earlier step and goes to §8 with that step's number.

**Gates.** Floor, with the chained lint. G5 whole tree.

**Ends with.** One commit. The review that passes deletes this file in its
commit.

## 5. Gates catalogue

| Gate | What it proves | Command | First reached |
| --- | --- | --- | --- |
| G1 | The floor | §0 | 1 |
| G2 | Tree rules hold under a scope | `deno task lint:structure <dir>` | 3 |
| G3 | Git sees moves, not delete-plus-add | `git diff -M --name-status <c>^ <c>` lists every moved file as `R…`; a `D`/`A` pair for one path is a finding | 3 |
| G4 | Baseline unchanged apart from paths | `jq '[.[] \| {id,text}] \| sort' validate_protocols_baseline.json` identical before and after the step | 3 |
| G5 | Docs name no moved path | `git grep -n "client/src/components/<old>" -- '*.md' ':!PLAN_*.md'` empty for every path the step moved | 3 |
| G6 | Lint self-test | `deno task test` runs `server/tests/lint_structure_test.ts` | 2 |

## 6. Out of scope

- `client/src/onboarding/` as an area. It mixes a modal, a catalogue and
  storage; splitting it is its own decision. This plan only makes its
  imports hit entries.
- Behaviour changes of any kind, including the cycles that exist today at
  file level inside a folder.
- Export renames (`VisualizationEditor`, `ProductCopilotHost`,
  `InstanceDatasetHmis` and the like keep their names; the files are
  renamed to match them, not the reverse).
- The Explore page. When it lands it consumes `_shared/figure_editor/`
  through the entry; nothing here anticipates it.
- Shipping the panther audit tool. The lint stays app-local.
- `lib/ai_tools/*` comments that name copilot paths: rewritten in step 7
  because they are prose about moved files, but no `lib/` code moves.

## 7. Rollout and rollback

- Nothing ships from this plan on its own. Every step leaves `version2`
  deployable; `./deploy_testing` may run at Tim's discretion after any
  review passes.
- Order: steps 1 and 2 now; the collaborator merge lands; steps 3 to 10.
  As soon as step 10's review passes, the collaborator branch merges
  `version2` so both branches share the tree and later merges are ordinary.
- Whoever performs the first merge across the moves sets
  `git config merge.renameLimit 10000` in their clone first; the default
  candidate limit is below what 300 moved files produce, and when it is
  exceeded git silently reports modify/delete conflicts instead of
  renames.
- Rollback of any step is `git revert` of its commits in reverse order;
  the pairing of move and follow-up commits per folder is what keeps a
  partial revert green.

## 8. Build log

| When | Step | Row |
| --- | --- | --- |
| 2026-09-20 | plan | Written from the tree as measured that day (316 files, 22 top-level folders, 35 deep imports, 5 dead files, 16 baseline entries). |
| 2026-09-22 | plan | Tim: the collaborator merge landed (`676d9871`). Steps 3 to 10 are unblocked. |
| 2026-09-22 | plan | Re-measured after the merge: 336 files, same 22 folders, same 5 dead files, 16 baseline entries, both gates green. The merge added a two-way dependency between `components/report/` and `exports/`; R12 and step 8 were rewritten to a layering rule, and R11, step 6 and step 7 to rules instead of file lists, before `Do 1`. |
| 2026-09-22 | 1 | Deviation: `./sync platform` was not run. Panther HEAD (`ca6a023`) is six commits past the synced `21b1caf`, and a wholesale sync would have brought 71 module files into `panther/`, outside this step's surface. The three protocol files were copied by hand exactly as the sync copies them (plain copy, mode 444); they were identical between `21b1caf` and panther HEAD before the edit, so the next real sync will find them unchanged. Panther commit `8370dc4`. |
| 2026-09-22 | 1 | Fact found: panther's `sync-configs.json` no longer has a `platform` target (dropped in `ca6a023`); it has `wb-fastr` pointing at `apps/wb-fastr/panther`, not this worktree. `README.md`'s `./sync platform` is stale. Not in this plan's surface. |
| 2026-09-22 | 1 | Floor, outside this step's surface and reported, not fixed: `lint:systems` fails with one orphan, `server/tests/population_coverage_issue_test.ts` (added in `29763bbc`, claimed by no SYSTEM manifest); `deno task test` fails one test, `consolidated products: a deck version restores` (`server/tests/consolidated_products_test.ts:208`). `./validate_protocols` passes. `./run` was not exercised: the step changed only markdown, and `./run` replaces the machine-global `pg` and `valkey` containers. |
| 2026-09-22 | 1 | Step 1 built. |
| 2026-09-22 | plan | Tim: the floor is restored out of plan in `3fb0efb8` (the orphan claimed by S8, the deck-restore test passes duplicate a scope). Every review from here expects the floor green. |
| 2026-09-22 | plan | Tim: `./run` is replaced in the floor by `deno task typecheck` plus the client build (`cd client && npm run build`), because `./run` replaces the machine-global `pg` and `valkey` containers. |
| 2026-09-22 | plan | Tim: one continuous context runs the Do and Fix sessions from here; every Review runs in a fresh agent that did not write the code, per the protocol. |
| 2026-09-22 | 1 | Finding: `panther/protocols/PROTOCOL_UI_STRUCTURE.md:49`, rule 7 (no runtime import cycle between folders, import rule 5 of §2) has no Do/Don't. The Do/Don't sections (lines 64 to 159) cover the nav mirror, the entry, scoped shared, layers and names; nothing shows a folder cycle and its fix. The deliverable says each rule has one. Fix in panther, then re-copy. |
| 2026-09-22 | 1 | Finding: `panther/protocols/PROTOCOL_UI_STRUCTURE.md:11` says "Every rule below is mechanically checkable, and each checklist item names the check that verifies it", but lines 207 to 212 add four checkbox items under "Judgement, not linted" with no check id, and rules 1, 2, 8 and 9 have no check. The file contradicts itself and the deliverable ("a Checklist whose every item names the check id"). Reword line 11 to say which rules the lint covers, and either turn the four judgement items into prose or drop them; the nine id-bearing items (lines 193 to 205) are correct as they stand. Fix in panther, then re-copy. |
| 2026-09-22 | 1 | Reviewer's reading, no change needed: the app commit `b7dd54fc` also contains `PLAN_COMPONENTS_TREE.md` (the Next step line and four log rows), which the two-things rule requires of every session; the step's gate at line 292 ("lists only `panther/protocols/*`") and the deliverable at line 286 omit it. Everything else checked: the three synced files are byte-identical to panther `8370dc4`, mode 444 as `cli/copy.ts` sets, unchanged in panther between `21b1caf` and `ca6a023` so the hand copy equals what a sync would produce, and free of em-dashes; the sync deviation is accepted for the reasons logged. Gates green: `deno task typecheck`, `deno task test` (384 passed), `./validate_protocols`, `cd client && npm run build`, panther `deno task typecheck` at `8370dc4`. |
| 2026-09-22 | 1 | Step 1 reviewed: 3 findings. |
| 2026-09-22 | 1 | Fix: panther `de5bf6f` adds a Cycles Do/Don't for rule 7, rewords the opening to name the linted rules (3 to 7 and the naming half of 10) and turns the four unlinted checklist items into prose. Copied by hand as in the step 1 deviation, mode 444, byte-identical to panther HEAD. |
| 2026-09-22 | 1 | Step 1 fixed. |
| 2026-09-22 | 1 | Step 1 reviewed: pass. Re-review after Fix 1: rule 7 has a Cycles Do/Don't (`PROTOCOL_UI_STRUCTURE.md:160`), the opening (line 11) names the linted rules and the four judgement items are prose (line 228); the copy is byte-identical to panther `de5bf6f`, mode 444, no em-dashes; app commit `c4d9218d` holds that file and the plan only. Gates green: `deno task typecheck`, `deno task test`, `./validate_protocols`, `cd client && npm run build`, panther `deno task typecheck`. Noted, not a finding: the opening lists rule 1 as judgement though `root-file` lints its "no file at the root" half. |
| 2026-09-22 | 2 | Starting point, `deno task lint:structure` over the whole client: root-file 17, snake-case 110 (107 files, 3 folders), index-entry 26, entry-only 260, shared-scope 3, shared-consumers 12, direction 9, unimported 5 (the five dead files of R14), entry-cycle 0 (no `mod.ts` exists yet). 442 hits. |
| 2026-09-22 | 2 | Deviation forced by the floor: `SYSTEM_14_client_shell.md` gains one glob, `server/tests/lint_structure_test.ts`, because `lint:systems` fails on an unclaimed test and the step's surface named no SYSTEM file. S14 is where step 10 documents the lint. |
| 2026-09-22 | 2 | Choice the plan did not cover: `unimported` also treats `client/src/index.tsx` as a root, since it is the Vite entry that imports `app.tsx`; without it `app.tsx` and `index.tsx` would be the only unreachable files. Hits are reported for every file under `client/src`, not only `components/`, so a file left dead by step 8 is caught. |
| 2026-09-22 | 2 | Choice the plan did not cover: `shared-consumers` counts per direct child of a `_shared/` folder (a file or a sub-folder), and an import of the folder's `mod.ts` is attributed to the children whose exported names the importer names (`export *` and `export { } from` are followed). A namespace import counts for every child. `entry-cycle` edges are runtime imports of a `mod.ts` only, as §2 rule 5 says, so deep imports tolerated until step 10 do not form cycles. |
| 2026-09-22 | 2 | Step 2 built. |
| 2026-09-22 | 2 | Reviewer's reading, no change needed. Surface: `63779d1b` touches `lint_structure.ts`, `deno.json` (`lint:structure` only; `typecheck` unchanged), `server/tests/lint_structure_test.ts`, the plan, and the one S14 glob, which is accepted: forced by `lint:systems`, one line, in the file step 10 names for the lint. Deliverable verified in the code: nine checks with R9's ids; a harness over the parser built 1069 edges, one per local `from` specifier under `client/src` (240 files with multi-line imports, inline `type` specifiers, the one side-effect import, the two dynamic imports), with `~/font-map.json`, `./app.css` and the `node_modules/*?raw` import correctly external; the scope argument rejects a directory outside `client/src` with exit 2; `index.tsx` as a root is right (`client/index.html:32` loads `/src/index.tsx`, and `app.tsx` alone would leave `index.tsx` unreached); `entry-cycle` skips `import type` (pinned by the test); the starting counts re-measured to the log row. Hits sampled against the files: root-file 17 equals `ls`, index-entry 26 equals `find`, the 12 shared-consumers hits agree with grep (`fastr_logos.ts` passes on `_shared` plus `slide_deck`; `logo_selector.tsx` has only `logo_section_editor.tsx`), the 5 unimported are R14's dead files, the 9 direction hits are R12's list. Noted, not findings: (a) `shared-consumers` counts a `_shared/` sub-folder as one unit, so `_shared/cursors/` passes although each of its three files has one consumer; per-file counting would flag every internal file of `_shared/figure_editor/`, so the unit is right, and step 7 dissolves `cursors/` by hand. (b) The `unimported` message (`lint_structure.ts:398`) names `app.tsx` and `routes/` but not `index.tsx`. (c) `ReExport.source` (`lint_structure.ts:53`) is never read. (d) An import from `state/` into `components/_shared/` is reported three times (entry-only, shared-scope, direction), which is why shared-scope's 3 are all direction hits. (e) `deno fmt --check` fails on both new files, as it does on `lint_systems.ts`; the root scripts have no fmt gate. Gates green: `deno task typecheck`, `deno task test` (396 passed, the lint test's 12 cases included), `./validate_protocols`, `cd client && npm run build`, `deno task lint:structure client/src/components/_shared` (16 hits, exit 1, no crash). |
| 2026-09-22 | 2 | Step 2 reviewed: pass. |
| 2026-09-22 | 3 | Fact the plan got wrong: a move commit that leaves the SYSTEM globs alone is red, because `deno task typecheck` runs `lint:systems` and a moved file matches no glob. Globs move in the move commit (a path rewrite, nothing else); prose moves in the follow-up as R15 says. |
| 2026-09-22 | 3 | Deviation: `50887be9` (instance follow-up) and `7e3a4130` (users move) are red on `lint:systems`, one orphan, `instance/mod.ts`, because the lint was run before the new file was staged and `git ls-files` does not see untracked files. `415c4ca3` claims it in S14; every later follow-up claims its `mod.ts` in the owning manifest. A hard reset to amend was not available to the session. |
| 2026-09-22 | 3 | Choice the rulings did not cover: `instance.tsx` keeps its default export (export renames are out of scope, §6) and `instance/mod.ts` re-exports it as `Instance`; `clerk` and `LoggedInWrapper` are exported from the same entry for `routes/`, `onboarding/storage.ts` and `slide_deck/index.tsx` until step 8 moves the singleton. |
| 2026-09-22 | 3 | Fact found: SYSTEM_15's prose claimed `components/instance/**` minus exceptions; its manifest lists files. The prose now names `users/**` and the four forms it owns under `instance/`. `PROTOCOL_APP_UI_CONVENTIONS.md` names `instance/profile.tsx`, which did not move. |
| 2026-09-22 | 3 | G2 over `instance`, `users`, `assets`, `explore`: 17 `entry-only` hits, every target a folder a later step moves: `instance.tsx` -> `products/index.tsx`, `instance_results_packages/index.tsx`; `instance_data.tsx` -> `_shared/dhis2_credentials/manage_connection.tsx`, `indicator_manager_hfa/hfa_indicators_manager.tsx`, `indicator_manager_hmis/indicators_manager.tsx`, `instance_dataset_{hfa,hmis,iceh}/index.tsx`, `instance_hfa_time_points/index.tsx`, `structure/{index,admin_area_labels,family_configuration,hfa_weights}.tsx`, `instance_geojson/geojson_manager.tsx`, `instance_population/population_manager.tsx`; `assets.tsx` and `users/batch_upload_users_form.tsx` -> `_uppy_file_upload.ts`. All other checks 0 in scope. G3: every moved file is an `R` row (R096 to R100). G4 and G5 clean after each folder. Floor green: typecheck, 396 tests, validate_protocols, client build. |
| 2026-09-22 | 3 | Step 3 built. |
| 2026-09-22 | 3 | Finding: `client/src/onboarding/catalogue.ts:11`, the comment names `components/instance/index.tsx`, which `f5e9a668` renamed to `instance.tsx`. Prose about a moved file moves with it (§6 applies the same rule to the `lib/ai_tools/*` comments in step 7). Rewrite the path in the comment. The file is outside the step's surface; the Fix touches that line only. |
| 2026-09-22 | 3 | Finding: `SYSTEMS.md:61`, the rewritten custody row for `instance/logged_in_wrapper.tsx` is one character wider than every other row of the §4.1 table (195 against 194 by character count): the first cell carries one space of padding too many. Drop one space. |
| 2026-09-22 | 3 | Reviewer's reading, no change needed. Surface: `PROTOCOL_APP_STATE.md`, `SYSTEM_03_realtime_cache.md` and `SYSTEM_17_logging.md` are outside the step's list, each a prose path rewrite that R15 requires; `client/src/components/slide_deck/index.tsx` is outside it too, one import line, because it imports `clerk` and §1 listed no such consumer. Both accepted: the surface list was short, the rulings were not. The glob-in-move-commit deviation is accepted: `lint:systems` is chained into the typecheck, so a glob-less move commit cannot be green; `f5e9a668`, `7e3a4130` and `cefdd55c` touch globs by path rewrite only, `af2380ee` needed none, and no move commit touches prose. The two red commits are as recorded: `lint:systems` fails at `50887be9` and `7e3a4130` on the `instance/mod.ts` orphan and passes at the other eight; `./validate_protocols` passes at all ten (the instance move commit reports 6 unmatched baseline entries as a note, not a failure, and the follow-up moves them). R8's "both green" is broken for those two, a Fix cannot amend history, and `415c4ca3` already made the tree green, so nothing remains to do. Not stale: `LoggedInWrapper` at `SYSTEM_01:409`, `SYSTEM_09:775` and `SYSTEM_14:119` names the component export, which §6 keeps. Verified: `SYSTEM_14:281` says `useConnectionMonitor()` has no caller, and its definition is the only occurrence; the four entries export what `routes/`, `onboarding/` and `instance.tsx` import and nothing else; the five dead files are gone; the deliverable's file lists match the tree; no em-dash was added. Gates: G2 17 `entry-only` hits (instance 15, users 1, assets 1, explore 0), each in the §8 row, every other check 0 in scope; G3 every moved file `R096` to `R100`; G4 identical; G5 empty for all 18 old paths; floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 3 | Step 3 reviewed: 2 findings. |
| 2026-09-22 | 3 | Fix: the `onboarding/catalogue.ts` comment names `instance/instance.tsx`; the SYSTEMS.md §4.1 row is re-padded to the table width. |
| 2026-09-22 | 3 | Step 3 fixed. |
| 2026-09-22 | 3 | Step 3 reviewed: pass. Re-review after Fix 3: `client/src/onboarding/catalogue.ts:11` names `components/instance/instance.tsx`; `SYSTEMS.md:61` is 194 characters like its neighbours; `1b80c407` touches those two files and the plan only, with no em-dash added. Floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 4 | Code wins over R13: facilities, geojson and `family_configuration.tsx` have one importer, `data.tsx`, so R4's count (the parent's root files are one child) and the `shared-consumers` check reject `data/_shared/`. They are pages `data.tsx` opens and sit where R2 puts them: `data/facilities/` (with `import/`), `data/geojson/`, `data/family_configuration.tsx`. `hfa/_shared/time_points.tsx` stands: `hfa/mod.ts` re-exports it and `hfa/dataset/` imports it, two children. |
| 2026-09-22 | 4 | Choice the rulings did not cover: the `index.tsx` files R3 renames take the page's name as step 3 did (`facilities.tsx`, `dataset.tsx`, `imports.tsx`); the two that are not pages are named for their export minus the words the path already says: `structure_import/index.tsx` is `facilities/import/upload_attempt_form.tsx` (`StructureUploadAttemptForm`) and `indicator_manager_hfa/ai/index.tsx` is `hfa/indicators/ai/ai_wrapper.tsx` (`HfaIndicatorAiWrapper`); `geojson_upload_wizard/index.tsx` is `wizard.tsx`. No other file was renamed. |
| 2026-09-22 | 4 | Choice the rulings did not cover: `hfa_r_code_validator.ts` is imported by the indicator manager's root files and by `ai/`, so it lives in `hfa/indicators/_shared/` with its own entry; in the root it would make `indicators` and `indicators/ai` an entry cycle. Every `mod.ts` under `data/` that no `**` glob covers is S6's (`data/mod.ts`, `general/mod.ts`, `hfa/mod.ts`); S5's `**` globs cover the entries inside facilities, geojson, indicators and `hfa/_shared`. |
| 2026-09-22 | 4 | Fact the plan got wrong: the gate allows `entry-only` hits only against HMIS paths, but five files import the root file `_file_upload_selector.tsx`, which step 6 moves (`facilities/import/step_1_csv.tsx`, `geojson/geojson_upload_wizard/step_1_file.tsx`, `hfa/hfa_weights.tsx`, `hfa/imports/_wizard.tsx`, `iceh/imports/_wizard.tsx`); §0 tolerates a deep import into a folder that has not moved. And `snake-case` reports 22 underscore-prefixed files under `data/`, all step 9's, which this step's "Not in this step" defers. |
| 2026-09-22 | 4 | G2 over `data`: `entry-only` 9 (the five above plus `data.tsx` -> `_shared/dhis2_credentials/manage_connection.tsx`, `indicator_manager_hmis/indicators_manager.tsx`, `instance_dataset_hmis/index.tsx`, `instance_population/population_manager.tsx`), `snake-case` 22 as above, every other check 0, `shared-consumers` and `entry-cycle` included. G3: every moved file an `R` row (R098 to R100) in each of the eight move commits. G4 and G5 clean. Floor green: typecheck, 396 tests, validate_protocols, client build. |
| 2026-09-22 | 4 | Step 4 built. |
| 2026-09-22 | 4 | Finding: `PLAN_COMPONENTS_TREE.md:640` and `:641`, the two rows that record `snake-case` 22 overstate the count. `deno task lint:structure client/src/components/data` at `b78ce033` reports `snake-case` 21, and `find client/src/components/data -type f -name '_*'` lists 21 (`facilities/import/` 1, `hfa/dataset/` 2, `hfa/imports/` 6, `hfa/indicators/` 2, `iceh/dataset/` 4, `iceh/imports/` 6; the two `_shared/` folders are exempt). Changes no code; this row is the corrected count. |
| 2026-09-22 | 4 | Reviewer's reading, no change needed. Surface: `PROTOCOL_APP_STATE.md`, `PROTOCOL_APP_UI_CONVENTIONS.md` and `SYSTEM_15_admin_ops.md` are outside the step's list, each a prose path rewrite R15 requires, and `client/src/components/instance/instance.tsx` is one import line, the switchboard's only importer; all accepted as in Review 3. Commit shape: the eight move commits change nothing but `git mv`, import specifiers and glob paths, the eight follow-ups add entries, switch deep imports to them and rewrite manifests and prose, and no code commit touches the plan. The R13 override is sound: `data.tsx` is the only importer of `facilities/`, `geojson/` and `family_configuration.tsx` (grep over `client/src`), so R4 as written counts one child and `data/_shared/` would fail `shared-consumers`; R2 puts them where they are. `hfa/_shared/time_points.tsx` (root re-export plus `dataset/`) and `hfa/indicators/_shared/hfa_r_code_validator.ts` (two root files plus `ai/`) each have two children. The `_file_upload_selector.tsx` and `snake-case` tolerances are sound: §0 tolerates a deep import into what has not moved, and step 9 owns every underscore rename. Verified: every deliverable folder has its `mod.ts`; `data.tsx` imports entries apart from the four HMIS deep imports and the same-folder `family_configuration.tsx`; `SYSTEMS.md:68` names `data/data.tsx` at the table's width; the SYSTEM_13 anchors resolve to `ai_wrapper.tsx:36` (`approvalPolicy`) and `:39-41` (the DEV `validateAIChatConfig`), the file being `R100`; every `[x](client/src/components/...)` link in the touched docs resolves; G5 empty for all ten old paths, as full paths and as bare names; no em-dash or code comment added. Noted for step 9, not findings: `hfa/hfa_weights.tsx`, `geojson/geojson_*.tsx` and `geojson/geojson_upload_wizard/` repeat their folder's name (R7), and `hfa/indicators/_shared.ts` sits beside `hfa/indicators/_shared/`. Gates: G2 `entry-only` 9 and `snake-case` 21, each hit in the §8 list, every other check 0; G3 every moved file `R098` to `R100` in each of the eight move commits; G4 identical; `lint:systems` green at all sixteen code commits; floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 4 | Step 4 reviewed: 1 finding. |
| 2026-09-22 | 5 | Code wins over R13 for two of the three selectors: `WindowingSelector` is imported only by the HMIS dataset's delete form and `TimeIndexSelector` only by `PeriodSelector`, so `shared-consumers` rejected both in `data/hmis/_shared/`. `windowing_selector.tsx` is in `data/hmis/dataset/`; `period_selector.tsx` and `time_index_selector.tsx` form the folder `data/hmis/_shared/period_selector/` (R9: a folder at the second file), whose consumers are the dataset (through the windowing selector) and the imports wizard. Done in `675c10ba` and `f5a646a6` after the first G2 run. |
| 2026-09-22 | 5 | Code wins over the deliverable for `module_parameter_inputs.tsx`: the wizard and the catalogue's root files both import it, so at the root it would make `results_packages` and `results_packages/wizard` an entry cycle. It is `results_packages/_shared/module_parameter_inputs.tsx` with its own entry. |
| 2026-09-22 | 5 | Choices the rulings did not cover: `instance_dataset_hmis/_import_information.tsx` is imported only by two imports files, so it moved to `data/hmis/imports/`; `imports/_recurrence_label.ts` is imported by the imports root and the wizard, so it is `imports/_shared/_recurrence_label.ts`; `imports/_indicator_picker.tsx` is imported only by the wizard and moved into it. The HMIS `imports/_wizard/` and results `_wizard/` folders are `wizard/` now (the deliverable names `wizard/**`; a folder is moved once). `index.tsx` files are named as in step 4 (`dataset.tsx`, `imports.tsx`, `wizard.tsx`, `results_packages.tsx`). The six files the deliverable names in `data/hmis/_shared/` took their snake_case names; every other file keeps its name for step 9, `Dhis2CredentialsEditor.tsx` included. `data/hmis/mod.ts` and `data/hmis/_shared/mod.ts` are S6's; `dhis2_connection/**` is S7's; `_shared/**` in S12 no longer carries `dhis2_credentials/` and its prose says so. |
| 2026-09-22 | 5 | Fact the plan got wrong: the gate allows `entry-only` hits only against `products/` paths, but seven under `data/` target `_file_upload_selector.tsx` (six files) and `figure_editor/conditional_formatting_editor.tsx` (`hmis/indicators/_edit_indicator.tsx`), both step 6's; tolerated under §0 as in step 4. `snake-case` reports 52 under `data/` (the 21 of step 4 plus 30 underscore-prefixed HMIS files and `Dhis2CredentialsEditor.tsx`) and 5 under `results_packages/` (the wizard's underscore files), all step 9's. |
| 2026-09-22 | 5 | G2 over `data`: `entry-only` 8 (the seven above plus `hfa/imports/_wizard.tsx` counted among the six), every other check 0 apart from `snake-case`. G2 over `results_packages`: `entry-only` 1 (`detail.tsx` -> `products/product_types.ts`, step 6), every other check 0 apart from `snake-case`. G3: every moved file an `R` row (R091 to R100) in each of the nine move commits. G4 and G5 clean. Floor green: typecheck, 396 tests, validate_protocols, client build. |
| 2026-09-22 | 5 | Step 5 built. |
| 2026-09-22 | 5 | Finding: `SYSTEM_06_ingestion.md:556`, the Open items row names `imports/_wizard/index.tsx`, which `73c9a3e0` renamed to `data/hmis/imports/wizard/wizard.tsx` (`getCurrentPeriodId` is at `wizard.tsx:71`). G5 greps the `client/src/components/<old>` form and misses a bare relative path. Rewrite the path. |
| 2026-09-22 | 5 | Finding: `PLAN_COMPONENTS_TREE.md:649` and `:650` miscount. `_file_upload_selector.tsx` is imported by seven files under `data/`, not six (`facilities/import/step_1_csv.tsx`, `geojson/geojson_upload_wizard/step_1_file.tsx`, `hfa/hfa_weights.tsx`, `hfa/imports/_wizard.tsx`, `hmis/imports/_csv_wizard.tsx`, `hmis/population/_import_form.tsx`, `iceh/imports/_wizard.tsx`), which with `conditional_formatting_editor.tsx` makes the 8 `entry-only` hits; and the step has eight move commits and eight follow-ups, not nine. Changes no code; this row is the corrected count. |
| 2026-09-22 | 5 | Reviewer's reading, no change needed. Surface: `PROTOCOL_APP_STATE.md` and `PROTOCOL_APP_UI_CONVENTIONS.md` are outside the step's list, each a prose path rewrite R15 requires; `data/data.tsx` and `instance/instance.tsx` are import lines only, the switchboards that mount the moved pages; all accepted as in Reviews 3 and 4. Commit shape: every changed line in the eight move commits is a `git mv`, an import specifier or a glob path (`675c10ba` also drops two re-export lines from `hmis/_shared/mod.ts` for the files it moves out, which is the same kind of edit); the eight follow-ups add entries, switch deep imports to them and rewrite manifests and prose; no code commit touches the plan. The R13 override is sound: `WindowingSelector` has one importer (`dataset/_delete_data.tsx`), `TimeIndexSelector` one (`period_selector.tsx`), and `period_selector/` has two children (`dataset/windowing_selector.tsx`, `imports/wizard/_step_config.tsx`). The `module_parameter_inputs.tsx` override is sound: `module_defaults.tsx` (root) and `wizard/wizard.tsx` import it, and at the root the wizard would import `results_packages/mod.ts` while the root imports `wizard/mod.ts`. `imports/_shared/_recurrence_label.ts` has two children (`_tab_current.tsx`, `_tab_future.tsx` at the root; `wizard/`); `_import_information.tsx` has two importers, both `imports/` root files; `_indicator_picker.tsx` has one, `wizard/_step_indicators.tsx`; each of `indicator_display.ts`, `type_badge.tsx`, `wrap_on_underscore.tsx` has two or more of dataset, imports, indicators. Splitting `instance_dataset_hmis/` into `dataset/` and `imports/` is what the deliverable names, so R8's one-destination clause yields. Verified: every deliverable folder has its `mod.ts`; `indicators_manager.tsx:56` opens the wizard through `data/hmis/imports/mod.ts`; `data.tsx:23` and `dataset.tsx:43` import entries; no file outside `data/hmis/` or `results_packages/` reaches inside them; the S8/S12 custody row is gone from `SYSTEMS.md §4.1` and the table's width mix (193/194) is as it was; every `[x](client/src/components/...)` link in the touched docs resolves; G5 empty for all eleven old paths as full paths and as bare names apart from the finding above (`Dhis2CredentialsEditor` at `SYSTEM_07:287` is the new path); no em-dash or code comment added. Gates: G2 `data` entry-only 8, snake-case 52, all else 0; `results_packages` entry-only 1, snake-case 5, all else 0, every `entry-only` target step 6's; G3 every moved file `R091` to `R100` in each of the eight move commits; G4 identical; `lint:systems` green at all sixteen code commits; floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 5 | Step 5 reviewed: 2 findings. |
| 2026-09-22 | 5 | Fix: `SYSTEM_06_ingestion.md:556` names `data/hmis/imports/wizard/wizard.tsx`. |
| 2026-09-22 | 5 | Step 5 fixed. |
| 2026-09-22 | 5 | Step 5 reviewed: pass. Re-review after Fix 5: `SYSTEM_06_ingestion.md:556` names `data/hmis/imports/wizard/wizard.tsx`; `af12117a` touches that line and the plan only, with no em-dash added; `git grep` for `_wizard/index` and `imports/_wizard` across `*.md` excluding `PLAN_*.md` and `panther/` is empty. Floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 6 | Choices the rulings did not cover: inside `_shared/figure_editor/`, `conditional_formatting_editor.tsx` and `_style_components.tsx` are imported by the editor's root files and by the style panel folder, so they are `figure_editor/_shared/` with an entry; `cf_store_helper.ts` has only style-panel consumers and moved into that folder; the two panel folders got entries. `index.tsx` is `visualization_editor.tsx` (its export). `HelpButton.tsx` is `_shared/figure_editor/help_button.tsx` under S11's `**` glob (S14's manifest drops it; S14's prose and `PROTOCOL_APP_HELP_BUTTONS.md` say where it is); `_file_upload_selector`, `_uppy_file_upload` and `presence_avatars`, `package_label`, `product_types` took underscore-free names at `_shared/` root, as §2's tree shows them. S12's `_shared/**` glob became a file list, since S4 and S11 now own files under `_shared/`; `_shared/mod.ts` is S12's. `_shared/mod.ts` also exports the collab markdown editor and live cursors, and the files under `_shared/figure_editor/` and `_shared/cursors/` import them through it. |
| 2026-09-22 | 6 | Fact the plan got wrong: the gate says `shared-consumers` must be clean, but the deliverable leaves single-consumer files for steps 7 and 8. G2 over `_shared`: `shared-consumers` 9, exactly those leftovers. For step 7 (consumers all under `products/`): `fastr_block_labels.ts`, `fastr_theme_labels.ts` (report), `logo_section_editor.tsx` (slide deck), `logo_selector.tsx` (the logo section editor), `scope_picker.tsx`, `sort_control.tsx` (products), `cursors/report_cursors.tsx`, `cursors/slide_cursors.tsx` (pass today as two consumers, one once both editors are under `products/`), and `live_cursors.tsx`, which passes once the cursors move (today its consumers, `cursors/` and `figure_editor/`, are both the `_shared` child). For step 8 (leave `components/`): `connection_banner.tsx`, `presence_toasts.tsx` (consumer `state/`), `fastr_logos.ts` (consumer `generate_slide_deck/`; passes today through `logo_selector.tsx` and the slide deck). |
| 2026-09-22 | 6 | G2 over `_shared`: `entry-only` 2 (`product_types.ts` -> `report/index.tsx`, `slide_deck/index.tsx`, step 7), `shared-consumers` 9 as above, `snake-case` 13 (underscore-prefixed panel files, step 9), every other check 0, `entry-cycle` included. G3: every moved file an `R` row (R094 to R100) in both move commits. G4 and G5 clean. Floor green: typecheck, 396 tests, validate_protocols, client build. |
| 2026-09-22 | 6 | Step 6 built. |
| 2026-09-22 | 6 | Finding: `SYSTEM_12_documents_sharing.md:103` and `:1907` describe S12's `_shared/**` glob ("the `_shared/**` glob also carries `sort_control.tsx`", "`_shared/**` custody"), which `982736a2` replaced with a file list because S11's `_shared/figure_editor/**` and S4's two upload files now sit under `_shared/`. The manifest is the contract the step changed; prose describing it moves in the same step. Rewrite both to name the file entry (`_shared/sort_control.tsx` in S12's manifest). |
| 2026-09-22 | 6 | Finding: `SYSTEM_14_client_shell.md:93` ("`components/_shared/**` is owned by **S12**'s manifest") and `:364` ("`components/_shared/**` custody: S12's manifest owns it") state a single-owner glob that no longer exists: since `982736a2` and `4ddb85e9`, S4 owns `_shared/file_upload_selector.tsx` and `_shared/uppy_file_upload.ts`, S11 owns `_shared/figure_editor/**`, and S12 lists its own files. Rewrite both to say S12's manifest lists `_shared/sort_control.tsx`. |
| 2026-09-22 | 6 | Finding: `PLAN_COMPONENTS_TREE.md:661`, the G2 row records `snake-case` 13. `deno task lint:structure client/src/components/_shared` at `f95d5497` reports `snake-case` 12, and `find client/src/components/_shared -type f -name '_*'` lists 12 (`figure_editor/_shared/` 1, `presentation_object_editor_panel_data/` 3, `presentation_object_editor_panel_style/` 8; the two `_shared/` folders are exempt). Changes no code; this row is the corrected count. |
| 2026-09-22 | 6 | Reviewer's reading, no change needed. Surface: `SYSTEM_10_figure_render_export.md` and `SYSTEM_16_collaboration.md` are outside the step's list, each a prose path rewrite R15 requires, and every other changed file outside `_shared/` is import lines only; accepted as in Reviews 3 to 5. Commit shape: `982736a2` and `4ddb85e9` change nothing but `git mv`, import specifiers and glob paths (S12's `_shared/**` becoming a file list in `982736a2` is a glob rewrite forced by `lint:systems`, which rejects two claims on one file); `1db6abc6` and `f6644e02` add entries, switch deep imports to them and rewrite manifests and prose; `f95d5497` touches the plan only. Deliverable verified in the tree: `_shared/figure_editor/mod.ts` exports what its six product consumers and `data/hmis/indicators/_edit_indicator.tsx` import, and nothing outside `_shared/` reaches a figure-editor internal; the R10 five (`help_button.tsx`, the three modals, `viz_cursors.tsx`) each have one importer inside the folder, and the folder imports no other component folder, so no single-consumer file was left behind; each of `file_upload_selector`, `uppy_file_upload`, `presence_avatars`, `package_label`, `product_types` reaches two or more final areas through `_shared/mod.ts` (data, assets, users, results_packages, the products group, `_shared/figure_editor/`), and a harness over the import graph finds no other file under `components/` with two or more external areas apart from `instance/mod.ts` (the shell's entry; step 8 moves the clerk). The gate's "`shared-consumers` must be clean" yields to the deliverable, which leaves the step 7 and 8 files in `_shared/`; the nine hits are that list exactly. The internal choices stand: `figure_editor/_shared/` has two children (the root through `mod.ts`, the style panel folder), and `conditional_formatting_editor.tsx` at the root would have made `figure_editor` and its style panel folder an entry cycle; `cf_store_helper.ts` has only style-panel importers; the help button under S11's `**` glob with its one consumer is sound. `PROTOCOL_APP_HELP_BUTTONS.md:117` names the new home and the promotion rule; `SYSTEMS.md:66` is 193 characters with its pipes at its neighbours' columns (rows 63 and 64 were 194 before the step); every `[x](client/src/components/...)` link in the nine touched docs resolves; G5 empty for all fifteen old paths as full paths and as bare names (`HelpButton` at `SYSTEM_14:340` and `PROTOCOL_APP_HELP_BUTTONS.md:89` is the export name, which §6 keeps); no em-dash or code comment added. Gates: G2 `entry-only` 2 (both step 7's), `shared-consumers` 9, `snake-case` 12, all else 0; G3 every moved file `R094` to `R100` in `982736a2` and `R098` to `R100` in `4ddb85e9`, no `D`/`A` pair; G4 identical; `lint:systems` green at all four code commits; floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 6 | Step 6 reviewed: 3 findings. |
| 2026-09-22 | 6 | Fix: `SYSTEM_12_documents_sharing.md` (the custody wrinkle and its Open item) and `SYSTEM_14_client_shell.md` (the custody sentence and its Open item) now say S12's manifest lists `_shared/sort_control.tsx`, not that a `_shared/**` glob owns the folder. |
| 2026-09-22 | 6 | Step 6 fixed. |
| 2026-09-22 | 6 | Step 6 reviewed: pass. Re-review after Fix 6: `SYSTEM_12_documents_sharing.md:103` and `:1907` and `SYSTEM_14_client_shell.md:93` and `:364` say S12's manifest lists `_shared/sort_control.tsx`, which matches `SYSTEM_12:21`; `git grep '_shared/\*\*'` over both files is empty; `ba3df6a3` touches those two files and the plan only, with no em-dash added. Floor green at HEAD: `deno task typecheck`, `deno task test` (396 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 7 | Code wins over step 6's placement of `product_types.ts`: the registry imports both editors at runtime, so at top-level `_shared/` it would make `_shared` and `products/report` an entry cycle once the editors had entries. It is `products/product_types.ts`, exported from `products/mod.ts`; `results_packages/detail.tsx` imports that entry and the copilot imports its type only. |
| 2026-09-22 | 7 | Placements by R4 and R11, from the import graph: `products/_shared/` holds the explorer's four modals and chips the editors also open, `folder_tree.ts` (the settings form and the explorer), `scope_picker.tsx` (two of those modals), `_id_generation.ts` (slide deck, copilot, slide_ai), `rebase_edits.ts` and `report_style_editor.tsx` (report and copilot), and the report rendering files version history also reads: `ReportFigureEmbed.tsx`, `report_html_preview.tsx`, `report_figure_raster.ts`, `report_markdown_style.ts`, `report_html.ts`, `scroll_sync.ts`, `paginate_report.ts` (`version_history/` inside `_shared/` cannot import `report/mod.ts` without a cycle; step 8 moves the four `exports/` also reads down to `generate_report/`). `report_page_map.ts` has one consumer, the copilot's report editor tool, and sits beside it. Inside the copilot, `_shared/` holds the eight files its root and its tools or `slide_ai/` both import (`ai_views`, `types`, `interactions`, `build_system_prompt`, `client_env`, `client_info_topics`, `format_figure_config_for_ai`, `content_validators`); `DraftSlidePreview.tsx` and `add_slide_to_deck.ts` moved into `ai_tools/tools/`, their one consumer; `ai_documents/index.ts` and `ai_prompt_library/index.ts` are `mod.ts`. `slide_editor/` gained the six files only it imports (`_markdown_guide`, `build_context_menu`, `conflict_resolution_modal`, `slide_cursors`); `_editor_snapshot.ts` and the two logo editors sit at the slide deck root; the report cursors and the two label tables sit at the report root. `index.tsx` files took the folder's name (`products.tsx`, `copilot.tsx`, `slide_deck.tsx`, `slide_editor.tsx`, `report.tsx`, `insert_figure.tsx`, `version_history.tsx`). |
| 2026-09-22 | 7 | Manifests: S12's `products/**` became `products/*.ts`, `products/*.tsx`, `products/_shared/*.ts`, `products/_shared/*.tsx`, `products/slide_deck/**`, `products/report/**`, since S11 owns `products/_shared/insert_figure/**`, S16 `products/_shared/version_history/**` and S13 `products/copilot/**`. S11 ceded `_editor_snapshot.ts` and `conflict_resolution_modal.tsx` to S12's `products/slide_deck/**`. `server/tests/folder_tree_test.ts` (outside the surface, forced) imports `products/_shared/folder_tree.ts` directly: the entry re-exports Solid components the Deno check cannot resolve. `lib/ai_tools/*` comments name the new copilot paths, and one that named a `project_ai/` path that never existed under `components/` now names `products/copilot/_shared/build_system_prompt.ts`. |
| 2026-09-22 | 7 | Deviation, outside the surface and forced by the gate: `lint_structure.ts` (`340d6b09`, with a test case) now lets a `_shared/` file inherit the consumers of the `_shared/` files that import it, computed to a fixpoint. Before, a helper imported only by another shared file (`products/_shared/scope_picker.tsx`, `copilot/_shared/interactions.ts`) always counted one consumer, the `_shared` folder itself, which R4 does not intend. |
| 2026-09-22 | 7 | Fact the plan got wrong: the four "pure `git mv`" move commits are not R100 throughout (copilot R085 to R100, slide deck R095 to R100, report and version history R098 to R100), because files inside those folders import each other by relative paths that change when a file moves between sub-folders (`slide_ai/` into the copilot, `index.tsx` renames, the copilot's `_shared/`). Every moved file is still an `R` row. |
| 2026-09-22 | 7 | Fact the plan got wrong: `entry-cycle` cannot be clean across `products/` until step 8. The one cycle is `instance -> products -> slide_deck -> instance` (plus `results_packages`), through `slide_deck.tsx` importing `clerk` from `instance/mod.ts`; R12 moves the Clerk singleton to `state/_infra/` in step 8, which breaks it. G2 over `products` is otherwise 0 on every check except `snake-case` 25 (step 9). G2 over `_shared`: `shared-consumers` 3, the step 8 leftovers (`connection_banner.tsx`, `presence_toasts.tsx`, `fastr_logos.ts`), `snake-case` 13, all else 0. G3: every moved file an `R` row in all six move commits. G4 and G5 clean. Floor green: typecheck, 397 tests, validate_protocols, client build. |
| 2026-09-22 | 7 | Step 7 built. |
| 2026-09-22 | 7 | Finding: `340d6b09` (the `lint_structure.ts` refinement) also carries the `git mv` of `products/_shared/report_page_map.ts` to `products/copilot/ai_tools/tools/report_page_map.ts` (`git diff -M --name-status` shows it `R100` there), while `3eff4aad`'s message and the placements row above credit the move to the fix commit. At `340d6b09`, `products/_shared/mod.ts:17` still re-exports `./report_page_map.ts` and `report_page_map.ts:9` and `:10` still import `./paginate_report` and `./report_figure_raster`, so the client typecheck fails there with three TS2307 errors; `3eff4aad` repairs it. R8's "both green" is broken for one commit, history cannot be amended, and the tree is green from `3eff4aad` on, so nothing remains to do in code. This row is the record. |
| 2026-09-22 | 7 | Finding: `PLAN_COMPONENTS_TREE.md:676`, the G2 row records `snake-case` 25 over `products` and 13 over `_shared`; `deno task lint:structure` at `f488b954` reports 24 and 12 (Review 6 corrected `_shared` to 12 already, and step 7 renamed nothing that stayed under `_shared/`). `:672` says `slide_editor/` "gained the six files only it imports" and names four; `54049045` moved four into `slide_editor/` (`_markdown_guide.tsx`, `build_context_menu.ts`, `conflict_resolution_modal.tsx`, `slide_cursors.tsx`) and three to the deck root (`_editor_snapshot.ts`, `logo_section_editor.tsx`, `logo_selector.tsx`), seven from outside `slide_deck/` in all. Changes no code; this row is the corrected count. |
| 2026-09-22 | 7 | Finding: `SYSTEM_11_viz_authoring.md:49` and `:52`, the paragraph naming what S11 owns still lists `_editor_snapshot.ts` and `forms_editors/conflict_resolution_modal.tsx`, which `54049045` moved under `products/slide_deck/` and S12's `products/slide_deck/**` glob now owns (the S11 manifest dropped both in that commit; line 84 already links the new home). Rewrite the paragraph to say S12 owns them. `:76` names `slide_editor/index.tsx` and `:78` `report/index.tsx`; the files are `products/slide_deck/slide_editor/slide_editor.tsx` and `products/report/report.tsx`. |
| 2026-09-22 | 7 | Finding: `SYSTEM_16_collaboration.md:55`, the shared-custody bullet names `_shared/cursors/`, which `54049045` and `4a0cb5fb` dissolved into `products/slide_deck/slide_editor/slide_cursors.tsx` and `products/report/report_cursors.tsx` (lines 60 to 62 of the same file already name them). `:417`, `:473` and `:1240` are links whose text says `slide_editor/index.tsx` and `report/index.tsx` while the targets are `slide_editor.tsx` and `report.tsx`. Rewrite the names. |
| 2026-09-22 | 7 | Finding: `SYSTEM_12_documents_sharing.md:243`, `:257`, `:276` and `:1346` are links whose text says `slide_deck/index.tsx`, `slide_editor/index.tsx`, `layout_editor/build_context_menu.ts` and `report/index.tsx` while the targets are `slide_deck.tsx`, `slide_editor.tsx`, `slide_editor/build_context_menu.ts` and `report.tsx`; `:934` says "index.tsx hands" for `report.tsx`. Rewrite the names. |
| 2026-09-22 | 7 | Finding: `SYSTEM_13_ai_assistant.md:337`, the link text says `index.tsx` for `products/copilot/copilot.tsx`. Rewrite the name. |
| 2026-09-22 | 7 | Finding: `SYSTEM_10_figure_render_export.md:279` names `report/index.tsx` (`daef04c7` rewrote line 280 of the same sentence and left it) and `:608` names `slide_editor/index.tsx`; the files are `products/report/report.tsx` and `products/slide_deck/slide_editor/slide_editor.tsx`. |
| 2026-09-22 | 7 | Finding: `SYSTEM_08_results_packages.md:373` names `products/index.tsx`, which `b768400c` renamed to `products/products.tsx`, and `:414` names `_shared/scope_picker.tsx`, which is `products/_shared/scope_picker.tsx`. |
| 2026-09-22 | 7 | Finding: `PROTOCOL_APP_UI_CONVENTIONS.md:132` names `products/index.tsx`, now `products/products.tsx`; `83f0da77` rewrote line 135 of the same paragraph and left it. |
| 2026-09-22 | 7 | Finding: `SYSTEM_05_facilities_indicators.md:1234`, the Open items row names `figures/insert_figure/metric_card.tsx`, which `154dc1c7` moved to `products/_shared/insert_figure/metric_card.tsx`. The file is outside the step's surface; R15 covers every `SYSTEM_*.md`, and the Fix touches that line only. |
| 2026-09-22 | 7 | Finding: `lib/ai_tools/content_validators.ts:14`, the comment names `copilot/ai_tools/validators/content_validators.ts`, which `5701655c` moved to `products/copilot/_shared/content_validators.ts`. §6 has step 7 rewriting these comments; `daef04c7` rewrote the other three `lib/ai_tools/` files and left this one. |
| 2026-09-22 | 7 | Reviewer's reading, no change needed. Surface: `SYSTEM_08`, `SYSTEM_10`, `SYSTEM_11` and `SYSTEM_14` are prose rewrites R15 requires, `lib/ai_tools/{build_system_prompt,info_catalog,mod}.ts` are the comment rewrites §6 names, `server/tests/folder_tree_test.ts` is one import line (verified: `products/_shared/mod.ts` re-exports `.tsx` components), and `_shared/mod.ts`, `instance/instance.tsx`, `results_packages/detail.tsx`, the four `exports/export_report_*.ts` are import or re-export lines only; all accepted as in Reviews 3 to 6. `_shared/product_types.ts`, `fastr_block_labels.ts` and `fastr_theme_labels.ts` moved though the surface names none of them: step 6's log left the labels for step 7, and the `product_types.ts` override is sound, since the registry imports both editors' entries at runtime and `results_packages/detail.tsx` reaches it through `products/mod.ts`. The `lint_structure.ts` refinement is accepted: a helper only a shared file imports has no other legal home (a child folder would make `_shared/` import a child), so inheriting its importers' consumers to a fixpoint is what R4 intends; the test overlays `upload_helper.tsx` on the clean tree, where `upload.tsx` has three consuming areas, and asserts no hit, and a helper nothing imports still fails with zero. Commit shape: every changed line in the five move commits is a `git mv`, an import specifier or a glob path (checked by filtering the diffs); the five follow-ups add entries, switch deep imports to them and rewrite manifests and prose; `3eff4aad` is import lines and two dropped re-exports. Deliverable verified in the tree: the root of `components/` is the eight areas; `products/mod.ts` and `products.tsx`; `slide_deck/`, `report/`, `copilot/` (with `slide_ai/`) each with an entry; `products/_shared/` with `insert_figure/` and `version_history/`; `forms_editors/`, `figures/`, `layout_editor/` and `version_history/` gone. A harness over the import graph (names followed through each `_shared/mod.ts`, with the inherited-consumer rule) finds every child of `products/_shared/` and of `copilot/_shared/` with two or more consuming children: `folder_tree.ts` root plus report and slide_deck via `product_settings.tsx`; `scope_picker.tsx` root, report and slide_deck via the two modals; `_id_generation.ts` copilot and slide_deck; `rebase_edits.ts` and `report_style_editor.tsx` copilot and report; the seven report rendering files report plus slide_deck via `version_history/`, and `paginate_report.ts` and `report_figure_raster.ts` the copilot too; the copilot's eight the root plus `ai_tools` or `slide_ai`. No file under `slide_deck/`, `report/` or `copilot/` is imported from outside its folder except through an entry; `report_page_map.ts` has one importer (`report_editor.ts`), `DraftSlidePreview.tsx` and `add_slide_to_deck.ts` one each inside `tools/`, and `product_types.ts` and `sort_control.tsx` are imported by root files and `products/mod.ts` only. R11 holds: the copilot's component imports are `products/_shared/mod.ts`, `_shared/mod.ts` and one `import type` of `products/mod.ts` (`copilot.tsx:40`), which vanishes at runtime; both editors import `copilot/mod.ts`. The `entry-cycle` acceptance is sound: the one cycle runs through `slide_deck.tsx:39` importing `clerk` from `instance/mod.ts`, the singleton R12 moves in step 8, and breaking it here would need `state/` (outside the surface) or a deep import. The non-R100 rows are sound: relative specifiers change when `slide_ai/` and the copilot's `_shared/` move files between sub-folders, and every moved file is an `R` row in all six move commits. Every `[x](client/src/components/...)` link in the touched docs resolves (SYSTEM_13 36, SYSTEM_16 18, SYSTEM_12 14); no em-dash added; the one code comment added records the reason for the inheritance rule. Gates: G2 `products` entry-cycle 1, snake-case 24, all else 0; `_shared` shared-consumers 3 (the step 8 leftovers), snake-case 12, all else 0; G3 every moved file an `R` row in all six move commits, no `D`/`A` pair; G4 identical; G5 empty for every old path in the `client/src/components/<old>` form, the bare-name findings above excepted; `lint:systems` green at all twelve code commits; floor green at HEAD: `deno task typecheck`, `deno task test` (397 passed), `./validate_protocols`, `cd client && npm run build`. Noted, not findings: `copilot/ai_configs/` holds one file plus its entry (R9), pre-existing and dissolved by no step; `lib/h_users.ts` is git-ignored while `lib/mod.ts:37` exports it, so the client typecheck depends on an untracked local file, which predates this plan. |
| 2026-09-22 | 7 | Step 7 reviewed: 11 findings. |
| 2026-09-22 | 7 | Fix: findings 3 to 11 rewritten in place (`SYSTEM_05`, `SYSTEM_08`, `SYSTEM_10`, `SYSTEM_11`, `SYSTEM_12`, `SYSTEM_13`, `SYSTEM_16`, `PROTOCOL_APP_UI_CONVENTIONS.md`, `lib/ai_tools/content_validators.ts`): link text and bare names now say `slide_deck.tsx`, `slide_editor.tsx`, `report.tsx`, `copilot.tsx`, `products.tsx`, the moved `scope_picker`, `metric_card`, `build_context_menu`, `content_validators` and cursor paths; S11's prose no longer claims the two files S12 owns. Finding 1 stands as the record: `report_page_map.ts`'s rename rode `340d6b09` because `git mv` had staged it before that commit staged the lint files by name. |
| 2026-09-22 | 7 | Step 7 fixed. |
| 2026-09-22 | 7 | Finding: `lib/collab/slide_crdt.ts:94`, the comment names `slide_editor index.tsx`, which `54049045` renamed to `products/slide_deck/slide_editor/slide_editor.tsx`. Review 7's grep used `slide_editor/index` with a slash and missed it; the re-review's bare-name grep found it. Same rule as the `onboarding/catalogue.ts` finding of Review 3: a comment naming a moved file moves with it. Rewrite to `slide_editor.tsx`. The file is outside the step's surface; the Fix touches that line only. |
| 2026-09-22 | 7 | Reviewer's reading of Fix 7, no change needed. `9f7b6e32` touches the nine files findings 3 to 11 name plus the plan's two edits, with no em-dash added. Each line read: `SYSTEM_11:49-53` no longer claims `_editor_snapshot.ts` and `conflict_resolution_modal.tsx` and says S12 owns them under its slide deck glob, `:76` and `:78` name `slide_editor/slide_editor.tsx` and `report/report.tsx`; `SYSTEM_16:55` says "the per-surface cursor files", `:417`, `:473`, `:1240` link text matches the targets; `SYSTEM_12:243`, `:257`, `:276`, `:1346` link text matches the targets and `:934` says `report.tsx`; `SYSTEM_13:337` says `copilot.tsx`; `SYSTEM_10:279` and `:608` name `report/report.tsx` and `slide_editor/slide_editor.tsx`; `SYSTEM_08:373` and `:414` name `products/products.tsx` and `products/_shared/scope_picker.tsx`; `PROTOCOL_APP_UI_CONVENTIONS.md:132` names `products/products.tsx`; `SYSTEM_05:1234` names `products/_shared/insert_figure/metric_card.tsx`; `lib/ai_tools/content_validators.ts:14` names `products/copilot/_shared/content_validators.ts`. Every `[x](client/src/components/...)` link in the eight docs resolves; the bare-name grep over `*.md` (excluding `PLAN_*.md` and `panther/`) and `lib/**/*.ts` is empty apart from the finding above. Floor green at `9f7b6e32`: `deno task typecheck`, `deno task test` (397 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 7 | Step 7 reviewed: 1 finding. |
| 2026-09-22 | 7 | Fix: `lib/collab/slide_crdt.ts:94` names `slide_editor/slide_editor.tsx`. |
| 2026-09-22 | 7 | Step 7 fixed. |
| 2026-09-22 | 7 | Step 7 reviewed: pass. Re-review after the second Fix 7: `lib/collab/slide_crdt.ts:94` names `slide_editor/slide_editor.tsx`; `c86943cc` touches that line and the plan only, with no em-dash added; the bare-name grep for every old path over `*.md` (excluding `PLAN_*.md` and `panther/`) and `lib/**/*.ts` is empty. Floor green at HEAD: `deno task typecheck`, `deno task test` (397 passed), `./validate_protocols`, `cd client && npm run build`. |
| 2026-09-22 | 8 | Resolved surface, from `deno task lint:structure` at `3c603953` (`direction` 9, `entry-only` 3, `shared-scope` 8, `shared-consumers` 3, `entry-cycle` 1, all step 8's). Moves: `products/_shared/{report_html.ts,report_figure_raster.ts,report_markdown_style.ts}` and `exports/{_report_export_maps.ts,_media_placeholder.ts}` to the new `client/src/generate_report/` (with a `mod.ts`); `_shared/{presence_toasts.tsx,connection_banner.tsx}` to `state/instance/`; `_shared/fastr_logos.ts` to `generate_slide_deck/`; the `clerk` singleton out of `instance/logged_in_wrapper.tsx` into the new `state/_infra/clerk.ts`. Import lines: `exports/export_report_as_{html,pdf,word,attachment}.ts`, `generate_slide_deck/convert_slide_to_page_inputs.ts`, `state/instance/collab.ts`, `products/_shared/{mod.ts,ReportFigureEmbed.tsx,report_html_preview.tsx}`, `products/report/{report.tsx,figure_widget_extension.tsx,report_editor.tsx}`, `products/copilot/ai_tools/tools/report_page_map.ts`, `products/slide_deck/{slide_deck.tsx,logo_selector.tsx,style_editor/StylePreview.tsx}`, `instance/{mod.ts,instance.tsx,profile.tsx,change_email_modal.tsx,email_opt_in_modal.tsx,organisation_modal.tsx}`, `onboarding/{index.ts,storage.ts}`, `_shared/mod.ts`. Docs: `SYSTEM_01`, `SYSTEM_10`, `SYSTEM_12`, `SYSTEM_14`, `SYSTEM_16`, `SYSTEMS.md`. `validate_protocols_baseline.json` names none of the moved files. |
| 2026-09-22 | 8 | Choice the rulings did not cover: `_media_placeholder.ts` went to `generate_report/`, not `generate_slide_deck/`. R12 says what a generator imports from `exports/` comes down with it, and either generator folder is "down"; the file is report-shaped (its token swap is over report media tokens, and three report exporters read it against one slide generator reading the generic placeholder), so `convert_slide_to_page_inputs.ts` imports `~/generate_report/mod` for `unavailableItemMarkdown`. A file moves whole (step 8's "Not in this step"), so it was not split. |
| 2026-09-22 | 8 | Choice the rulings did not cover: `generate_report/**` is S10's (the twin of `generate_slide_deck/**`, which S10 owns, and two of its five files came from S10's `exports/`), with S12 the mandatory reader through a new `SYSTEMS.md §4.1` row, since S12's Reports section is the authoritative description of the pipeline. The folder has a `mod.ts` like `generate_visualization/` and every importer outside it uses that entry; `_report_export_maps.ts` and `_media_placeholder.ts` keep their names (R12: names are kept; R5 applies only inside `components/`). |
| 2026-09-22 | 8 | Choice the rulings did not cover: the Clerk singleton is the two lines `publishableKey` and `clerk` in the new `state/_infra/clerk.ts` (S1's manifest); the browser transport registration, the language resolution, the version flush and the wrapper stay in `instance/logged_in_wrapper.tsx`, which therefore still meets S1, S3 and S14, so the §4.1 row is kept with its seam rewritten to "server-action transport + version flush + shell". This is the one extraction that is not a `git mv`: R12 names the singleton, and the deliverable keeps the wrapper's custody row, so moving the file whole was not what the plan meant. |
| 2026-09-22 | 8 | R12's fourth bullet needed no commit: step 7 already exports `copilotViewController` from `products/copilot/mod.ts`, and `onboarding/index.ts:34` and `onboarding/catalogue.ts:5` import that entry. `onboarding/storage.ts` now imports `clerk` from `state/_infra/clerk.ts`, so `onboarding/` imports `instance/mod.ts` nowhere. |
| 2026-09-22 | 8 | Commit shape: one commit per R12 bullet as step 8's "Ends with" says (`d645d774`, `99421cdf`, `3abe0456`), not R8's move-plus-follow-up pair, because no folder moved whole; each commit is `git mv` plus import lines plus the manifests and prose R15 requires, and each is green. G3: every moved file is an `R` row (R099 for `report_figure_raster.ts`, whose one import line changed; R100 for the other eight); the `A` rows are `generate_report/mod.ts` and `state/_infra/clerk.ts`. |
| 2026-09-22 | 8 | Fact found: `resolveLogoUrl` in `fastr_logos.ts` has no importer; the `_shared/mod.ts` re-export was its only mention. Left in place, since the step changes no behaviour in moved code. For S10's Open items. |
| 2026-09-22 | 8 | G2 over the whole client: `direction` 0, `entry-only` 0, `shared-scope` 0, `shared-consumers` 0, `entry-cycle` 0, `root-file` 0, `index-entry` 0, `unimported` 0; `snake-case` 93, all step 9's. `generate_report/` imports `generate_visualization/`, `state/`, lib and panther only; `generate_slide_deck/` imports `generate_report/mod`, `generate_visualization/`, `state/` and its own files. G4: `./validate_protocols --update-baseline` leaves `validate_protocols_baseline.json` byte-identical (16 entries, none naming a moved file). G5: empty for all eight moved paths; a bare-name grep over `*.md` (excluding `PLAN_*.md` and `panther/`) and `lib/`, `server/`, `client/src/` comments finds only names that are still current. Floor green: typecheck, 397 tests, validate_protocols, client build. |
| 2026-09-22 | 8 | Step 8 built. |
| 2026-09-22 | 8 | Finding: `SYSTEM_10_figure_render_export.md:712`, the new section says `generate_report/` "imports `generate_visualization/`, `state/`, lib and panther". Nothing in the folder imports `state/`; `_report_export_maps.ts:4` imports `~/server_actions` (`_SERVER_HOST`) and `report_html.ts:14` imports `dompurify`. Row 706 above repeats the `state/` claim. Rewrite the sentence to name `generate_visualization/`, `server_actions/`, lib, panther and `dompurify`. |
| 2026-09-22 | 8 | Finding: `SYSTEM_10_figure_render_export.md:608`, `fastr_logos.ts` is described as read by "the transform and the deck's logo pickers"; its importers are `convert_slide_to_page_inputs.ts`, `slide_deck/logo_selector.tsx` and `slide_deck/style_editor/StylePreview.tsx`, and the last is the style preview (it checks `isFastrLogo`), not a logo picker. Name the two component files, or say "the logo selector and the style preview". |
| 2026-09-22 | 8 | Finding: `PLAN_COMPONENTS_TREE.md:699`, the resolved-surface row's import-line list omits three consumers the step changed, `products/_shared/version_history/{report_version_preview,version_history}.tsx` and `products/report/live_preview_extension.tsx`, and names `onboarding/index.ts`, which no commit touched (row 703 says why). Log accuracy only: every one of the 45 changed files is inside the step's Surface paragraph, so no Fix follows from this row. |
| 2026-09-22 | 8 | Reviewer's reading, no change needed. Surface: all 45 files in `git diff --stat 3c603953..HEAD` are inside the Surface paragraph (the moved files, `generate_report/`, `exports/`, `generate_slide_deck/`, `state/`, the import and re-export lines of consumers, the five SYSTEM files, `SYSTEMS.md`, the plan); `validate_protocols_baseline.json` is unchanged. Deliverable read in the code: `direction` 0 and `entry-only` 0 over the whole client (`snake-case` 93, step 9's); `generate_report/` and `generate_slide_deck/` import nothing from `exports/` or `components/`; `state/_infra/clerk.ts` is the two moved lines and `logged_in_wrapper.tsx` keeps the transport registration, the language resolution, the version flush and the wrapper, so the §4.1 row keeps S1 with S3/S14 readers and its seam matches the file; `generate_report/**` is S10's in the manifest, S12's manifest dropped only the three moved `_shared/` files, and `lint:systems` claims every file once; the two new §4.1 rows are 193 characters wide like their neighbours. Placements: `_media_placeholder.ts` in `generate_report/` and S10 owning `generate_report/**` with S12 the §4.1 reader both sit within R12 and §2 and are recorded in rows 700 and 701; `logo_selector.tsx` and `StylePreview.tsx` import `generate_slide_deck/fastr_logos` directly, which the lint allows (`entry-only` covers `components/` targets only) and which matches the existing deep import of `convert_slide_to_page_inputs`. G3: every moved file is an `R` row in its commit (R099 for `report_figure_raster.ts`, R100 for the other eight); the two `A` rows are the new `mod.ts` and `clerk.ts`. G4: `jq '[.[] \| {id,text}] \| sort'` identical at `3c603953` and HEAD, 16 entries. G5: empty for all eight moved paths; the bare-name grep over `*.md` (excluding `PLAN_*.md` and `panther/`) and `lib/`, `server/`, `client/src/` comments finds only current names. No em-dash added by the step's diff. Log counts re-run: the lint at `3c603953` reports `direction` 9, `entry-only` 3, `shared-scope` 8, `shared-consumers` 3, `entry-cycle` 1; `exports/` has 11 files and 1463 LOC; `resolveLogoUrl` has no importer; `onboarding/` imports `products/copilot/mod.ts` at `index.ts:34` and `catalogue.ts:5` and `instance/mod.ts` nowhere. Floor green at HEAD: `deno task typecheck`, `deno task test` (397 passed, 0 failed, 2 ignored), `./validate_protocols` (0 violations, 16 baselined), `cd client && npm run build`. |
| 2026-09-22 | 8 | Step 8 reviewed: 3 findings. |
| 2026-09-22 | 8 | Fix: `SYSTEM_10_figure_render_export.md` now says `generate_report/` imports `generate_visualization/`, `server_actions/` (`_SERVER_HOST`), lib, panther and `dompurify`, and names `slide_deck/logo_selector.tsx` and `slide_deck/style_editor/StylePreview.tsx` as the two component readers of `fastr_logos.ts`. The G2 row above that says `generate_report/` imports `state/` is wrong in the same way; this row is the correction. The resolved-surface row's import-line list should read `products/_shared/{mod.ts,ReportFigureEmbed.tsx,report_html_preview.tsx,version_history/report_version_preview.tsx,version_history/version_history.tsx}`, `products/report/{report.tsx,figure_widget_extension.tsx,report_editor.tsx,live_preview_extension.tsx}` and `onboarding/storage.ts` alone; no code changes. |
| 2026-09-22 | 8 | Step 8 fixed. |
