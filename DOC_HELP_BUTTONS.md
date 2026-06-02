# DOC_HELP_BUTTONS.md — Adding help buttons to the app

A **help button** is a small blue icon you can drop next to any piece of UI. On
click it opens a modal with a short summary of the relevant feature, plus a
**"Read more…"** button that opens the documentation site
([wb-fastr-site](../wb-fastr-site), <https://fastr-analytics.org>) in a new tab,
deep-linked to the exact section — in the user's current language (EN/FR).

The help **content lives in the docs site**, not in the app. The app only holds
a generated lookup table. So adding a button is a three-step, two-repo job.

---

## If you want to add a help button, do this

### 1. Author the section in `wb-fastr-site`

Decide which docs section the button should point at. Open the **English** page
and its **French** counterpart, and under the relevant heading add a help tag
with a **globally-unique id**:

```md
<!-- src/content/docs/user-guide/visualizations.md -->
## Data tab
<!-- help#data-tab -->
The Data tab is where you pick the indicator, period and disaggregation…
```

```md
<!-- src/content/docs/fr/user-guide/visualizations.md -->
## Onglet Données
<!-- help#data-tab -->
L'onglet Données est l'endroit où vous choisissez l'indicateur…
```

- **Same id in both files.** That id is what stitches the English and French
  links together. The build fails if one language is missing it.
- The tag is an HTML comment — **invisible** on the rendered page.
- The **anchor is the heading directly above the tag** (slugified), not the tag
  itself; the **summary is the prose below the tag** (first ~200 chars). The tag
  carries only the `#id` — nothing goes inside it. Any heading level works
  (`#`–`######`); the tag binds to the nearest heading above it.

Full authoring rules — id naming, the summary override, the EN/FR requirement —
are in **[wb-fastr-site/DOC_HELP_BUTTONS.md](../wb-fastr-site/DOC_HELP_BUTTONS.md)**.
Read that before writing tags.

### 2. Regenerate the lookup table

From the `wb-fastr` repo root:

```bash
deno task build:help-buttons
```

This reads the sibling `../wb-fastr-site` checkout (override with the
`WB_FASTR_SITE_DIR` env var), walks every EN/FR page pair, and writes:

```text
lib/help/help_targets.generated.ts
```

**Commit that file** alongside your change. Do not hand-edit it — it is
regenerated from the docs and your edits will be overwritten.

The build **errors** (and writes nothing) if:

- two sections anywhere share an id (ids must be globally unique);
- an id exists in one language but not the other;
- a help tag is not directly beneath a heading.

### 3. Add the button in the app

```tsx
import { HelpButton } from "~/components/HelpButton";

<HelpButton id="data-tab" />
```

`id` is typed as `HelpId` — a union of every id in the generated table — so you
get autocomplete, and a **compile error** if the section is renamed or removed.
That's it; the modal, the summary, the language handling and the deep-link URL
are all derived from the generated table.

---

## How it fits together

```text
wb-fastr-site (.md tags)  ──build:help-buttons──▶  lib/help/help_targets.generated.ts
                                                            │
                                                   <HelpButton id="…" />
                                                            │
                                                   modal: title + summary
                                                            │
                                                   "Read more…" ▶ new tab to the docs section
```

- **Generated table** (`lib/help/help_targets.generated.ts`): one entry per id,
  holding the page slug, the EN+FR anchors, titles and summaries. Source of
  truth for the app. Generated, committed, never hand-edited.
- **`lib/help/mod.ts`**: the `HelpId`/`HelpTarget` types and the URL builder
  (`https://fastr-analytics.org` + `/fr` when `isFrench()` + page + `#anchor`).
- **`client/src/components/HelpButton.tsx`**: the icon button + the modal
  (opened via panther's `openComponent`). Fully self-contained — `id` is the
  only prop.

## EN/FR coupling, briefly

The **page** is shared automatically: Starlight serves the French translation at
the same slug under `/fr/`. The **section anchor** is *not* shared — French
headings slugify differently (`#data-tab` vs `#onglet-données`) — so the shared
`#id` on the tag is what links them. The generator stores each language's own
anchor and the runtime picks the right one from `isFrench()`.

## Reuse / robustness

- One prop, build-time-validated. A dangling button can't ship — `typecheck`
  catches it once the table is regenerated.
- No runtime fetch, no CORS, works offline; the live docs site is only touched
  when the user clicks "Read more…".
- No new dependencies — heading slugs are computed inline.
