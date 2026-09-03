import { z } from "zod";
import { AssetInfo } from "./assets.ts";
import type { GeoJsonMapSummary } from "./geojson_maps.ts";
import type { DatasetType } from "./datasets.ts";
import type {
  IndicatorMetadata,
  IndicatorMetadataDisplay,
  IndicatorType,
} from "./indicators.ts";
import type { ProjectUserPermissions, UserPermissions } from "./permissions.ts";
import type { HfaWeightsCoverage } from "./structure.ts";
import type { JsonArrayItem } from "./_figure_bundle.ts";
import {
  GenericLongFormFetchConfig,
  PeriodBounds,
} from "./presentation_objects.ts";
import { ProjectSummary, ProjectUserRoleType } from "./projects.ts";
import type { Language } from "@timroberton/panther";

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

export const CountryCodes = {
  Nigeria: "NGA",
};

export type InstanceCalendar = "gregorian" | "ethiopian";

// Fiscal-year reporting mode. Orthogonal to InstanceCalendar: it only relabels
// quarterly timeseries axes, and only for gregorian instances. Named rather
// than boolean so a second FY start month (e.g. "october") is a new member here
// instead of a breaking reshape of every call site.
export const ALL_INSTANCE_FISCAL_YEARS = ["none", "july"] as const;

export type InstanceFiscalYear = (typeof ALL_INSTANCE_FISCAL_YEARS)[number];

export type InstanceMeta = {
  instanceName: string;
  instanceLanguage: Language;
  instanceCalendar: InstanceCalendar;
  instanceFiscalYear: InstanceFiscalYear;
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

export type StructureFamilyCounts = {
  adminArea1s: number;
  adminArea2s: number;
  adminArea3s: number;
  adminArea4s: number;
  facilities: number;
};

export type InstanceDetail = {
  instanceId: string;
  instanceName: string;
  countryIso3: string | undefined;
  structureSchemaHmis: StructureSchema | null;
  structureSchemaHfa: StructureSchema | null;
  adminAreaLabels: InstanceConfigAdminAreaLabels;
  // The stored DHIS2 connection's URL, or null when none is configured. Rides
  // the instance payload (and the config SSE) rather than being fetched per
  // page view — the Data page shows it as at-a-glance state.
  dhis2ConnectionUrl: string | null;
  structure:
    | {
      hmis: StructureFamilyCounts;
      hfa: StructureFamilyCounts;
    }
    | undefined;
  structureLastUpdated?: string;
  hfaWeights: HfaWeightsCoverage[];
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
    hfaIndicators: number;
  };
  assets: AssetInfo[];
  geojsonMaps: GeoJsonMapSummary[];
  datasetsWithData: DatasetType[];
  datasetVersions: {
    hmis?: number;
    hfa?: number;
  };
  projects: ProjectSummary[];
  users: OtherUser[];
};

export const instanceConfigAdminAreaLabelsSchema = z.object({
  label1: z.string().optional(),
  label2: z.string().optional(),
  label3: z.string().optional(),
  label4: z.string().optional(),
});
export type InstanceConfigAdminAreaLabels = z.infer<
  typeof instanceConfigAdminAreaLabelsSchema
>;

// The facility-columns portion of a family's structure schema: which optional
// facility columns are enabled, plus their display labels. This is also the
// per-family slot shape in the run manifest (adminDepth is deliberately NOT
// carried there — nothing on the manifest read path consumes it).
export const structureColumnsSchema = z.object({
  includeNames: z.boolean(),
  includeTypes: z.boolean(),
  includeOwnership: z.boolean(),
  includeCustom1: z.boolean(),
  includeCustom2: z.boolean(),
  includeCustom3: z.boolean(),
  includeCustom4: z.boolean(),
  includeCustom5: z.boolean(),
  labelNames: z.string().optional(),
  labelTypes: z.string().optional(),
  labelOwnership: z.string().optional(),
  labelCustom1: z.string().optional(),
  labelCustom2: z.string().optional(),
  labelCustom3: z.string().optional(),
  labelCustom4: z.string().optional(),
  labelCustom5: z.string().optional(),
});
export type StructureColumns = z.infer<typeof structureColumnsSchema>;

// Per-family structure configuration, stored as the instance_config rows
// structure_schema_hmis / structure_schema_hfa. Seeded at instance creation;
// row presence carries no meaning — behaviour gates key off the family
// TABLE's emptiness.
export const structureSchemaSchema = structureColumnsSchema.extend({
  adminDepth: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});
export type StructureSchema = z.infer<typeof structureSchemaSchema>;

// The manifest-slot projection: drops adminDepth EXPLICITLY (nothing on the
// run read path consumes it, so it must not enter run files), then validates.
// Same pattern as prepareModuleDefinitionForStorage — the narrowing is a
// named function, never an implicit schema strip.
export function structureColumnsFromSchema(
  schema: StructureSchema,
): StructureColumns {
  const { adminDepth: _adminDepth, ...columns } = schema;
  return structureColumnsSchema.parse(columns);
}

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
  config: StructureColumns,
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

// Canonical string representation for staleness comparison — the include
// flags ONLY. Labels are display-only and deliberately excluded so a label
// rename never busts a data cache. Fixed key order so server and client
// produce byte-identical output from equal configs.
const _INCLUDE_FLAG_KEYS = [
  "includeNames",
  "includeTypes",
  "includeOwnership",
  "includeCustom1",
  "includeCustom2",
  "includeCustom3",
  "includeCustom4",
  "includeCustom5",
] as const;

export function hashStructureSchema(schema: StructureColumns): string {
  return JSON.stringify(_INCLUDE_FLAG_KEYS.map((k) => [k, schema[k]]));
}

// ============================================================================
// User Types
// ============================================================================

export type GlobalUser = {
  instanceName: string;
  instanceLanguage: Language;
  instanceCalendar: InstanceCalendar;
  instanceFiscalYear: InstanceFiscalYear;
  openAccess: boolean;
  email: string;
  firstName: string;
  lastName: string;
  approved: boolean;
  isGlobalAdmin: boolean;
  thisUserPermissions: UserPermissions;
  unlimitedAi: boolean;
};

export type ProjectUser = {
  email: string;
  role: ProjectUserRoleType; // delete after implementing new system
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
} & ProjectUserPermissions;

export type OtherUser = {
  email: string;
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
  unlimitedAi: boolean;
  isContactPerson: boolean;
} & UserPermissions;

/** Per-instance outcome of a fleet-wide email rename
 *  (renameUserEmailEverywhere). "pending" appears only in dry runs. */
export type RenameEmailInstanceResult = {
  id: string;
  status: "pending" | "updated" | "conflict" | "failed" | "unreachable";
  projectsUpdated?: number;
  projectsFailed?: string[];
  error?: string;
};

export type PersonalAccessTokenSummary = {
  id: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
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

export type UserLogAggregate = {
  id: number;
  user_email: string;
  endpoint: string;
  endpoint_result: string;
  project_id: string | null;
  week_start: Date;
  count: number;
};

// ============================================================================
// Dev/Offline Mode Helpers
// ============================================================================

export function createDevGlobalUser(
  instanceName: string,
  instanceLanguage: Language,
  instanceCalendar: InstanceCalendar,
  instanceFiscalYear: InstanceFiscalYear,
): GlobalUser {
  return {
    instanceName,
    instanceLanguage,
    instanceCalendar,
    instanceFiscalYear,
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
      can_configure_data: true,
      can_view_data: true,
      can_create_projects: true,
    },
    unlimitedAi: false,
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
  structureSchema: StructureSchema;
  versionId: number | undefined;
  indicatorMappingsVersion: string | undefined;
  vizItems: Record<string, string>[];
  periodBounds: PeriodBounds;
  indicatorLabelReplacements: Record<string, string>;
  indicators: { value: string; label: string }[];
  adminArea2s: string[];
  adminArea3s?: { admin_area_3: string; admin_area_2: string }[];
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
    items: JsonArrayItem[];
  }
  | {
    status: "no_data_available";
  };

export type ItemsHolderPresentationObject =
  & {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    // The immutable run this payload was served from — the cache identity
    // (PLAN_RESULTS_RUNS §2.5) and the figure's provenance (ruling 4).
    runId: string;
    // The project scope the payload was computed under (projectScopeToken) —
    // folded into cache versions beside runId (PLAN_1_PROJECT_AA2_SCOPE §4).
    scopeToken: string;
    dateRange: PeriodBounds | undefined;
  }
  & (
    | {
      status: "ok";
      items: JsonArrayItem[];
      // Display fields only: an indicator's evaluation (type, expression,
      // slot map) is a generation fact the server computes values with, and
      // never reaches a client or a stored figure snapshot.
      indicatorMetadata: IndicatorMetadataDisplay[];
    }
    | {
      status: "too_many_items";
    }
    | {
      status: "no_data_available";
    }
  );
