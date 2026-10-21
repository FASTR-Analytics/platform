import type { Folder, ProductSummary, ProductType } from "../types/products.ts";
import { productLevelFor } from "../types/products.ts";

// The Products page as the model reads it (`list_products`): every product
// the user can see, where it sits, what it renders from and what the user may
// do to it. Pure over its arguments, so the server tests pin the rows.
export type ProductsListForAI = {
  products: ProductSummary[];
  folders: Folder[];
  // The ready packages the user sees; a product on a package outside the
  // list is named by its run id.
  readyPackages: { id: string; label: string }[];
  // Each scope under the label the app shows it.
  scopes: { id: string; label: string }[];
  user: { email: string; isGlobalAdmin: boolean };
};

// Saved visualizations are never shown to the model here: the copilot reads
// a visualization only from inside its own editor, so a deck or report
// conversation cannot reach one.
type ListedProductType = Exclude<ProductType, "visualization">;
type ListedProduct = Extract<ProductSummary, { type: ListedProductType }>;

const TYPE_LABELS: Record<ListedProductType, string> = {
  slide_deck: "slide deck",
  report: "report",
};

function isListed(product: ProductSummary): product is ListedProduct {
  return product.type !== "visualization";
}

const PATH_SEPARATOR = " / ";

// Every folder's path from the top level. A corrupted cycle stops at its
// own label rather than recursing.
function folderPaths(folders: Folder[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const paths = new Map<string, string>();
  function resolve(folderId: string, visited: Set<string>): string {
    const cached = paths.get(folderId);
    if (cached !== undefined) return cached;
    const folder = byId.get(folderId);
    if (folder === undefined) return "";
    if (visited.has(folderId)) return folder.label;
    visited.add(folderId);
    const parent = folder.parentId === null
      ? ""
      : resolve(folder.parentId, visited);
    const path = parent === ""
      ? folder.label
      : `${parent}${PATH_SEPARATOR}${folder.label}`;
    paths.set(folderId, path);
    return path;
  }
  for (const folder of folders) resolve(folder.id, new Set());
  return paths;
}

export function formatProductsListForAI(input: ProductsListForAI): string {
  const products = input.products.filter(isListed);
  if (products.length === 0) {
    return "No products. A product is a slide deck or a report, created on the Products page.";
  }
  const paths = folderPaths(input.folders);
  const packages = new Map(input.readyPackages.map((p) => [p.id, p.label]));
  const scopes = new Map(input.scopes.map((s) => [s.id, s.label]));
  const pathOf = (product: ListedProduct) =>
    product.folderId === null ? "" : paths.get(product.folderId) ?? "";
  const rows = products.toSorted((a, b) =>
    pathOf(a).localeCompare(pathOf(b)) || a.label.localeCompare(b.label)
  );
  return [
    `PRODUCTS (${rows.length})`,
    "=".repeat(80),
    "",
    "Every product you can see. A product renders its figures from one results package at one scope. The user opens a product from the Products page; its reading and editing tools are available while it is open.",
    "",
    ...rows.map((product) => {
      const path = pathOf(product);
      return [
        `- ${product.label} | ${TYPE_LABELS[product.type]}`,
        `folder: ${path === "" ? "General (top level)" : path}`,
        `package: ${
          packages.get(product.runId) ?? `not ready (run ${product.runId})`
        }`,
        `scope: ${
          scopes.get(product.scopeId) ?? `unlisted (${product.scopeId})`
        }`,
        `your level: ${productLevelFor(product, input.user)}`,
        `id: ${product.id}`,
      ].join(" | ");
    }),
  ].join("\n");
}
