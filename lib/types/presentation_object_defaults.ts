import type { PresentationObjectConfig } from "./presentation_objects.ts";

// Default configurations used for:
// 1. Merging with partial presentation objects in module loader
// 2. Creating presentation objects programmatically

export const DEFAULT_S_CONFIG: PresentationObjectConfig["s"] = {
  scale: 3,
  content: "bars",
  conditionalFormatting: "none",
  allowIndividualRowLimits: true,
  colorScale: "pastel-discrete",
  decimalPlaces: 0,
  hideLegend: false,
  showDataLabels: false,
  showDataLabelsLineCharts: false,
  barsStacked: false,
  specialCoverageChart: false,
  specialDisruptionsChart: false,
  diffAreas: false,
  diffAreasOrder: "actual-expected",
  diffInverted: false,
  specialBarChart: false,
  specialBarChartInverted: false,
  specialBarChartDiffThreshold: 0.1,
  specialBarChartDataLabels: "threshold-values",
  specialScorecardTable: false,
  verticalTickLabels: false,
  allowVerticalColHeaders: true,
  forceYMax1: false,
  forceYMinAuto: false,
  customSeriesStyles: [],
  nColsInCellDisplay: "auto",
  seriesColorFuncPropToUse: "series",
  sortIndicatorValues: "none",
  formatAdminArea3Labels: false,
  mapColorPreset: "red-green",
  mapColorReverse: false,
  mapColorFrom: "#fee0d2",
  mapColorTo: "#de2d26",
  mapProjection: "equirectangular",
  mapScaleType: "continuous",
  mapDiscreteSteps: 5,
  mapDomainType: "auto",
  mapDomainMin: 0,
  mapDomainMax: 1,
};

export const DEFAULT_T_CONFIG: PresentationObjectConfig["t"] = {
  caption: "",
  captionRelFontSize: 2,
  subCaption: "",
  subCaptionRelFontSize: 1.3,
  footnote: "",
  footnoteRelFontSize: 0.9,
};
