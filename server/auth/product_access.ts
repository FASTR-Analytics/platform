import {
  canUseScope,
  type Folder,
  type GlobalUser,
  type ProductAccess,
  type ProductAccessLevel,
  type ProductLevel,
  productLevelAtLeast,
  productLevelFor,
  type ScopeId,
  type ScopeUuid,
} from "lib";
import type { Sql } from "postgres";
import {
  getProductLevelRows,
  getProductLevelRowsInScopes,
} from "../db/products/products.ts";

// The ids a product or folder route acts on, resolved by requireProductAccess
// from the fields the route declares (path product_id / folder_id; body
// productIds, targetProductId, folderId, parentId, scopeId) and nowhere else.
// `productIds` are the subjects (path product_id, body productIds), which
// need the declared level; `destinationProductIds` are the products a route
// writes into (body targetProductId), which always need edit. `folderIds`
// are the folders acted on (a folder route) or named as a destination (a
// product route). `folderRoute` is true for a route on the folders
// themselves, which declare folder_id or parentId and no product id.
export type ProductAccessTargets = {
  productIds: string[];
  destinationProductIds: string[];
  folderIds: string[];
  scopeIds: ScopeId[];
  folderRoute: boolean;
};

// The one product-access policy. A global admin owns every product and is
// unrestricted, so passes with no query. Folders carry no level: a folder route
// passes for every approved unrestricted user, except one declaring own, which
// only a global admin passes because nobody else owns a folder; a restricted
// user is refused every folder route. Every named scope must be one the user
// holds. Each subject needs the declared level and each destination edit, both
// through holdsProductLevel, in one query. A restricted user may name as a
// destination folder only the root or a folder they can see. An id that names
// no row passes here and fails in the handler.
export async function productAccessPolicy(
  mainDb: Sql,
  user: GlobalUser,
  level: ProductAccessLevel,
  targets: ProductAccessTargets,
): Promise<boolean> {
  if (!user.approved) return false;
  if (user.isGlobalAdmin) return true;
  const access = user.scopeAccess;
  if (targets.folderRoute) return access.all && level !== "own";
  if (!targets.scopeIds.every((id) => canUseScope(access, id))) return false;
  const productIds = [
    ...targets.productIds,
    ...targets.destinationProductIds,
  ];
  if (productIds.length > 0) {
    const rows = new Map(
      (await getProductLevelRows(mainDb, productIds, user.email)).map(
        (row) => [row.productId, row],
      ),
    );
    const allows = (required: ProductLevel) => (id: string) => {
      const row = rows.get(id);
      return row === undefined ||
        holdsProductLevel(user, row.scopeId, row.access, required);
    };
    if (
      !targets.productIds.every(allows(level)) ||
      !targets.destinationProductIds.every(allows("edit"))
    ) {
      return false;
    }
  }
  if (!access.all && targets.folderIds.length > 0) {
    const visible = await visibleFolderIdsForUser(
      mainDb,
      user,
      access.scopeIds,
    );
    if (!targets.folderIds.every((id) => visible.has(id))) return false;
  }
  return true;
}

// A user holds a level on a product when they hold its scope (an
// unrestricted user holds every scope) and productLevelFor reaches the level:
// scope and level are both required, the owner included. Seeing a product
// is holding view.
export function holdsProductLevel(
  user: Pick<GlobalUser, "email" | "isGlobalAdmin" | "scopeAccess">,
  scopeId: ScopeId,
  access: ProductAccess,
  required: ProductLevel,
): boolean {
  return canUseScope(user.scopeAccess, scopeId) &&
    productLevelAtLeast(productLevelFor(access, user), required);
}

// What a connection that is not a global admin sees of the folders: a folder
// whose subtree holds a product it can see, or one it created (so a new,
// empty folder stays with its maker). The visible set is every folder on the
// path from such a product or folder to the root.
export function visibleFolderIds(
  folders: Pick<Folder, "id" | "parentId" | "createdBy">[],
  visibleProductFolderIds: (string | null)[],
  viewerEmail: string,
): Set<string> {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const visible = new Set<string>();
  const starts = [
    ...visibleProductFolderIds,
    ...folders.filter((f) => f.createdBy === viewerEmail).map((f) => f.id),
  ];
  for (const start of starts) {
    let id = start;
    while (id !== null && parentOf.has(id) && !visible.has(id)) {
      visible.add(id);
      id = parentOf.get(id) ?? null;
    }
  }
  return visible;
}

// The folders a restricted user can see: those whose subtree holds a product
// the user can see, by scope and level.
async function visibleFolderIdsForUser(
  mainDb: Sql,
  user: GlobalUser,
  scopeIds: ScopeUuid[],
): Promise<Set<string>> {
  const [folders, products] = await Promise.all([
    mainDb<
      { id: string; parent_id: string | null; created_by: string | null }[]
    >`
      SELECT id, parent_id, created_by FROM folders
    `,
    getProductLevelRowsInScopes(mainDb, scopeIds, user.email),
  ]);
  return visibleFolderIds(
    folders.map((f) => ({
      id: f.id,
      parentId: f.parent_id,
      createdBy: f.created_by,
    })),
    products
      .filter((row) => holdsProductLevel(user, row.scopeId, row.access, "view"))
      .map((row) => row.folderId),
    user.email,
  );
}
