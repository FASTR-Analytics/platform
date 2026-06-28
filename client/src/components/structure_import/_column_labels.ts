import { t3, type InstanceConfigFacilityColumns } from "lib";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";

// Human label for a structure-import column key (facility_id, admin_area_N, or an
// optional metadata column), honouring the instance's configured custom labels.
// Shared by the step-2 mapping screen and the step-4 confirmation.
export function getStructureColumnLabel(
  column: string,
  fc: InstanceConfigFacilityColumns
): string {
  switch (column) {
    case "facility_id":
      return t3({
        en: "Facility ID",
        fr: "Identifiant d'établissement",
        pt: "Identificador do estabelecimento",
      });
    case "admin_area_1":
    case "admin_area_2":
    case "admin_area_3":
    case "admin_area_4":
      return t3(getAdminAreaLabel(Number(column.slice(-1)) as 1 | 2 | 3 | 4));
    case "facility_name":
      return (
        fc.labelNames ||
        t3({
          en: "Facility Name",
          fr: "Nom de l'établissement",
          pt: "Nome do estabelecimento de saúde",
        })
      );
    case "facility_type":
      return (
        fc.labelTypes ||
        t3({
          en: "Facility Type",
          fr: "Type d'établissement",
          pt: "Tipo de estabelecimento de saúde",
        })
      );
    case "facility_ownership":
      return (
        fc.labelOwnership ||
        t3({
          en: "Facility Ownership",
          fr: "Propriété de l'établissement",
          pt: "Propriedade do estabelecimento de saúde",
        })
      );
    case "facility_custom_1":
      return fc.labelCustom1 || "Custom 1";
    case "facility_custom_2":
      return fc.labelCustom2 || "Custom 2";
    case "facility_custom_3":
      return fc.labelCustom3 || "Custom 3";
    case "facility_custom_4":
      return fc.labelCustom4 || "Custom 4";
    case "facility_custom_5":
      return fc.labelCustom5 || "Custom 5";
    default:
      return column;
  }
}
