import type { TranslatableString } from "../translate/types.ts";
import type { ProjectPermission, UserPermission } from "./permissions.ts";
import { PROJECT_PERMISSIONS } from "./permissions.ts";

export const PROJECT_PERMISSION_LABELS: Record<ProjectPermission, TranslatableString> = {
  can_configure_settings: { en: "Configure settings", fr: "Configurer les paramètres" },
  can_create_backups: { en: "Create backups", fr: "Créer des sauvegardes" },
  can_restore_backups: { en: "Restore backups", fr: "Restaurer des sauvegardes" },
  can_configure_modules: { en: "Configure modules", fr: "Configurer les modules" },
  can_run_modules: { en: "Run modules", fr: "Exécuter les modules" },
  can_configure_users: { en: "Configure users", fr: "Configurer les utilisateurs" },
  can_configure_visualizations: { en: "Configure visualizations", fr: "Configurer les visualisations" },
  can_view_visualizations: { en: "View visualizations", fr: "Voir les visualisations" },
  can_configure_reports: { en: "Configure reports", fr: "Configurer les rapports" },
  can_view_reports: { en: "View reports", fr: "Voir les rapports" },
  can_configure_slide_decks: { en: "Configure slide decks", fr: "Configurer les présentations" },
  can_view_slide_decks: { en: "View slide decks", fr: "Voir les présentations" },
  can_configure_data: { en: "Configure data", fr: "Configurer les données" },
  can_view_data: { en: "View data", fr: "Voir les données" },
  can_view_metrics: { en: "View metrics", fr: "Voir les métriques" },
  can_view_logs: { en: "View logs", fr: "Voir les journaux" },
  can_view_script_code: { en: "View script code", fr: "Voir le code des scripts" },
};

export const INSTANCE_PERMISSION_LABELS: Record<UserPermission, TranslatableString> = {
  can_configure_users: { en: "Configure users", fr: "Configurer les utilisateurs" },
  can_view_users: { en: "View users", fr: "Voir les utilisateurs" },
  can_view_logs: { en: "View logs", fr: "Voir les journaux" },
  can_configure_settings: { en: "Configure settings", fr: "Configurer les paramètres" },
  can_configure_assets: { en: "Configure assets", fr: "Configurer les ressources" },
  can_configure_data: { en: "Configure data", fr: "Configurer les données" },
  can_view_data: { en: "View data", fr: "Voir les données" },
  can_create_projects: { en: "Create projects", fr: "Créer des projets" },
};

export type ProjectPermissionCategory = {
  label: TranslatableString;
  permissions: ProjectPermission[];
};

export const PROJECT_PERMISSION_CATEGORIES: ProjectPermissionCategory[] = [
  {
    label: { en: "Analytical Products", fr: "Produits analytiques" },
    permissions: [
      "can_view_visualizations",
      "can_configure_visualizations",
      "can_view_reports",
      "can_configure_reports",
      "can_view_slide_decks",
      "can_configure_slide_decks",
    ],
  },
  {
    label: { en: "Data & Modules", fr: "Données et modules" },
    permissions: [
      "can_view_data",
      "can_configure_data",
      "can_view_metrics",
      "can_view_script_code",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: { en: "Project Administration", fr: "Administration du projet" },
    permissions: [
      "can_configure_settings",
      "can_configure_users",
      "can_view_logs",
      "can_create_backups",
      "can_restore_backups",
    ],
  },
];

const _allCategorizedPermissions = PROJECT_PERMISSION_CATEGORIES.flatMap((c) => c.permissions);
const _missingFromCategories = PROJECT_PERMISSIONS.filter(
  (p) => !_allCategorizedPermissions.includes(p),
);
if (_missingFromCategories.length > 0) {
  console.warn(
    `Permissions missing from UI categories: ${_missingFromCategories.join(", ")}`,
  );
}
