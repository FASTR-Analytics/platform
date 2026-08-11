import { CustomFigureStyleOptions, TableCellInfo } from "panther";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  type DeckStyleContext,
  type EffectiveFormat,
  type IndicatorMetadata,
  PresentationObjectConfig,
} from "lib";
import {
  formatIndicatorValue,
  getCfCellTextColorStrategy,
  getIndicatorIdsForCell,
  getTableLayoutStyle,
  getTextStyle,
  getThresholdMetaForCell,
  scaleValueForFormat,
} from "./_0_common";

// A scorecard mixes percent, count and rate indicators by design, so every
// cell formats as its own indicator — which is exactly what the shared
// `EffectiveFormat.formatForValue` does, and the reason the scorecard no
// longer carries a second implementation of it. Threshold colouring stays on
// its own metadata lookup: a threshold is not a format, and only the entry
// that declares a direction carries the cutoffs to compare against.
// See SYSTEM_10 "Effective format".

// Deliberately NOT panther's thresholdColorFunc: these boundaries are
// inclusive toward green in BOTH directions (>= green / <= green), while
// thresholdColorFunc is strict-< upward — unifying would flip exact-boundary
// lower_is_better values (e.g. exactly 90.0) from green to yellow.
function getScorecardCutoffColor(
  direction: "higher_is_better" | "lower_is_better",
  green: number,
  yellow: number,
  scaledValue: number,
): string {
  if (direction === "higher_is_better") {
    if (scaledValue >= green) return _CF_LIGHTER_GREEN;
    if (scaledValue >= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  } else {
    if (scaledValue <= green) return _CF_LIGHTER_GREEN;
    if (scaledValue <= yellow) return _CF_LIGHTER_YELLOW;
    return _CF_LIGHTER_RED;
  }
}

export function buildScorecardStyle(
  config: PresentationObjectConfig,
  effectiveFormat: EffectiveFormat,
  indicatorMetadata: IndicatorMetadata[],
  effectiveValueProps: string[],
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const metadataById = new Map(indicatorMetadata.map((m) => [m.id, m]));

  return {
    text: getTextStyle(config, deckStyle),
    surrounds: { legendPosition: config.s.hideLegend ? "none" : undefined },
    grid: { showGrid: false },
    content: {
      tableCells: {
        func: (info: TableCellInfo) => {
          const meta = getThresholdMetaForCell(
            metadataById,
            effectiveValueProps,
            info,
          );
          if (meta?.threshold_direction && info.valueAsNumber !== undefined) {
            const scaled = scaleValueForFormat(
              info.valueAsNumber,
              meta.format_as ?? "number",
            );
            return {
              backgroundColor: getScorecardCutoffColor(
                meta.threshold_direction,
                meta.threshold_green ?? 0,
                meta.threshold_yellow ?? 0,
                scaled,
              ),
              textColorStrategy: getCfCellTextColorStrategy(deckStyle),
            };
          }
          return { backgroundColor: "none" };
        },
        // declaredFormatForValue, not formatForValue: when nothing along the
        // cell's id chain declares a format the scorecard prints the RAW value.
        // Falling through to axisFormat would render a 0.42 coverage as "0" at
        // the default 0 decimals — and a scorecard whose package carries no
        // calculated_indicators_snapshot.json has a label-only catalog entry
        // for every row, so that is the whole table, not an edge case.
        textFormatter: (info: TableCellInfo) => {
          const formatAs = effectiveFormat.declaredFormatForValue(
            getIndicatorIdsForCell(effectiveValueProps, info),
          );
          if (formatAs === undefined) return String(info.value);
          return formatIndicatorValue(
            info.value,
            formatAs,
            config.s.decimalPlaces ?? 0,
          );
        },
      },
    },
    // Scorecard colouring IS conditional formatting (per-indicator thresholds
    // instead of user CF), so it always gets the CF table look.
    table: getTableLayoutStyle(config, deckStyle, true),
  };
}
