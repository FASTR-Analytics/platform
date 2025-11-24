// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { MarkdownPresentation } from "../content/markdown_presentation.tsx";

type Props = {
  slides: string[];
  scale: number;
  leftAlignMath?: boolean;
  onComplete: () => void;
};

export function PrintSlides(p: Props) {
  let iframeRef: HTMLIFrameElement | undefined;
  let dispose: (() => void) | undefined;
  let afterPrintHandler: (() => void) | undefined;
  let timeoutId: number | undefined;

  onMount(() => {
    const iframeDoc = iframeRef?.contentDocument;
    if (!iframeDoc) return;

    iframeDoc.open();
    // Copy stylesheets from parent document
    const stylesheets = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          if (sheet.href) {
            return `<link rel="stylesheet" href="${sheet.href}">`;
          }
          const rules = Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");
          return `<style>${rules}</style>`;
        } catch (e) {
          // CORS issues with external stylesheets
          if (sheet.href) {
            return `<link rel="stylesheet" href="${sheet.href}">`;
          }
          return "";
        }
      })
      .join("\n");

    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Print Slides</title>
          ${stylesheets}
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
          <style>
            @page {
              size: landscape;
              margin: 0.5cm;
            }
            body {
              margin: 0;
              padding: 0;
              overflow-y: auto;
            }
            .print-slide {
              padding: 2em;
            }
            @media print {
              body {
                overflow: visible;
              }
              .print-slide {
                page-break-after: always;
                page-break-inside: avoid;
                break-after: page;
                break-inside: avoid;
              }
              .print-slide:last-child {
                page-break-after: auto;
                break-after: auto;
              }
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>
    `);
    iframeDoc.close();

    const root = iframeDoc.getElementById("root");
    if (!root) return;

    dispose = render(
      () => (
        <For each={p.slides}>
          {(slide) => (
            <div class="print-slide">
              <MarkdownPresentation
                markdown={slide}
                scale={p.scale}
                leftAlignMath={p.leftAlignMath}
              />
            </div>
          )}
        </For>
      ),
      root,
    );

    // Wait for images and fonts to load before printing
    const waitForContent = () => {
      const iframe = iframeRef?.contentWindow;
      if (!iframe) return;

      // Wait for images
      const images = Array.from(iframeDoc.images);
      const imagePromises = images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve(null);
            } else {
              img.onload = () => resolve(null);
              img.onerror = () => resolve(null);
            }
          }),
      );

      Promise.all(imagePromises).then(() => {
        setTimeout(() => {
          afterPrintHandler = () => {
            if (timeoutId) clearTimeout(timeoutId);
            p.onComplete();
          };

          iframe.addEventListener("afterprint", afterPrintHandler);
          iframe.focus();
          iframe.print();

          // Fallback timeout in case afterprint doesn't fire
          timeoutId = setTimeout(() => {
            p.onComplete();
          }, 60000) as unknown as number; // 1 minute fallback
        }, 1000);
      });
    };

    setTimeout(waitForContent, 500);
  });

  onCleanup(() => {
    if (afterPrintHandler && iframeRef?.contentWindow) {
      iframeRef.contentWindow.removeEventListener("afterprint", afterPrintHandler);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    dispose?.();
  });

  return (
    <iframe
      ref={iframeRef}
      style={{
        position: "absolute",
        width: "0",
        height: "0",
        border: "none",
      }}
    />
  );
}
