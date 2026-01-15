import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  APIResponseWithData,
  AiSlideDeckReportConfig,
  AiSlideDeckSlide,
  getStartingConfigForAiSlideDeck,
  getStartingConfigForLongFormReport,
  getStartingConfigForReport,
  getStartingConfigForReportItem,
  LongFormReportConfig,
  parseJsonOrThrow,
  ReportConfig,
  ReportItemConfig,
  ReportSummary,
  ReportType,
  throwIfErrWithData,
  type APIResponseNoData,
  type ReportDetail,
  type ReportItem,
} from "lib";
import { DBReport, type DBReportItem } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { getPgConnectionFromCacheOrNew } from "../postgres/mod.ts";
import { getAllPresentationObjectsForProject } from "./presentation_objects.ts";

export async function addReport(
  projectDb: Sql,
  label: string,
  reportType: ReportType
): Promise<APIResponseWithData<{ newReportId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const newReportId = crypto.randomUUID();
    const startingReportConfig =
      reportType === "long_form"
        ? getStartingConfigForLongFormReport(label)
        : reportType === "ai_slide_deck"
        ? getStartingConfigForAiSlideDeck(label)
        : getStartingConfigForReport(label);
    const lastUpdated = new Date().toISOString();
    await projectDb`
INSERT INTO reports
  (id, report_type, config, last_updated, is_deleted)
VALUES
  (${newReportId}, ${reportType}, ${JSON.stringify(
      startingReportConfig
    )}, ${lastUpdated}, FALSE)
`;
    return { success: true, data: { newReportId, lastUpdated } };
  });
}

export async function duplicateReport(
  projectDb: Sql,
  reportId: string,
  label: string,
  newProjectId: string | "this_project"
): Promise<
  APIResponseWithData<{
    newReportId: string;
    newReportItemIds: string[];
    lastUpdated: string;
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (rawReport === undefined) {
      throw new Error("No report with this id");
    }
    const newReportId = crypto.randomUUID();
    const lastUpdated = new Date().toISOString();

    const reportConfig: ReportConfig = parseJsonOrThrow(rawReport.config);
    reportConfig.label = label;

    const items = await projectDb<DBReportItem[]>`
SELECT * FROM report_items WHERE report_id = ${reportId} ORDER BY sort_order
`;

    const newReportItemIds: string[] = [];

    if (newProjectId === "this_project") {
      await projectDb.begin(async (sql) => {
        await sql`
INSERT INTO reports
  (id, report_type, config, last_updated, is_deleted)
VALUES
  (
    ${newReportId},
    ${rawReport.report_type},
    ${JSON.stringify(reportConfig)},
    ${lastUpdated},
    FALSE
  )
`;
        for (const rawReportItem of items) {
          const newReportItemId = crypto.randomUUID();
          newReportItemIds.push(newReportItemId);
          await sql`
INSERT INTO report_items
  (id, report_id, sort_order, config, last_updated)
VALUES
  (
    ${newReportItemId}, 
    ${newReportId}, 
    ${rawReportItem.sort_order}, 
    ${rawReportItem.config}, 
    ${lastUpdated}
  )
`;
        }
      });
    } else {
      const newProjectDb = getPgConnectionFromCacheOrNew(
        newProjectId,
        "READ_AND_WRITE"
      );

      const resPOs = await getAllPresentationObjectsForProject(projectDb);
      throwIfErrWithData(resPOs);

      await newProjectDb.begin(async (sql: Sql) => {
        await sql`
INSERT INTO reports
  (id, report_type, config, last_updated, is_deleted)
VALUES
  (
    ${newReportId},
    ${rawReport.report_type},
    ${JSON.stringify(reportConfig)},
    ${lastUpdated},
    FALSE
  )
`;
        for (const rawReportItem of items) {
          const newReportItemId = crypto.randomUUID();
          newReportItemIds.push(newReportItemId);

          const config = parseJsonOrThrow<ReportItemConfig>(
            rawReportItem.config
          );
          for (const row of config.freeform.content) {
            for (const col of row) {
              if (col.type === "figure") {
                // Check to see if this figure is a default figure, using this project's database
                // OR... using what is listed in the col
                // Need to do this in case project currently doesn't have the module installed
                const databasePO = resPOs.data.find(
                  (po) => po.id === col.presentationObjectInReportInfo?.id
                );
                if (
                  !databasePO?.isDefault &&
                  !col.presentationObjectInReportInfo?.isDefault
                ) {
                  col.type = "placeholder";
                  col.presentationObjectInReportInfo = undefined;
                  col.markdown = undefined;
                  col.textSize = 1;
                  col.textBackground = "none";
                  col.placeholderInvisible = false;
                  col.useFigureAdditionalScale = false;
                  col.figureAdditionalScale = 1;
                  col.imgFile = undefined;
                  col.imgHeight = undefined;
                  col.hideFigureCaption = false;
                  col.hideFigureSubCaption = false;
                  col.hideFigureFootnote = false;
                }
              }
            }
          }

          await sql`
INSERT INTO report_items
  (id, report_id, sort_order, config, last_updated)
VALUES
  (
    ${newReportItemId}, 
    ${newReportId}, 
    ${rawReportItem.sort_order}, 
    ${JSON.stringify(config)}, 
    ${lastUpdated}
  )
`;
        }
      });
    }

    return {
      success: true,
      data: { newReportId, newReportItemIds, lastUpdated },
    };
  });
}

export async function getAllReportsForProject(
  projectDb: Sql
): Promise<APIResponseWithData<ReportSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const reports = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE is_deleted = FALSE ORDER BY last_updated DESC
`
    ).map<ReportSummary>((rawReport) => {
      const reportConfig: { label: string } = parseJsonOrThrow(rawReport.config);
      return {
        id: rawReport.id,
        label: reportConfig.label,
        reportType: rawReport.report_type as ReportType,
      };
    });
    return { success: true, data: reports };
  });
}

export async function getReportDetail(
  projectId: string,
  projectDb: Sql,
  reportId: string
): Promise<APIResponseWithData<ReportDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (!rawReport) {
      throw new Error("No report with this id");
    }
    //     const rawAnyModuleLastRun = (
    //       await projectDb<DBGlobalLastUpdated[]>`
    // SELECT * FROM global_last_updated WHERE id = 'any_module_last_run'
    // `
    //     ).at(0);
    //     if (!rawAnyModuleLastRun) {
    //       throw new Error("Bad any module last run");
    //     }
    const itemIdsInOrder = (
      await projectDb<{ id: string }[]>`
SELECT id FROM report_items WHERE report_id = ${reportId} ORDER BY sort_order
`
    ).map((row) => row.id);
    const report: ReportDetail = {
      id: rawReport.id,
      projectId,
      reportType: rawReport.report_type as ReportType,
      config: parseJsonOrThrow(rawReport.config),
      itemIdsInOrder,
      // anyModuleLastRun: rawAnyModuleLastRun.last_updated,
      lastUpdated: rawReport.last_updated,
    };
    return { success: true, data: report };
  });
}

// export async function updateReportLabel(
//   projectDb: Sql,
//   reportId: string,
//   label: string
// ): Promise<APIResponseWithData<{ lastUpdated: string }>> {
//   return await tryCatchDatabaseAsync(async () => {
//     const lastUpdated = new Date().toISOString();
//     await projectDb`
// UPDATE reports
// SET
//   label = ${label},
//   last_updated = ${lastUpdated}
// WHERE id = ${reportId}
// `;
//     return { success: true, data: { lastUpdated } };
//   });
// }

export async function updateReportConfig(
  projectDb: Sql,
  reportId: string,
  config: ReportConfig
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (!rawReport) {
      throw new Error("No report with this id");
    }
    await projectDb`
UPDATE reports 
SET config = ${JSON.stringify(config)}, last_updated = ${lastUpdated} 
WHERE id = ${reportId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

export async function backupReport(
  projectId: string,
  projectDb: Sql,
  reportId: string
): Promise<
  APIResponseWithData<{
    report: ReportDetail;
    reportItems: ReportItem[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (!rawReport) {
      throw new Error("No report with this id");
    }
    const itemIdsInOrder = (
      await projectDb<{ id: string }[]>`
SELECT id FROM report_items WHERE report_id = ${reportId} ORDER BY sort_order
`
    ).map((row) => row.id);
    const report: ReportDetail = {
      id: rawReport.id,
      projectId,
      reportType: rawReport.report_type as ReportType,
      config: parseJsonOrThrow(rawReport.config),
      itemIdsInOrder,
      lastUpdated: rawReport.last_updated,
    };
    const reportItems = (
      await projectDb<DBReportItem[]>`
SELECT * FROM report_items WHERE report_id = ${reportId}
`
    ).map((rawReportItem) => {
      const reportItem: ReportItem = {
        id: rawReportItem.id,
        projectId,
        reportId: rawReportItem.report_id,
        config: parseJsonOrThrow(rawReportItem.config),
        lastUpdated: rawReportItem.last_updated,
      };
      return reportItem;
    });
    return { success: true, data: { report, reportItems } };
  });
}

export async function restoreReport(
  projectDb: Sql,
  report: ReportDetail,
  reportItems: ReportItem[]
): Promise<
  APIResponseWithData<{
    newReportId: string;
    newReportItemIds: string[];
    lastUpdated: string;
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const newReportId = crypto.randomUUID();
    const newReportItemIds: string[] = [];
    const lastUpdated = new Date().toISOString();

    await projectDb.begin(async (sql) => {
      await sql`
INSERT INTO reports
(id, report_type, config, last_updated, is_deleted)
VALUES
(
  ${newReportId},
  ${report.reportType},
  ${JSON.stringify(report.config)},
  ${lastUpdated},
  FALSE
)
`;
      for (const reportItem of reportItems) {
        const newReportItemId = crypto.randomUUID();
        newReportItemIds.push(newReportItemId);
        const sortOrder = report.itemIdsInOrder.indexOf(reportItem.id) + 1;
        await sql`
INSERT INTO report_items
(id, report_id, sort_order, config, last_updated)
VALUES
(
  ${newReportItemId}, 
  ${newReportId}, 
  ${sortOrder}, 
  ${JSON.stringify(reportItem.config)}, 
  ${lastUpdated}
)
`;
      }
    });

    return {
      success: true,
      data: { newReportId, newReportItemIds, lastUpdated },
    };
  });
}

export async function deleteReport(
  projectDb: Sql,
  reportId: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`
UPDATE reports
SET is_deleted = TRUE
WHERE id = ${reportId}
`;
    return { success: true };
  });
}

export async function updateLongFormContent(
  projectDb: Sql,
  reportId: string,
  markdown: string
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (!rawReport) {
      throw new Error("No report with this id");
    }
    const config: LongFormReportConfig = parseJsonOrThrow(rawReport.config);
    config.markdown = markdown;
    await projectDb`
UPDATE reports
SET config = ${JSON.stringify(config)}, last_updated = ${lastUpdated}
WHERE id = ${reportId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

export async function updateAiSlideDeckContent(
  projectDb: Sql,
  reportId: string,
  slides: AiSlideDeckSlide[]
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawReport = (
      await projectDb<DBReport[]>`
SELECT * FROM reports WHERE id = ${reportId}
`
    ).at(0);
    if (!rawReport) {
      throw new Error("No report with this id");
    }
    const config: AiSlideDeckReportConfig = parseJsonOrThrow(rawReport.config);
    config.slides = slides;
    await projectDb`
UPDATE reports
SET config = ${JSON.stringify(config)}, last_updated = ${lastUpdated}
WHERE id = ${reportId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

////////////////////////
//                    //
//    Report items    //
//                    //
////////////////////////

export async function addReportItem(
  projectDb: Sql,
  reportId: string
): Promise<
  APIResponseWithData<{ newReportItemId: string; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const newReportItemId = crypto.randomUUID();
    const startingReportItemConfig = getStartingConfigForReportItem();
    const lastUpdated = new Date().toISOString();
    const rawMaxSortOrder = (
      await projectDb<{ max_sort_order: number }[]>`
SELECT max(sort_order) AS max_sort_order FROM report_items
WHERE report_id = ${reportId}
`
    ).at(0);
    assertNotUndefined(rawMaxSortOrder);

    await projectDb.begin((sql) => [
      sql`
INSERT INTO report_items
  (id, report_id, sort_order, config, last_updated)
VALUES
  (
    ${newReportItemId}, 
    ${reportId}, 
    ${rawMaxSortOrder.max_sort_order + 1}, 
    ${JSON.stringify(startingReportItemConfig)}, 
    ${lastUpdated}
  )
`,
      sql`
UPDATE reports SET last_updated = ${lastUpdated} 
WHERE id = ${reportId}`,
      reSequence(sql, reportId),
    ]);
    return { success: true, data: { newReportItemId, lastUpdated } };
  });
}

export async function duplicateReportItem(
  projectDb: Sql,
  reportId: string,
  reportItemId: string,
  nextOrEnd: "next" | "end",
  newReportId: string | "this_report"
): Promise<
  APIResponseWithData<{ newReportItemId: string; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawReportItem = (
      await projectDb<DBReportItem[]>`
SELECT * FROM report_items WHERE id = ${reportItemId}
`
    ).at(0);
    if (!rawReportItem) {
      throw new Error("No report item with this id");
    }
    const newReportItemId = crypto.randomUUID();
    const lastUpdated = new Date().toISOString();

    const reportIdToDuplicateInto =
      newReportId === "this_report" ? reportId : newReportId;

    const rawMaxSortOrder = (
      await projectDb<{ max_sort_order: number }[]>`
SELECT max(sort_order) AS max_sort_order FROM report_items
WHERE report_id = ${reportIdToDuplicateInto}
`
    ).at(0);
    assertNotUndefined(rawMaxSortOrder);

    const newSortOrder =
      newReportId === "this_report" && nextOrEnd === "next"
        ? rawReportItem.sort_order
        : rawMaxSortOrder.max_sort_order + 1;

    await projectDb.begin((sql) => [
      sql`
INSERT INTO report_items
  (id, report_id, sort_order, config, last_updated)
VALUES
  (
    ${newReportItemId}, 
    ${reportIdToDuplicateInto}, 
    ${newSortOrder}, 
    ${rawReportItem.config}, 
    ${lastUpdated}
  )
`,
      sql`
UPDATE reports SET last_updated = ${lastUpdated} 
WHERE id = ${reportIdToDuplicateInto}`,
      reSequence(sql, reportId),
    ]);

    return { success: true, data: { newReportItemId, lastUpdated } };
  });
}

export async function getReportItem(
  projectId: string,
  projectDb: Sql,
  reportItemId: string
): Promise<APIResponseWithData<ReportItem>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawReportItem = (
      await projectDb<DBReportItem[]>`
SELECT * FROM report_items WHERE id = ${reportItemId}
`
    ).at(0);
    if (!rawReportItem) {
      throw new Error("No report item with this id");
    }
    const reportItem: ReportItem = {
      id: rawReportItem.id,
      projectId,
      reportId: rawReportItem.report_id,
      config: parseJsonOrThrow(rawReportItem.config),
      lastUpdated: rawReportItem.last_updated,
    };
    return { success: true, data: reportItem };
  });
}

export async function updateReportItemConfig(
  projectDb: Sql,
  reportItemId: string,
  config: ReportItemConfig
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
UPDATE report_items 
SET config = ${JSON.stringify(config)}, last_updated = ${lastUpdated} 
WHERE id = ${reportItemId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

export async function moveAndDeleteAllReportItems(
  projectDb: Sql,
  reportId: string,
  itemIdsInOrder: string[]
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb.begin(async (sql) => {
      // Delete report items not in the itemIdsInOrder array
      await sql`
    DELETE FROM report_items
    WHERE report_id = ${reportId}
    AND NOT (id = ANY(${itemIdsInOrder}))
    `;

      for (let index = 0; index < itemIdsInOrder.length; index++) {
        const reportItemId = itemIdsInOrder[index];
        await sql`
    UPDATE report_items SET sort_order = ${index + 1}
    WHERE id = ${reportItemId} AND report_id = ${reportId}
    `;
      }

      await sql`
    UPDATE reports SET last_updated = ${lastUpdated}
    WHERE id = ${reportId}
    `;

      await reSequence(sql, reportId);
    });
    return { success: true, data: { lastUpdated } };
  });
}

export async function deleteReportItem(
  projectDb: Sql,
  reportItemId: string
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawReportItem = (
      await projectDb<{ report_id: string }[]>`
SELECT report_id FROM report_items WHERE id = ${reportItemId}
`
    ).at(0);
    if (!rawReportItem) {
      return { success: true, data: { lastUpdated } };
    }
    await projectDb.begin((sql) => [
      sql`
DELETE FROM report_items WHERE id = ${reportItemId}
`,
      sql`
UPDATE reports SET last_updated = ${lastUpdated}
WHERE id = ${rawReportItem.report_id}
`,
      reSequence(sql, rawReportItem.report_id),
    ]);
    return { success: true, data: { lastUpdated } };
  });
}

function reSequence(sql: Sql, reportId: string) {
  return sql`

WITH tmp as (
SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) as rn FROM report_items
WHERE report_id = ${reportId}
)

UPDATE report_items SET sort_order = (
SELECT ( (rn) * 10 ) from tmp
WHERE report_items.id = tmp.id
)
WHERE report_id = ${reportId};

`;
}
