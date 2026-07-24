import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getPeriodTypeFromValue,
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
  selectCf,
  withReplicant,
  type DeckStyleContext,
  type IndicatorMetadata,
} from "lib";
import { getLegendFromConfig } from "./conditional_formatting";
import {
  getChartOHJsonDataConfigFromPresentationObjectConfig,
  getChartOVJsonDataConfigFromPresentationObjectConfig,
  getTableJsonDataConfigFromPresentationObjectConfig,
  getTimeseriesJsonDataConfigFromPresentationObjectConfig,
} from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getMapJsonDataConfigFromPresentationObjectConfig } from "./get_data_config_for_map";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import {
  isSpecialDisruptionsChartActive,
  isSpecialScorecardTableActive,
  metricAllowsNegativeScale,
  metricAlwaysObeysFormatAs,
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

  const effectiveFormatAs: "percent" | "number" =
    !metricAlwaysObeysFormatAs(bundle.metricId) &&
    displayedIndicatorsAllPercent(items, indicatorMetadata, config)
      ? "percent"
      : resultsValue.formatAs;

  const allowNegativeScale = metricAllowsNegativeScale(bundle.metricId);
  const obeyMetricFormat = metricAlwaysObeysFormatAs(bundle.metricId);

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

  if (effectiveConfig.d.type === "timeseries") {
    const j = getTimeseriesJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
      localization,
      items,
    );
    const d = getTimeseriesDataTransformed(
      { jsonArray: items, jsonDataConfig: j },
      effectiveConfig.s.content === "bars" && effectiveConfig.s.barsStacked,
    );
    return {
      timeseriesData: d,
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, deckStyle, indicatorMetadata, allowNegativeScale, obeyMetricFormat, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormatAs, localization),
    };
  }

  if (effectiveConfig.d.type === "table") {
    const customSortHeaders = isSpecialScorecardTableActive(config)
      ? buildIndicatorSortOrder(indicatorMetadata)
      : undefined;
    return {
      tableData: {
        jsonArray: items,
        jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          effectiveValueProps,
          indicatorLabelReplacements,
          localization,
          items,
          customSortHeaders,
        ),
      },
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, deckStyle, indicatorMetadata, allowNegativeScale, obeyMetricFormat, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormatAs, localization),
    };
  }

  if (effectiveConfig.d.type === "chart") {
    const surrounds = {
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, deckStyle, indicatorMetadata, allowNegativeScale, obeyMetricFormat, effectiveValueProps),
      legend: getLegendFromConfig(config, effectiveFormatAs, localization),
    };
    if (effectiveConfig.s.horizontal) {
      return {
        chartOHData: {
          jsonArray: items,
          jsonDataConfig: getChartOHJsonDataConfigFromPresentationObjectConfig(
            resultsValue,
            effectiveConfig,
            effectiveValueProps,
            indicatorLabelReplacements,
            localization,
            items,
          ),
        },
        ...surrounds,
      };
    }
    return {
      chartData: {
        jsonArray: items,
        jsonDataConfig: getChartOVJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          effectiveValueProps,
          indicatorLabelReplacements,
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
      throw new Error(`[INFO] Map files not yet uploaded for Admin Area ${level ?? ""}`);
    }
    const mapDataConfig = getMapJsonDataConfigFromPresentationObjectConfig(
      resultsValue,
      effectiveConfig,
      effectiveValueProps,
      indicatorLabelReplacements,
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
      mapData: {
        geoData: geoJson,
        jsonArray: mapItems,
        jsonDataConfig: mapDataConfig,
      },
      caption: withDateRange(withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      subCaption: withDateRange(withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      footnote: withDateRange(withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3), dateRange, localization),
      style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, deckStyle, indicatorMetadata, allowNegativeScale, obeyMetricFormat, effectiveValueProps),
      legend: config.s.hideLegend ? undefined : buildMapAutoLegend(config, effectiveFormatAs, localization),
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
  // geo.kind === "level": derive from sync cache
  const level = getAdminAreaLevelFromMapConfig(config);
  if (!level) return undefined;
  return getGeoJsonSync(level) ?? undefined;
}

function buildMapAutoLegend(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
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
  if (steps !== undefined && steps >= 2) {
    return { type: "stepped-auto" as const, nSteps: steps, domain, format: formatAs, noData };
  }
  return { type: "gradient-auto" as const, nTicks: 5, domain, format: formatAs, noData };
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

function buildIndicatorSortOrder(metadata: IndicatorMetadata[]): string[] {
  return [...metadata]
    .filter((m) => m.sort_order !== undefined)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((m) => [m.id, m.label]);
}

function displayedIndicatorsAllPercent(
  items: FigureBundle["items"],
  metadata: IndicatorMetadata[],
  config: PresentationObjectConfig,
): boolean {
  const formatById = new Map(
    metadata
      .filter((m) => m.format_as !== undefined)
      .map((m) => [m.id, m.format_as!] as const),
  );
  if (formatById.size === 0) return false;

  const cols = config.d.disaggregateBy.map((d) => d.disOpt);
  let sawIndicator = false;

  const inspect = (value: string | number | null | undefined): boolean => {
    const format = typeof value === "string" ? formatById.get(value) : undefined;
    if (format === undefined) return true;
    sawIndicator = true;
    return format === "percent";
  };

  if (!inspect(config.d.selectedReplicantValue)) return false;
  for (const row of items) {
    for (const col of cols) {
      if (!inspect(row[col])) return false;
    }
  }
  return sawIndicator;
}
