import { Sql } from "postgres";
import {
  DisaggregationDisplayOption,
  DisaggregationOption,
  PeriodFilter,
  PresentationOption,
  ProjectUser,
  ResultsValue,
  getReplicateByProp,
  parseJsonOrThrow,
  throwIfErrWithData,
  type APIResponseWithData,
  type PresentationObjectConfig,
  type PresentationObjectDetail,
  type PresentationObjectSummary,
} from "lib";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import {
  type DBMetric,
  type DBPresentationObject,
  type DBReportItem,
} from "./_project_database_types.ts";
import { getFacilityColumnsConfig } from "../instance/config.ts";
import { resolveMetricById } from "./results_value_resolver.ts";
import { generateUniquePresentationObjectId } from "../../utils/id_generation.ts";

export type AddPresentationObjectParams = {
  projectDb: Sql;
  projectUser: ProjectUser;
  label: string;
  resultsValue: ResultsValue;
  config: PresentationObjectConfig;
  makeDefault: boolean;
  createdByAI?: boolean;
  folderId?: string | null;
};

export async function addPresentationObject(
  params: AddPresentationObjectParams,
): Promise<
  APIResponseWithData<{ newPresentationObjectId: string; lastUpdated: string }>
> {
  const {
    projectDb,
    label,
    resultsValue,
    config,
    makeDefault,
    createdByAI = false,
    folderId,
  } = params;

  return await tryCatchDatabaseAsync(async () => {
    const newPresentationObjectId =
      await generateUniquePresentationObjectId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
INSERT INTO presentation_objects
  (id, metric_id, is_default_visualization, created_by_ai, label, config, last_updated, folder_id)
VALUES
  (
    ${newPresentationObjectId},
    ${resultsValue.id},
    ${makeDefault},
    ${createdByAI},
    ${label.trim()},
    ${JSON.stringify(config)},
    ${lastUpdated},
    ${folderId ?? null}
  )
`;
    return { success: true, data: { newPresentationObjectId, lastUpdated } };
  });
}

export async function duplicatePresentationObject(
  projectDb: Sql,
  presentationObjectId: string,
  label: string,
  folderId?: string | null,
): Promise<
  APIResponseWithData<{ newPresentationObjectId: string; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<DBPresentationObject[]>`
SELECT * FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      throw new Error("No presentation object with this id");
    }
    const newPresentationObjectId =
      await generateUniquePresentationObjectId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
INSERT INTO presentation_objects
  (id, metric_id, is_default_visualization, label, config, last_updated, folder_id)
VALUES
  (
    ${newPresentationObjectId},
    ${rawPresObj.metric_id},
    ${false},
    ${label.trim()},
    ${rawPresObj.config},
    ${lastUpdated},
    ${folderId ?? null}
  )
`;
    return { success: true, data: { newPresentationObjectId, lastUpdated } };
  });
}

export async function getAllPresentationObjectsForModule(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseWithData<PresentationObjectSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    // Join through metrics to find presentation objects for this module
    const rows = await projectDb<DBPresentationObject[]>`
SELECT po.*
FROM presentation_objects po
JOIN metrics m ON po.metric_id = m.id
WHERE m.module_id = ${moduleId}
ORDER BY po.sort_order, LOWER(po.label)
`;
    const presentationObjects = rows.map<PresentationObjectSummary>((row) => {
      const config = parseJsonOrThrow<PresentationObjectConfig>(row.config);
      return {
        id: row.id,
        metricId: row.metric_id,
        label: row.label,
        isDefault: row.is_default_visualization,
        replicateBy: getReplicateByProp(config),
        isFiltered: config.d.filterBy.length > 0 || !!config.d.periodFilter,
        createdByAI: row.created_by_ai,
        folderId: row.folder_id,
        sortOrder: row.sort_order,
      };
    });
    return { success: true, data: presentationObjects };
  });
}

export async function getAllPresentationObjectsForProject(
  projectDb: Sql,
): Promise<APIResponseWithData<PresentationObjectSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<DBPresentationObject[]>`
SELECT po.*
FROM presentation_objects po
ORDER BY po.is_default_visualization DESC, po.sort_order, LOWER(po.label)
`;
    const presentationObjects = rows.map<PresentationObjectSummary>((row) => {
      const config = parseJsonOrThrow<PresentationObjectConfig>(row.config);
      return {
        id: row.id,
        metricId: row.metric_id,
        label: row.label,
        isDefault: row.is_default_visualization,
        replicateBy: getReplicateByProp(config),
        isFiltered: config.d.filterBy.length > 0 || !!config.d.periodFilter,
        createdByAI: row.created_by_ai,
        folderId: row.folder_id,
        sortOrder: row.sort_order,
      };
    });
    return { success: true, data: presentationObjects };
  });
}

export async function getPresentationObjectDetail(
  projectId: string,
  projectDb: Sql,
  presentationObjectId: string,
  mainDb: Sql,
): Promise<APIResponseWithData<PresentationObjectDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<DBPresentationObject[]>`
SELECT * FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      throw new Error("No presentation object with this id");
    }

    // Get facility config for enrichment
    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);

    // Resolve metric by ID with enrichment
    const resResultsValue = await resolveMetricById(
      projectDb,
      rawPresObj.metric_id,
      resFacilityConfig.data,
    );
    throwIfErrWithData(resResultsValue);

    const presObj: PresentationObjectDetail = {
      id: rawPresObj.id,
      projectId,
      resultsValue: resResultsValue.data,
      lastUpdated: rawPresObj.last_updated,
      label: rawPresObj.label,
      config: parseJsonOrThrow(rawPresObj.config),
      isDefault: rawPresObj.is_default_visualization,
      folderId: rawPresObj.folder_id,
    };
    return { success: true, data: presObj };
  });
}

export async function getPresentationObjectLastUpdated(
  projectDb: Sql,
  presentationObjectId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<{ last_updated: string }[]>`
SELECT last_updated FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      throw new Error("No presentation object with this id");
    }
    return { success: true, data: { lastUpdated: rawPresObj.last_updated } };
  });
}

export async function updatePresentationObjectLabel(
  projectDb: Sql,
  presentationObjectId: string,
  label: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<{ is_default_visualization: boolean }[]>`
SELECT is_default_visualization FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      return {
        success: false,
        err: "No visualization with this ID",
      };
    }
    if (rawPresObj.is_default_visualization) {
      return {
        success: false,
        err: "You cannot update a default visualization",
      };
    }
    const lastUpdated = new Date().toISOString();
    await projectDb`
UPDATE presentation_objects 
SET 
  label = ${label.trim()}, 
  last_updated = ${lastUpdated} 
WHERE id = ${presentationObjectId}
`;
    return {
      success: true,
      data: { lastUpdated },
    };
  });
}

export async function updatePresentationObjectConfig(
  projectDb: Sql,
  presentationObjectId: string,
  config: PresentationObjectConfig,
  expectedLastUpdated: string | undefined,
  overwrite: boolean | undefined,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    reportItemsThatDependOnPresentationObjects: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<
        { is_default_visualization: boolean; last_updated: string }[]
      >`
SELECT is_default_visualization, last_updated FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      return {
        success: false,
        err: "No visualization with this ID",
      };
    }
    if (rawPresObj.is_default_visualization) {
      return {
        success: false,
        err: "You cannot update a default visualization",
      };
    }

    // Check for conflict (unless user explicitly chose to overwrite)
    if (
      expectedLastUpdated &&
      !overwrite &&
      rawPresObj.last_updated !== expectedLastUpdated
    ) {
      return {
        success: false,
        err: "CONFLICT",
        data: {
          message: "This visualization was modified by another user.",
          currentLastUpdated: rawPresObj.last_updated,
        },
      };
    }

    const lastUpdated = new Date().toISOString();
    const reportItemsThatDependOnPresentationObjects =
      await getReportItemsThatDependOnPresentationObjects(projectDb, [
        presentationObjectId,
      ]);
    await projectDb.begin(async (sql: Sql) => {
      await sql`
UPDATE presentation_objects 
SET 
  config = ${JSON.stringify(config)}, 
  last_updated = ${lastUpdated} 
WHERE id = ${presentationObjectId}
`;
      for (const reportItemId of reportItemsThatDependOnPresentationObjects) {
        await sql`
UPDATE report_items 
SET last_updated = ${lastUpdated} 
WHERE id = ${reportItemId}`;
      }
    });
    return {
      success: true,
      data: { lastUpdated, reportItemsThatDependOnPresentationObjects },
    };
  });
}

export async function getReportItemsThatDependOnPresentationObjects(
  projectDb: Sql,
  presentationObjectIds: string[],
): Promise<string[]> {
  if (presentationObjectIds.length === 0) return [];
  const rows = await projectDb<{ id: string }[]>`
    SELECT id FROM report_items
    WHERE ${projectDb.unsafe(
      presentationObjectIds.map((id) => `config LIKE '%${id}%'`).join(" OR "),
    )}
  `;
  return rows.map((r: any) => r.id);
}

export async function batchUpdatePresentationObjectsPeriodFilter(
  projectDb: Sql,
  presentationObjectIds: string[],
  periodFilter: PeriodFilter | undefined,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    updatedCount: number;
    reportItemsAffected: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const reportItemsSet = new Set<string>();

    await projectDb.begin(async (sql: Sql) => {
      for (const id of presentationObjectIds) {
        const result = await sql<DBPresentationObject[]>`
          SELECT config FROM presentation_objects WHERE id = ${id}
        `;

        if (result.length === 0) {
          throw new Error(`Presentation object ${id} not found`);
        }

        const config: PresentationObjectConfig = parseJsonOrThrow(
          result[0].config,
        );

        config.d.periodFilter = periodFilter;

        await sql`
          UPDATE presentation_objects
          SET config = ${JSON.stringify(config)},
              last_updated = ${lastUpdated}
          WHERE id = ${id}
        `;

        const reportItems = await getReportItemsThatDependOnPresentationObjects(
          sql,
          [id],
        );
        reportItems.forEach((itemId) => reportItemsSet.add(itemId));
      }

      if (reportItemsSet.size > 0) {
        const reportItemIds = Array.from(reportItemsSet);
        for (const reportItemId of reportItemIds) {
          await sql`
            UPDATE report_items
            SET last_updated = ${lastUpdated}
            WHERE id = ${reportItemId}
          `;
        }
      }
    });

    return {
      success: true,
      data: {
        lastUpdated,
        updatedCount: presentationObjectIds.length,
        reportItemsAffected: Array.from(reportItemsSet),
      },
    };
  });
}

export async function deletePresentationObject(
  projectDb: Sql,
  presentationObjectId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawPresObj = (
      await projectDb<{ is_default_visualization: boolean }[]>`
SELECT is_default_visualization FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      return { success: true, data: { lastUpdated } };
    }
    if (rawPresObj.is_default_visualization) {
      return {
        success: false,
        err: "You cannot delete a default visualization",
      };
    }
    await projectDb`
DELETE FROM presentation_objects WHERE id = ${presentationObjectId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

export async function deleteAIPresentationObject(
  projectDb: Sql,
  presentationObjectId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rawPresObj = (
      await projectDb<
        { created_by_ai: boolean; is_default_visualization: boolean }[]
      >`
SELECT created_by_ai, is_default_visualization FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      return {
        success: false,
        err: "No visualization with this ID",
      };
    }
    if (!rawPresObj.created_by_ai) {
      return {
        success: false,
        err: "This visualization was not created by AI and cannot be deleted with this function",
      };
    }
    if (rawPresObj.is_default_visualization) {
      return {
        success: false,
        err: "You cannot delete a default visualization",
      };
    }
    await projectDb`
DELETE FROM presentation_objects WHERE id = ${presentationObjectId}
`;
    return { success: true, data: { lastUpdated } };
  });
}

export type UpdateAIPresentationObjectParams = {
  label?: string;
  presentationType?: PresentationOption;
  disaggregations?: { dimension: DisaggregationOption; displayAs: string }[];
  filters?: { dimension: DisaggregationOption; values: string[] }[];
  periodFilter?: { startPeriod?: number; endPeriod?: number } | null;
  valuesFilter?: string[] | null;
  valuesDisDisplayOpt?: DisaggregationDisplayOption;
  caption?: string;
  subCaption?: string;
  footnote?: string;
};

export async function updateAIPresentationObject(
  projectDb: Sql,
  presentationObjectId: string,
  updates: UpdateAIPresentationObjectParams,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    reportItemsThatDependOnPresentationObjects: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<
        {
          created_by_ai: boolean;
          is_default_visualization: boolean;
          config: string;
        }[]
      >`
SELECT created_by_ai, is_default_visualization, config
FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);

    if (rawPresObj === undefined) {
      return {
        success: false,
        err: "No visualization with this ID",
      };
    }
    if (!rawPresObj.created_by_ai) {
      return {
        success: false,
        err: "This visualization was not created by AI and cannot be edited with this function",
      };
    }
    if (rawPresObj.is_default_visualization) {
      return {
        success: false,
        err: "You cannot update a default visualization",
      };
    }

    const config = parseJsonOrThrow<PresentationObjectConfig>(
      rawPresObj.config,
    );

    // Update presentation type
    if (updates.presentationType !== undefined) {
      config.d.type = updates.presentationType;
    }

    // Update disaggregations
    if (updates.disaggregations !== undefined) {
      config.d.disaggregateBy = updates.disaggregations.map((d) => ({
        disOpt: d.dimension,
        disDisplayOpt: d.displayAs as any,
      }));
    }

    // Update filters
    if (updates.filters !== undefined) {
      config.d.filterBy = updates.filters.map((f) => ({
        disOpt: f.dimension,
        values: f.values,
      }));
    }

    // Update period filter
    if (updates.periodFilter !== undefined) {
      if (updates.periodFilter === null) {
        config.d.periodFilter = undefined;
      } else {
        config.d.periodFilter = {
          filterType: "custom",
          periodOption: config.d.periodOpt,
          min: updates.periodFilter.startPeriod ?? 0,
          max: updates.periodFilter.endPeriod ?? 999999,
        };
      }
    }

    // Update values filter
    if (updates.valuesFilter !== undefined) {
      if (updates.valuesFilter === null || updates.valuesFilter.length === 0) {
        config.d.valuesFilter = undefined;
      } else {
        config.d.valuesFilter = updates.valuesFilter;
      }
    }

    // Update values display option
    if (updates.valuesDisDisplayOpt !== undefined) {
      config.d.valuesDisDisplayOpt = updates.valuesDisDisplayOpt;
    }

    // Update text fields
    if (updates.caption !== undefined) {
      config.t.caption = updates.caption;
    }
    if (updates.subCaption !== undefined) {
      config.t.subCaption = updates.subCaption;
    }
    if (updates.footnote !== undefined) {
      config.t.footnote = updates.footnote;
    }

    const lastUpdated = new Date().toISOString();
    const reportItemsThatDependOnPresentationObjects =
      await getReportItemsThatDependOnPresentationObjects(projectDb, [
        presentationObjectId,
      ]);

    await projectDb.begin(async (sql: Sql) => {
      // Update label if provided
      if (updates.label !== undefined) {
        await sql`
UPDATE presentation_objects
SET
  label = ${updates.label.trim()},
  config = ${JSON.stringify(config)},
  last_updated = ${lastUpdated}
WHERE id = ${presentationObjectId}
`;
      } else {
        await sql`
UPDATE presentation_objects
SET
  config = ${JSON.stringify(config)},
  last_updated = ${lastUpdated}
WHERE id = ${presentationObjectId}
`;
      }

      for (const reportItemId of reportItemsThatDependOnPresentationObjects) {
        await sql`
UPDATE report_items
SET last_updated = ${lastUpdated}
WHERE id = ${reportItemId}`;
      }
    });

    return {
      success: true,
      data: { lastUpdated, reportItemsThatDependOnPresentationObjects },
    };
  });
}

export async function getVisualizationsListForAI(
  projectDb: Sql,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get all table names upfront
    const existingTables = await projectDb<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableNamesSet = new Set(existingTables.map((t) => t.table_name));

    // Join through metrics to get module info and results object
    const rows = await projectDb<
      {
        id: string;
        label: string;
        config: string;
        module_definition: string;
        results_object_id: string;
        is_default_visualization: boolean;
        created_by_ai: boolean;
        metric_id: string;
        metric_label: string;
      }[]
    >`
SELECT
  po.id,
  po.label,
  po.config,
  po.is_default_visualization,
  po.created_by_ai,
  met.id AS metric_id,
  met.label AS metric_label,
  met.results_object_id,
  mod.module_definition
FROM presentation_objects po
JOIN metrics met ON po.metric_id = met.id
JOIN modules mod ON met.module_id = mod.id
ORDER BY po.is_default_visualization DESC, LOWER(po.label)
`;

    const visualizations = rows.map((row) => {
      const config = parseJsonOrThrow<PresentationObjectConfig>(row.config);
      const moduleDef = parseJsonOrThrow<{ name: string }>(
        row.module_definition,
      );
      const tableName = getResultsObjectTableName(row.results_object_id);

      // Find replicateBy dimension (disaggregation with disDisplayOpt === "replicant")
      const replicantDis = config.d.disaggregateBy.find(
        (d) => d.disDisplayOpt === "replicant",
      );

      return {
        id: row.id,
        name: row.label,
        moduleName: moduleDef.name,
        metricId: row.metric_id,
        metricLabel: row.metric_label,
        caption: config.t.caption,
        type: config.d.type,
        disaggregations: config.d.disaggregateBy.map((d) => ({
          dimension: d.disOpt,
          displayAs: d.disDisplayOpt,
        })),
        filters: config.d.filterBy.map((f) => ({
          dimension: f.disOpt,
          values: f.values,
        })),
        isAvailable: tableNamesSet.has(tableName),
        // Replicant info for AI
        replicateBy: replicantDis?.disOpt,
        selectedReplicantValue: config.d.selectedReplicantValue,
        // Edit permissions
        isDefault: row.is_default_visualization,
        createdByAI: row.created_by_ai,
      };
    });

    const lines = ["AVAILABLE VISUALIZATIONS", "=".repeat(80), ""];

    const availableVisualizations = visualizations.filter((v) => v.isAvailable);

    if (availableVisualizations.length === 0) {
      lines.push("");
      lines.push("No visualizations are currently available.");
      lines.push(
        "Visualizations become available after their modules have successfully run.",
      );
      lines.push("");
      return { success: true, data: lines.join("\n") };
    }

    for (const viz of availableVisualizations) {
      lines.push(`ID: ${viz.id}`);
      lines.push(`Name: ${viz.name}`);
      lines.push(`Module: ${viz.moduleName}`);
      lines.push(`Metric: ${viz.metricLabel} (ID: ${viz.metricId})`);
      lines.push(`Type: ${viz.type}`);
      lines.push(
        `Status: ${viz.createdByAI ? "AI-created (editable)" : viz.isDefault ? "Default (read-only)" : "Custom (read-only)"}`,
      );
      if (viz.caption) lines.push(`Caption: ${viz.caption}`);

      if (viz.disaggregations.length > 0) {
        lines.push(`Disaggregated by:`);
        for (const dis of viz.disaggregations) {
          lines.push(`  - ${dis.dimension} (displayed as ${dis.displayAs})`);
        }
      }

      if (viz.filters.length > 0) {
        lines.push(`Filtered by:`);
        for (const filter of viz.filters) {
          lines.push(`  - ${filter.dimension}: ${filter.values.join(", ")}`);
        }
      }

      // Replicant info - tells AI this viz can be embedded with different replicant values
      if (viz.replicateBy) {
        lines.push(`Replicates by: ${viz.replicateBy}`);
        if (viz.selectedReplicantValue) {
          lines.push(`  Current value: ${viz.selectedReplicantValue}`);
        }
        lines.push(
          `  (Use syntax: ![Caption](${viz.id}:VALUE) to embed with different values)`,
        );
      }

      lines.push("-".repeat(80));
      lines.push("");
    }

    return { success: true, data: lines.join("\n") };
  });
}

export async function updatePresentationObjectFolder(
  projectDb: Sql,
  presentationObjectId: string,
  folderId: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE presentation_objects
      SET folder_id = ${folderId}, last_updated = ${lastUpdated}
      WHERE id = ${presentationObjectId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function reorderPresentationObjects(
  projectDb: Sql,
  orderUpdates: { id: string; sortOrder: number }[],
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb.begin(async (sql) => {
      for (const update of orderUpdates) {
        await sql`
          UPDATE presentation_objects
          SET sort_order = ${update.sortOrder}, last_updated = ${lastUpdated}
          WHERE id = ${update.id}
        `;
      }
    });
    return { success: true, data: { lastUpdated } };
  });
}
