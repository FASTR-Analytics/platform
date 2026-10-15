import {
  type AdminAreaColumn,
  type DisaggregationOption,
  type HfaFacilityColumnGroup,
  t3,
} from "lib";
import {
  getAdminAreaLabel,
  getDisplayDisaggregationLabel,
} from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";

export function facilityColumnLabel(
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
