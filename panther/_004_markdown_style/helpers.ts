// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { m } from "./deps.ts";

export function mergeMarginEm(
  c: { top?: number; bottom?: number } | undefined,
  g: { top?: number; bottom?: number } | undefined,
  d: { top: number; bottom: number },
  elementFontSize: number,
): { top: number; bottom: number } {
  return {
    top: m(c?.top, g?.top, d.top) * elementFontSize,
    bottom: m(c?.bottom, g?.bottom, d.bottom) * elementFontSize,
  };
}

export function mergeListMarginEm(
  c: { top?: number; bottom?: number; gap?: number } | undefined,
  g: { top?: number; bottom?: number; gap?: number } | undefined,
  d: { top: number; bottom: number; gap: number },
  listFontSize: number,
): { top: number; bottom: number; gap: number } {
  return {
    top: m(c?.top, g?.top, d.top) * listFontSize,
    bottom: m(c?.bottom, g?.bottom, d.bottom) * listFontSize,
    gap: m(c?.gap, g?.gap, d.gap) * listFontSize,
  };
}

export function mergeListLevelEm(
  c:
    | { marker?: string; markerIndentEm?: number; textIndentEm?: number }
    | undefined,
  g:
    | { marker?: string; markerIndentEm?: number; textIndentEm?: number }
    | undefined,
  d: { marker: string; markerIndentEm: number; textIndentEm: number },
  listFontSize: number,
): { marker: string; markerIndent: number; textIndent: number } {
  return {
    marker: m(c?.marker, g?.marker, d.marker),
    markerIndent: m(c?.markerIndentEm, g?.markerIndentEm, d.markerIndentEm) *
      listFontSize,
    textIndent: m(c?.textIndentEm, g?.textIndentEm, d.textIndentEm) *
      listFontSize,
  };
}
