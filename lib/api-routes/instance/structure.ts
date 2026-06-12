import { z } from "zod";
import type {
  CsvDetails,
  FacilityFamily,
  HfaFacilityWeightsImportResult,
  HfaFacilityWeightsSummary,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureDhis2OrgUnitMetadata,
  StructureIntegrateStrategy,
  Dhis2Credentials,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

const facilityFamilySchema = z.enum(["hmis", "hfa"]);

const structureColumnMappingsSchema = z.object({
  facility_id: z.string(),
  admin_area_1: z.string(),
  admin_area_2: z.string().optional(),
  admin_area_3: z.string().optional(),
  admin_area_4: z.string().optional(),
  facility_name: z.string().optional(),
  facility_type: z.string().optional(),
  facility_ownership: z.string().optional(),
  facility_custom_1: z.string().optional(),
  facility_custom_2: z.string().optional(),
  facility_custom_3: z.string().optional(),
  facility_custom_4: z.string().optional(),
  facility_custom_5: z.string().optional(),
});

const selectableColumnSchema = z.enum([
  "all_admin_areas",
  "facility_name",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
]);

const structureIntegrateStrategySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("first_delete_all_then_add_all") }),
  z.object({ type: z.literal("add_all_and_update_all_as_needed") }),
  z.object({ type: z.literal("add_all_new_rows_and_ignore_conflicts") }),
  z.object({ type: z.literal("add_all_new_rows_and_error_if_any_conflicts") }),
  z.object({ type: z.literal("only_update_optional_facility_cols_by_existing_facility_id") }),
  z.object({
    type: z.literal("only_update_selected_cols_by_existing_facility_id"),
    selectedColumns: z.array(selectableColumnSchema),
  }),
]);

export const structureRouteRegistry = {
  getStructureItems: route({
    path: "/structure/data/:family",
    method: "GET",
    params: z.object({ family: facilityFamilySchema }),
    response: {} as { totalCount: number; items: Record<string, string>[] },
  }),
  deleteAllStructureData: route({
    path: "/structure/data",
    method: "DELETE",
  }),
  deleteFamilyFacilities: route({
    path: "/structure/facilities/:family",
    method: "DELETE",
    params: z.object({ family: facilityFamilySchema }),
  }),
  // HFA facility sampling weights
  getHfaFacilityWeightsSummary: route({
    path: "/structure/hfa_facility_weights",
    method: "GET",
    response: {} as HfaFacilityWeightsSummary,
  }),
  getHfaFacilityWeightsItems: route({
    path: "/structure/hfa_facility_weights/items",
    method: "GET",
    response: {} as { totalCount: number; headers: string[]; items: Record<string, string>[] },
  }),
  readWeightsCsvHeaders: route({
    path: "/structure/hfa_facility_weights/read_headers",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
    response: {} as CsvDetails,
  }),
  importHfaFacilityWeights: route({
    path: "/structure/hfa_facility_weights/import",
    method: "POST",
    body: z.object({
      assetFileName: z.string(),
      facilityIdColumn: z.string(),
      weightColumn: z.string(),
      timePoint: z.string(),
    }),
    response: {} as HfaFacilityWeightsImportResult,
  }),
  deleteHfaFacilityWeightsForTimePoint: route({
    path: "/structure/hfa_facility_weights/time_point",
    method: "DELETE",
    body: z.object({ timePoint: z.string() }),
  }),
  deleteAllHfaFacilityWeights: route({
    path: "/structure/hfa_facility_weights",
    method: "DELETE",
  }),
  addStructureUploadAttempt: route({
    path: "/structure/upload_attempt",
    method: "POST",
    body: z.object({ datasetFamily: facilityFamilySchema }),
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
  // Step 0
  structureStep0_SetSourceType: route({
    path: "/structure/step0_set_source_type",
    method: "POST",
    body: z.object({ sourceType: z.enum(["csv", "dhis2"]) }),
  }),
  // Step 1
  structureStep1Csv_UploadFile: route({
    path: "/structure/step1_csv_upload_file",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
  }),
  structureStep1Dhis2_SetCredentials: route({
    path: "/structure/step1_dhis2_set_credentials",
    method: "POST",
    body: dhis2CredentialsSchema,
  }),
  // Step 2
  structureStep2Csv_SetColumnMappings: route({
    path: "/structure/step2_csv_set_column_mappings",
    method: "POST",
    body: z.object({ columnMappings: structureColumnMappingsSchema }),
  }),
  structureStep2Dhis2_GetOrgUnitsMetadata: route({
    path: "/structure/step2_dhis2_get_org_units_metadata",
    method: "GET",
    response: {} as StructureDhis2OrgUnitMetadata,
  }),
  structureStep2Dhis2_SetOrgUnitSelection: route({
    path: "/structure/step2_dhis2_set_org_unit_selection",
    method: "POST",
    body: z.object({ selectedLevels: z.array(z.number()) }),
  }),
  // Step 3
  structureStep3Csv_StageData: route({
    path: "/structure/step3_csv_stage_data",
    method: "POST",
  }),
  structureStep3Csv_StageDataStreaming: route({
    path: "/structure/step3_csv_stage_data_streaming",
    method: "POST",
    isStreaming: true,
  }),
  structureStep3Dhis2_StageData: route({
    path: "/structure/step3_dhis2_stage_data",
    method: "POST",
    timeoutMs: 600000,
  }),
  structureStep3Dhis2_StageDataStreaming: route({
    path: "/structure/step3_dhis2_stage_data_streaming",
    method: "POST",
    isStreaming: true,
  }),
  // Step 4
  structureStep4_ImportData: route({
    path: "/structure/step4_import_data",
    method: "POST",
    body: z.object({ strategy: structureIntegrateStrategySchema }),
  }),
  // Status
  getStructureUploadStatus: route({
    path: "/structure/upload_status",
    method: "GET",
    response: {} as {
      isActive: boolean;
      status: StructureUploadAttemptStatus;
    },
  }),
} as const;
