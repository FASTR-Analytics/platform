# PLAN: Base text size is 14px, declared once by panther

Status: ready. Makes 14px the size every unsized piece of UI text renders at,
declared once in panther's stylesheet from the existing type scale, and removes
the app's own 16px body rule.

**Next step:** Do 1

Branch: `version2` (app), `main` (panther). Repos: panther
(`/Users/timroberton/projects/panther/timroberton-panther`) and this app.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`, bound by
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md), with these differences:

- Instruction: "Do the next step of PLAN_BASE_TEXT_SIZE.md."
- Branch: `version2` in the app, not the `tim-branch` the app protocol names;
  it is the branch in use. `main` in panther.
- Floor, app: `deno task typecheck`, `deno task test`, `./validate_protocols`.
  Floor, panther: `deno task typecheck`, `deno task test`.
- Both trees must be clean before a step starts. At the time of writing, both
  hold another workstream's uncommitted icon edits
  (`icons_phosphor.tsx`, `icons_tabler.tsx`, and the app's
  `panther/.panther-manifest.json`). Step 1 waits until they are committed.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, §2 and §3 of this plan, the step's own
  section in §4, and §8.

## 1. The problem

No single place owns the size of unsized UI text.

- Panther's stylesheet sets no body font size, so a panther component whose
  text has no size class relies on whatever the consuming app sets.
- This app sets `body { @apply text-base; }`
  ([client/src/app.css:467](client/src/app.css#L467)), which is 16px.
- Panther's controls are 14px (`--ui-form-text-size: var(--text-sm)`,
  `_fixed.css:280`), so everything that inherits renders a step larger than
  the controls around it. Examples: default horizontal tabs
  (`tab_label.tsx:26`), alert and confirm text (`alert.tsx:310`), modal
  bodies and errors (`modal_container.tsx:104-115`), loading text
  (`loading_el.tsx:22`), CollapsibleSection titles, Products list names
  (`list_view.tsx:132,183`), Results list names
  (`results_packages.tsx:246`).
- The comment above `--ui-form-text-size` says form text "tracks body-text
  size changes automatically". It does not: it points at `--text-sm`
  directly, not at a body size.

## 2. The model

```
html        no font-size set: browser default, 1rem = 16px
--text-sm   0.875rem = 14px                     (Tailwind scale, unchanged)
--ui-text-body: var(--text-sm)                  (panther @theme)
body { font-size: var(--ui-text-body) }         (panther @layer base)
--ui-form-text-size: var(--ui-text-body)        (panther @theme)
```

Every element without its own size class inherits 14px from `body`. Form
controls read the same token, so body text and control text cannot drift.
The app declares no body size of its own.

## 3. Rulings

1. The html root keeps the browser default. Changing it would rescale every
   rem-based spacing, width and control height along with the text, and would
   override the user's browser font-size setting.
2. The Tailwind type scale is unchanged. `text-sm` stays 0.875rem and
   `text-base` stays 1rem. They are names of scale steps, not roles; the role
   is `--ui-text-body`.
3. Panther owns the body size: one token, `--ui-text-body: var(--text-sm)`,
   in `@theme` next to the text sizes, and one rule,
   `body { font-size: var(--ui-text-body); }`, in the existing `@layer base`
   block.
4. _(proposed)_ `--ui-form-text-size` becomes `var(--ui-text-body)`, so the
   comment's claim that form text tracks body text becomes true. It resolves
   to 14px either way, so nothing changes size.
5. The app's `body { @apply text-base; }` rule and its comment are deleted.
6. No component changes. Everything listed in §1 reaches 14px by inheritance,
   which is the intended mechanism.

## 4. Steps

### Step 1: panther declares the body size

**Surface.** In the panther repo: `modules/_303_components/_fixed.css`,
`protocols/PROTOCOL_UI_STYLING.md`.

**Deliverable.**

- `_fixed.css` `@theme`, after `--text-3xl`:

  ```css
    /* Every element renders at this size unless it names another. */
    --ui-text-body: var(--text-sm);
  ```

- `_fixed.css` line 280 (ruling 4), with its comment made accurate:

  ```css
    --ui-form-text-size: var(--ui-text-body);
  ```

- `_fixed.css`, in the `@layer base` block that starts at line 511:

  ```css
    body {
      font-size: var(--ui-text-body);
    }
  ```

- `PROTOCOL_UI_STYLING.md`: the "Body text" row of "Which token do I reach
  for" names `--ui-text-body` as the size body text inherits, and
  `--ui-text-body` is listed with the public vars as the one knob for body
  text size.

**Not in this step.** Syncing into the app. Any other change to the type
scale, line-heights or component sizes.

**Gates.** The panther floor.

**Ends with.** One panther commit.

### Step 2: the app drops its own body size

**Surface.** `client/src/app.css`, and the files `./sync wb-fastr-v2`
rewrites under `panther/`.

**Deliverable.**

- `client/src/app.css:463-469` deleted (ruling 5). Committed before syncing,
  so the sync diff stays isolated. With no body rule the app renders at the
  browser's 16px, the same as before, so this commit is green on its own.
- `./sync wb-fastr-v2` run from the panther repo, and the sync committed
  separately.

**Not in this step.** Any app component change, including the sizes the
review catalogue found inconsistent.

**Gates.** The app floor. `grep -rn "font-size\|text-base" client/src/app.css`
shows no body size rule.

**Ends with.** Two app commits: the deletion, then the sync.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| Panther `deno task typecheck` and `deno task test` | Step 1 |
| App floor | Step 2 |

## 6. Out of scope

Everything else from the text-size review: heading and title sizes, table
cell sizes, tab and button sizes, icon sizes in small controls, line-heights,
pixel and arbitrary sizes, `text-md`. Each is its own change.

## 7. Rollout and rollback

Step 1 changes panther for every consumer that syncs its UI modules. On their
next sync, unsized text in panterra, panrunner, marker and panther-test goes
from their current size (the browser's 16px where they set none) to 14px.
wb-fastr and who-abortion are locked in `sync-configs.json` and are
unaffected until unlocked.

Nothing ships before step 2's review passes. Rollback: revert the panther
commit and re-sync, then revert the app's deletion commit.

## 8. Build log

| Step | Row |
| --- | --- |
