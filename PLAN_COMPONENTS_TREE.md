# PLAN: Components tree

Reorganise `client/src/components/` so the folder tree reads like the app:
one top-level folder per nav tab, pages nested under the page that opens
them, `_shared/` scoped to the nearest common ancestor, one `mod.ts` entry
per folder, and a lint that keeps it that way. The protocol that governs
the tree is rewritten first so every rule is mechanically checkable.

**Next step: Do 2.** Each session sets this line in its final commit.

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
