import { z } from "zod";
import {
  DatasetStagingResult,
  type DatasetUploadAttemptSummary,
} from "./dataset_hmis_import.ts";

export type DatasetHmisDetail = {
  uploadAttempt: DatasetUploadAttemptSummary | undefined;
  currentVersionId: number | undefined;
  nVersions: number;
};

export type DatasetHmisVersion = {
  id: number;
  nRowsTotalImported: number;
  nRowsInserted: number | undefined;
  nRowsUpdated: number | undefined;
  stagingResult: DatasetStagingResult | undefined;
};

// ============================================================================
// HMIS Windowing & Configuration Types
// ============================================================================

// Authoritative windowing schemas — route bodies (project attach, instance
// delete-data, run generation) and stored JSON all validate against these.
const datasetHmisWindowingBaseSchema = z.object({
  start: z.number(),
  end: z.number(),
  takeAllIndicators: z.boolean(),
  takeAllAdminArea2s: z.boolean(),
  adminArea2sToInclude: z.array(z.string()),
  takeAllAdminArea3s: z.boolean().optional(),
  adminArea3sToInclude: z.array(z.string()).optional(),
  takeAllFacilityOwnerships: z.boolean().optional(),
  takeAllFacilityTypes: z.boolean().optional(),
  facilityOwnwershipsToInclude: z.array(z.string()).optional(),
  facilityTypesToInclude: z.array(z.string()).optional(),
});

export const datasetHmisWindowingRawSchema = datasetHmisWindowingBaseSchema
  .extend({
    indicatorType: z.literal("raw"),
    rawIndicatorsToInclude: z.array(z.string()),
  });

export const datasetHmisWindowingCommonSchema = datasetHmisWindowingBaseSchema
  .extend({
    indicatorType: z.literal("common"),
    commonIndicatorsToInclude: z.array(z.string()),
  });

export type DatasetHmisWindowingRaw = z.infer<
  typeof datasetHmisWindowingRawSchema
>;

export type DatasetHmisWindowingCommon = z.infer<
  typeof datasetHmisWindowingCommonSchema
>;

export type DatasetHmisWindowing =
  | DatasetHmisWindowingRaw
  | DatasetHmisWindowingCommon;

export const AA3_SEPARATOR = "|||";

export function makeAa3CompositeKey(aa3: string, aa2: string): string {
  return `${aa3}${AA3_SEPARATOR}${aa2}`;
}

export function parseAa3CompositeKey(key: string): {
  aa3: string;
  aa2: string;
} {
  const i = key.indexOf(AA3_SEPARATOR);
  if (i === -1) {
    throw new Error(`Invalid AA3 composite key (missing separator): ${key}`);
  }
  return { aa3: key.slice(0, i), aa2: key.slice(i + AA3_SEPARATOR.length) };
}
