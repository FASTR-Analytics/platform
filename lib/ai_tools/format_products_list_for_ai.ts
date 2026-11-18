import { foldString, matchesSearch, searchTokens } from "@timroberton/panther";
import type { Folder, ProductSummary, ProductType } from "../types/products.ts";
import { productLevelFor } from "../permissions/mod.ts";
import { AI_RECORD_PAGE_MAX, pageForAI } from "./read_bounds.ts";

// The Products page as the model reads it (`list_products`): the products
// the user can see, a page at a time, where each sits, what it renders from
// and what the user may do to it. Pure over its arguments, so the server
// tests pin the rows.
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

export type ProductsQueryForAI = { search?: string; offset?: number };

const TYPE_LABELS: Record<ProductType, string> = {
  slide_deck: "slide deck",
  report: "report",
  visualization: "saved visualization",
};

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

export function formatProductsListForAI(
  input: ProductsListForAI,
  query: ProductsQueryForAI,
): string {
  const products = input.products;
  const paths = folderPaths(input.folders);
  const packages = new Map(input.readyPackages.map((p) => [p.id, p.label]));
  const scopes = new Map(input.scopes.map((s) => [s.id, s.label]));
  const rows = products.map((product) => {
    const path = product.folderId === null
      ? ""
      : paths.get(product.folderId) ?? "";
    const cells = {
      type: TYPE_LABELS[product.type],
      folder: path === "" ? "General (top level)" : path,
      package: packages.get(product.runId) ??
        `not ready (run ${product.runId})`,
      scope: scopes.get(product.scopeId) ?? `unlisted (${product.scopeId})`,
    };
    return { product, path, cells };
  }).toSorted((a, b) =>
    a.path.localeCompare(b.path) ||
    a.product.label.localeCompare(b.product.label)
  );
  const tokens = searchTokens(query.search ?? "");
  const matched = rows.filter(({ product, cells }) =>
    matchesSearch(
      foldString([product.label, ...Object.values(cells)].join(" ")),
      tokens,
    )
  );
  const page = pageForAI(
    matched,
    query.offset ?? 0,
    AI_RECORD_PAGE_MAX,
    "products",
  );
  if (products.length === 0) {
    return "No products. A product is a slide deck, a report or a saved visualization, created on the Products page.";
  }
  return [
    "PRODUCTS",
    "=".repeat(80),
    "",
    "The products you can see. A product renders its figures from one results package at one scope. The user opens a product from the Products page; its reading and editing tools are available while it is open.",
    "",
    `${matched.length} of ${products.length} products${
      tokens.length > 0 ? ` match "${query.search}"` : ""
    }. ${page.summary}`,
    ...page.entries.map(({ product, cells }) =>
      [
        `- ${product.label} | ${cells.type}`,
        `folder: ${cells.folder}`,
        `package: ${cells.package}`,
        `scope: ${cells.scope}`,
        `your level: ${productLevelFor(product, input.user)}`,
        `id: ${product.id}`,
      ].join(" | ")
    ),
  ].join("\n");
}
