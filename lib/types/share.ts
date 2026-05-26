import type { FigureInputs } from "@timroberton/panther";
import type { IndicatorMetadata, PresentationObjectConfig } from "./mod.ts";

export type ShareVizBundle = {
  label: string;
  strippedFigureInputs: FigureInputs;
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
    indicatorMetadata?: IndicatorMetadata[];
  };
  geoData?: unknown;
};

export type ShareTokenInfo = {
  token: string;
  createdAt: string;
  viewCount: number;
};
