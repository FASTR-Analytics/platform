// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function getPixelsFromPctClientWidth(
  pct: string,
  fallback = 300,
): number {
  if (typeof window === "undefined") {
    return fallback;
  }

  const cleaned = pct.trim().replace(/[%\s]/g, "");
  const percentage = parseFloat(cleaned);

  if (isNaN(percentage) || !isFinite(percentage)) {
    return fallback;
  }

  const clamped = Math.max(0, Math.min(100, percentage));
  return Math.round((window.innerWidth * clamped) / 100);
}

export function getPixelsFromPctClientHeight(
  pct: string,
  fallback = 300,
): number {
  if (typeof window === "undefined") {
    return fallback;
  }

  const cleaned = pct.trim().replace(/[%\s]/g, "");
  const percentage = parseFloat(cleaned);

  if (isNaN(percentage) || !isFinite(percentage)) {
    return fallback;
  }

  const clamped = Math.max(0, Math.min(100, percentage));
  return Math.round((window.innerHeight * clamped) / 100);
}
