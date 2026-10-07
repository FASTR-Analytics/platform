import {
  ALL_DATA_DEFINITION_HASH,
  type Folder,
  type ListSort,
  productScope,
  type ProductSummary,
  type SortMode,
  t3,
} from "lib";
import { Button, Icon, type IconName } from "panther";
import {
  batch,
  createMemo,
  createSignal,
  Index,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { packageLabel, scopeLabel } from "~/components/_shared/mod.ts";
import { resolveScope } from "~/state/instance/t1_store";
import {
  type DragItem,
  dropParent,
  dropRegion,
  type DropTarget,
  GENERAL_ID,
  generalLabel,
  moveToRootLabel,
  targetRowIndex,
} from "./_shared/mod.ts";
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

// Firefox starts no drag without data, so every drag carries the row's id
// under this type. Nothing reads it back: the drag item is held in state.
const _DRAG_MIME = "application/x-fastr-product-tree";

// The `data-drop-target` of the root, carried by the scroll container so the
// header and the blank space below the rows resolve to it. Folder rows carry
// their id, product rows their folder's (General for the root), and the
// General row GENERAL_ID, so a drop anywhere inside an open folder goes into
// it, innermost folder winning, as in Finder and VS Code.
const _ROOT_DROP_KEY = "_root";

// The drop outline: one rounded 2px primary rectangle around the target's
// whole block, drawn by a pseudo-element on each of its rows. It sits ON the
// grey separators, 1px above the block and over the last row's own border, so
// those two rows drop their separator while highlighted: a rounded line cannot
// cover the ends of a straight one, and grey stubs would show at the corners.
const _OUTLINE =
  "relative before:pointer-events-none before:absolute before:inset-x-0 before:border-x-2 before:border-primary";
const _OUTLINE_TOP = "before:border-t-2 before:rounded-t";
const _OUTLINE_BOTTOM = "before:border-b-2 before:rounded-b";

const _HOVER_OPEN_MS = 600;

type FolderRow = Extract<ProductTreeRow, { kind: "folder" }>;
type GeneralRow = Extract<ProductTreeRow, { kind: "general" }>;
type ProductRow = Extract<ProductTreeRow, { kind: "product" }>;

// What a row that opens and closes shows: a folder, or the synthetic General
// row at the root, which has no menu and is never dragged.
type ExpandableRow = {
  depth: number;
  expanded: boolean;
  hasContents: boolean;
  label: string;
  lastUpdated: string;
  dropKey: string;
  draggable: boolean;
  onToggle: () => void;
  onMenu: ((evt: MouseEvent) => void) | undefined;
  onDragStart: ((evt: DragEvent) => void) | undefined;
};

type Props = {
  rows: ProductTreeRow[];
  sort: ListSort;
  onSort: (mode: SortMode) => void;
  onOpenProduct: (product: ProductSummary) => void;
  onToggleFolder: (folderId: string) => void;
  onProductMenu: (evt: MouseEvent, product: ProductSummary) => void;
  onFolderMenu: (evt: MouseEvent, folder: Folder) => void;
  canDrag: (row: ProductTreeRow) => boolean;
  // Called only at dragstart, so only for a row canDrag accepted.
  dragItem: (row: ProductRow | FolderRow) => DragItem;
  onMove: (item: DragItem, parentId: string | null) => void;
  // Adds to the open set and never removes. GENERAL_ID opens General.
  onOpenFolder: (folderId: string) => void;
  fallback: JSX.Element;
};

function parseDropTarget(key: string): DropTarget {
  if (key === _ROOT_DROP_KEY) return { kind: "root" };
  if (key === GENERAL_ID) return { kind: "general" };
  return { kind: "folder", folderId: key };
}

function dropKeyAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-drop-target]")?.getAttribute(
    "data-drop-target",
  ) ?? null;
}

export function ListView(p: Props) {
  // The transient drag: the item (set after dragstart returns, see
  // startDrag), the legal target under the pointer, and the chip the browser
  // shows under the pointer in place of its snapshot of the whole row.
  const [dragItem, setDragItem] = createSignal<DragItem | null>(null);
  const [hoverKey, setHoverKey] = createSignal<string | null>(null);
  const [chip, setChip] = createSignal<
    { iconName: IconName; label: string } | null
  >(null);
  let chipEl: HTMLDivElement | undefined;
  let hoverOpenKey: string | null = null;
  let hoverOpenTimer: ReturnType<typeof setTimeout> | undefined;

  // The rows the hovered target's outline spans; the root's is the header.
  const region = createMemo(() => {
    const key = hoverKey();
    const rows = p.rows;
    if (key === null || key === _ROOT_DROP_KEY) return undefined;
    return dropRegion(rows, key);
  });

  // A block starting at the first row begins at that row's own top edge: the
  // sticky header paints above the rows and would cover the outer pixel.
  function outlineClassList(i: number) {
    const r = region();
    const inside = r !== undefined && i >= r.start && i <= r.end;
    const last = inside && i === r.end;
    return {
      [_OUTLINE]: inside,
      "before:-top-px": inside && i > 0,
      "before:top-0": inside && i === 0,
      "before:bottom-0": inside && !last,
      "before:-bottom-px": last,
      [_OUTLINE_TOP]: inside && i === r.start,
      [_OUTLINE_BOTTOM]: last,
      "border-b-transparent": r !== undefined &&
        (i === r.start - 1 || i === r.end),
    };
  }

  function clearHoverOpen() {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = undefined;
    hoverOpenKey = null;
  }

  // Browsers send no pointer events during a native drag, so the first one
  // after dragstart means the drag is over, however it ended: `dragend` on a
  // source element the list has since replaced reaches no ancestor.
  function onPointerMove() {
    endDrag();
  }

  function endDrag() {
    window.removeEventListener("pointermove", onPointerMove);
    clearHoverOpen();
    batch(() => {
      setDragItem(null);
      setHoverKey(null);
      setChip(null);
    });
  }

  onCleanup(endDrag);

  function startDrag(
    e: DragEvent,
    row: ProductRow | FolderRow,
    iconName: IconName,
    label: string,
  ) {
    const dt = e.dataTransfer;
    if (dt === null) return;
    dt.setData(
      _DRAG_MIME,
      row.kind === "product" ? row.product.id : row.folder.id,
    );
    dt.effectAllowed = "move";
    setChip({ iconName, label });
    if (chipEl !== undefined) dt.setDragImage(chipEl, 12, 12);
    const item = p.dragItem(row);
    // Chrome and Safari abort a drag whose source is no longer under the
    // pointer when dragstart returns, and storing the item redraws the header
    // above the row.
    setTimeout(() => {
      setDragItem(item);
      window.addEventListener("pointermove", onPointerMove);
    }, 0);
  }

  // A closed folder with contents, or closed General, opens after a hover,
  // legal target or not: a product's own folder is refused while its
  // subfolders are not. The dragged folder and its subtree never open.
  function scheduleHoverOpen(item: DragItem, key: string | null) {
    if (key === hoverOpenKey) return;
    clearHoverOpen();
    hoverOpenKey = key;
    if (key === null || key === _ROOT_DROP_KEY) return;
    if (item.kind === "folder" && (key === item.id || item.subtree.has(key))) {
      return;
    }
    const row = p.rows.at(targetRowIndex(p.rows, key));
    if (row === undefined || row.kind === "product" || row.expanded) return;
    if (row.kind === "folder" && !row.hasContents) return;
    hoverOpenTimer = setTimeout(() => {
      hoverOpenTimer = undefined;
      p.onOpenFolder(key);
    }, _HOVER_OPEN_MS);
  }

  // One handler on the scroll container for every target: per-row dragenter
  // and dragleave flicker as the pointer crosses a row's children.
  function handleDragOver(e: DragEvent) {
    const item = dragItem();
    if (item === null) return;
    const key = dropKeyAt(e.target);
    const parent = key === null
      ? undefined
      : dropParent(item, parseDropTarget(key));
    if (parent !== undefined) {
      e.preventDefault();
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "move";
    }
    setHoverKey(parent === undefined ? null : key);
    scheduleHoverOpen(item, key);
  }

  function handleDragLeave(e: DragEvent & { currentTarget: HTMLElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX < rect.right &&
      e.clientY >= rect.top && e.clientY < rect.bottom;
    if (inside) return;
    clearHoverOpen();
    setHoverKey(null);
  }

  function handleDrop(e: DragEvent) {
    const item = dragItem();
    if (item === null) return;
    const key = dropKeyAt(e.target);
    const target = key === null ? null : parseDropTarget(key);
    const parent = target === null ? undefined : dropParent(item, target);
    if (target === null || parent === undefined) {
      endDrag();
      return;
    }
    e.preventDefault();
    p.onMove(item, parent);
    if (target.kind === "folder") p.onOpenFolder(target.folderId);
    if (target.kind === "general") p.onOpenFolder(GENERAL_ID);
    endDrag();
  }

  // The header is the root zone while the dragged item can go to the root.
  const rootZoneItem = (): DragItem | null => {
    const item = dragItem();
    if (item === null) return null;
    return dropParent(item, { kind: "root" }) === undefined ? null : item;
  };

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
  const asGeneralRow = (row: ProductTreeRow): GeneralRow | undefined =>
    row.kind === "general" ? row : undefined;
  const asProductRow = (row: ProductTreeRow): ProductRow | undefined =>
    row.kind === "product" ? row : undefined;

  function expandableRow(
    tour: string | undefined,
    i: number,
    r: () => ExpandableRow,
  ): JSX.Element {
    return (
      <div
        class={`${_ROW_GRID} ui-hoverable-base-100 ui-focusable group border-b`}
        classList={outlineClassList(i)}
        data-tour={tour}
        data-drop-target={r().dropKey}
        role="button"
        tabindex="0"
        aria-expanded={r().hasContents ? r().expanded : undefined}
        draggable={r().draggable}
        onDragStart={(e) => r().onDragStart?.(e)}
        onClick={() => {
          if (r().hasContents) r().onToggle();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          r().onMenu?.(e);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !r().hasContents) return;
          const toggles = e.key === "Enter" ||
            e.key === " " ||
            (e.key === "ArrowRight" && !r().expanded) ||
            (e.key === "ArrowLeft" && r().expanded);
          if (!toggles) return;
          e.preventDefault();
          r().onToggle();
        }}
      >
        <div class="ui-pad-sm ui-gap-sm flex items-start">
          {
            /* The chevron marks a folder, faded when there is nothing inside
              to open. */
          }
          {rowIcon(
            r().depth,
            r().expanded ? "chevronDown" : "chevronRight",
            r().hasContents
              ? "text-base-content-muted"
              : "text-base-content-faint",
          )}
          <div class="font-700 min-w-0">{r().label}</div>
        </div>
        <div class="ui-pad-sm">
          {t3({ en: "Folder", fr: "Dossier", pt: "Pasta" })}
        </div>
        <div />
        <div />
        <div class="ui-pad-sm text-base-content-muted">
          {dateLabel(r().lastUpdated)}
        </div>
        <div class="ui-pad-sm">
          <Show when={r().onMenu}>
            {(onMenu) => menuButton((e) => onMenu()(e))}
          </Show>
        </div>
      </div>
    );
  }

  function folderRow(i: number, r: () => FolderRow): JSX.Element {
    return expandableRow("products-folder", i, () => ({
      depth: r().depth,
      expanded: r().expanded,
      hasContents: r().hasContents,
      label: r().folder.label,
      lastUpdated: r().lastUpdated,
      dropKey: r().folder.id,
      draggable: p.canDrag(r()),
      onToggle: () => p.onToggleFolder(r().folder.id),
      onMenu: (e) => p.onFolderMenu(e, r().folder),
      onDragStart: (e) => startDrag(e, r(), "folder", r().folder.label),
    }));
  }

  // General is only emitted when it holds products, so it always opens.
  function generalRow(i: number, r: () => GeneralRow): JSX.Element {
    return expandableRow(undefined, i, () => ({
      depth: 0,
      expanded: r().expanded,
      hasContents: true,
      label: generalLabel(),
      lastUpdated: r().lastUpdated,
      dropKey: GENERAL_ID,
      draggable: false,
      onToggle: () => p.onToggleFolder(GENERAL_ID),
      onMenu: undefined,
      onDragStart: undefined,
    }));
  }

  function productRow(i: number, r: () => ProductRow): JSX.Element {
    const product = () => r().product;
    return (
      <div
        class={`${_ROW_GRID} ui-hoverable-base-100 ui-focusable group border-b`}
        classList={outlineClassList(i)}
        data-tour="products-item"
        data-drop-target={product().folderId ?? GENERAL_ID}
        role="button"
        tabindex="0"
        draggable={p.canDrag(r())}
        onDragStart={(e) =>
          startDrag(
            e,
            r(),
            PRODUCT_TYPE_REGISTRY[product().type].icon,
            product().label,
          )}
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
            "text-base-content-muted":
              resolveScope(productScope(product())).definitionHash ===
                ALL_DATA_DEFINITION_HASH,
          }}
        >
          {scopeLabel(product().scopeId)}
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

  // The header's cells, or, while a drag can go to the root, one cell across
  // the grid built like a sort button so the header keeps its height and no
  // row moves.
  function headerCells(): JSX.Element {
    return (
      <Switch>
        <Match when={rootZoneItem()}>
          {(item) => (
            <div class="ui-pad-sm col-span-full">
              <span class="-ml-1.5 inline-flex items-center gap-1 px-1.5 py-1">
                <Icon iconName="folder" />
                {moveToRootLabel(item().kind)}
              </span>
            </div>
          )}
        </Match>
        <Match when={rootZoneItem() === null}>
          <div class="ui-pad-sm">
            {headerSortButton(
              t3({ en: "Name", fr: "Nom", pt: "Nome" }),
              "name",
            )}
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
                fr: "Modifié le",
                pt: "Atualizado",
              }),
              "recent",
            )}
          </div>
          <div />
        </Match>
      </Switch>
    );
  }

  return (
    // Horizontal padding only, mirroring the grid's inset: an x-only pad keeps
    // the sticky header flush at top-0 with no scroll-through gap.
    <div
      class="ui-pad-x h-full w-full overflow-auto"
      data-tour="products-items"
      data-drop-target={_ROOT_DROP_KEY}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={endDrag}
    >
      <div
        class={`${_ROW_GRID} font-700 bg-base-100 sticky top-0 z-10 border-b pt-1 text-xs tracking-wider uppercase`}
        classList={{
          [`${_OUTLINE} before:top-0 before:-bottom-px ${_OUTLINE_TOP} ${_OUTLINE_BOTTOM}`]:
            hoverKey() === _ROOT_DROP_KEY,
          "border-b-transparent": hoverKey() === _ROOT_DROP_KEY ||
            region()?.start === 0,
        }}
      >
        {headerCells()}
      </div>
      {
        /* Index, not For: every recompute makes new row objects, and keying by
          position keeps a toggled folder row, and its focus, in place. */
      }
      <Index each={p.rows} fallback={<div class="ui-pad">{p.fallback}</div>}>
        {(row, i) => (
          <Switch>
            <Match when={asFolderRow(row())}>{(r) => folderRow(i, r)}</Match>
            <Match when={asGeneralRow(row())}>{(r) => generalRow(i, r)}</Match>
            <Match when={asProductRow(row())}>{(r) => productRow(i, r)}</Match>
          </Switch>
        )}
      </Index>
      {
        /* The drag image: rendered off screen, filled before setDragImage
          reads it. */
      }
      <Show when={chip()}>
        {(c) => (
          <div
            ref={chipEl}
            class="ui-gap-sm ui-pad-sm bg-base-100 text-base-content pointer-events-none fixed -top-96 left-0 inline-flex items-center rounded border text-sm"
          >
            <Icon iconName={c().iconName} />
            <span>{c().label}</span>
          </div>
        )}
      </Show>
    </div>
  );
}
