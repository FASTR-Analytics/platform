import { t3 } from "lib";
import type { FigureInputs, MapDataTransformed } from "panther";

// How a map's data areas meet its boundaries, read from the transformed map
// data the render already built: the area key is a name, so a data area
// either finds a boundary with that name or draws nothing.
export type MapCoverage = {
  dataAreas: number;
  boundaries: number;
  matchedAreas: number;
  boundariesWithoutData: number;
  matchedShare: number;
};

export const MAP_COVERAGE_PROMINENT_BELOW = 0.7;

function getMapCoverage(data: MapDataTransformed): MapCoverage {
  const dataAreas = new Set<string>();
  for (const tiers of data.valueMaps) {
    for (const lanes of tiers) {
      for (const values of lanes) {
        for (const areaId of Object.keys(values)) {
          if (areaId !== "") dataAreas.add(areaId);
        }
      }
    }
  }
  const boundaries = new Set<string>();
  for (const feature of data.geoFeatures) {
    const id = feature.properties?.[data.areaMatchProp];
    if (id !== undefined && id !== null && id !== "") {
      boundaries.add(String(id));
    }
  }
  const matchedAreas = [...dataAreas].filter((a) => boundaries.has(a)).length;
  return {
    dataAreas: dataAreas.size,
    boundaries: boundaries.size,
    matchedAreas,
    boundariesWithoutData: [...boundaries].filter((b) => !dataAreas.has(b))
      .length,
    matchedShare: dataAreas.size === 0 ? 1 : matchedAreas / dataAreas.size,
  };
}

// Keyed by the transformed data object, so the tally buildFigureInputs takes
// is the one every surface that shows the figure reads, not a second walk of
// up to 10,325 areas per editor keystroke.
const coverageByData = new WeakMap<MapDataTransformed, MapCoverage>();

export function getFigureMapCoverage(
  inputs: FigureInputs,
): MapCoverage | undefined {
  if (inputs.figureType !== "map" || !("isTransformed" in inputs.data)) {
    return undefined;
  }
  const cached = coverageByData.get(inputs.data);
  if (cached !== undefined) return cached;
  const coverage = getMapCoverage(inputs.data);
  coverageByData.set(inputs.data, coverage);
  return coverage;
}

export function describeMapCoverage(coverage: MapCoverage): string {
  const { dataAreas, matchedAreas, boundariesWithoutData } = coverage;
  return t3({
    en:
      `${matchedAreas} of ${dataAreas} data areas have a boundary; ${boundariesWithoutData} boundaries have no data`,
    fr:
      `${matchedAreas} unités sur ${dataAreas} avec données ont une limite ; ${boundariesWithoutData} limites n'ont pas de données`,
    pt:
      `${matchedAreas} de ${dataAreas} zonas com dados têm um limite; ${boundariesWithoutData} limites não têm dados`,
  });
}
