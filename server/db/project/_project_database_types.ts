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
  latest_ran_commit_sha: string | null;
};

export type DBMetric = {
  id: string;
  module_id: string;
  label: string;
  variant_label: string | null;
  value_func: string;
  format_as: string;
  value_props: string;
  period_options: string;
  required_disaggregation_options: string;
  value_label_replacements: string | null;
  post_aggregation_expression: string | null;
  auto_include_facility_columns: boolean;
  results_object_id: string;
  ai_description: string | null;
};

export type DBPresentationObject = {
  id: string;
  metric_id: string;
  is_default_visualization: boolean;
  label: string;
  config: string;
  last_updated: string;
  created_by_ai: boolean;
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

export type DBSlideDeck = {
  id: string;
  label: string;
  plan: string | null;
  last_updated: string;
};

export type DBSlide = {
  id: string;
  slide_deck_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
};

export type DBGlobalLastUpdated = {
  id: string;
  last_updated: string;
};
