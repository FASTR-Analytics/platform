import type {
  DisaggregationOption,
  InstanceConfigAdminAreaLabels,
  InstanceConfigFacilityColumns,
  PresentationOption,
} from "./types/mod.ts";
import type { TranslatableString } from "./translate/mod.ts";

export type DisaggregationLabelConfig = {
  adminAreaLabels?: InstanceConfigAdminAreaLabels;
  facilityColumns?: InstanceConfigFacilityColumns;
};

export function getDisaggregationLabel(
  disOpt: DisaggregationOption,
  config: DisaggregationLabelConfig,
): TranslatableString {
  if (
    disOpt === "admin_area_2" ||
    disOpt === "admin_area_3" ||
    disOpt === "admin_area_4"
  ) {
    const level = Number(disOpt.slice(-1)) as 2 | 3 | 4;
    const custom = config.adminAreaLabels?.[`label${level}`];
    if (custom) return { en: custom, fr: custom };
    return { en: `Admin area ${level}`, fr: `Unité administrative ${level}` };
  }

  if (disOpt === "facility_type") {
    const custom = config.facilityColumns?.labelTypes;
    if (custom) return { en: custom, fr: custom };
    return { en: "Facility type", fr: "Type d'établissement" };
  }
  if (disOpt === "facility_ownership") {
    const custom = config.facilityColumns?.labelOwnership;
    if (custom) return { en: custom, fr: custom };
    return { en: "Facility ownership", fr: "Propriété de l'établissement" };
  }
  if (
    disOpt === "facility_custom_1" ||
    disOpt === "facility_custom_2" ||
    disOpt === "facility_custom_3" ||
    disOpt === "facility_custom_4" ||
    disOpt === "facility_custom_5"
  ) {
    const n = Number(disOpt.slice(-1)) as 1 | 2 | 3 | 4 | 5;
    const custom = config.facilityColumns?.[`labelCustom${n}`];
    if (custom) return { en: custom, fr: custom };
    return { en: `Facility custom ${n}`, fr: `Champ personnalisé ${n}` };
  }

  switch (disOpt) {
    case "period_id":
      return { en: "Year/Month", fr: "Année/Mois" };
    case "quarter_id":
      return { en: "Year/Quarter", fr: "Année/Trimestre" };
    case "year":
      return { en: "Year", fr: "Année" };
    case "month":
      return { en: "Month", fr: "Mois" };
    case "indicator_common_id":
      return { en: "Indicator", fr: "Indicateur" };
    case "denominator":
      return { en: "Denominator", fr: "Dénominateur" };
    case "denominator_best_or_survey":
      return {
        en: "Denominator (best or survey)",
        fr: "Dénominateur (meilleur ou enquête)",
      };
    case "source_indicator":
      return { en: "Source indicator", fr: "Indicateur source" };
    case "target_population":
      return { en: "Target population", fr: "Population cible" };
    case "ratio_type":
      return { en: "Ratio type", fr: "Type de ratio" };
    case "hfa_indicator":
      return { en: "HFA indicator", fr: "Indicateur HFA" };
    case "hfa_category":
      return { en: "HFA category", fr: "Catégorie HFA" };
    case "hfa_sub_category":
      return { en: "HFA sub-category", fr: "Sous-catégorie HFA" };
    case "hfa_service_category":
      return { en: "Service category", fr: "Catégorie de service" };
    case "time_point":
      return { en: "Time point", fr: "Point temporel" };
    case "iceh_indicator":
      return { en: "ICEH indicator", fr: "Indicateur ICEH" };
    case "strat":
      return { en: "Stratifier", fr: "Stratificateur" };
    case "level":
      return { en: "Level", fr: "Niveau" };
    default:
      return { en: String(disOpt), fr: String(disOpt) };
  }
}

const TIME_BASED: PresentationOption[] = ["table", "chart"];

export function getDisaggregationAllowedPresentationOptions(
  disOpt: DisaggregationOption,
): PresentationOption[] | undefined {
  switch (disOpt) {
    case "period_id":
    case "quarter_id":
    case "year":
    case "month":
    case "time_point":
      return TIME_BASED;
    default:
      return undefined;
  }
}
