// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomStyleTextOptions, TextInfoOptions } from "./deps.ts";

// Canonical source of truth for all figure text style keys
export const FIGURE_TEXT_STYLE_KEYS = [
  "base",
  "caption",
  "subCaption",
  "footnote",
  "xTextAxisTickLabels",
  "xPeriodAxisTickLabels",
  "xScaleAxisTickLabels",
  "xTextAxisLabel",
  "xScaleAxisLabel",
  "yTextAxisTickLabels",
  "yScaleAxisTickLabels",
  "yTextAxisLabel",
  "yScaleAxisLabel",
  "colGroupLabels",
  "dataLabels",
  "arrowLabels",
  "legend",
  // Table
  "colHeaders",
  "rowHeaders",
  "colGroupHeaders",
  "rowGroupHeaders",
  "cells",
  // Charts
  "laneHeaders",
  "tierHeaders",
  "paneHeaders",
  // SimpleViz
  "simplevizBoxTextPrimary",
  "simplevizBoxTextSecondary",
] as const;

// Extract the type from the const array
export type FigureTextStyleKey = (typeof FIGURE_TEXT_STYLE_KEYS)[number];

// Type for the text options object - base uses TextInfoOptions, others use CustomStyleTextOptions
export type FigureTextStyleOptions = {
  [K in FigureTextStyleKey]?: K extends "base" ? TextInfoOptions
    : CustomStyleTextOptions;
};
