import type { TranslatableString } from "../translate/types.ts";
import type { UserPermission } from "./permissions.ts";

export const INSTANCE_PERMISSION_LABELS: Record<UserPermission, TranslatableString> = {
  can_configure_users: { en: "Configure users", fr: "Configurer les utilisateurs", pt: "Configurar os utilizadores" },
  can_view_users: { en: "View users", fr: "Voir les utilisateurs", pt: "Ver os utilizadores" },
  can_view_logs: { en: "View logs", fr: "Voir les journaux", pt: "Ver os registos" },
  can_configure_settings: { en: "Configure settings", fr: "Configurer les paramètres", pt: "Configurar as definições" },
  can_configure_data: { en: "Configure data", fr: "Configurer les données", pt: "Configurar os dados" },
  can_view_data: { en: "View data", fr: "Voir les données", pt: "Ver os dados" },
};
