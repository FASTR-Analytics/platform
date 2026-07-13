import {
  _LAST_UPDATE_TABLE_NAMES,
  APIResponseWithData,
  LastUpdateTableName,
} from "lib";
import { ProjectPk } from "../server_only_types/mod.ts";

export type ProjectLastUpdatedState = {
  projectLastUpdated: string;
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;
};

// Per-entity last-updated snapshot for the initial SSE payload — the client's
// T2 caches version on these stamps.
export async function getProjectLastUpdatedState(
  ppk: ProjectPk,
): Promise<APIResponseWithData<ProjectLastUpdatedState>> {
  try {
    const state: ProjectLastUpdatedState = {
      projectLastUpdated: new Date().toISOString(),
      lastUpdated: {
        dashboards: {},
        dashboard_items: {},
        datasets: {},
        modules: {},
        presentation_objects: {},
        slide_decks: {},
        slides: {},
        reports: {},
      },
    };

    for (const tableName of _LAST_UPDATE_TABLE_NAMES) {
      if (tableName === "datasets") {
        // Special handling for datasets table which uses dataset_type as primary key
        const rawDatasets = await ppk.projectDb<
          {
            dataset_type: string;
            last_updated: string;
          }[]
        >`
SELECT dataset_type, last_updated FROM datasets
`;
        for (const rawDataset of rawDatasets) {
          state.lastUpdated.datasets[rawDataset.dataset_type] = rawDataset.last_updated;
        }
      } else if (tableName === "modules") {
        const rawItems = await ppk.projectDb<
          {
            id: string;
            presentation_def_updated_at: string | null;
          }[]
        >`
SELECT id, presentation_def_updated_at FROM modules
`;
        for (const rawItem of rawItems) {
          state.lastUpdated[tableName][rawItem.id] = rawItem.presentation_def_updated_at ?? "";
        }
      } else {
        const rawItems = await ppk.projectDb<
          {
            id: string;
            last_updated: string;
          }[]
        >`
SELECT id, last_updated FROM ${ppk.projectDb(tableName)}
`;

        for (const rawItem of rawItems) {
          state.lastUpdated[tableName][rawItem.id] = rawItem.last_updated;
        }
      }
    }

    return { success: true, data: state };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting project last-updated state: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
