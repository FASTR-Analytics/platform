// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AnchorPoint,
  type CalendarType,
  type CascadeArrowInfo,
  type CascadeArrowInfoFunc,
  type ChartSeriesInfoFunc,
  type ChartValueInfoFunc,
  Color,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  getColor,
  type MapRegionInfoFunc,
  normalizeTo01,
  type PaddingOptions,
  type PieSliceInfoFunc,
  type TableCellInfoFunc,
  type TableHeaderInfoFunc,
  toPct0,
  typed,
  type ValuesColorFunc,
  type VizGraphEdgeInfoFunc,
  type VizGraphNodeInfoFunc,
} from "./deps.ts";
import type {
  AreaDiffPair,
  ArrowheadFitFallback,
  GenericAreaStyle,
  GenericBarStyle,
  GenericCascadeArrowStyle,
  GenericConfidenceBandStyle,
  GenericConnectorStyle,
  GenericDataLabelBaseStyle,
  GenericErrorBarStyle,
  GenericLineStyle,
  GenericMapRegionStyle,
  GenericPieSliceStyle,
  GenericPointStyle,
  GenericTableCellStyle,
  GenericTableHeaderStyle,
  GenericTableHeaderStyleOptions,
} from "./style_func_types.ts";
import {
  SERIES_COLOR_SENTINEL,
  VALUES_COLOR_SENTINEL,
} from "./style_func_types.ts";
import type { LabelCollisionConfig } from "./_3_merged_style_return_types.ts";
import type { LegendPosition } from "./types.ts";

// Shared default for every figure's labelCollision block (map, pie). The
// blocks stay per-figure (collision policy is figure-wide structural style),
// but the numbers are one calibration.
function defaultLabelCollision(): LabelCollisionConfig {
  return {
    gap: 12,
    maxCentroidDisplacement: 20,
    maxIterations: 10,
  };
}

// Shared defaults for every zero-way figure's label-placement policy (map,
// pie). Same reasoning as defaultLabelCollision: the blocks stay per-figure
// because placement policy is figure-wide structural style, but the numbers are
// one calibration.
function defaultLabelPlacement() {
  return {
    // Which placer runs for labels that go outside. "flank" stacks them in a
    // column per side; "nearest" puts each at its own nearest point on the
    // figure's silhouette. Each figure flips its own default as it is wired.
    outsideLabelPlacement: typed<"nearest" | "flank">("flank"),
    // How close a padded label box may come to the silhouette at directions
    // where its CORNER leads. At the cardinals an edge leads and the clearance
    // is calloutMargin exactly; this guards the diagonals, where ray-exit
    // anchoring alone drives a wide label into the shape.
    labelClearanceFloor: 4,
    // Direction, in degrees off a cardinal, at which a nearest-point label's
    // text alignment flips from centred to edge-aligned. 45 gives even
    // quarters and puts the switch where the box's own corner starts to lead.
    labelAlignmentSwitchAngle: 45,
    // How many lines a label may wrap onto while fighting to stay INSIDE its
    // own element. 1 is a single unwrapped test.
    maxLabelLines: 2,
    // The share of the room at its anchor a label's text must fit within to
    // stay inside. Below 1 so "fits" means comfortably, not exactly.
    insideFitFraction: 0.9,
    // The width an OUTSIDE label's text wraps at, as a fraction of the cell.
    labelWrapFraction: 0.4,
  };
}

const _DS = {
  seriesColorFunc: typed<ChartSeriesInfoFunc<ColorKeyOrString>>(() => ({
    key: "baseContent",
  })),

  valuesColorFunc: typed<ValuesColorFunc>((v, min, max) => {
    if (v === undefined) return "#f0f0f0";
    const t = normalizeTo01(v, min, max);
    return Color.scaledPct(
      getColor({ key: "base200" }),
      getColor({ key: "baseContent" }),
      t,
    );
  }),

  // Surrounds
  surrounds: {
    padding: typed<PaddingOptions>(0),
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
    legendGap: 15,
    legendPosition: typed<LegendPosition>("bottom-left"),
    captionGap: 15,
    subCaptionTopPadding: 7,
    footnoteGap: 15,
    captionAlignH: typed<"left" | "center" | "right">("left"),
    subCaptionAlignH: typed<"left" | "center" | "right">("left"),
    footnoteAlignH: typed<"left" | "center" | "right">("left"),
  },
  // Legend
  legend: {
    legendNoRender: false,
    maxLegendItemsInOneColumn: typed<number | number[]>(3),
    legendColorBoxWidth: 40,
    legendItemVerticalGap: 5,
    legendLabelGap: 10,
    legendPointRadius: 8,
    legendPointStrokeWidth: 3,
    legendLineStrokeWidth: 3,
    legendPointInnerColorStrategy: typed<ColorAdjustmentStrategy>({
      opacity: 0.3,
    }),
    reverseOrder: false,
  },
  // Scale legend
  scaleLegend: {
    barHeight: 12,
    tickLength: 4,
    labelGap: 4,
    blockGap: 1,
    noDataGap: 8,
    noDataSwatchWidth: 24,
  },
  // Table
  table: {
    rowHeaderIndentIfRowGroups: 20,
    verticalColHeaders: typed<"never" | "always" | "auto">("auto"),
    maxHeightForVerticalColHeaders: 300,
    colHeaderPadding: typed<PaddingOptions>(5),
    rowHeaderPadding: typed<PaddingOptions>([5, 10]),
    cellPadding: typed<PaddingOptions>(5),
    alignV: typed<"top" | "middle" | "bottom">("top"),
    colHeaderBackgroundColor: typed<ColorKeyOrString | "none">({
      key: "base100",
    }),
    colGroupHeaderBackgroundColor: typed<ColorKeyOrString | "none">({
      key: "base200",
    }),
    headerBorderWidth: 1,
    gridLineWidth: 1,
    borderWidth: 1,
    headerBorderColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    gridLineColor: typed<ColorKeyOrString>({ key: "base300" }),
    borderColor: typed<ColorKeyOrString>({ key: "base300" }),
  },
  // Lanes
  lanes: {
    hideHeaders: false,
    paddingLeft: 0,
    paddingRight: 0,
    gapX: 10,
    headerAlignH: typed<"left" | "center" | "right">("center"),
    headerGap: 5,
  },
  // X Axis
  xTextAxis: {
    verticalTickLabels: false,
    tickPosition: typed<"sides" | "center">("sides"),
    tickHeight: 10,
    tickLabelGap: 10,
    maxTickLabelHeightAsPctOfChart: 0.5,
  },
  xScaleAxis: {
    max: typed<number | "auto" | "auto-zero" | ((i_pane: number) => number)>(
      "auto",
    ),
    min: typed<number | "auto" | "auto-zero" | ((i_pane: number) => number)>(0),
    labelGap: 10,
    tickHeight: 10,
    tickLabelGap: 5,
    tickLabelFormatter: typed<"auto-number" | "auto-percent">("auto-percent"),
    tickLabelAlignment: typed<"center" | "inset">("center"),
    allowIndividualLaneLimits: false,
    exactAxisY: typed<"none" | number>("none"),
  },
  xPeriodAxis: {
    forceSideTicksWhenYear: false,
    showEveryNthTick: 1,
    periodLabelSmallTopPadding: 5,
    periodLabelLargeTopPadding: 5,
    calendar: typed<CalendarType>("gregorian"),
  },
  // Y Axis
  yTextAxis: {
    tickPosition: typed<"sides" | "center">("sides"),
    paddingTop: 0,
    paddingBottom: 0,
    tickWidth: 10,
    tickLabelGap: 10,
    logicTickLabelWidth: typed<"auto" | "fixed">("auto"),
    maxTickLabelWidthAsPctOfChart: 0.5,
  },
  yScaleAxis: {
    max: typed<number | "auto" | "auto-zero" | ((i_series: number) => number)>(
      "auto",
    ),
    min: typed<number | "auto" | "auto-zero" | ((i_series: number) => number)>(
      0,
    ),
    labelGap: 10,
    tickWidth: 10,
    tickLabelGap: 5,
    tickLabelFormatter: typed<"auto-number" | "auto-percent">("auto-percent"),
    tickLabelAlignment: typed<"center" | "inset">("center"),
    exactAxisX: typed<"none" | number>("none"),
    allowIndividualTierLimits: false,
  },
  // Natural ideal-height policy, same decay family T × (a + (1−a) × k^(n−1)):
  // - idealPlotHeight (ChartOV/Timeseries plot height): anchor 450 DU at one
  //   subchart row, asymptote 180 (0.4×), steep k=0.5 — row counts are small.
  // - idealRowThickness (ChartOH bar thickness): anchor 40 DU at one bar row,
  //   asymptote 6 (0.15×), gentle k=0.97 — bar counts run into the hundreds, so
  //   the decay must span a much wider range than the plot-height curve.
  // - idealPieDiameter (pie DISC diameter, 2s): anchor 320 DU at one
  //   indicator per sub-chart, asymptote 112 (0.35×), k=0.75 — between its
  //   siblings' decays (pie counts are single digits). Does double duty: a
  //   CAP on the ideal pass's width-driven term, and the draw-time MAXIMUM —
  //   a pie is never drawn larger than this, whatever frame it is given
  //   (owner-ruled 2026-08-05; the maxBarWidth precedent), so a big fixed
  //   frame yields a natural-size disc centred in whitespace rather than a
  //   massive disc beside small type.
  // All are tunable starting points; the anchor is the single tuning knob.
  idealHeight: {
    idealPlotHeight: (n: number) => 300 * (0.4 + 0.6 * 0.5 ** (n - 1)),
    idealRowThickness: (n: number) => 40 * (0.15 + 0.85 * 0.97 ** (n - 1)),
    idealPieDiameter: (n: number) => 320 * (0.35 + 0.65 * 0.75 ** (n - 1)),
  },
  // Content`
  content: {
    dataLabel: typed<GenericDataLabelBaseStyle>({
      show: false,
      offset: 3,
      backgroundColor: "none",
      padding: 0,
      borderWidth: 0,
      rectRadius: 0,
      // The single home for leader-line defaults. A leader line belongs to the
      // label at its end, so every figure that draws one (map callouts, pie
      // outside labels) reads it from here — no per-figure duplicate.
      leaderLine: {
        strokeColor: { key: "base300" },
        strokeWidth: 1,
        gap: 4,
      },
    }),
    points: {
      func: typed<GenericPointStyle>({
        show: false,
        pointStyle: "circle",
        radius: 5,
        color: SERIES_COLOR_SENTINEL,
        strokeWidth: 2,
        innerColorStrategy: { opacity: 0.5 },
        dataLabelPosition: "top",
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
    },
    bars: {
      func: typed<GenericBarStyle>({
        show: false,
        fillColor: SERIES_COLOR_SENTINEL,
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
      stacking: typed<"none" | "stacked" | "imposed" | "diff">("none"),
      maxBarWidth: 200,
    },
    lines: {
      func: typed<GenericLineStyle>({
        show: false,
        strokeWidth: 3,
        color: SERIES_COLOR_SENTINEL,
        lineDash: "solid",
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
      joinAcrossGaps: true,
    },
    areas: {
      func: typed<GenericAreaStyle>({
        show: false,
        to: "zero-line",
        fillColor: SERIES_COLOR_SENTINEL,
        fillColorAdjustmentStrategy: { opacity: 0.5 },
      }),
      joinAcrossGaps: true,
      diff: {
        enabled: false,
        pairs: typed<AreaDiffPair[]>([{ series: [0, 1], emit: "both" }]),
      },
    },
    errorBars: {
      func: typed<GenericErrorBarStyle>({
        show: true,
        strokeColor: { key: "baseContent" },
        strokeWidth: 3,
        capWidthProportion: 0.4,
      }),
    },
    confidenceBands: {
      func: typed<GenericConfidenceBandStyle>({
        show: true,
        fillColor: SERIES_COLOR_SENTINEL,
        fillColorAdjustmentStrategy: { opacity: 0.15 },
      }),
    },
    cascadeArrows: {
      func: typed<GenericCascadeArrowStyle>({
        show: false,
        strokeColor: { key: "baseContent" },
        strokeWidth: 1.5,
        arrowHeadLength: 6,
        showArrowhead: true,
        arrowLengthPctOfSpace: 0.7,
        arrowLabelGap: 4,
        dataLabel: {
          show: true,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<CascadeArrowInfoFunc<string> | "none">(
        (info: CascadeArrowInfo) => toPct0(info.relRetention),
      ),
    },
    connectors: {
      func: typed<GenericConnectorStyle>({
        show: false,
        strokeColor: { key: "baseContent" },
        strokeWidth: 2,
        lineDash: "solid",
        arrowhead: "none",
        arrowHeadLength: 6,
      }),
      joinAcrossGaps: true,
      arrowheadFitFallback: typed<ArrowheadFitFallback>("line-only"),
    },
    mapRegions: {
      func: typed<GenericMapRegionStyle>({
        show: true,
        fillColor: VALUES_COLOR_SENTINEL,
        strokeColor: { key: "baseContent" },
        strokeWidth: 1,
        dataLabel: {
          show: false,
          offset: 0,
          backgroundColor: "#ffffff",
          padding: 3,
          borderColor: { key: "base300" },
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<MapRegionInfoFunc<string> | "none">("none"),
    },
    slices: {
      func: typed<GenericPieSliceStyle>({
        show: true,
        fillColor: SERIES_COLOR_SENTINEL,
        strokeColor: "none",
        strokeWidth: 0,
        dataLabel: {
          show: false,
          offset: 0,
          backgroundColor: "none",
          padding: 3,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<PieSliceInfoFunc<string> | "none">("none"),
    },
    // alignV for cells and row headers is deliberately absent here — its
    // default is the table-wide `table.alignV` (resolved as a fallback
    // cascade in the style builders, like colHeaderBackgroundColor).
    tableCells: {
      func: typed<GenericTableCellStyle>({
        backgroundColor: "none",
        textColorStrategy: "none",
        alignH: "center",
      }),
      textFormatter: typed<TableCellInfoFunc<string> | "none">("none"),
    },
    tableRowHeaders: {
      func: typed<GenericTableHeaderStyle>({
        backgroundColor: "none",
        textColorStrategy: "none",
        alignH: "left",
      }),
      textFormatter: typed<TableHeaderInfoFunc<string> | "none">("none"),
    },
    tableColHeaders: {
      func: typed<GenericTableHeaderStyleOptions>({
        textColorStrategy: "none",
        alignH: "center",
        alignV: "bottom",
      }),
      textFormatter: typed<TableHeaderInfoFunc<string> | "none">("none"),
    },
  },
  // Grid
  grid: {
    showGrid: true,
    axisStrokeWidth: 3,
    gridStrokeWidth: 1,
    axisColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    gridColor: typed<ColorKeyOrString>({ key: "base300" }),
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
  },
  // Tiers
  tiers: {
    hideHeaders: false,
    paddingTop: 10,
    paddingBottom: 10,
    gapY: 50,
    maxHeaderWidthAsPctOfChart: 0.3,
    headerAlignH: typed<"left" | "center" | "right">("left"),
    headerAlignV: typed<"top" | "middle">("top"),
    headerPosition: typed<"left" | "above-axis" | "above-plot-area">("left"),
    headerGap: 5,
  },
  // Panes
  panes: {
    hideHeaders: false,
    padding: 0,
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
    headerAlignH: typed<"left" | "center" | "right">("left"),
    headerGap: 5,
    gapX: 15,
    gapY: 15,
    nCols: typed<number | "auto">("auto"),
  },
  // SimpleViz
  simpleviz: {
    layerGap: 150,
    orderGap: 100,
    layerAlign: typed<
      "left" | "center" | "right" | Array<"left" | "center" | "right">
    >("left"),
    boxes: {
      fillColor: typed<ColorKeyOrString>({ key: "base200" }),
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 1,
      alignH: typed<"left" | "center" | "right">("center"),
      alignV: typed<"top" | "middle" | "bottom">("middle"),
      textGap: 10,
      padding: typed<PaddingOptions>(10),
      arrowStartPoint: typed<AnchorPoint>("center"),
      arrowEndPoint: typed<AnchorPoint>("center"),
    },
    arrows: {
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 2,
      lineDash: typed<"solid" | "dashed">("solid"),
      truncateStart: 10,
      truncateEnd: 10,
    },
  },
  // VizGraph
  vizgraph: {
    nodes: {
      fillColor: typed<ColorKeyOrString>({ key: "base100" }),
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 1,
      rectRadius: 6,
      padding: typed<PaddingOptions>(10),
      maxTextWidth: 200,
      textGap: 6,
      nodeInfo: typed<VizGraphNodeInfoFunc>(() => ({})),
    },
    edges: {
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 1.5,
      lineDash: typed<"solid" | "dashed">("solid"),
      arrowheadSize: 7,
      edgeInfo: typed<VizGraphEdgeInfoFunc>(() => ({})),
    },
    // Defaults for UNFOLDED group boxes (drawn behind member nodes); folded
    // reps default to node chrome. Per-group overrides flow through
    // nodes.nodeInfo with info.isGroup.
    groups: {
      fillColor: typed<ColorKeyOrString>("transparent"),
      strokeColor: typed<ColorKeyOrString>({ key: "base300" }),
      strokeWidth: 1,
      rectRadius: 6,
      labelInset: 8,
    },
  },
  // Sankey
  sankey: {
    nodeWidth: 20,
    nodeGap: 10,
    columnGap: typed<number | "auto">("auto"),
    labelGap: 8,
    linkOpacity: 0.5,
    defaultNodeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    defaultLinkColor: typed<ColorKeyOrString>({ key: "base300" }),
    layoutMode: typed<"flow" | "tiered">("flow"),
  },
  map: {
    projection: typed<"equirectangular" | "mercator" | "naturalEarth1">(
      "equirectangular",
    ),
    fit: typed<"all-regions" | "only-regions-in-data">("all-regions"),
    boundingBox: typed<[number, number, number, number] | undefined>(undefined),
    // Where a region's label goes. "centroid" pins every label to its region's
    // centroid whatever happens; "callout" sends every label outside; "auto"
    // keeps a label inside when it genuinely fits and exiles the rest.
    //
    // "auto" since 2026-07-27, ruled by the owner. The old default was
    // "centroid", and on any dense map it produced a pile: Kenya adm1 with all
    // 47 counties labelled draws seventeen of them on top of each other in the
    // west, unreadable. Under "auto" the same map keeps 20 inside and takes 27
    // out to their own nearest points, all legible, zero overlaps.
    //
    // It is NOT free, and the cost is the reason this was a decision rather
    // than an obvious fix. "centroid" needs no distance field, no track and no
    // content-scale solve against labels; "auto" needs all three as soon as one
    // label is exiled. Measured, one measure() of a labelled map:
    //
    //   kenya, 47 regions     131ms -> 2254ms
    //   east africa, 19       95ms  -> 861ms
    //   kenya, 16 labelled    96ms  -> 340ms
    //
    // Nothing changes for a map that draws no labels, which is the default
    // (content.mapRegions.func.dataLabel.show is false): the whole label solve
    // is gated on there being labels at all. A consumer who wants the old
    // behaviour, or the old cost, sets this key to "centroid".
    dataLabelMode: typed<"none" | "centroid" | "callout" | "auto">("auto"),
    // The silhouette-to-label clearance for callout labels. 12 preserves the
    // look shipped while this key was dead and the clearance was hardwired to
    // labelCollision.gap.
    calloutMargin: 12,
    labelCollision: defaultLabelCollision(),
    ...defaultLabelPlacement(),
    // Each outside label goes to the nearest point on the map's own dilated
    // outline rather than into a column on the flank. Ruled and shipped
    // 2026-07-27, on these measurements — nearest against flank on identical
    // inputs, mean anchor-to-label distance:
    //
    //   kenya callout, 16 labels    105.9 -> 77.0
    //   east africa callout, 10     125.5 -> 78.2
    //   east africa auto, 19        117.5 -> 76.1   inside 4 -> 6
    //   kenya auto, 26 outside      140.1 -> 123.7
    //   kenya callout, 47           identical: that cell is genuinely
    //                               saturated and falls back to flank, which
    //                               is the design (plan N10)
    //
    // Zero overlaps, zero escapes and zero crossing leaders throughout, except
    // two near-saturated cells that keep 2 and 1 (budgeted in
    // map_figure_check.ts). The bar the owner set was "beats flank on leader
    // length AND inside retention"; the last case that missed it, Kenya adm1
    // `auto`, was 2.4% worse until the step-10 untangle and is now 14% better.
    //
    // The flank placer is not gone: it is the per-cell fallback when a track
    // cannot hold its labels, and the opt-out via this key.
    outsideLabelPlacement: typed<"nearest" | "flank">("nearest"),
  },

  pie: {
    // 0 = pie; 0..1 = doughnut (the fraction of the outer radius left empty).
    innerRadiusRatio: 0,
    // 12 o'clock, matching every mainstream library.
    startAngle: -90,
    // How far the whole pie runs, in degrees. 360 = a full pie; less makes a
    // gauge, whose slices are fractions OF THE SWEEP — so an explicit `total`'s
    // remainder slice becomes the gauge's track for free. Companion to
    // startAngle: that says where the arc begins, this says how far it goes.
    // Clamped to (0, 360].
    sweepAngle: 360,
    direction: typed<"clockwise" | "counterclockwise">("clockwise"),
    // Space between adjacent slices, as a WIDTH (DU, scaled) rather than an
    // angle: each slice's radial edges are inset half of it, parallel to the
    // boundary ray, so the channel stays the same width from hub to rim and a
    // slice reads as a band rather than a wedge. 0 = slices touch.
    sliceGap: 0,
    cornerRadius: 0,
    labelMode: typed<"none" | "inside" | "outside" | "auto">("auto"),
    // The silhouette-to-label clearance for outside labels; see map's note.
    calloutMargin: 12,
    // "total" prints the summed values; "share" prints sum/total as a percent
    // (the completion-pie form: 75 of 100 reads "75%").
    centerLabel: typed<"none" | "total" | "share">("none"),
    // The indicator slot grid: one pie per indicator, tiled inside each
    // sub-chart. Borrows panes' key names AND its gap values (15/15, ruled by
    // the owner 2026-08-05 — adjacent pies should breathe like adjacent
    // panes); the one departure is the header, which centres rather than
    // panes' left, because a slot's content is a centred disc, not a wide
    // rectangular region.
    indicators: {
      hideHeaders: false,
      headerAlignH: typed<"left" | "center" | "right">("center"),
      headerGap: 10,
      headerPosition: typed<"top" | "bottom">("top"),
      gapX: 15,
      gapY: 15,
      nCols: typed<number | "auto">("auto"),
    },
    labelCollision: defaultLabelCollision(),
    ...defaultLabelPlacement(),
    // Pie ships on nearest-point placement: a slice at 12 o'clock gets its
    // label directly above the disc, whatever bearing that turns out to be.
    outsideLabelPlacement: typed<"nearest" | "flank">("nearest"),
    // Partial pies (an explicit `total` the values do not reach) draw the
    // unfilled part as a slice by default — a bare gap is indistinguishable
    // from a rendering bug at small sizes.
    remainder: {
      mode: typed<"slice" | "gap">("slice"),
      fillColor: typed<ColorKeyOrString>({ key: "base200" }),
    },
  },
};

export type DefaultFigureStyle = typeof _DS;

export function getDefaultFigureStyle(): DefaultFigureStyle {
  return _DS;
}
