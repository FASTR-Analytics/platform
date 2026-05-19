import type { FigureInputs } from "@timroberton/panther";
import type { IndicatorMetadata, PresentationObjectConfig } from "./mod.ts";

export type ShareVizBundle = {
  label: string;
  strippedFigureInputs: FigureInputs;
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
  };
  geoData?: unknown;
  indicatorMetadata?: IndicatorMetadata[];
};

export type ShareTokenInfo = {
  token: string;
  slug: string | null;
  createdAt: string;
  viewCount: number;
};
