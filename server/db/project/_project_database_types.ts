export type DBDataset_IN_PROJECT = {
  dataset_type: string;
  info: string;
  //
  last_updated: string;
};

export type DBIndicator_IN_PROJECT = {
  indicator_common_id: string;
  indicator_common_label: string;
};

export type DBModule = {
  id: string;
  module_definition: string; // Make results objects its own table
  date_installed: string;
  config_type: "none" | "parameters" | "hfa";
  config_selections: string;
  //
  last_updated: string;
  last_run: string;
  dirty: string;
};

export type DBPresentationObject = {
  id: string;
  module_id: string;
  results_object_id: string;
  results_value: string;
  //
  label: string;
  config: string;
  is_default_visualization: boolean;
  //
  last_updated: string;
};

export type DBReport = {
  id: string;
  report_type: string;
  config: string;
  //
  last_updated: string;
  //
  is_deleted: boolean;
};

export type DBReportItem = {
  id: string;
  report_id: string;
  sort_order: number;
  config: string;
  //
  last_updated: string;
};

export type DBGlobalLastUpdated = {
  id: string;
  last_updated: string;
};
