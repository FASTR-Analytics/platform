import { instanceState } from "./t1_store";

// The ONE client-side product edit gate (PLAN_PRODUCTS_RESTRUCTURE D2): every
// approved user is a full editor of every product today. It takes the product
// id so a later permission model replaces this function and no call site; the
// server counterpart is productAccessPolicy in server/auth/product_access.ts.
export function canEditProduct(_productId: string): boolean {
  return instanceState.currentUserApproved;
}
