import type { TranslatableString } from "../translate/types.ts";

export type DimensionDefinition = {
  id: string;
  label: TranslatableString;
  description: TranslatableString;
  typicalUseCases: TranslatableString[];
};


export const DISAGGREGATION_DEFINITIONS: Record<string, DimensionDefinition> = {
  admin_area_1: {
    id: "admin_area_1",
    label: { en: "Country/National", fr: "Pays/National", pt: "País/Nacional" },
    description: {
      en: "First-level administrative area (country or national level)",
      fr: "Zone administrative de premier niveau (pays ou niveau national)",
      pt: "Zona administrativa de primeiro nível (país ou nível nacional)",
    },
    typicalUseCases: [
      { en: "National-level aggregates", fr: "Agrégats au niveau national", pt: "Agregados a nível nacional" },
      {
        en: "Country-wide performance metrics",
        fr: "Indicateurs de performance à l'échelle nationale",
        pt: "Métricas de desempenho à escala nacional",
      },
    ],
  },
  admin_area_2: {
    id: "admin_area_2",
    label: { en: "Province/Region", fr: "Province/Région", pt: "Província/Região" },
    description: {
      en: "Second-level administrative division (state, province, region)",
      fr: "Division administrative de deuxième niveau (état, province, région)",
      pt: "Divisão administrativa de segundo nível (estado, província, região)",
    },
    typicalUseCases: [
      {
        en: "Regional performance comparison",
        fr: "Comparaison des performances régionales",
        pt: "Comparação do desempenho regional",
      },
      {
        en: "Identify geographic disparities",
        fr: "Identifier les disparités géographiques",
        pt: "Identificar disparidades geográficas",
      },
      {
        en: "Resource allocation decisions",
        fr: "Décisions d'allocation des ressources",
        pt: "Decisões de alocação de recursos",
      },
    ],
  },
  admin_area_3: {
    id: "admin_area_3",
    label: { en: "District", fr: "District", pt: "Distrito" },
    description: {
      en: "Third-level administrative division (district, county)",
      fr: "Division administrative de troisième niveau (district, comté)",
      pt: "Divisão administrativa de terceiro nível (distrito, condado)",
    },
    typicalUseCases: [
      { en: "Local-level monitoring", fr: "Suivi au niveau local", pt: "Monitorização a nível local" },
      {
        en: "District health team targets",
        fr: "Objectifs des équipes de santé de district",
        pt: "Metas das equipas de saúde distritais",
      },
      {
        en: "Operational planning",
        fr: "Planification opérationnelle",
        pt: "Planeamento operacional",
      },
    ],
  },
  admin_area_4: {
    id: "admin_area_4",
    label: { en: "Sub-district", fr: "Sous-district", pt: "Subdistrito" },
    description: {
      en: "Fourth-level administrative division (sub-district, commune)",
      fr: "Division administrative de quatrième niveau (sous-district, commune)",
      pt: "Divisão administrativa de quarto nível (subdistrito, comuna)",
    },
    typicalUseCases: [
      {
        en: "Facility catchment analysis",
        fr: "Analyse des zones de desserte des établissements",
        pt: "Análise das áreas de abrangência dos estabelecimentos",
      },
      {
        en: "Community health planning",
        fr: "Planification de la santé communautaire",
        pt: "Planeamento da saúde comunitária",
      },
    ],
  },
  indicator_common_id: {
    id: "indicator_common_id",
    label: { en: "Indicator", fr: "Indicateur", pt: "Indicador" },
    description: {
      en: "Health service indicator (ANC1, Penta3, OPD, etc.)",
      fr: "Indicateur de services de santé (CPN1, Penta3, consultations externes, etc.)",
      pt: "Indicador de serviços de saúde (CPN1, Penta3, consultas externas, etc.)",
    },
    typicalUseCases: [
      { en: "Service-specific analysis", fr: "Analyse par service", pt: "Análise por serviço" },
      {
        en: "Cross-indicator comparison",
        fr: "Comparaison entre indicateurs",
        pt: "Comparação entre indicadores",
      },
      { en: "Program monitoring", fr: "Suivi des programmes", pt: "Monitorização de programas" },
    ],
  },
  facility_type: {
    id: "facility_type",
    label: { en: "Facility type", fr: "Type d'établissement", pt: "Tipo de estabelecimento" },
    description: {
      en: "Classification of health facility (Hospital, Health Center, etc.)",
      fr: "Classification des établissements de santé (Hôpital, Centre de santé, etc.)",
      pt: "Classificação do estabelecimento de saúde (Hospital, Centro de saúde, etc.)",
    },
    typicalUseCases: [
      {
        en: "Compare performance by facility level",
        fr: "Comparer les performances par niveau d'établissement",
        pt: "Comparar o desempenho por nível de estabelecimento",
      },
      {
        en: "Service availability by facility type",
        fr: "Disponibilité des services par type d'établissement",
        pt: "Disponibilidade de serviços por tipo de estabelecimento",
      },
    ],
  },
  facility_id: {
    id: "facility_id",
    label: { en: "Facility", fr: "Établissement", pt: "Estabelecimento" },
    description: {
      en: "Individual health facility identifier",
      fr: "Identifiant individuel de l'établissement de santé",
      pt: "Identificador individual do estabelecimento de saúde",
    },
    typicalUseCases: [
      {
        en: "Facility-level performance tracking",
        fr: "Suivi des performances au niveau de l'établissement",
        pt: "Acompanhamento do desempenho ao nível do estabelecimento",
      },
      {
        en: "Outlier identification",
        fr: "Identification des valeurs aberrantes",
        pt: "Identificação de valores aberrantes",
      },
    ],
  },
  ratio_type: {
    id: "ratio_type",
    label: { en: "Consistency ratio", fr: "Ratio de cohérence", pt: "Rácio de coerência" },
    description: {
      en: "Type of consistency check between related indicators (ANC1>ANC4, Delivery≈BCG, etc.)",
      fr: "Type de contrôle de cohérence entre indicateurs liés (CPN1>CPN4, Accouchement≈BCG, etc.)",
      pt: "Tipo de verificação de coerência entre indicadores relacionados (CPN1>CPN4, Parto≈BCG, etc.)",
    },
    typicalUseCases: [
      {
        en: "Data quality assessment",
        fr: "Évaluation de la qualité des données",
        pt: "Avaliação da qualidade dos dados",
      },
      {
        en: "Identify reporting inconsistencies",
        fr: "Identifier les incohérences de déclaration",
        pt: "Identificar incoerências de notificação",
      },
    ],
  },
};

