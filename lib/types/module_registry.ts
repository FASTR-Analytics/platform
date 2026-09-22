// Generation-plane only: which modules the wizard offers and where their
// definitions live. The label is the only name a generating or failed run
// has (neither holds a manifest); everything else about a module, including
// its family, tier and sort order, travels with the definition.
export const MODULE_REGISTRY = [
  {
    id: "m001",
    label: {
      en: "Data quality assessment",
      fr: "Évaluation de la qualité des données",
      pt: "Avaliação da qualidade dos dados",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m001" },
  },
  {
    id: "m002",
    label: {
      en: "Data quality adjustments",
      fr: "Ajustements de la qualité des données",
      pt: "Ajustes da qualidade dos dados",
    },
    prerequisites: ["m001"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m002" },
  },
  {
    id: "m005",
    label: {
      en: "Coverage denominators",
      fr: "Dénominateurs de couverture",
      pt: "Denominadores de cobertura",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m005" },
  },
  {
    id: "m006",
    label: {
      en: "Coverage estimates",
      fr: "Estimations de couverture",
      pt: "Estimativas de cobertura",
    },
    prerequisites: ["m005"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m006" },
  },
  {
    id: "m009",
    label: {
      en: "ICEH survey analysis",
      fr: "Analyse de l'enquête ICEH",
      pt: "Análise do inquérito ICEH",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m009" },
  },
  {
    id: "m010",
    label: {
      en: "Health facility assessment",
      fr: "Évaluation des établissements de santé",
      pt: "Avaliação de unidades sanitárias",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m010" },
  },
  {
    id: "m011",
    label: {
      en: "Disruption detection",
      fr: "Détection des perturbations",
      pt: "Detecção de perturbações",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m011" },
  },
  {
    id: "m012",
    label: {
      en: "Indicator values",
      fr: "Valeurs des indicateurs",
      pt: "Valores dos indicadores",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m012" },
  },
] as const;

export type ModuleId = (typeof MODULE_REGISTRY)[number]["id"];

export type ModuleRegistryEntry = {
  id: ModuleId;
  label: { en: string; fr: string };
  prerequisites: readonly ModuleId[];
  github: { owner: string; repo: string; path: string };
};

export function getValidatedModuleId(id: string): ModuleId {
  const entry = MODULE_REGISTRY.find((m) => m.id === id);
  if (!entry) throw new Error(`Unknown module id: ${id}`);
  return entry.id;
}
