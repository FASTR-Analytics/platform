import { t3 } from "../translate/t-func.ts";
import { CountryCodes } from "./instance.ts";

export type ModuleId =
  | "m001"
  | "m002"
  | "m003"
  | "m004"
  | "m005"
  | "m006"
  | "m007"
  | "hfa001";

export type ModuleRegistryEntry = {
  id: ModuleId;
  label: { en: string; fr: string };
  prerequisites: ModuleId[];
  github: { owner: string; repo: string; path: string };
  allowedCountries?: string[];
};

export const MODULE_REGISTRY: ModuleRegistryEntry[] = [
  {
    id: "m001",
    label: {
      en: "M1. Data quality assessment",
      fr: "M1. Évaluation de la qualité des données",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m001" },
  },
  {
    id: "m002",
    label: {
      en: "M2. Data quality adjustments",
      fr: "M2. Ajustements de la qualité des données",
    },
    prerequisites: ["m001"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m002" },
  },
  {
    id: "m003",
    label: {
      en: "M3. Service utilization",
      fr: "M3. Utilisation des services",
    },
    prerequisites: ["m001", "m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m003" },
  },
  {
    id: "m004",
    label: {
      en: "M4. Coverage estimates",
      fr: "M4. Estimations de couverture",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m004" },
  },
  {
    id: "m005",
    label: {
      en: "M5. Coverage estimates ~ new, part 1",
      fr: "M5. Estimations de couverture ~ nouveau, partie 1",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m005" },
  },
  {
    id: "m006",
    label: {
      en: "M6. Coverage estimates ~ new, part 2",
      fr: "M6. Estimations de couverture ~ nouveau, partie 2",
    },
    prerequisites: ["m005"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m006" },
  },
  {
    id: "m007",
    label: {
      en: "M7. Scorecard",
      fr: "M7. Scorecard",
    },
    prerequisites: ["m002"],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "m007" },
    allowedCountries: [CountryCodes.Nigeria],
  },
  {
    id: "hfa001",
    label: {
      en: "HFA001. Health facility assessment",
      fr: "HFA001. Évaluation des établissements de santé",
    },
    prerequisites: [],
    github: { owner: "FASTR-Analytics", repo: "modules", path: "hfa001" },
  },
];

export function getValidatedModuleId(id: string): ModuleId {
  const entry = MODULE_REGISTRY.find((m) => m.id === id);
  if (!entry) throw new Error(`Unknown module id: ${id}`);
  return entry.id;
}

export const MODULE_SOURCE: "local" | "github" = "github";
export const MODULES_LOCAL_DIR = "./modules";

export function isModuleAllowedForCountry(
  m: ModuleRegistryEntry,
  countryIso3: string | undefined,
): boolean {
  if (!m.allowedCountries || m.allowedCountries.length === 0) return true;
  if (!countryIso3) return false;
  return m.allowedCountries.includes(countryIso3);
}

export function getPossibleModules(countryIso3: string | undefined): {
  id: ModuleId;
  label: string;
  prerequisiteModules: string[];
}[] {
  return MODULE_REGISTRY.filter((m) =>
    isModuleAllowedForCountry(m, countryIso3),
  ).map((m) => ({
    id: m.id,
    label: t3(m.label),
    prerequisiteModules: [...m.prerequisites],
  }));
}
