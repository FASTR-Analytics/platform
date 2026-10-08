import { type ProductLevel, productLevelAtLeast, productLevelFor } from "lib";
import { instanceState, productById } from "./t1_store";

// The client's product gates (PLAN_PRODUCT_OWNERSHIP §2.9): the connection's
// own level on a product, derived from the summary the store holds, so every
// gate follows a level change live. The server counterpart is
// productAccessPolicy in server/auth/product_access.ts.
export function productLevel(productId: string): ProductLevel {
  const product = productById(productId);
  if (product === undefined) return "none";
  return productLevelFor(product, {
    email: instanceState.currentUserEmail,
    isGlobalAdmin: instanceState.currentUserIsGlobalAdmin,
  });
}

export function canEditProduct(productId: string): boolean {
  return productLevelAtLeast(productLevel(productId), "edit");
}

export function canOwnProduct(productId: string): boolean {
  return productLevel(productId) === "own";
}
