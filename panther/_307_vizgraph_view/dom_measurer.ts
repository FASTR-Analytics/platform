// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { loadFontsWithTimeout, render } from "./deps.ts";
import type { FontInfo, JSX } from "./deps.ts";

// DOM-backed NodeMeasurer backend (DOC_VIZGRAPH_ARCHITECTURE.md, view module).
// Synchronous by contract: the engine calls it mid-layout inside the
// stage-3.5 fixed point. Fonts are the only async part and gate through
// `ready` BEFORE layout runs.

export type MeasuredSize = { w: number; h: number };

export type DomTextStyle = {
  fontFamily: string;
  fontSizePx: number;
  fontWeight?: number;
  italic?: boolean;
  lineHeight?: number;
};

export type DomMeasurerOptions = {
  fonts?: FontInfo[];
  // Styling context the probe inherits from (theme vars, classes). Ancestor
  // CSS scale transforms are compensated via a calibration probe;
  // rotation/skew ancestors are unsupported.
  container?: HTMLElement;
};

export type DomMeasurer = {
  ready: Promise<void>;
  isReady: () => boolean;
  // Requested fonts that failed document.fonts.check after the ready gate —
  // their measurements silently use fallback fonts. Warned once on console.
  missingFonts: () => string[];
  measureElement: (
    content: () => JSX.Element,
    maxWidth: number,
  ) => MeasuredSize;
  // Text sugar over the same probe path: no wrapper box is created, so the
  // text measures tight (widest line) without the display:contents idiom
  // measureElement content needs. Cacheable by (text, style, maxWidth).
  measureText: (
    text: string,
    style: DomTextStyle,
    maxWidth: number,
  ) => MeasuredSize;
  dispose: () => void;
};

const CALIBRATION_PX = 100;

export function createDomMeasurer(options?: DomMeasurerOptions): DomMeasurer {
  const container = options?.container ?? document.body;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  // Keeps each measurement's forced reflow local to this subtree instead of
  // invalidating the document.
  host.style.contain = "layout style";
  // Known layout size → accumulated ancestor scale, read per call (transforms
  // scale client rects without reflowing layout; a camera zoom between calls
  // must not change results).
  const calibration = document.createElement("div");
  calibration.style.width = `${CALIBRATION_PX}px`;
  calibration.style.height = `${CALIBRATION_PX}px`;
  host.appendChild(calibration);
  container.appendChild(host);

  let fontsReady = false;
  let disposed = false;
  let missing: string[] = [];
  const requested = options?.fonts ?? [];
  const ready = loadFontsWithTimeout(requested).then(() => {
    // fonts.check() returns TRUE for a family with no registered @font-face
    // (fallback would render immediately), so unregistered families must be
    // caught via the FontFaceSet. Consequence: list WEB fonts here, not
    // system families — a system font would be reported missing.
    const registered = new Set(
      [...document.fonts].map((face) =>
        face.family.replace(/^["']|["']$/g, "")
      ),
    );
    missing = requested
      .filter((f) =>
        !registered.has(f.fontFamily) ||
        !document.fonts.check(
          `${f.italic ? "italic " : ""}${f.weight} 16px "${f.fontFamily}"`,
        )
      )
      .map((f) => `${f.fontFamily} ${f.weight}${f.italic ? " italic" : ""}`);
    if (missing.length > 0) {
      console.warn(
        `DomMeasurer: fonts not loaded, measurements will use fallbacks: ${
          missing.join(", ")
        }`,
      );
    }
    fontsReady = true;
  });

  function measureWithProbe(
    populate: (probe: HTMLDivElement) => () => void,
    maxWidth: number,
  ): MeasuredSize {
    if (disposed) {
      throw new Error("DomMeasurer is disposed");
    }
    if (!fontsReady) {
      throw new Error("DomMeasurer not ready — await .ready before measuring");
    }
    if (Number.isNaN(maxWidth) || maxWidth < 0) {
      throw new Error(`DomMeasurer: invalid maxWidth ${maxWidth}`);
    }

    const probe = document.createElement("div");
    // The probe IS the wrap constraint. maxWidth = Infinity is the engine's
    // ideal probe (natural, unwrapped); maxWidth = 0 is its min probe (wrap at
    // every opportunity — the widest resulting box is the true floor, and it
    // exceeds the budget by design).
    probe.style.width = maxWidth === Number.POSITIVE_INFINITY
      ? "max-content"
      : `${maxWidth}px`;
    host.appendChild(probe);
    const cleanup = populate(probe);
    try {
      const cal = calibration.getBoundingClientRect();
      const scaleX = cal.width / CALIBRATION_PX;
      const scaleY = cal.height / CALIBRATION_PX;
      if (scaleX <= 0 || scaleY <= 0) {
        throw new Error(
          "DomMeasurer: container is not renderable (display:none ancestor?)",
        );
      }
      const probeRect = probe.getBoundingClientRect();
      // Width = widest rendered box, never the budget. Walked explicitly:
      // text nodes contribute per-line rects, elements their border boxes.
      // Consequence: tight text measures its widest line, a full-width block
      // child means "this node takes the budget", and styling wrappers that
      // must not create a box use display:contents (zero rect, harmless).
      const range = document.createRange();
      let right = probeRect.left;
      const walker = document.createTreeWalker(
        probe,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          // Whole-node range, one rect per line box. Verified across
          // chromium/webkit/firefox (2026-07-16, measure_lab failure modes
          // #1-#2): no engine includes the hanging trailing space before a
          // line break in these rects, and webkit integer-quantizes rects
          // for PROPER substrings of a text node — never subdivide the range.
          range.selectNodeContents(n);
          for (const rect of range.getClientRects()) {
            if (rect.right > right) {
              right = rect.right;
            }
          }
        } else {
          const rect = (n as Element).getBoundingClientRect();
          if (rect.width > 0 && rect.right > right) {
            right = rect.right;
          }
        }
      }
      // Rounding policy (decided on cross-browser evidence, 2026-07-16):
      // exact fractional values, unrounded.
      return {
        w: Math.max(0, right - probeRect.left) / scaleX,
        h: probeRect.height / scaleY,
      };
    } finally {
      cleanup();
      host.removeChild(probe);
    }
  }

  function measureElement(
    content: () => JSX.Element,
    maxWidth: number,
  ): MeasuredSize {
    return measureWithProbe((probe) => render(content, probe), maxWidth);
  }

  function measureText(
    text: string,
    style: DomTextStyle,
    maxWidth: number,
  ): MeasuredSize {
    return measureWithProbe((probe) => {
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontSize = `${style.fontSizePx}px`;
      probe.style.fontWeight = `${style.fontWeight ?? 400}`;
      probe.style.fontStyle = style.italic ? "italic" : "normal";
      if (style.lineHeight !== undefined) {
        probe.style.lineHeight = `${style.lineHeight}`;
      }
      probe.textContent = text;
      return () => {};
    }, maxWidth);
  }

  return {
    ready,
    isReady: () => fontsReady && !disposed,
    missingFonts: () => [...missing],
    measureElement,
    measureText,
    dispose: () => {
      if (!disposed) {
        disposed = true;
        host.remove();
      }
    },
  };
}
