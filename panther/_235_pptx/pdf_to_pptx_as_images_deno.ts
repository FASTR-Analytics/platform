// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  defaultTempManager,
  join,
  PptxGenJS,
  type PptxGenJSInstance,
} from "./deps.ts";

const DPI = 96;

export async function pdfToPptxAsImagesDeno(
  pdfFilePath: string,
  imageWidth: number,
): Promise<PptxGenJSInstance> {
  const infoCmd = new Deno.Command("pdfinfo", { args: [pdfFilePath] });
  const infoOutput = await infoCmd.output();
  if (!infoOutput.success) {
    throw new Error(
      "pdfinfo failed: " + new TextDecoder().decode(infoOutput.stderr),
    );
  }
  const infoText = new TextDecoder().decode(infoOutput.stdout);
  const sizeMatch = infoText.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/);
  if (!sizeMatch) {
    throw new Error("Could not parse page size from pdfinfo output");
  }
  const pdfW = parseFloat(sizeMatch[1]);
  const pdfH = parseFloat(sizeMatch[2]);
  const aspectRatio = pdfH / pdfW;

  const imageHeight = Math.round(imageWidth * aspectRatio);

  const tempDir = await defaultTempManager.createTempDir({
    prefix: "pptx-img-",
  });

  const command = new Deno.Command("pdftoppm", {
    args: [
      "-png",
      "-scale-to-x",
      imageWidth.toFixed(),
      "-scale-to-y",
      "-1",
      pdfFilePath,
      join(tempDir, "slide"),
    ],
  });
  const output = await command.output();
  if (!output.success) {
    throw new Error(
      "pdftoppm failed: " + new TextDecoder().decode(output.stderr),
    );
  }

  const imageFiles: { name: string; order: number }[] = [];
  for await (const entry of Deno.readDir(tempDir)) {
    if (entry.name.endsWith(".png")) {
      const match = entry.name.match(/(\d+)/);
      if (match) {
        imageFiles.push({ name: entry.name, order: Number(match[1]) });
      }
    }
  }
  imageFiles.sort((a, b) => a.order - b.order);

  // deno-lint-ignore no-explicit-any
  const pptx = new (PptxGenJS as any)() as PptxGenJSInstance;

  pptx.defineLayout({
    name: "CUSTOM",
    width: imageWidth / DPI,
    height: imageHeight / DPI,
  });
  pptx.layout = "CUSTOM";

  for (const img of imageFiles) {
    const slide = pptx.addSlide();
    slide.addImage({
      path: join(tempDir, img.name),
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  return pptx;
}
