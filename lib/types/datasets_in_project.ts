import type {
  DatasetHmisVersion,
  DatasetHmisWindowingCommon,
} from "./dataset_hmis.ts";
import type { InstanceConfigFacilityColumns } from "./instance.ts";

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
    };

export type DatasetHmisInfoInProject = {
  version: DatasetHmisVersion;
  windowing: DatasetHmisWindowingCommon;
  totalRows?: number;
  // Metadata snapshots for staleness detection
  structureLastUpdated?: string;
  indicatorMappingsVersion?: string;
  facilityColumnsConfig?: InstanceConfigFacilityColumns;
  maxAdminArea?: number;
};

export type DatasetHfaInfoInProject = {
  // Set on rows that predate staleness tracking (info was '{}'). Migration
  // 011 backfills this so the client has a single, explicit legacy branch.
  _legacy?: true;
  // All snapshot fields are optional to match reality — legacy rows lack them
  // and the client compares missing-vs-present uniformly.
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
  facilityColumnsHash?: string;
};
