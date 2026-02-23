import { AssetInfo } from "./assets.ts";
import type { DatasetType } from "./datasets.ts";
import type { IndicatorType } from "./indicators.ts";
import type { ProjectUserPermissions, UserPermissions } from "./permissions.ts";
import {
  GenericLongFormFetchConfig,
  PeriodBounds,
} from "./presentation_objects.ts";
import { ProjectSummary, ProjectUserRoleType } from "./projects.ts";
import type { StructureUploadAttemptDetail } from "./structure.ts";

// ============================================================================
// API Response Types
// ============================================================================

export type APIResponseWithData<T> =
  | { success: true; data: T }
  | { success: false; err: string };

export type APIResponseNoData =
  | { success: true }
  | { success: false; err: string };

// Streaming types - minimal
export type StreamMessage = {
  progress: number; // 0 to 1
  message: string;
};

export type ProgressCallback = (progress: number, message: string) => void;

export function throwIfErrWithData<T>(
  apiResponse: APIResponseWithData<T>,
): asserts apiResponse is { success: true; data: T } {
  if (apiResponse.success === false) {
    throw new Error(apiResponse.err);
  }
}

export function throwIfErrNoData(
  apiResponse: APIResponseNoData,
): asserts apiResponse is { success: true } {
  if (apiResponse.success === false) {
    throw new Error(apiResponse.err);
  }
}

// ============================================================================
// Instance Configuration Types
// ============================================================================

export type InstanceLanguage = "en" | "fr";
export type InstanceCalendar = "gregorian" | "ethiopian";

export type InstanceMeta = {
  instanceName: string;
  instanceRedirectUrl: string;
  instanceLanguage: InstanceLanguage;
  instanceCalendar: InstanceCalendar;
  openAccess: boolean;
  serverVersion: string;
  adminVersion: string;
  startTime: string;
  currentTime: string;
  uptimeMs: number;
  environment: string;
  databaseFolder: string;
  isHealthy: boolean;
};

export type InstanceDetail = {
  instanceId: string;
  instanceName: string;
  maxAdminArea: number;
  countryIso3: string | undefined;
  facilityColumns: InstanceConfigFacilityColumns;
  structure:
    | {
        adminArea1s: number;
        adminArea2s: number;
        adminArea3s: number;
        adminArea4s: number;
        facilities: number;
      }
    | undefined;
  structureUploadAttempt: StructureUploadAttemptDetail | undefined;
  structureLastUpdated?: string;
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
  };
  assets: AssetInfo[];
  datasetsWithData: DatasetType[];
  datasetVersions: {
    hmis?: number;
    hfa?: number;
  };
  projects: ProjectSummary[];
  users: OtherUser[];
  cacheVersions: {
    indicatorMappings: string;
    facilities: string | undefined;
    adminAreas: string | undefined;
    projects: string | undefined;
    datasets: string | undefined;
    modules: string | undefined;
    users: string | undefined;
  };
};

export type InstanceConfigMaxAdminArea = {
  maxAdminArea: number;
};

export type InstanceConfigCountryIso3 = {
  countryIso3: string | undefined;
};

export type InstanceConfigFacilityColumns = {
  includeNames: boolean;
  includeTypes: boolean;
  includeOwnership: boolean;
  includeCustom1: boolean;
  includeCustom2: boolean;
  includeCustom3: boolean;
  includeCustom4: boolean;
  includeCustom5: boolean;
  labelNames?: string;
  labelTypes?: string;
  labelOwnership?: string;
  labelCustom1?: string;
  labelCustom2?: string;
  labelCustom3?: string;
  labelCustom4?: string;
  labelCustom5?: string;
};

export type OptionalFacilityColumn =
  | "facility_name"
  | "facility_type"
  | "facility_ownership"
  | "facility_custom_1"
  | "facility_custom_2"
  | "facility_custom_3"
  | "facility_custom_4"
  | "facility_custom_5";

export const _OPTIONAL_FACILITY_COLUMNS: OptionalFacilityColumn[] = [
  "facility_name",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
];

export type AdminAreaColumn =
  | "admin_area_1"
  | "admin_area_2"
  | "admin_area_3"
  | "admin_area_4";

// Helper to get list of enabled optional facility columns
export function getEnabledOptionalFacilityColumns(
  config: InstanceConfigFacilityColumns,
): OptionalFacilityColumn[] {
  const columns: OptionalFacilityColumn[] = [];
  if (config.includeNames) columns.push("facility_name");
  if (config.includeTypes) columns.push("facility_type");
  if (config.includeOwnership) columns.push("facility_ownership");
  if (config.includeCustom1) columns.push("facility_custom_1");
  if (config.includeCustom2) columns.push("facility_custom_2");
  if (config.includeCustom3) columns.push("facility_custom_3");
  if (config.includeCustom4) columns.push("facility_custom_4");
  if (config.includeCustom5) columns.push("facility_custom_5");
  return columns;
}

// ============================================================================
// User Types
// ============================================================================

export type GlobalUser = {
  instanceName: string;
  instanceLanguage: InstanceLanguage;
  instanceCalendar: InstanceCalendar;
  openAccess: boolean;
  email: string;
  firstName: string;
  lastName: string;
  approved: boolean;
  isGlobalAdmin: boolean;
  thisUserPermissions: UserPermissions;
};

export type ProjectUser = {
  email: string;
  role: ProjectUserRoleType; // delete after implementing new system
  isGlobalAdmin: boolean;
} & ProjectUserPermissions;

export type OtherUser = {
  email: string;
  isGlobalAdmin: boolean;
};

export type UserLog = {
  id: number;
  user_email: string;
  timestamp: Date;
  endpoint: string;
  endpoint_result: string;
  details?: string;
  project_id?: string;
};

// ============================================================================
// Dev/Offline Mode Helpers
// ============================================================================

export function createDevGlobalUser(
  instanceName: string,
  instanceLanguage: InstanceLanguage,
  instanceCalendar: InstanceCalendar,
): GlobalUser {
  return {
    instanceName,
    instanceLanguage,
    instanceCalendar,
    openAccess: false,
    email: "dev@offline.local",
    firstName: "Dev",
    lastName: "User",
    approved: true,
    isGlobalAdmin: true,
    thisUserPermissions: {
      can_configure_users: true,
      can_view_users: true,
      can_view_logs: true,
      can_configure_settings: true,
      can_configure_assets: true,
      can_configure_data: true,
      can_view_data: true,
      can_create_projects: true,
    },
  };
}

export function createDevProjectUser(): ProjectUser {
  return {
    email: "dev@offline.local",
    role: "editor", // deprecated
    isGlobalAdmin: false,
    can_configure_settings: true,
    can_create_backups: true,
    can_restore_backups: true,
    can_configure_modules: true,
    can_run_modules: true,
    can_configure_users: true,
    can_configure_visualizations: true,
    can_view_visualizations: true,
    can_configure_reports: true,
    can_view_reports: true,
    can_configure_slide_decks: true,
    can_view_slide_decks: true,
    can_configure_data: true,
    can_view_data: true,
    can_view_metrics: true,
    can_view_logs: true,
    can_view_script_code: true,
  };
}

export type ProjectUserRole = {
  projectId: string;
  projectLabel: string;
  role: ProjectUserRoleType;
};

export type BatchUser = {
  email: string;
  is_global_admin: string; // CSV will have "true"/"false" as strings
};

// ============================================================================
// Table & Column Types
// ============================================================================

export type TableColumnType = "text" | "integer" | "periodidtype";

export type TableColumnSummary = {
  name: string;
  type: TableColumnType;
};

export type TableColumn = {
  name: string;
  type: TableColumnType;
  primaryKey?: true;
  required?: true;
  foreignKey?: { fkTable: string; fkColumn: string };
};

// ============================================================================
// CSV Import Types
// ============================================================================

export type CsvDetails = {
  fileName: string;
  filePath: string;
  dateUploaded: string;
  headers: string[];
  size: number;
};

export type Mappings = {
  columnMappings: Record<string, string>;
  indicatorUniqueVals: { value: string; label: string }[];
};

export type IndicatorSubMappings = {
  indicatorIdMappings: Record<string, string[]>;
};

export type Conflicts = {
  foreignKeyConflicts: ForeignKeyConflictsForCol[];
  nMissingVals: number;
  nTotalRows: number;
  nGoodRows: number;
};

export type ForeignKeyConflictsForCol = {
  col: string;
  exampleVals: string[];
  nNonMatchingKeys: number;
  nNonMatchingRows: number;
};

export type ConflictDecisions = {
  excludeForeignKeyConflicts: boolean;
  excludeMissingValues: boolean;
};

// ============================================================================
// Items Holder Types
// ============================================================================

export type ItemsHolderDatasetHmisDisplay = {
  rawOrCommonIndicators: IndicatorType;
  facilityColumns: InstanceConfigFacilityColumns;
  versionId: number | undefined;
  indicatorMappingsVersion: string | undefined;
  vizItems: Record<string, string>[];
  periodBounds: PeriodBounds;
  indicatorLabelReplacements: Record<string, string>;
  indicators: { value: string; label: string }[];
  adminArea2s: string[];
  //
  facilityTypes?: string[];
  facilityOwnership?: string[];
};

// export type ItemsHolderDatasetAA2sAndIndicators = {
//   indicatorLabelReplacements: Record<string, string>;
//   indicators: { value: string; label: string }[];
//   adminArea2s: { value: string; label: string }[];
// };

export type ItemsHolderStructure = {
  totalCount: number;
  items: Record<string, string>[];
};

export type ItemsHolderResultsObject =
  | {
      status: "ok";
      totalCount: number;
      items: Record<string, string>[];
    }
  | {
      status: "no_data_available";
    };

export type ItemsHolderPresentationObject = {
  projectId: string;
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
  moduleLastRun: string;
  dateRange: PeriodBounds | undefined;
} & (
  | {
      status: "ok";
      items: Record<string, string>[];
      indicatorLabelReplacements: Record<string, string>;
    }
  | {
      status: "too_many_items";
    }
  | {
      status: "no_data_available";
    }
);
