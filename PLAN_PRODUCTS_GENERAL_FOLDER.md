# PLAN: The product explorer shows root products under "General"

Status: ruled 2026-09-29, not built.

The Products page lists root-level products (those with `folderId: null`)
loose at the top level, after the root folders. This plan groups them under
one folder row named **General**. General is a presentation of the root, not
a stored folder: no row is created, no product is rewritten, the server does
not change. Delete this file when the last review passes.

**Next step: Do 1**

Branch: `version2`. Repos: this app only. Read first: `CLAUDE.md`,
`SYSTEMS.md`, `SYSTEM_12_documents_sharing.md` ("The product explorer" and
the menu paragraphs that follow it), then §2, §3, §4 and §8 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_PRODUCTS_GENERAL_FOLDER.md."
- Branch: `version2`, not the `tim-branch` the app protocol names. Confirm
  with `git branch --show-current`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the schema, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 1.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_12_documents_sharing.md`, §2 and §3 here, its own section in §4,
  and §8.

## 1. The problem

The tree is derived by `productTreeRows` in
`client/src/components/products/_shared/folder_tree.ts`: at each level the
folders, then the products of that level, and at the root those products
are the ones whose `folderId` is null. They render as depth-0 rows between
and below the folder rows, with nothing to say they belong together, and
they are the only items in the list that no folder holds.

The root is already a place in every product operation, always under a
different name:

- "No folder", the first option of the move picker
  (`move_to_folder_modal.tsx`) and of product settings
  (`_shared/product_settings.tsx`).
- "Move to top level" in both menus (`product_menu.ts`,
  `buildQuickMoveEntries`).
- "Top level", the destination named when a folder is deleted
  (`folder_labels.ts`, used by `products.tsx` `handleDeleteFolder`).
- "New items go at the top level" in the create tour step
  (`client/src/onboarding/tours.ts`).

## 2. The model

- **The root** is where products with `folderId: null` and folders with
  `parentId: null` live. Storage, routes, `deleteFolder` reparenting and
  `createProduct` are unchanged: null still means the root.
- **General** is the root, drawn as a folder row, holding the root products
  only. Root folders are its siblings, not its children. It is one row, at
  the root, and nowhere else: a folder that holds both subfolders and
  products keeps showing them directly under it, exactly as today.
- General is a **synthetic row**, identified in the client by one sentinel
  id exported from `folder_tree.ts`. It has no `Folder` object, no colour,
  no dates, no menu. Its only behaviour is open and close.
- Wherever the UI names the root as a product destination, the name is
  **General**. Where it names the root as a folder destination, the name
  stays "top level", because folders do not go into General.

## 3. Rulings

1. General is presentation only. No migration, no schema change, no server
   change, no change to `ProductBase.folderId` or `Folder.parentId`.
2. General exists once, at the root. Nested folders are untouched.
3. General is placed after the root folders, in the position the loose
   products already hold. _(proposed)_
4. General is not shown when it would hold no product row, including during
   a search that matches none of the root products. The picker and product
   settings still offer General so that products can be moved there.
   _(proposed)_
5. General is opened and closed like any folder: click, Enter, Space, the
   arrow keys, and the expand-all and collapse-all button. It is open by
   default. General is not a folder, so its state is not in the saved
   folder set: it is one saved boolean in `state/t4_ui.ts`, closed only
   when the user closed it. The folder set and the effect that prunes
   deleted folder ids from it are untouched. During a search, the search
   toggle set handles the sentinel like any folder id.
6. General has no menu. Right-click and the row's menu button do nothing on
   it. It cannot be renamed, recoloured, moved or deleted. _(proposed)_
7. During a search, a matching root product opens General, the same way a
   matching product opens the folders above it.
8. Labels. In the move picker and in product settings, "No folder" becomes
   "General". In the product menu, "Move to top level" becomes "Move to
   General". In the folder menu, "Move to top level" stays. Translations:
   en "General", fr "Général", pt "Geral".
9. The delete-folder confirmation for a folder at the root says that its
   subfolders move to the top level and its products move to General. For a
   nested folder it is unchanged and names the parent for both. _(proposed)_
10. Two tour texts are rewritten to name General: the "folders" step of the
    browse tour, which describes the list, and the "new" step of the create
    tour, which says where new items go.
11. A user may still create a root folder labelled "General". It is a
    normal folder, shown beside the synthetic one, never merged with it.
    _(proposed)_
12. `folder_tree.ts` stays type-import-only, so `server/tests/folder_tree_test.ts`
    keeps loading it under Deno as it is. The label is applied in the view,
    not in the derivation.

## 4. Steps

### Step 1: General in the tree, the labels, the docs

**Surface.**

- `client/src/components/products/_shared/folder_tree.ts`
- `client/src/components/products/_shared/mod.ts`
- `client/src/components/products/list_view.tsx`
- `client/src/components/products/products.tsx`
- `client/src/components/products/product_menu.ts`
- `client/src/components/products/folder_menu.ts`
- `client/src/components/products/folder_labels.ts`, which moves to
  `client/src/components/products/_shared/folder_labels.ts`
- `client/src/components/products/move_to_folder_modal.tsx`
- `client/src/components/products/_shared/product_settings.tsx`
- `client/src/onboarding/tours.ts`
- `client/src/state/t4_ui.ts`
- `server/tests/folder_tree_test.ts`
- `SYSTEM_12_documents_sharing.md`
- this file (§8 and the Next step line only)

**Deliverable.**

- `folder_tree.ts` exports the sentinel id and a `ProductTreeRow` variant
  for General. `productTreeRows` emits, at the root, the folder rows, then
  the General row when the root has product rows to show, then those
  product rows at depth 1 when General is open (rulings 2, 3, 4).
  `buildProductTree` adds the sentinel to `matchAncestors` when a root
  product matches (ruling 7).
- `list_view.tsx` renders the General row with the chevron, the folder
  type cell, the General label, and empty package, scope, date and menu
  cells. The open, close and keyboard handling is the folder row's. There
  is no context menu and no menu button (rulings 5, 6).
- `t4_ui.ts`: a saved boolean for General closed, default open, beside the
  folder set (ruling 5).
- `products.tsx`: outside a search, the sentinel reads and writes that
  boolean and every other id the folder set; expand-all opens General and
  collapse-all closes it when General is shown; `openableFolderIds` counts
  it (ruling 5). The delete-folder confirmation follows ruling 9.
- `folder_labels.ts` moves to `_shared/` and is exported from
  `_shared/mod.ts`: `product_settings.tsx` lives there, and `_shared/` never
  imports upward (PROTOCOL_UI_STRUCTURE, entry-only and cycle rules). It
  exports the General label and the top-level label (rulings 8, 9).
- `buildQuickMoveEntries` in `product_menu.ts` takes the root destination's
  label from its caller: the product menu passes General, so its entry reads
  "Move to General"; `folder_menu.ts` passes the top-level label, so its
  entry still reads "Move to top level" (ruling 8).
- `move_to_folder_modal.tsx` and `product_settings.tsx`: the null option is
  labelled General (ruling 8).
- `tours.ts`: the two texts of ruling 10, in all three languages.
- `folder_tree_test.ts`: the row tests expect the General row, the depth-1
  root products under it, its absence when the root holds no product, and
  its presence in `matchAncestors` for a matching root product.
- `SYSTEM_12_documents_sharing.md`: the "product explorer", list, menu and
  create paragraphs describe General as this plan's §2 does. The moved
  `folder_labels.ts` stays inside the manifest's `products/*.ts` and
  `products/_shared/*.ts` globs, so the manifest is unchanged.

**Not in this step.** Anything server-side. A stored General folder. A
General inside nested folders. Drag-and-drop. Merging a user folder named
"General" with the synthetic one.

**Gates.** The floor. `deno test -A --env-file server/tests/folder_tree_test.ts`
is part of `deno task test` and must cover the four expectations above.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| The floor | Step 1 |
| `folder_tree_test.ts` covers the General row | Step 1 |

## 6. Out of scope

- A real `folders` row for General, and the migration and the
  "a product always has a folder" invariant it would need.
- Renaming, colouring, moving or deleting General.
- A General row inside any folder other than the root.
- Changing where new products are created. They are still created at the
  root, which now shows as General.
- Help-button text (`lib/help/help_targets.generated.ts` is generated from
  an external source).

## 7. Rollout and rollback

Client only, no data change. Ships with the next ordinary deploy after the
step's review passes. Rollback is reverting the one commit.

## 8. Build log

| Step | Row |
| --- | --- |
