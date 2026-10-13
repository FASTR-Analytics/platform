// What the editor asks its host about the things a document embeds: images
// (which the editor draws itself, from a URL) and figures (which it never
// draws: the host supplies the component, the editor supplies the box).

import type { Component } from "solid-js";
import type { FastrOpenFence } from "../../engine/fastr_markdown_blocks.ts";
import type { FastrChartPalette } from "../../engine/report_fastr_themes.ts";
import type { FigureInkTheme } from "../figure_ink.ts";

export type EmbedKind = "figure" | "image";

// An image the document refers to by id: `imgFile` is whatever the host's
// `assetUrl` turns into a URL (a path, a storage key, a URL already).
export type ReportImage = { type: "image"; imgFile: string };

// What a host's figure component is given. It draws figure `id` to the width
// of its container at the figure's own aspect, and calls `onMeasured` when
// its height is known or changes.
export type FigureViewProps = {
  id: string;
  // The ink for the ground the figure stands on, asked of its own element
  // once it is in the document: dark ink on a light ground, light on dark.
  inkFor: (el: Element) => FigureInkTheme | undefined;
  // The document theme's series colours, for a host that themes its charts.
  chartPalette: () => FastrChartPalette | undefined;
  onMeasured: () => void;
};

export type EmbedResolver = {
  // Whether the document has a figure of this id; a token for one it does
  // not have reads "Missing visualization".
  hasFigure: (id: string) => boolean;
  // The host's figure component. Absent in a host with no figures.
  FigureView: Component<FigureViewProps> | undefined;
  getImage: (id: string) => ReportImage | undefined;
  assetUrl: (imgFile: string) => string;
  // Clicking an embed selects it (the toolbar shows its controls).
  onSelectEmbed: (kind: EmbedKind, id: string) => void;
  getSelectedId: () => string | undefined;
  // A `:::logos` row asks for its picker (double-click, or a click on an
  // empty row).
  onEditLogos?: (fence: FastrOpenFence) => void;
  // The ink a figure takes on the ground behind `el` (dark on light, light
  // on dark), from the document's own palette.
  inkFor: (el: Element) => FigureInkTheme | undefined;
  // The document theme's series palette for its figures.
  chartPalette: () => FastrChartPalette | undefined;
  // The box a figure's raster has (what the PDF embeds and the print layout
  // gives the figure) and an image's natural size: the live embed takes the
  // same box BEFORE it draws, so its widget never measures a transient
  // height. Undefined while the size is being measured; the host calls the
  // editor's refreshEmbedSizes when it lands.
  figureSize?: (id: string) => { width: number; height: number } | undefined;
  imageSize?: (id: string) => { width: number; height: number } | undefined;
};
