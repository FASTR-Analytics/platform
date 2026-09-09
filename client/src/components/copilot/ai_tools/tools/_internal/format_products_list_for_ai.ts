import type { Folder, ProductSummary, ProductType, ReadyPackage } from "lib";
import { folderPathLabels } from "~/components/products/folder_tree";

const TYPE_HEADING: Record<ProductType, string> = {
  slide_deck: "SLIDE DECKS",
  report: "REPORTS",
};

const TYPE_EMPTY: Record<ProductType, string> = {
  slide_deck: "No slide decks yet.",
  report: "No reports yet.",
};

// The products of ONE type, as the model sees them. Each line names the
// package and scope the product serves from, because a figure the model builds
// inside a product resolves under THAT pair, not under whatever pair the last
// tool call happened to read.
export function formatProductsListForAI(
  products: ProductSummary[],
  type: ProductType,
  folders: Folder[],
  readyPackages: ReadyPackage[],
): string {
  const lines: string[] = [TYPE_HEADING[type], "=".repeat(80), ""];

  const matching = products.filter((p) => p.type === type);
  if (matching.length === 0) {
    lines.push(TYPE_EMPTY[type]);
    return lines.join("\n");
  }

  // Folders nest, so the model sees the full path, resolved once for the
  // whole list rather than per row.
  const pathLabels = folderPathLabels(folders);

  for (const product of matching) {
    const pkg = readyPackages.find((p) => p.id === product.runId);
    lines.push(`ID: ${product.id}`);
    lines.push(`Name: ${product.label}`);
    lines.push(
      `Folder: ${
        product.folderId === null
          ? "No folder"
          : pathLabels.get(product.folderId) ?? "No folder"
      }`,
    );
    lines.push(`Results package: ${pkg ? pkg.label : product.runId}`);
    lines.push(
      `Scope: ${product.adminArea2 === null ? "national" : product.adminArea2}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
