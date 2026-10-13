# Report Forge

A report editor you mount in your own app. The user writes on the finished page:
real page boxes, a themed document, blocks such as covers, callouts, stat tiles
and columns, an outline, and downloads to Word, HTML and PDF. Documents are
FASTR Markdown, which is ordinary markdown plus a small set of `:::` blocks, so
a document is one string you store however you like.

Report Forge is a SolidJS component and a framework-free engine, shipped as
TypeScript source. Your app's own Vite compiles it.

- **Client:** SolidJS and Vite.
- **Server (only for PDF):** Deno, with a headless Chrome.

## Quick start

1. **Add the folder** to your project as `report-forge/` (a git submodule).

2. **Install its dependencies.** They are the `peerDependencies` in
   [package.json](package.json): solid-js, the CodeMirror 6 packages,
   markdown-it, docx, dompurify, and the Yjs trio.

3. **Add the Vite plugin.** It resolves `report-forge` to the folder and makes
   sure your app and the editor share one copy of each dependency.

   ```ts
   // vite.config.ts
   import { defineConfig } from "vite";
   import solid from "vite-plugin-solid";
   import { reportForge } from "./report-forge/vite.ts";

   export default defineConfig({ plugins: [solid(), reportForge()] });
   ```

   For TypeScript, point the name at the folder in `tsconfig.json`:
   `"paths": { "report-forge": ["./report-forge/mod.ts"] }`.

4. **Mount it.** Give it a box to fill, a body and somewhere to put changes.

   ```tsx
   import { createSignal } from "solid-js";
   import { ReportForge, type ReportForgeSettings } from "report-forge";
   import "report-forge/styles.css";

   function Editor() {
     const [body, setBody] = createSignal("# My report\n\n");
     const [settings, setSettings] = createSignal<ReportForgeSettings>({
       theme: "default",
     });
     return (
       <div style={{ height: "100vh" }}>
         <ReportForge
           body={body()}
           onBodyChange={setBody}
           settings={settings()}
           onSettingsChange={setSettings}
         />
       </div>
     );
   }
   ```

That is a working editor: menus, toolbar, page layout, outline, themes,
templates, and Word and HTML downloads. [playground/](playground/) is this quick
start as a runnable app.

## The contract

The editor is controlled. You hand the document in and store what comes back; it
never fetches or saves. The full, commented types are in
[ui/screen/types.ts](ui/screen/types.ts).

| Prop                           | What it is                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body`, `onBodyChange`         | The document, a FASTR Markdown string. Changes on every keystroke.                                                                                                |
| `settings`, `onSettingsChange` | The look: theme, optional palette, the template it started from. Rare. May return a promise that rejects; the editor then keeps the old look and shows the error. |
| `images`, `onImagesChange`     | Records for the images the body refers to by id.                                                                                                                  |
| `title`                        | The document's name: file names, the PDF footer.                                                                                                                  |
| `canEdit`                      | `false` renders read-only, with no menus or toolbar.                                                                                                              |
| `language`                     | `"en"`, `"fr"` or `"pt"`.                                                                                                                                         |
| `ref`                          | The imperative handle: selection, propose an edit, page layout, open a dialog.                                                                                    |

Everything below is optional. The editor does without what you leave out and
hides the controls that would need it.

| To get                    | Supply                                   | Without it                            |
| ------------------------- | ---------------------------------------- | ------------------------------------- |
| Images and logos          | `imageHost` with `assetUrl` and `upload` | No image, logo or page-photo controls |
| A list of images to reuse | `imageHost.library`                      | Upload only                           |
| Your own image picker     | `imageHost.pick`                         | The built-in picker                   |
| PDF download              | `renderPdf` (see below)                  | Word and HTML only                    |
| Charts or other figures   | `figures`                                | No figure entry in the menus          |
| Real-time co-editing      | `collab` (a `Y.Text` and an awareness)   | Single user, ordinary undo            |
| Saved colour palettes     | `palettes`                               | Built-in themes only                  |
| Your own menu entries     | `menuItems`, `menuTrailing`              | The editor's own menus                |
| Banners, a side panel     | `banner`, `dockedPanel`                  | Nothing there                         |

### Images

An image record holds your own reference to an image, `imgFile`: a path, a
storage key, or a URL. The editor stores the reference and asks `assetUrl` for a
URL when it draws.

```tsx
<ReportForge
  imageHost={{
    assetUrl: (ref) => `/files/${ref}`,
    upload: async (file) => (await myUpload(file)).key,
  }}
/>;
```

### PDF

The PDF is the editor's own pages. The browser builds a complete paged document;
a headless Chrome prints it. [server/](server/) is that printer, for Deno. Mount
it behind a route and pass a function that calls the route:

```tsx
<ReportForge
  renderPdf={async (html, onProgress) => {
    const res = await fetch("/render-pdf", { method: "POST", body: html });
    return await res.blob();
  }}
/>;
```

### Figures

A figure is yours entirely. The body holds a token, `![caption](figure:id)`; the
editor lays out a box for it and your component fills the box. Supply
`figures.View` to draw one, `figures.size` so the page layout knows its shape,
and `figures.rasterize` so exports can embed it.

### Real-time editing

Pass `collab={{ yText, awareness }}` once your Yjs document has synced. You own
the transport and the awareness. The editor binds to the text, draws other
people's carets, keeps undo per user, and clears a caret when its owner leaves
the editor.

## Theming the chrome

The toolbar, menus and dialogs read their colours, radius and font from CSS
variables. Set them on `:root`:

```css
:root {
  --forge-accent: #4f46e5;
  --forge-radius: 6px;
  --forge-font: "Inter", system-ui, sans-serif;
}
```

| Variable                                                                  | Default              | Paints                                   |
| ------------------------------------------------------------------------- | -------------------- | ---------------------------------------- |
| `--forge-surface`                                                         | `#ffffff`            | Panels, menus, dialogs                   |
| `--forge-surface-2`, `--forge-surface-3`                                  | `#f2f2f2`, `#e4e4e4` | The ground around the page, flat buttons |
| `--forge-ink`, `--forge-ink-muted`                                        | `#2a2a2a`            | Text                                     |
| `--forge-border`                                                          | `#cacaca`            | Rules and outlines                       |
| `--forge-accent`, `--forge-accent-ink`                                    | `#0e706c`, `#ffffff` | Primary buttons, selection               |
| `--forge-danger`, `--forge-success`, `--forge-warning`, `--forge-neutral` |                      | Intent colours                           |
| `--forge-focus`, `--forge-focus-style`                                    | accent, `solid`      | The keyboard focus ring                  |
| `--forge-radius`, `--forge-shadow`, `--forge-font`                        | `4px`                | Shape and type                           |
| `--forge-scrim`                                                           | 30% black            | The veil behind a dialog                 |

The document itself (the page, its headings, its blocks) is not styled by these.
It takes its look from the document's theme.

## The engine on its own

`report-forge/engine` has no browser framework in it and runs in Deno: render a
body to HTML, build the theme stylesheet, list headings, edit sections, lay out
pages from measured heights, build a Word document.

```ts
import {
  buildFastrReportCss,
  renderFastrMarkdownToHtml,
} from "report-forge/engine";

const html = renderFastrMarkdownToHtml(body, { lineAnchors: false });
const css = buildFastrReportCss("editorial");
```

The syntax a document may use is in
[engine/fastr_markdown_spec.ts](engine/fastr_markdown_spec.ts), written to be
handed to a language model as well as read.

## What is in the folder

| Path                                   | What                                          |
| -------------------------------------- | --------------------------------------------- |
| [mod.ts](mod.ts)                       | Everything a client imports                   |
| [engine/](engine/)                     | The document engine. Pure TypeScript          |
| [ui/screen/](ui/screen/)               | The mounted editor, its toolbar and dialogs   |
| [ui/editor/](ui/editor/)               | The CodeMirror editing surface and page boxes |
| [ui/exports/](ui/exports/)             | HTML, PDF and Word builders                   |
| [ui/kit/](ui/kit/)                     | The editor's own buttons, dialogs and menus   |
| [styles/](styles/)                     | The stylesheet and its build                  |
| [server/](server/)                     | The Deno PDF printer                          |
| [playground/](playground/)             | A minimal host, and where the tools run       |
| [harness/](harness/), [tests/](tests/) | Parity checks and unit tests                  |

## Working on Report Forge

```
cd playground
npm install
npm run dev          # the playground, http://localhost:3210
npm run styles       # rebuild styles/report-forge.css
npm run typecheck
```

- **Styles.** The chrome is written with utility classes under an `rf:` prefix
  (`rf:flex`, `rf:gap-1`) plus the hand-written components in
  [styles/kit.css](styles/kit.css). `npm run styles` compiles exactly the
  classes the source uses into
  [styles/report-forge.css](styles/report-forge.css), which is committed, so a
  host needs no CSS tooling. Run it after adding or changing an `rf:` class. It
  fails on a class that compiles to nothing.
- **Boundary.** Nothing under this folder imports from outside it.
  [harness/lint_boundary.ts](harness/lint_boundary.ts) checks.
- **Engine parity.** [harness/engine_snapshot.ts](harness/engine_snapshot.ts)
  renders a fixed set of documents on every theme (HTML, stylesheets, page
  setup, Word XML); [harness/engine_compare.ts](harness/engine_compare.ts) diffs
  a run against [harness/baseline/](harness/baseline/). A change that is meant
  to alter output updates the baseline in the same commit.
- **Tests.** `deno test -A tests/` from a project whose import map has the
  dependencies.

## Provenance

Report Forge was built inside the FASTR Analytics platform and extracted from
it. The platform's licence reserves all rights to its copyright holders, so the
written permission under which this package is reused elsewhere belongs here.

> **To fill in before this folder becomes its own repository:** who granted the
> permission, the date, and what it covers.

The icons are from [Tabler Icons](https://tabler.io/icons) (MIT). Page layout
uses a vendored build of [Paged.js](https://pagedjs.org) (MIT). The typefaces
embedded in Word files are under the SIL Open Font License. Each has its licence
note beside it.
