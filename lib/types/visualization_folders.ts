export type VisualizationFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

export type VisualizationGroupingMode =
  | "folders"
  | "module"
  | "metric"
  | "type"
  | "flat";
