import {
  type ProductLevel,
  productLevelAtLeast,
  productLevelFor,
  type ProductSummary,
} from "lib";
import { instanceState, productById } from "./t1_store";

// The client's product gates (PLAN_PRODUCT_OWNERSHIP §2.9): the connection's
// own level on a product, derived from the summary the store holds, so every
// gate follows a level change live. The server counterpart is
// productAccessPolicy in server/auth/product_access.ts.
export function productLevel(productId: string): ProductLevel {
  const product = productById(productId);
  return product === undefined ? "none" : productSummaryLevel(product);
}

// For a caller that already holds the summary, such as a walk over the
// products list, which would otherwise look each product up again.
export function productSummaryLevel(product: ProductSummary): ProductLevel {
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
