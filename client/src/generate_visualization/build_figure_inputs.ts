import {
  FigureInputs,
  formatPeriod,
  type GeoJSONFeatureCollection,
  getPeriodTypeFromValue,
  getPieDataTransformed,
  getTimeseriesDataTransformed,
  type JsonArrayItem,
  PeriodType,
} from "panther";
import {
  type DeckStyleContext,
  type EffectiveIndicatorFacts,
  type FacilityFamily,
  type FastrChartPalette,
  FigureBundle,
  FigureLocalization,
  type FigureUnavailable,
  getEffectivePOConfig,
  getSingleValueDimsFromItems,
  type IndicatorFormat,
  type IndicatorMetadataDisplay,
  indicatorMetadataToLabelMap,
  PeriodBounds,
  pickLang,
  PresentationObjectConfig,
  resolveEffectiveIndicatorFactsFromItems,
  ResultsValueForVisualization,
  selectCf,
  withReplicant,
} from "lib";
import { getLegendFromConfig } from "./conditional_formatting";
import { scaleLegendFormat } from "./conditional_formatting/compile";
import {
  getChartOHJsonDataConfigFromPresentationObjectConfig,
  getChartOVJsonDataConfigFromPresentationObjectConfig,
  getPieJsonDataConfigFromPresentationObjectConfig,
  getTableJsonDataConfigFromPresentationObjectConfig,
  getTimeseriesJsonDataConfigFromPresentationObjectConfig,
} from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getMapJsonDataConfigFromPresentationObjectConfig } from "./get_data_config_for_map";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import {
  isSpecialDisruptionsChartActive,
  isSpecialDisruptionsChartV2Active,
  metricAllowsNegativeScale,
} from "./special_chart_checks";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import {
  ensureRunGeoJson,
  getRunGeoJsonSync,
} from "~/state/instance/t2_run_geojson";

export type FigureInputsResult =
  | { ok: true; inputs: FigureInputs }
  | { ok: false; unavailable: FigureUnavailable };

// Builds FigureInputs from a FigureBundle. All locale reads come from
// bundle.localization: no ambient singletons. A state the user can act on is
// returned as a reason; anything else is a bug and throws.
export function buildFigureInputs(
  bundle: FigureBundle,
  deckStyle?: DeckStyleContext,
  // A document's own chart palette (see getStandardSeriesColorFunc).
  chartPalette?: FastrChartPalette,
): FigureInputsResult {
  if (bundle.config.d.type !== "map") {
    return {
      ok: true,
      inputs: buildInputs(bundle, undefined, deckStyle, chartPalette),
    };
  }
  const geo = resolveGeoJson(bundle);
  return geo.ok
    ? {
      ok: true,
      inputs: buildInputs(bundle, geo.data, deckStyle, chartPalette),
    }
    : geo;
}

function buildInputs(
  bundle: FigureBundle,
  geoJson: GeoJSONFeatureCollection | undefined,
  deckStyle: DeckStyleContext | undefined,
  chartPalette: FastrChartPalette | undefined,
): FigureInputs {
  const {
    config,
    items,
    resultsValue,
    indicatorMetadata,
    dateRange,
    localization,
    scope,
  } = bundle;

  const indicatorLabelReplacements = indicatorMetadataToLabelMap(
    indicatorMetadata,
  );
  const catalogIdOrder = buildCatalogIdOrder(indicatorMetadata);

  const effectiveFormat = resolveEffectiveIndicatorFactsFromItems({
    metricFormatAs: resultsValue.formatAs,
    config,
    items,
    indicatorMetadata,
  });
  const legend = () =>
    getLegendFromConfig(
      config,
      effectiveFormat.axisFormat,
      effectiveFormat,
      localization,
      chartPalette,
    );

  const allowNegativeScale = metricAllowsNegativeScale(bundle.metricId);

  const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(
    config,
    {
      dateRange,
      valueProps: resultsValue.valueProps,
      singleValueDims: getSingleValueDimsFromItems(config, items),
    },
  );

  // The disruptions chart compares two data values (actual vs expected) as two
  // series and shades the diff between them: a single data value has nothing to
  // compare. Fail with a clear message rather than a cryptic render crash.
  if (
    isSpecialDisruptionsChartActive(config) && effectiveValueProps.length < 2
  ) {
    throw new Error(
      "Disruptions chart needs both data values (actual and expected). Add the second data value, or turn off disruptions mode.",
    );
  }

  // The V2 chart's diff pairs address series by POSITION, which under "--v" is
  // the effective value-props order: a filtered subset would silently pair
  // the wrong series. Require the full m011 shape exactly.
  if (isSpecialDisruptionsChartV2Active(config)) {
    const required = ["observed", "expected", "ppi_lwr", "ppi_upr"];
    if (
      effectiveValueProps.length !== required.length ||
      required.some((p, i) => effectiveValueProps[i] !== p)
    ) {
      throw new Error(
        "Disruptions chart needs all four data values (observed, expected, lower and upper bounds). Clear the data value filter, or turn off disruptions mode.",
      );
    }
  }

  if (effectiveConfig.d.type === "timeseries") {
    const j = getTimeseriesJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      catalogIdOrder,
      localization,
      scope,
      items,
    );
    const d = getTimeseriesDataTransformed(
      { jsonArray: items, jsonDataConfig: j },
      effectiveConfig.s.content === "bars" && effectiveConfig.s.barsStacked,
    );
    return {
      figureType: "timeseries",
      data: d,
      caption: withDateRange(
        withReplicant(
          config.t.caption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      subCaption: withDateRange(
        withReplicant(
          config.t.subCaption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      footnote: withDateRange(
        withReplicant(
          config.t.footnote,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      style: getStyleFromPresentationObject(
        config,
        effectiveFormat,
        localization,
        deckStyle,
        allowNegativeScale,
        effectiveValueProps,
        chartPalette,
      ),
      legend: legend(),
    };
  }

  if (effectiveConfig.d.type === "table") {
    return {
      figureType: "table",
      data: {
        jsonArray: items,
        jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          effectiveValueProps,
          indicatorLabelReplacements,
          catalogIdOrder,
          localization,
          scope,
          items,
        ),
      },
      caption: withDateRange(
        withReplicant(
          config.t.caption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      subCaption: withDateRange(
        withReplicant(
          config.t.subCaption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      footnote: withDateRange(
        withReplicant(
          config.t.footnote,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      style: getStyleFromPresentationObject(
        config,
        effectiveFormat,
        localization,
        deckStyle,
        allowNegativeScale,
        effectiveValueProps,
        chartPalette,
      ),
      legend: legend(),
    };
  }

  if (effectiveConfig.d.type === "chart") {
    const surrounds = {
      caption: withDateRange(
        withReplicant(
          config.t.caption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      subCaption: withDateRange(
        withReplicant(
          config.t.subCaption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      footnote: withDateRange(
        withReplicant(
          config.t.footnote,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      style: getStyleFromPresentationObject(
        config,
        effectiveFormat,
        localization,
        deckStyle,
        allowNegativeScale,
        effectiveValueProps,
        chartPalette,
      ),
      legend: legend(),
    };
    if (effectiveConfig.s.horizontal) {
      return {
        figureType: "chart-oh",
        data: {
          jsonArray: items,
          jsonDataConfig: getChartOHJsonDataConfigFromPresentationObjectConfig(
            resultsValue,
            effectiveConfig,
            effectiveValueProps,
            indicatorLabelReplacements,
            catalogIdOrder,
            localization,
            scope,
            items,
          ),
        },
        ...surrounds,
      };
    }
    return {
      figureType: "chart-ov",
      data: {
        jsonArray: items,
        jsonDataConfig: getChartOVJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          effectiveValueProps,
          indicatorLabelReplacements,
          catalogIdOrder,
          localization,
          scope,
          items,
        ),
      },
      ...surrounds,
    };
  }

  if (effectiveConfig.d.type === "map") {
    if (!geoJson) throw new Error("Map figure built without boundaries");
    const mapDataConfig = getMapJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      catalogIdOrder,
    );
    // panther expects numeric values for the color scale; items are string-typed
    // in the bundle, so parse numeric strings to numbers here.
    const mapItems: JsonArrayItem[] = items.map((row) => {
      const raw = row[mapDataConfig.valueProp];
      if (raw !== undefined && raw !== null) {
        const num = Number(raw);
        if (!isNaN(num)) {
          return { ...row, [mapDataConfig.valueProp]: num };
        }
      }
      return row;
    });
    return {
      figureType: "map",
      data: {
        geoData: geoJson,
        jsonArray: mapItems,
        jsonDataConfig: mapDataConfig,
      },
      caption: withDateRange(
        withReplicant(
          config.t.caption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      subCaption: withDateRange(
        withReplicant(
          config.t.subCaption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      footnote: withDateRange(
        withReplicant(
          config.t.footnote,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      style: getStyleFromPresentationObject(
        config,
        effectiveFormat,
        localization,
        deckStyle,
        allowNegativeScale,
        effectiveValueProps,
        chartPalette,
      ),
      legend: config.s.hideLegend ? undefined : buildMapAutoLegend(
        config,
        effectiveFormat,
        localization,
        chartPalette,
      ),
    };
  }

  if (effectiveConfig.d.type === "pie") {
    const j = getPieJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      catalogIdOrder,
      localization,
      scope,
      effectiveFormat.axisFormat,
      items,
    );
    // Transform eagerly (timeseries precedent) so transform-time throws
    // (negative values, missing "--v" assignment) surface here inside the
    // caller's catch rather than at measure time inside panther. The
    // transform coerces string values itself: no numeric parse needed.
    const d = getPieDataTransformed({ jsonArray: items, jsonDataConfig: j });
    return {
      figureType: "pie",
      data: d,
      caption: withDateRange(
        withReplicant(
          config.t.caption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      subCaption: withDateRange(
        withReplicant(
          config.t.subCaption,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      footnote: withDateRange(
        withReplicant(
          config.t.footnote,
          config,
          indicatorLabelReplacements,
          localization.countryIso3,
        ),
        dateRange,
        localization,
      ),
      style: getStyleFromPresentationObject(
        config,
        effectiveFormat,
        localization,
        deckStyle,
        allowNegativeScale,
        effectiveValueProps,
        chartPalette,
      ),
      // Never pass an explicit legend: CF is unwired for slices (they color
      // via the series sentinel), so a cf* state carried over from a
      // chart/map conversion would show threshold/scale colors that appear
      // nowhere on the figure, and an explicit legend would suppress the
      // categorical slice legend panther derives from series headers.
      legend: undefined,
    };
  }

  throw new Error("Bad presentation type");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// A bundle that carries its geometry draws it. One that names a level draws
// its own package's boundaries, keyed by provenance.runId and not by the
// container's package, so a stale figure keeps the boundaries it was built
// with for as long as its package exists; only a package without a capture,
// or a run that is gone, falls back to the instance's. Each facility registry
// carries its OWN boundaries, so the reason names the family as well as the
// level.
function resolveGeoJson(
  bundle: FigureBundle,
):
  | { ok: true; data: GeoJSONFeatureCollection }
  | { ok: false; unavailable: FigureUnavailable } {
  const level = getAdminAreaLevelFromMapConfig(bundle.config);
  if (level === undefined) {
    throw new Error("Map figure has no admin-area map dimension");
  }
  if (bundle.geo?.kind === "data") {
    return { ok: true, data: bundle.geo.data as GeoJSONFeatureCollection };
  }
  const family = geoFamily(bundle.geo);
  const read = getRunGeoJsonSync(bundle.provenance.runId, family, level);
  if (read.state === "ready") return { ok: true, data: read.data };
  if (read.state === "loading") {
    return {
      ok: false,
      unavailable: { kind: "boundaries_loading", family, level },
    };
  }
  if (read.state === "not_in_package") {
    return {
      ok: false,
      unavailable: { kind: "no_boundaries", family, level, source: "package" },
    };
  }
  const instance = getGeoJsonSync(family, level);
  return instance !== undefined ? { ok: true, data: instance } : {
    ok: false,
    unavailable: { kind: "no_boundaries", family, level, source: "instance" },
  };
}

// Awaits the boundaries a map bundle names, for a caller that builds after an
// await, where a sync read tracks nothing and would build the loading state.
export async function awaitFigureBoundaries(
  bundle: FigureBundle,
): Promise<void> {
  if (bundle.config.d.type !== "map" || bundle.geo?.kind === "data") return;
  const level = getAdminAreaLevelFromMapConfig(bundle.config);
  if (level === undefined) return;
  await ensureRunGeoJson(
    bundle.provenance.runId,
    geoFamily(bundle.geo),
    level,
  );
}

// Stored bundles without a family predate the split and are hmis (same
// ruling as an absent ResultsValue.datasetFamily).
function geoFamily(geo: FigureBundle["geo"]): FacilityFamily {
  return geo?.kind === "level" ? geo.family ?? "hmis" : "hmis";
}

// A map's legend: a bucket list for the two rule-based sources, else the
// gradient/stepped scale legend over the live or fixed domain.
function buildMapAutoLegend(
  config: PresentationObjectConfig,
  facts: EffectiveIndicatorFacts,
  localization: Pick<FigureLocalization, "language">,
  chartPalette: FastrChartPalette | undefined,
) {
  const cf = selectCf(config.s);
  const formatAs: IndicatorFormat = facts.axisFormat;
  if (cf.type === "thresholds" || cf.type === "indicator") {
    return getLegendFromConfig(
      config,
      formatAs,
      facts,
      localization,
      chartPalette,
    );
  }
  const noData = {
    color: "#f0f0f0",
    label: pickLang(localization.language, {
      en: "No data",
      fr: "Aucune donnée",
      pt: "Sem dados",
    }),
  };
  const domain = cf.type === "scale" && cf.domain.kind === "fixed"
    ? { min: cf.domain.min, max: cf.domain.max }
    : undefined;
  const steps = cf.type === "scale" ? cf.steps : undefined;
  const format = scaleLegendFormat(formatAs);
  if (steps !== undefined && steps >= 2) {
    return {
      type: "stepped-auto" as const,
      nSteps: steps,
      domain,
      ...format,
      noData,
    };
  }
  return {
    type: "gradient-auto" as const,
    nTicks: 5,
    domain,
    ...format,
    noData,
  };
}

function withDateRange(
  str: string,
  dateRange: PeriodBounds | undefined,
  localization: Pick<FigureLocalization, "calendar" | "language">,
): string {
  if (
    !str.includes("DATE_RANGE") && !str.includes("PLAGE_DE_DATES") &&
    !str.includes("INTERVALO_DE_DATAS")
  ) {
    return str;
  }
  if (!dateRange) return str;
  const { calendar, language } = localization;
  const periodType: PeriodType = getPeriodTypeFromValue(dateRange.min) ??
    "year";
  if (dateRange.min === dateRange.max) {
    const d = formatPeriod(dateRange.min, periodType, calendar);
    return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d)
      .replaceAll("INTERVALO_DE_DATAS", d);
  }
  const separator = pickLang(language, { en: " to ", fr: " à ", pt: " a " });
  const d = formatPeriod(dateRange.min, periodType, calendar) + separator +
    formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d)
    .replaceAll("INTERVALO_DE_DATAS", d);
}

// The package catalog's own order, ids only: what every catalog-ordered axis
// sorts by. Entries with no stamped order follow, by id, so a mixed catalog is
// still deterministic.
function buildCatalogIdOrder(metadata: IndicatorMetadataDisplay[]): string[] {
  return [...metadata]
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
    )
    .map((m) => m.id);
}
