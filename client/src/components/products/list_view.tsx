import {
  t3,
  type Folder,
  type ListSort,
  type ProductSummary,
  type SortMode,
} from "lib";
import { Button, Icon, type IconName } from "panther";
import { Index, Match, Switch, type JSX } from "solid-js";
import { packageLabel, scopeLabel } from "~/components/_shared/mod.ts";
import type { ProductTreeRow } from "./_shared/mod.ts";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";

// Hand-built rather than assembled from panther's `Table`: the sanctioned
// exception to PROTOCOL_UI_COMPONENTS rule 4 (D16), because the rows open
// editors, reveal per-row menus and mix two entity kinds, none of which a data
// grid does. Composed from panther parts and tokens only.

// ONE grid template for the header row and every body row, so the two cannot
// drift: name · type · package · area · updated · menu. Grid cells default to
// min-width auto, so every cell is shrinkable and wraps rather than overflowing.
const _ROW_GRID =
  "ui-gap-sm grid grid-cols-[minmax(12rem,3fr)_7rem_minmax(8rem,1fr)_minmax(8rem,1fr)_9rem_2.5rem] items-center *:min-w-0 *:break-words";

const _INDENT_REM_PER_LEVEL = 1.75;

type FolderRow = Extract<ProductTreeRow, { kind: "folder" }>;
type ProductRow = Extract<ProductTreeRow, { kind: "product" }>;

type Props = {
  rows: ProductTreeRow[];
  sort: ListSort;
  onSort: (mode: SortMode) => void;
  onOpenProduct: (product: ProductSummary) => void;
  onToggleFolder: (folderId: string) => void;
  onProductMenu: (evt: MouseEvent, product: ProductSummary) => void;
  onFolderMenu: (evt: MouseEvent, folder: Folder) => void;
  fallback: JSX.Element;
};

export function ListView(p: Props) {
  const sortGlyph = (mode: SortMode): IconName =>
    p.sort.mode !== mode
      ? "arrowsUpDown"
      : p.sort.direction === "asc"
        ? "arrowUp"
        : "arrowDown";

  function headerSortButton(label: string, mode: SortMode): JSX.Element {
    return (
      <button
        type="button"
        class="ui-hoverable-base-100 ui-focusable -ml-1.5 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 uppercase"
        onClick={() => p.onSort(mode)}
      >
        {label}
        <span
          class="inline-flex"
          classList={{ "opacity-40": p.sort.mode !== mode }}
        >
          <Icon iconName={sortGlyph(mode)} />
        </span>
      </button>
    );
  }

  function menuButton(onMenu: (evt: MouseEvent) => void): JSX.Element {
    return (
      <span class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="sm"
          ghost
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

  // The indent is a margin on the icon, not a spacer element: a zero-width
  // spacer would still take the flex gap and push top-level rows in.
  function rowIcon(
    depth: number,
    iconName: IconName,
    colorClass: string,
  ): JSX.Element {
    return (
      <span
        class={`flex h-[1lh] w-4 flex-none items-center ${colorClass}`}
        style={{ "margin-left": `${depth * _INDENT_REM_PER_LEVEL}rem` }}
      >
        <Icon iconName={iconName} />
      </span>
    );
  }

  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString();

  const asFolderRow = (row: ProductTreeRow): FolderRow | undefined =>
    row.kind === "folder" ? row : undefined;
  const asProductRow = (row: ProductTreeRow): ProductRow | undefined =>
    row.kind === "product" ? row : undefined;

  function folderRow(r: () => FolderRow): JSX.Element {
    const folder = () => r().folder;
    return (
      <div
        class={`${_ROW_GRID} ui-hoverable-base-100 ui-focusable group border-b`}
        data-tour="products-folder"
        role="button"
        tabindex="0"
        aria-expanded={r().hasContents ? r().expanded : undefined}
        onClick={() => {
          if (r().hasContents) p.onToggleFolder(folder().id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          p.onFolderMenu(e, folder());
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !r().hasContents) return;
          const toggles =
            e.key === "Enter" ||
            e.key === " " ||
            (e.key === "ArrowRight" && !r().expanded) ||
            (e.key === "ArrowLeft" && r().expanded);
          if (!toggles) return;
          e.preventDefault();
          p.onToggleFolder(folder().id);
        }}
      >
        <div class="ui-pad-sm ui-gap-sm flex items-start">
          {/* The chevron marks a folder, faded when there is nothing inside
              to open. */}
          {rowIcon(
            r().depth,
            r().expanded ? "chevronDown" : "chevronRight",
            r().hasContents
              ? "text-base-content-muted"
              : "text-base-content-faint",
          )}
          <div class="font-700 min-w-0">{folder().label}</div>
        </div>
        <div class="ui-pad-sm">
          {t3({ en: "Folder", fr: "Dossier", pt: "Pasta" })}
        </div>
        <div />
        <div />
        <div class="ui-pad-sm text-base-content-muted">
          {dateLabel(folder().lastUpdated)}
        </div>
        <div class="ui-pad-sm">
          {menuButton((e) => p.onFolderMenu(e, folder()))}
        </div>
      </div>
    );
  }

  function productRow(r: () => ProductRow): JSX.Element {
    const product = () => r().product;
    return (
      <div
        class={`${_ROW_GRID} ui-hoverable-base-100 ui-focusable group border-b`}
        data-tour="products-item"
        role="button"
        tabindex="0"
        onClick={() => p.onOpenProduct(product())}
        onContextMenu={(e) => {
          e.preventDefault();
          p.onProductMenu(e, product());
        }}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            p.onOpenProduct(product());
          }
        }}
      >
        <div class="ui-pad-sm ui-gap-sm flex items-start">
          {rowIcon(
            r().depth,
            PRODUCT_TYPE_REGISTRY[product().type].icon,
            "text-base-content-muted",
          )}
          <div class="min-w-0">{product().label}</div>
        </div>
        <div class="ui-pad-sm">
          {PRODUCT_TYPE_REGISTRY[product().type].label()}
        </div>
        <div class="ui-pad-sm">{packageLabel(product().runId)}</div>
        <div
          class="ui-pad-sm"
          classList={{
            "text-base-content-muted": product().adminArea2 === null,
          }}
        >
          {scopeLabel(product().adminArea2)}
        </div>
        <div class="ui-pad-sm text-base-content-muted">
          {dateLabel(product().lastUpdated)}
        </div>
        <div class="ui-pad-sm">
          {menuButton((e) => p.onProductMenu(e, product()))}
        </div>
      </div>
    );
  }

  return (
    // Horizontal padding only, mirroring the grid's inset: an x-only pad keeps
    // the sticky header flush at top-0 with no scroll-through gap.
    <div
      class="ui-pad-x h-full w-full overflow-auto"
      data-tour="products-items"
    >
      <div
        class={`${_ROW_GRID} font-700 bg-base-100 sticky top-0 z-10 border-b pt-1 text-xs tracking-wider uppercase`}
      >
        <div class="ui-pad-sm">
          {headerSortButton(t3({ en: "Name", fr: "Nom", pt: "Nome" }), "name")}
        </div>
        <div class="ui-pad-sm">
          <span class="-ml-1.5 px-1.5 py-1">
            {t3({ en: "Type", fr: "Type", pt: "Tipo" })}
          </span>
        </div>
        <div class="ui-pad-sm">
          <span class="-ml-1.5 px-1.5 py-1">
            {t3({ en: "Package", fr: "Paquet", pt: "Pacote" })}
          </span>
        </div>
        <div class="ui-pad-sm">
          <span class="-ml-1.5 px-1.5 py-1">
            {t3({ en: "Scope", fr: "Portée", pt: "Âmbito" })}
          </span>
        </div>
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
      {/* Index, not For: every recompute makes new row objects, and keying by
          position keeps a toggled folder row, and its focus, in place. */}
      <Index each={p.rows} fallback={<div class="ui-pad">{p.fallback}</div>}>
        {(row) => (
          <Switch>
            <Match when={asFolderRow(row())}>{(r) => folderRow(r)}</Match>
            <Match when={asProductRow(row())}>{(r) => productRow(r)}</Match>
          </Switch>
        )}
      </Index>
    </div>
  );
}
