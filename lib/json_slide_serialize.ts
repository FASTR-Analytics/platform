import type { ContentSlide, FigureBlock, Slide } from "./types/slides.ts";

const UNDEFINED_SENTINEL = "@@__UNDEFINED__@@";

/**
 * Deep-walk and replace undefined with sentinel in nested arrays/objects
 */
function deepReplaceUndefined(obj: unknown): unknown {
  if (obj === undefined) {
    return UNDEFINED_SENTINEL;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepReplaceUndefined(item));
  }

  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[key] = deepReplaceUndefined((obj as Record<string, unknown>)[key]);
  }
  return result;
}

/**
 * Deep-walk and restore sentinel strings back to undefined
 */
function deepRestoreUndefined(obj: unknown): unknown {
  if (obj === UNDEFINED_SENTINEL) {
    return undefined;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepRestoreUndefined(item));
  }

  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[key] = deepRestoreUndefined((obj as Record<string, unknown>)[key]);
  }
  return result;
}

/**
 * Process only figureInputs data within content blocks
 */
function processFigureInputsInBlock(block: unknown, processor: (obj: unknown) => unknown): unknown {
  const b = block as Record<string, unknown>;

  if (b.type !== "figure" || !b.figureInputs) {
    return block;
  }

  const figureInputs = b.figureInputs as Record<string, unknown>;
  const processed = { ...figureInputs };

  // Only process the data containers (timeseriesData, chartData, tableData)
  if (figureInputs.timeseriesData) {
    processed.timeseriesData = processor(figureInputs.timeseriesData);
  }
  if (figureInputs.chartData) {
    processed.chartData = processor(figureInputs.chartData);
  }
  if (figureInputs.tableData) {
    processed.tableData = processor(figureInputs.tableData);
  }

  return { ...b, figureInputs: processed };
}

/**
 * Process layout tree recursively
 */
function processLayoutNode(node: unknown, processor: (obj: unknown) => unknown): unknown {
  const n = node as Record<string, unknown>;

  if (n.type === "item") {
    return {
      ...n,
      data: processFigureInputsInBlock(n.data, processor),
    };
  }

  if (n.type === "rows" || n.type === "cols") {
    return {
      ...n,
      children: (n.children as unknown[]).map(child => processLayoutNode(child, processor)),
    };
  }

  return node;
}

/**
 * Prepare slide for transmission - replace undefined with sentinel in figure data only
 */
export function prepareSlideForTransmit(slide: Slide): Slide {
  if (slide.type !== "content") {
    return slide;
  }

  const contentSlide = slide as ContentSlide;
  return {
    ...contentSlide,
    layout: processLayoutNode(contentSlide.layout, deepReplaceUndefined),
  } as ContentSlide;
}

/**
 * Restore slide after receiving - replace sentinel with undefined in figure data only
 */
export function restoreSlideAfterReceive(slide: Slide): Slide {
  if (slide.type !== "content") {
    return slide;
  }

  const contentSlide = slide as ContentSlide;
  return {
    ...contentSlide,
    layout: processLayoutNode(contentSlide.layout, deepRestoreUndefined),
  } as ContentSlide;
}

/**
 * Report figure registries hold the SAME FigureBlock.figureInputs as slides, so
 * their data containers carry `undefined`s that JSON drops. Round-trip them
 * through the same sentinel encode/decode (applied per registry entry).
 */
export function prepareReportFiguresForTransmit(
  figures: Record<string, FigureBlock>,
): Record<string, FigureBlock> {
  const out: Record<string, FigureBlock> = {};
  for (const [id, block] of Object.entries(figures)) {
    out[id] = processFigureInputsInBlock(block, deepReplaceUndefined) as FigureBlock;
  }
  return out;
}

export function restoreReportFiguresAfterReceive(
  figures: Record<string, FigureBlock>,
): Record<string, FigureBlock> {
  const out: Record<string, FigureBlock> = {};
  for (const [id, block] of Object.entries(figures)) {
    out[id] = processFigureInputsInBlock(block, deepRestoreUndefined) as FigureBlock;
  }
  return out;
}

