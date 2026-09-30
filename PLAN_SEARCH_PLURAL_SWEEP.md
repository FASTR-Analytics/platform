# PLAN_SEARCH_PLURAL_SWEEP: adopt panther's search fold and plural picker across the app

> **Status (2026-09-30):** High-level, decided in outline with Tim. The site
> lists in §1 and §4 were grepped on 2026-09-30 and go stale; every Do session
> re-greps before starting. Panther's helpers are already in `panther/` (sync
> cca07af0a).

Panther now has `foldString`, `searchTokens` and `matchesSearch` (case- and
accent-insensitive matching where every whitespace token must appear) and
`plural` / `PluralForms` (the singular or plural form for the current language
by CLDR rule, so French 0 is singular and Portuguese and English 0 are plural).
This plan replaces every hand-rolled `toLowerCase().includes` search and every
user-facing `n === 1 ?` plural branch with them. Behaviour changes only where
the old code was wrong: an accented query or label that did not match, a word
order that did not match, and a French zero-count string. Delete this file when
the last review passes.

**Next step: Do 1**

Branch: `version2`. Repos: this repo only. Read first: `CLAUDE.md`,
`PROTOCOL_APP_PLANS.md`, then §2 and §3 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_SEARCH_PLURAL_SWEEP.md."
- Branch: `version2`. Confirm with `git branch --show-current`. The tree is
  shared; confirm `git status` is clean and stage only this step's files.
- Floor, green at the end of every step: `deno task typecheck`,
  `deno task test`, `./validate_protocols`, `./run`.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 here, its own section in §4, and §8.
- Panther is never edited here. If a helper is missing or wrong, stop and say
  so; the fix is in the panther repo and arrives by `./sync`.
- `PLAN_TABLE_TOOLBAR.md` in the panther repo will edit four files here in its
  step 5 (`data/hmis/indicators/manager.tsx`, `data/hfa/indicators/manager.tsx`,
  `data/hfa/dataset/dataset_items_holder.tsx`,
  `data/hmis/imports/wizard/indicator_picker.tsx`). A step of this plan touches
  none of them while that plan file exists. Step 3 checks for it first.

## 1. The problem

Every path below is under `client/src/components/` unless it starts with
`server/` or `lib/`.

**Hand-rolled search.** All lowercase the query and call `includes`, so
"hopital" misses "Hôpital" and a two-word query must appear as one phrase.

- `data/hmis/_shared/indicator_display.ts:81` `matchesIndicatorSearch`: already
  splits on whitespace and requires every word; case-folded only. Called from
  `data/hmis/indicators/manager.tsx:357` and
  `data/hmis/imports/wizard/indicator_picker.tsx:130`.
- `products/copilot/ai_prompt_library/prompt_library_modal.tsx:58-94`: three
  near-identical filters over title, content and category.
- `products/_shared/folder_tree.ts:156` with its caller
  `products/products.tsx:167`, which lowercases the needle before passing it.
  The module's comment says it stays type-import-only.
- `explore/data_table/data_table.tsx:206-213`: the "Find column" field.
- `_shared/figure_editor/editor_panel_style/custom_value_order_section.tsx:314`.
- `data/hfa/indicators/indicator_code_editor.tsx:479` `searchMatches`.
- `data/hfa/indicators/ai/tools.ts:371`: the AI tool's variable search. The
  model types the query, but the same accent gap applies.
- `server/server_only_funcs_presentation_objects/possible_values_core.ts:41`
  `normalizeForOptionOrder`: byte-for-byte the same function as `foldString`.
  Its comment records why the sort is hand-rolled rather than ICU; that reason
  still holds with `foldString`, which is Unicode normalisation, not collation.

**Hand-rolled plurals in user-facing text.** Each is a `=== 1` ternary between
two `t3` calls. All pick the plural for 0, which is wrong in French. The sites
where `n` can be 0 are marked.

- `instance/whats_new_modal.tsx:478` page / pages (0 possible).
- `products/_shared/insert_figure/metric_card.tsx:77` preset / presets (0
  possible).
- `products/report/toolbar.tsx:614` "1 step" / "N steps" (0 possible).
- `users/bulk_edit_permissions_form.tsx:56` `user${n === 1 ? "" : "s"}` inside
  three template strings.
- `users/users.tsx:381` "this user" / "these users".
- `results_packages/results_packages.tsx:120`, `assets/assets.tsx:221`,
  `data/hmis/indicators/delete_confirm.ts:7`,
  `data/hfa/indicators/manager.tsx:566`: "delete this X?" / "delete these N X?".
- `data/hmis/imports/wizard/indicator_picker.tsx:99` "1 selected indicator" / "N
  selected indicators" (0 possible).
- `data/hmis/imports/wizard/step_1_indicators.tsx:18,32`,
  `data/hmis/imports/wizard/step_4_review.tsx:84,98`: whole-sentence variants.
- `data/hmis/imports/wizard/step_2_time.tsx:75` "Every week" / "Every N weeks".
- `data/hmis/indicators/edit_indicator_form.tsx:365`,
  `data/hmis/indicators/computability.ts:27`,
  `data/hmis/indicators/manager.tsx:663`: whole-sentence variants.

**Not a problem.** English text addressed to the model or produced for it
(`products/copilot/ai_tools/validators/*.ts`, `lib/fastr_report_page_map.ts`,
`lib/hmis_indicator_catalog.ts`, `lib/indicator_expression/parse.ts`,
`lib/ai_tools/format_metric_data_for_ai.ts`,
`client/src/generate_visualization/validate_figure_config_edit.ts`) is English
whatever the UI language, and `plural()` follows the UI language.
`lib/indicator_id.ts:15` folds with NFKD to build an id that a PL/pgSQL rule
must reproduce, pinned by `server/tests/indicator_id_test.ts`. Both stay as they
are.

## 2. The model

**A search** is `searchTokens(query)` computed once, and
`matchesSearch(
foldString(text), tokens)` per candidate. Where a list is
filtered on every keystroke and the candidates do not change with the query, the
folded text is computed once per change of the candidates, not per keystroke.
Zero tokens match everything, which is what every site does today for an empty
query.

**A plural** is `plural(n, { one: t3(...), other: t3(...) })`. The two forms may
be nouns ("page" / "pages") or whole sentences; `PluralForms<string>` does not
care. The `n === 1` test disappears.

**In scope** is text a user reads in the UI language. **Out of scope** is text
the model reads or writes, which is English.

## 3. Rulings

1. Client files import the helpers from `"panther"`; `server/` and `lib/` files
   from `"@timroberton/panther"`. All five are `_000_utils` exports present in
   both entry files, so `lib/` may use them.
2. `matchesIndicatorSearch` keeps its signature and callers; its body becomes
   `matchesSearch(foldString(haystack.join(" ")), searchTokens(query))`.
3. `folder_tree.ts` stays type-import-only. `buildProductTree` takes
   `matches: (label: string) => boolean` in place of `needle: string | null`,
   alongside the `sort` it already takes for the same reason; `products.tsx`
   builds it from `searchTokens(searchText())` and the existing
   `_SEARCH_MIN_LENGTH` gate.
4. `prompt_library_modal.tsx` folds its three filters into one predicate over
   `[title, content, category]`.
5. `possible_values_core.ts` deletes `normalizeForOptionOrder` and calls
   `foldString`. The comment above it stays, reworded only where it names the
   deleted function. `server/tests/` cases that pin the option order run
   unchanged; the order is byte-identical.
6. Every plural site becomes `plural(n, { one, other })`. A site whose two
   branches differ by more than number (a different verb, a different object)
   still fits: the whole sentence is the form.
7. A `t3` template that interpolated `${n === 1 ? "" : "s"}` inside each
   language string (`bulk_edit_permissions_form.tsx:56`) becomes two complete
   `t3` calls under `plural`, since the Portuguese suffix was already different
   ("es").
8. No message text changes beyond the plural form. A Do session that finds a
   translation wrong records it in §8 and leaves it.
9. SYSTEM prose changes only where a SYSTEM file describes the matching or the
   pluralisation; the Do session greps `toLowerCase` and `=== 1` in
   `SYSTEM_*.md` and records the result in §8 either way.

## 4. Steps

### Step 1: client search

**Surface.** The seven client search sites in §1 (`indicator_display.ts`,
`prompt_library_modal.tsx`, `folder_tree.ts` and `products.tsx`,
`data_table.tsx`, `custom_value_order_section.tsx`, `indicator_code_editor.tsx`,
`ai/tools.ts`). Re-grep `toLowerCase().includes` under `client/src` first and
add any new site to the build log before touching it.

**Deliverable.** Rulings 1 to 4 and 9.
`grep -rn "toLowerCase().includes"
client/src` finds only the four files
reserved for `PLAN_TABLE_TOOLBAR`.

**Not in this step.** The server fold, any plural, the four reserved files.

**Gates.** The floor.

**Ends with.** One commit per site or site pair, each green.

### Step 2: the server fold

**Surface.**
`server/server_only_funcs_presentation_objects/possible_values_core.ts`. Read
`SYSTEM_09_viz_query_cache.md` and `SYSTEM_10_figure_render_export.md` first;
both claim the directory.

**Deliverable.** Ruling 5. `grep -n normalize server/` finds no NFD fold outside
panther.

**Not in this step.** `lib/indicator_id.ts` (out of scope, §1).

**Gates.** The floor. If the SYSTEM file names a query-rig or option-order
harness for this directory, run it and record the output in §8.

**Ends with.** One commit.

### Step 3: plurals

**Surface.** The plural sites in §1 except those in the four files reserved for
`PLAN_TABLE_TOOLBAR`. Before starting, check whether
`/Users/timroberton/projects/panther/timroberton-panther/PLAN_TABLE_TOOLBAR.md`
still exists. If it is gone, the reserved files' sites
(`indicator_picker.tsx:99`, `data/hmis/indicators/manager.tsx:663`,
`data/hfa/indicators/manager.tsx:566`) join this step's surface; if not, they
are recorded in §8 as left for a later sweep and the plan still closes.

**Deliverable.** Rulings 6 to 9. `grep -rn "=== 1$\|=== 1 ?" client/src` finds
no `t3` plural branch outside the reserved files.

**Not in this step.** Model-facing English text (§1, "Not a problem").

**Gates.** The floor.

**Ends with.** One commit per screen area (users, products, HMIS wizard, HMIS
indicators, results packages and assets, instance), each green.

## 5. Gates catalogue

Nothing beyond the floor. Step 2 runs whatever harness its SYSTEM file names.

## 6. Out of scope

- The four files `PLAN_TABLE_TOOLBAR` step 5 rewrites, and the Table's own
  `selectionLabel` to `itemLabel` change that comes with it.
- Model-facing English text and `lib/indicator_id.ts` (§1).
- Adding search to screens that have none. That is `Table`'s new toolbar, per
  the panther plan, screen by screen.
- `SelectSearch`, `MultiSelectSearch` and `SelectV2`: already folded in panther
  and present since sync cca07af0a.

## 7. Rollout and rollback

Nothing ships from this plan; `./deploy_testing` is Tim's call after the last
review. Each commit is a single site or screen area and reverts alone.

## 8. Build log

| Date | Step | Row |
| ---- | ---- | --- |
