import {
  getSlideDeckThemeColorPreset,
  getSlideDeckThemeSpec,
  SlideDeckConfig,
} from "lib";
import {
  Color,
  getCoverTreatment,
  getPatternDefaults,
  type ColorPreset,
  type PatternConfig,
  type PatternType,
} from "panther";
import { getImgFromCacheOrFetch } from "~/state/products/t2_images";

function getCoverBackgroundColor(config: SlideDeckConfig): string {
  const colorPreset = getSlideDeckThemeColorPreset(config.theme);
  const coverTreatment = getCoverTreatment(
    getSlideDeckThemeSpec(config.theme).coverAndSectionTreatment,
  );
  const background = coverTreatment.background;
  return colorPreset[background as keyof ColorPreset] as string;
}

export type BackgroundDetail = {
  overlay?: HTMLImageElement;
  pattern?: Omit<PatternConfig, "baseColor">;
};

export async function getBackgroundDetail(
  config: SlideDeckConfig,
): Promise<BackgroundDetail> {
  const overlay = getSlideDeckThemeSpec(config.theme).overlay;
  if (overlay === "none" || overlay === "pattern-none") {
    return {};
  }

  if (overlay.startsWith("pattern-")) {
    const patternType = overlay.replace("pattern-", "") as PatternType;
    const pattern = {
      type: patternType,
      ...getPatternDefaults(patternType),
    };
    return { pattern };
  }

  const bgColor = getCoverBackgroundColor(config);
  const lightOrDark = new Color(bgColor).isLight() ? "light" : "dark";
  const filePath = `/images/${overlay}_for_${lightOrDark}_themes.png`;
  const resImg = await getImgFromCacheOrFetch(filePath);
  if (resImg.success === false) {
    return {};
  }
  return { overlay: resImg.data };
}

