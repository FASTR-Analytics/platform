import type { DatasetHmisVersion } from "./dataset_hmis.ts";

export type DatasetInProject =
  | {
      datasetType: "hmis";
      info: DatasetHmisInfoInProject;
      dateExported: string;
    }
  | {
      datasetType: "hfa";
      info: DatasetHfaInfoInProject;
      dateExported: string;
    }
  | {
      datasetType: "iceh";
      info: DatasetIcehInfoInProject;
      dateExported: string;
    };

// Capture is always the full dataset (PLAN_FULL_CAPTURE_GENERATION). Legacy
// packages may carry extra `windowing` (HMIS), `facilityColumnsConfig` or
// `maxAdminArea` keys in their stored info JSON — inert, nothing reads them.
export type DatasetHmisInfoInProject = {
  version: DatasetHmisVersion;
  totalRows?: number;
  // Metadata snapshots for staleness detection
  structureLastUpdated?: string;
  indicatorMappingsVersion?: string;
  calculatedIndicatorsVersion?: string;
};

export type DatasetHfaInfoInProject = {
  // Set on rows that predate staleness tracking (info was '{}'). Migration
  // 011 backfills this so the client has a single, explicit legacy branch.
  _legacy?: true;
  // All snapshot fields are optional to match reality — legacy rows lack them
  // and the client compares missing-vs-present uniformly. Legacy rows may
  // carry an inert `facilityColumnsHash` key — nothing reads it.
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
};

export type DatasetIcehInfoInProject = {
  icehCacheHash: string;
};
