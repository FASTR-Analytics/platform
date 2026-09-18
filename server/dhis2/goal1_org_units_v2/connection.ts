import {
  FetchOptions,
  getDHIS2,
  validateDhis2Connection,
} from "../common/base_fetcher.ts";
import { getOrgUnitLevels } from "./get_metadata.ts";
import type { TranslatableString } from "lib";

// Unvalidated JSON from an external server: every field may be missing or
// null.
type SystemInfoResponse = { version: string | null | undefined };
type OrgUnitCountResponse = {
  pager: { total: number | null | undefined } | null | undefined;
};

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
    const systemInfo = await getDHIS2<SystemInfoResponse>(
      "/api/system/info.json",
      options,
    );

    const testParams = new URLSearchParams();
    testParams.set("fields", "id");
    testParams.set("pageSize", "1");
    testParams.set("page", "1");
    testParams.set("paging", "true");

    const testOrgUnits = await getDHIS2<OrgUnitCountResponse>(
      "/api/organisationUnits.json",
      options,
      testParams,
    );

    const levels = await getOrgUnitLevels(options);

    return {
      success: true,
      message: { en: "Successfully connected to DHIS2", fr: "Connexion à DHIS2 réussie", pt: "Ligação ao DHIS2 estabelecida com sucesso" },
      details: {
        orgUnitCount: testOrgUnits.pager?.total ?? undefined,
        levels: levels.length,
        version: systemInfo.version ?? undefined,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: {
        en: `Failed to connect to DHIS2: ${detail}`,
        fr: `Échec de la connexion à DHIS2 : ${detail}`,
        pt: `Falha na ligação ao DHIS2: ${detail}`,
      },
    };
  }
}
