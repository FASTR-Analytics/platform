import type { FacilityFamily } from "./structure.ts";

export type GeoJsonMapSummary = {
  family: FacilityFamily;
  adminAreaLevel: number;
  uploadedAt: string;
};
