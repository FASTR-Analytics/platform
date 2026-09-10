// The instance population store (SYSTEM_05 "Population store"): annual
// counts per admin area × year × population type at the population level.
// A derived common indicator names a type by its id, a bare identifier and
// a reserved word (`anc1 / population_total`); at run capture every
// referenced type is expanded into monthly person-years
// (lib/population_person_years.ts).

import type { TranslatableString } from "./_module_definition_github.ts";
import type { AdminAreaLevel } from "./structure.ts";

// The population type vocabulary: the only ids a CSV row, a formula, an
// ingredient table or a package may name. One string everywhere: the type
// id IS the expression identifier and the ingredient id. Fixed in code, no
// table.
export const POPULATION_TYPES = [
  {
    id: "population_total",
    label: {
      en: "Total population",
      fr: "Population totale",
      pt: "População total",
    },
  },
  {
    id: "population_u5",
    label: {
      en: "Under 5 population",
      fr: "Population de moins de 5 ans",
      pt: "População com menos de 5 anos",
    },
  },
  {
    id: "population_u1",
    label: {
      en: "Under 1 population",
      fr: "Population de moins de 1 an",
      pt: "População com menos de 1 ano",
    },
  },
  {
    id: "population_wra",
    label: { en: "WRA (15-49)", fr: "FAP (15-49)", pt: "MIR (15-49)" },
  },
  {
    id: "population_births",
    label: {
      en: "Expected births",
      fr: "Naissances attendues",
      pt: "Nascimentos esperados",
    },
  },
  {
    id: "population_pregnancies",
    label: {
      en: "Expected pregnancies",
      fr: "Grossesses attendues",
      pt: "Gravidezes esperadas",
    },
  },
] as const satisfies readonly { id: string; label: TranslatableString }[];

export type PopulationTypeId = (typeof POPULATION_TYPES)[number]["id"];

export const POPULATION_TYPE_IDS: string[] = POPULATION_TYPES.map((t) => t.id);

export function isPopulationTypeId(id: string): boolean {
  return POPULATION_TYPE_IDS.includes(id);
}

// Stored rows carry the id as text, so the lookup takes any string.
export function populationTypeLabel(id: string): TranslatableString {
  return POPULATION_TYPES.find((t) => t.id === id)?.label ??
    { en: id, fr: id, pt: id };
}

// Per type, over the rows whose area is in the HMIS structure at the
// population level. Complete iff the structure is non-empty, the type has an
// in-structure row, and every year with one has one for every structure area.
export type PopulationCoverage = {
  populationType: string;
  firstYear: number | undefined;
  lastYear: number | undefined;
  yearCount: number;
  areaCount: number;
  structureAreaCount: number;
  staleRowCount: number;
  incompleteYears: number[];
  complete: boolean;
};

export type InstancePopulationSummary = {
  populationLevel: AdminAreaLevel | undefined;
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
  populationLevel: AdminAreaLevel | undefined;
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
  populationLevel: AdminAreaLevel;
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
  populationLevel: AdminAreaLevel;
  populationTypes: string[];
  firstYear: number;
  lastYear: number;
};

// The CSV contract, shared by the import validator and the manager page's
// help text. Level = the deepest admin_area_N column present; the columns
// below it must all be present too. admin_area_1 is optional and, when
// present, must match the structure's level-1 name for that area.
export const ADMIN_AREA_COLUMNS = [
  "admin_area_1",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

export const POPULATION_CSV_REQUIRED_COLUMNS = [
  "admin_area_2",
  "year",
  "population_type",
  "count",
] as const;

// Every population type the resolved catalog's slot maps reference: what a
// run's person-years file must carry, and (non-empty) what makes population
// ACTIVE for a run. Not a setting: the formulas decide. Sorted, deduplicated.
export function populationTypesReferencedByCatalog(
  rows: { slot_map: Record<string, string> | null }[],
): string[] {
  const types = new Set<string>();
  for (const row of rows) {
    for (const ingredientId of Object.keys(row.slot_map ?? {})) {
      if (isPopulationTypeId(ingredientId)) types.add(ingredientId);
    }
  }
  return [...types].sort();
}
