import type { DatasetHmisVersion } from "lib";
import { serverActions } from "~/server_actions";

// The History→version navigation that replaced the "View previous imports"
// entry point (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase D): a run detail's
// Version row opens the version's import information directly. The versions
// table and the ImportInformation view itself are unchanged — runs are
// operations, versions are outcomes, never merged.
export async function fetchDatasetHmisVersion(
  versionId: number,
): Promise<DatasetHmisVersion | undefined> {
  const res = await serverActions.getDatasetHmisVersions({});
  if (!res.success) {
    return undefined;
  }
  return res.data.find((v) => v.id === versionId);
}
