import type { TranslatableAIString } from "./module_definitions.ts";

export type DimensionDefinition = {
  id: string;
  label: TranslatableAIString;
  description: TranslatableAIString;
  typicalUseCases: TranslatableAIString[];
};


export const DISAGGREGATION_DEFINITIONS: Record<string, DimensionDefinition> = {
  admin_area_1: {
    id: "admin_area_1",
    label: { en: "Country/National", fr: "Pays/National" },
    description: {
      en: "First-level administrative area (country or national level)",
      fr: "Zone administrative de premier niveau (pays ou niveau national)",
    },
    typicalUseCases: [
      { en: "National-level aggregates", fr: "Agrégats au niveau national" },
      {
        en: "Country-wide performance metrics",
        fr: "Indicateurs de performance à l'échelle nationale",
      },
    ],
  },
  admin_area_2: {
    id: "admin_area_2",
    label: { en: "Province/Region", fr: "Province/Région" },
    description: {
      en: "Second-level administrative division (state, province, region)",
      fr: "Division administrative de deuxième niveau (état, province, région)",
    },
    typicalUseCases: [
      {
        en: "Regional performance comparison",
        fr: "Comparaison des performances régionales",
      },
      {
        en: "Identify geographic disparities",
        fr: "Identifier les disparités géographiques",
      },
      {
        en: "Resource allocation decisions",
        fr: "Décisions d'allocation des ressources",
      },
    ],
  },
  admin_area_3: {
    id: "admin_area_3",
    label: { en: "District", fr: "District" },
    description: {
      en: "Third-level administrative division (district, county)",
      fr: "Division administrative de troisième niveau (district, comté)",
    },
    typicalUseCases: [
      { en: "Local-level monitoring", fr: "Suivi au niveau local" },
      {
        en: "District health team targets",
        fr: "Objectifs des équipes de santé de district",
      },
      {
        en: "Operational planning",
        fr: "Planification opérationnelle",
      },
    ],
  },
  admin_area_4: {
    id: "admin_area_4",
    label: { en: "Sub-district", fr: "Sous-district" },
    description: {
      en: "Fourth-level administrative division (sub-district, commune)",
      fr: "Division administrative de quatrième niveau (sous-district, commune)",
    },
    typicalUseCases: [
      {
        en: "Facility catchment analysis",
        fr: "Analyse des zones de desserte des établissements",
      },
      {
        en: "Community health planning",
        fr: "Planification de la santé communautaire",
      },
    ],
  },
  indicator_common_id: {
    id: "indicator_common_id",
    label: { en: "Indicator", fr: "Indicateur" },
    description: {
      en: "Health service indicator (ANC1, Penta3, OPD, etc.)",
      fr: "Indicateur de services de santé (CPN1, Penta3, consultations externes, etc.)",
    },
    typicalUseCases: [
      { en: "Service-specific analysis", fr: "Analyse par service" },
      {
        en: "Cross-indicator comparison",
        fr: "Comparaison entre indicateurs",
      },
      { en: "Program monitoring", fr: "Suivi des programmes" },
    ],
  },
  facility_type: {
    id: "facility_type",
    label: { en: "Facility type", fr: "Type d'établissement" },
    description: {
      en: "Classification of health facility (Hospital, Health Center, etc.)",
      fr: "Classification des établissements de santé (Hôpital, Centre de santé, etc.)",
    },
    typicalUseCases: [
      {
        en: "Compare performance by facility level",
        fr: "Comparer les performances par niveau d'établissement",
      },
      {
        en: "Service availability by facility type",
        fr: "Disponibilité des services par type d'établissement",
      },
    ],
  },
  facility_id: {
    id: "facility_id",
    label: { en: "Facility", fr: "Établissement" },
    description: {
      en: "Individual health facility identifier",
      fr: "Identifiant individuel de l'établissement de santé",
    },
    typicalUseCases: [
      {
        en: "Facility-level performance tracking",
        fr: "Suivi des performances au niveau de l'établissement",
      },
      {
        en: "Outlier identification",
        fr: "Identification des valeurs aberrantes",
      },
    ],
  },
  ratio_type: {
    id: "ratio_type",
    label: { en: "Consistency ratio", fr: "Ratio de cohérence" },
    description: {
      en: "Type of consistency check between related indicators (ANC1>ANC4, Delivery≈BCG, etc.)",
      fr: "Type de contrôle de cohérence entre indicateurs liés (CPN1>CPN4, Accouchement≈BCG, etc.)",
    },
    typicalUseCases: [
      {
        en: "Data quality assessment",
        fr: "Évaluation de la qualité des données",
      },
      {
        en: "Identify reporting inconsistencies",
        fr: "Identifier les incohérences de déclaration",
      },
    ],
  },
};

