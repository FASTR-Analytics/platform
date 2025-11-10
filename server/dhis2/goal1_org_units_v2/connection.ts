import { getDHIS2, FetchOptions } from "../common/base_fetcher.ts";
import { DHIS2PagedResponse, DHIS2OrgUnit, DHIS2OrgUnitLevel } from "./types.ts";

export async function getOrgUnitLevelsFromDHIS2(
  options: FetchOptions
): Promise<DHIS2OrgUnitLevel[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName,level");
  params.set("paging", "false");

  const response = await getDHIS2<{
    organisationUnitLevels: DHIS2OrgUnitLevel[];
  }>("/api/organisationUnitLevels.json", options, params);

  return response.organisationUnitLevels || [];
}

export async function testDHIS2Connection(
  options: FetchOptions
): Promise<{
  success: boolean;
  message: string;
  details?: {
    orgUnitCount?: number;
    levels?: number;
    version?: string;
  };
}> {
  try {
    const systemInfo = await getDHIS2<{
      version?: string;
      revision?: string;
      systemName?: string;
    }>("/api/system/info.json", options);

    const testParams = new URLSearchParams();
    testParams.set("fields", "id");
    testParams.set("pageSize", "1");
    testParams.set("page", "1");
    testParams.set("paging", "true");
    
    const testOrgUnits = await getDHIS2<DHIS2PagedResponse<DHIS2OrgUnit>>(
      "/api/organisationUnits.json",
      options,
      testParams
    );

    const levels = await getOrgUnitLevelsFromDHIS2(options);

    return {
      success: true,
      message: "Successfully connected to DHIS2",
      details: {
        orgUnitCount: testOrgUnits.pager?.total,
        levels: levels.length,
        version: systemInfo.version,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to connect to DHIS2: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}