// =============================================================================
// The instance population store
// =============================================================================
//
// Annual population counts per admin area × year × population type, kept in
// the main DB and validated against the HMIS structure at import. The store
// holds ONE admin level at a time: the population level is the level of the
// stored rows (null while the store is empty), set by the first import and
// changed only by deleting every value. It is also the analysis level of
// m012's indicator values: the person-years file is written at that level and
// nothing exists below it (SYSTEM_08 "population.csv").
//
// A derived common indicator's expression names a population type as the
// ingredient `[population:<type>]`; at run capture the values of every type
// the resolved catalog references are expanded into monthly person-years
// (see lib/population_person_years.ts). Population types are user-extensible
// rows (`population_types`), the only vocabulary an expression may name: no
// typed field, no foreign key, the expression IS the reference.
//
// =============================================================================

export type PopulationTypeInfo = {
  id: string;
  label: string;
};

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
  populationTypes: PopulationTypeInfo[];
  populationCoverage: PopulationCoverage[];
  // Bumped by every write to either table; keys the T2 type-store cache.
  populationLastUpdated: string | undefined;
};

// One grid row. Server-sorted: structure order, then stale areas by path.
export type PopulationGridArea = {
  // populationAreaKey of the full name path; identity only, never displayed.
  key: string;
  path: string;
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
