import type { LayoutNode, MenuItem } from "panther";
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
} from "panther";

export type BlockType =
  | "text"
  | "figure"
  | "placeholder"
  | "image"
  | "unknown";

export type LayoutMenuCallbacks<T> = {
  // State updates
  onLayoutChange: (newLayout: LayoutNode<T>) => void;
  onSelectionChange: (id: string | undefined) => void;
  createNewBlock: () => LayoutNode<T> & { type: "item" };

  // Block introspection
  getBlockType: (block: T) => BlockType;
  isFigureWithSource: (block: T) => boolean;

  // Visualization operations (optional)
  onEditVisualization?: (blockId: string) => Promise<void>;
  onReplaceVisualization?: (blockId: string) => Promise<void>;

  // Block type conversion (optional)
  onConvertToText?: (blockId: string) => void;
  onConvertToFigure?: (blockId: string) => void;
  onConvertToPlaceholder?: (blockId: string) => void;
  onConvertToImage?: (blockId: string) => void;

  // Post-operation helpers (optional)
  ensureExplicitSpans?: (layout: LayoutNode<T>) => LayoutNode<T>;
  findFirstItem?: (
    layout: LayoutNode<T>,
  ) => (LayoutNode<T> & { type: "item" }) | undefined;
};

export function buildLayoutContextMenu<T>(
  layout: LayoutNode<T>,
  targetId: string,
  callbacks: LayoutMenuCallbacks<T>,
): MenuItem[] {
  const items: MenuItem[] = [];

  const found = findById(layout, targetId);
  if (!found) return items;

  const isOnlyNode = layout.type === "item" && layout.id === targetId;
  const parentType = found.parent?.type;
  const blockData = found.node.type === "item" ? found.node.data : undefined;

  const blockType = blockData ? callbacks.getBlockType(blockData) : "unknown";
  const isFigureWithSource = blockData
    ? callbacks.isFigureWithSource(blockData)
    : false;

  // === VISUALIZATION OPERATIONS ===
  if (isFigureWithSource) {
    if (callbacks.onEditVisualization) {
      items.push({
        label: "Edit visualization",
        icon: "pencil",
        onClick: () => callbacks.onEditVisualization!(targetId),
      });
    }

    if (callbacks.onReplaceVisualization) {
      items.push({
        label: "Replace visualization",
        icon: "switchHorizontal",
        onClick: () => callbacks.onReplaceVisualization!(targetId),
      });
    }

    items.push({ type: "divider" });
  }

  // === BLOCK TYPE CONVERSION ===
  const conversionCallbacks = [
    callbacks.onConvertToText,
    callbacks.onConvertToFigure,
    callbacks.onConvertToPlaceholder,
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
        label: "Figure",
        icon: "chart",
        onClick: () => callbacks.onConvertToFigure!(targetId),
      });
    }

    if (blockType !== "placeholder" && callbacks.onConvertToPlaceholder) {
      conversionItems.push({
        label: "Placeholder",
        icon: "box",
        onClick: () => callbacks.onConvertToPlaceholder!(targetId),
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
        icon: "transform",
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
        const result = splitIntoRows(layout, targetId, newBlock);
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
        let result = splitIntoColumns(layout, targetId, newBlock);
        if (callbacks.ensureExplicitSpans) {
          result = callbacks.ensureExplicitSpans(result);
        }
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
          let result = addCol(layout, targetId, newBlock, "left");
          if (callbacks.ensureExplicitSpans) {
            result = callbacks.ensureExplicitSpans(result);
          }
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Col to right",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          let result = addCol(layout, targetId, newBlock, "right");
          if (callbacks.ensureExplicitSpans) {
            result = callbacks.ensureExplicitSpans(result);
          }
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Row above",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addRow(layout, targetId, newBlock, "above");
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: "Row below",
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addRow(layout, targetId, newBlock, "below");
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
          const firstItem = callbacks.findFirstItem?.(result);
          callbacks.onSelectionChange(firstItem?.id);
        }
      },
    });
  }

  return items;
}
