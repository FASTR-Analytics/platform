import { getAdjustedColor, LegendItem, type ColorKeyOrString } from "panther";
import {
  _CF_GREEN,
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  _CF_RED,
  PeriodOption,
  PresentationObjectConfig,
  t3,
  TranslatableString,
} from "lib";

function getPeriodChangeLabels(
  timeseriesGrouping: PeriodOption,
  inverted: boolean
): { increase: string; decrease: string } {
  const labels = getPeriodChangeTranslatableStrings(timeseriesGrouping);
  return {
    increase: t3(labels.increase),
    decrease: t3(labels.decrease),
  };
}

function getPeriodChangeTranslatableStrings(
  timeseriesGrouping: PeriodOption
): {
  increase: TranslatableString;
  decrease: TranslatableString;
} {
  switch (timeseriesGrouping) {
    case "period_id":
      return {
        increase: {
          en: "Greater than 10% month-to-month increase",
          fr: "Augmentation de plus de 10% d'un mois à l'autre",
        },
        decrease: {
          en: "Greater than 10% month-to-month decrease",
          fr: "Diminution de plus de 10% d'un mois à l'autre",
        },
      };
    case "quarter_id":
      return {
        increase: {
          en: "Greater than 10% quarter-to-quarter increase",
          fr: "Augmentation de plus de 10% d'un trimestre à l'autre",
        },
        decrease: {
          en: "Greater than 10% quarter-to-quarter decrease",
          fr: "Diminution de plus de 10% d'un trimestre à l'autre",
        },
      };
    case "year":
      return {
        increase: {
          en: "Greater than 10% year-on-year increase",
          fr: "Augmentation de plus de 10% d'une année sur l'autre",
        },
        decrease: {
          en: "Greater than 10% year-on-year decrease",
          fr: "Diminution de plus de 10% d'une année sur l'autre",
        },
      };
  }
}

export function getColorFuncGivenConditionalFormatting(
  config: PresentationObjectConfig,
) {
  switch (config.s.conditionalFormatting) {
    case "none":
      return undefined;
    case "fmt-80-70":
      return (v: number | string | undefined | null) =>
        getCutoffColorFunc(0.8, 0.7, v);
    case "fmt-90-80":
      return (v: number | string | undefined | null) =>
        getCutoffColorFunc(0.9, 0.8, v);
    case "fmt-10-20":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncReverse(0.1, 0.2, v);
    case "fmt-05-10":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncReverse(0.05, 0.1, v);
    case "fmt-01-03":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncReverse(0.01, 0.03, v);
    case "fmt-neg10-pos10":
      return (v: number | string | undefined | null) =>
        getCutoffColorFunc(0.1, -0.1, v, { key: "base200" });
    case "fmt-thresholds-1-2-5":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncDynamic(
          { key: "base200" },
          [
            ["lt", -0.05, getAdjustedColor(_CF_LIGHTER_RED, { darken: 0.25 })],
            ["lt", -0.02, _CF_LIGHTER_RED],
            ["lt", -0.01, getAdjustedColor(_CF_LIGHTER_RED, { brighten: 0.5 })],
            ["gt", 0.05, getAdjustedColor(_CF_LIGHTER_GREEN, { darken: 0.25 })],
            ["gt", 0.02, _CF_LIGHTER_GREEN],
            [
              "gt",
              0.01,
              getAdjustedColor(_CF_LIGHTER_GREEN, { brighten: 0.5 }),
            ],
          ],
          v,
        );
    case "fmt-thresholds-2-5-10":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncDynamic(
          { key: "base200" },
          [
            ["lt", -0.1, getAdjustedColor(_CF_LIGHTER_RED, { darken: 0.25 })],
            ["lt", -0.05, _CF_LIGHTER_RED],
            ["lt", -0.02, getAdjustedColor(_CF_LIGHTER_RED, { brighten: 0.5 })],
            ["gt", 0.1, getAdjustedColor(_CF_LIGHTER_GREEN, { darken: 0.25 })],
            ["gt", 0.05, _CF_LIGHTER_GREEN],
            [
              "gt",
              0.02,
              getAdjustedColor(_CF_LIGHTER_GREEN, { brighten: 0.5 }),
            ],
          ],
          v,
        );
    case "fmt-thresholds-5-10-20":
      return (v: number | string | undefined | null) =>
        getCutoffColorFuncDynamic(
          { key: "base200" },
          [
            ["lt", -0.2, getAdjustedColor(_CF_LIGHTER_RED, { darken: 0.25 })],
            ["lt", -0.1, _CF_LIGHTER_RED],
            ["lt", -0.05, getAdjustedColor(_CF_LIGHTER_RED, { brighten: 0.5 })],
            ["gt", 0.2, getAdjustedColor(_CF_LIGHTER_GREEN, { darken: 0.25 })],
            ["gt", 0.1, _CF_LIGHTER_GREEN],
            [
              "gt",
              0.05,
              getAdjustedColor(_CF_LIGHTER_GREEN, { brighten: 0.5 }),
            ],
          ],
          v,
        );
    default:
      return undefined;
  }
}

export function getLegendItemsFromConfig(
  config: PresentationObjectConfig,
): LegendItem[] | undefined {
  if (config.s.specialCoverageChart) {
    return [
      {
        label: t3({
          en: "Administrative data",
          fr: "Données administratives",
        }),
        color: "#CED4DB",
        pointStyle: "as-line",
      },
      {
        label: t3({
          en: "Survey-based estimate",
          fr: "Estimation basée sur des enquêtes",
        }),
        color: "#000000",
        pointStyle: "as-line",
      },
      {
        label: t3({
          en: "Projected estimate",
          fr: "Estimation projetée",
        }),
        color: "#F04D44",
        pointStyle: "as-line",
      },
    ];
  }
  if (config.s.content === "bars" && config.s.specialBarChart) {
    if (!config.d.timeseriesGrouping) return undefined;
    const labels = getPeriodChangeLabels(
      config.d.timeseriesGrouping,
      config.s.specialBarChartInverted
    );

    if (config.s.specialBarChartInverted) {
      return [
        {
          label: labels.increase,
          color: _CF_RED,
        },
        {
          label: labels.decrease,
          color: _CF_GREEN,
        },
      ];
    }
    return [
      {
        label: labels.increase,
        color: _CF_GREEN,
      },
      {
        label: labels.decrease,
        color: _CF_RED,
      },
    ];
  }
  if (config.s.specialDisruptionsChart || (config.s.content === "areas" && config.s.diffAreas)) { // Legacy adapter — remove once all configs migrated
    if (config.s.diffInverted) {
      return [
        { label: t3({ en: "Actual", fr: "Réel" }), color: "#000000", pointStyle: "as-line" },
        {
          label: t3({ en: "Expected", fr: "Attendu" }),
          color: "#000000",
          pointStyle: "as-line",
          lineDash: "dashed",
          lineStrokeWidthScaleFactor: 0.5,
        },
        { label: t3({ en: "Excess", fr: "Excès" }), color: _CF_RED },
        { label: t3({ en: "Reduction", fr: "Réduction" }), color: _CF_GREEN },
      ];
    }
    return [
      { label: t3({ en: "Actual", fr: "Réel" }), color: "#000000", pointStyle: "as-line" },
      {
        label: t3({ en: "Expected", fr: "Attendu" }),
        color: "#000000",
        pointStyle: "as-line",
        lineDash: "dashed",
        lineStrokeWidthScaleFactor: 0.5,
      },
      { label: t3({ en: "Surplus", fr: "Excédent" }), color: _CF_GREEN },
      { label: t3({ en: "Disruption", fr: "Perturbation" }), color: _CF_RED },
    ];
  }
  switch (config.s.conditionalFormatting) {
    case "none":
      return undefined;
    case "fmt-80-70":
      return [
        { label: t3({ en: "80% or above", fr: "80 % ou plus" }), color: _CF_LIGHTER_GREEN },
        { label: t3({ en: "70% to 79%", fr: "70 % à 79 %" }), color: _CF_LIGHTER_YELLOW },
        { label: t3({ en: "Below 70%", fr: "Inférieur à 70 %" }), color: _CF_LIGHTER_RED },
      ];
    case "fmt-90-80":
      return [
        { label: t3({ en: "90% or above", fr: "90 % ou plus" }), color: _CF_LIGHTER_GREEN },
        { label: t3({ en: "80% to 89%", fr: "80 % à 89 %" }), color: _CF_LIGHTER_YELLOW },
        { label: t3({ en: "Below 80%", fr: "Inférieur à 80 %" }), color: _CF_LIGHTER_RED },
      ];
    case "fmt-10-20":
      return [
        { label: t3({ en: "20% or above", fr: "20 % ou plus" }), color: _CF_LIGHTER_RED },
        { label: t3({ en: "10% to 19%", fr: "10 % à 19 %" }), color: _CF_LIGHTER_YELLOW },
        { label: t3({ en: "Below 10%", fr: "Inférieur à 10 %" }), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-05-10":
      return [
        { label: t3({ en: "10% or above", fr: "10 % ou plus" }), color: _CF_LIGHTER_RED },
        { label: t3({ en: "5% to 9%", fr: "5 % à 9 %" }), color: _CF_LIGHTER_YELLOW },
        { label: t3({ en: "Below 5%", fr: "Inférieur à 5 %" }), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-01-03":
      return [
        { label: t3({ en: "3% or above", fr: "3 % ou plus" }), color: _CF_LIGHTER_RED },
        { label: t3({ en: "1% to 2%", fr: "1 % à 2 %" }), color: _CF_LIGHTER_YELLOW },
        { label: t3({ en: "Below 1%", fr: "Inférieur à 1 %" }), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-neg10-pos10":
      return [
        { label: t3({ en: "More than 10% above", fr: "Supérieur de plus de 10 %" }), color: _CF_LIGHTER_GREEN },
        {
          label: t3({ en: "-10% to +10%", fr: "-10% à +10%" }),
          color: { key: "base200" },
        },
        { label: t3({ en: "More than 10% below", fr: "Inférieur de plus de 10 %" }), color: _CF_LIGHTER_RED },
      ];
    default:
      return undefined;
  }
}

export function getCutoffColorFunc(
  c1: number,
  c2: number,
  v: number | string | undefined | null,
  alternativeMidColor?: ColorKeyOrString,
) {
  if (v === ".") {
    return "#ffffff";
  }
  const goodNum = Number(v);
  if (isNaN(goodNum)) {
    return "#ffffff";
  }
  if (goodNum < c2) {
    return _CF_LIGHTER_RED;
  }
  if (goodNum < c1) {
    return alternativeMidColor ?? _CF_LIGHTER_YELLOW;
  }
  return _CF_LIGHTER_GREEN;
}

export function getCutoffColorFuncReverse(
  c1: number,
  c2: number,
  v: number | string | undefined | null,
) {
  if (v === ".") {
    return "#ffffff";
  }
  const goodNum = Number(v);
  if (isNaN(goodNum)) {
    return "#ffffff";
  }
  if (goodNum >= c2) {
    return _CF_LIGHTER_RED;
  }
  if (goodNum >= c1) {
    return _CF_LIGHTER_YELLOW;
  }
  return _CF_LIGHTER_GREEN;
}

function getCutoffColorFuncDynamic(
  defaultColour: ColorKeyOrString,
  cutoffs: ["lt" | "lte" | "gt" | "gte", number, ColorKeyOrString][],
  v: number | string | undefined | null,
) {
  if (v === ".") {
    return "#ffffff";
  }
  const goodNum = Number(v);
  if (isNaN(goodNum)) {
    return "#ffffff";
  }
  for (const [operator, cutoff, color] of cutoffs) {
    if (operator === "lt") {
      if (goodNum < cutoff) {
        return color;
      }
    }
    if (operator === "lte") {
      if (goodNum <= cutoff) {
        return color;
      }
    }
    if (operator === "gt") {
      if (goodNum > cutoff) {
        return color;
      }
    }
    if (operator === "gte") {
      if (goodNum >= cutoff) {
        return color;
      }
    }
  }
  return defaultColour;
}
