import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type ItemsHolderResultsObject,
} from "lib";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../utils.ts";

export async function getResultsObjectItems(
  projectDb: Sql,
  resultsObjectId: string,
  limit: number | undefined
): Promise<APIResponseWithData<ItemsHolderResultsObject>> {
  return await tryCatchDatabaseAsync(async () => {
    const tableName = getResultsObjectTableName(resultsObjectId);
    const rawCount = (
      await projectDb<{ total_count: number }[]>`
SELECT count(*) AS total_count FROM ${projectDb(tableName)}
`
    ).at(0);
    assertNotUndefined(rawCount);
    const rawItems = await projectDb<Record<string, string>[]>`
SELECT * FROM ${projectDb(tableName)}
${limit ? projectDb` LIMIT ${limit}` : projectDb``}
`;

    if (rawItems.length === 0) {
      const ih: ItemsHolderResultsObject = {
        status: "no_data_available",
      };
      return { success: true, data: ih };
    }

    const ih: ItemsHolderResultsObject = {
      status: "ok",
      totalCount: rawCount.total_count,
      items: rawItems,
    };
    return { success: true, data: ih };
  });
}
