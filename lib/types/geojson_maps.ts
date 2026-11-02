import type { FacilityFamily } from "./structure.ts";

export type GeoJsonMapSummary = {
  family: FacilityFamily;
  adminAreaLevel: number;
  uploadedAt: string;
};

export type AdminAreaOption = { value: string; label: string };

// A leaf name that more than one admin area carries at a level, with each
// carrier's parent path from level 1 down. The area key is the name, so these
// areas share one boundary and one value until they are renamed.
export type AdminAreaDuplicateGroup = {
  name: string;
  parentPaths: string[][];
};

// One option per distinct name: the area key cannot tell same-named areas
// apart, so the duplicates are reported beside the options instead.
export type AdminAreaOptionsForLevel = {
  options: AdminAreaOption[];
  duplicates: AdminAreaDuplicateGroup[];
};
