// AI input types - what AI provides to tools (before conversion to storage format)

import type { CoverSlide, SectionSlide, TextBlock } from "./slides.ts";

// AI Figure Input Option 1: Clone from existing visualization
export type AiFigureFromVisualization = {
  type: "from_visualization";
  visualizationId: string;
  replicant?: string;
};

// AI Figure Input Option 2: Custom chart from metric (matches get_metric_data)
export type AiFigureFromMetric = {
  type: "from_metric";
  metricId: string;
  disaggregations?: string[];
  filters?: Array<{ col: string; vals: string[] }>;
  periodFilter?: {
    periodOption: "period_id" | "quarter_id" | "year";
    min: number;
    max: number;
  };
  chartType?: "bar" | "line" | "table";
};

// AI Figure Input Option 3: Arbitrary data
export type AiFigureCustom = {
  type: "custom";
  customData: unknown[];
  chartType: "bar" | "line" | "table";
  description?: string;
};

// Union of all AI figure input types
export type AiFigureBlockInput =
  | AiFigureFromVisualization
  | AiFigureFromMetric
  | AiFigureCustom;

// Block types AI can provide (discriminated union)
export type AiContentBlockInput =
  | TextBlock  // { type: 'text', markdown }
  | AiFigureBlockInput;

// Content slide with blocks array (before optimization to LayoutNode)
export type AiContentSlideInput = {
  type: "content";
  heading: string;
  blocks: AiContentBlockInput[];
};

// AI slide input - union of types
export type AiSlideInput =
  | CoverSlide      // Same as storage
  | SectionSlide    // Same as storage
  | AiContentSlideInput;  // Blocks array (not layout)
