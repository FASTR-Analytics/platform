import type { DatasetHmisVersion } from "./dataset_hmis.ts";

// RunDataset is what a reader of a results package carries of each dataset
// it captured: the family and, for HMIS, the import version's id (the authoring
// context and the package grounding, read from the run manifest by
// getRunDatasetsFromManifest, never from a database).
//
// The RunDataset*Info types are what capture writes into a manifest dataset
// entry's `info`: what was exported into the run workspace at generation
// time, plus the instance's metadata stamps at capture time.

export type RunDataset =
  | { datasetType: "hmis"; versionId: number }
  | { datasetType: "hfa" }
  | { datasetType: "iceh" };

// Capture is always the full dataset. Manifest transform block 9 holds every
// stored info to exactly these keys.
export type RunDatasetHmisInfo = {
  version: DatasetHmisVersion;
  totalRows?: number;
  // Metadata snapshots for staleness detection
  structureLastUpdated?: string;
  indicatorsVersion?: string;
  countIndicatorsVersion?: string;
};

export type RunDatasetHfaInfo = {
  // Optional because captures that predate staleness tracking stored '{}'.
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
};

export type RunDatasetIcehInfo = {
  icehCacheHash: string;
};
