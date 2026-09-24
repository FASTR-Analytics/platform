// =============================================================================
// Slide deck themes: the named styles a deck can be set in.
//
// Before this file a deck's look was SIX independent stored fields (colour
// preset, font, layout preset, cover treatment, freeform treatment, overlay),
// each with its own picker in deck settings. That is ~40,000 combinations, of
// which a handful look considered and the rest look like an accident. A deck
// now stores ONE id and this file says what that id means, exactly as
// report_fastr_themes.ts does for FASTR Markdown.
//
// The names are deliberately the SAME ELEVEN as the FASTR Markdown themes, so
// a report and a deck set in "Ministry" are recognisably the same document
// family. What a name means has to be re-read per medium (a markdown theme
// says it in four colours plus a stylesheet, a deck says it in a palette plus
// page furniture) but the CHARACTER each name promises is the one the report
// theme of that name delivers.
//
// Adding a theme is safe. REMOVING one needs the retired-value treatment
// (PROTOCOL_APP_MIGRATIONS.md + a transform block in
// data_transforms/slide_deck_config.ts), because the id is stored.
// =============================================================================

import type {
  ColorPresetId,
  CoverTreatmentId,
  FreeformTreatmentId,
  LayoutPresetId,
  PatternType,
} from "@timroberton/panther";
import { Color, getColorPreset, getColorPresets } from "@timroberton/panther";
import type { ColorPreset } from "@timroberton/panther";
import {
  BRAND_PRESETS,
  getBrandPreset,
  isBrandPresetId,
} from "../brand_presets.ts";
import type { BrandPresetId } from "../brand_presets.ts";
import { _GFF_GREEN } from "../key_colors.ts";
import type { SlideFontFamily } from "./_slide_fonts.ts";

// Every palette a theme may name: panther's sixteen hues plus the two brand
// palettes. Lives here rather than in slides.ts because a theme spec is now
// the only thing that names one.
export type AllPresetId = ColorPresetId | BrandPresetId;

// The page's background decoration. Also declared here (and re-exported from
// slides.ts) because, like the palette, a theme is now its only author.
type ImageOverlayType = "dots" | "rivers" | "waves" | "world";
type PatternOverlayType = `pattern-${PatternType}`;
export type BackgroundDetailType =
  | "none"
  | ImageOverlayType
  | PatternOverlayType;

export const SLIDE_DECK_THEMES = [
  "default",
  "minimal",
  "corporate",
  "ministry",
  "executive",
  "clinical",
  "editorial",
  "swiss",
  "monochrome",
  // The artistic pair, matching the FASTR Markdown themes of the same names.
  "bauhaus",
  "broadsheet",
] as const;
export type SlideDeckTheme = (typeof SLIDE_DECK_THEMES)[number];

// What a theme IS: the six axes that used to be six pickers. Nothing else.
// Logos, footer text, page numbers and the watermark stay per-deck, because
// they carry the deck's own content rather than its style.
export type SlideDeckThemeSpec = {
  colorPresetId: AllPresetId;
  fontFamily: SlideFontFamily;
  layout: LayoutPresetId;
  coverAndSectionTreatment: CoverTreatmentId;
  freeformTreatment: FreeformTreatmentId;
  overlay: BackgroundDetailType;
};

// Only four faces are available to a deck (SLIDE_FONTS), against the markdown
// themes' free choice of Google Fonts, so type does less of the work here and
// the page furniture does more. Where a markdown theme reaches for Playfair or
// Source Serif, the deck theme of that name reaches for Merriweather and
// leans on its cover treatment and layout to finish the sentence.
export const SLIDE_DECK_THEME_SPECS: Record<
  SlideDeckTheme,
  SlideDeckThemeSpec
> = {
  // The GFF house style, and what every deck built before themes existed was
  // already set in. Kept first and kept identical to the old starting config
  // so "default" is a real continuity, not a new look wearing the old name.
  default: {
    colorPresetId: "gff",
    fontFamily: "International Inter",
    layout: "default",
    coverAndSectionTreatment: "bold",
    freeformTreatment: "default",
    overlay: "none",
  },
  // Airy and unfilled, as the markdown theme is: a white cover instead of a
  // colour field, and the lightest of the freeform treatments.
  minimal: {
    colorPresetId: "gray",
    fontFamily: "International Inter",
    layout: "modern",
    coverAndSectionTreatment: "white",
    freeformTreatment: "minimal",
    overlay: "none",
  },
  // The consultancy deck: navy, boxed headers, content top-left with the
  // logos out of the way in the corner.
  corporate: {
    colorPresetId: "blue",
    fontFamily: "International Inter",
    layout: "corporate",
    coverAndSectionTreatment: "bold",
    freeformTreatment: "bordered-accent",
    overlay: "none",
  },
  // Official-document register: serif headings, a green that reads as
  // institutional rather than brand, and a muted cover rather than a loud one.
  ministry: {
    colorPresetId: "green",
    fontFamily: "Merriweather",
    layout: "default",
    coverAndSectionTreatment: "muted",
    freeformTreatment: "classic",
    overlay: "none",
  },
  // The board-paper theme. Split layout gives it the accent panel that stands
  // in for the markdown theme's hairline rules.
  executive: {
    colorPresetId: "slate",
    fontFamily: "Merriweather",
    layout: "split",
    coverAndSectionTreatment: "bold",
    freeformTreatment: "soft-accent",
    overlay: "none",
  },
  // Cool, pale and legible: a theme for numbers rather than for argument.
  clinical: {
    colorPresetId: "cyan",
    fontFamily: "International Inter",
    layout: "corporate",
    coverAndSectionTreatment: "lighter",
    freeformTreatment: "soft",
    overlay: "none",
  },
  // Warm ochre and a serif, with header-only furniture so the page reads as
  // an article rather than a slide.
  editorial: {
    colorPresetId: "amber",
    fontFamily: "Merriweather",
    layout: "modern",
    coverAndSectionTreatment: "light",
    freeformTreatment: "header-only",
    overlay: "none",
  },
  // International Typographic Style: red, a grotesque, hard left alignment and
  // nothing on the page that is not information.
  swiss: {
    colorPresetId: "red",
    fontFamily: "Fira Sans",
    layout: "modern",
    coverAndSectionTreatment: "pure",
    freeformTreatment: "minimal",
    overlay: "none",
  },
  // One hue, stated at full strength on the cover and withdrawn everywhere
  // else. The only theme whose accent carries no meaning of its own.
  monochrome: {
    colorPresetId: "gray",
    fontFamily: "Fira Sans",
    layout: "default",
    coverAndSectionTreatment: "bold",
    freeformTreatment: "classic",
    overlay: "none",
  },
  // Primary colour, geometric type, and the one theme that uses a pattern:
  // the overlay is the point rather than a texture behind the point.
  bauhaus: {
    colorPresetId: "red",
    fontFamily: "Poppins",
    layout: "split",
    coverAndSectionTreatment: "bold",
    freeformTreatment: "bold",
    overlay: "pattern-circles",
  },
  // Newsprint: a warm near-black on white, serif throughout, ruled rather
  // than boxed.
  broadsheet: {
    colorPresetId: "warm",
    fontFamily: "Merriweather",
    layout: "default",
    coverAndSectionTreatment: "white",
    freeformTreatment: "classic",
    overlay: "none",
  },
};

export function getSlideDeckThemeSpec(
  theme: SlideDeckTheme,
): SlideDeckThemeSpec {
  return SLIDE_DECK_THEME_SPECS[theme];
}

// The palette a theme names, resolved to the render-layer ColorPreset. The two
// brand palettes are not panther presets, so they are looked up separately.
// This is the whole of what resolveColorThemeToPreset used to do, minus the
// custom-hex branch that went with the colour picker.
export function getSlideDeckThemeColorPreset(
  theme: SlideDeckTheme,
): ColorPreset {
  const id = SLIDE_DECK_THEME_SPECS[theme].colorPresetId;
  return isBrandPresetId(id) ? getBrandPreset(id) : getColorPreset(id);
}

// =============================================================================
// Legacy style -> theme
//
// Lives here, beside the specs it scores against, because TWO callers need the
// same answer: the slide_deck_config sweep, which rewrites live decks once at
// deploy, and the version-history read path, which upgrades an immutable
// snapshot every time one is opened. Snapshots are deliberately never migrated
// in place (see the contract at the top of server/db/products/versions.ts), so
// a deck version saved before 2026-09-24 still arrives in the six-field shape
// and must be scored on the way out, with exactly the result the sweep gave
// the live deck.
//
// Frozen on purpose: the weights only ever had to be right for the one sweep,
// and re-tuning them now would make a restored version disagree with the deck
// it was restored from.
// =============================================================================

export type LegacySlideDeckStyle = {
  colorTheme:
    | { type: "preset"; id: string }
    | { type: "custom"; primary: string };
  fontFamily: string | undefined;
  layout: string;
  coverAndSectionTreatment: string;
  freeformTreatment: string;
  overlay: string | undefined;
};

export const LEGACY_SLIDE_DECK_STYLE_KEYS = [
  "colorTheme",
  "fontFamily",
  "layout",
  "coverAndSectionTreatment",
  "freeformTreatment",
  "overlay",
] as const;

// Colour carries the most of a deck's identity, so it dominates; the cover
// treatment is what a reader sees first after it. Overlay is nearly free
// because only one theme has one, and scoring it heavily would drag every
// patterned deck towards Bauhaus for a detail nobody chose deliberately.
const W_HUE = 3;
const W_COVER = 2;
const W_FREEFORM = 1.5;
const W_LAYOUT = 1;
const W_FONT = 1;
const W_OVERLAY = 0.5;

function presetHue(id: string): number {
  const brand = BRAND_PRESETS.find((b) => b.id === id);
  if (brand) return brand.hue;
  const preset = getColorPresets().find((c) => c.id === id);
  return preset?.hue ?? getColorPreset("gray").hue;
}

function legacyHue(colorTheme: LegacySlideDeckStyle["colorTheme"]): number {
  if (colorTheme.type === "custom") {
    return new Color(colorTheme.primary || _GFF_GREEN).hsl().h;
  }
  return presetHue(colorTheme.id);
}

function themeDistance(
  style: LegacySlideDeckStyle,
  spec: SlideDeckThemeSpec,
): number {
  // An exact palette match beats a hue match: a deck set to "gff" should land
  // on the theme that names gff, not on another green nearer in hue.
  const exactColor = style.colorTheme.type === "preset" &&
    style.colorTheme.id === spec.colorPresetId;
  const rawHueDiff = Math.abs(
    legacyHue(style.colorTheme) - presetHue(spec.colorPresetId),
  );
  const hueDiff = Math.min(rawHueDiff, 360 - rawHueDiff);
  const colorCost = exactColor ? 0 : hueDiff / 180;

  const storedOverlay = style.overlay ?? "none";
  const storedFont = style.fontFamily ?? "International Inter";
  return (
    W_HUE * colorCost +
    W_COVER *
      (style.coverAndSectionTreatment === spec.coverAndSectionTreatment ? 0 : 1) +
    W_FREEFORM * (style.freeformTreatment === spec.freeformTreatment ? 0 : 1) +
    W_LAYOUT * (style.layout === spec.layout ? 0 : 1) +
    W_FONT * (storedFont === spec.fontFamily ? 0 : 1) +
    W_OVERLAY * (storedOverlay === spec.overlay ? 0 : 1)
  );
}

export function nearestSlideDeckTheme(
  style: LegacySlideDeckStyle,
): SlideDeckTheme {
  let best: SlideDeckTheme = "default";
  let bestDistance = Infinity;
  // SLIDE_DECK_THEMES order is the tie-break and "default" is first, so a deck
  // equidistant from several themes keeps the house style.
  for (const theme of SLIDE_DECK_THEMES) {
    const d = themeDistance(style, SLIDE_DECK_THEME_SPECS[theme]);
    if (d < bestDistance) {
      bestDistance = d;
      best = theme;
    }
  }
  return best;
}

// Give a config object a `theme` and strip the six legacy keys, in place.
// Idempotent: a config that already has a theme and no legacy keys is
// untouched, and one that has both is re-scored to the same answer.
export function applySlideDeckThemeToLegacyConfig(
  config: Record<string, unknown>,
): void {
  if (LEGACY_SLIDE_DECK_STYLE_KEYS.some((k) => k in config)) {
    config.theme = nearestSlideDeckTheme({
      colorTheme: (config.colorTheme ?? { type: "preset", id: "gff" }) as
        LegacySlideDeckStyle["colorTheme"],
      fontFamily: config.fontFamily as string | undefined,
      layout: (config.layout ?? "default") as string,
      coverAndSectionTreatment: (config.coverAndSectionTreatment ??
        "bold") as string,
      freeformTreatment: (config.freeformTreatment ?? "default") as string,
      overlay: config.overlay as string | undefined,
    });
    for (const key of LEGACY_SLIDE_DECK_STYLE_KEYS) {
      delete config[key];
    }
  }
  if (typeof config.theme !== "string") {
    config.theme = "default";
  }
}
