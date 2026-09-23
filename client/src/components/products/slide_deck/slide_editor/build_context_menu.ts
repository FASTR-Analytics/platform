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
import { t3 } from "lib";

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
  onCreateVisualization?: (blockId: string) => Promise<void>;
  onRemoveVisualization?: (blockId: string) => void;

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

  if (isEmptyFigure) {
    if (callbacks.onSelectVisualization) {
      items.push({
        label: t3({ en: "Select visualization", fr: "Sélectionner la visualisation", pt: "Selecionar a visualização" }),
        icon: "chart",
        onClick: () => callbacks.onSelectVisualization!(targetId),
      });
    }
    if (callbacks.onCreateVisualization) {
      items.push({
        label: t3({ en: "Create new visualization", fr: "Créer une nouvelle visualisation", pt: "Criar nova visualização" }),
        icon: "plus",
        onClick: () => callbacks.onCreateVisualization!(targetId),
      });
    }
    if (items.length > 0) {
      items.push({ type: "divider" });
    }
  }

  if (blockType === "figure" && !isEmptyFigure) {
    const beforeViz = items.length;

    if (isFigureWithSource && callbacks.onEditVisualization) {
      items.push({
        label: t3({ en: "Edit visualization", fr: "Modifier la visualisation", pt: "Editar visualização" }),
        icon: "pencil",
        onClick: () => callbacks.onEditVisualization!(targetId),
      });
    }

    if (callbacks.onReplaceVisualization) {
      items.push({
        label: t3({ en: "Switch visualization", fr: "Changer de visualisation", pt: "Mudar de visualização" }),
        icon: "switchHorizontal",
        onClick: () => callbacks.onReplaceVisualization!(targetId),
      });
    }

    if (callbacks.onCreateVisualization) {
      items.push({
        label: t3({ en: "Create new visualization", fr: "Créer une nouvelle visualisation", pt: "Criar nova visualização" }),
        icon: "plus",
        onClick: () => callbacks.onCreateVisualization!(targetId),
      });
    }

    if (callbacks.onRemoveVisualization) {
      items.push({
        label: t3({ en: "Remove visualization", fr: "Supprimer la visualisation", pt: "Remover a visualização" }),
        icon: "trash",
        intent: "danger",
        onClick: () => callbacks.onRemoveVisualization!(targetId),
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
        label: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
        icon: "text",
        onClick: () => callbacks.onConvertToText!(targetId),
      });
    }

    if (blockType !== "figure" && callbacks.onConvertToFigure) {
      conversionItems.push({
        label: t3({ en: "Visualization", fr: "Visualisation", pt: "Visualização" }),
        icon: "chart",
        onClick: () => callbacks.onConvertToFigure!(targetId),
      });
    }

    if (blockType !== "image" && callbacks.onConvertToImage) {
      conversionItems.push({
        label: t3({ en: "Image", fr: "Image", pt: "Imagem" }),
        icon: "photo",
        onClick: () => callbacks.onConvertToImage!(targetId),
      });
    }

    if (conversionItems.length > 0) {
      items.push({
        type: "sub-item",
        label: t3({ en: "Change to", fr: "Convertir en", pt: "Converter em" }),
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
      label: t3({ en: "Into rows", fr: "En lignes", pt: "Em linhas" }),
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
      label: t3({ en: "Into columns", fr: "En colonnes", pt: "Em colunas" }),
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
      label: t3({ en: "Split", fr: "Diviser", pt: "Dividir" }),
      icon: "plus",
      subMenu: splitItems,
    });
  }

  // === ADD/INSERT OPERATIONS ===
  items.push({
    type: "sub-item",
    label: t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" }),
    icon: "plus",
    subMenu: [
      {
        label: t3({ en: "Col to left", fr: "Colonne à gauche", pt: "Coluna à esquerda" }),
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addCol(layout, targetId, newBlock, "left", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: t3({ en: "Col to right", fr: "Colonne à droite", pt: "Coluna à direita" }),
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addCol(layout, targetId, newBlock, "right", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: t3({ en: "Row above", fr: "Ligne au-dessus", pt: "Linha acima" }),
        icon: "plus",
        onClick: () => {
          const newBlock = callbacks.createNewBlock();
          const result = addRow(layout, targetId, newBlock, "above", callbacks.idGenerator);
          callbacks.onLayoutChange(result);
          callbacks.onSelectionChange(newBlock.id);
        },
      },
      {
        label: t3({ en: "Row below", fr: "Ligne en dessous", pt: "Linha abaixo" }),
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
      label: t3({ en: "Left", fr: "Gauche", pt: "Esquerda" }),
      icon: "arrowLeft",
      onClick: () => {
        const result = moveNodeLeft(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveRight) {
    moveItems.push({
      label: t3({ en: "Right", fr: "Droite", pt: "Direita" }),
      icon: "arrowRight",
      onClick: () => {
        const result = moveNodeRight(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveUp) {
    moveItems.push({
      label: t3({ en: "Up", fr: "Haut", pt: "Cima" }),
      icon: "arrowUp",
      onClick: () => {
        const result = moveNodeUp(layout, targetId);
        if (result) callbacks.onLayoutChange(result);
      },
    });
  }

  if (canMoveDown) {
    moveItems.push({
      label: t3({ en: "Down", fr: "Bas", pt: "Baixo" }),
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
      label: t3({ en: "Move", fr: "Déplacer", pt: "Mover" }),
      icon: "move",
      subMenu: moveItems,
    });
  }

  // === DELETE ===
  if (!isOnlyNode) {
    items.push({ type: "divider" });
    items.push({
      label: t3({ en: "Delete this cell", fr: "Supprimer cette cellule", pt: "Eliminar esta célula" }),
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
