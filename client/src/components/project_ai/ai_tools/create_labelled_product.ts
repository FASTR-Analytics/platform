import type { APIResponseWithData, ProductType } from "lib";
import { serverActions } from "~/server_actions";

// The server mints a placeholder label on create, so a user-named product is
// two writes: create, then relabel.
export async function createLabelledProduct(
  type: ProductType,
  label: string,
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  const createRes = await serverActions.createProduct({ type, folderId: null });
  if (!createRes.success) return createRes;
  const productId = createRes.data.productId;
  const labelRes = await serverActions.updateProductLabel({
    product_id: productId,
    label,
  });
  if (!labelRes.success) return labelRes;
  return {
    success: true,
    data: { productId, lastUpdated: labelRes.data.lastUpdated },
  };
}
