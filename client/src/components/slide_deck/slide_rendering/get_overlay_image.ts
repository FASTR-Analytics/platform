import { SlideDeckConfig, getPrimaryColor, isColorLight } from "lib";
import { getImgFromCacheOrFetch } from "~/state/img_cache";

export async function getOverlayImage(
  config: SlideDeckConfig,
): Promise<HTMLImageElement | undefined> {
  if (!config.overlay || config.overlay === "none") {
    return undefined;
  }
  const lightOrDark = isColorLight(getPrimaryColor(config.primaryColor)) ? "light" : "dark";
  const filePath = `/images/${config.overlay}_for_${lightOrDark}_themes.png`;
  const resImg = await getImgFromCacheOrFetch(filePath);
  if (resImg.success === false) {
    return undefined;
  }
  return resImg.data;
}
