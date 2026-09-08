import { t3, type Folder } from "lib";
import { Button, Card, Icon, getColor } from "panther";
import { Show } from "solid-js";

// The counts line: DIRECT children only, never recursive (D16). Shared by the
// folder tile, the list row and the delete confirmation.
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

// The label for a folder or product that lives at the root, shown wherever a
// path is shown.
export function topLevelLabel(): string {
  return t3({
    en: "Top level",
    fr: "Niveau supérieur",
    pt: "Nível superior",
  });
}

export function folderColor(folder: Folder): string {
  return folder.color ?? getColor({ key: "base300" });
}

type Props = {
  folder: Folder;
  folderCount: number;
  productCount: number;
  // The folder's own path, set only while searching: it replaces the counts
  // line so a result says where it lives.
  searchPath: string | null;
  onOpen: () => void;
  onMenu: (evt: MouseEvent) => void;
};

// A folder tile in the grid. No onSelectToggle: folders are never part of a
// batch (D16), so everything acts through the folder menu.
export function FolderCard(p: Props) {
  return (
    <Card
      data-tour="products-item"
      class="group"
      onClick={() => p.onOpen()}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onMenu(e);
      }}
      header={
        <div class="ui-gap-sm flex items-center">
          {/* The folder's colour is the icon itself, as in the list row. */}
          <span
            class="inline-block w-4 flex-none"
            style={{ color: folderColor(p.folder) }}
          >
            <Icon iconName="folder" />
          </span>
          <span class="flex-1 truncate">{p.folder.label}</span>
        </div>
      }
      headerRight={
        <span class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            size="sm"
            outline
            iconName="moreVertical"
            ariaLabel={t3({
              en: "Folder menu",
              fr: "Menu du dossier",
              pt: "Menu da pasta",
            })}
            onClick={(e) => p.onMenu(e)}
          />
        </span>
      }
    >
      <div class="ui-text-caption truncate">
        <Show
          when={p.searchPath}
          fallback={folderCountsLine(p.folderCount, p.productCount)}
        >
          {(path) => path()}
        </Show>
      </div>
    </Card>
  );
}
