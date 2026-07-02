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

export function processGeoJson(
  rawGeoJsonStr: string,
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): string {
  const parsed = JSON.parse(rawGeoJsonStr) as GeoJsonFeatureCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Invalid GeoJSON: expected a FeatureCollection");
  }

  const processedFeatures: GeoJsonFeature[] = [];
  for (const feature of parsed.features) {
    if (feature.geometry === null || feature.geometry === undefined) {
      continue;
    }
    const matchValue = feature.properties?.[areaMatchProp];
    if (matchValue == null) continue;
    const sourceName = String(matchValue);
    const adminAreaName = areaMapping[sourceName] ?? "";

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

  return JSON.stringify(result);
}

export function processGeoJsonFromDhis2(
  featureCollection: { type: "FeatureCollection"; features: GeoJsonFeature[] },
  areaMatchProp: string,
  areaMapping: Record<string, string>,
): string {
  const processedFeatures: GeoJsonFeature[] = [];
  for (const feature of featureCollection.features) {
    if (feature.geometry === null || feature.geometry === undefined) {
      continue;
    }

    const matchValue = feature.properties?.[areaMatchProp];
    if (matchValue == null) continue;
    const sourceName = String(matchValue);
    const adminAreaName = areaMapping[sourceName] ?? "";

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

  return JSON.stringify(result);
}
