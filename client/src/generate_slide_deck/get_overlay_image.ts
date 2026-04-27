import { SlideDeckConfig } from "lib";
import {
  Color,
  getTreatmentPreset,
  getKeyColorsFromPrimaryColor,
  getColor,
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

export async function getOverlayImage(
  config: SlideDeckConfig,
): Promise<HTMLImageElement | undefined> {
  if (!config.overlay || config.overlay === "none") {
    return undefined;
  }
  const bgColor = getCoverBackgroundColor(config);
  const lightOrDark = new Color(bgColor).isLight() ? "light" : "dark";
  const filePath = `/images/${config.overlay}_for_${lightOrDark}_themes.png`;
  const resImg = await getImgFromCacheOrFetch(filePath);
  if (resImg.success === false) {
    return undefined;
  }
  return resImg.data;
}
