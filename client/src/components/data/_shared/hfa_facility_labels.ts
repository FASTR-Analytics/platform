import {
  type AdminAreaColumn,
  type DisaggregationOption,
  type HfaFacilityColumnGroup,
  type HfaFacilitySource,
  t3,
} from "lib";
import {
  getAdminAreaLabel,
  getDisplayDisaggregationLabel,
} from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";

export function hfaFacilityColumnLabel(
  column: HfaFacilityColumnGroup | AdminAreaColumn,
): string {
  if (column === "admin") {
    return t3({
      en: "Admin areas",
      fr: "Unités administratives",
      pt: "Zonas administrativas",
    });
  }
  if (column === "facility_name") {
    return instanceState.structureSchemaHfa?.labelNames ||
      t3({
        en: "Facility name",
        fr: "Nom de l'établissement",
        pt: "Nome do estabelecimento",
      });
  }
  if (column === "admin_area_1") {
    return t3(getAdminAreaLabel(1));
  }
  return t3(
    getDisplayDisaggregationLabel(column satisfies DisaggregationOption, "hfa"),
  );
}

// Who set a registry value, for the changes step and the facilities page.
export function hfaFacilitySourceLabel(
  source: HfaFacilitySource | undefined,
): string {
  if (!source) {
    return t3({
      en: "Unknown origin",
      fr: "Origine inconnue",
      pt: "Origem desconhecida",
    });
  }
  if (source.kind === "user") {
    return t3({
      en: "Set by a user",
      fr: "Défini par un utilisateur",
      pt: "Definido por um utilizador",
    });
  }
  const timePoint = source.timePoint;
  return timePoint === null
    ? t3({
      en: "From a deleted time point",
      fr: "D'un point temporel supprimé",
      pt: "De um ponto temporal eliminado",
    })
    : t3({
      en: `From time point ${timePoint}`,
      fr: `Du point temporel ${timePoint}`,
      pt: `Do ponto temporal ${timePoint}`,
    });
}
