import type { Folder, ProductSummary, ProductType, ReadyPackage } from "lib";

const TYPE_LABEL: Record<ProductType, string> = {
  slide_deck: "SLIDE DECKS",
  report: "REPORTS",
};

// The products of ONE type, as the model sees them. Each line names the
// package and scope the product serves from, because a figure the model builds
// inside a product resolves under THAT pair — not under whatever pair the last
// tool call happened to read.
export function formatProductsListForAI(
  products: ProductSummary[],
  type: ProductType,
  folders: Folder[],
  readyPackages: ReadyPackage[],
): string {
  const lines: string[] = [TYPE_LABEL[type], "=".repeat(80), ""];

  const matching = products.filter((p) => p.type === type);
  if (matching.length === 0) {
    lines.push(
      type === "slide_deck"
        ? "No slide decks yet."
        : "No reports yet.",
    );
    return lines.join("\n");
  }

  for (const product of matching) {
    const folder = folders.find((f) => f.id === product.folderId);
    const pkg = readyPackages.find((p) => p.id === product.runId);
    lines.push(`ID: ${product.id}`);
    lines.push(`Name: ${product.label}`);
    lines.push(`Folder: ${folder ? folder.label : "General"}`);
    lines.push(`Results package: ${pkg ? pkg.label : product.runId}`);
    lines.push(
      `Scope: ${product.adminArea2 === null ? "national" : product.adminArea2}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
