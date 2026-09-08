import type { GlobalUser, ProductAccessLevel } from "lib";

// The ids a product or folder route acts on, resolved by requireProductAccess
// from the fields the route declares (path product_id / folder_id; body
// productIds, targetProductId, folderId, parentId) and nowhere else.
export type ProductAccessTargets = {
  productIds: string[];
  folderIds: string[];
};

// The one product-access policy (PLAN_PRODUCTS_RESTRUCTURE D2). Every
// approved user is a full editor of every product and folder today, so the
// level and the targets are not consulted. A later permission model replaces
// this function and inherits the per-route access inventory in
// lib/api-routes/products/* for free.
export function productAccessPolicy(
  user: GlobalUser,
  _level: ProductAccessLevel,
  _targets: ProductAccessTargets,
): boolean {
  return user.approved;
}
