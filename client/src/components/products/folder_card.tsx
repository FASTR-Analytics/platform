import { t3, type Folder } from "lib";
import { Button, Card, getColor, Icon } from "panther";
import { Show } from "solid-js";

// The D16 counts line — DIRECT children only, never recursive. Shared by the
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

type Props = {
  folder: Folder;
  folderCount: number;
  productCount: number;
  // The folder's parent path, set only while searching (D2) — it replaces the
  // counts line so a result says where it lives.
  searchPath: string | null;
  onOpen: () => void;
  onMenu: (evt: MouseEvent) => void;
};

// A folder tile in the grid. No onSelectToggle: folders are never part of a
// batch (D3) — everything goes through the folder menu.
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
            style={{ color: p.folder.color ?? getColor({ key: "base300" }) }}
          >
            <Icon iconName="folder" />
          </span>
          <span class="flex-1 truncate">{p.folder.label}</span>
        </div>
      }
      headerRight={
        <span class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
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
          when={p.searchPath !== null}
          fallback={folderCountsLine(p.folderCount, p.productCount)}
        >
          {p.searchPath}
        </Show>
      </div>
    </Card>
  );
}
