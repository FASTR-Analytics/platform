// The instance population store (SYSTEM_05 "Population store"): annual
// counts per admin area × year × population type at the population level.
// A derived common indicator names a type as the ingredient
// `[population:<type>]`; at run capture every referenced type is expanded
// into monthly person-years (lib/population_person_years.ts).

import type { TranslatableString } from "./_module_definition_github.ts";

// The population type vocabulary: the only ids a CSV row, a formula's
// `[population:<type>]` term or a package may name. Fixed in code, no table.
export const POPULATION_TYPES = [
  {
    id: "total_population",
    label: {
      en: "Total population",
      fr: "Population totale",
      pt: "População total",
    },
  },
  {
    id: "u5",
    label: {
      en: "Under 5 population",
      fr: "Population de moins de 5 ans",
      pt: "População com menos de 5 anos",
    },
  },
  {
    id: "u1",
    label: {
      en: "Under 1 population",
      fr: "Population de moins de 1 an",
      pt: "População com menos de 1 ano",
    },
  },
  {
    id: "wra",
    label: { en: "WRA (15-49)", fr: "FAP (15-49)", pt: "MIR (15-49)" },
  },
  {
    id: "births",
    label: {
      en: "Expected births",
      fr: "Naissances attendues",
      pt: "Nascimentos esperados",
    },
  },
  {
    id: "pregnancies",
    label: {
      en: "Expected pregnancies",
      fr: "Grossesses attendues",
      pt: "Gravidezes esperadas",
    },
  },
] as const satisfies readonly { id: string; label: TranslatableString }[];

export type PopulationTypeId = (typeof POPULATION_TYPES)[number]["id"];

export const POPULATION_TYPE_IDS: string[] = POPULATION_TYPES.map((t) => t.id);

// Stored rows carry the id as text, so the lookup takes any string.
export function populationTypeLabel(id: string): TranslatableString {
  return POPULATION_TYPES.find((t) => t.id === id)?.label ??
    { en: id, fr: id, pt: id };
}

export type PopulationLevel = 2 | 3 | 4;

export function parsePopulationLevel(value: number): PopulationLevel {
  if (value === 2 || value === 3 || value === 4) return value;
  throw new Error(`Not a population level: ${value}`);
}

// Per type, over the rows whose area is in the HMIS structure at the
// population level. Complete iff the structure is non-empty, the type has an
// in-structure row, and every year with one has one for every structure area.
export type PopulationCoverage = {
  populationType: string;
  firstYear: number | null;
  lastYear: number | null;
  yearCount: number;
  areaCount: number;
  structureAreaCount: number;
  staleRowCount: number;
  incompleteYears: number[];
  complete: boolean;
};

export type InstancePopulationSummary = {
  populationLevel: PopulationLevel | null;
  populationRowCount: number;
  populationCoverage: PopulationCoverage[];
  // Bumped by every store write and level change; keys the T2 type-store cache.
  populationLastUpdated: string | undefined;
};

// One grid row: the area's names from admin_area_1 down to the population
// level, one per column. Server-sorted: structure order, then stale areas
// (no longer in the structure) by name.
export type PopulationGridArea = {
  names: string[];
  stale: boolean;
  cells: Record<string, number>;
};

export type PopulationTypeStore = {
  populationLevel: PopulationLevel | null;
  years: number[];
  areas: PopulationGridArea[];
};

export const POPULATION_PREVIEW_MISSING_AREAS_CAP = 50;

export type PopulationYearCoverage = {
  year: number;
  areasWithData: number;
  missingCount: number;
  missingAreas: string[];
};

export type PopulationImportPreviewType = {
  populationType: string;
  structureAreaCount: number;
  years: PopulationYearCoverage[];
  staleRowCount: number;
  complete: boolean;
};

// What the store looks like after the file is upserted, computed before any
// write. `complete` covers every type the file touches.
export type PopulationImportPreview = {
  populationLevel: PopulationLevel;
  populationTypes: string[];
  firstYear: number;
  lastYear: number;
  rowsInFile: number;
  rowsNew: number;
  rowsReplaced: number;
  types: PopulationImportPreviewType[];
  complete: boolean;
};

export type PopulationImportResult = {
  rowsImported: number;
  populationLevel: PopulationLevel;
  populationTypes: string[];
  firstYear: number;
  lastYear: number;
};

// The CSV contract, shared by the import validator and the manager page's
// help text. Level = the deepest admin_area_N column present; the columns
// below it must all be present too. admin_area_1 is optional and, when
// present, must match the structure's level-1 name for that area.
export const POPULATION_CSV_REQUIRED_COLUMNS = [
  "admin_area_2",
  "year",
  "population_type",
  "count",
] as const;

// The ingredient id under which a population type's person-years travel in
// m012's ingredient table and its ROWS. A ':' can never appear in a common
// indicator id (getNewIndicatorIdIssue), so the pseudo-id cannot collide with
// one; in an expression it is always [bracket-quoted]. m012's script.R
// composes the same string (`paste0("population:", population_type)`):
// the two sides of ONE contract.
export const POPULATION_INGREDIENT_PREFIX = "population:";

export function populationIngredientId(populationType: string): string {
  return `${POPULATION_INGREDIENT_PREFIX}${populationType}`;
}

// The population type an ingredient id names, or null for a common indicator.
export function parsePopulationIngredientId(id: string): string | null {
  return id.startsWith(POPULATION_INGREDIENT_PREFIX)
    ? id.slice(POPULATION_INGREDIENT_PREFIX.length)
    : null;
}

// Every population type the resolved catalog's slot maps reference: what a
// run's person-years file must carry. Sorted, deduplicated.
export function populationTypesReferencedBySlotMaps(
  slotMaps: Record<string, string>[],
): string[] {
  const types = new Set<string>();
  for (const slotMap of slotMaps) {
    for (const ingredientId of Object.keys(slotMap)) {
      const populationType = parsePopulationIngredientId(ingredientId);
      if (populationType !== null) types.add(populationType);
    }
  }
  return [...types].sort();
}
