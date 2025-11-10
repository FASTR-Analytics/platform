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
      info: undefined;
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
