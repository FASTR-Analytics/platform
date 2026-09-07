export const MODULE_REGISTRY = [
  {
    id: "m001",
    label: {
      en: "M1. Data quality assessment",
      fr: "M1. Évaluation de la qualité des données",
      pt: "M1. Avaliação da qualidade dos dados",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m001" },
  },
  {
    id: "m002",
    label: {
      en: "M2. Data quality adjustments",
      fr: "M2. Ajustements de la qualité des données",
      pt: "M2. Ajustes da qualidade dos dados",
    },
    prerequisites: ["m001"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m002" },
  },
  {
    id: "m003",
    label: {
      en: "M3. Service utilization",
      fr: "M3. Utilisation des services",
      pt: "M3. Utilização dos serviços",
    },
    prerequisites: ["m001", "m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m003" },
  },
  {
    id: "m004",
    label: {
      en: "M4. Coverage estimates",
      fr: "M4. Estimations de couverture",
      pt: "M4. Estimativas de cobertura",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m004" },
  },
  {
    id: "m005",
    label: {
      en: "M5. Coverage estimates ~ new, part 1",
      fr: "M5. Estimations de couverture ~ nouveau, partie 1",
      pt: "M5. Estimativas de cobertura ~ novo, parte 1",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m005" },
  },
  {
    id: "m006",
    label: {
      en: "M6. Coverage estimates ~ new, part 2",
      fr: "M6. Estimations de couverture ~ nouveau, partie 2",
      pt: "M6. Estimativas de cobertura ~ novo, parte 2",
    },
    prerequisites: ["m005"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m006" },
  },
  {
    id: "m009",
    label: {
      en: "M9. ICEH Survey Data Analysis",
      fr: "M9. Analyse des données d'enquête ICEH",
      pt: "M9. Análise de dados de inquérito ICEH",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m009" },
  },
  {
    id: "m010",
    label: {
      en: "M10. Health facility assessment",
      fr: "M10. Évaluation des établissements de santé",
      pt: "M10. Avaliação dos estabelecimentos de saúde",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m010" },
  },
  {
    id: "m011",
    label: {
      en: "M11. Bayesian disruption detection (LI model)",
      fr: "M11. Détection bayésienne des perturbations (modèle LI)",
      pt: "M11. Deteção bayesiana de perturbações (modelo LI)",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m011" },
  },
  {
    id: "m012",
    label: {
      en: "M12. Indicator values",
      fr: "M12. Valeurs des indicateurs",
      pt: "M12. Valores dos indicadores",
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
