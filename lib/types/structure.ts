import { z } from "zod";
import type {
  HfaFacilityColumnGroup,
  HfaFacilityIdSample,
  HfaFacilitySource,
  HfaOrphanedScopeArea,
} from "./dataset_hfa_import.ts";
import { CsvDetails, OptionalFacilityColumn } from "./instance.ts";

// Which facility registry: each has its own facilities table and admin area
// tree. HMIS facilities come from the structure import, HFA facilities from
// each round's data import.
export type FacilityFamily = "hmis" | "hfa";

// The admin area levels below the country that data can be held at; the
// family's adminDepth caps which of them an instance uses.
export const ALL_ADMIN_AREA_LEVELS = [2, 3, 4] as const;
export type AdminAreaLevel = (typeof ALL_ADMIN_AREA_LEVELS)[number];
export const adminAreaLevelSchema = z.literal(ALL_ADMIN_AREA_LEVELS);

export function isAdminAreaLevel(value: number): value is AdminAreaLevel {
  return ALL_ADMIN_AREA_LEVELS.some((level) => level === value);
}

export function parseAdminAreaLevel(value: number): AdminAreaLevel {
  if (isAdminAreaLevel(value)) {
    return value;
  }
  throw new Error(`Not an admin area level: ${value}`);
}

// The safe snapshot written to step_1_result once a structure import
// confirms the connection: which stored instance DHIS2 connection (by URL)
// was confirmed at step 1 (structure import is saved-only, no credentials
// are stored per-attempt).
export type StructureDhis2ConnectionSnapshot = {
  url: string;
};

// ============================================================================
// Structure Staging Result Types
// ============================================================================

// Pre-commit safety signal computed at staging: how many of the file's distinct
// facility_ids already exist in the HMIS registry. Optional so an upload
// attempt staged before this field existed still loads. The step-4 UI shows it
// so an ID-system mismatch (0 existing) is visible before committing.
// absentCount: registry facilities not in the file (replace_all deletes them);
// absentWithDataCount: those that still have data, which make replace_all
// refuse.
export type StructureFacilityMatch = {
  totalStaged: number;
  existing: number;
  newCount: number;
  absentCount: number;
  absentWithDataCount: number;
};

export type StructureRecodableColumn = Exclude<
  OptionalFacilityColumn,
  "facility_name"
>;
export const _RECODABLE_FACILITY_COLUMNS: StructureRecodableColumn[] = [
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
];
// column → facility_id → new value. Sparse: a facility with no entry keeps its
// file value.
export type StructureRecodes = Partial<
  Record<StructureRecodableColumn, Record<string, string>>
>;
export type StructureStagedColumnValues = {
  values: { value: string; count: number }[];
  truncated: boolean;
};
export type StructureStagedRecodeRows = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
};

export type StructureStagingResult = {
  stagingTableName: string;
  totalRowsStaged: number;
  invalidRowsSkipped: number;
  adminAreasPreview: {
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
  facilitiesPreview: number;
  validationWarnings?: string[];
  // The columns the file actually staged (= what was mapped). Drive the step-4
  // "these columns will be written" notice. Optional for pre-existing attempts.
  stagedOptionalColumns?: string[];
  stagedAdminAreas?: boolean;
  // Minted fresh at every staging run; the recode save echoes it so a save
  // racing a restage fails loudly. Optional: stored results predate it.
  stagingNonce?: string;
  facilityMatch?: StructureFacilityMatch;
};

// ============================================================================
// Structure Upload Status Types
// ============================================================================

export type StructureUploadAttemptStatus =
  | {
    status: "configuring";
  }
  | {
    status: "importing";
    progress?: number;
  }
  | {
    status: "importing_dhis2";
    progress?: number;
    totalOrgUnits?: number;
    processedOrgUnits?: number;
  }
  | {
    status: "error";
    error: string;
  };

// ============================================================================
// Structure Upload Detail Types
// ============================================================================

export type StructureUploadAttemptDetailInitial = {
  dateStarted: string;
  step: 0;
  status: StructureUploadAttemptStatus;
  sourceType: undefined;
  step1Result: undefined;
  step2Result: undefined;
  step3Result: undefined;
  recodes: undefined;
};

export type StructureUploadAttemptDetailCsv = {
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: StructureUploadAttemptStatus;
  sourceType: "csv";
  // Step 1: CSV upload details
  step1Result: CsvDetails | undefined;
  // Step 2: CSV column mappings
  step2Result: StructureColumnMappings | undefined;
  // Step 3: Staging result
  step3Result: StructureStagingResult | undefined;
  // Review-step value recodes saved for this attempt
  recodes: StructureRecodes | undefined;
};

export type StructureUploadAttemptDetailDhis2 = {
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: StructureUploadAttemptStatus;
  sourceType: "dhis2";
  // Step 1: confirmed DHIS2 connection snapshot (no password)
  step1Result: StructureDhis2ConnectionSnapshot | undefined;
  // Step 2: DHIS2 org unit selection
  step2Result: StructureDhis2OrgUnitSelection | undefined;
  // Step 3: Staging result
  step3Result: StructureStagingResult | undefined;
  // Review-step value recodes saved for this attempt
  recodes: StructureRecodes | undefined;
};

export type StructureUploadAttemptDetail =
  | StructureUploadAttemptDetailInitial
  | StructureUploadAttemptDetailCsv
  | StructureUploadAttemptDetailDhis2;

export type StructureColumnMappings = {
  facility_id: string;
  admin_area_1: string;
  admin_area_2?: string;
  admin_area_3?: string;
  admin_area_4?: string;
  // Optional metadata columns
  facility_name?: string;
  facility_type?: string;
  facility_ownership?: string;
  facility_custom_1?: string;
  facility_custom_2?: string;
  facility_custom_3?: string;
  facility_custom_4?: string;
  facility_custom_5?: string;
};

// ============================================================================
// DHIS2 Import Types
// ============================================================================

export type StructureDhis2OrgUnitSelection = {
  selectedLevels: number[]; // Which DHIS2 levels to import
};

export type StructureDhis2OrgUnitMetadata = {
  levels: Array<{
    level: number;
    name: string;
    displayName: string;
    count: number;
  }>;
  rootOrgUnits: Array<{
    id: string;
    name: string;
    displayName: string;
    level: number;
    childrenCount: number;
  }>;
  summary: {
    totalOrgUnits: number;
    maxLevel: number;
  };
};

// ============================================================================
// HFA Facility Sampling Weights
// ============================================================================

// Import CSV is LONG format: two user-mapped columns (facility_id, weight),
// plus an optional stratum column, one row per facility. The time point is
// chosen in the UI: one time point per import. A blank weight cell = facility
// not in that round's sample; skipped rather than stored (no
// surveyed-but-excluded case exists, so no 0/NULL weights are ever stored). A
// blank stratum cell on a weighted row stores NULL. The EXPORT is wide:
// facility_id, then per time point a column named by its label and, when the
// time point holds any stratum, a "<label> stratum" column after it.
// Coverage is measured against facilities WITH DATA in the round: those are
// the ones that enter the analysis (not-sampled facilities have no data rows
// and need no weight). Partial coverage is the footgun to show.
export type HfaWeightsCoverage = {
  timePoint: string;
  weightCount: number;
  facilitiesWithData: number;
  facilitiesWithDataAndWeight: number;
};

// facilitiesNotInRegistry: the weighted facility ids the HFA registry lacks,
// skipped, in file order.
export type HfaFacilityWeightsImportResult = {
  rowsImported: number;
  rowsSkippedNoWeight: number;
  facilitiesNotInRegistry: HfaFacilityIdSample;
  timePointsCovered: string[];
  // Absent when the import mapped no stratum column.
  strata?: { count: number; rowsWithoutStratum: number };
};

// The three facility-import intents. facility_id is always the match key; the
// columns written are exactly those mapped at step 2 (= the staging table's
// columns), admin areas included.
//   - replace_all:          the file is the registry: upsert the file's rows,
//                           blank unmapped optional columns on matched rows,
//                           delete every facility not in the file; refused
//                           when an absent facility still has data
//   - add_and_update:       add facilities with new IDs, update existing ones
//   - update_existing_only: update existing facilities only; reject any unknown ID
export type StructureIntegrateStrategy =
  | { type: "replace_all" }
  | { type: "add_and_update" }
  | { type: "update_existing_only" };

// Per map (family + level): how many stored geojson feature area_ids no
// longer match any row in that family's admin tree (an import that renamed
// areas orphans them; repairable in the map boundaries editor).
export type GeojsonOrphanedAreaIds = {
  family: FacilityFamily;
  adminAreaLevel: number;
  orphanedCount: number;
};

// Returned to the client after a successful import so step 4 can confirm what
// actually happened (vs. the pre-commit preview). orphanedGeojsonAreaIds and
// duplicateAdminAreaNames are computed after the integrate commits.
export type StructureIntegrateSummary = {
  inserted: number;
  updated: number;
  deleted: number;
  orphanedGeojsonAreaIds?: GeojsonOrphanedAreaIds[];
  duplicateAdminAreaNames?: AdminAreaDuplicateCount[];
};

// Per level: how many leaf names more than one admin area carries after the
// import. Only levels with duplicates are listed.
export type AdminAreaDuplicateCount = {
  adminAreaLevel: number;
  duplicateCount: number;
};

// The facilities page's HFA registry: each facility's admin areas at the HFA
// depth (level 1 first), its enabled columns ("" for an empty cell), and who
// set each value, by column group.
export type HfaRegistryFacility = {
  facilityId: string;
  admin: string[];
  optional: Partial<Record<OptionalFacilityColumn, string>>;
  sources: Partial<Record<HfaFacilityColumnGroup, HfaFacilitySource>>;
};

// What a save on the facilities page did: the facilities it changed or
// removed, and the map areas and scope areas it left matching no admin area.
export type HfaRegistrySaveResult = {
  nChanged: number;
  orphanedGeojsonAreaIds: GeojsonOrphanedAreaIds[];
  orphanedScopeAreas: HfaOrphanedScopeArea[];
};
