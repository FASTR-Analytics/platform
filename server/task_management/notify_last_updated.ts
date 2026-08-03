import { LastUpdateTableName } from "lib";
import { notifyProjectV2 } from "./notify_project_v2.ts";

export function notifyLastUpdated(
  projectId: string,
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string
) {
  notifyProjectV2(projectId, {
    type: "last_updated",
    data: { tableName, ids, lastUpdated },
  });
}
