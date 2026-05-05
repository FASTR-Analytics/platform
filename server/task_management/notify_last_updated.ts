import { LastUpdateTableName } from "lib";
import { notifyProjectLastUpdatedV2 } from "./notify_project_v2.ts";

export function notifyLastUpdated(
  projectId: string,
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string
) {
  notifyProjectLastUpdatedV2(projectId, tableName, ids, lastUpdated);
}
