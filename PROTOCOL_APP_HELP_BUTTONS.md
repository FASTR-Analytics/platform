# PROTOCOL — App: Adding a Help Button

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **adding a help button**.
> The machinery's ownership and architecture belong to **S14**
> ([SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md)); the site-side
> authoring rules live in the docs repo, `wb-fastr-site/DOC_HELP_BUTTONS.md` —
> read that before writing tags.

A **help button** is a small icon you can drop next to any piece of UI. On click
it opens a modal with a short summary of the relevant feature, plus a **"Read
more…"** button that opens the documentation site
(<https://fastr-analytics.org>, repo `../wb-fastr-site`) in a new tab,
deep-linked to the exact section in the user's language. Language coverage is
**EN/FR only**: the docs site has no Portuguese, so a `pt` user gets the English
summary and the English site.

The help **content lives in the docs site**, not in the app. The app only holds
a generated lookup table. So adding a button is a three-step, two-repo job.

## 1. Author the section in `wb-fastr-site`

Open the **English** page and its **French** counterpart, and under the relevant
heading add a help tag with a **globally-unique id**:

```md
<!-- src/content/docs/user-guide/visualizations.md -->

## Data tab

<!-- help#viz-data-tab -->

The Data tab is where you pick the indicator, period and disaggregation…
```

```md
<!-- src/content/docs/fr/user-guide/visualizations.md -->

## Onglet Données

<!-- help#viz-data-tab -->

L'onglet Données est l'endroit où vous choisissez l'indicateur…
```

- **Same id in both files.** That id is what stitches the English and French
  links together (the two languages' anchors differ — French headings slugify
  differently, accents kept: `#data-tab` vs `#onglet-données`).
- Ids are lowercase alphanumerics + hyphens (regex-enforced:
  `/^help#([a-z0-9][a-z0-9-]*)$/`). Prefix by feature area to keep them globally
  unique (`viz-data-tab`, not `data-tab`).
- The tag is an HTML comment — **invisible** on the rendered page.
- The **anchor is the heading directly above the tag** (any level `#`–`######`,
  slugified); the **summary is the prose below the tag** (first ~200 chars,
  markdown stripped). **Nothing ever goes inside the tag except the `#id`** —
  there is no summary override or any other configuration.
- The site repo has its own checker: `pnpm verify:help-tags` there.

## 2. Regenerate the lookup table

From the `wb-fastr` repo root:

```bash
deno task build:help-buttons
```

This runs `build_help_buttons.ts` (repo root), reads the sibling
`../wb-fastr-site` checkout (override with the `WB_FASTR_SITE_DIR` env var),
walks every EN/FR page pair, and writes `lib/help/help_targets.generated.ts`.
**Commit that file** alongside your change. Do not hand-edit it — it is
regenerated from the docs.

The build **errors** (and writes nothing) if:

- two sections anywhere share an id (ids must be globally unique);
- an id exists in one language but not the other;
- an English page has help tags but no French translation file at all;
- a help tag is not directly beneath a heading;
- a tag is malformed (anything other than `<!-- help#id -->`).

Trap: the walk reads **`.md` files only** — help tags in an `.mdx` page are
silently skipped.

## 3. Add the button in the app

```tsx
import { HelpButton } from "../HelpButton";

<HelpButton id="viz-data-tab" />;
```

`id` is typed as `HelpId` — a union of every id in the generated table — so you
get autocomplete, and a **compile error** if the section is renamed or removed
(a dangling button can't ship once the table is regenerated). That's it; the
modal, the summary, the language handling and the deep-link URL are all derived
from the generated table.

## How it fits together

```text
wb-fastr-site (.md tags)  ──build:help-buttons──▶  lib/help/help_targets.generated.ts
                                                            │
                                                   <HelpButton id="…" />
                                                            │
                                                   modal: title + summary (t3)
                                                            │
                                                   "Read more…" ▶ new tab to the docs section
```

- **Generated table** (`lib/help/help_targets.generated.ts`): one entry per id —
  page slug, EN+FR anchors, titles and summaries (`TranslatableString`s with no
  `pt`, so pt resolves to English). Source of truth for the app.
- **`lib/help/mod.ts`**: the `HelpId`/`HelpTarget` types and `getHelpUrl`
  (`https://fastr-analytics.org`, plus `/fr` when `getLanguage() === "fr"`, plus
  the page slug and the language's own `#anchor`).
- **`client/src/components/HelpButton.tsx`**: the icon button + the modal
  (opened via panther's `openComponent`). Fully self-contained — `id` is the
  only prop. No runtime fetch; the live docs site is only touched when the user
  clicks "Read more…".
