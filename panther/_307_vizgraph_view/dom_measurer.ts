// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { loadFontsWithTimeout, render } from "./deps.ts";
import type { FontInfo, JSX } from "./deps.ts";

// DOM-backed NodeMeasurer backend (PLAN_DOM_MEASURER.md). Synchronous by
// contract: the engine calls it mid-layout inside the stage-3.5 fixed point.
// Fonts are the only async part and gate through `ready` BEFORE layout runs.

export type MeasuredSize = { w: number; h: number };

export type DomMeasurerOptions = {
  fonts?: FontInfo[];
  // Styling context the probe inherits from (theme vars, classes). Must not
  // sit inside a CSS-transformed ancestor — client rects come back transformed.
  container?: HTMLElement;
};

export type DomMeasurer = {
  ready: Promise<void>;
  isReady: () => boolean;
  measureElement: (
    content: () => JSX.Element,
    maxWidth: number,
  ) => MeasuredSize;
  dispose: () => void;
};

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
  container.appendChild(host);

  let fontsReady = false;
  let disposed = false;
  const ready = loadFontsWithTimeout(options?.fonts ?? []).then(() => {
    fontsReady = true;
  });

  function measureElement(
    content: () => JSX.Element,
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
    const disposeRender = render(content, probe);
    try {
      const probeRect = probe.getBoundingClientRect();
      // Width = widest rendered box, never the budget. Walked explicitly
      // (Range.getClientRects over a subtree varies by browser): text nodes
      // contribute per-line rects, elements their border boxes. Consequence:
      // tight text measures its widest line, a full-width block child means
      // "this node takes the budget", and styling wrappers that must not
      // create a box use display:contents (zero rect, harmless).
      const range = document.createRange();
      let right = probeRect.left;
      const walker = document.createTreeWalker(
        probe,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          // Per word run (collapsible whitespace excluded), not per line: a
          // line's rect includes the hanging trailing space before its break,
          // inflating the width by one space advance (lab failure mode #1).
          // NBSP is not collapsible and stays inside runs. Known limit:
          // white-space: pre/pre-wrap trailing spaces are real content but
          // are excluded by this rule.
          const text = n.textContent ?? "";
          const runs = /[^ \t\n\r]+/g;
          for (let m = runs.exec(text); m !== null; m = runs.exec(text)) {
            range.setStart(n, m.index);
            range.setEnd(n, m.index + m[0].length);
            for (const rect of range.getClientRects()) {
              if (rect.right > right) {
                right = rect.right;
              }
            }
          }
        } else {
          const rect = (n as Element).getBoundingClientRect();
          if (rect.width > 0 && rect.right > right) {
            right = rect.right;
          }
        }
      }
      // Rounding policy (ONE place, lab-decided — PLAN_DOM_MEASURER.md):
      // exact fractional values, unrounded.
      return { w: Math.max(0, right - probeRect.left), h: probeRect.height };
    } finally {
      disposeRender();
      host.removeChild(probe);
    }
  }

  return {
    ready,
    isReady: () => fontsReady && !disposed,
    measureElement,
    dispose: () => {
      if (!disposed) {
        disposed = true;
        host.remove();
      }
    },
  };
}
