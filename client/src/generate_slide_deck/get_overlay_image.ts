import { SlideDeckConfig } from "lib";
import {
  Color,
  getColor,
  getKeyColorsFromPrimaryColor,
  getPatternDefaults,
  getTreatmentPreset,
  type PatternConfig,
  type PatternType,
} from "panther";
import { getImgFromCacheOrFetch } from "~/state/img_cache";

function getCoverBackgroundColor(config: SlideDeckConfig): string {
  const preset = getTreatmentPreset(config.treatment);
  const background = preset.surfaces.cover.background;
  if (background === "primary") {
    return config.primaryColor;
  }
  const palette = getKeyColorsFromPrimaryColor(config.primaryColor);
  return getColor(palette[background]);
}

export type BackgroundDetail = {
  overlay?: HTMLImageElement;
  pattern?: Omit<PatternConfig, "baseColor">;
};

export async function getBackgroundDetail(
  config: SlideDeckConfig,
): Promise<BackgroundDetail> {
  if (!config.overlay || config.overlay === "none" || config.overlay === "pattern-none") {
    return {};
  }

  if (config.overlay.startsWith("pattern-")) {
    const patternType = config.overlay.replace("pattern-", "") as PatternType;
    const pattern = {
      type: patternType,
      ...getPatternDefaults(patternType),
    };
    return { pattern };
  }

  const bgColor = getCoverBackgroundColor(config);
  const lightOrDark = new Color(bgColor).isLight() ? "light" : "dark";
  const filePath = `/images/${config.overlay}_for_${lightOrDark}_themes.png`;
  const resImg = await getImgFromCacheOrFetch(filePath);
  if (resImg.success === false) {
    return {};
  }
  return { overlay: resImg.data };
}

export async function getOverlayImage(
  config: SlideDeckConfig,
): Promise<HTMLImageElement | undefined> {
  const detail = await getBackgroundDetail(config);
  return detail.overlay;
}
