export type DBPresentationObject = {
  id: string;
  metric_id: string;
  is_default_visualization: boolean;
  label: string;
  config: string;
  last_updated: string;
  created_by_ai: boolean;
  folder_id: string | null;
  sort_order: number;
};

export type DBVisualizationFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sort_order: number;
  last_updated: string;
};

export type DBSlideDeckFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sort_order: number;
  last_updated: string;
};

export type DBSlideDeck = {
  id: string;
  label: string;
  plan: string | null;
  config: string | null;
  folder_id: string | null;
  last_updated: string;
};

export type DBSlide = {
  id: string;
  slide_deck_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
};

export type DBReportFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sort_order: number;
  last_updated: string;
};

export type DBReportVersion = {
  id: string;
  report_id: string;
  created_at: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  body_authors: string | null;
};

export type DBDeckVersion = {
  id: string;
  deck_id: string;
  created_at: string;
  label: string;
  deck_config: string;
  slides: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  slide_editors: string | null;
};

export type DBReport = {
  id: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  config: string | null;
  body_authors: string | null;
  folder_id: string | null;
  last_updated: string;
};

export type DBDashboard = {
  id: string;
  title: string;
  is_public: boolean;
  layout: string;
  config: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  last_updated: string;
};

export type DBDashboardItem = {
  id: string;
  dashboard_id: string;
  label: string;
  sort_order: number;
  figure_block: string;
  geo_data: string | null;
  last_updated: string;
  replicant_group_id: string | null;
  replicant_value: string | null;
};

export type DBDashboardItemGroup = {
  id: string;
  dashboard_id: string;
  label: string;
  replicate_by: string;
  default_replicant_value: string | null;
  replicants: string;
  geo_data: string | null;
  last_updated: string;
};
