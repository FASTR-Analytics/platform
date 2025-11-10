import { CsvDetails, OptionalFacilityColumn } from "./instance.ts";
import { Dhis2Credentials } from "./dataset_hmis_import.ts";

// ============================================================================
// Structure Staging Result Types
// ============================================================================

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
  orgUnitGroups: Array<{
    id: string;
    name: string;
    displayName: string;
    count: number;
  }>;
  rootOrgUnits: Array<{
    id: string;
    name: string;
    displayName: string;
    childrenCount: number;
  }>;
  summary: {
    totalOrgUnits: number;
    facilityCount: number;
    maxLevel: number;
  };
};

// Column type for selective updates
export type SelectableColumn = "all_admin_areas" | OptionalFacilityColumn;

export type StructureIntegrateStrategy =
  | { type: "first_delete_all_then_add_all" }
  | { type: "add_all_and_update_all_as_needed" }
  | { type: "add_all_new_rows_and_ignore_conflicts" }
  | { type: "add_all_new_rows_and_error_if_any_conflicts" }
  | { type: "only_update_optional_facility_cols_by_existing_facility_id" }
  | {
      type: "only_update_selected_cols_by_existing_facility_id";
      selectedColumns: SelectableColumn[];
    };
