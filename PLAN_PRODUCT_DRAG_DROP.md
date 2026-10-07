# PLAN: Drag and drop in the product explorer

Status: written 2026-10-06 from the chat ruling of the same day (rows drag onto
folders, the sticky header becomes the top-level target during a drag, a small
`moveFolder` route). Nothing is built.

The product explorer moves a product or a folder only through its menu. This
plan adds dragging: a row dropped on a folder row moves into that folder, a
product dropped on General moves to the root, and the list's sticky header turns
into a "Move to top level" target while a drag is in progress. Folder moves get
their own route, `moveFolder`, which writes only the parent, and `updateFolder`
narrows to label and colour, so a rename and a move can no longer undo each
other.

**Next step: Do 1**

- Repo: `wb-fastr-v2`, the worktree at
  `/Users/timroberton/projects/apps/wb-fastr-v2`, on branch `version2`. Never
  the `wb-fastr` checkout, which is `tim-branch`. No other repo is touched.
- Read first: `CLAUDE.md`, `SYSTEMS.md`,
  [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) ("The
  products registry on `main`", and the paragraphs from "**The product
  explorer**" to the end of the Slide decks section),
  [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md),
  `panther/protocols/PROTOCOL_UI_STYLING.md` (rules 10 and 13),
  `panther/protocols/PROTOCOL_UI_SOLIDJS.md`.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's bindings are
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan binds them as follows.

- Instruction: "Do the next step of PLAN_PRODUCT_DRAG_DROP.md."
- Repo and branch: `wb-fastr-v2` at
  `/Users/timroberton/projects/apps/wb-fastr-v2`, branch `version2`. Every
  session runs there, confirms both with `git rev-parse --show-toplevel` and
  `git branch --show-current`, and commits there.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the query engine, the extract or help
  text (the help buttons read the documentation site, not the tours), so no
  conditional gate applies.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, SYSTEM_12, §2 and §3 of
  this plan, the step's own section in §4, and §8.
- Vocabulary is §2.1 and is used in code, prose and commit messages.
- Every user-facing string is `en`, `fr` and `pt`.
- `deno fmt` before every commit, this file included.
- Browser verification is Tim's and appears nowhere below.

## 1. The problem

1. Moving is menu-only.
   [product_menu.ts:8](client/src/components/products/product_menu.ts#L8) says
   "There is no drag-and-drop, so these are the only way to move anything", and
   SYSTEM_12 says the same. A product three folders away from its destination
   takes the menu, "Move to folder…", a picker of full paths, and Save.
2. `updateFolder` writes label, colour and parent in one body
   ([lib/api-routes/products/folders.ts:25](lib/api-routes/products/folders.ts#L25),
   [server/db/products/folders.ts:68](server/db/products/folders.ts#L68)), so
   every caller sends back values it read earlier: the quick moves send the
   label and colour the row held
   ([products.tsx:313](client/src/components/products/products.tsx#L313)), the
   picker sends them as they were when it opened
   ([move_to_folder_modal.tsx:53](client/src/components/products/move_to_folder_modal.tsx#L53)),
   and the edit modal sends back the parent as it was when it opened
   ([edit_folder_modal.tsx:55](client/src/components/products/edit_folder_modal.tsx#L55)).
   A rename and a move that overlap undo one another with no error. Dragging
   makes moves cheap, so they will overlap more often.

## 2. The model

### 2.1 Vocabulary

- **Drag item**: the product or folder being dragged, by id, with its current
  parent and, for a folder, its subtree.
- **Drop target**: a folder row, the General row, or the root zone.
- **Root zone**: the list's sticky header row while a drag is in progress whose
  item is not already at the root. It shows the menus' root label for the item's
  kind and accepts a drop like a row.
- **Drop parent**: the parent a drop gives the drag item: a folder id, or `null`
  for the root. `undefined` marks a refused drop.

### 2.2 The rule

In `client/src/components/products/_shared/folder_tree.ts`, which stays
type-import-only so its test loads under Deno:

```ts
export type DragItem =
  | { kind: "product"; id: string; parentId: string | null }
  | {
    kind: "folder";
    id: string;
    parentId: string | null;
    subtree: ReadonlySet<string>;
  };

export type DropTarget =
  | { kind: "folder"; folderId: string }
  | { kind: "general" }
  | { kind: "root" };

// Built once, when the drag starts: dragover fires many times a second, and
// the subtree walk must not run on each.
export function folderDragItem(folders: Folder[], folder: Folder): DragItem;

export function dropParent(
  item: DragItem,
  target: DropTarget,
): string | null | undefined {
  const parent = target.kind === "folder" ? target.folderId : null;
  if (parent === item.parentId) return undefined;
  if (item.kind === "product") return parent;
  if (target.kind === "general") return undefined;
  if (parent === item.id || (parent !== null && item.subtree.has(parent))) {
    return undefined;
  }
  return parent;
}
```

### 2.3 The routes

| Route          | Path                             | Body                                                  | Writes                           |
| -------------- | -------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `moveFolder`   | `PUT /folders/:folder_id/parent` | `{ parentId: z.uuid().nullable() }`                   | `parent_id`, `last_updated`      |
| `updateFolder` | `PUT /folders/:folder_id`        | `{ label: z.string(), color: z.string().nullable() }` | `label`, `color`, `last_updated` |

Both are `access: "edit"` and respond `{ lastUpdated: string }`. Both declare
`folder_id`, so `resolveProductAccessTargets`
([userPermission.ts:116](server/middleware/userPermission.ts#L116)) classes both
as folder routes and a restricted user is refused both, as today. The
recursive-CTE cycle check moves from `updateFolder` to `moveFolder` unchanged,
and `FOLDER_CYCLE` keeps its text. Both throw `FOLDER_NOT_FOUND` when the
`UPDATE ... RETURNING id` matches nothing. Every folder move calls `moveFolder`:
the menu's quick moves, the picker, and a drop.

### 2.4 The list

`list_view.tsx` owns the transient drag state: the drag item, the hovered drop
target, and the hover-open timer. `products.tsx` owns who may drag, the move
calls and opening folders, and passes them in:

```ts
canDrag: (row: ProductTreeRow) => boolean;
// Called only at dragstart, so only for a row canDrag accepted.
dragItem: (
  row: Extract<ProductTreeRow, { kind: "product" | "folder" }>,
) => DragItem;
onMove: (item: DragItem, parentId: string | null) => void;
// Adds to the open set and never removes. GENERAL_ID opens General.
onOpenFolder: (folderId: string) => void;
```

Behaviour:

1. A product row or folder row the user may move (R6) is `draggable`. General
   never is.
2. `dragstart` calls `setData` with the type `application/x-fastr-product-tree`
   (Firefox starts no drag without data), sets `effectAllowed = "move"` and sets
   the drag image (R11), whose chip content is written before `setDragImage`
   reads it and which sits off screen. It stores `dragItem(row)` in a
   `setTimeout(0)`, after the handler returns: Chrome and Safari abort a drag
   whose source is no longer under the pointer when `dragstart` returns, and
   storing the item redraws the header above the row (item 4).
3. One `dragover` handler and one `drop` handler on the list's scroll container
   resolve the target from the nearest element carrying `data-drop-target`
   (folder rows, the General row and the root zone). Delegating avoids the
   flicker of per-row `dragenter` and `dragleave` as the pointer crosses a row's
   children. When `dropParent` is defined, the handler calls `preventDefault`,
   sets `dropEffect = "move"`, and marks the target hovered. Otherwise the
   target is cleared and the browser shows its no-drop cursor. Leaving the
   container clears the hovered target.
4. The header row becomes the root zone (R2) when `dropParent(item, root)` is
   defined: its cells are replaced by one cell spanning the grid, with the
   folder icon and `moveToRootLabel(item.kind)` (R12), at the header's own
   height so no row moves. When the item is already at the root, the header
   stays as it is.
5. A closed folder row with contents, or a closed General row, opens after
   `_HOVER_OPEN_MS = 600` of hovering, through `onOpenFolder` (R7). This applies
   whether or not the row is itself a legal target, because a product's own
   folder is refused while its subfolders are not. The dragged folder and its
   subtree never open.
6. `drop` calls `onMove(item, parent)`, then `onOpenFolder` for a folder or
   General target (R8), then ends the drag.
7. The drag ends on `drop`, on `dragend`, or on the first window `pointermove`
   after `dragstart` (R10). Ending clears the item, the target and the timer.

### 2.5 Files, end state

- `lib/api-routes/products/folders.ts`: `moveFolder`, the narrowed
  `updateFolder`, the comment naming which route writes what.
- `server/db/products/folders.ts`: `moveFolder` with the cycle check;
  `updateFolder` without it.
- `server/routes/products/folders.ts`: the `moveFolder` handler.
- `client/src/components/products/_shared/folder_tree.ts`: §2.2.
- `client/src/components/products/_shared/folder_labels.ts`:
  `moveToRootLabel(kind: "product" | "folder")`.
- `client/src/components/products/list_view.tsx`: §2.4.
- `client/src/components/products/products.tsx`: the four props, and
  `quickMoveFolder` over `moveFolder`.
- `client/src/onboarding/tours.ts`: the "Browse by folder" step (R13).

## 3. Rulings

- **R1 Native HTML drag events.** `draggable`, `dragstart`, `dragover`, `drop`,
  `dragend`. Not the vendored SortableJS: it reorders lists, and this list's
  order is the sort mode's, so there is nothing to reorder. No new dependency.
  (Tim, 2026-10-06.)
- **R2 The drop targets** are a folder row (into it), the General row (to the
  root, products only), and the root zone (to the root). The sticky header is
  the top-level target. (Tim, 2026-10-06.) It is also the root target for a
  product, labelled "Move to General", because General is shown only when the
  root already holds a product, so without the root zone the first product could
  not be dragged to the root. _(proposed)_
- **R3 Refused drops** are the ones `dropParent` returns `undefined` for: the
  item's own parent, General for a folder, a folder itself and its subtree. The
  server's `FOLDER_CYCLE` stays the authority.
- **R4 `moveFolder`** as §2.3: its own route, which writes only the parent.
  (Tim, 2026-10-06; path and body _(proposed)_.)
- **R5 `updateFolder` writes label and colour only**, and loses `parentId` from
  its body. Each write carries only what it changes, so neither a rename nor a
  move can undo the other. The edit modal stops sending the parent. _(proposed)_
- **R6 Who may drag** follows the menus: a product when
  `canEditProduct(product.id)`, a folder when `canEdit()`. _(proposed)_
- **R7 Hover opens** a closed folder after 600 ms, into the same open set a
  click writes (the saved set, or the search toggles during a search), so it
  stays open after the drag. _(proposed)_
- **R8 A drop opens its target**, so the moved item stays in view. Dropping into
  an empty folder adds it to the open set, and it shows open once the move
  arrives. _(proposed)_
- **R9 No optimistic move.** The row moves when the live update arrives, as for
  a menu move. A refused move shows through `openAlert`, as the quick moves do.
  _(proposed)_
- **R10 The drag ends however it ends.** `<Index>` keys rows by position and
  `<Switch>` replaces a row's element when the kind at that position changes, so
  a folder opening above the dragged row mid-drag can detach the source element,
  and a `dragend` on a detached element reaches no ancestor and is not fired by
  every browser. Browsers send no pointer events during a native drag, so the
  first window `pointermove` after `dragstart` marks its end. _(proposed)_
- **R11 Visuals.** The hovered legal target, row or root zone, takes
  `ring-2 ring-inset ring-primary`. Not a `-subtle` wash: PROTOCOL_UI_STYLING
  rule 10 bans washes as a hover destination. The drag image is a compact chip
  with the row's icon and label, set through `setDragImage`, in place of the
  browser's snapshot of the full six-column row. _(proposed)_
- **R12 One root label.** The two "Move to …" strings in `product_menu.ts` and
  `folder_menu.ts` move to `moveToRootLabel(kind)` in `folder_labels.ts`, which
  both menus and the root zone read. _(proposed)_
- **R13 The tour says so.** The "Browse by folder" step of the products tour
  ([tours.ts:769](client/src/onboarding/tours.ts#L769)) gains, in English: "To
  move a product or a folder, drag it onto the folder you want. To move it out
  of every folder, drag it onto the column headings at the top of the list."
  French and Portuguese follow the step's existing wording. _(proposed)_

## 4. Steps

### Step 1: `moveFolder`, and `updateFolder` narrowed

**Surface.** `lib/api-routes/products/folders.ts`,
`server/db/products/folders.ts`, `server/routes/products/folders.ts`,
`server/tests/products_routes_test.ts`,
`server/tests/scope_grants_routes_test.ts`,
`client/src/components/products/products.tsx`,
`client/src/components/products/move_to_folder_modal.tsx`,
`client/src/components/products/edit_folder_modal.tsx`,
`SYSTEM_12_documents_sharing.md`.

**Deliverable.**

- The registry entries of §2.3 (R4, R5), and the registry's comment rewritten to
  say which route writes what.
- `moveFolder(mainDb, folderId, parentId)` in the DB layer with the cycle check
  moved from `updateFolder`; `updateFolder(mainDb, folderId, { label, color })`
  without it. Both throw `FOLDER_NOT_FOUND` on a missing row.
- The `moveFolder` handler: `log("moveFolder")`, the DB call, `notifyFolders` on
  success, `respond`.
- `quickMoveFolder` and the picker's folder branch call `moveFolder`; the edit
  modal's `updateFolder` sends label and colour only. The comments in these
  three files that call the write "one metadata write" are rewritten.
- `products_routes_test.ts`: the cycle and self-cycle cases go to
  `PUT /folders/:id/parent`; a legal move is checked in the DB; `moveFolder` on
  a missing folder is a 404 with `FOLDER_NOT_FOUND`; a rename after a move
  leaves `parent_id` as the move set it (R5); the missing-folder update keeps
  its 404 with the narrowed body.
- `scope_grants_routes_test.ts`: the restricted user gets 403 from
  `PUT /folders/:id/parent`; the existing `updateFolder` 403 call drops
  `parentId`.
- SYSTEM_12: the `folders.ts` sentence under "The layer" (`moveFolder` is the
  move and holds the cycle check, `updateFolder` writes label and colour), the
  `FOLDER_NOT_FOUND` sentence names `moveFolder`, and the explorer's sentences
  on the picker and the edit modal describe the two routes.

**Not in this step.** Any drag, `list_view.tsx`, `folder_tree.ts`, the menus'
labels.

**Gates.** The floor.
`BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/products_routes_test.ts server/tests/scope_grants_routes_test.ts`.
`./run` reports every route implemented (`validateAllRoutesDefined`).

**Ends with.** One commit.

### Step 2: dragging

**Surface.** `client/src/components/products/_shared/folder_tree.ts`,
`client/src/components/products/_shared/folder_labels.ts`,
`client/src/components/products/_shared/mod.ts`,
`client/src/components/products/list_view.tsx`,
`client/src/components/products/products.tsx`,
`client/src/components/products/product_menu.ts`,
`client/src/components/products/folder_menu.ts`,
`server/tests/folder_tree_test.ts`, `client/src/onboarding/tours.ts`,
`SYSTEM_12_documents_sharing.md`.

**Deliverable.**

- §2.2 in `folder_tree.ts`, exported through `_shared/mod.ts`.
- `folder_tree_test.ts` covers `dropParent`: a product into another folder, into
  its own folder (refused), to General and to the root zone from a folder, to
  either from the root (refused); a folder into a sibling, into itself, into a
  descendant and into its own parent (all but the first refused), onto General
  (refused), to the root zone from a nested folder, and from the top level
  (refused). `folderDragItem` over the corrupted-cycle fixture terminates.
- `moveToRootLabel` in `folder_labels.ts`, read by both menus (R12).
- `list_view.tsx` and `products.tsx` as §2.4, with R6 to R11.
- The comment at
  [product_menu.ts:8](client/src/components/products/product_menu.ts#L8) no
  longer says the menus are the only way to move anything.
- The tour sentence of R13.
- SYSTEM_12: "There is no drag-and-drop" goes, and the explorer paragraphs
  describe dragging as built: the targets, the refused drops, the root zone,
  hover-open, open-on-drop, and how a drag ends.

**Not in this step.** §6.

**Gates.** The floor.
`deno test -A --env-file server/tests/folder_tree_test.ts`.

**Ends with.** Two commits, each green: the rule with its test and the shared
label; the list's dragging with the tour and SYSTEM_12.

## 5. Gates catalogue

| Gate                                                                                                                                              | First reached |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `deno task typecheck` (fmt check, both tiers, `lint:systems`, `lint:structure`, `lint:text-sizes`, `lint:sql-json`)                               | step 1        |
| `deno task test`                                                                                                                                  | step 1        |
| `./validate_protocols`                                                                                                                            | step 1        |
| `./run`                                                                                                                                           | step 1        |
| `BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/products_routes_test.ts server/tests/scope_grants_routes_test.ts` | step 1        |
| `deno test -A --env-file server/tests/folder_tree_test.ts`                                                                                        | step 2        |

## 6. Out of scope

- Dragging several items at once: the list has no selection.
- Moving by keyboard or on a touch screen: the menus stay the path for both.
- Reordering: the order is the sort mode's.
- Dragging from an editor, or between pages.
- A restricted user sees the folder menus and, after this plan, draggable
  folders, while the server refuses that user every folder route (R6 keeps the
  menus' gate). Gating both on scope access is its own change.
- The documentation site the help buttons read.

## 7. Rollout and rollback

Nothing ships before step 2's review passes. Step 1 changes `updateFolder`'s
body, so the client and server deploy together, which `./deploy_testing` and
`./deploy` already do. Rollback of either step is `git revert` of its commits:
there is no migration, no stored data, no cache-prefix change, and no new
localStorage key.

## 8. Build log

| Date       | Step | Row                                                                         |
| ---------- | ---- | --------------------------------------------------------------------------- |
| 2026-10-06 | plan | Written from the chat ruling of 2026-10-06. Next step: Do 1.                |
| 2026-10-07 | plan | §2.4: `dragItem` takes only a product or folder row (Tim). Next step: Do 1. |
