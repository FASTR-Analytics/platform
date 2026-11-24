// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Imports zod and nothing else, against the deps.ts rule, so that an app can
// copy this file into a repo that has no panther. shared.ts binds each schema
// to its hand-written type.
import { z } from "zod";

export const zColorKey = z.strictObject({
  key: z.enum([
    "base100",
    "base200",
    "base300",
    "baseContent",
    "primary",
    "primaryContent",
    "neutral",
    "neutralContent",
    "success",
    "successContent",
    "warning",
    "warningContent",
    "danger",
    "dangerContent",
  ]),
});

// What Color reads as hex, with or without alpha. Color's own patterns are in
// _001_color, which this file cannot import.
export const zHexColor = z.string().regex(
  /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i,
);

export const zColorKeyOrString = z.union([z.string(), zColorKey]);

export const zColorKeyOrHex = z.union([zHexColor, zColorKey]);

export const zContinuousPaletteName = z.enum([
  "blues",
  "greens",
  "reds",
  "oranges",
  "purples",
  "greys",
  "viridis",
  "plasma",
  "inferno",
  "magma",
  "turbo",
  "yl-gn-bu",
  "yl-or-rd",
  "bu-pu",
  "bu-gn",
  "gn-bu",
  "or-rd",
  "pu-bu",
  "pu-rd",
  "rd-pu",
  "yl-gn",
  "yl-or-br",
  "rd-bu",
  "rd-yl-gn",
  "rd-gn-muted",
  "rd-gn-gold",
  "rd-gn-army",
  "traffic-light",
  "br-bg",
  "pi-yg",
  "pr-gn",
  "pu-or",
  "rd-gy",
  "spectral",
  "rd-yl-bu",
]);

export const zMapProjection = z.enum([
  "equirectangular",
  "mercator",
  "naturalEarth1",
]);

export const zMapDataLabelMode = z.enum([
  "none",
  "centroid",
  "callout",
  "auto",
]);

export const zValueSort = z.enum(["ascending", "descending", "none"]);

export const zNColsOrAuto = z.union([z.literal("auto"), z.int().min(1)]);
