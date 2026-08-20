# PLAN — Products page as a file explorer: nested folders, plus a list view

**Status 2026-08-20: FULLY RULED, NOT BUILT. Every decision below is settled —
there are no open questions. Build it as written.**

This plan is written for an implementer with no prior context. Read §0 first.

---

## 0. Orientation — read this before touching anything

**The page.** Everything here is the **Products** page,
[client/src/components/products/index.tsx](client/src/components/products/index.tsx).
"File explorer" is the interaction metaphor for browsing products and folders
there — it is **not** a new page and **not** a rename. The separate **Explore**
tab ([client/src/components/explore/index.tsx](client/src/components/explore/index.tsx))
is the standalone visualizer and **must not be touched**.

**What this plan does, in three sentences.** The folder sidebar is deleted and
the main pane becomes a location-based explorer where folders sit alongside
products and clicking a folder navigates into it. Folders gain unlimited
nesting via a single `parent_id` column. A list view is added beside the grid
view, toggled in the header.

**Read before writing code** (they are prescriptive, not background):

- `panther/protocols/PROTOCOL_UI_COMPONENTS.md`, `PROTOCOL_UI_STYLING.md`,
  `PROTOCOL_UI_SOLIDJS.md`, `PROTOCOL_UI_STRUCTURE.md`
- [PROTOCOL_APP_UI_CONVENTIONS.md](PROTOCOL_APP_UI_CONVENTIONS.md),
  [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md)
- [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — before writing §3's
  migration
- [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) — the system
  this plan changes; [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)
  for the SSE/notify half

**Already done, do not redo.** Commit `28d138de` trimmed `ProductSummary` to
product identity: the deck arm is `{ ...base, type: "slide_deck", firstSlideId }`
and the report arm is `{ ...base, type: "report", hasEmbeds }`. There is no
`config` and no `preview` on a summary any more. Anything in this plan that
renders a product reads only those fields plus `ProductBase`.

**Hard constraints.**

- **Never edit `panther/`.** It is an external library, synced from its own
  repo and overwritten on every sync. Every component and icon this plan needs
  already exists there — the table below lists them.
- **No new npm/deno dependency.** No tree library, no drag library.
- **No `panther` `Table`** for the list view (§5 explains what to build and why
  this is a sanctioned exception to `PROTOCOL_UI_COMPONENTS` rule 4).
- All user-visible copy is authored inline as `t3({ en, fr, pt })`. There is no
  translation build step. Sentence case.

**Panther facts you will need** (verified against the vendored copy):

| Need | What exists |
| --- | --- |
| Context menus with submenus | `showMenu({ anchor, items })`; `MenuItem` includes `MenuItemWithSubmenu` (`{ label, icon?, subMenu: MenuItem[] }`) and `{ type: "divider" }` |
| Icons | `folder`, `presentation`, `report`, `moreVertical`, `chevronRight`, `layoutGrid`, `clearAll` (the list-lines glyph), `plus`, `pencil`, `trash`, `copy`, `settings` |
| Selection | `createSelectionController<string>({ ids, mode: "multi" })`; `handleClick(id, event?, onOpen?)` — plain click opens when `onOpen` is given, modifiers select/range |
| Header bar | `HeadingBar` takes `heading: string \| JSX.Element`, `subheading`, `onBack`, `leftChildren`, `centerChildren`, `children`, `searchText` / `setSearchText` |
| Checkbox | `Checkbox` takes `onChange(checked: boolean)` — **no MouseEvent**, so range-select from the checkbox is not possible; the row itself carries that (§5) |
| `SelectionCircle` | Hard-positioned `absolute right-2 top-2`, revealed by a `group/card` parent. Fine inside `Card`; **do not** use it in a list row |
| `data-*` forwarding | Only on `Button`, `Card`, `HeadingBar`, `Select`, `Input`, `ButtonGroup`, `CollapsibleSection`, `Slider`, `TabsNavigation`, `MenuTriggerWrapper`, `CopyToClipboardButton`. Elsewhere it silently vanishes — put tour anchors on your own DOM nodes instead |

---

## 1. Vocabulary and the model

- **Product** — a slide deck or a report. One `products` row, one id namespace.
- **Folder** — an organising container. Holds products and other folders.
- **Location** — where the explorer currently is: the **root**, or one folder.
- **Root** — `productsOpenFolder() === null`. Shows folders with
  `parentId === null` and products with `folderId === null`.
- **Inside a folder `F`** — shows folders with `parentId === F` and products
  with `folderId === F`.
- **Path** — the chain of ancestors of a folder, derived by walking `parentId`.
  Never stored.

A product lives in exactly one folder (or none). Nesting applies to folders
only.

---

## 2. Rulings — all settled

Each ruling names the evidence that settled it, so you do not have to
re-litigate any of them mid-build.

**D1. Folders are always visible in a location, whatever the type filter says.**
The chips filter *products*; a folder is neither a deck nor a report. A folder's
**count** does reflect the filter. *Why:* hiding zero-count folders makes
navigation targets appear and disappear as chips toggle.

**D2. Search is global and flat — it escapes the current location.** At ≥3
characters the page leaves the explorer and shows one flat result set: matching
folders (by label) first, then matching products (by label) from anywhere in the
tree, each showing its **full path**. *Why (decisive):* today the page can
already search across all folders — [index.tsx](client/src/components/products/index.tsx#L128)
applies search before the folder filter, so "All products" + search is a global
search. The explorer deletes that pseudo-group, so scoped search would **remove
a capability that exists today**. Note the sibling page disagrees
([explore/index.tsx](client/src/components/explore/index.tsx#L267) scopes search
to the selected module) — the difference is that Explore keeps a permanent "all"
option and the explorer has none.

**D3. Folders are not multi-selectable and never part of a batch.** Selection
stays over product ids only. A folder acts through its own menu. *Why:*
[lib/api-routes/products/folders.ts](lib/api-routes/products/folders.ts) has
single-id create/update/delete only, against three batch routes for products —
selectable folders would mean N sequential requests, a per-type dispatch in
every handler, and prefixed ids to share one selection controller, to enable an
operation the server has no shape for.

**D4. No drag-and-drop in this plan.** D14 is the interim; DnD is a later plan.

**D5. The open folder and the view mode persist across sessions**
(`localStorage`). Search text stays ephemeral. If the open folder id is no
longer in `instanceState.folders`, fall back to the root.

**D6. One sort vocabulary, two controls.** The header `Select` (Name / Recently
updated) works in both views; in list view the **Name** and **Last updated**
column headers are also clickable and write the same `productsSortMode`. No new
sort mode and no ascending/descending toggle —
[_shared/sort_control.tsx](client/src/components/_shared/sort_control.tsx) stays
the one vocabulary.

**D7. Folders sort by the same mode as products and always come first.**
`"label"` by label; `"recent"` by `folder.lastUpdated`. Never interleaved.

**D8. No batch action bar.** Multi-select actions stay in the context menu.

**D9. Nesting is an adjacency list: one nullable `parent_id`.** No `ltree`, no
closure table, no nested sets, and **no denormalized path string**. *Why:*
adjacency list is the recommended default in every comparison surveyed
(Appendix A.1) and re-parenting is a single-column `UPDATE` where the
alternatives rewrite a subtree, a row set, or the whole table. A stored path is
specifically banned because renaming a folder would rewrite every descendant row
and folder labels are user-edited constantly. Paths are derived on the client,
where the whole folder list already lives.

**D10. Cycles are refused by the server, inside the move transaction.** A folder
may not move into itself or any descendant. Recursive CTE walking **up** from
the target; on a hit return a typed failure through the `APIResponse` envelope —
never a throw. The client also disables illegal targets in pickers, but that is
a courtesy: the server is the authority (SYSTEM_01, path-id-is-the-authority).

**D11. Delete reparents one level. It never cascades.** Child folders and
products move up to the deleted folder's parent (the root if it had none).
*Why (decisive):* `products` → `slide_decks`/`reports` → `slides`,
`report_versions`, `deck_versions` are all `ON DELETE CASCADE`
([_main_database.sql](server/db/instance/_main_database.sql#L134)) and S12
states there is no trash — so a cascading folder delete would put every deck,
report **and every saved version of each** in the subtree, unrecoverable, behind
one confirm dialog. Reparenting costs two extra UPDATEs.

**D12. The location is one folder id; the path is derived.**
`productsOpenFolder` stays `string | null`. No path stack in state, none in the
URL. Keep the data model (the flat `Folder[]` from T1) separate from the render
model (the rows of one location; the flattened path list in a picker) — nothing
mutates a tree into state (Appendix A.4).

**D13. Breadcrumb: keep the root, collapse the middle, tooltip the truncated.**
`Products` is always the first crumb and the current folder always the last;
when the trail does not fit, the crumbs between them collapse into a `…` that
opens them as a menu; a truncated label carries its full text as `title`.
Convergent guidance of Windows `BreadcrumbBar`, GNOME and Adobe Spectrum
(Appendix A.2).

**D14. Interim move affordances (no DnD, no cut/paste).** Product menus and
folder menus gain, above their existing entries:

| Entry | Shown when | Does |
| --- | --- | --- |
| **Move into ▸** | the current location has child folders | submenu of the folders in **this location**, capped at the first 10 by current sort, then a **More…** entry opening the picker |
| **Move up to "Country"** | inside a folder that has a parent | moves the batch one level up; the entry is labelled with the parent's name |
| **Move to top level** | inside any folder | moves the batch to the root |
| **Move to folder…** | always | the full picker (D15) |

A folder's menu carries the same four, moving that folder, with its own
descendants excluded from the submenu and disabled in the picker. *Why not
cut/paste:* every cross-container move in this app is already a modal picker
(`MoveToFolderModal`, `copy_slides_to_deck_modal`, `AddToDeckModal`) and there
is no clipboard or marking idiom anywhere in the codebase.

**D15. The folder picker is a flat list of full paths** — `Country › 2025 ›
Reports` — sorted by path, "No folder" first, illegal targets disabled. The
existing `convertToSelectThreshold` in the move modal already switches it to a
searchable `Select` once the list grows.

**D16. A folder's counts are its DIRECT children only** — "2 folders · 5
products" — never recursive.

**D17. No depth cap.** The acyclic invariant is the only structural rule; D13 is
what makes depth survivable.

---

## 3. Server + lib work (nesting)

This is the only server surface in the plan. **No route is added or removed** —
a folder move is `updateFolder`, because label, colour and parent are one
metadata write.

### 3.1 Migration — `server/db/migrations/instance/082_folder_nesting.sql`

`081` is the current highest. Additive and nullable, so there is no data
transform and no skip-gate to force. Read
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) first; `ADD COLUMN`
must be `IF NOT EXISTS`.

```sql
ALTER TABLE folders ADD COLUMN IF NOT EXISTS parent_id text
  REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
```

Mirror the same column and index into the `folders` block of
[server/db/instance/_main_database.sql](server/db/instance/_main_database.sql#L109)
(base schema and migrations must agree — that is what `./validate_migrations`
checks). `ON DELETE SET NULL` is a backstop only: §3.4 reparents explicitly
inside the transaction, so the FK never fires.

### 3.2 Types

- [server/db/instance/_main_database_types.ts](server/db/instance/_main_database_types.ts#L56):
  `DBFolder.parent_id: string | null`.
- [lib/types/products.ts](lib/types/products.ts#L26): `Folder.parentId: string | null`.
- [lib/api-routes/products/folders.ts](lib/api-routes/products/folders.ts):
  `parentId: z.uuid().nullable()` on the `createFolder` and `updateFolder`
  bodies. Folder ids are uuids (unlike product ids) — `z.uuid()` is correct
  here and only here.

### 3.3 `createFolder` / `updateFolder`

Both take `parentId: string | null`, and `rowToFolder` returns it.

`updateFolder` is now also the **move**, so it carries the D10 guard. Run it
inside a transaction with the UPDATE:

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id FROM folders WHERE id = ${parentId}
  UNION ALL
  SELECT f.id, f.parent_id FROM folders f JOIN ancestors a ON f.id = a.parent_id
)
SELECT 1 FROM ancestors WHERE id = ${folderId}
```

A row back (or `parentId === folderId`) means the move is illegal: return
`{ success: false, err: FOLDER_CYCLE }`, where `FOLDER_CYCLE` is an exported
human-readable constant beside the existing `NO_READY_PINNED_PACKAGE` idiom in
[server/db/products/products.ts](server/db/products/products.ts#L25) (put the
folder one in `folders.ts`):

```ts
export const FOLDER_CYCLE =
  "A folder cannot be moved into itself or into one of its own subfolders";
```

Skip the guard entirely when `parentId` is unchanged or `null` — a rename or a
move to the root cannot create a cycle.

### 3.4 `deleteFolder` — reparent, never cascade (D11)

One transaction, in this order:

1. Read the deleted folder's `parent_id` into `newParent` (may be `null`).
2. `UPDATE folders SET parent_id = ${newParent} WHERE parent_id = ${folderId}`.
3. `UPDATE products SET folder_id = ${newParent}, last_updated = ${lastUpdated}
   WHERE folder_id = ${folderId} RETURNING id`.
4. `DELETE FROM folders WHERE id = ${folderId}`.

Return `{ freedProductIds, lastUpdated }` exactly as today. Note step 3 now sets
the parent folder rather than `NULL` — the products move **up one level**, not
to the root.

### 3.5 Notifications

[server/routes/products/folders.ts](server/routes/products/folders.ts) already
has the right shape; keep it and be precise about which events fire:

| Route | Emits |
| --- | --- |
| `createFolder` | `folders_updated` |
| `updateFolder` (rename, colour **or** move) | `folders_updated` only — no product row changed |
| `deleteFolder` | `folders_updated` **and** `products_upserted` for the freed ids |

`listFolders` keeps returning the whole list (`ORDER BY LOWER(label)`; the
client builds the tree and sorts per D7). The `FOLDER_CYCLE` failure returns
through the envelope, so the route returns `c.json(res)` before notifying —
mirror how `createProduct` handles `NO_READY_PINNED_PACKAGE`.

### 3.6 Verify by executing

Before moving on, prove the guard and the delete with a throwaway harness
against the dev database — the repo's standing rule is to verify by executing,
not by reading:

```sh
deno run --allow-all -c deno.json /tmp/check_folders.ts
```

Cover: move A into its own child (refused, `FOLDER_CYCLE`); move A into itself
(refused); move a leaf into a sibling (allowed); delete a mid-tree folder
(children and products land on its parent, `freedProductIds` correct); rename
with unchanged parent (allowed, guard skipped).

---

## 4. Client work

### 4.1 State — [client/src/state/t4_ui.ts](client/src/state/t4_ui.ts)

```ts
// null = the root; a folder id = inside that folder (D12).
export const [productsOpenFolder, setProductsOpenFolder]   // renamed from
                                   // productsSelectedFolder
                                   // localStorage key: "productsOpenFolder"

export type ProductsViewMode = "grid" | "list";
export const [productsViewMode, setProductsViewMode]
                                   // localStorage key: "productsViewMode"
                                   // default "grid"
```

Rename, do not alias; do not read or clean up the old `productsSelectedFolder`
key. Follow the existing setter idiom in that file (write-through to
`localStorage`, `removeItem` on `null`).

**Delete `updateProductsView` and `ProductsViewStateUpdates` from the same
file** — they have no callers anywhere (the copilot drives views through its own
registry). Confirm with a grep before deleting.

### 4.2 New file — `client/src/components/products/folder_tree.ts`

Pure functions over `Folder[]`, no reactivity, no imports from state:

```ts
childFolders(folders, parentId: string | null): Folder[]
ancestors(folders, folderId: string): Folder[]        // root-first, excludes self
pathLabel(folders, folderId: string): string          // "Country › 2025 › Reports"
descendantIds(folders, folderId: string): Set<string> // excludes self
folderPathOptions(folders, opts: { disabledSubtree?: string })
  : { value: string; label: string; disabled: boolean }[]  // sorted by path
```

`ancestors` and `descendantIds` must terminate on a malformed cycle rather than
hang (the server prevents cycles, but a defensive visited-set is three lines and
this code runs in the render path).

### 4.3 The page — [client/src/components/products/index.tsx](client/src/components/products/index.tsx)

**Remove:** the `FrameLeftResizable` wrapper and its whole panel, the
`SelectList` of groups, `groupOptions`, `renderGroupOption`,
`handleFolderContextMenu` (it moves to `folder_menu.ts`), and the `_ALL_PRODUCTS`
/ `_GENERAL` sentinels.

**Keep unchanged:** the deep-link effect (`?product=`), the `pendingEditorOpen`
effect, `openProduct`, the two separate `createButtonAction`s (the comment there
explains why they must not be shared — respect it), `canCreateProduct`, and the
whole selection/batch model.

**Add:**

- `location = () => productsOpenFolder()`, plus a guard effect: if the id is not
  in `instanceState.folders`, `setProductsOpenFolder(null)` (D5).
- `isSearching = () => searchText().length >= 3`.
- Two memos: `visibleFolders()` and `visibleProducts()`.
  - Searching (D2): folders = all folders whose label matches; products = all
    products whose label matches, type filter applied.
  - Not searching: folders = `childFolders(folders, location())`; products =
    products whose `folderId === location()`, type filter applied.
  - Both sorted with `sortBySortMode` (D7), folders rendered first.
- Header: breadcrumb (D13) as `heading`; `onBack` present only when inside a
  folder (goes to the parent) or when searching (clears the search); the view
  toggle `ButtonGroup` in `centerChildren` beside the existing sort `Select`; a
  **New folder** `Button` beside New deck / New report, gated on
  `canEditProducts()`, opening `EditFolderModal` with the current location as
  `parentId`.
- New products are created in the current location: `folderId: location()`.
- The scroll container holding the items carries `data-tour="products-items"`
  in **both** views, and clears the selection on background click.
- `onMoveTo(folderId)` (the handler D14's quick moves call) is
  `serverActions.moveProductsToFolder({ productIds, folderId })` followed by
  `selection.clear()` — the same batch route the move modal uses, never a
  per-product loop.

**Breadcrumb spec (D13).** `Products` crumb → `setProductsOpenFolder(null)`.
Then `ancestors(folders, location())` as crumbs, then the current folder as
plain text with its colour dot. If there are more than two intermediate crumbs,
render the first, a `…` button opening the rest via `showMenu`, and the last.
Each crumb `truncate`s with `title` carrying the full label. While searching the
heading is instead "Search results" with the match count as `subheading`.

**Clicking a folder** (either view) sets `productsOpenFolder` to its id, clears
the selection, and — if searching — clears the search text.

### 4.4 New file — `product_menu.ts`

Export one builder returning `MenuItem[]` so the grid card, the list row and the
row's `moreVertical` button all use the same menu:

```ts
buildProductMenu(args: {
  product: ProductSummary;
  batch: ProductSummary[];          // from selection.getBatchIds
  folders: Folder[];
  location: string | null;
  onSettings / onMoveToFolder / onDuplicate / onDelete: () => void;
  onMoveTo: (folderId: string | null) => void;   // D14 quick moves
}): MenuItem[]
```

Entries in order: D14's four move entries, a divider, then today's Settings /
Duplicate / Delete with their existing multi-select wording and the existing
`createDeleteAction` confirmation (hard delete, no trash). Move the current
`handleContextMenu` copy across verbatim — it is already translated.

### 4.5 New file — `folder_menu.ts`

`buildFolderMenu(...)` returning: D14's four move entries (targets exclude
`descendantIds(folder)` and the folder itself), a divider, **Rename / change
colour…** (opens `EditFolderModal`), and **Delete folder** via
`createDeleteAction` with a count-carrying confirmation:

> Delete "2025"? Its 2 folders and 5 products move to "Country".
> (…move to the top level, when the folder has no parent.)

Counts come from `childFolders` and the product list, both already in T1.

**Moving a folder is `serverActions.updateFolder({ folder_id, label, color,
parentId })`** with label and colour passed through unchanged — that route is
the move (§3.3). A `FOLDER_CYCLE` failure comes back through the envelope and
surfaces in the action's alert; do not pre-empt it with a client-side throw.

**After deleting the folder you are currently inside**, navigate to its parent —
capture `folder.parentId` before the call, then `setProductsOpenFolder(parentId)`
so you land where its contents just moved. The §4.3 guard effect is for the
other case, a folder deleted by someone else, and drops you at the root.

### 4.6 New file — `folder_card.tsx` (grid tile)

Panther `Card`, sized by the same
`repeat(auto-fill,minmax(15rem,1fr))` track as `ProductCard`:

- `header` = colour dot (`folder.color ?? getColor({ key: "base300" })`) +
  `folder` icon + label, `truncate`;
- body = "2 folders · 5 products" (D16) in `ui-text-caption`; while searching,
  the folder's parent path instead;
- `onClick` navigates in; `onContextMenu` and a hover `moreVertical` open
  `buildFolderMenu`;
- **no** `onSelectToggle` (D3);
- `data-tour="products-item"`.

### 4.7 Modals and pickers

| File | Change |
| --- | --- |
| [edit_folder_modal.tsx](client/src/components/products/edit_folder_modal.tsx) | takes `parentId: string \| null` for create and passes it to `createFolder`; on edit it passes the folder's existing `parentId` through `updateFolder` unchanged |
| [move_to_folder_modal.tsx](client/src/components/products/move_to_folder_modal.tsx) | options become `folderPathOptions` (D15); "General" → **"No folder"**; the inline "create new folder" path creates it in the **current location** (pass `parentId` in) |
| [product_settings.tsx](client/src/components/products/product_settings.tsx) | same path options, same "No folder" wording |
| [DeckSelector.tsx](client/src/components/copilot/ai_tools/DeckSelector.tsx) | its folder filter options become paths |
| [format_products_list_for_ai.ts](client/src/components/copilot/ai_tools/tools/_internal/format_products_list_for_ai.ts) | prints the folder **path**; `No folder` when null |
| [lib/translate/common.ts](lib/translate/common.ts) | add `TC.noFolder` (`en: "No folder"`), used by the three surfaces above |

---

## 5. The list view — `client/src/components/products/list_view.tsx`

Hand-built, and this is a **sanctioned exception** to `PROTOCOL_UI_COMPONENTS`
rule 4 ("tables use `Table`"), under rule 3 (custom when panther has no
equivalent): `Table` is a data grid with its own header and sorting semantics,
while this is a navigation surface whose rows open editors, reveal per-row
menus, mix two entity kinds, and must not read as data. Compose it from panther
parts (`Icon`, `Badge`, `Checkbox`, `Button`) and panther tokens only.

**One CSS grid for the header row and every body row**, so they cannot drift:

```text
grid-cols-[2rem_minmax(12rem,3fr)_7rem_minmax(8rem,1fr)_8rem_9rem_2.5rem]
   ↑select  ↑name  ↑type  ↑package  ↑area  ↑updated  ↑menu
```

| Column | Product row | Folder row |
| --- | --- | --- |
| Select | `Checkbox`, revealed on row hover or whenever selected; at rest the cell shows the type icon | always the `folder` icon in the folder's colour |
| Name | label, `truncate`; while searching, a second muted line with the full path | label, `font-700`; path line while searching |
| Type | "Deck" / "Report" (`productTypeLabel`) | "Folder" |
| Package | package label (see below) | "2 folders · 5 products" |
| Area | scope badge; "National" when `adminArea2` is null | empty |
| Updated | `new Date(lastUpdated).toLocaleDateString()` | same, from `folder.lastUpdated` |
| Menu | `moreVertical` `Button`, revealed on hover/focus | same |

The package label helper currently lives inside
[product_card.tsx](client/src/components/products/product_card.tsx) — export it
(or move it beside `productTypeLabel`) rather than writing a second copy. It
falls back to "Unlisted package" when the product's `runId` is not in
`instanceState.readyPackages`; keep that behaviour.

**Interaction**

- Product row click → `selection.handleClick(product.id, e, () => openProduct(product))`
  (plain opens, modifiers select/range).
- Folder row click → navigate in; modifiers do nothing (D3).
- Checkbox → toggles that product only (panther's `Checkbox` gives no
  MouseEvent, so range-select lives on the row).
- Right-click and the `moreVertical` button → the same menu builder.
- Background click clears the selection, as the grid does.
- Header row: `sticky top-0` on `bg-base-100`, `ui-text-caption`; **Name** and
  **Last updated** are buttons writing `productsSortMode` and showing which is
  active (D6). No other column is sortable.

**Styling** (`PROTOCOL_UI_STYLING`, no exceptions taken)

- Row rest/hover: `ui-hoverable-base-100`. **Never** stack a `bg-*` utility on a
  family class — the utility wins and the states die.
- Selected row: `bg-primary-subtle` + `border-primary` — the one sanctioned
  `-subtle` use, a selection control's selected surface.
- `border-b` between rows, `ui-pad-sm` per cell, `ui-gap-sm` inside cells.
- Muted text via `ui-text-caption` / `text-base-content-muted`. No arbitrary
  values, no off-scale weights (only `font-400` / `font-700` exist).
- Rows are `role="button"`, `tabindex="0"`, `ui-focusable`, with Enter/Space
  activating — mirror how panther's clickable `Card` does it.

**View toggle** — icon-only `ButtonGroup` with `layoutGrid` and `clearAll`, each
carrying `labelText` for the accessible name, `data-tour="products-view-mode"`.

---

## 6. The grid view

Unchanged for products (`ProductCard` keeps its current look; only its
`data-tour` becomes `products-item`). Folder tiles are §4.6, rendered before the
products in the same grid container.

**Empty states** — one `Switch`, replacing today's:

| Where | Message |
| --- | --- |
| Searching, no match | today's "No matching products" |
| Root, no folders and no products, `canEditProducts()` | today's "Start here" card |
| A location with folders but no products | "No products here yet" |
| An empty folder | "This folder is empty" + a line pointing at the move menu |

---

## 7. Tours, copilot, docs

**Anchor renames** (update both the components and
[client/src/onboarding/tours.ts](client/src/onboarding/tours.ts)):

| Old | New |
| --- | --- |
| `products-folders` (sidebar) | **deleted** |
| `products-grid` | `products-items` (either view) |
| `products-product-card` | `products-item` — carried by the product card **and** the list row, so the deferred cards tour finds a target in either mode |
| — | `products-new-folder` (header button), `products-view-mode` (toggle), `products-breadcrumb` |

Also update the DOM probe at
[client/src/onboarding/index.ts:77](client/src/onboarding/index.ts#L77) and add
`productsOpenFolder` + `productsViewMode` to the `watch` list there (replacing
`productsSelectedFolder`).

**`buildProductsIntroTour`** — rewrite the "Browse by folder" step against
`products-items` / `products-breadcrumb`: folders and products share one view,
click a folder to go in, use the breadcrumb to come back out, folders can hold
folders. Add a step on `products-view-mode` for grid vs list.

**`buildProductsCreateTour`** — retarget the "Organise with folders" step from
the sidebar to `products-new-folder`, and rewrite its body around the tile/row
menu and "Move into".

**Copilot** — no tool changes. `format_products_list_for_ai` prints paths (§4.7),
and [build_system_prompt.ts](client/src/components/copilot/build_system_prompt.ts)
lines 58 and 92 gain the word "nested" where they describe filing.

**Docs — required, not optional.**

- [SYSTEM_12](SYSTEM_12_documents_sharing.md): rewrite "The Products page" to
  the explorer model; rewrite the Contract's "Folders are flat, few, and have no
  GET route" sentence (they nest via `parent_id`, cycles are refused
  server-side, delete reparents one level); record D9–D17. State plainly that
  this **overturns D1 of [PLAN_PRODUCTS_RESTRUCTURE.md](PLAN_PRODUCTS_RESTRUCTURE.md)**
  (folders were ruled flat there; that ruling is superseded).
- [SYSTEM_02](SYSTEM_02_persistence.md): the new migration in the chain.
- [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md): the `Folder` field list gains
  `parentId`.
- The `globs:` manifests already cover every path this plan touches, but run
  `lint:systems` (part of `deno task typecheck`) to confirm after adding files.

---

## 8. Non-goals — do not build these

Drag-and-drop; cut/paste move; nested products (a product lives in exactly one
folder); folder sharing or permissions; a trash or undo; recursive counts;
inline rename in a row; a batch action bar; a persistent tree sidebar; any
change to the Explore tab; any new route beyond §3.

---

## 9. Commit order and gates

Gates for every commit: `deno task typecheck` (server + client +
`lint:systems`). Additionally `./validate_migrations` from commit 1 onward, and
`./validate_protocols` before the last. `./validate_queries` is unaffected but
runs before the final commit anyway, since the branch is shared with other work
— check `git status` for files outside this plan's scope before staging, and do
not fix errors that are not yours.

Each commit typechecks on its own — the order below is what makes that true, so
keep it.

1. **Nesting, server side** — migration, base schema, DB types, `Folder.parentId`,
   registry bodies, `createFolder`/`updateFolder` (+ cycle guard),
   `deleteFolder` (reparent). Prove it with §3.6's harness.
2. **Client state** — §4.1 rename + new signal, dead-code deletion. The existing
   sidebar keeps working against the renamed signal.
3. **Tree helpers and menus** — `folder_tree.ts`, `product_menu.ts`,
   `folder_menu.ts` with D14's entries. `index.tsx` switches its existing
   product and folder context menus over to the builders; the sidebar is still
   there and still works.
4. **The explorer** — sidebar removal, `folder_card.tsx`, the location model,
   breadcrumb, empty states, the folder tile/row menus in place.
5. **Pickers** — `folderPathOptions` through the three folder pickers and the AI
   surfaces; `TC.noFolder`.
6. **The list view** — `list_view.tsx` + the view toggle.
7. **Tours** — anchors, the two rewritten tours, the onboarding watch list.
8. **Docs** — SYSTEM_12, SYSTEM_02, PROTOCOL_APP_STATE.

When all gates are green the work is done: delete this plan file in the final
commit.

---

## Appendix A — the established practice this design follows

Read for the reasoning. Nothing here is a dependency; no third-party code is
used.

**A.1 Storage.** The four canonical models are adjacency list, materialized path
(`ltree`), closure table and nested sets. The consistent recommendation is to
start with the adjacency list and layer another model only as a read
optimization when descendant queries are a measured bottleneck. What decides it
here: adjacency list makes re-parenting a single-column update, while the others
make it a subtree rewrite, a row-set rewrite, or a whole-table renumber.
Recursive CTEs removed the historical reason to avoid it. `ltree`'s documented
weak spot is exactly our workload — "less great for updating large subtrees",
plus a GIST index size limit on deeply nested paths.

**A.2 Breadcrumbs.** Windows `BreadcrumbBar`, GNOME and Adobe Spectrum converge
on: truncate rather than wrap; keep the root visible while collapsing the
middle; make a truncated label recoverable via tooltip. Breadcrumbs indicate
hierarchy, not history.

**A.3 Delete semantics.** Systems without a trash document the same pattern:
reparent children before removing the parent; cascade is for systems with a
restore path. Users often expect file-manager-style subtree deletion — that
expectation is only safe where a trash exists.

**A.4 Tree UI.** The lesson from tree components built for large trees
(react-arborist is the reference) is architectural: separate the data model from
the render model — keep the hierarchy as data and derive a flattened list of
visible rows, rather than recursively rendering nested stateful components. Our
explorer renders one level at a time, so the flattening is trivial; the pattern
still governs the picker's path list.

**A.5 Moving without drag-and-drop.** The two established mouse-free patterns
are the navigable move dialog (Drive — better than DnD for deep targets, which
is D15's argument) and cut/paste (Windows Explorer, VS Code — keyboard
accessible, weakness is remembering what is on the clipboard). D14 is the third
and cheapest: no drag layer, no clipboard, at the cost of one hop at a time.

### Sources

[Hierarchical models in PostgreSQL (Ackee)](https://www.ackee.agency/blog/hierarchical-models-in-postgresql) ·
[ltree vs adjacency list vs closure table (dev.to)](https://dev.to/dowerdev/implementing-hierarchical-data-structures-in-postgresql-ltree-vs-adjacency-list-vs-closure-table-2jpb) ·
[SQL Antipatterns: alternative tree models (Educative)](https://www.educative.io/courses/sql-antipatterns-database-programming/solution-use-alternative-tree-models) ·
[PostgreSQL ltree](https://www.postgresql.org/docs/current/ltree.html) ·
[PostgreSQL WITH queries / CYCLE clause](https://www.postgresql.org/docs/current/queries-with.html) ·
[CYCLE clause guide (Mamezou)](https://developer.mamezou-tech.com/en/blogs/2025/01/17/cycle-postgres/) ·
[BreadcrumbBar (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/breadcrumbbar) ·
[Breadcrumbs (Adobe Spectrum)](https://spectrum.adobe.com/page/breadcrumbs/) ·
[Breadcrumbs (GNOME)](https://wiki.gnome.org/Design/OS/Breadcrumbs) ·
[Breadcrumb pattern (UX Patterns for Developers)](https://uxpatterns.dev/patterns/navigation/breadcrumb) ·
[Tree View pattern (W3C ARIA APG)](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) ·
[react-arborist](https://github.com/mafin1799/react-arborist) ·
[Deleting folders with content (Oracle)](https://docs.oracle.com/cd/E60665_01/related-docs/OEPMA/ch04s13s04s02.html) ·
[Moving files using cut and paste (Oracle CDE)](https://docs.oracle.com/cd/E19504-01/802-6499/6ia6efpn2/index.html)
