import { getDHIS2, FetchOptions } from "../common/base_fetcher.ts";
import { DHIS2PagedResponse, DHIS2OrgUnit } from "./types.ts";
import { getOrgUnitLevels } from "./get_metadata.ts";

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

    const levels = await getOrgUnitLevels(options);

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