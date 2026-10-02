import {
  canUseScope,
  type Folder,
  type GlobalUser,
  type ProductAccessLevel,
  type ScopeId,
  type ScopeUuid,
} from "lib";
import type { Sql } from "postgres";

// The ids a product or folder route acts on, resolved by requireProductAccess
// from the fields the route declares (path product_id / folder_id; body
// productIds, targetProductId, folderId, parentId, scopeId) and nowhere else.
// `folderIds` are the folders acted on (a folder route) or named as a
// destination (a product route). `folderRoute` is true for a route on the
// folders themselves, which declare folder_id or parentId and no product id.
export type ProductAccessTargets = {
  productIds: string[];
  folderIds: string[];
  scopeIds: ScopeId[];
  folderRoute: boolean;
};

// The one product-access policy (PLAN_PRODUCTS_RESTRUCTURE D2, PLAN_SCOPES
// §2.6). Every approved unrestricted user is a full editor of every product
// and folder, so the level is not consulted. A restricted user may act only
// on products whose scope they hold, may name only a scope they hold (R14),
// may place a product only at the root or in a folder they can see, and may
// not create, change or delete a folder (R23). An id that names no row passes
// here and fails in the handler, as it does for an unrestricted user.
export async function productAccessPolicy(
  mainDb: Sql,
  user: GlobalUser,
  _level: ProductAccessLevel,
  targets: ProductAccessTargets,
): Promise<boolean> {
  if (!user.approved) return false;
  const access = user.scopeAccess;
  if (access.all) return true;
  if (targets.folderRoute) return false;
  if (!targets.scopeIds.every((id) => canUseScope(access, id))) return false;
  if (targets.productIds.length > 0) {
    const outside = await mainDb<{ id: string }[]>`
      SELECT id FROM products
      WHERE id = ANY(${targets.productIds})
        AND NOT (scope_id = ANY(${access.scopeIds}))
      LIMIT 1
    `;
    if (outside.length > 0) return false;
  }
  if (targets.folderIds.length > 0) {
    const visible = await visibleFolderIdsForScopes(mainDb, access.scopeIds);
    if (!targets.folderIds.every((id) => visible.has(id))) return false;
  }
  return true;
}

// R23: a folder is visible when its subtree holds a visible product, so the
// visible set is every folder on the path from such a product to the root.
export function visibleFolderIds(
  folders: Pick<Folder, "id" | "parentId">[],
  visibleProductFolderIds: (string | null)[],
): Set<string> {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const visible = new Set<string>();
  for (const start of visibleProductFolderIds) {
    let id = start;
    while (id !== null && parentOf.has(id) && !visible.has(id)) {
      visible.add(id);
      id = parentOf.get(id) ?? null;
    }
  }
  return visible;
}

async function visibleFolderIdsForScopes(
  mainDb: Sql,
  scopeIds: ScopeUuid[],
): Promise<Set<string>> {
  const [folders, products] = await Promise.all([
    mainDb<{ id: string; parent_id: string | null }[]>`
      SELECT id, parent_id FROM folders
    `,
    mainDb<{ folder_id: string | null }[]>`
      SELECT DISTINCT folder_id FROM products WHERE scope_id = ANY(${scopeIds})
    `,
  ]);
  return visibleFolderIds(
    folders.map((f) => ({ id: f.id, parentId: f.parent_id })),
    products.map((p) => p.folder_id),
  );
}
