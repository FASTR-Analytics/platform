import {
  type ProductLevel,
  productLevelAtLeast,
  productLevelFor,
  productLevelTeamIds,
  type ProductLevelUser,
  type ProductSummary,
} from "lib";
import { instanceState, productById } from "./t1_store";

// The client's product gates: the connection's own level on a product,
// derived from the summary the store holds, so every gate follows a level
// change live. The server counterpart is productAccessPolicy in
// server/auth/product_access.ts.
export function productLevel(productId: string): ProductLevel {
  const product = productById(productId);
  return product === undefined ? "none" : productSummaryLevel(product);
}

// For a caller that already holds the summary, such as a walk over the
// products list, which would otherwise look each product up again.
export function productSummaryLevel(product: ProductSummary): ProductLevel {
  return productLevelFor(product, currentProductLevelUser());
}

// The connection's own user as productLevelFor reads one.
export function currentProductLevelUser(): ProductLevelUser {
  return {
    email: instanceState.currentUserEmail,
    isGlobalAdmin: instanceState.currentUserIsGlobalAdmin,
    teamIds: instanceState.currentUserTeamIds,
  };
}

// The names of the teams the connection's level on a product comes from, and
// none when it holds the level without them (productLevelTeamIds).
export function productLevelTeamLabels(product: ProductSummary): string[] {
  const ids = productLevelTeamIds(product, currentProductLevelUser());
  return instanceState.teams
    .filter((team) => ids.includes(team.id))
    .map((team) => team.label);
}

export function canEditProduct(productId: string): boolean {
  return productLevelAtLeast(productLevel(productId), "edit");
}

export function canOwnProduct(productId: string): boolean {
  return productLevel(productId) === "own";
}
