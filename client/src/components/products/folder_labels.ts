import { t3 } from "lib";

// The counts line: DIRECT children only, never recursive (D16).
export function folderCountsLine(
  folderCount: number,
  productCount: number,
): string {
  return t3({
    en: `${folderCount} ${folderCount === 1 ? "folder" : "folders"} · ${productCount} ${productCount === 1 ? "product" : "products"}`,
    fr: `${folderCount} ${folderCount === 1 ? "dossier" : "dossiers"} · ${productCount} ${productCount === 1 ? "produit" : "produits"}`,
    pt: `${folderCount} ${folderCount === 1 ? "pasta" : "pastas"} · ${productCount} ${productCount === 1 ? "produto" : "produtos"}`,
  });
}

// The name for the root, where a folder's contents land when it is deleted.
export function topLevelLabel(): string {
  return t3({
    en: "Top level",
    fr: "Niveau supérieur",
    pt: "Nível superior",
  });
}
