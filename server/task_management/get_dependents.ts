import { Sql } from "postgres";
import {
  ModuleDefinition,
  parseJsonOrThrow,
  type DatasetType,
} from "lib";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __                                      __                                                __                                                  //
// /  \  /  |                                    /  |                                              /  |                                                 //
// $$  \ $$ |  ______   __   __   __         ____$$ |  ______   __   __   __  _______    _______  _$$ |_     ______    ______    ______   _____  ____   //
// $$$  \$$ | /      \ /  | /  | /  |       /    $$ | /      \ /  | /  | /  |/       \  /       |/ $$   |   /      \  /      \  /      \ /     \/    \  //
// $$$$  $$ |/$$$$$$  |$$ | $$ | $$ |      /$$$$$$$ |/$$$$$$  |$$ | $$ | $$ |$$$$$$$  |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  | $$$$$$  |$$$$$$ $$$$  | //
// $$ $$ $$ |$$    $$ |$$ | $$ | $$ |      $$ |  $$ |$$ |  $$ |$$ | $$ | $$ |$$ |  $$ |$$      \   $$ | __ $$ |  $$/ $$    $$ | /    $$ |$$ | $$ | $$ | //
// $$ |$$$$ |$$$$$$$$/ $$ \_$$ \_$$ |      $$ \__$$ |$$ \__$$ |$$ \_$$ \_$$ |$$ |  $$ | $$$$$$  |  $$ |/  |$$ |      $$$$$$$$/ /$$$$$$$ |$$ | $$ | $$ | //
// $$ | $$$ |$$       |$$   $$   $$/       $$    $$ |$$    $$/ $$   $$   $$/ $$ |  $$ |/     $$/   $$  $$/ $$ |      $$       |$$    $$ |$$ | $$ | $$ | //
// $$/   $$/  $$$$$$$/  $$$$$/$$$$/         $$$$$$$/  $$$$$$/   $$$$$/$$$$/  $$/   $$/ $$$$$$$/     $$$$/  $$/        $$$$$$$/  $$$$$$$/ $$/  $$/  $$/  //
//                                                                                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function addModulesThatDependOnDataset(
  projectDb: Sql,
  datasetType: DatasetType,
  dependents: string[]
) {
  const rawModules = await projectDb<
    {
      id: string;
      module_definition: string;
    }[]
  >`SELECT id, module_definition FROM modules`;

  for (const rawModule of rawModules) {
    const modDef = parseJsonOrThrow<ModuleDefinition>(
      rawModule.module_definition
    );
    for (const ds of modDef.dataSources) {
      if (ds.sourceType === "dataset" && ds.datasetType === datasetType) {
        if (!dependents.includes(rawModule.id)) {
          dependents.push(rawModule.id);
          await addOtherModulesThatDependOnModule(
            projectDb,
            rawModule.id,
            dependents
          );
        }
        break;
      }
    }
  }
}

export async function addOtherModulesThatDependOnModule(
  projectDb: Sql,
  moduleId: string,
  dependents: string[]
) {
  const rawModules = await projectDb<
    { id: string; module_definition: string }[]
  >`
SELECT id, module_definition FROM modules
WHERE id != ${moduleId}
`;
  for (const rawModule of rawModules) {
    const modDef = parseJsonOrThrow<ModuleDefinition>(
      rawModule.module_definition
    );
    for (const ds of modDef.dataSources) {
      if (ds.sourceType === "results_object" && ds.moduleId === moduleId) {
        if (!dependents.includes(rawModule.id)) {
          dependents.push(rawModule.id);
          await addOtherModulesThatDependOnModule(
            projectDb,
            rawModule.id,
            dependents
          );
        }
      }
    }
  }
}

export async function getPresentationObjectsThatDependOnModule(
  projectDb: Sql,
  moduleId: string
): Promise<string[]> {
  // Join through metrics to find presentation objects for this module
  return (
    await projectDb<{ id: string }[]>`
SELECT po.id
FROM presentation_objects po
JOIN metrics m ON po.metric_id = m.id
WHERE m.module_id = ${moduleId}
`
  ).map((rawPresObj) => rawPresObj.id);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __                                                                __                                                  //
// /  \  /  |                                                              /  |                                                 //
// $$  \ $$ |  ______   __   __   __        __    __   ______    _______  _$$ |_     ______    ______    ______   _____  ____   //
// $$$  \$$ | /      \ /  | /  | /  |      /  |  /  | /      \  /       |/ $$   |   /      \  /      \  /      \ /     \/    \  //
// $$$$  $$ |/$$$$$$  |$$ | $$ | $$ |      $$ |  $$ |/$$$$$$  |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  | $$$$$$  |$$$$$$ $$$$  | //
// $$ $$ $$ |$$    $$ |$$ | $$ | $$ |      $$ |  $$ |$$ |  $$ |$$      \   $$ | __ $$ |  $$/ $$    $$ | /    $$ |$$ | $$ | $$ | //
// $$ |$$$$ |$$$$$$$$/ $$ \_$$ \_$$ |      $$ \__$$ |$$ |__$$ | $$$$$$  |  $$ |/  |$$ |      $$$$$$$$/ /$$$$$$$ |$$ | $$ | $$ | //
// $$ | $$$ |$$       |$$   $$   $$/       $$    $$/ $$    $$/ /     $$/   $$  $$/ $$ |      $$       |$$    $$ |$$ | $$ | $$ | //
// $$/   $$/  $$$$$$$/  $$$$$/$$$$/         $$$$$$/  $$$$$$$/  $$$$$$$/     $$$$/  $$/        $$$$$$$/  $$$$$$$/ $$/  $$/  $$/  //
//                                                   $$ |                                                                       //
//                                                   $$ |                                                                       //
//                                                   $$/                                                                        //
//                                                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function areUpstreamDependenciesOfModuleAllReady(
  projectDb: Sql,
  moduleId: string
): Promise<boolean> {
  const thisMod = (
    await projectDb<{ module_definition: string }[]>`
SELECT module_definition FROM modules
WHERE id = ${moduleId}
`
  ).at(0);
  if (!thisMod) {
    throw new Error("Should not be possible");
  }
  const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
    thisMod.module_definition
  );
  const datasetDataSources: DatasetType[] = [];
  const resultsObjectDataSources: string[] = [];
  for (const ds of moduleDefinition.dataSources) {
    if (ds.sourceType === "dataset") {
      datasetDataSources.push(ds.datasetType);
    }
    if (ds.sourceType === "results_object") {
      resultsObjectDataSources.push(ds.resultsObjectId);
    }
  }
  // Datasets
  for (const datasetType of datasetDataSources) {
    const rawDataset = (
      await projectDb<{ dataset_type: string }[]>`
SELECT dataset_type FROM datasets
WHERE dataset_type = ${datasetType}
`
    ).at(0);
    if (!rawDataset) {
      return false;
    }
  }
  // Check if modules that produce the required results objects are ready
  if (resultsObjectDataSources.length > 0) {
    const upstreamModules = await projectDb<{ module_id: string; dirty: string }[]>`
      SELECT DISTINCT ro.module_id, m.dirty
      FROM results_objects ro
      JOIN modules m ON m.id = ro.module_id
      WHERE ro.id IN ${projectDb(resultsObjectDataSources)}
      AND ro.module_id != ${moduleId}
    `;
    for (const upstream of upstreamModules) {
      if (upstream.dirty !== "ready") {
        return false;
      }
    }
  }

  return true;
}
