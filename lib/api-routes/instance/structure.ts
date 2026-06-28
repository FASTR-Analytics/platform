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
  StructureIntegrateSummary,
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

const structureIntegrateStrategySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replace_all") }),
  z.object({ type: z.literal("add_and_update") }),
  z.object({ type: z.literal("update_existing_only") }),
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
    path: "/structure/upload_attempt/:family",
    method: "GET",
    params: z.object({ family: facilityFamilySchema }),
    response: {} as StructureUploadAttemptDetail,
  }),
  deleteStructureUploadAttempt: route({
    path: "/structure/upload_attempt/:family",
    method: "DELETE",
    params: z.object({ family: facilityFamilySchema }),
  }),
  // Step 0
  structureStep0_SetSourceType: route({
    path: "/structure/step0_set_source_type/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({ sourceType: z.enum(["csv", "dhis2"]) }),
  }),
  // Step 1
  structureStep1Csv_UploadFile: route({
    path: "/structure/step1_csv_upload_file/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({ assetFileName: z.string() }),
  }),
  structureStep1Dhis2_SetCredentials: route({
    path: "/structure/step1_dhis2_set_credentials/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: dhis2CredentialsSchema,
  }),
  // Step 2
  structureStep2Csv_SetColumnMappings: route({
    path: "/structure/step2_csv_set_column_mappings/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({ columnMappings: structureColumnMappingsSchema }),
  }),
  structureStep2Dhis2_GetOrgUnitsMetadata: route({
    path: "/structure/step2_dhis2_get_org_units_metadata/:family",
    method: "GET",
    params: z.object({ family: facilityFamilySchema }),
    response: {} as StructureDhis2OrgUnitMetadata,
  }),
  structureStep2Dhis2_SetOrgUnitSelection: route({
    path: "/structure/step2_dhis2_set_org_unit_selection/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({ selectedLevels: z.array(z.number()) }),
  }),
  // Step 3
  structureStep3Csv_StageData: route({
    path: "/structure/step3_csv_stage_data/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
  }),
  structureStep3Csv_StageDataStreaming: route({
    path: "/structure/step3_csv_stage_data_streaming/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    isStreaming: true,
  }),
  structureStep3Dhis2_StageData: route({
    path: "/structure/step3_dhis2_stage_data/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    timeoutMs: 600000,
  }),
  structureStep3Dhis2_StageDataStreaming: route({
    path: "/structure/step3_dhis2_stage_data_streaming/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    isStreaming: true,
  }),
  // Step 4
  structureStep4_ImportData: route({
    path: "/structure/step4_import_data/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({ strategy: structureIntegrateStrategySchema }),
    response: {} as StructureIntegrateSummary,
  }),
  // Status
  getStructureUploadStatus: route({
    path: "/structure/upload_status/:family",
    method: "GET",
    params: z.object({ family: facilityFamilySchema }),
    response: {} as {
      isActive: boolean;
      status: StructureUploadAttemptStatus;
    },
  }),
} as const;
