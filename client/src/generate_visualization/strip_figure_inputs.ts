import type { FigureInputs } from "panther";
import type {
  DeckStyleContext,
  FigureBlock,
  FigureBundle,
  FigureSource,
  IndicatorMetadata,
  PresentationObjectConfig,
} from "lib";
import { getCalendar } from "lib";
import { buildFigureInputs } from "./build_figure_inputs";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getFormatAsForMetric } from "~/state/project/t1_store";

export function stripFigureInputsForStorage(fi: FigureInputs): FigureInputs {
  const stripped: any = { ...fi, style: undefined };
  if ("mapData" in stripped && stripped.mapData) {
    stripped.mapData = { ...stripped.mapData, geoData: undefined };
  }
  return stripped;
}

type HydrationSource = {
  config: PresentationObjectConfig;
  metricId: string;
  formatAs?: "percent" | "number";
  indicatorMetadata?: IndicatorMetadata[];
};

// Pure synchronous transform (no I/O): re-attaches geojson from the sync cache
// and recomputes style. Kept sync so callers can derive it in a createMemo
// instead of a Suspense-triggering createResource (see PROTOCOL_UI_SOLIDJS.md).
export function hydrateFigureInputsForRendering(
  fi: FigureInputs,
  source?: HydrationSource,
  deckStyle?: DeckStyleContext,
): FigureInputs {
  let hydrated = fi;

  if (
    "mapData" in hydrated &&
    hydrated.mapData &&
    !("isTransformed" in hydrated.mapData) &&
    !hydrated.mapData.geoData &&
    source
  ) {
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
    const style = getStyleFromPresentationObject(
      source.config,
      formatAs,
      getCalendar() as "gregorian" | "ethiopian",
      deckStyle,
      source.indicatorMetadata,
    );
    hydrated = { ...hydrated, style };
  }

  return hydrated;
}

export function figureSourceToHydrationSource(
  source: FigureSource,
  formatAs?: "percent" | "number",
): HydrationSource | undefined {
  if (source.type !== "from_data") return undefined;
  return {
    config: source.config,
    metricId: source.metricId,
    formatAs,
    indicatorMetadata: source.indicatorMetadata,
  };
}

export function hydrateFigureInputsForPublicRendering(
  fi: FigureInputs,
  source: HydrationSource & { formatAs: "percent" | "number" },
  geoData?: unknown,
): FigureInputs {
  let hydrated = fi;

  if (
    "mapData" in hydrated &&
    hydrated.mapData &&
    !("isTransformed" in hydrated.mapData) &&
    !hydrated.mapData.geoData &&
    geoData
  ) {
    hydrated = {
      ...hydrated,
      mapData: {
        ...hydrated.mapData,
        geoData: geoData as typeof hydrated.mapData.geoData,
      },
    };
  }

  const style = getStyleFromPresentationObject(
    source.config,
    source.formatAs,
    getCalendar() as "gregorian" | "ethiopian",
    undefined,
    source.indicatorMetadata,
  );
  hydrated = { ...hydrated, style };

  return hydrated;
}

// Temporary P1 bridge: converts a FigureBundle back to the old FigureBlock
// format for storage. Deleted in P2 when DB schemas switch to FigureBundle.
export function figureBundleToBlock(bundle: FigureBundle): FigureBlock {
  return {
    type: "figure",
    figureInputs: stripFigureInputsForStorage(buildFigureInputs(bundle)),
    source: {
      type: "from_data",
      metricId: bundle.metricId,
      config: bundle.config,
      snapshotAt: bundle.snapshotAt,
      indicatorMetadata: bundle.indicatorMetadata,
    },
  };
}
