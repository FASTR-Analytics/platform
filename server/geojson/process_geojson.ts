type GeoJsonFeature = {
  type: "Feature";
  geometry: Record<string, unknown>;
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

  for (const feature of parsed.features) {
    if (!feature.properties) continue;
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
    featureCount: parsed.features.length,
  };
}

export function processGeoJson(
  rawGeoJsonStr: string,
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): string {
  const parsed = JSON.parse(rawGeoJsonStr) as GeoJsonFeatureCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Invalid GeoJSON: expected a FeatureCollection");
  }

  const reverseMapping: Record<string, string> = {};
  for (const [adminAreaName, geoJsonValue] of Object.entries(areaMapping)) {
    reverseMapping[geoJsonValue] = adminAreaName;
  }

  const processedFeatures: GeoJsonFeature[] = [];
  for (const feature of parsed.features) {
    const matchValue = feature.properties?.[areaMatchProp];
    if (matchValue == null) continue;
    const adminAreaName = reverseMapping[String(matchValue)];
    if (!adminAreaName) continue;

    processedFeatures.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        area_id: adminAreaName,
      },
    });
  }

  const result: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: processedFeatures,
  };

  return JSON.stringify(result);
}
