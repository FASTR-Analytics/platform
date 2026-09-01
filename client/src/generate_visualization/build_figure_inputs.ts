import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getPeriodTypeFromValue,
  getPieDataTransformed,
  getTimeseriesDataTransformed,
  type GeoJSONFeatureCollection,
  type JsonArrayItem,
} from "panther";
import {
  FigureBundle,
  FigureLocalization,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getEffectivePOConfig,
  getSingleValueDimsFromItems,
  indicatorMetadataToLabelMap,
  pickLang,
  resolveEffectiveFormatFromItems,
  selectCf,
  withReplicant,
  type DeckStyleContext,
  type IndicatorFormat,
  type IndicatorMetadataDisplay,
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
  isSpecialScorecardTableActive,
  metricAllowsNegativeScale,
} from "./special_chart_checks";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";

// Builds FigureInputs from a FigureBundle. All locale reads come from
// bundle.localization — no ambient singletons. Throws on bad input.
export function buildFigureInputs(
  bundle: FigureBundle,
  deckStyle?: DeckStyleContext,
): FigureInputs {
  const { config, items, resultsValue, indicatorMetadata, dateRange, geo, localization } = bundle;

  const geoJson = resolveGeoJson(geo, config);

  const indicatorLabelReplacements = indicatorMetadataToLabelMap(indicatorMetadata);
  const indicatorSortOrder = buildIndicatorIdOrder(indicatorMetadata);

  const effectiveFormat = resolveEffectiveFormatFromItems({
    metricFormatAs: resultsValue.formatAs,
    config,
    items,
    indicatorMetadata,
  });

  const allowNegativeScale = metricAllowsNegativeScale(bundle.metricId);

  const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(config, {
    dateRange,
    valueProps: resultsValue.valueProps,
    singleValueDims: getSingleValueDimsFromItems(config, items),
  });

  // The disruptions chart compares two data values (actual vs expected) as two
  // series and shades the diff between them — a single data value has nothing to
  // compare. Fail with a clear message rather than a cryptic render crash.
  if (isSpecialDisruptionsChartActive(config) && effectiveValueProps.length < 2) {
    throw new Error(
      "Disruptions chart needs both data values (actual and expected). Add the second data value, or turn off disruptions mode.",
    );
  }

  // The V2 chart's diff pairs address series by POSITION, which under "--v" is
  // the effective value-props order — a filtered subset would silently pair
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
      indicatorSortOrder,
      localization,
      items,
    );
    const d = getTimeseriesDataTransformed(
      { jsonArray: items, jsonDataConfig: j },
      effectiveConfig.s.content === "bars" && effectiveConfig.s.barsStacked,
    );
    return {
      figureType: "timeseries",
      data: d,
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormat, localization, deckStyle, indicatorMetadata, allowNegativeScale, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormat.axisFormat, localization),
    };
  }

  if (effectiveConfig.d.type === "table") {
    const customSortHeaders = isSpecialScorecardTableActive(config)
      ? buildIndicatorSortOrder(indicatorMetadata)
      : undefined;
    return {
      figureType: "table",
      data: {
        jsonArray: items,
        jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          effectiveValueProps,
          indicatorLabelReplacements,
          indicatorSortOrder,
          localization,
          items,
          customSortHeaders,
        ),
      },
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormat, localization, deckStyle, indicatorMetadata, allowNegativeScale, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormat.axisFormat, localization),
    };
  }

  if (effectiveConfig.d.type === "chart") {
    const surrounds = {
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormat, localization, deckStyle, indicatorMetadata, allowNegativeScale, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormat.axisFormat, localization),
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
            indicatorSortOrder,
            localization,
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
          indicatorSortOrder,
          localization,
          items,
        ),
      },
      ...surrounds,
    };
  }

  if (effectiveConfig.d.type === "map") {
    if (!geoJson) {
      const level = getAdminAreaLevelFromMapConfig(effectiveConfig);
      // Each facility registry carries its OWN boundaries, so the level alone
      // no longer identifies the missing map — an instance can have an HMIS
      // AA2 map and no HFA one, and the maps page would show "a level 2 map
      // exists" while this metric still cannot render.
      const registry = geo && geo.kind === "level" && geo.family === "hfa"
        ? "HFA"
        : "HMIS";
      throw new Error(
        `[INFO] Map files not yet uploaded for the ${registry} registry at Admin Area ${level ?? ""}`,
      );
    }
    const mapDataConfig = getMapJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      indicatorSortOrder,
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
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormat, localization, deckStyle, indicatorMetadata, allowNegativeScale, effectiveValueProps),
      legend: config.s.hideLegend ? undefined : buildMapAutoLegend(config, effectiveFormat.axisFormat, localization),
    };
  }

  if (effectiveConfig.d.type === "pie") {
    const j = getPieJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      indicatorSortOrder,
      localization,
      effectiveFormat.axisFormat,
      items,
    );
    // Transform eagerly (timeseries precedent) so transform-time throws
    // (negative values, missing "--v" assignment) surface here inside the
    // caller's catch rather than at measure time inside panther. The
    // transform coerces string values itself — no numeric parse needed.
    const d = getPieDataTransformed({ jsonArray: items, jsonDataConfig: j });
    return {
      figureType: "pie",
      data: d,
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormat, localization, deckStyle, indicatorMetadata, allowNegativeScale, effectiveValueProps),
      // Never pass an explicit legend: CF is unwired for slices (they color
      // via the series sentinel), so a cf* state carried over from a
      // chart/map conversion would show threshold/scale colors that appear
      // nowhere on the figure — and an explicit legend would suppress the
      // categorical slice legend panther derives from series headers.
      legend: undefined,
    };
  }

  throw new Error("Bad presentation type");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveGeoJson(
  geo: FigureBundle["geo"],
  config: PresentationObjectConfig,
): GeoJSONFeatureCollection | undefined {
  if (!geo) return undefined;
  if (geo.kind === "data") return geo.data as GeoJSONFeatureCollection;
  // geo.kind === "level": derive from sync cache. Stored bundles without a
  // family predate the split and default to hmis (same ruling as an absent
  // ResultsValue.datasetFamily).
  const level = getAdminAreaLevelFromMapConfig(config);
  if (!level) return undefined;
  return getGeoJsonSync(geo.family ?? "hmis", level) ?? undefined;
}

function buildMapAutoLegend(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  localization: Pick<FigureLocalization, "language">,
) {
  const cf = selectCf(config.s);
  if (cf.type === "thresholds") {
    return getLegendFromConfig(config, formatAs, localization);
  }
  const noData = {
    color: "#f0f0f0",
    label: pickLang(localization.language, { en: "No data", fr: "Aucune donnée", pt: "Sem dados" }),
  };
  const domain =
    cf.type === "scale" && cf.domain.kind === "fixed"
      ? { min: cf.domain.min, max: cf.domain.max }
      : undefined;
  const steps = cf.type === "scale" ? cf.steps : undefined;
  const format = scaleLegendFormat(formatAs);
  if (steps !== undefined && steps >= 2) {
    return { type: "stepped-auto" as const, nSteps: steps, domain, ...format, noData };
  }
  return { type: "gradient-auto" as const, nTicks: 5, domain, ...format, noData };
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
  const periodType: PeriodType = getPeriodTypeFromValue(dateRange.min) ?? "year";
  if (dateRange.min === dateRange.max) {
    const d = formatPeriod(dateRange.min, periodType, calendar);
    return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d)
      .replaceAll("INTERVALO_DE_DATAS", d);
  }
  const separator = pickLang(language, { en: " to ", fr: " à ", pt: " a " });
  const d = formatPeriod(dateRange.min, periodType, calendar) + separator + formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d)
    .replaceAll("INTERVALO_DE_DATAS", d);
}

// The package catalog's own order, ids only — what every indicator axis sorts
// by (PLAN_1a §1.9). Entries with no stamped order follow, by id, so a mixed
// catalog is still deterministic.
function buildIndicatorIdOrder(metadata: IndicatorMetadataDisplay[]): string[] {
  return [...metadata]
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
    )
    .map((m) => m.id);
}

function buildIndicatorSortOrder(metadata: IndicatorMetadataDisplay[]): string[] {
  return [...metadata]
    .filter((m) => m.sort_order !== undefined)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((m) => [m.id, m.label]);
}

