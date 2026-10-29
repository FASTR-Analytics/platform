// PNG rasters of report figures for the HTML preview (blob URLs, one per
// distinct figure CONTENT). Keyed by a content key — metricId | snapshotAt |
// canonical config — NOT by FigureBlock object identity: under live collab
// every remote update materializes fresh block objects (lib/collab/report_crdt.ts
// readFigureEntry), so identity keying would re-rasterize every figure on every
// peer keystroke. snapshotAt is stamped on every resolve and config is what the
// collab figure modal co-edits, so together they change exactly when the
// picture does. A WeakMap memoizes the key per block object so identity hits
// skip the JSON.
//
// Rasterization is serial and yields a frame between figures (an initial load
// with a dozen figures must not freeze the tab); fonts are preloaded first
// (panther figure_holder idiom) so text measures correctly on the export-sized
// canvas.

import {
  canonicalJson,
  type FastrChartPalette,
  FIGURE_EXPORT_WIDTH_PX,
  type FigureBlock,
} from "lib";
import {
  CustomFigureStyle,
  getFigureAsCanvas,
  loadFontsWithTimeout,
} from "panther";
import {
  awaitFigureBoundaries,
  buildFigureInputs,
} from "~/generate_visualization/mod";
import { figureInputsForDownload } from "./_report_export_maps";
import type { FigureInkTheme, FigureRasterState } from "report-forge";

// Merge the theme into FigureInputs.style (touched paths only; explicit
// per-element colors from the figure's own config still win over text.base).
export function applyInkTheme<T extends { style?: Record<string, unknown> }>(
  fi: T,
  theme: FigureInkTheme | undefined,
): T {
  if (!theme) return fi;
  const style = (fi.style ?? {}) as {
    text?: { base?: Record<string, unknown> };
    grid?: Record<string, unknown>;
    table?: Record<string, unknown>;
    content?: {
      tableColHeaders?: { func?: unknown; textFormatter?: unknown };
    } & Record<string, unknown>;
  };
  // Column headers sit on the page, not on a painted band: panther's default
  // header ground is the base page key, which is a different colour from
  // the document's page (and near-black in a dark app), so the years row
  // would read as a strip with its labels lost on it. Only the ground is
  // overridden — alignment and any per-header rule a figure carries stay.
  const prevHeader = style.content?.tableColHeaders?.func;
  const headerFunc = typeof prevHeader === "function"
    ? (info: unknown) => ({
      ...(prevHeader as (i: unknown) => Record<string, unknown>)(info),
      backgroundColor: "none",
    })
    : {
      ...(typeof prevHeader === "object" && prevHeader !== null
        ? prevHeader
        : {}),
      backgroundColor: "none",
    };
  return {
    ...fi,
    style: {
      ...style,
      text: {
        ...style.text,
        base: { ...style.text?.base, color: theme.text },
      },
      grid: {
        ...style.grid,
        axisColor: theme.axis,
        gridColor: theme.grid,
      },
      table: {
        ...style.table,
        headerBorderColor: theme.axis,
        gridLineColor: theme.grid,
        borderColor: theme.axis,
      },
      content: {
        ...style.content,
        tableColHeaders: {
          ...style.content?.tableColHeaders,
          func: headerFunc,
        },
      },
    },
  };
}

export type FigureRasterCache = {
  // Current state for the figure AT the given ink; a first call for a new
  // (content, ink) pair starts the rasterization and returns "pending"
  // (onReady fires when it lands). `ink` undefined = default dark ink.
  get: (
    id: string,
    block: FigureBlock,
    ink?: FigureInkTheme,
    chartPalette?: FastrChartPalette,
  ) => FigureRasterState;
  dispose: () => void;
};

type Entry = {
  state: FigureRasterState;
  block: FigureBlock;
  ink: FigureInkTheme | undefined;
  chartPalette: FastrChartPalette | undefined;
};

export function figureRasterKey(block: FigureBlock): string | undefined {
  const b = block.bundle;
  if (!b) return undefined;
  return `${b.metricId}|${b.snapshotAt}|${canonicalJson(b.config)}`;
}

export function createFigureRasterCache(
  onReady: () => void,
): FigureRasterCache {
  const keyMemo = new WeakMap<FigureBlock, string>();
  const entries = new Map<string, Entry>();
  // figure id → key it currently shows (to revoke superseded rasters and to
  // seed the pending placeholder with the previous aspect).
  const keyById = new Map<string, string>();
  const queue: string[] = [];
  let pumping = false;
  let disposed = false;

  function keyOf(block: FigureBlock): string | undefined {
    let k = keyMemo.get(block);
    if (k === undefined) {
      k = figureRasterKey(block);
      if (k !== undefined) keyMemo.set(block, k);
    }
    return k;
  }

  function revokeIfUnused(key: string) {
    for (const k of keyById.values()) if (k === key) return;
    const e = entries.get(key);
    if (e?.state.state === "ready") URL.revokeObjectURL(e.state.url);
    entries.delete(key);
  }

  async function rasterize(entry: Entry): Promise<FigureRasterState> {
    try {
      await awaitFigureBoundaries(entry.block.bundle!);
      const built = buildFigureInputs(
        entry.block.bundle!,
        undefined,
        entry.chartPalette,
      );
      if (!built.ok) return { state: "missing" };
      const fi = built.inputs;
      const style = new CustomFigureStyle(fi.style);
      await loadFontsWithTimeout(style.getFontsToRegister());
      // Transparent raster: the report style's CSS paints whatever sits
      // behind the figure (flat color, texture, gradient) — the base
      // stylesheet gives embeds a white default, so unstyled reports look
      // unchanged. Chart ink is dark, so styles must keep light grounds
      // behind figures (the briefs say so).
      const themed = applyInkTheme(
        figureInputsForDownload(fi, true, false),
        entry.ink,
      );
      const canvas = getFigureAsCanvas(themed, FIGURE_EXPORT_WIDTH_PX);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png")
      );
      if (!blob) return { state: "missing" };
      return {
        state: "ready",
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
      };
    } catch {
      return { state: "missing" };
    }
  }

  async function pump() {
    if (pumping || disposed) return;
    pumping = true;
    try {
      while (queue.length > 0 && !disposed) {
        const key = queue.shift()!;
        const entry = entries.get(key);
        if (!entry || entry.state.state !== "pending") continue;
        const next = await rasterize(entry);
        if (disposed) {
          if (next.state === "ready") URL.revokeObjectURL(next.url);
          return;
        }
        entry.state = next;
        onReady();
        await new Promise<void>((res) => requestAnimationFrame(() => res()));
      }
    } finally {
      pumping = false;
    }
  }

  return {
    get(id, block, ink, chartPalette) {
      const contentKey = keyOf(block);
      if (contentKey === undefined) return { state: "missing" };
      const key = `${contentKey}|ink:${
        ink ? ink.text + ink.axis : "dark"
      }|pal:${chartPalette ? JSON.stringify(chartPalette) : "-"}`;
      const prevKey = keyById.get(id);
      const prev = prevKey !== undefined ? entries.get(prevKey) : undefined;
      const aspect = prev?.state.state === "ready"
        ? prev.state.width / prev.state.height
        : undefined;
      if (prevKey !== key) {
        keyById.set(id, key);
        if (prevKey !== undefined) revokeIfUnused(prevKey);
      }
      const existing = entries.get(key);
      if (existing) return existing.state;
      const entry: Entry = {
        state: { state: "pending", aspect },
        block,
        ink,
        chartPalette,
      };
      entries.set(key, entry);
      queue.push(key);
      void pump();
      return entry.state;
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      for (const e of entries.values()) {
        if (e.state.state === "ready") URL.revokeObjectURL(e.state.url);
      }
      entries.clear();
      keyById.clear();
    },
  };
}

// The box a figure's RASTER will have, without drawing it at export size:
// panther lays a figure out at its reference width whatever the output
// pixels, so a 200px draw yields the same aspect as the 1920px raster the
// PDF embeds. The editor's paginator gives figures this box, so its pages
// agree with the PDF's. Fonts first, as for the raster: text measured before
// the figure's fonts load can wrap a title onto a different line count.
export type FigureSizeCache = {
  // The size when known; undefined starts the measurement (onReady fires
  // when it lands) or means the figure cannot be laid out at all.
  get: (
    id: string,
    block: FigureBlock,
  ) => { width: number; height: number } | undefined;
  dispose: () => void;
};

export function createFigureSizeCache(onReady: () => void): FigureSizeCache {
  // Content key → size, null while in flight, false when the figure failed.
  const sizes = new Map<
    string,
    { width: number; height: number } | null | false
  >();
  let disposed = false;

  async function measure(key: string, block: FigureBlock): Promise<void> {
    let next: { width: number; height: number } | false = false;
    try {
      // A failed measure is stored as false for the content key and never
      // re-measured, so the boundaries are awaited rather than built loading.
      await awaitFigureBoundaries(block.bundle!);
      if (disposed) return;
      const built = buildFigureInputs(block.bundle!, undefined, undefined);
      if (built.ok) {
        const fi = built.inputs;
        const style = new CustomFigureStyle(fi.style);
        await loadFontsWithTimeout(style.getFontsToRegister());
        if (disposed) return;
        // At the RASTER's own width, so this box is the raster's box to the
        // pixel: a chart's height is not linear in its width (an axis label or
        // a legend wraps at one width and not another), and measuring at a
        // narrow probe width and scaling up gave an aspect ~0.3% off the
        // raster the PDF embeds, about a pixel over a page-wide figure, which
        // is enough to move a block across a page boundary.
        const canvas = getFigureAsCanvas(
          figureInputsForDownload(fi, true, false),
          FIGURE_EXPORT_WIDTH_PX,
        );
        if (canvas.width > 0 && canvas.height > 0) {
          next = { width: canvas.width, height: canvas.height };
        }
      }
    } catch {
      next = false;
    }
    if (disposed) return;
    sizes.set(key, next);
    onReady();
  }

  return {
    get(_id, block) {
      const key = figureRasterKey(block);
      if (key === undefined) return undefined;
      const hit = sizes.get(key);
      if (hit === undefined) {
        sizes.set(key, null);
        void measure(key, block);
        return undefined;
      }
      return hit === null || hit === false ? undefined : hit;
    },
    dispose() {
      disposed = true;
      sizes.clear();
    },
  };
}
