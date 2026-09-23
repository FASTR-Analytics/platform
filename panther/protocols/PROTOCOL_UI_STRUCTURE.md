# Protocol: UI Structure

**Scope:** UI

How client code is organised on disk: the layout inside `src/`, especially
`components/`. For the top-level `src/` tree, the app modes, import order and
global barrels see `PROTOCOL_ALL_STRUCTURE.md`. For how to use panther
components see `PROTOCOL_UI_COMPONENTS.md`. For identifier naming see
`PROTOCOL_ALL_TYPESCRIPT.md`.

Rules 3 to 7 and the file-naming half of rule 10 are checked by a lint, and each
checklist item names the check that verifies it. Rules 1, 2, 8 and 9 and the
naming judgement in rule 10 are what a reviewer reads the tree for. The checker
lives in the consuming app (`lint_structure.ts`, chained into its typecheck
task) until panther ships its audit tool.

## Principle

**The folder tree reads like the app.** Someone who knows the UI can guess where
a component lives; someone reading `components/` can guess the UI. Organise by
screen, never by mechanism or component type.

## Rules

1. **Top level equals the nav rail plus the shell**: one folder per nav area,
   one for the shell, and `_shared/`. Nothing else sits at the root of
   `components/`, and no file does. A nav area is a folder even when it holds
   one file.
2. **Pages nest under what opens them**: a page's own files sit at its folder's
   root; each page it opens is a sub-folder, or a single file when it is one
   file. Facets nest (`dataset/hmis/import/`), never suffix
   (`dataset_hmis_import/`).
3. **`mod.ts` is the only entry**: another folder imports a folder only through
   its `mod.ts`, type-only imports included. `index.ts` and `index.tsx` are
   banned. The main component's file is named for the component
   (`products/products.tsx`), and `mod.ts` re-exports what other folders may
   use.
4. **`_shared/` is scoped**: `X/_shared/` is imported only from files under
   `X/`, and only when two or more distinct children of `X` import it. `X`'s own
   root files count as one child; a sibling `_shared/` sub-folder counts as one.
   Default a file to its feature folder and promote it when the second consumer
   appears. Never pre-share.
5. **No underscore prefix inside `components/`** except `_shared/`. The entry
   rule already says what is internal.
6. **Layers import one way**: route pages and app services import `components/`
   entries; `components/` imports exporters, generators, state and the
   libraries; exporters import generators; generators import state and the
   libraries. Nothing below `components/` imports it, and a generator never
   imports an exporter.
7. **No runtime import cycle between folders**: in the graph whose nodes are
   folders and whose edges are non-type imports of a `mod.ts`, there is no
   cycle.
8. **Co-locate by feature, not by mechanism**: no `editors/`, `modals/`,
   `forms/` buckets that scatter one feature across folders.
9. **A file until it is a folder**: one component is one file; promote to a
   folder at the second file. Never pre-create folders.
10. **snake_case, named for the main export**: `product_card.tsx` exports
    `ProductCard`. A child never repeats its folder's name
    (`hfa/indicators/manager.tsx`, not
    `hfa/indicators/hfa_indicators_manager.tsx`). Wizard steps are
    `step_N_name.tsx`. Every file has an importer; delete what has none.

## Do / Don't

### Mirror the nav

```text
# ❌ DON'T: one folder per concept, loose files at the root
components/
├── PeriodSelector.tsx
├── instance_dataset_hmis/
├── instance_dataset_hfa/
├── indicator_manager_hmis/
├── indicator_manager_hfa/
└── forms_editors/

# ✅ DO: one folder per nav area, pages nested under the page that opens them
components/
├── _shared/
├── instance/                 # the shell
├── products/
│   ├── mod.ts  products.tsx
│   ├── slide_deck/
│   └── report/
└── data/
    ├── mod.ts  data.tsx
    ├── hmis/
    │   ├── dataset/
    │   ├── imports/
    │   └── indicators/
    └── hfa/
```

**Why:** the tree is a map of the app. A screen's code is one folder, found by
what is on the screen, and the root lists the nav.

### The entry

```tsx
// ❌ DON'T: reach into another folder
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { IndicatorDisplay } from "../indicators/_indicator_display";

// ✅ DO: import what the folder exposes
import { convertAiInputToSlide } from "~/components/products/copilot/mod.ts";
import { IndicatorDisplay } from "../indicators/mod.ts";
```

**Why:** a folder is a unit. Its `mod.ts` is the contract; everything else can
move or be renamed without touching another folder.

### Scoped shared

```text
# ❌ DON'T: one global _shared/ that becomes a second junk drawer
components/
└── _shared/
    ├── slide_cursors.tsx       # used by slide_deck only
    ├── report_cursors.tsx      # used by report only
    └── version_history/        # used by slide_deck and report only

# ✅ DO: shared at the nearest common ancestor
components/
├── _shared/
│   └── file_upload_selector.tsx   # used by data/ and products/
└── products/
    ├── _shared/
    │   └── version_history/       # used by slide_deck and report
    ├── slide_deck/
    │   └── slide_cursors.tsx
    └── report/
        └── report_cursors.tsx
```

**Why:** "shared" means shared by whom. The nearest common ancestor says who,
and the two-consumer rule keeps single-consumer files where they belong.

### Layers

```tsx
// ❌ DON'T: state or an exporter reaching up into the component tree
// state/instance/collab.ts
import { notifyPresenceToasts } from "~/components/_shared/presence_toasts";
// exports/export_report_as_pdf.ts
import { REPORT_MARKDOWN_STYLE } from "~/components/report/report_markdown_style";
// generate_report/paginate_report.ts
import { buildStandaloneReportHtml } from "~/exports/export_report_as_html";

// ✅ DO: the lower layer owns it; the upper layer imports down
// state/instance/collab_presence_toasts.tsx      (state owns the sink)
// generate_report/report_markdown_style.ts       (the generator owns the model)
// exports/export_report_as_pdf.ts
import { REPORT_MARKDOWN_STYLE } from "~/generate_report/report_markdown_style";
```

**Why:** a layer that imports upward cannot be loaded, tested or moved without
the UI above it, and the tree stops being a map because the same code has two
homes.

### Cycles

```tsx
// ❌ DON'T: two folders that each import the other's entry at runtime
// products/slide_deck/slide_editor.tsx
import { ProductCopilotHost } from "../copilot/mod.ts";
// products/copilot/slide_ai/convert_ai_input_to_slide.ts
import { defaultSlideConfig } from "../../slide_deck/mod.ts";

// ✅ DO: what both need moves to their common _shared/; the edge points one way
// products/slide_deck/slide_editor.tsx
import { ProductCopilotHost } from "../copilot/mod.ts";
// products/copilot/slide_ai/convert_ai_input_to_slide.ts
import { defaultSlideConfig } from "../../_shared/mod.ts";
```

**Why:** a cycle means neither folder can be loaded, tested or moved without the
other, so the two are one unit that the tree draws as two. Type-only imports do
not count: they vanish at runtime.

### Names

```text
# ❌ DON'T
indicator_manager_hfa/hfa_indicators_manager.tsx    # folder name repeated
figure_editor/presentation_object_editor_panel.tsx  # vocabulary the app no longer uses
copilot/ai_documents/useAIDocuments.ts              # React hook naming, PascalCase
instance_dataset_hmis/_ledger_table.tsx             # underscore carries no meaning

# ✅ DO
data/hfa/indicators/manager.tsx
_shared/figure_editor/editor_panel.tsx
products/copilot/ai_documents/ai_documents_store.ts
data/hmis/dataset/ledger_table.tsx
```

**Why:** the path already says the feature; the file name has only to say the
part. A name that repeats the path or a retired term costs a reader a lookup
every time.

## Where does a new file go?

| Situation                                   | Home                                                 |
| ------------------------------------------- | ---------------------------------------------------- |
| Used by one page                            | that page's folder                                   |
| Used by two or more children of one folder  | that folder's `_shared/`                             |
| Used by two or more nav areas               | `components/_shared/`                                |
| It is a nav area or the shell               | a new top-level folder                               |
| Needed by state, an exporter or a generator | not in `components/`: the lowest layer that needs it |

## Checklist

Each item names the check in the consuming app's `lint_structure.ts`.

- [ ] `root-file`: nothing at the root of `components/` but folders
- [ ] `index-entry`: no `index.ts` or `index.tsx`
- [ ] `snake-case`: snake_case files and folders; no underscore prefix except
      `_shared/`
- [ ] `entry-only`: every import into another folder targets its `mod.ts`
- [ ] `shared-scope`: `X/_shared/` is imported only from under `X/`
- [ ] `shared-consumers`: every `_shared/` file has two or more consuming
      children
- [ ] `direction`: nothing below `components/` imports it; no generator imports
      an exporter
- [ ] `entry-cycle`: no runtime import cycle between folders
- [ ] `unimported`: every file has an importer (the app entry and the route
      pages are the roots)

The lint cannot read the nav rail or a component's purpose, so a reviewer also
checks that the top level is the nav rail plus the shell (rule 1), that pages
nest under the page that opens them (rule 2), that there are no mechanism
buckets and facets nest rather than suffix (rules 2 and 8), that a folder exists
only at the second file (rule 9), and that each file is named for its main
export without repeating its folder (rule 10).
