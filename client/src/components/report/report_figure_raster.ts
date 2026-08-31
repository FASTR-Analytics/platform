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
  type FigureBlock,
  FIGURE_EXPORT_WIDTH_PX,
} from "lib";
import {
  CustomFigureStyle,
  getFigureAsCanvas,
  loadFontsWithTimeout,
} from "panther";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { figureInputsForDownload } from "~/exports/_dashboard_export_model";
import type { FigureRasterState } from "./report_html";

export type FigureRasterCache = {
  // Current state for the figure; a first call for new content starts the
  // rasterization and returns "pending" (onReady fires when it lands).
  get: (id: string, block: FigureBlock) => FigureRasterState;
  dispose: () => void;
};

type Entry = {
  state: FigureRasterState;
  block: FigureBlock;
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
      const bundle = entry.block.bundle!;
      const fi = buildFigureInputs(bundle);
      const style = new CustomFigureStyle(fi.style);
      await loadFontsWithTimeout(style.getFontsToRegister());
      // Transparent raster: the report style's CSS paints whatever sits
      // behind the figure (flat color, texture, gradient) — the base
      // stylesheet gives embeds a white default, so unstyled reports look
      // unchanged. Chart ink is dark, so styles must keep light grounds
      // behind figures (the briefs say so).
      const canvas = getFigureAsCanvas(
        figureInputsForDownload(fi, true, false),
        FIGURE_EXPORT_WIDTH_PX,
      );
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
    get(id, block) {
      const key = keyOf(block);
      if (key === undefined) return { state: "missing" };
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
      const entry: Entry = { state: { state: "pending", aspect }, block };
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
