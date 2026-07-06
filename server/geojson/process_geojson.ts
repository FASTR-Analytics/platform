type GeoJsonFeature = {
  type: "Feature";
  geometry: Record<string, unknown> | null | undefined;
  properties: Record<string, unknown>;
  id?: string | number;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type GeoJsonAnalysisResult = {
  properties: string[];
  sampleValues: Record<string, string[]>;
  featureCount: number;
};

export function analyzeGeoJson(rawGeoJsonStr: string): GeoJsonAnalysisResult {
  const parsed = JSON.parse(rawGeoJsonStr) as GeoJsonFeatureCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Invalid GeoJSON: expected a FeatureCollection");
  }

  const propValues: Record<string, Set<string>> = {};
  let featureCount = 0;

  for (const feature of parsed.features) {
    if (feature.geometry === null || feature.geometry === undefined) {
      continue;
    }
    featureCount++;
    if (!feature.properties) {
      continue;
    }
    for (const [key, val] of Object.entries(feature.properties)) {
      if (val == null) continue;
      if (!propValues[key]) {
        propValues[key] = new Set();
      }
      propValues[key].add(String(val));
    }
  }

  const properties = Object.keys(propValues).sort();
  const sampleValues: Record<string, string[]> = {};
  for (const prop of properties) {
    const allVals = Array.from(propValues[prop]).sort();
    sampleValues[prop] = allVals;
  }

  return {
    properties,
    sampleValues,
    featureCount,
  };
}

export type ProcessedGeoJsonResult = {
  geojson: string;
  // Features stored (had geometry AND a readable match value)
  featureCount: number;
  // Of those, mapped to an admin area vs kept with area_id "" (mappable later)
  matchedCount: number;
  unmatchedCount: number;
  // Dropped: geometry-less, or the match property was absent/null on the feature
  droppedNoGeometryCount: number;
  droppedNoMatchValueCount: number;
};

export function processGeoJson(
  rawGeoJsonStr: string,
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): ProcessedGeoJsonResult {
  const parsed = JSON.parse(rawGeoJsonStr) as GeoJsonFeatureCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Invalid GeoJSON: expected a FeatureCollection");
  }
  return processFeatures(parsed.features, areaMatchProp, areaMapping);
}

export function processGeoJsonFromDhis2(
  featureCollection: { type: "FeatureCollection"; features: GeoJsonFeature[] },
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): ProcessedGeoJsonResult {
  return processFeatures(featureCollection.features, areaMatchProp, areaMapping);
}

function processFeatures(
  features: GeoJsonFeature[],
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): ProcessedGeoJsonResult {
  const processedFeatures: GeoJsonFeature[] = [];
  let matchedCount = 0;
  let droppedNoGeometryCount = 0;
  let droppedNoMatchValueCount = 0;

  for (const feature of features) {
    if (feature.geometry === null || feature.geometry === undefined) {
      droppedNoGeometryCount++;
      continue;
    }
    const matchValue = feature.properties?.[areaMatchProp];
    if (matchValue == null) {
      droppedNoMatchValueCount++;
      continue;
    }
    const sourceName = String(matchValue);
    const adminAreaName = areaMapping[sourceName] ?? "";
    if (adminAreaName !== "") {
      matchedCount++;
    }

    processedFeatures.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        area_id: adminAreaName,
        source_name: sourceName,
      },
    });
  }

  const result: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: processedFeatures,
  };

  return {
    geojson: JSON.stringify(result),
    featureCount: processedFeatures.length,
    matchedCount,
    unmatchedCount: processedFeatures.length - matchedCount,
    droppedNoGeometryCount,
    droppedNoMatchValueCount,
  };
}
