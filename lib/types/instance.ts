import { z } from "zod";
import type { GeoJsonMapSummary } from "./geojson_maps.ts";
import type { DatasetType } from "./datasets.ts";
import type {
  IndicatorMetadata,
  IndicatorMetadataDisplay,
} from "./indicators.ts";
import type { HfaWeightsCoverage } from "./structure.ts";
import type { JsonArrayItem } from "./_figure_bundle.ts";
import {
  GenericLongFormFetchConfig,
  PeriodBounds,
} from "./presentation_objects.ts";
import type { Language } from "../translate/types.ts";

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
  // The instance-level copilot grounding text; "" when unset.
  aiContext: string;
  // The stored DHIS2 connection's URL, or null when none is configured. Rides
  // the instance payload (and the config SSE) rather than being fetched per
  // page view: the Data page shows it as at-a-glance state.
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
    hmisIndicators: number;
    hfaIndicators: number;
  };
  geojsonMaps: GeoJsonMapSummary[];
  datasetsWithData: DatasetType[];
  datasetVersions: {
    hmis?: number;
    hfa?: number;
  };
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
// carried there: nothing on the manifest read path consumes it).
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
// row presence carries no meaning: behaviour gates key off the family
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
// Same pattern as prepareModuleDefinitionForStorage: the narrowing is a
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

type IncludeFlagKey = {
  [K in keyof StructureColumns]-?: StructureColumns[K] extends boolean ? K
    : never;
}[keyof StructureColumns];
type LabelKey = Exclude<keyof StructureColumns, IncludeFlagKey>;

export const OPTIONAL_FACILITY_COLUMN_KEYS: Record<
  OptionalFacilityColumn,
  { include: IncludeFlagKey; label: LabelKey }
> = {
  facility_name: { include: "includeNames", label: "labelNames" },
  facility_type: { include: "includeTypes", label: "labelTypes" },
  facility_ownership: { include: "includeOwnership", label: "labelOwnership" },
  facility_custom_1: { include: "includeCustom1", label: "labelCustom1" },
  facility_custom_2: { include: "includeCustom2", label: "labelCustom2" },
  facility_custom_3: { include: "includeCustom3", label: "labelCustom3" },
  facility_custom_4: { include: "includeCustom4", label: "labelCustom4" },
  facility_custom_5: { include: "includeCustom5", label: "labelCustom5" },
};

export const CUSTOM_FACILITY_COLUMNS: OptionalFacilityColumn[] = [
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
];

export function getEnabledOptionalFacilityColumns(
  config: StructureColumns,
): OptionalFacilityColumn[] {
  return _OPTIONAL_FACILITY_COLUMNS.filter((column) =>
    config[OPTIONAL_FACILITY_COLUMN_KEYS[column].include]
  );
}

// The schema with the given columns switched on. A label is written only for
// a column being switched on here, so an existing label is never overwritten.
export function withOptionalFacilityColumnsEnabled<T extends StructureColumns>(
  schema: T,
  columns: { column: OptionalFacilityColumn; label?: string }[],
): T {
  const next = { ...schema };
  for (const { column, label } of columns) {
    const keys = OPTIONAL_FACILITY_COLUMN_KEYS[column];
    if (next[keys.include]) continue;
    next[keys.include] = true;
    if (label) next[keys.label] = label;
  }
  return next;
}

// Canonical string representation for staleness comparison: the include
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

/** Per-instance outcome of a fleet-wide email rename
 *  (renameUserEmailEverywhere). "pending" appears only in dry runs. */
export type RenameEmailInstanceResult = {
  id: string;
  status: "pending" | "updated" | "conflict" | "failed" | "unreachable";
  error?: string;
};

export type PersonalAccessTokenSummary = {
  id: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type UserLastActive = {
  email: string;
  lastActive: string;
};

export type UserLogAggregate = {
  id: number;
  user_email: string;
  endpoint: string;
  endpoint_result: string;
  week_start: Date;
  count: number;
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
  structureSchema: StructureSchema;
  versionId: number | undefined;
  indicatorsVersion: string | undefined;
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
    // The immutable run this payload was served from: the cache identity and
    // the figure's provenance.
    runId: string;
    // The scope the payload was computed under (scopeToken): folded into
    // cache versions beside runId.
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
