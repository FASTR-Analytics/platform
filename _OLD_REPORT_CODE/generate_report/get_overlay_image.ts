import { ColorTheme, ReportConfig, getColorDetailsForColorTheme } from "lib";
import { getImgFromCacheOrFetch } from "~/state/img_cache";

export async function getOverlayImage(
  config: ReportConfig,
): Promise<HTMLImageElement | undefined> {
  if (!config.overlay || config.overlay === "none") {
    return undefined;
  }
  const cDetails = getColorDetailsForColorTheme(config.colorTheme);
  const filePath = `/images/${config.overlay}_for_${cDetails.lightOrDark}_themes.png`;
  const resImg = await getImgFromCacheOrFetch(filePath);
  if (resImg.success === false) {
    return undefined;
  }
  return resImg.data;
}
