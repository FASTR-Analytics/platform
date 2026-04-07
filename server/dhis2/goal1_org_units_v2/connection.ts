import {
  getDHIS2,
  FetchOptions,
  validateDhis2Connection,
} from "../common/base_fetcher.ts";
import { DHIS2PagedResponse, DHIS2OrgUnit } from "./types.ts";
import { getOrgUnitLevels } from "./get_metadata.ts";
import type { TranslatableString } from "lib";

export async function testDHIS2Connection(
  options: FetchOptions,
): Promise<{
  success: boolean;
  message: TranslatableString;
  details?: {
    orgUnitCount?: number;
    levels?: number;
    version?: string;
  };
}> {
  const validation = await validateDhis2Connection(options.dhis2Credentials);
  if (!validation.valid) {
    return { success: false, message: validation.message };
  }

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
      testParams,
    );

    const levels = await getOrgUnitLevels(options);

    return {
      success: true,
      message: { en: "Successfully connected to DHIS2", fr: "Connexion à DHIS2 réussie" },
      details: {
        orgUnitCount: testOrgUnits.pager?.total,
        levels: levels.length,
        version: systemInfo.version,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: {
        en: `Failed to connect to DHIS2: ${detail}`,
        fr: `Échec de la connexion à DHIS2 : ${detail}`,
      },
    };
  }
}