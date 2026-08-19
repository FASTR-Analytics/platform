// The dataset captures a results package carries: what was exported into the
// run workspace at generation time, and the metadata snapshots a reader
// compares against the live instance to judge staleness. Read from the run
// manifest (getRunDatasetsFromManifest), never from a database.

import type { DatasetHmisVersion } from "./dataset_hmis.ts";

export type RunDataset =
  | {
      datasetType: "hmis";
      info: RunDatasetHmisInfo;
      dateExported: string;
    }
  | {
      datasetType: "hfa";
      info: RunDatasetHfaInfo;
      dateExported: string;
    }
  | {
      datasetType: "iceh";
      info: RunDatasetIcehInfo;
      dateExported: string;
    };

// Capture is always the full dataset (PLAN_FULL_CAPTURE_GENERATION). Legacy
// packages may carry extra `windowing` (HMIS), `facilityColumnsConfig` or
// `maxAdminArea` keys in their stored info JSON — inert, nothing reads them.
export type RunDatasetHmisInfo = {
  version: DatasetHmisVersion;
  totalRows?: number;
  // Metadata snapshots for staleness detection
  structureLastUpdated?: string;
  indicatorMappingsVersion?: string;
  calculatedIndicatorsVersion?: string;
};

export type RunDatasetHfaInfo = {
  // Set on rows that predate staleness tracking (info was '{}'). Migration
  // 011 backfilled this so the client has a single, explicit legacy branch.
  _legacy?: true;
  // All snapshot fields are optional to match reality — legacy rows lack them
  // and the client compares missing-vs-present uniformly. Legacy rows may
  // carry an inert `facilityColumnsHash` key — nothing reads it.
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
};

export type RunDatasetIcehInfo = {
  icehCacheHash: string;
};
