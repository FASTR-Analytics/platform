# Protocol: UI Structure

**Scope:** UI

How client code is organised on disk — the layout *inside* `src/`, especially `components/`. For the top-level `src/` tree, the app modes, import order, and global barrels see `PROTOCOL_ALL_STRUCTURE.md`. For how to *use* panther components see `PROTOCOL_UI_COMPONENTS.md`. For file/type naming see `PROTOCOL_ALL_TYPESCRIPT.md`.

## Principle

**The folder tree should read like the app.** Someone who knows the UI should be able to guess where a component lives; someone reading `components/` should be able to guess the UI. Organise by **feature/screen**, not by mechanism or component type.

## Rules

1. **Feature folders mirror the UI** — `components/<area>/` matches a screen or nav area, and sub-views nest under it. The folder hierarchy tracks the screen hierarchy.
2. **Shared components get an explicit `_shared/` home** — a component used across multiple areas has no single UI home, so it lives in `_shared/`. This is the one deliberate exception to UI-mirroring.
3. **One home per component** — every component lives in its feature folder or in `_shared/`. "Loose at the `components/` root" is not a location.
4. **Co-locate by feature, not by mechanism** — keep a feature's pieces together. Don't create type/mechanism buckets (`editors/`, `modals/`, `forms/`) that scatter one feature across many folders.
5. **Nest facets; don't suffix them** — `thing/`, `thing_import/`, `thing_edit/` as siblings is a smell. Make one `thing/` folder with the facets inside.
6. **A file until it's a folder** — a single component is one file; promote to a folder only when it grows a second file. Don't pre-create folders.
7. **Cross-feature imports hit a feature's entry, not its internals** — a feature folder is a unit; import what it exposes, not its deep files.
8. **snake_case folders and files** — `_prefix` for shared/internal (`_shared/`, `_helpers.ts`). See `PROTOCOL_ALL_TYPESCRIPT.md`.

## Do / Don't

### Mirror the UI

```
# ❌ DON'T — flat dump / organised by type
components/
├── ReportEditor.tsx
├── ReportList.tsx
├── SlideEditor.tsx
├── editors/
└── modals/

# ✅ DO — feature folders that match the screens, sub-views nested
components/
├── report/
│   ├── report.tsx
│   └── report_editor.tsx
└── slide_deck/
    ├── slide_deck.tsx
    ├── slide_editor/
    └── style_editor/
```

**Why:** the tree becomes a map of the app. New contributors navigate by what they see on screen, and a screen's code is one folder, not scattered by type.

### Shared components

```
# ❌ DON'T — cross-screen components loose at the root
components/
├── PeriodSelector.tsx        # used by report, dashboard, visualization…
├── NotAvailableBox.tsx
└── report/

# ✅ DO — an explicit shared home
components/
├── _shared/
│   ├── period_selector.tsx
│   └── not_available_box.tsx
└── report/
```

**Why:** a component used everywhere belongs nowhere in particular — `_shared/` says so explicitly, instead of the root becoming an unsorted junk drawer.

### Co-locate; don't fragment by mechanism

```
# ❌ DON'T — one feature split across mechanism buckets
components/
├── editors/dataset_editor.tsx
├── modals/dataset_delete_modal.tsx
└── tables/dataset_table.tsx

# ✅ DO — the feature is one folder
components/
└── dataset/
    ├── dataset_table.tsx
    ├── dataset_editor.tsx
    └── dataset_delete_modal.tsx
```

**Why:** features change together; mechanism buckets force you to touch three folders for one change and hide what belongs to what.

### Nest facets; don't suffix

```
# ❌ DON'T — prefix-explosion siblings
components/
├── dataset_hfa/
├── dataset_hfa_import/
├── dataset_hmis/
└── dataset_hmis_import/

# ✅ DO — one domain folder, facets inside
components/
└── dataset/
    ├── hfa/
    │   ├── view/
    │   └── import/
    └── hmis/
        ├── view/
        └── import/
```

**Why:** the shared prefix is a folder waiting to happen. Nesting makes the domain and its facets obvious and keeps siblings from multiplying.

## Where does a new component go?

| Situation | Home |
|-----------|------|
| Used by exactly one area | that area's feature folder |
| Used by several areas | `_shared/` |
| It *is* a screen / nav area | a new top-level feature folder |
| One internal part of a feature | inside that feature's folder (a file, or sub-file) |

If you can't decide between "one area" and "shared", default to the **feature folder** and promote to `_shared/` only when a second area needs it — don't pre-share.

## Checklist

- [ ] Folder tree mirrors the UI / nav hierarchy
- [ ] Every component is in a feature folder or `_shared/` — none loose at the root
- [ ] No mechanism/type buckets (`editors/`, `modals/`, `tables/`) splitting a feature
- [ ] No prefix-explosion siblings (`x`, `x_import`, `x_edit`) — nest instead
- [ ] Single components are files; folders only when there's a second file
- [ ] snake_case folders and files; `_prefix` for shared/internal
- [ ] Cross-feature imports hit a feature's entry, not its internals
