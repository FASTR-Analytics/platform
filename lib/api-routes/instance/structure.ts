import type {
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureColumnMappings,
  StructureDhis2OrgUnitSelection,
  StructureDhis2OrgUnitMetadata,
  StructureIntegrateStrategy,
  Dhis2Credentials,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const structureRouteRegistry = {
  getStructureItems: route({
    path: "/structure/data",
    method: "GET",
    response: {} as { totalCount: number; items: Record<string, string>[] },
  }),
  deleteAllStructureData: route({
    path: "/structure/data",
    method: "DELETE",
  }),
  //
  addStructureUploadAttempt: route({
    path: "/structure/upload_attempt",
    method: "POST",
  }),
  getStructureUploadAttempt: route({
    path: "/structure/upload_attempt",
    method: "GET",
    response: {} as StructureUploadAttemptDetail,
  }),
  deleteStructureUploadAttempt: route({
    path: "/structure/upload_attempt",
    method: "DELETE",
  }),
  //
  // Step 0: Source Type Selection
  structureStep0_SetSourceType: route({
    path: "/structure/step0_set_source_type",
    method: "POST",
    body: {} as { sourceType: "csv" | "dhis2" },
  }),
  //
  // Step 1: Data Source Configuration
  structureStep1Csv_UploadFile: route({
    path: "/structure/step1_csv_upload_file",
    method: "POST",
    body: {} as { assetFileName: string },
  }),
  structureStep1Dhis2_SetCredentials: route({
    path: "/structure/step1_dhis2_set_credentials",
    method: "POST",
    body: {} as Dhis2Credentials,
  }),
  //
  // Step 2: Mapping/Selection Configuration
  structureStep2Csv_SetColumnMappings: route({
    path: "/structure/step2_csv_set_column_mappings",
    method: "POST",
    body: {} as { columnMappings: StructureColumnMappings },
  }),
  structureStep2Dhis2_GetOrgUnitsMetadata: route({
    path: "/structure/step2_dhis2_get_org_units_metadata",
    method: "GET",
    response: {} as StructureDhis2OrgUnitMetadata,
  }),
  structureStep2Dhis2_SetOrgUnitSelection: route({
    path: "/structure/step2_dhis2_set_org_unit_selection",
    method: "POST",
    body: {} as StructureDhis2OrgUnitSelection,
  }),
  //
  // Step 3 CSV: Stage CSV Data
  structureStep3Csv_StageData: route({
    path: "/structure/step3_csv_stage_data",
    method: "POST",
  }),
  // Step 3 CSV: Stage CSV Data (Streaming)
  structureStep3Csv_StageDataStreaming: route({
    path: "/structure/step3_csv_stage_data_streaming",
    method: "POST",
    isStreaming: true,
  }),
  // Step 3 DHIS2: Stage DHIS2 Data
  structureStep3Dhis2_StageData: route({
    path: "/structure/step3_dhis2_stage_data",
    method: "POST",
  }),
  // Step 3 DHIS2: Stage DHIS2 Data (Streaming)
  structureStep3Dhis2_StageDataStreaming: route({
    path: "/structure/step3_dhis2_stage_data_streaming",
    method: "POST",
    isStreaming: true,
  }),
  //
  // Step 4: Import Data (final integration)
  structureStep4_ImportData: route({
    path: "/structure/step4_import_data",
    method: "POST",
    body: {} as { strategy: StructureIntegrateStrategy },
  }),
  //
  // Status/Monitoring
  getStructureUploadStatus: route({
    path: "/structure/upload_status",
    method: "GET",
    response: {} as {
      isActive: boolean;
      status: StructureUploadAttemptStatus;
    },
  }),
} as const;
