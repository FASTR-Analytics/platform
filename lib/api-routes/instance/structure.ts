import { z } from "zod";
import type {
  CsvDetails,
  FacilityFamily,
  HfaFacilityWeightsImportResult,
  StructureStagedColumnValues,
  StructureStagedRecodeRows,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureDhis2OrgUnitMetadata,
  StructureIntegrateStrategy,
  StructureIntegrateSummary,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

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

const structureRecodableColumnSchema = z.enum([
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
]);
// z.partialRecord, NOT z.record: Zod 4 z.record with an enum key schema is
// exhaustive and rejects sparse/empty payloads.
const structureRecodesSchema = z.partialRecord(
  structureRecodableColumnSchema,
  z.record(z.string(), z.string().trim().min(1)),
);

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
  // Any authenticated user: feeds the project scope picker (area names are
  // not sensitive; counts are already in instanceState). The heavier
  // structure routes require can_view_data — the wrong audience for this.
  listAdminArea2s: route({
    path: "/structure/admin_area_2s",
    method: "GET",
    response: {} as string[],
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
    body: z.object({
      assetFileName: z.string(),
      xlsFormAssetFileName: z.string().optional(),
    }),
  }),
  structureStep1Dhis2_ConfirmConnection: route({
    path: "/structure/step1_dhis2_confirm_connection/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
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
  structureStep3Csv_StageDataStreaming: route({
    path: "/structure/step3_csv_stage_data_streaming/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    isStreaming: true,
  }),
  structureStep3Dhis2_StageDataStreaming: route({
    path: "/structure/step3_dhis2_stage_data_streaming/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    isStreaming: true,
  }),
  // Review step (between staging and import)
  getStructureStagedColumnValues: route({
    path: "/structure/staged_column_values/:family/:column",
    method: "GET",
    params: z.object({
      family: facilityFamilySchema,
      column: structureRecodableColumnSchema,
    }),
    response: {} as StructureStagedColumnValues,
  }),
  getStructureStagedRecodeRows: route({
    path: "/structure/staged_recode_rows/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({
      column: structureRecodableColumnSchema,
      values: z.array(z.string()),
      offset: z.number().int().min(0),
      limit: z.number().int().min(1).max(1000),
      // Encoded CSV header refs (encodeRawCsvHeader) of unmapped file columns
      // to join in per facility as display-only context (CSV sources only)
      csvContextColumns: z.array(z.string()).max(5).optional(),
    }),
    response: {} as StructureStagedRecodeRows,
  }),
  setStructureRecodes: route({
    path: "/structure/set_recodes/:family",
    method: "POST",
    params: z.object({ family: facilityFamilySchema }),
    body: z.object({
      recodes: structureRecodesSchema,
      stagingNonce: z.string(),
    }),
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
