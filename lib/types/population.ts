// =============================================================================
// The instance population store (PLAN_1b)
// =============================================================================
//
// Annual population figures per admin area × year × population type, kept in
// the main DB and validated against the HMIS structure at upload. A derived
// common indicator's expression names a population type as the ingredient
// `[population:<type>]` (PLAN_1c); at run capture the figures of every type
// the resolved catalog references are expanded into monthly person-years
// (mid-year anchors, linear interpolation, ±1 year geometric extrapolation —
// see lib/population_person_years.ts) and written into the package, where
// m012 treats them as one more additive ingredient.
//
// Population types are user-extensible rows (`population_types`), seeded with
// the six FASTR defaults by instance migration 080. The table is the only
// vocabulary: an expression resolves iff every population term it names is a
// row in it, checked at authoring and at capture — there is no typed field
// and no foreign key, the expression IS the reference.
//
// =============================================================================

export type PopulationTypeInfo = {
  id: string;
  label: string;
};

// Per (type, admin level): what the store holds, measured against the HMIS
// structure at that level. `complete` is what generation will need — every
// structure area has a figure for every stored year.
export type PopulationCoverage = {
  populationType: string;
  adminAreaLevel: number;
  firstYear: number;
  lastYear: number;
  yearCount: number;
  areaCount: number;
  structureAreaCount: number;
  complete: boolean;
};

export type InstancePopulationSummary = {
  populationTypes: PopulationTypeInfo[];
  populationCoverage: PopulationCoverage[];
  // Bumped by every write to either table; keys the T2 rows cache.
  populationLastUpdated: string | undefined;
};

// One stored row, as the manager page lists it (finest names only; coarser
// levels carry "" in the unused columns).
export type PopulationRow = {
  populationType: string;
  adminAreaLevel: number;
  adminArea1: string;
  adminArea2: string;
  adminArea3: string;
  adminArea4: string;
  year: number;
  count: number;
};

export type PopulationImportResult = {
  rowsImported: number;
  adminAreaLevel: number;
  populationTypes: string[];
  firstYear: number;
  lastYear: number;
};

// The CSV contract, shared by the upload validator and the manager page's
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
// composes the same string (`paste0("population:", population_type)`) —
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

// Every population type the resolved catalog's slot maps reference — what a
// run's person-years file must carry (PLAN_1c ruling 5). Sorted, deduplicated.
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
