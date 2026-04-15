import type { FigureInputs } from "panther";
import type { PresentationObjectConfig } from "lib";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getFormatAsForMetric } from "~/components/project_runner/global_module_maps";

export function stripFigureInputsForStorage(fi: FigureInputs): FigureInputs {
  const stripped: any = { ...fi, style: undefined };
  if ("mapData" in stripped && stripped.mapData) {
    stripped.mapData = { ...stripped.mapData, geoData: undefined };
  }
  return stripped;
}

export async function hydrateFigureInputsForRendering(
  fi: FigureInputs,
  source?: { config: PresentationObjectConfig; metricId: string; formatAs?: "percent" | "number" },
): Promise<FigureInputs> {
  let hydrated = fi;

  if ("mapData" in hydrated && hydrated.mapData && !("isTransformed" in hydrated.mapData) && !hydrated.mapData.geoData && source) {
    const mapLevel = getAdminAreaLevelFromMapConfig(source.config);
    if (mapLevel) {
      const geoData = getGeoJsonSync(mapLevel);
      if (geoData) {
        hydrated = { ...hydrated, mapData: { ...hydrated.mapData, geoData } };
      }
    }
  }

  if (source) {
    const formatAs = source.formatAs ?? getFormatAsForMetric(source.metricId);
    const style = getStyleFromPresentationObject(source.config, formatAs);
    hydrated = { ...hydrated, style };
  }

  return hydrated;
}
