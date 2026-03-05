// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type ProjectionFn = (lon: number, lat: number) => [number, number];

export function equirectangular(lon: number, lat: number): [number, number] {
  return [lon, lat];
}

export function mercator(lon: number, lat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  return [lon, Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * (180 / Math.PI)];
}

export function naturalEarth1(lon: number, lat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  const lat2 = latRad * latRad;
  const lat4 = lat2 * lat2;
  const lat6 = lat2 * lat4;
  const x = lon * (0.8707 - 0.131979 * lat2 + lat6 * (-0.013791 + lat2 *
          (0.003971 * lat2 - 0.001529 * lat4)));
  const y = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 +
            0.028874 * lat2 - 0.005916 * lat4)));
  return [x, y];
}

export function getProjectionFn(
  name: "equirectangular" | "mercator" | "naturalEarth1",
): ProjectionFn {
  switch (name) {
    case "equirectangular":
      return equirectangular;
    case "mercator":
      return mercator;
    case "naturalEarth1":
      return naturalEarth1;
  }
}
