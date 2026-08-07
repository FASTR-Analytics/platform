import { CustomFigureStyleOptions, TableCellInfo } from "panther";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  type DeckStyleContext,
  type IndicatorMetadata,
  PresentationObjectConfig,
} from "lib";
import {
  formatIndicatorValue,
  getTextStyle,
  getTableLayoutStyle,
  getIndicatorMetaForCell,
} from "./_0_common";

// The scorecard deliberately does NOT take an effective format. It is the one
// surface that formats PER ROW — a scorecard mixes percent, count and rate
// indicators by design, and collapsing them to a single figure-wide format is
// exactly what would break it. See SYSTEM_10 "Effective format".

function scaleValueForFormat(rawValue: number, formatAs: string): number {
  if (formatAs === "percent") return rawValue * 100;
  if (formatAs === "rate_per_10k") return rawValue * 10000;
  return rawValue;
}

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
      // tableRowHeaders: {
      //   func: (info) => {
      //     return {
      //       backgroundColor:  "black",
      //       textColorStrategy: "#ffffff",
      //     };
      //   },
      // },
      tableCells: {
        func: (info: TableCellInfo) => {
          const meta = getIndicatorMetaForCell(metadataById, effectiveValueProps, info);
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
              textColorStrategy: {
                ifLight: { key: "baseContent" as const },
                ifDark: { key: "base100" as const },
              },
            };
          }
          return { backgroundColor: "none" };
        },
        textFormatter: (info: TableCellInfo) => {
          const meta = getIndicatorMetaForCell(metadataById, effectiveValueProps, info);
          if (meta?.format_as && info.valueAsNumber !== undefined) {
            return formatIndicatorValue(
              info.valueAsNumber,
              meta.format_as,
              config.s.decimalPlaces ?? 0,
            );
          }
          return String(info.value);
        },
      },
    },
    table: getTableLayoutStyle(config, deckStyle),
  };
}
