# PLAN: Review and rework the Population page UI

Status: OPEN, written 2026-09-06 after the implementation of
PLAN_POPULATION_VIEW_AND_IMPORT_GATE.md landed. Tim is not happy with the UI
that was built. This plan exists so that an agent can review that UI fresh
and independently, as a user of the app would see it, and then rework it.
Read the whole of this file before opening any component.

Scope of the review: the UI only. The server, lib and m012 changes are not
under review here (their gates are green; the one open verification step is
recorded in §5).

## 1. What landed

| Repo | Commit | Content |
| --- | --- | --- |
| wb-fastr (branch `tim-branch`) | `3d76affa` | Population store: one admin level, import preview gate, per-type grid. 23 files: lib types and the pure coverage rule, server DB and routes, structure-route notifies, prepare_inputs level rule, the whole client population page, indicator legend, Data card, SYSTEM_05, SYSTEM_08, PROTOCOL_APP_STATE. |
| wb-fastr-modules (branch `main`, not pushed) | `48bf97a` | m012: the person-years file's admin columns set the module's grain. Release order: push this before deploying the app. |
| wb-fastr-site | uncommitted | One sentence in `src/content/docs/admin-guide/indicators.md` and the `fr` twin ("at the instance's population level"), plus "annual figures" to "annual population counts" in the same paragraph. These files already had unrelated uncommitted edits before this work, so nothing was committed there. |

Client files the review covers, all under
`client/src/components/instance_population/`:

- `population_manager.tsx`: the page (heading bar, right panel, empty state).
- `_population_grid.tsx`: the per-type tabs and the grid.
- `_import_form.tsx`: select, check, import flow with the preview.
- `_population_types.tsx`: the type vocabulary editor (pre-existing, one
  string changed).

Also touched: `client/src/components/instance/instance_data.tsx` (the
Population card on the Data page) and
`client/src/components/indicator_manager_hmis/_edit_indicator_common.tsx`
(the coverage text in the formula legend).

## 2. Tim's concerns, in the order they were raised

Recorded as stated, so the reviewer works from Tim's words and not from the
implementer's reading of them.

1. "Delete figures" (the per-type delete button) is entirely the wrong
   wording.
2. So many tabs in a horizontal row is wrong; the type tabs should be
   vertical, on the left.
3. The search text input on the grid heading bar has no purpose.
4. "Figures" is the worst possible word here: in this app a figure is a
   visualization. He is amazed it was used.
5. "Gaps only" is a low-priority feature with a label that is super unclear.
6. The panther `Table` component should not have been used for something
   that is so obviously a data grid.
7. The left-frame tabs overflow their container.
8. "Edit types" is meaningless as a button label.
9. The data grid should show all population levels as columns: with the
   level at AA3, the table shows AA1, AA2, AA3, then one column per year.
10. It should look exactly like the other data viewing pages in the app,
    which the implementer clearly failed to consider.
11. Collapsing the area labels with ">" (the `path` field, "Region >
    District") is wrong.
12. The data grid rework is NOT trivial and belongs in this plan, not in a
    quick fix.
13. Process: the implementer kept working without speaking to Tim, stopped
    late when told to stop, and reported the dev-generation blocker as if it
    were a wall rather than saying in one sentence what the trivial fix was.

## 3. The implementer's mistakes

1. Carried the word "figures" forward from the existing page and the plan
   without checking it against the app's vocabulary, where `FigureHolder`,
   `FigureInputs` and the rest make "figure" mean a visualization.
2. Built the grid on the generic `Table` with a single collapsed `path`
   column, instead of looking at how the app's other data viewing pages
   present admin areas (one column per level) and building the same.
3. Added a search box and a "Gaps only" toggle that were in the plan's R8
   but were never needed, and a 500-row display cap to pair with them.
4. Put the type tabs in a horizontal strip.
5. Labelled buttons by mechanism ("Edit types", "Delete figures") rather
   than by what they do to what.
6. Did not report progress while working, and did not give Tim the one-line
   cause and fix of the dev-generation blocker (§5) before he had to ask.

## 4. Already fixed as trivial (state at commit `3d76affa`)

- Every user-facing "figure(s)" is gone from the population UI, the Data
  card, the server messages and the docs: "population data" for the
  collective, "values" for stored numbers, "population counts" where the
  quantity itself is meant. Two identifiers renamed to match:
  `deletePopulationTypeData` (route, DB function, client) and
  `areasWithData` (`PopulationYearCoverage`).
- The type tabs are vertical in a `FrameLeft`, wrapped like the project page
  (`<div class="h-full">`), with the id badge removed. Whether they still
  overflow has NOT been checked in a browser.
- The search box, the "Gaps only" toggle and the 500-row cap are removed.
- The right panel is three buttons with no sub-headings: "Import CSV",
  "Delete all population data", "Manage population types".
- The per-type delete button reads `Delete all “<type label>” data`.

## 5. Open items that are not UI

1. **Plan step 8.4 (end-to-end level-2 generation on dev) has not run.**
   Cause: the dev dictionary refuses every HMIS capture, because `anc1`
   (`asdf / measles1`), `wer` and `aaaa` depend on `measles1`, which has no
   raw indicators mapped to it. The 3 September run got past this step, so
   the dictionary changed after that date. This is dev data, not the
   implementation. Fix: map any raw indicator to `measles1`, or point
   `anc1`'s formula elsewhere. A disposable alternative that touches no
   existing row: create a throwaway raw indicator mapped to `measles1`, run,
   then delete it. The harness is ready at
   `<scratchpad>/e2e_level2.ts` (see the session's scratchpad directory); it
   swaps the store to level 2, creates `zz_test_rate`, generates
   m001/m002/m012 with local R, checks the package (header, manifest stamp,
   no `admin_area_3` on M12, `SUM(ing1)/SUM(ing2)` by hand) and restores the
   level-3 store. Everything upstream and downstream of that step passed:
   the pure coverage harness, the dev DB preview harness, and the R script
   on four grain fixtures.
2. The site repo edits are uncommitted (see §1).
3. `./validate_protocols` reports one new tier-2 flag in
   `useAIDocuments.ts` and two stale baseline entries; both belong to
   PLAN_PROTOCOL_CONFORMANCE.md, not to this work.

## 6. What the review must decide and build

The reviewer reads the pages as a user first, then the code.

1. **Compare with the app's other data viewing pages** before proposing
   anything: `client/src/components/instance_dataset_hmis/`,
   `instance_dataset_hfa/dataset_items_holder.tsx`,
   `instance_dataset_iceh/dataset_items_holder.tsx`, and the structure
   pages under `components/structure/`. Record how they lay out admin
   areas, which component renders the grid (`TableFromCsv` over a `Csv`, or
   otherwise), how they handle row limits, and how their heading bars and
   side panels are arranged. The Population page must look like them.
2. **The grid.** One column per admin level from AA1 to the population
   level, labelled with the instance's admin-area labels
   (`getAdminAreaLabel`), then one column per year; no collapsed path
   string anywhere. This changes the wire shape: `PopulationGridArea.path`
   (and `populationDisplayPath` in `lib/population_coverage.ts`) should
   give way to the separate name columns; the server already has them
   (`areaNames` in `server/db/instance/population.ts`). The " > " joins in
   the import problem messages and in the generation coverage error predate
   this work and should be reconsidered in the same pass.
3. **Stale rows** (areas no longer in the structure): how the reference
   pages mark such rows, if at all, and follow that.
4. **Missing cells**: currently a red middle dot. Check the reference pages
   for how an absent value is shown.
5. **The type tabs.** Confirm vertical-left is what Tim wants, that they do
   not overflow, and whether the vocabulary editor belongs behind a button
   at all or inside the same left rail.
6. **The import flow.** Three steps (select, check, import) with a preview
   table per type. Review the wording and whether the preview belongs in the
   editor modal or on the page.
7. **The empty state and the Data card** texts.
8. Every string in `{ en, fr, pt }`; no em-dashes; sentence case.
9. When the rework is built: `deno task typecheck`, `./validate_protocols`,
   and the SYSTEM_05 "Population store" Reads paragraph updated to describe
   the final grid. Then delete this file and
   PLAN_POPULATION_VIEW_AND_IMPORT_GATE.md in the same commit, once §5.1
   has run green.
