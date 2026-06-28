import { CsvDetails } from "./instance.ts";
import { Dhis2Credentials } from "./dataset_hmis_import.ts";

// Which facility registry an import targets. Admin areas are shared; each
// family has its own facilities table and its own import flow.
export type FacilityFamily = "hmis" | "hfa";

// ============================================================================
// Structure Staging Result Types
// ============================================================================

// Pre-commit safety signal computed at staging: how many of the file's distinct
// facility_ids already exist in the target family's backbone. Optional so an
// upload attempt staged before this field existed still loads. The step-4 UI
// shows it so an ID-system mismatch (0 existing) is visible before committing.
export type StructureFacilityMatch = {
  totalStaged: number;
  existing: number;
  newCount: number;
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
      status: "complete";
    }
  | {
      status: "error";
      error: string;
    };

// ============================================================================
// Structure Upload Detail Types
// ============================================================================

export type StructureUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  status: StructureUploadAttemptStatus;
};

export type StructureUploadAttemptDetailInitial = {
  id: string;
  dateStarted: string;
  step: 0;
  status: StructureUploadAttemptStatus;
  datasetFamily: FacilityFamily;
  sourceType: undefined;
  step1Result: undefined;
  step2Result: undefined;
  step3Result: undefined;
};

export type StructureUploadAttemptDetailCsv = {
  id: string;
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: StructureUploadAttemptStatus;
  datasetFamily: FacilityFamily;
  sourceType: "csv";
  // Step 1: CSV upload details
  step1Result: CsvDetails | undefined;
  // Step 2: CSV column mappings
  step2Result: StructureColumnMappings | undefined;
  // Step 3: Staging result
  step3Result: StructureStagingResult | undefined;
};

export type StructureUploadAttemptDetailDhis2 = {
  id: string;
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: StructureUploadAttemptStatus;
  datasetFamily: FacilityFamily;
  sourceType: "dhis2";
  // Step 1: DHIS2 credentials (reused from dataset_hmis_import)
  step1Result: Dhis2Credentials | undefined;
  // Step 2: DHIS2 org unit selection
  step2Result: StructureDhis2OrgUnitSelection | undefined;
  // Step 3: Staging result
  step3Result: StructureStagingResult | undefined;
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

// CSV format: facility_id, time_point, weight (one row per facility per time point)
// Coverage is measured against facilities WITH DATA in the round — those are
// the ones that enter the analysis (not-sampled facilities have no data rows
// and need no weight). Partial coverage is the footgun to show.
export type HfaWeightsCoverage = {
  timePoint: string;
  weightCount: number;
  facilitiesWithData: number;
  facilitiesWithDataAndWeight: number;
};

export type HfaFacilityWeightsSummary = {
  totalCount: number;
  perTimePoint: HfaWeightsCoverage[];
};

// Import CSV is WIDE: facility_id, then one column per time point label.
// A blank cell = facility not in that round's sample; skipped rather than
// stored (decided 2026-06-11: no surveyed-but-excluded case exists, so no
// 0/NULL weights are ever stored). Counts below are of weight CELLS.
export type HfaFacilityWeightsImportResult = {
  rowsImported: number;
  rowsSkippedNoWeight: number;
  timePointsCovered: string[];
};

// The three facility-import intents. facility_id is always the match key; the
// columns written are exactly those mapped at step 2 (= the staging table's
// columns), admin areas included. See PLAN_FACILITY_UPDATE_MODES.md.
//   - replace_all:          delete this family's facilities, then add all from the file
//   - add_and_update:       add facilities with new IDs, update existing ones
//   - update_existing_only: update existing facilities only; reject any unknown ID
export type StructureIntegrateStrategy =
  | { type: "replace_all" }
  | { type: "add_and_update" }
  | { type: "update_existing_only" };

// Returned to the client after a successful import so step 4 can confirm what
// actually happened (vs. the pre-commit preview).
export type StructureIntegrateSummary = {
  inserted: number;
  updated: number;
  deleted: number;
};
