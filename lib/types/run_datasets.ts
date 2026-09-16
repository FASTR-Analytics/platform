import type { DatasetHmisVersion } from "./dataset_hmis.ts";

// The dataset captures a results package carries: what was exported into the
// run workspace at generation time, plus the metadata snapshots a reader
// compares against the live instance to judge staleness. Read from the run
// manifest (getRunDatasetsFromManifest), never from a database.

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

// Capture is always the full dataset (PLAN_FULL_CAPTURE_GENERATION). Manifest
// transform block 9 holds every stored info to exactly these keys.
export type RunDatasetHmisInfo = {
  version: DatasetHmisVersion;
  totalRows?: number;
  // Metadata snapshots for staleness detection
  structureLastUpdated?: string;
  indicatorsVersion?: string;
  countIndicatorsVersion?: string;
};

export type RunDatasetHfaInfo = {
  // Optional because captures that predate staleness tracking stored '{}',
  // and the client compares missing-vs-present uniformly.
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
};

export type RunDatasetIcehInfo = {
  icehCacheHash: string;
};
