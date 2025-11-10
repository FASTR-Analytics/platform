import { DBGlobalLastUpdated } from "../db/mod.ts";
import {
  _LAST_UPDATE_TABLE_NAMES,
  // _ID_FOR_PO_LISTING,
  APIResponseWithData,
  ProjectDirtyStates,
} from "lib";
import { ProjectPk } from "../server_only_types/mod.ts";
// import { getLastUpdatedForPOListing } from "./notify_last_updated.ts";
import {
  getAnyRunningModules,
  getModuleDirtyOrRunning,
} from "./running_tasks_map.ts";

export async function getProjectDirtyStates(
  ppk: ProjectPk
): Promise<APIResponseWithData<ProjectDirtyStates>> {
  try {
    const pds: ProjectDirtyStates = {
      isReady: true,
      projectLastUpdated: new Date().toISOString(),
      anyRunning: false,
      moduleDirtyStates: {},
      anyModuleLastRun: "",
      moduleLastRun: {},
      lastUpdated: {
        datasets: {},
        modules: {},
        presentation_objects: {},
        reports: {},
        report_items: {},
      },
    };

    ///////////////////////
    //                   //
    //    Any running    //
    //                   //
    ///////////////////////

    pds.anyRunning = getAnyRunningModules(ppk.projectId);

    ///////////////////////////////
    //                           //
    //    Module dirty states    //
    //                           //
    ///////////////////////////////

    const rawModules = await ppk.projectDb<
      {
        id: string;
        last_run: string;
        dirty: string;
      }[]
    >`
  SELECT id, last_run, dirty FROM modules
  `;

    for (const rawModule of rawModules) {
      pds.moduleDirtyStates[rawModule.id] = getModuleDirtyOrRunning(
        ppk.projectId,
        rawModule.id,
        rawModule.dirty
      );
    }

    ///////////////////////////////
    //                           //
    //    Any module last run    //
    //                           //
    ///////////////////////////////
    const rawAnyModuleLastRun = (
      await ppk.projectDb<DBGlobalLastUpdated[]>`
SELECT * FROM global_last_updated WHERE id = 'any_module_last_run'
`
    ).at(0);
    pds.anyModuleLastRun =
      rawAnyModuleLastRun?.last_updated ?? "not_yet_any_run";

    ///////////////////////////
    //                       //
    //    Module last run    //
    //                       //
    ///////////////////////////

    for (const rawModule of rawModules) {
      pds.moduleLastRun[rawModule.id] = rawModule.last_run;
    }

    ////////////////////////
    //                    //
    //    Last updates    //
    //                    //
    ////////////////////////

    // pds.lastUpdates[_ID_FOR_PO_LISTING] = getLastUpdatedForPOListing();

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
          pds.lastUpdated.datasets[rawDataset.dataset_type] = rawDataset.last_updated;
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
          pds.lastUpdated[tableName][rawItem.id] = rawItem.last_updated;
        }
      }
    }

    return { success: true, data: pds };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting project dirty states: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
