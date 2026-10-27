# PLAN_5: the protocol gate parses the client instead of grepping it

`./validate_protocols` is eight line regexes over `client/src`. Its tier-1
contract is "a hit IS a violation and fails the run", and it currently passes
with eleven tier-1 violations in the tree, because a line regex cannot tell a
props destructure from any other destructure, and cannot see a declaration that
is indented. Its tier-2 baseline holds nine entries of which eight are false
positives, kept only because a name-based check cannot tell a dirty flag from an
in-flight flag. This plan replaces the regex table with one TypeScript AST walk,
makes every mechanical check exact, and fixes what the exact gate then reports.

**Next step: Do 2.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. Last step: 4. The review that passes step 4
deletes this file.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_15_admin_ops.md](SYSTEM_15_admin_ops.md) (the root-script inventory),
[panther/protocols/PROTOCOL_UI_SOLIDJS.md](panther/protocols/PROTOCOL_UI_SOLIDJS.md),
[panther/protocols/PROTOCOL_UI_STATE.md](panther/protocols/PROTOCOL_UI_STATE.md),
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md), `validate_protocols.ts`.

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_5_PROTOCOL_GATE_EXACT.md." Floor as the protocol lists it; no migration,
query engine or help text is touched. Build log: §8.

Vocabulary: a **check** is one rule the gate proves. **Tier 1** means a hit is a
violation and fails the run; **tier 2** means a hit needs a human ruling and is
reported but never fails the run. The **baseline** is the file of ruled tier-2
exceptions.

## 1. The problem

Every check is `regex.test(oneLine)`. Four consequences, each verified against
the tree on 2026-10-27:

- **`destructured-props` (tier 1) misses six violations.** Its regex is
  `/function [A-Z][A-Za-z]*\(\s*\{/`, so it only sees destructuring in the
  parameter list. `const { state } = p;` in the component body is invisible:
  `data/geojson/upload_wizard/step_0.tsx:11`, `step_1_dhis2.tsx:13`,
  `step_1_file.tsx:12`, `step_2.tsx:20`, `step_3.tsx:16`, `step_4.tsx:21`.
- **`arrow-component` (tier 1) misses five violations.** Its regex anchors with
  `^(?:export )?const`, so an indented one is invisible:
  `products/report/report.tsx:407` (`FigureView`), `:1517` (`ReaderFileMenu`),
  `:1599` (`MainArea`), `instance/change_email_modal.tsx:274` (`InstanceList`),
  `_shared/figure_editor/editor_panel_text.tsx:42` (`CaptionField`).
- **`jsx-map` (tier 2) misses nine hits to the line break `deno fmt` writes**,
  the same flaw that was fixed in `jsx-and-and` and not in its sibling:
  `scopes/scope_editor.tsx:174`,
  `data/hfa/indicators/variant_groups_manager.tsx:195,384`,
  `categories_manager.tsx:177,356`, `service_categories_manager.tsx:117`,
  `data/hmis/imports/csv_wizard.tsx:413,453`,
  `data/geojson/upload_wizard/step_2.tsx:338`.
- **`raw-loading-signal` (tier 2) is a name list, so it both over- and
  under-matches.** Over: eight of the baseline's nine entries are not async
  state at all (seven `needsSaving` dirty flags and one Web Locks `ownerBusy`),
  kept as permanent exceptions only because no name pattern separates
  `needsSaving` from `adminAreasLoading`. Under: its error half is the prefix
  list `fetch|load|save|mint`, so ten genuine raw error and in-flight signals
  pass: `products/slide_deck/share_slide_deck.tsx:34`,
  `products/slide_deck/download_slide_deck.tsx:21`,
  `products/report/share_report.tsx:38`, `instance/feedback_form.tsx:26,28`,
  `data/hmis/imports/csv_wizard.tsx:98,106`,
  `data/hfa/imports/wizard.tsx:163,167`, `data/iceh/imports/wizard.tsx:28`.

None of the eleven tier-1 violations is biting today: the geojson wizard's
`p.state` never changes identity, and the five nested components are each
instantiated once. That is why they survived, and it is the argument for the
rewrite rather than against it: the gate says PASS over code its own contract
calls a violation, so the next one will not be caught either.

## 2. The model

One `ts.createSourceFile` per file, one walk, and each check is a predicate over
nodes rather than over text. A check that a parse makes exact becomes tier 1. A
check that still needs judgement stays tier 2, and its hits are either rewritten
or ruled, never accumulated: the baseline ends holding only exceptions a human
ruled, and a false positive is a bug in the check, not a baseline row.

## 3. Rulings

1. **The gate parses.** `validate_protocols.ts` imports `typescript` (added to
   `deno.json`'s imports as `npm:typescript@^5`, a new root-script dependency)
   and walks each file's AST once, dispatching every check from that one walk.
   The `./validate_protocols` wrapper, its arguments, its baseline file, its
   output format and its wiring into `deno task typecheck` and `./deploy` do not
   change.
2. **Exact checks are tier 1.** After the rewrite, `suspense-mechanism`,
   `destructured-props`, `arrow-component`, `props-not-p`, `jsx-and-and` and
   `jsx-map` are all tier 1: each is a syntactic fact the AST settles.
   `guard-before-deps` and `raw-loading-signal` stay tier 2.
3. **`destructured-props`** flags any binding pattern whose initialiser is the
   props parameter, and any destructured parameter of a function whose body
   returns JSX. It no longer cares where the destructure sits.
4. **`arrow-component`** flags any variable declaration, at any nesting depth,
   whose name is capitalised and whose initialiser is an arrow or function
   expression returning JSX. Vendored files stay exempt by path.
5. **`jsx-and-and` and `jsx-map`** flag a binary `&&` whose right operand is a
   JSX element, and a `.map` call whose callback returns a JSX element. Line
   breaks become irrelevant, so both the single-line and the `deno fmt` form are
   caught, and a `<` that is a comparison operator can no longer match.
6. **`raw-loading-signal` is judged by data flow, not by name.** A hit is a
   `createSignal` in a component whose setter is called with a server response's
   error field, or whose setter is called with `true` and then `false` on either
   side of an `await` in the same function. That is exactly what separates
   `adminAreasLoading` from `needsSaving`, so all eight false positives retire
   and the check keeps the ten genuine misses. It stays tier 2 because a
   client-side parse result read as an error needs a human to rule it.
7. **`guard-before-deps` stays tier 2 and keeps its meaning**, but reads the
   effect's body from the AST: a hit is a `createEffect` whose first statement
   is an `if`, with a reactive read inside the conditional's consequent or after
   it. Hand-rolled text matching on `createEffect(` goes.
8. **A false positive is a check bug.** A tier-2 hit that is not a violation is
   fixed in the check where the AST can express the difference, and baselined
   only where it cannot. The baseline's purpose is a ruled exception, never
   debt.
9. **The eleven tier-1 violations already found are fixed first**, in step 1,
   because they are real breaches whose locations are known and they need no
   gate to find them. Step 2's first run re-proves the set: any the hand search
   missed is step 3's.
10. **The six geojson wizard destructures** become direct `p.state` reads at
    every use site. Not `const state = p.state`, which reads the prop once just
    as the destructure does.
11. **The five arrow components** become `function` declarations in the same
    scope, keeping their current position and name.

## 4. Steps

### Step 1: the eleven tier-1 violations already found

**Surface.** `data/geojson/upload_wizard/step_0.tsx`, `step_1_dhis2.tsx`,
`step_1_file.tsx`, `step_2.tsx`, `step_3.tsx`, `step_4.tsx`,
`products/report/report.tsx`, `instance/change_email_modal.tsx`,
`_shared/figure_editor/editor_panel_text.tsx`.

**Deliverable.** Rulings 10 and 11. No `const { ... } = p` and no capitalised
arrow or function expression assigned to a variable in any of the nine files.

**Not in this step.** The validator, and any violation not listed in §1.

**Gates.** The floor.

**Ends with.** Two commits, one per ruling, each green.

### Step 2: the AST rewrite

**Surface.** `validate_protocols.ts`, `deno.json`,
`validate_protocols_baseline.json`, `SYSTEM_15_admin_ops.md`.

**Deliverable.** Rulings 1 to 8. The wrapper and the output format are
unchanged, the tier assignments are ruling 2's, and the run prints the full hit
list. The baseline is regenerated once at the end of the step so the step is
green, and every entry in it is a hit step 3 or step 4 will clear or rule.
`SYSTEM_15`'s root-script prose says the gate parses.

**Not in this step.** Fixing anything the new gate reports.

**Gates.** The floor. Plus a committed harness, `validate_protocols_test.ts`,
with one passing and one failing fixture per check, run by `deno task test`: the
rewrite is a gate change, so the gate needs its own proof.

**Ends with.** One commit, green.

### Step 3: every tier-1 hit the exact gate reports

**Surface.** Whatever files step 2's run names, listed in §8 by the step-2
session before this step starts.

**Deliverable.** Zero tier-1 hits, with no hit suppressed: tier 1 has no
baseline.

**Not in this step.** Tier-2 hits.

**Gates.** The floor.

**Ends with.** One commit per file group, each green.

### Step 4: every tier-2 hit, ruled

**Surface.** Whatever files remain in the baseline after step 2, listed in §8.
Includes §1's ten raw error and in-flight signals and its nine `jsx-map` sites.

**Deliverable.** Each hit either rewritten to the protocol's own primitive or
ruled a permanent exception with its reason in the code. The baseline ends
holding only ruled exceptions.

**Not in this step.** report-forge (§6).

**Gates.** The floor.

**Ends with.** One commit per group, each green; the last deletes this file.

## 5. Gates catalogue

| Gate                         | First reached |
| ---------------------------- | ------------- |
| `deno task typecheck`        | step 1        |
| `deno task test`             | step 1        |
| `./validate_protocols`       | every commit  |
| `./run`                      | step 1        |
| `validate_protocols_test.ts` | step 2        |

## 6. Out of scope

- **`report-forge/ui`**: outside the validator's root. A second root is its own
  plan.
- **`data/hmis/imports/csv_wizard.tsx:340`** refetches `p.runsQuery` after
  launching an import while the HMIS routes do notify and the shell already
  refreshes off `hmisImportRunActive`, so it duplicates work and races SSE. A
  breach of PROTOCOL_APP_STATE's T2 override, which no gate check covers.
- **`routes/access_tokens.tsx`** revokes with native `confirm()` and reports
  with native `alert()` instead of `createDeleteAction`. Also uncovered by any
  check.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. No data change, no API change.
Rollback is `git revert` of the plan's commits; reverting step 2 alone restores
the regex gate.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-27 | 0    | Written after PLAN_5_PROTOCOL_CONFORMANCE closed. That plan fixed `jsx-and-and`'s line-break blindness and widened `raw-loading-signal` by name; the review that passed it showed the approach itself was the limit.                                                                                                                                                                           |
| 2026-10-27 | 1    | Ruling 10 cost two sites the mechanical rewrite missed and the typecheck caught: `...state.adminAreaOptions()` in `step_3.tsx` (the spread's dot) and `{state\n.dhis2ConnectionUrl()}` in `step_4.tsx` (the line break `deno fmt` wrote). Both now read `p.state`.                                                                                                                             |
| 2026-10-27 | 1    | Step 1 built. Both rulings are read-form changes only, proven rather than assumed: the geojson diff touches nothing but `state.` to `p.state.`, and `p.state` is a once-built object literal in the wizard body, so reading it per use is identical to reading it once; and each of the five converted components' JSX body is byte-identical to its arrow form once whitespace is normalised. |
| 2026-10-27 | 1    | The row above overstates the geojson diff: besides the read sites, `deno fmt` rewrapped the `mappedCount` memo in `step_3.tsx` and `step_4.tsx`. No other non-read-site hunk.                                                                                                                                                                                                                  |
| 2026-10-27 | 1    | Step 1 reviewed: pass, no findings. `p.state` confirmed to be one object literal built once in the wizard body and passed to every step, its members plain closures, so no bare-reference pass loses a binding; each of the five converted components is referenced only after its declaration, so hoisting is unobservable and nothing it closes over can be read before initialisation.      |
