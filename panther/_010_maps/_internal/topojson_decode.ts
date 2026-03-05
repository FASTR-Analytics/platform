// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONPosition,
  TopoJSONGeometry,
  TopoJSONTopology,
} from "./geojson_types.ts";

export function decodeTopojson(
  topology: TopoJSONTopology,
  objectName: string,
): GeoJSONFeatureCollection {
  const obj = topology.objects[objectName];
  if (!obj) {
    throw new Error(
      `TopoJSON object "${objectName}" not found. Available: ${
        Object.keys(topology.objects).join(", ")
      }`,
    );
  }

  const decodedArcs = decodeArcs(topology);
  const features: GeoJSONFeature[] = [];

  for (const geom of obj.geometries) {
    const feature = toGeoJSONFeature(geom, decodedArcs);
    if (feature) features.push(feature);
  }

  return { type: "FeatureCollection", features };
}

function decodeArcs(topology: TopoJSONTopology): GeoJSONPosition[][] {
  const transform = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((point) => {
      x += point[0];
      y += point[1];
      if (transform) {
        return [
          x * transform.scale[0] + transform.translate[0],
          y * transform.scale[1] + transform.translate[1],
        ] as GeoJSONPosition;
      }
      return [x, y] as GeoJSONPosition;
    });
  });
}

function stitchArcs(
  arcRefs: number[],
  decodedArcs: GeoJSONPosition[][],
): GeoJSONPosition[] {
  const coords: GeoJSONPosition[] = [];
  for (const ref of arcRefs) {
    const arc = ref >= 0 ? decodedArcs[ref] : [...decodedArcs[~ref]].reverse();
    for (let i = coords.length > 0 ? 1 : 0; i < arc.length; i++) {
      coords.push(arc[i]);
    }
  }
  return coords;
}

function toGeoJSONFeature(
  geom: TopoJSONGeometry,
  decodedArcs: GeoJSONPosition[][],
): GeoJSONFeature | undefined {
  const props = geom.properties ?? {};
  const id = geom.id;

  switch (geom.type) {
    case "Polygon": {
      const arcs = geom.arcs as number[][];
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: arcs.map((ring) => stitchArcs(ring, decodedArcs)),
        },
        properties: props,
        id,
      };
    }
    case "MultiPolygon": {
      const arcs = geom.arcs as number[][][];
      return {
        type: "Feature",
        geometry: {
          type: "MultiPolygon",
          coordinates: arcs.map((polygon) =>
            polygon.map((ring) => stitchArcs(ring, decodedArcs))
          ),
        },
        properties: props,
        id,
      };
    }
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
      return undefined;
    default:
      return undefined;
  }
}
