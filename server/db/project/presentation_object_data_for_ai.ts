import { Sql } from "postgres";
import {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  ModuleDefinition,
  parseJsonOrThrow,
  throwIfErrWithData,
} from "lib";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../utils.ts";
import { DBModule } from "./_project_database_types.ts";
import { getPresentationObjectDetail } from "./presentation_objects.ts";
import { getPresentationObjectItems } from "../../server_only_funcs_presentation_objects/get_presentation_object_items.ts";
import { _PO_ITEMS_CACHE } from "../../routes/caches/visualizations.ts";

export async function getVisualizationDataForAI(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  presentationObjectId: string,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const resDetail = await getPresentationObjectDetail(
      projectId,
      projectDb,
      presentationObjectId,
      mainDb,
    );
    throwIfErrWithData(resDetail);

    const detail = resDetail.data;

    // Check if results table exists
    const tableName = getResultsObjectTableName(
      detail.resultsValue.resultsObjectId,
    );
    const tableExists = await projectDb<{ table_exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = ${tableName}
      ) as table_exists
    `;
    const resultsTableExists = tableExists.at(0)?.table_exists ?? false;

    const rawModule = (
      await projectDb<
        DBModule[]
      >`SELECT * FROM modules WHERE id = ${detail.resultsValue.moduleId}`
    ).at(0);
    if (!rawModule) {
      throw new Error("Module not found");
    }
    if (!rawModule.last_run) {
      throw new Error("Module has not run yet");
    }
    const moduleDef = parseJsonOrThrow<ModuleDefinition>(
      rawModule.module_definition,
    );

    // If table doesn't exist, return early with just metadata
    if (!resultsTableExists) {
      const lines: string[] = [];
      lines.push("# VISUALIZATION DATA");
      lines.push("=".repeat(80));
      lines.push("");
      lines.push("**STATUS: This visualization is NOT available. Don't use.**");
      lines.push("**REASON: Results table does not exist**");
      lines.push("");
      lines.push(`**Name:** ${detail.label}`);
      lines.push(`**Module:** ${moduleDef.label}`);
      lines.push(`**Type:** ${detail.config.d.type}`);
      if (detail.config.t.caption) {
        lines.push(`**Caption:** ${detail.config.t.caption}`);
      }
      return { success: true, data: lines.join("\n") };
    }

    const valueProps =
      detail.config.d.valuesFilter && detail.config.d.valuesFilter.length > 0
        ? detail.resultsValue.valueProps.filter((vp) =>
          detail.config.d.valuesFilter?.includes(vp)
        )
        : detail.resultsValue.valueProps;

    const groupBys = [];
    for (const dis of detail.config.d.disaggregateBy) {
      groupBys.push(dis.disOpt);
    }
    if (detail.config.d.type === "timeseries") {
      groupBys.push(detail.config.d.periodOpt);
    }

    const replicateBy = detail.config.d.disaggregateBy.find(
      (d) => d.disDisplayOpt === "replicant",
    );
    const filters = detail.config.d.filterBy
      .map((f) => ({
        col: f.disOpt,
        vals: f.values,
      }))
      .filter((f) => f.vals.length > 0);
    if (replicateBy && detail.config.d.selectedReplicantValue) {
      filters.push({
        col: replicateBy.disOpt,
        vals: [detail.config.d.selectedReplicantValue],
      });
    }

    const shouldIncludeNationalAggregate =
      detail.config.d.includeNationalForAdminArea2;
    const nationalAggregateIsAllowed = detail.config.d.disaggregateBy.some(
      (d) => d.disOpt === "admin_area_2" && d.disDisplayOpt !== "replicant",
    );

    const fetchConfig: GenericLongFormFetchConfig = {
      values: detail.resultsValue.postAggregationExpression
        ? detail.resultsValue.postAggregationExpression.ingredientValues
        : valueProps.map((prop) => ({
          prop,
          func: detail.resultsValue.valueFunc,
        })),
      groupBys: groupBys as GenericLongFormFetchConfig["groupBys"],
      filters,
      periodFilter: detail.config.d.periodFilter,
      postAggregationExpression: detail.resultsValue.postAggregationExpression
        ? detail.resultsValue.postAggregationExpression.expression
        : undefined,
      includeNationalForAdminArea2: shouldIncludeNationalAggregate &&
        nationalAggregateIsAllowed,
      includeNationalPosition: detail.config.d.includeNationalPosition,
    };

    const firstPeriodOption = detail.resultsValue.periodOptions.at(0);

    const existing = await _PO_ITEMS_CACHE.get(
      {
        projectId,
        resultsObjectId: detail.resultsValue.resultsObjectId,
        fetchConfig,
      },
      { moduleLastRun: rawModule.last_run },
    );

    let resItems;
    if (existing && existing.success === true) {
      resItems = existing;
    } else {
      const newPromise = getPresentationObjectItems(
        mainDb,
        projectId,
        projectDb,
        presentationObjectId,
        detail.resultsValue.resultsObjectId,
        fetchConfig,
        firstPeriodOption,
        rawModule.last_run,
      );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        {
          projectId,
          resultsObjectId: detail.resultsValue.resultsObjectId,
          fetchConfig,
        },
        { moduleLastRun: rawModule.last_run },
      );
      resItems = await newPromise;
    }
    throwIfErrWithData(resItems);

    const lines: string[] = [];

    lines.push("# VISUALIZATION DATA");
    lines.push("=".repeat(80));
    lines.push("");

    // Add availability status at the top
    if (!resultsTableExists) {
      lines.push("**STATUS: This visualization is NOT available. Don't use.**");
      lines.push("**REASON: Results table does not exist**");
      lines.push("");
    } else if (resItems.data.status === "too_many_items") {
      lines.push("**STATUS: This visualization is NOT available. Don't use.**");
      lines.push("**REASON: Too many data points**");
      lines.push("");
    } else if (resItems.data.status === "no_data_available") {
      lines.push("**STATUS: This visualization is NOT available. Don't use.**");
      lines.push("**REASON: No data available**");
      lines.push("");
    } else {
      lines.push("**STATUS: This visualization is available**");
      lines.push("");
    }

    // Only proceed with data display if status is "ok"
    if (resItems.data.status !== "ok") {
      lines.push("No data to display.");
      return { success: true, data: lines.join("\n") };
    }

    const items = resItems.data.items;
    const totalRows = items.length;
    const showFullData = totalRows <= 500;
    const sampleSize = showFullData ? totalRows : 100;

    lines.push(`**Name:** ${detail.label}`);
    lines.push(`**Module:** ${moduleDef.label}`);
    lines.push(`**Type:** ${detail.config.d.type}`);
    if (detail.config.t.caption) {
      lines.push(`**Caption:** ${detail.config.t.caption}`);
    }
    lines.push("");

    if (detail.config.d.disaggregateBy.length > 0) {
      lines.push("**Disaggregated by:**");
      for (const dis of detail.config.d.disaggregateBy) {
        lines.push(`- ${dis.disOpt} (displayed as ${dis.disDisplayOpt})`);
      }
      lines.push("");
    }

    if (detail.config.d.filterBy.length > 0) {
      lines.push("**Filtered by:**");
      for (const filter of detail.config.d.filterBy) {
        lines.push(`- ${filter.disOpt}: ${filter.values.join(", ")}`);
      }
      lines.push("");
    }

    lines.push(`**Total rows:** ${totalRows}`);
    if (!showFullData) {
      lines.push(`**Showing:** First ${sampleSize} rows (sample)`);
    }
    lines.push("");

    if (totalRows === 0) {
      lines.push("*No data available*");
      return { success: true, data: lines.join("\n") };
    }

    const sampleItems = items.slice(0, sampleSize);
    const columns = Object.keys(sampleItems[0]);

    const dimensionStats = getDimensionStats(items, columns);
    lines.push("## Dimension Summary");
    lines.push("");
    for (const [col, stats] of Object.entries(dimensionStats)) {
      if (stats.uniqueCount > 0) {
        lines.push(
          `**${col}:** ${stats.uniqueCount} unique value${
            stats.uniqueCount === 1 ? "" : "s"
          }`,
        );
        if (stats.uniqueCount <= 10) {
          lines.push(`  ${stats.uniqueValues.join(", ")}`);
        }
      }
    }
    lines.push("");

    lines.push("## Data");
    lines.push("");
    lines.push(formatAsMarkdownTable(sampleItems, columns));
    lines.push("");

    if (resItems.data.dateRange) {
      lines.push("## Time Range");
      lines.push("");
      lines.push(
        `Period: ${resItems.data.dateRange.periodOption} (${resItems.data.dateRange.min} to ${resItems.data.dateRange.max})`,
      );
      lines.push("");
    }

    return { success: true, data: lines.join("\n") };
  });
}

function getDimensionStats(
  items: Record<string, string>[],
  columns: string[],
): Record<string, { uniqueCount: number; uniqueValues: string[] }> {
  const stats: Record<string, { uniqueCount: number; uniqueValues: string[] }> =
    {};

  for (const col of columns) {
    const uniqueValues = new Set<string>();
    for (const item of items) {
      const val = item[col];
      if (val !== undefined && val !== null && val !== "") {
        uniqueValues.add(String(val));
      }
    }
    stats[col] = {
      uniqueCount: uniqueValues.size,
      uniqueValues: Array.from(uniqueValues).sort(),
    };
  }

  return stats;
}

function formatAsMarkdownTable(
  items: Record<string, string>[],
  columns: string[],
): string {
  if (items.length === 0) return "";

  const lines: string[] = [];

  const headerRow = `| ${columns.join(" | ")} |`;
  const separatorRow = `| ${columns.map(() => "---").join(" | ")} |`;

  lines.push(headerRow);
  lines.push(separatorRow);

  for (const item of items) {
    const values = columns.map((col) => {
      const val = item[col];
      return val !== undefined && val !== null ? String(val) : "";
    });
    lines.push(`| ${values.join(" | ")} |`);
  }

  return lines.join("\n");
}
