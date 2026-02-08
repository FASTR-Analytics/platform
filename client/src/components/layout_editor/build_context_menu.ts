import type { IdGenerator, LayoutNode, MenuItem } from "panther";
import {
  addRow,
  addCol,
  splitIntoRows,
  splitIntoColumns,
  deleteNodeWithCleanup,
  moveNodeLeft,
  moveNodeRight,
  moveNodeUp,
  moveNodeDown,
  findById,
  findFirstItem,
} from "panther";

export type BlockType =
  | "text"
  | "figure"
  | "placeholder"  // Reports only (slides removed)
  | "image"
  | "unknown";

export type LayoutMenuCallbacks<T> = {
  // State updates
  onLayoutChange: (newLayout: LayoutNode<T>) => void;
  onSelectionChange: (id: string | undefined) => void;
  createNewBlock: () => LayoutNode<T> & { type: "item" };
  idGenerator?: IdGenerator;

  // Block introspection
  getBlockType: (block: T) => BlockType;
  isFigureWithSource: (block: T) => boolean;
  isEmptyFigure?: (block: T) => boolean;

  // Visualization operations (optional)
  onEditVisualization?: (blockId: string) => Promise<void>;
  onSelectVisualization?: (blockId: string) => Promise<void>;
  onReplaceVisualization?: (blockId: string) => Promise<void>;

  // Block type conversion (optional)
  onConvertToText?: (blockId: string) => void;
  onConvertToFigure?: (blockId: string) => void;
  onConvertToImage?: (blockId: string) => void;
};

function countItems<T>(node: LayoutNode<T>): number {
  if (node.type === "item") return 1;
  return node.children.reduce((sum, child) => sum + countItems(child as LayoutNode<T>), 0);
}

export function buildLayoutContextMenu<T>(
  layout: LayoutNode<T>,
  targetId: string,
  callbacks: LayoutMenuCallbacks<T>,
): MenuItem[] {
  const items: MenuItem[] = [];

  const found = findById(layout, targetId);
  if (!found) return items;

  const isOnlyNode = countItems(layout) === 1;
  const parentType = found.parent?.type;
  const blockData = found.node.type === "item" ? found.node.data : undefined;

  const blockType = blockData ? callbacks.getBlockType(blockData) : "unknown";
  const isFigureWithSource = blockData
    ? callbacks.isFigureWithSource(blockData)
    : false;

  // === VISUALIZATION OPERATIONS ===
  const isEmptyFigure = blockData && callbacks.isEmptyFigure
    ? callbacks.isEmptyFigure(blockData)
    : false;

  if (isEmptyFigure && callbacks.onSelectVisualization) {
    items.push({
      label: "Select visualization",
      icon: "chart",
      onClick: () => callbacks.onSelectVisualization!(targetId),
    });
    items.push({ type: "divider" });
  }

  if (isFigureWithSource) {
    const beforeViz = items.length;

    if (callbacks.onEditVisualization) {
      items.push({
        label: "Edit visualization",
        icon: "pencil",
        onClick: () => callbacks.onEditVisualization!(targetId),
      });
    }

    if (callbacks.onReplaceVisualization) {
      items.push({
        label: "Switch visualization",
        icon: "switchHorizontal",
        onClick: () => callbacks.onReplaceVisualization!(targetId),
      });
    }

    if (items.length > beforeViz) {
      items.push({ type: "divider" });
    }
  }

  // === BLOCK TYPE CONVERSION ===
  const conversionCallbacks = [
    callbacks.onConvertToText,
    callbacks.onConvertToFigure,
    callbacks.onConvertToImage,
  ];
  const hasConversion = conversionCallbacks.some((c) => !!c);

  if (hasConversion) {
    const conversionItems: MenuItem[] = [];

    if (blockType !== "text" && callbacks.onConvertToText) {
      conversionItems.push({
        label: "Text",
        icon: "text",
        onClick: () => callbacks.onConvertToText!(targetId),
      });
    }

    if (blockType !== "figure" && callbacks.onConvertToFigure) {
      conversionItems.push({
        label: "Visualization",
        icon: "chart",
        onClick: () => callbacks.onConvertToFigure!(targetId),
      });
    }

    if (blockType !== "image" && callbacks.onConvertToImage) {
      conversionItems.push({
        label: "Image",
        icon: "photo",
        onClick: () => callbacks.onConvertToImage!(targetId),
      });
    }

    if (conversionItems.length > 0) {
      items.push({
        type: "sub-item",
        label: "Change to",
        icon: "switchHorizontal",
        subMenu: conversionItems,
      });
      items.push({ type: "divider" });
    }
  }

  // === SPLIT OPERATIONS ===
  const splitItems: MenuItem[] = [];

  if (isOnlyNode || parentType === "cols") {
    splitItems.push({
      label: "Into rows",
      icon: "plus",
      onClick: () => {
        const newBlock = callbacks.createNewBlock();
        const result = splitIntoRows(layout, targetId, newBlock, "after", callbacks.idGenerator);
        callbacks.onLayoutChange(result);
        callbacks.onSelectionChange(newBlock.id);
      },
    });
  }

  if (isOnlyNode || parentType === "rows") {
    splitItems.push({
      label: "Into columns",
      icon: "plus",
      onClick: () => {
        const newBlock = callbacks.createNewBlock();
        const result = splitIntoColumns(layout, targetId, newBlock, "after", callbacks.idGenerator);
        callbacks.onLayoutChange(result);
        callbacks.onSelectionChange(newBlock.id);
      },
    });
  }

  if (splitItems.length > 0) {
    items.push({
      type: "sub-item",
      label: "Split",
      icon: "plus",
      subMenu: splitItems,
    });
  }

  // === ADD/INSERT OPERATIONS ===
  items.push({
    type: "sub-item",
    label: "Add",
    icon: "plus",
    subMenu: [
      {
        label: "Col to left",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addCol(layout, targetId, newBlock, "left", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Col to right",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addCol(layout, targetId, newBlock, "right", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Row above",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addRow(layout, targetId, newBlock, "above", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Row below",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addRow(layout, targetId, newBlock, "below", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
    ],
  });

  // === MOVEMENT OPERATIONS ===
  const moveItems: MenuItem[] = [];

  // Try each move operation - they return null if not possible
  const canMoveLeft = moveNodeLeft(layout, targetId) !== null;
  const canMoveRight = moveNodeRight(layout, targetId) !== null;
  const canMoveUp = moveNodeUp(layout, targetId) !== null;
  const canMoveDown = moveNodeDown(layout, targetId) !== null;

  if (canMoveLeft) {
    moveItems.push({
      label: "Left",
      icon: "arrowLeft",
      onClick: () => {
        const result = moveNodeLeft(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveRight) {
    moveItems.push({
      label: "Right",
      icon: "arrowRight",
      onClick: () => {
        const result = moveNodeRight(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveUp) {
    moveItems.push({
      label: "Up",
      icon: "arrowUp",
      onClick: () => {
        const result = moveNodeUp(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveDown) {
    moveItems.push({
      label: "Down",
      icon: "arrowDown",
      onClick: () => {
        const result = moveNodeDown(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (moveItems.length > 0) {
    items.push({
      type: "sub-item",
      label: "Move",
      icon: "move",
      subMenu: moveItems,
    });
  }

  // === DELETE ===
  if (!isOnlyNode) {
    items.push({ type: "divider" });
    items.push({
      label: "Delete this cell",
      icon: "trash",
      intent: "danger",
      onClick: () => {
        const result = deleteNodeWithCleanup(layout, targetId);
        if (result) {
          callbacks.onLayoutChange(result);
          const firstItem = findFirstItem(result);
          callbacks.onSelectionChange(firstItem?.id);
        }
      },
    });
  }

  return items;
}
