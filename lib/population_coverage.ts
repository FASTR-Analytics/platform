// Population coverage against the HMIS structure, pure. One completeness
// rule, two data paths: the SSE summary feeds it per-year counts aggregated
// in SQL (`populationCompleteness`), the import preview feeds it the store ∪
// file rows (`populationCoverage`). A row whose area is not in the structure
// at the population level is stale: counted, shown, never part of
// completeness.

import type {
  PopulationCoverage,
  PopulationLevel,
  PopulationYearCoverage,
} from "./types/population.ts";

// Written as a char code rather than a literal so the file stays text: NUL
// can never be in a name Postgres stores, which is what makes it a safe
// separator.
const AREA_KEY_SEPARATOR = String.fromCharCode(0);

export function populationAreaKey(names: readonly string[]): string {
  return names.join(AREA_KEY_SEPARATOR);
}

// Names from level 2 down to `level` as one string, for messages that name
// an area (import problems, the preview's missing areas, the generation
// coverage error). The grid never shows a path: it has a column per level.
export function populationDisplayPath(
  names: readonly string[],
  level: PopulationLevel,
): string {
  return names.slice(1, level).join(" / ");
}

export function populationYearRangeLabel(
  c: Pick<PopulationCoverage, "firstYear" | "lastYear">,
): string {
  return c.firstYear === c.lastYear
    ? `${c.firstYear}`
    : `${c.firstYear}–${c.lastYear}`;
}

export type PopulationYearCount = { year: number; areasWithData: number };

export function populationCompleteness(
  years: PopulationYearCount[],
  structureAreaCount: number,
): { incompleteYears: number[]; complete: boolean } {
  const incompleteYears = years
    .filter((y) => y.areasWithData < structureAreaCount)
    .map((y) => y.year);
  return {
    incompleteYears,
    complete: structureAreaCount > 0 && years.length > 0 &&
      incompleteYears.length === 0,
  };
}

export type PopulationCoverageInput = {
  // populationAreaKey → display path, in structure order.
  structureAreas: Map<string, string>;
  rows: { areaKey: string; year: number }[];
  missingAreasCap: number;
};

export type PopulationCoverageResult = {
  years: PopulationYearCoverage[];
  areaCount: number;
  staleRowCount: number;
  incompleteYears: number[];
  complete: boolean;
};

export function populationCoverage(
  input: PopulationCoverageInput,
): PopulationCoverageResult {
  const areasByYear = new Map<number, Set<string>>();
  const inStructureAreas = new Set<string>();
  let staleRowCount = 0;
  for (const row of input.rows) {
    if (!input.structureAreas.has(row.areaKey)) {
      staleRowCount++;
      continue;
    }
    inStructureAreas.add(row.areaKey);
    const areas = areasByYear.get(row.year) ?? new Set<string>();
    areas.add(row.areaKey);
    areasByYear.set(row.year, areas);
  }
  const years: PopulationYearCoverage[] = [...areasByYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const present = areasByYear.get(year)!;
      const missingAreas: string[] = [];
      let missingCount = 0;
      for (const [key, path] of input.structureAreas) {
        if (present.has(key)) continue;
        missingCount++;
        if (missingAreas.length < input.missingAreasCap) {
          missingAreas.push(path);
        }
      }
      return {
        year,
        areasWithData: present.size,
        missingCount,
        missingAreas,
      };
    });
  const { incompleteYears, complete } = populationCompleteness(
    years,
    input.structureAreas.size,
  );
  return {
    years,
    areaCount: inStructureAreas.size,
    staleRowCount,
    incompleteYears,
    complete,
  };
}
