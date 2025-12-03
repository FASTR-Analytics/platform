import { getAdjustedColor, LegendItem, type ColorKeyOrString } from "panther";
import {
  _CF_GREEN,
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  _CF_RED,
  PresentationObjectConfig,
  t,
  t2,
  T,
} from "lib";

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
  if (config.s.content === "bars" && config.s.specialBarChart) {
    if (config.s.specialBarChartInverted) {
    return [
      {
        label: t2(T.FRENCH_UI_STRINGS.greater_than_10_quartertoquart_1),
        color: _CF_RED,
      },
      {
        label: t2(T.FRENCH_UI_STRINGS.greater_than_10_quartertoquart),
        color: _CF_GREEN,
      },
    ];
  } 
    return [
      {
        label: t2(T.FRENCH_UI_STRINGS.greater_than_10_quartertoquart_1),
        color: _CF_GREEN,
      },
      {
        label: t2(T.FRENCH_UI_STRINGS.greater_than_10_quartertoquart),
        color: _CF_RED,
      },
    ];
  
  }
  if (config.s.content === "areas" && config.s.diffAreas) {
    if (config.s.diffInverted) {
      return [
        { label: t("Actual"), color: "#000000", pointStyle: "as-line" },
        {
          label: t("Expected"),
          color: "#000000",
          pointStyle: "as-line",
          lineDash: "dashed",
          lineStrokeWidthScaleFactor: 0.5,
        },
        { label: t("Excess"), color: _CF_RED },
        { label: t("Reduction"), color: _CF_GREEN },
      ];
    }
    return [
      { label: t("Actual"), color: "#000000", pointStyle: "as-line" },
      {
        label: t("Expected"),
        color: "#000000",
        pointStyle: "as-line",
        lineDash: "dashed",
        lineStrokeWidthScaleFactor: 0.5,
      },
      { label: t2(T.FRENCH_UI_STRINGS.surplus), color: _CF_GREEN },
      { label: t2(T.FRENCH_UI_STRINGS.disruption), color: _CF_RED },
    ];
  }
  switch (config.s.conditionalFormatting) {
    case "none":
      return undefined;
    case "fmt-80-70":
      return [
        { label: t("80% or above"), color: _CF_LIGHTER_GREEN },
        { label: t("70% to 79%"), color: _CF_LIGHTER_YELLOW },
        { label: t("Below 70%"), color: _CF_LIGHTER_RED },
      ];
    case "fmt-90-80":
      return [
        { label: t("90% or above"), color: _CF_LIGHTER_GREEN },
        { label: t("80% to 89%"), color: _CF_LIGHTER_YELLOW },
        { label: t("Below 80%"), color: _CF_LIGHTER_RED },
      ];
    case "fmt-10-20":
      return [
        { label: t("20% or above"), color: _CF_LIGHTER_RED },
        { label: t("10% to 19%"), color: _CF_LIGHTER_YELLOW },
        { label: t("Below 10%"), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-05-10":
      return [
        { label: t("10% or above"), color: _CF_LIGHTER_RED },
        { label: t("5% to 9%"), color: _CF_LIGHTER_YELLOW },
        { label: t("Below 5%"), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-01-03":
      return [
        { label: t("3% or above"), color: _CF_LIGHTER_RED },
        { label: t("1% to 2%"), color: _CF_LIGHTER_YELLOW },
        { label: t("Below 1%"), color: _CF_LIGHTER_GREEN },
      ];
    case "fmt-neg10-pos10":
      return [
        { label: t("More than 10% above"), color: _CF_LIGHTER_GREEN },
        {
          label: t2(T.FRENCH_UI_STRINGS["10_to_10"]),
          color: { key: "base200" },
        },
        { label: t("More than 10% below"), color: _CF_LIGHTER_RED },
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
