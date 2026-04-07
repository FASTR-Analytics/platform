// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor } from "./key_colors.ts";
import type { ColorKeyOrString } from "./types.ts";

export type PaletteCategory = "sequential" | "diverging" | "qualitative";

export type SequentialPaletteName =
  | "blues"
  | "greens"
  | "reds"
  | "oranges"
  | "purples"
  | "greys"
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "turbo"
  | "yl-gn-bu"
  | "yl-or-rd"
  | "bu-pu"
  | "bu-gn"
  | "gn-bu"
  | "or-rd"
  | "pu-bu"
  | "pu-rd"
  | "rd-pu"
  | "yl-gn"
  | "yl-or-br";

export type DivergingPaletteName =
  | "rd-bu"
  | "rd-yl-gn"
  | "rd-gn-muted"
  | "rd-gn-gold"
  | "rd-gn-army"
  | "traffic-light"
  | "br-bg"
  | "pi-yg"
  | "pr-gn"
  | "pu-or"
  | "rd-gy"
  | "spectral"
  | "rd-yl-bu";

export type QualitativePaletteName =
  | "set1"
  | "set2"
  | "set3"
  | "pastel1"
  | "pastel2"
  | "dark2"
  | "paired"
  | "accent"
  | "category10"
  | "tableau10";

export type ContinuousPaletteName =
  | SequentialPaletteName
  | DivergingPaletteName;

export type PaletteName =
  | SequentialPaletteName
  | DivergingPaletteName
  | QualitativePaletteName;

export type PaletteOption = {
  id: PaletteName;
  label: string;
  category: PaletteCategory;
};

type BuiltInPalette = {
  stops: string[];
  category: PaletteCategory;
  label: string;
};

const PALETTES: Record<PaletteName, BuiltInPalette> = {
  // Sequential single-hue (ColorBrewer 9-class)
  blues: {
    label: "Blues",
    category: "sequential",
    stops: [
      "#f7fbff",
      "#deebf7",
      "#c6dbef",
      "#9ecae1",
      "#6baed6",
      "#4292c6",
      "#2171b5",
      "#08519c",
      "#08306b",
    ],
  },
  greens: {
    label: "Greens",
    category: "sequential",
    stops: [
      "#f7fcf5",
      "#e5f5e0",
      "#c7e9c0",
      "#a1d99b",
      "#74c476",
      "#41ab5d",
      "#238b45",
      "#006d2c",
      "#00441b",
    ],
  },
  reds: {
    label: "Reds",
    category: "sequential",
    stops: [
      "#fff5f0",
      "#fee0d2",
      "#fcbba1",
      "#fc9272",
      "#fb6a4a",
      "#ef3b2c",
      "#cb181d",
      "#a50f15",
      "#67000d",
    ],
  },
  oranges: {
    label: "Oranges",
    category: "sequential",
    stops: [
      "#fff5eb",
      "#fee6ce",
      "#fdd0a2",
      "#fdae6b",
      "#fd8d3c",
      "#f16913",
      "#d94801",
      "#a63603",
      "#7f2704",
    ],
  },
  purples: {
    label: "Purples",
    category: "sequential",
    stops: [
      "#fcfbfd",
      "#efedf5",
      "#dadaeb",
      "#bcbddc",
      "#9e9ac8",
      "#807dba",
      "#6a51a3",
      "#54278f",
      "#3f007d",
    ],
  },
  greys: {
    label: "Greys",
    category: "sequential",
    stops: [
      "#ffffff",
      "#f0f0f0",
      "#d9d9d9",
      "#bdbdbd",
      "#969696",
      "#737373",
      "#525252",
      "#252525",
      "#000000",
    ],
  },

  // Sequential multi-hue (9-stop samples)
  viridis: {
    label: "Viridis",
    category: "sequential",
    stops: [
      "#440154",
      "#482777",
      "#3f4a8a",
      "#31678e",
      "#26838f",
      "#1f9d8a",
      "#6cce5a",
      "#b6de2b",
      "#fee825",
    ],
  },
  plasma: {
    label: "Plasma",
    category: "sequential",
    stops: [
      "#0d0887",
      "#46039f",
      "#7201a8",
      "#9c179e",
      "#bd3786",
      "#d8576b",
      "#ed7953",
      "#fb9f3a",
      "#f0f921",
    ],
  },
  inferno: {
    label: "Inferno",
    category: "sequential",
    stops: [
      "#000004",
      "#1b0c41",
      "#4a0c6b",
      "#781c6d",
      "#a52c60",
      "#cf4446",
      "#ed6925",
      "#fb9b06",
      "#fcffa4",
    ],
  },
  magma: {
    label: "Magma",
    category: "sequential",
    stops: [
      "#000004",
      "#180f3d",
      "#440f76",
      "#721f81",
      "#9e2f7f",
      "#cd4071",
      "#f1605d",
      "#feb078",
      "#fcfdbf",
    ],
  },
  turbo: {
    label: "Turbo",
    category: "sequential",
    stops: [
      "#30123b",
      "#4662d7",
      "#36aaf9",
      "#1ae4b6",
      "#72fe5e",
      "#c8ef34",
      "#faba39",
      "#f66b19",
      "#7a0403",
    ],
  },
  "yl-gn-bu": {
    label: "Yellow-Green-Blue",
    category: "sequential",
    stops: [
      "#ffffd9",
      "#edf8b1",
      "#c7e9b4",
      "#7fcdbb",
      "#41b6c4",
      "#1d91c0",
      "#225ea8",
      "#253494",
      "#081d58",
    ],
  },
  "yl-or-rd": {
    label: "Yellow-Orange-Red",
    category: "sequential",
    stops: [
      "#ffffcc",
      "#ffeda0",
      "#fed976",
      "#feb24c",
      "#fd8d3c",
      "#fc4e2a",
      "#e31a1c",
      "#bd0026",
      "#800026",
    ],
  },
  "bu-pu": {
    label: "Blue-Purple",
    category: "sequential",
    stops: [
      "#f7fcfd",
      "#e0ecf4",
      "#bfd3e6",
      "#9ebcda",
      "#8c96c6",
      "#8c6bb1",
      "#88419d",
      "#810f7c",
      "#4d004b",
    ],
  },
  "bu-gn": {
    label: "Blue-Green",
    category: "sequential",
    stops: [
      "#f7fcfd",
      "#e5f5f9",
      "#ccece6",
      "#99d8c9",
      "#66c2a4",
      "#41ae76",
      "#238b45",
      "#006d2c",
      "#00441b",
    ],
  },
  "gn-bu": {
    label: "Green-Blue",
    category: "sequential",
    stops: [
      "#f7fcf0",
      "#e0f3db",
      "#ccebc5",
      "#a8ddb5",
      "#7bccc4",
      "#4eb3d3",
      "#2b8cbe",
      "#0868ac",
      "#084081",
    ],
  },
  "or-rd": {
    label: "Orange-Red",
    category: "sequential",
    stops: [
      "#fff7ec",
      "#fee8c8",
      "#fdd49e",
      "#fdbb84",
      "#fc8d59",
      "#ef6548",
      "#d7301f",
      "#b30000",
      "#7f0000",
    ],
  },
  "pu-bu": {
    label: "Purple-Blue",
    category: "sequential",
    stops: [
      "#fff7fb",
      "#ece7f2",
      "#d0d1e6",
      "#a6bddb",
      "#74a9cf",
      "#3690c0",
      "#0570b0",
      "#045a8d",
      "#023858",
    ],
  },
  "pu-rd": {
    label: "Purple-Red",
    category: "sequential",
    stops: [
      "#f7f4f9",
      "#e7e1ef",
      "#d4b9da",
      "#c994c7",
      "#df65b0",
      "#e7298a",
      "#ce1256",
      "#980043",
      "#67001f",
    ],
  },
  "rd-pu": {
    label: "Red-Purple",
    category: "sequential",
    stops: [
      "#fff7f3",
      "#fde0dd",
      "#fcc5c0",
      "#fa9fb5",
      "#f768a1",
      "#dd3497",
      "#ae017e",
      "#7a0177",
      "#49006a",
    ],
  },
  "yl-gn": {
    label: "Yellow-Green",
    category: "sequential",
    stops: [
      "#ffffe5",
      "#f7fcb1",
      "#d9f0a3",
      "#addd8e",
      "#78c679",
      "#41ab5d",
      "#238443",
      "#006837",
      "#004529",
    ],
  },
  "yl-or-br": {
    label: "Yellow-Orange-Brown",
    category: "sequential",
    stops: [
      "#ffffe5",
      "#fff7bc",
      "#fee391",
      "#fec44f",
      "#fe9929",
      "#ec7014",
      "#cc4c02",
      "#993404",
      "#662506",
    ],
  },

  // Diverging (ColorBrewer 11-class)
  "rd-bu": {
    label: "Red-Blue",
    category: "diverging",
    stops: [
      "#67001f",
      "#b2182b",
      "#d6604d",
      "#f4a582",
      "#fddbc7",
      "#f7f7f7",
      "#d1e5f0",
      "#92c5de",
      "#4393c3",
      "#2166ac",
      "#053061",
    ],
  },
  "rd-yl-gn": {
    label: "Red-Yellow-Green",
    category: "diverging",
    stops: [
      "#a50026",
      "#d73027",
      "#f46d43",
      "#fdae61",
      "#fee08b",
      "#ffffbf",
      "#d9ef8b",
      "#a6d96a",
      "#66bd63",
      "#1a9850",
      "#006837",
    ],
  },
  "rd-gn-muted": {
    label: "Red-Green Muted",
    category: "diverging",
    stops: [
      "#a3123a",
      "#c93a4e",
      "#e33f43",
      "#f8816b",
      "#ced7c3",
      "#a0c88f",
      "#73ba67",
      "#44914e",
      "#24693d",
    ],
  },
  "rd-gn-gold": {
    label: "Red-Green Gold",
    category: "diverging",
    stops: [
      "#be2a3e",
      "#d94a4a",
      "#e25f48",
      "#f88f4d",
      "#f4d166",
      "#c5d552",
      "#90b960",
      "#4b9b5f",
      "#22763f",
    ],
  },
  "rd-gn-army": {
    label: "Red-Green Army",
    category: "diverging",
    stops: [
      "#d46780",
      "#df91a3",
      "#f0c6c3",
      "#fdfbe4",
      "#d0d3a2",
      "#a3ad62",
      "#798234",
    ],
  },
  "traffic-light": {
    label: "Traffic Light",
    category: "diverging",
    stops: [
      "#cc3232",
      "#db7b2b",
      "#e7b416",
      "#99c140",
      "#2dc937",
    ],
  },
  "br-bg": {
    label: "Brown-Teal",
    category: "diverging",
    stops: [
      "#543005",
      "#8c510a",
      "#bf812d",
      "#dfc27d",
      "#f6e8c3",
      "#f5f5f5",
      "#c7eae5",
      "#80cdc1",
      "#35978f",
      "#01665e",
      "#003c30",
    ],
  },
  "pi-yg": {
    label: "Pink-Yellow-Green",
    category: "diverging",
    stops: [
      "#8e0152",
      "#c51b7d",
      "#de77ae",
      "#f1b6da",
      "#fde0ef",
      "#f7f7f7",
      "#e6f5d0",
      "#b8e186",
      "#7fbc41",
      "#4d9221",
      "#276419",
    ],
  },
  "pr-gn": {
    label: "Purple-Green",
    category: "diverging",
    stops: [
      "#40004b",
      "#762a83",
      "#9970ab",
      "#c2a5cf",
      "#e7d4e8",
      "#f7f7f7",
      "#d9f0d3",
      "#a6dba0",
      "#5aae61",
      "#1b7837",
      "#00441b",
    ],
  },
  "pu-or": {
    label: "Purple-Orange",
    category: "diverging",
    stops: [
      "#2d004b",
      "#542788",
      "#8073ac",
      "#b2abd2",
      "#d8daeb",
      "#f7f7f7",
      "#fee0b6",
      "#fdb863",
      "#e08214",
      "#b35806",
      "#7f3b08",
    ],
  },
  "rd-gy": {
    label: "Red-Grey",
    category: "diverging",
    stops: [
      "#67001f",
      "#b2182b",
      "#d6604d",
      "#f4a582",
      "#fddbc7",
      "#ffffff",
      "#e0e0e0",
      "#bababa",
      "#878787",
      "#4d4d4d",
      "#1a1a1a",
    ],
  },
  spectral: {
    label: "Spectral",
    category: "diverging",
    stops: [
      "#9e0142",
      "#d53e4f",
      "#f46d43",
      "#fdae61",
      "#fee08b",
      "#ffffbf",
      "#e6f598",
      "#abdda4",
      "#66c2a5",
      "#3288bd",
      "#5e4fa2",
    ],
  },
  "rd-yl-bu": {
    label: "Red-Yellow-Blue",
    category: "diverging",
    stops: [
      "#a50026",
      "#d73027",
      "#f46d43",
      "#fdae61",
      "#fee090",
      "#ffffbf",
      "#e0f3f8",
      "#abd9e9",
      "#74add1",
      "#4575b4",
      "#313695",
    ],
  },

  // Qualitative (ColorBrewer + d3)
  set1: {
    label: "Set 1",
    category: "qualitative",
    stops: [
      "#e41a1c",
      "#377eb8",
      "#4daf4a",
      "#984ea3",
      "#ff7f00",
      "#ffff33",
      "#a65628",
      "#f781bf",
      "#999999",
    ],
  },
  set2: {
    label: "Set 2",
    category: "qualitative",
    stops: [
      "#66c2a5",
      "#fc8d62",
      "#8da0cb",
      "#e78ac3",
      "#a6d854",
      "#ffd92f",
      "#e5c494",
      "#b3b3b3",
    ],
  },
  set3: {
    label: "Set 3",
    category: "qualitative",
    stops: [
      "#8dd3c7",
      "#ffffb3",
      "#bebada",
      "#fb8072",
      "#80b1d3",
      "#fdb462",
      "#b3de69",
      "#fccde5",
      "#d9d9d9",
      "#bc80bd",
      "#ccebc5",
      "#ffed6f",
    ],
  },
  pastel1: {
    label: "Pastel 1",
    category: "qualitative",
    stops: [
      "#fbb4ae",
      "#b3cde3",
      "#ccebc5",
      "#decbe4",
      "#fed9a6",
      "#ffffcc",
      "#e5d8bd",
      "#fddaec",
      "#f2f2f2",
    ],
  },
  pastel2: {
    label: "Pastel 2",
    category: "qualitative",
    stops: [
      "#b3e2cd",
      "#fdcdac",
      "#cbd5e8",
      "#f4cae4",
      "#e6f5c9",
      "#fff2ae",
      "#f1e2cc",
      "#cccccc",
    ],
  },
  dark2: {
    label: "Dark 2",
    category: "qualitative",
    stops: [
      "#1b9e77",
      "#d95f02",
      "#7570b3",
      "#e7298a",
      "#66a61e",
      "#e6ab02",
      "#a6761d",
      "#666666",
    ],
  },
  paired: {
    label: "Paired",
    category: "qualitative",
    stops: [
      "#a6cee3",
      "#1f78b4",
      "#b2df8a",
      "#33a02c",
      "#fb9a99",
      "#e31a1c",
      "#fdbf6f",
      "#ff7f00",
      "#cab2d6",
      "#6a3d9a",
      "#ffff99",
      "#b15928",
    ],
  },
  accent: {
    label: "Accent",
    category: "qualitative",
    stops: [
      "#7fc97f",
      "#beaed4",
      "#fdc086",
      "#ffff99",
      "#386cb0",
      "#f0027f",
      "#bf5b17",
      "#666666",
    ],
  },
  category10: {
    label: "Category 10",
    category: "qualitative",
    stops: [
      "#1f77b4",
      "#ff7f0e",
      "#2ca02c",
      "#d62728",
      "#9467bd",
      "#8c564b",
      "#e377c2",
      "#7f7f7f",
      "#bcbd22",
      "#17becf",
    ],
  },
  tableau10: {
    label: "Tableau 10",
    category: "qualitative",
    stops: [
      "#4e79a7",
      "#f28e2b",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc948",
      "#b07aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ac",
    ],
  },
};

export const TIM_PALETTES = {
  sequential: {
    blues: "blues" as const,
    bluesRev: "blues:rev" as const,
    greens: "greens" as const,
    greensRev: "greens:rev" as const,
    reds: "reds" as const,
    redsRev: "reds:rev" as const,
    oranges: "oranges" as const,
    orangesRev: "oranges:rev" as const,
    purples: "purples" as const,
    purplesRev: "purples:rev" as const,
    greys: "greys" as const,
    greysRev: "greys:rev" as const,
    viridis: "viridis" as const,
    viridisRev: "viridis:rev" as const,
    plasma: "plasma" as const,
    plasmaRev: "plasma:rev" as const,
    inferno: "inferno" as const,
    infernoRev: "inferno:rev" as const,
    magma: "magma" as const,
    magmaRev: "magma:rev" as const,
    turbo: "turbo" as const,
    turboRev: "turbo:rev" as const,
    ylGnBu: "yl-gn-bu" as const,
    ylGnBuRev: "yl-gn-bu:rev" as const,
    ylOrRd: "yl-or-rd" as const,
    ylOrRdRev: "yl-or-rd:rev" as const,
    buPu: "bu-pu" as const,
    buPuRev: "bu-pu:rev" as const,
    buGn: "bu-gn" as const,
    buGnRev: "bu-gn:rev" as const,
    gnBu: "gn-bu" as const,
    gnBuRev: "gn-bu:rev" as const,
    orRd: "or-rd" as const,
    orRdRev: "or-rd:rev" as const,
    puBu: "pu-bu" as const,
    puBuRev: "pu-bu:rev" as const,
    puRd: "pu-rd" as const,
    puRdRev: "pu-rd:rev" as const,
    rdPu: "rd-pu" as const,
    rdPuRev: "rd-pu:rev" as const,
    ylGn: "yl-gn" as const,
    ylGnRev: "yl-gn:rev" as const,
    ylOrBr: "yl-or-br" as const,
    ylOrBrRev: "yl-or-br:rev" as const,
  },
  diverging: {
    rdBu: "rd-bu" as const,
    rdBuRev: "rd-bu:rev" as const,
    rdYlGn: "rd-yl-gn" as const,
    rdYlGnRev: "rd-yl-gn:rev" as const,
    rdGnMuted: "rd-gn-muted" as const,
    rdGnMutedRev: "rd-gn-muted:rev" as const,
    rdGnGold: "rd-gn-gold" as const,
    rdGnGoldRev: "rd-gn-gold:rev" as const,
    rdGnArmy: "rd-gn-army" as const,
    rdGnArmyRev: "rd-gn-army:rev" as const,
    trafficLight: "traffic-light" as const,
    trafficLightRev: "traffic-light:rev" as const,
    brBg: "br-bg" as const,
    brBgRev: "br-bg:rev" as const,
    piYg: "pi-yg" as const,
    piYgRev: "pi-yg:rev" as const,
    prGn: "pr-gn" as const,
    prGnRev: "pr-gn:rev" as const,
    puOr: "pu-or" as const,
    puOrRev: "pu-or:rev" as const,
    rdGy: "rd-gy" as const,
    rdGyRev: "rd-gy:rev" as const,
    spectral: "spectral" as const,
    spectralRev: "spectral:rev" as const,
    rdYlBu: "rd-yl-bu" as const,
    rdYlBuRev: "rd-yl-bu:rev" as const,
  },
  qualitative: {
    set1: "set1" as const,
    set1Rev: "set1:rev" as const,
    set2: "set2" as const,
    set2Rev: "set2:rev" as const,
    set3: "set3" as const,
    set3Rev: "set3:rev" as const,
    pastel1: "pastel1" as const,
    pastel1Rev: "pastel1:rev" as const,
    pastel2: "pastel2" as const,
    pastel2Rev: "pastel2:rev" as const,
    dark2: "dark2" as const,
    dark2Rev: "dark2:rev" as const,
    paired: "paired" as const,
    pairedRev: "paired:rev" as const,
    accent: "accent" as const,
    accentRev: "accent:rev" as const,
    category10: "category10" as const,
    category10Rev: "category10:rev" as const,
    tableau10: "tableau10" as const,
    tableau10Rev: "tableau10:rev" as const,
  },
};

export const PALETTE_OPTIONS: PaletteOption[] = Object.entries(PALETTES).map(
  ([id, p]) => ({
    id: id as PaletteName,
    label: p.label,
    category: p.category,
  }),
);

export type ResolvedScale = {
  stops: string[];
  category: PaletteCategory;
};

export function resolveScale(
  config:
    | PaletteName
    | `${PaletteName}:rev`
    | ColorKeyOrString[]
    | { min: ColorKeyOrString; max: ColorKeyOrString; reverse?: boolean }
    | {
      min: ColorKeyOrString;
      mid: ColorKeyOrString;
      max: ColorKeyOrString;
      reverse?: boolean;
    }
    | { palette: PaletteName; reverse?: boolean },
): ResolvedScale {
  if (
    typeof config === "object" && !Array.isArray(config) && "palette" in config
  ) {
    const palette = PALETTES[config.palette];
    const stops = config.reverse ? palette.stops.toReversed() : palette.stops;
    return { stops, category: palette.category };
  }
  if (typeof config === "string") {
    const reverse = config.endsWith(":rev");
    const name = (reverse ? config.slice(0, -4) : config) as PaletteName;
    const palette = PALETTES[name];
    const stops = reverse ? palette.stops.toReversed() : palette.stops;
    return { stops, category: palette.category };
  }
  if (Array.isArray(config)) {
    return {
      stops: config.map((c) => getColor(c)),
      category: "sequential",
    };
  }
  if ("mid" in config) {
    const stops = [
      getColor(config.min),
      getColor(config.mid),
      getColor(config.max),
    ];
    return {
      stops: config.reverse ? stops.toReversed() : stops,
      category: "diverging",
    };
  }
  const stops = [getColor(config.min), getColor(config.max)];
  return {
    stops: config.reverse ? stops.toReversed() : stops,
    category: "sequential",
  };
}
