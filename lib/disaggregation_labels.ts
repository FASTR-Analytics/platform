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
    if (custom) return { en: custom, fr: custom, pt: custom };
    return {
      en: `Admin area ${level}`,
      fr: `Unité administrative ${level}`,
      pt: `Zona administrativa ${level}`,
    };
  }

  if (disOpt === "facility_type") {
    const custom = config.facilityColumns?.labelTypes;
    if (custom) return { en: custom, fr: custom, pt: custom };
    return {
      en: "Facility type",
      fr: "Type d'établissement",
      pt: "Tipo de estabelecimento",
    };
  }
  if (disOpt === "facility_ownership") {
    const custom = config.facilityColumns?.labelOwnership;
    if (custom) return { en: custom, fr: custom, pt: custom };
    return {
      en: "Facility ownership",
      fr: "Propriété de l'établissement",
      pt: "Propriedade do estabelecimento",
    };
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
    if (custom) return { en: custom, fr: custom, pt: custom };
    return {
      en: `Facility custom ${n}`,
      fr: `Champ personnalisé ${n}`,
      pt: `Campo personalizado ${n}`,
    };
  }

  switch (disOpt) {
    case "period_id":
      return { en: "Year/Month", fr: "Année/Mois", pt: "Ano/Mês" };
    case "quarter_id":
      return { en: "Year/Quarter", fr: "Année/Trimestre", pt: "Ano/Trimestre" };
    case "year":
      return { en: "Year", fr: "Année", pt: "Ano" };
    case "month":
      return { en: "Month", fr: "Mois", pt: "Mês" };
    case "indicator_common_id":
      return { en: "Indicator", fr: "Indicateur", pt: "Indicador" };
    case "denominator":
      return { en: "Denominator", fr: "Dénominateur", pt: "Denominador" };
    case "denominator_best_or_survey":
      return {
        en: "Denominator (best or survey)",
        fr: "Dénominateur (meilleur ou enquête)",
        pt: "Denominador (melhor ou inquérito)",
      };
    case "source_indicator":
      return {
        en: "Source indicator",
        fr: "Indicateur source",
        pt: "Indicador de origem",
      };
    case "target_population":
      return {
        en: "Target population",
        fr: "Population cible",
        pt: "População-alvo",
      };
    case "ratio_type":
      return { en: "Ratio type", fr: "Type de ratio", pt: "Tipo de rácio" };
    case "hfa_indicator":
      return { en: "HFA indicator", fr: "Indicateur HFA", pt: "Indicador HFA" };
    case "hfa_variant_item":
      return {
        en: "Variant item",
        fr: "Élément de variante",
        pt: "Item de variante",
      };
    case "hfa_category":
      return { en: "HFA category", fr: "Catégorie HFA", pt: "Categoria HFA" };
    case "hfa_sub_category":
      return {
        en: "HFA sub-category",
        fr: "Sous-catégorie HFA",
        pt: "Subcategoria HFA",
      };
    case "hfa_service_category":
      return {
        en: "Service category",
        fr: "Catégorie de service",
        pt: "Categoria de serviço",
      };
    case "time_point":
      return { en: "Time point", fr: "Point temporel", pt: "Ponto temporal" };
    case "iceh_indicator":
      return {
        en: "ICEH indicator",
        fr: "Indicateur ICEH",
        pt: "Indicador ICEH",
      };
    case "strat":
      return { en: "Stratifier", fr: "Stratificateur", pt: "Estratificador" };
    case "level":
      return { en: "Level", fr: "Niveau", pt: "Nível" };
    default:
      return { en: String(disOpt), fr: String(disOpt), pt: String(disOpt) };
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
      return TIME_BASED;
    // Unlike the period columns (where maps and pies deliberately aggregate
    // over the period selection), survey rounds are few and discrete and their
    // PAE percentages must never be pooled: on a map or pie, time_point takes
    // a display slot like any other dimension (one map/pie per round on the
    // grid).
    case "time_point":
      return [...TIME_BASED, "map", "pie"];
    default:
      return undefined;
  }
}
