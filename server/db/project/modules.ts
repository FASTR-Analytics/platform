import { Sql } from "postgres";
import {
  APIResponseNoData,
  ModuleDefinitionDetail,
  parseInstalledModuleDefinition,
  parseJsonOrThrow,
  moduleDefinitionInstalledSchema,
  type ModuleConfigSelections,
} from "lib";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBModule } from "./_project_database_types.ts";

export function parseModuleConfigSelections(json: string): ModuleConfigSelections {
  const raw = parseJsonOrThrow<Record<string, unknown>>(json);
  return {
    parameterDefinitions: (raw.parameterDefinitions ?? []) as ModuleConfigSelections["parameterDefinitions"],
    parameterSelections: (raw.parameterSelections ?? {}) as ModuleConfigSelections["parameterSelections"],
  };
}

// The installed (monolingual) definition blob: metrics live in their own
// table / manifest array, never inside the blob.
export function prepareModuleDefinitionForStorage(
  mod: ModuleDefinitionDetail,
): string {
  const { metrics: _, ...rest } = mod;
  return JSON.stringify(moduleDefinitionInstalledSchema.parse(rest));
}

// presentation_objects.metric_id has no FK, so a PO whose metric no longer
// exists in this project is dead — purge after any operation that removes
// metrics rows (today only the boot sweep's uninstall).
async function purgeOrphanedPresentationObjects(sql: Sql): Promise<void> {
  await sql`
DELETE FROM presentation_objects
WHERE metric_id NOT IN (SELECT id FROM metrics)
`;
}

//////////////////////////////////////////////////////////////////////////////
//  __    __            __                        __                __  __  //
// /  |  /  |          /  |                      /  |              /  |/  | //
// $$ |  $$ | _______  $$/  _______    _______  _$$ |_     ______  $$ |$$ | //
// $$ |  $$ |/       \ /  |/       \  /       |/ $$   |   /      \ $$ |$$ | //
// $$ |  $$ |$$$$$$$  |$$ |$$$$$$$  |/$$$$$$$/ $$$$$$/    $$$$$$  |$$ |$$ | //
// $$ |  $$ |$$ |  $$ |$$ |$$ |  $$ |$$      \   $$ | __  /    $$ |$$ |$$ | //
// $$ \__$$ |$$ |  $$ |$$ |$$ |  $$ | $$$$$$  |  $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$    $$/ $$ |  $$ |$$ |$$ |  $$ |/     $$/   $$  $$/ $$    $$ |$$ |$$ | //
//  $$$$$$/  $$/   $$/ $$/ $$/   $$/ $$$$$$$/     $$$$/   $$$$$$$/ $$/ $$/  //
//                                                                          //
//////////////////////////////////////////////////////////////////////////////

export async function uninstallModule(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
SELECT * FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (!rawModule) {
      return { success: true };
    }
    const moduleDefinition = parseInstalledModuleDefinition(
      rawModule.module_definition,
    );
    await projectDb.begin(async (sql: Sql) => {
      await sql`DELETE FROM modules WHERE id = ${moduleId}`;
      for (const resultsObject of moduleDefinition.resultsObjects) {
        const roTableName = getResultsObjectTableName(resultsObject.id);
        await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
      }
      await purgeOrphanedPresentationObjects(sql);
    });
    return { success: true };
  });
}
