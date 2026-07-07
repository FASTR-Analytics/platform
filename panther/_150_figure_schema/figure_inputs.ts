// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  AnnotationRectStyle,
  ChartOHInputs,
  ChartOVInputs,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  FigureAnnotation,
  FigureAutofitOptions,
  FigureInputs,
  LegendInput,
  LegendItem,
  MapData,
  MapInputs,
  PointType,
  ScaleLegendConfig,
  SimpleVizData,
  SimpleVizInputs,
  TableInputs,
  TimeseriesInputs,
  VizGraphData,
  VizGraphInputs,
} from "./deps.ts";
import { type Conforms, zAnyPresentObject } from "./shared.ts";
import { zChartOHData } from "./chartoh.ts";
import { zChartOVData } from "./chartov.ts";
import { zTableData } from "./table.ts";
import { zTimeseriesData } from "./timeseries.ts";

// Style-leaning leaves: checked for primitive shape only, never mirrored —
// color keys and point types are part of the style surface, which churns.
const zColorKeyOrString = z.custom<ColorKeyOrString>(
  (v) =>
    typeof v === "string" ||
    (typeof v === "object" && v !== null && "key" in v),
);

// Function leaves never survive JSON storage (stringify drops them); they are
// accepted here for in-memory inputs.
const zLabelFormatter = z.custom<(value: number) => string>(
  (v) => typeof v === "function",
);

const zLegendNoData = z.object({
  color: zColorKeyOrString,
  label: z.string(),
});

const zLegendItem = z.object({
  label: z.string(),
  color: zColorKeyOrString,
  pointStyle: z
    .custom<PointType | "as-block" | "as-line">((v) => typeof v === "string")
    .optional(),
  lineDash: z.enum(["solid", "dashed"]).optional(),
  lineStrokeWidthScaleFactor: z.number().optional(),
});
const _zLegendItemConforms: Conforms<z.infer<typeof zLegendItem>, LegendItem> =
  true;

const zScaleLegendDomain = z.object({ min: z.number(), max: z.number() });

const zScaleLegendConfig = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("gradient"),
    stops: z.array(z.object({ value: z.number(), color: zColorKeyOrString })),
    ticks: z.array(z.number()),
    labelFormatter: zLabelFormatter.optional(),
    noData: zLegendNoData.optional(),
  }),
  z.object({
    type: z.literal("stepped"),
    steps: z.array(
      z.object({ min: z.number(), max: z.number(), color: zColorKeyOrString }),
    ),
    labelFormatter: zLabelFormatter.optional(),
    noData: zLegendNoData.optional(),
  }),
  z.object({
    type: z.literal("gradient-auto"),
    nTicks: z.number().optional(),
    domain: zScaleLegendDomain.optional(),
    format: z.enum(["number", "percent"]).optional(),
    labelFormatter: zLabelFormatter.optional(),
    noData: zLegendNoData.optional(),
  }),
  z.object({
    type: z.literal("stepped-auto"),
    nSteps: z.number(),
    domain: zScaleLegendDomain.optional(),
    format: z.enum(["number", "percent"]).optional(),
    labelFormatter: zLabelFormatter.optional(),
    noData: zLegendNoData.optional(),
  }),
]);
const _zScaleLegendConfigConforms: Conforms<
  z.infer<typeof zScaleLegendConfig>,
  ScaleLegendConfig
> = true;

export const zLegendInput: z.ZodType<LegendInput> = z.union([
  z.array(zLegendItem),
  z.array(z.string()),
  zScaleLegendConfig,
]);

const zFigureAutofitOptions = z.object({
  minScale: z.number().optional(),
  maxScale: z.number().optional(),
  minFontSizeDu: z.number().optional(),
});
const _zFigureAutofitOptionsConforms: Conforms<
  z.infer<typeof zFigureAutofitOptions>,
  FigureAutofitOptions
> = true;

const zFigureAnnotation = z.object({
  group: z.string(),
  // rect is pure style (colors/padding/text style) — present-and-object only.
  rect: z
    .custom<AnnotationRectStyle>((v) => typeof v === "object" && v !== null)
    .optional(),
});
const _zFigureAnnotationConforms: Conforms<
  z.infer<typeof zFigureAnnotation>,
  FigureAnnotation
> = true;

// FigureInputsBase fields, shared by every member below. `style` is the one
// deliberately opaque prop: it is the custom→global→default merge surface
// (function-valued, huge, highest churn), and consumers strip it before
// storage — there is nothing stored to validate.
const figureInputsBaseFields = {
  caption: z.string().optional(),
  subCaption: z.string().optional(),
  footnote: z.union([z.string(), z.array(z.string())]).optional(),
  legend: zLegendInput.optional(),
  style: z
    .custom<CustomFigureStyleOptions>((v) =>
      typeof v === "object" && v !== null
    )
    .optional(),
  autofit: z.union([z.boolean(), zFigureAutofitOptions]).optional(),
  autofitSurrounds: z.boolean().optional(),
  annotations: z.array(zFigureAnnotation).optional(),
};

export const zTableInputs = z.object({
  ...figureInputsBaseFields,
  tableData: zTableData,
  columnWidths: z
    .union([
      z.literal("equal"),
      z.array(z.union([z.number().nonnegative(), z.literal("auto")])),
    ])
    .optional(),
});
const _zTableInputsConforms: Conforms<
  z.infer<typeof zTableInputs>,
  TableInputs
> = true;

export const zChartOVInputs = z.object({
  ...figureInputsBaseFields,
  chartData: zChartOVData,
});
const _zChartOVInputsConforms: Conforms<
  z.infer<typeof zChartOVInputs>,
  ChartOVInputs
> = true;

export const zChartOHInputs = z.object({
  ...figureInputsBaseFields,
  chartOHData: zChartOHData,
});
const _zChartOHInputsConforms: Conforms<
  z.infer<typeof zChartOHInputs>,
  ChartOHInputs
> = true;

export const zTimeseriesInputs = z.object({
  ...figureInputsBaseFields,
  timeseriesData: zTimeseriesData,
});
const _zTimeseriesInputsConforms: Conforms<
  z.infer<typeof zTimeseriesInputs>,
  TimeseriesInputs
> = true;

export const zSimpleVizInputs = z.object({
  ...figureInputsBaseFields,
  simpleVizData: zAnyPresentObject<SimpleVizData>(),
});
const _zSimpleVizInputsConforms: Conforms<
  z.infer<typeof zSimpleVizInputs>,
  SimpleVizInputs
> = true;

export const zVizGraphInputs = z.object({
  ...figureInputsBaseFields,
  vizGraphData: zAnyPresentObject<VizGraphData>(),
});
const _zVizGraphInputsConforms: Conforms<
  z.infer<typeof zVizGraphInputs>,
  VizGraphInputs
> = true;

export const zMapInputs = z.object({
  ...figureInputsBaseFields,
  mapData: zAnyPresentObject<MapData>(),
});
const _zMapInputsConforms: Conforms<z.infer<typeof zMapInputs>, MapInputs> =
  true;

// The full FigureInputs union: surrounds and data validated, style opaque.
// simpleVizData/mapData remain deliberately unvalidated data members.
export const zFigureInputs: z.ZodType<FigureInputs> = z.union([
  zTableInputs,
  zChartOVInputs,
  zChartOHInputs,
  zTimeseriesInputs,
  zSimpleVizInputs,
  zVizGraphInputs,
  zMapInputs,
]);

export function isValidFigureInputs(x: unknown): boolean {
  return zFigureInputs.safeParse(x).success;
}
