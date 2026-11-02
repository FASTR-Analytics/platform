import type { TranslatableString } from "../translate/types.ts";
import type { UserPermission } from "./_flags.ts";

export const INSTANCE_PERMISSION_LABELS: Record<
  UserPermission,
  TranslatableString
> = {
  can_configure_users: {
    en: "Configure users",
    fr: "Configurer les utilisateurs",
    pt: "Configurar os utilizadores",
  },
  can_view_users: {
    en: "View users",
    fr: "Voir les utilisateurs",
    pt: "Ver os utilizadores",
  },
  can_configure_data: {
    en: "Configure data",
    fr: "Configurer les données",
    pt: "Configurar os dados",
  },
  can_view_data: {
    en: "View data",
    fr: "Voir les données",
    pt: "Ver os dados",
  },
};
