import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getTimeseriesDataTransformed,
  t3,
  type GeoJSONFeatureCollection,
} from "panther";
import {
  ItemsHolderPresentationObject,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getCalendar,
  withReplicant,
} from "lib";
import { getLegendItemsFromConfig } from "./conditional_formatting";
import {
  getChartOHJsonDataConfigFromPresentationObjectConfig,
  getChartOVJsonDataConfigFromPresentationObjectConfig,
  getTableJsonDataConfigFromPresentationObjectConfig,
  getTimeseriesJsonDataConfigFromPresentationObjectConfig,
} from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getSpecialScorecardTableFigureInputs } from "./conditional_formatting_scorecard";
import { getMapJsonDataConfigFromPresentationObjectConfig } from "./get_data_config_for_map";

type StateHolder<T> =
  | {
      status: "loading";
      msg?: string | undefined;
    }
  | {
      status: "error";
      err: string;
    }
  | {
      status: "ready";
      data: T;
    };

export function getFigureInputsFromPresentationObject(
  resultsValue: ResultsValueForVisualization,
  ih: ItemsHolderPresentationObject,
  config: PresentationObjectConfig,
  geoJson?: GeoJSONFeatureCollection,
): StateHolder<FigureInputs> {
  // Type guard - this function should only be called with status: "ok"
  if (ih.status !== "ok") {
    throw new Error("getFigureInputsFromPresentationObject called with non-ok status");
  }

  // Strip single-value disaggregations so the renderer doesn't show
  // useless column groups, legend items, etc.
  const TIME_COLUMNS = new Set(["period_id", "quarter_id", "year", "month"]);
  const singlePeriod = ih.dateRange && ih.dateRange.min === ih.dateRange.max;
  const singleYear = ih.dateRange && Math.floor(ih.dateRange.min / 100) === Math.floor(ih.dateRange.max / 100);
  const effectiveConfig: PresentationObjectConfig = {
    ...config,
    d: {
      ...config.d,
      disaggregateBy: config.d.disaggregateBy.filter((d) => {
        if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
        if (singleYear && d.disOpt === "year") return false;
        if (config.d.filterBy.find((f) => f.disOpt === d.disOpt)?.values.length === 1) return false;
        return true;
      }),
    },
  };

  try {
    if (effectiveConfig.d.type === "timeseries") {
      const j = getTimeseriesJsonDataConfigFromPresentationObjectConfig(
        resultsValue,
        effectiveConfig,
        ih.indicatorLabelReplacements,
        ih.items,
      );
      const d = getTimeseriesDataTransformed(
        {
          jsonArray: ih.items,
          jsonDataConfig: j,
        },
        effectiveConfig.s.content === "bars" && effectiveConfig.s.barsStacked,
      );
      return {
        status: "ready",
        data: {
          timeseriesData: d,
          caption: withDateRange(
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: getLegendItemsFromConfig(config),
        },
      };
    }

    if (effectiveConfig.d.type === "table") {
      if (effectiveConfig.s.specialScorecardTable) {
        return {
          status: "ready",
          data: getSpecialScorecardTableFigureInputs(resultsValue, ih, effectiveConfig),
        };
      }
      return {
        status: "ready",
        data: {
          tableData: {
            jsonArray: ih.items,
            jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
              resultsValue,
              effectiveConfig,
              ih.indicatorLabelReplacements,
              ih.items,
            ),
          },
          caption: withDateRange(
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: getLegendItemsFromConfig(config),
        },
      };
    }

    if (effectiveConfig.d.type === "chart") {
      const commonSurrounds = {
        caption: withDateRange(
          withReplicant(
            config.t.caption,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        subCaption: withDateRange(
          withReplicant(
            config.t.subCaption,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        footnote: withDateRange(
          withReplicant(
            config.t.footnote,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
      };

      if (effectiveConfig.s.horizontal) {
        return {
          status: "ready",
          data: {
            chartOHData: {
              jsonArray: ih.items,
              jsonDataConfig:
                getChartOHJsonDataConfigFromPresentationObjectConfig(
                  resultsValue,
                  effectiveConfig,
                  ih.indicatorLabelReplacements,
                  ih.items,
                ),
            },
            ...commonSurrounds,
          },
        };
      }

      return {
        status: "ready",
        data: {
          chartData: {
            jsonArray: ih.items,
            jsonDataConfig:
              getChartOVJsonDataConfigFromPresentationObjectConfig(
                resultsValue,
                effectiveConfig,
                ih.indicatorLabelReplacements,
                ih.items,
              ),
          },
          ...commonSurrounds,
        },
      };
    }

    if (effectiveConfig.d.type === "map") {
      if (!geoJson) {
        return { status: "error", err: "GeoJSON data required for map visualization" };
      }
      const mapDataConfig = getMapJsonDataConfigFromPresentationObjectConfig(
        resultsValue,
        effectiveConfig,
        ih.indicatorLabelReplacements,
      );

      // DEBUG: Log map data matching
      const geoAreaIds = geoJson.features.slice(0, 5).map((f: any) => f.properties?.area_id);
      const geoFeatureProps = geoJson.features.slice(0, 2).map((f: any) => ({ properties: f.properties, id: f.id }));
      const dataAreaValues = ih.items.slice(0, 5).map((row: any) => row[mapDataConfig.areaProp]);
      const allDataAreaValues = new Set(ih.items.map((row: any) => String(row[mapDataConfig.areaProp] ?? "")));
      const allGeoAreaIds = new Set(geoJson.features.map((f: any) => String(f.properties?.area_id ?? "")));
      const matchCount = [...allDataAreaValues].filter(v => allGeoAreaIds.has(v)).length;
      const sampleValues = ih.items.slice(0, 3).map((row: any) => ({
        area: row[mapDataConfig.areaProp],
        value: row[mapDataConfig.valueProp],
        valueType: typeof row[mapDataConfig.valueProp],
      }));
      console.log("[MAP DEBUG]", {
        areaProp: mapDataConfig.areaProp,
        areaMatchProp: mapDataConfig.areaMatchProp,
        valueProp: mapDataConfig.valueProp,
        geoFeatureCount: geoJson.features.length,
        dataRowCount: ih.items.length,
        sampleGeoAreaIds: geoAreaIds,
        sampleDataAreaValues: dataAreaValues,
        uniqueDataAreas: allDataAreaValues.size,
        uniqueGeoAreas: allGeoAreaIds.size,
        matchingAreas: matchCount,
        sampleValues,
        geoFeatureProps: geoFeatureProps,
      });

      const mapItems = ih.items.map((row: any) => {
        const raw = row[mapDataConfig.valueProp];
        if (raw !== undefined && raw !== null && typeof raw === "string") {
          const num = Number(raw);
          if (!isNaN(num)) {
            return { ...row, [mapDataConfig.valueProp]: num };
          }
        }
        return row;
      });

      const mapStyle = getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number");
      console.log("[MAP DEBUG 2]", {
        sampleConvertedValues: mapItems.slice(0, 3).map((row: any) => ({
          value: row[mapDataConfig.valueProp],
          type: typeof row[mapDataConfig.valueProp],
        })),
        mapStyleSection: mapStyle.map,
      });

      return {
        status: "ready",
        data: {
          mapData: {
            geoData: geoJson,
            jsonArray: mapItems,
            jsonDataConfig: mapDataConfig,
          },
          caption: withDateRange(
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: config.s.hideLegend ? undefined
            : config.s.mapScaleType === "discrete"
            ? {
              type: "stepped-auto" as const,
              nSteps: config.s.mapDiscreteSteps ?? 5,
              domain: config.s.mapDomainType === "fixed"
                ? { min: config.s.mapDomainMin, max: config.s.mapDomainMax }
                : undefined,
              format: resultsValue.formatAs ?? "number",
              noData: { color: "#f0f0f0", label: t3({ en: "No data", fr: "Aucune donnée" }) },
            }
            : {
              type: "gradient-auto" as const,
              nTicks: 5,
              domain: config.s.mapDomainType === "fixed"
                ? { min: config.s.mapDomainMin, max: config.s.mapDomainMax }
                : undefined,
              format: resultsValue.formatAs ?? "number",
              noData: { color: "#f0f0f0", label: t3({ en: "No data", fr: "Aucune donnée" }) },
            },
        },
      };
    }

    return { status: "error", err: "Bad presentation type" };
  } catch (e) {
    console.error(e);
    return {
      status: "error",
      err:
        "Problem making figure inputs from presentation object: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

function withDateRange(
  str: string,
  dateRange: PeriodBounds | undefined,
): string {
  if (!str.includes("DATE_RANGE") && !str.includes("PLAGE_DE_DATES")) {
    return str;
  }
  if (!dateRange) {
    return str;
  }
  const calendar = getCalendar();
  const periodType: PeriodType =
    dateRange.periodOption === "period_id"
      ? "year-month"
      : dateRange.periodOption === "quarter_id"
        ? "year-quarter"
        : "year";
  if (dateRange.min === dateRange.max) {
    const d = formatPeriod(dateRange.min, periodType, calendar);
    return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
  }
  const d =
    formatPeriod(dateRange.min, periodType, calendar) +
    t3({ en: " to ", fr: " à " }) +
    formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
}
