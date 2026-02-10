export type UserPermissions = {
  can_configure_users: boolean;
  can_view_users: boolean;
  can_view_logs: boolean;
  can_configure_settings: boolean;
  can_configure_assets: boolean;
  can_configure_data: boolean;
  can_view_data: boolean;
  can_create_projects: boolean;
};

export type UserPermission = keyof UserPermissions;

export type ProjectUserPermissions = {
  can_configure_settings: boolean;
  can_create_backups: boolean;
  can_restore_backups: boolean;
  can_configure_modules: boolean;
  can_run_modules: boolean;
  can_configure_users: boolean;
  can_configure_visualizations: boolean;
  can_view_visualizations: boolean;
  can_configure_reports: boolean;
  can_view_reports: boolean;
  can_configure_slide_decks: boolean;
  can_view_slide_decks: boolean;
  can_configure_data: boolean;
  can_view_data: boolean;
  can_view_logs: boolean;
};

export type ProjectPermission = keyof ProjectUserPermissions;

export const PROJECT_PERMISSIONS = [
  "can_configure_settings",
  "can_create_backups",
  "can_restore_backups",
  "can_configure_modules",
  "can_run_modules",
  "can_configure_users",
  "can_configure_visualizations",
  "can_view_visualizations",
  "can_configure_reports",
  "can_view_reports",
  "can_configure_slide_decks",
  "can_view_slide_decks",
  "can_configure_data",
  "can_view_data",
  "can_view_logs",
] satisfies readonly ProjectPermission[];

export const _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS = {
  can_configure_settings: false,
  can_create_backups: false,
  can_restore_backups: false,
  can_configure_modules: false,
  can_run_modules: false,
  can_configure_users: false,
  can_configure_visualizations: false,
  can_view_visualizations: false,
  can_configure_reports: false,
  can_view_reports: false,
  can_configure_slide_decks: false,
  can_view_slide_decks: false,
  can_configure_data: false,
  can_view_data: false,
  can_view_logs: false,
};

export const _PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS = {
  can_configure_settings: true,
  can_create_backups: true,
  can_restore_backups: true,
  can_configure_modules: true,
  can_run_modules: true,
  can_configure_users: true,
  can_configure_visualizations: true,
  can_view_visualizations: true,
  can_configure_reports: true,
  can_view_reports: true,
  can_configure_slide_decks: true,
  can_view_slide_decks: true,
  can_configure_data: true,
  can_view_data: true,
  can_view_logs: true,
};

export const PERMISSION_PRESETS: {
  label: string;
  permissions: Record<ProjectPermission, boolean>;
}[] = [
  {
    label: "No access",
    permissions: _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  },
  {
    label: "Viewer",
    permissions: {
      can_configure_settings: false,
      can_create_backups: false,
      can_restore_backups: false,
      can_configure_modules: false,
      can_run_modules: false,
      can_configure_users: false,
      can_configure_visualizations: false,
      can_view_visualizations: true,
      can_configure_reports: false,
      can_view_reports: true,
      can_configure_slide_decks: false,
      can_view_slide_decks: true,
      can_configure_data: false,
      can_view_data: true,
      can_view_logs: false,
    },
  },
  {
    label: "Editor",
    permissions: {
      can_configure_settings: false,
      can_create_backups: false,
      can_restore_backups: false,
      can_configure_modules: false,
      can_run_modules: false,
      can_configure_users: false,
      can_configure_visualizations: true,
      can_view_visualizations: true,
      can_configure_reports: true,
      can_view_reports: true,
      can_configure_slide_decks: true,
      can_view_slide_decks: true,
      can_configure_data: false,
      can_view_data: true,
      can_view_logs: false,
    },
  },
  {
    label: "Admin",
    permissions: _PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  },
];
