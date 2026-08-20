import { t3, type Folder, type ProductSummary, type ProductSortMode } from "lib";
import { Badge, Button, Checkbox, Icon, getColor } from "panther";
import { For, Show, type JSX } from "solid-js";
import { folderCountsLine } from "./folder_card";
import { pathLabel } from "./folder_tree";
import {
  PRODUCT_TYPE_ICONS,
  packageLabel,
  productTypeLabel,
} from "./product_card";

// Hand-built navigation surface — the sanctioned exception to
// PROTOCOL_UI_COMPONENTS rule 4 (§5 of the explorer plan): rows open editors,
// reveal per-row menus and mix two entity kinds, so panther's `Table` data
// grid is the wrong tool. Composed from panther parts and tokens only.

// ONE grid template for the header row and every body row, so they cannot
// drift: select · name · type · package · area · updated · menu.
const _ROW_GRID =
  "grid grid-cols-[2rem_minmax(12rem,3fr)_7rem_minmax(8rem,1fr)_8rem_9rem_2.5rem] items-center ui-gap-sm";

type Props = {
  folders: Folder[];
  products: ProductSummary[];
  searching: boolean;
  sortMode: ProductSortMode;
  onSortMode: (mode: ProductSortMode) => void;
  isSelected: (productId: string) => boolean;
  onToggleSelect: (productId: string) => void;
  onRowClick: (product: ProductSummary, evt: MouseEvent) => void;
  onRowOpen: (product: ProductSummary) => void;
  onOpenFolder: (folderId: string) => void;
  onProductMenu: (evt: MouseEvent, product: ProductSummary) => void;
  onFolderMenu: (evt: MouseEvent, folder: Folder) => void;
  folderCounts: (folderId: string) => {
    folderCount: number;
    productCount: number;
  };
  onBackgroundClick: () => void;
  fallback: JSX.Element;
};

export function ListView(p: Props) {
  function headerSortButton(
    label: string,
    mode: ProductSortMode,
  ): JSX.Element {
    return (
      <button
        type="button"
        class="ui-focusable cursor-pointer text-left hover:text-base-content"
        classList={{ "font-700": p.sortMode === mode }}
        onClick={(e) => {
          e.stopPropagation();
          p.onSortMode(mode);
        }}
      >
        {label}
      </button>
    );
  }

  function pathLine(parentId: string | null): JSX.Element {
    return (
      <div class="ui-text-caption truncate">
        <Show
          when={parentId !== null}
          fallback={t3({
            en: "Top level",
            fr: "Niveau supérieur",
            pt: "Nível superior",
          })}
        >
          {pathLabel(p.folders, parentId as string)}
        </Show>
      </div>
    );
  }

  function menuButton(onMenu: (evt: MouseEvent) => void): JSX.Element {
    return (
      <span class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          size="sm"
          outline
          iconName="moreVertical"
          ariaLabel={t3({ en: "Menu", fr: "Menu", pt: "Menu" })}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e);
          }}
        />
      </span>
    );
  }

  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <div
      class="h-full w-full overflow-auto"
      data-tour="products-items"
      onClick={() => p.onBackgroundClick()}
    >
      <div
        class={`${_ROW_GRID} ui-text-caption sticky top-0 z-10 border-b bg-base-100`}
      >
        <div />
        <div class="ui-pad-sm">
          {headerSortButton(t3({ en: "Name", fr: "Nom", pt: "Nome" }), "label")}
        </div>
        <div class="ui-pad-sm">
          {t3({ en: "Type", fr: "Type", pt: "Tipo" })}
        </div>
        <div class="ui-pad-sm">
          {t3({ en: "Package", fr: "Paquet", pt: "Pacote" })}
        </div>
        <div class="ui-pad-sm">{t3({ en: "Area", fr: "Zone", pt: "Área" })}</div>
        <div class="ui-pad-sm">
          {headerSortButton(
            t3({
              en: "Last updated",
              fr: "Dernière modification",
              pt: "Última atualização",
            }),
            "recent",
          )}
        </div>
        <div />
      </div>
      <For each={p.folders}>
        {(folder) => (
          <div
            class={`${_ROW_GRID} ui-hoverable-base-100 ui-focusable group border-b`}
            role="button"
            tabindex="0"
            onClick={(e) => {
              e.stopPropagation();
              p.onOpenFolder(folder.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              p.onFolderMenu(e, folder);
            }}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                p.onOpenFolder(folder.id);
              }
            }}
          >
            <div class="ui-pad-sm flex justify-center">
              <span
                class="inline-block w-4"
                style={{
                  color: folder.color ?? getColor({ key: "base300" }),
                }}
              >
                <Icon iconName="folder" />
              </span>
            </div>
            <div class="ui-pad-sm min-w-0">
              <div class="font-700 truncate" title={folder.label}>
                {folder.label}
              </div>
              <Show when={p.searching}>{pathLine(folder.parentId)}</Show>
            </div>
            <div class="ui-pad-sm">
              {t3({ en: "Folder", fr: "Dossier", pt: "Pasta" })}
            </div>
            <div class="ui-pad-sm ui-text-caption truncate">
              {folderCountsLine(
                p.folderCounts(folder.id).folderCount,
                p.folderCounts(folder.id).productCount,
              )}
            </div>
            <div />
            <div class="ui-pad-sm ui-text-caption">
              {dateLabel(folder.lastUpdated)}
            </div>
            <div class="ui-pad-sm">{menuButton((e) => p.onFolderMenu(e, folder))}</div>
          </div>
        )}
      </For>
      <For each={p.products} fallback={<div class="ui-pad">{p.fallback}</div>}>
        {(product) => (
          <div
            class={`${_ROW_GRID} ui-focusable group border-b`}
            classList={{
              "border-primary bg-primary-subtle": p.isSelected(product.id),
              "ui-hoverable-base-100": !p.isSelected(product.id),
            }}
            role="button"
            tabindex="0"
            onClick={(e) => {
              e.stopPropagation();
              p.onRowClick(product, e);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              p.onProductMenu(e, product);
            }}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                p.onRowOpen(product);
              }
            }}
          >
            <div class="ui-pad-sm flex justify-center">
              {/* The checkbox reveals on hover or while selected; at rest the
                  cell shows the type icon. Panther's Checkbox gives no
                  MouseEvent, so range-select lives on the row itself. */}
              <span
                class="text-base-content-muted w-4 group-hover:hidden"
                classList={{
                  hidden: p.isSelected(product.id),
                  "inline-block": !p.isSelected(product.id),
                }}
              >
                <Icon iconName={PRODUCT_TYPE_ICONS[product.type]} />
              </span>
              <span
                class="group-hover:inline-block"
                classList={{ hidden: !p.isSelected(product.id) }}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={p.isSelected(product.id)}
                  onChange={() => p.onToggleSelect(product.id)}
                  label=""
                />
              </span>
            </div>
            <div class="ui-pad-sm min-w-0">
              <div class="truncate" title={product.label}>
                {product.label}
              </div>
              <Show when={p.searching}>{pathLine(product.folderId)}</Show>
            </div>
            <div class="ui-pad-sm">{productTypeLabel(product.type)}</div>
            <div class="ui-pad-sm min-w-0 truncate">
              {packageLabel(product.runId)}
            </div>
            <div class="ui-pad-sm">
              <Show
                when={product.adminArea2}
                fallback={
                  <Badge intent="base-200">
                    {t3({ en: "National", fr: "National", pt: "Nacional" })}
                  </Badge>
                }
              >
                {(area) => <Badge intent="neutral">{area()}</Badge>}
              </Show>
            </div>
            <div class="ui-pad-sm ui-text-caption">
              {dateLabel(product.lastUpdated)}
            </div>
            <div class="ui-pad-sm">
              {menuButton((e) => p.onProductMenu(e, product))}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
