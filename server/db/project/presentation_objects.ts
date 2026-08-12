import { Sql } from "postgres";
import {
  parsePresentationObjectConfig,
  PeriodFilter,
  ProjectUser,
  ResultsValue,
  getReplicateByProp,
  parseJsonOrThrow,
  presentationObjectConfigSchema,
  throwIfErrWithData,
  type APIResponseWithData,
  type DerivedDefaultVisualization,
  type PresentationObjectConfig,
  type PresentationObjectDetail,
  type PresentationObjectSummary,
} from "lib";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import {
  type DBPresentationObject,
} from "./_project_database_types.ts";
import { resolveMetricById } from "./results_value_resolver.ts";
import { generateUniquePresentationObjectId } from "../../utils/id_generation.ts";

export type AddPresentationObjectParams = {
  projectDb: Sql;
  projectUser: ProjectUser;
  label: string;
  resultsValue: ResultsValue;
  config: PresentationObjectConfig;
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
    ${false},
    ${createdByAI},
    ${label.trim()},
    ${JSON.stringify(presentationObjectConfigSchema.parse(config))},
    ${lastUpdated},
    ${folderId ?? null}
  )
`;
    return { success: true, data: { newPresentationObjectId, lastUpdated } };
  });
}

// virtualDefaultSource: the manifest-derived projection when
// presentationObjectId is a virtual default (item 5b) — no row exists, and
// duplicating IS the customize path, so the copy is materialized from the
// derivation instead of a source row.
export async function duplicatePresentationObject(
  projectDb: Sql,
  presentationObjectId: string,
  label: string,
  folderId: string | null | undefined,
  virtualDefaultSource: DerivedDefaultVisualization | null,
): Promise<
  APIResponseWithData<{ newPresentationObjectId: string; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<DBPresentationObject[]>`
SELECT * FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined && virtualDefaultSource === null) {
      throw new Error("No presentation object with this id");
    }
    const sourceMetricId = rawPresObj?.metric_id ??
      virtualDefaultSource!.metricId;
    const sourceConfig = rawPresObj?.config ??
      JSON.stringify(
        presentationObjectConfigSchema.parse(virtualDefaultSource!.config),
      );
    const newPresentationObjectId =
      await generateUniquePresentationObjectId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
INSERT INTO presentation_objects
  (id, metric_id, is_default_visualization, label, config, last_updated, folder_id)
VALUES
  (
    ${newPresentationObjectId},
    ${sourceMetricId},
    ${false},
    ${label.trim()},
    ${sourceConfig},
    ${lastUpdated},
    ${folderId ?? null}
  )
`;
    return { success: true, data: { newPresentationObjectId, lastUpdated } };
  });
}

function configToSummary(row: DBPresentationObject, config: PresentationObjectConfig): PresentationObjectSummary {
  return {
    id: row.id,
    metricId: row.metric_id,
    label: row.label,
    isDefault: row.is_default_visualization,
    replicateBy: getReplicateByProp(config),
    isFiltered: config.d.filterBy.length > 0 || !!config.d.periodFilter,
    type: config.d.type,
    disaggregateBy: config.d.disaggregateBy.map(d => d.disOpt),
    filterBy: config.d.filterBy,
    createdByAI: row.created_by_ai,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    lastUpdated: row.last_updated,
  };
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
    const presentationObjects = rows
      .map<PresentationObjectSummary>((row) => {
        const config = parsePresentationObjectConfig(row.config);
        return configToSummary(row, config);
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

    const resResultsValue = await resolveMetricById(
      mainDb,
      projectDb,
      rawPresObj.metric_id,
    );
    throwIfErrWithData(resResultsValue);

    const presObj: PresentationObjectDetail = {
      id: rawPresObj.id,
      projectId,
      resultsValue: resResultsValue.data.resultsValue,
      lastUpdated: rawPresObj.last_updated,
      label: rawPresObj.label,
      config: parsePresentationObjectConfig(rawPresObj.config),
      isDefault: rawPresObj.is_default_visualization,
      folderId: rawPresObj.folder_id,
    };
    return { success: true, data: presObj };
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
    await projectDb`
UPDATE presentation_objects
SET
  config = ${JSON.stringify(presentationObjectConfigSchema.parse(config))},
  last_updated = ${lastUpdated}
WHERE id = ${presentationObjectId}
`;
    return {
      success: true,
      data: { lastUpdated },
    };
  });
}

// ── Collab (visualization editor) room support ──────────────────────────────

// Lightweight config loader for the collab room's load() — the room needs only
// the config (no resultsValue/mainDb resolution like getPresentationObjectDetail).
// Returns null (inside a success) when the row is absent; carries isDefault so
// the room deps can refuse to open a room for a read-only default visualization.
export async function getPresentationObjectConfigRow(
  projectDb: Sql,
  presentationObjectId: string,
): Promise<
  APIResponseWithData<
    { config: PresentationObjectConfig; isDefault: boolean } | null
  >
> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<{ config: string; is_default_visualization: boolean }[]>`
SELECT config, is_default_visualization FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (!row) return { success: true, data: null };
    return {
      success: true,
      data: {
        config: parsePresentationObjectConfig(row.config),
        isDefault: row.is_default_visualization,
      },
    };
  });
}

// Read the persisted Yjs CRDT state for a visualization (collab rooms). Returns
// the base64 state only if it is CURRENT — crdt_state_last_updated matches the
// PO's last_updated; otherwise the PO was edited outside collab since the state
// was saved, so the room must re-seed from config (which is always safe).
export async function getPresentationObjectCrdtState(
  projectDb: Sql,
  presentationObjectId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<
        {
          crdt_state: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
SELECT crdt_state, crdt_state_last_updated, last_updated FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (!row) {
      throw new Error("No presentation object with this id");
    }
    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;
    return { success: true, data: { state: isCurrent ? row.crdt_state : null } };
  });
}

// Collab checkpoint: persist the config AND the Yjs CRDT state atomically
// (collab is authoritative → always overwrites, no conflict check). Plain
// write — POLICY LIVES IN THE CALLER (the PO room's save closure in
// routes/project/project-collab.ts): `storedConfig` must already be
// schema-parsed with schema-invalid transients dropped, and `crdtTrusted`
// says whether the doc materializes to exactly `storedConfig`. When trusted,
// crdt_state_last_updated is stamped equal to last_updated so the state
// reads back as current; when not, it is stamped NULL so the next room open
// re-seeds from config instead of restoring a doc that disagrees with the
// row (which every editor open would adopt, visibly "flipping" the viz ~1s
// after open). Refuses default visualizations (read-only) — a room should
// never have been opened for one.
export async function savePresentationObjectCheckpoint(
  projectDb: Sql,
  presentationObjectId: string,
  storedConfig: PresentationObjectConfig,
  crdtState: string,
  crdtTrusted: boolean,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await projectDb`
UPDATE presentation_objects
SET
  config = ${JSON.stringify(storedConfig)},
  crdt_state = ${crdtState},
  crdt_state_last_updated = ${crdtTrusted ? lastUpdated : null},
  last_updated = ${lastUpdated}
WHERE id = ${presentationObjectId} AND is_default_visualization = FALSE
RETURNING id
`;
    if (rows.length === 0) {
      throw new Error("Presentation object not found (or is a default)");
    }
    return { success: true, data: { lastUpdated } };
  });
}

export async function batchUpdatePresentationObjectsPeriodFilter(
  projectDb: Sql,
  presentationObjectIds: string[],
  periodFilter: PeriodFilter | undefined,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    updatedCount: number;
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    if (presentationObjectIds.length === 0) {
      return {
        success: true,
        data: { lastUpdated: new Date().toISOString(), updatedCount: 0 },
      };
    }

    const defaultRows = await projectDb<{ id: string }[]>`
      SELECT id FROM presentation_objects
      WHERE id IN ${projectDb(presentationObjectIds)}
        AND is_default_visualization = TRUE
    `;
    if (defaultRows.length > 0) {
      return {
        success: false,
        err: "You cannot update a default visualization",
      };
    }

    const lastUpdated = new Date().toISOString();

    await projectDb.begin(async (sql: Sql) => {
      for (const id of presentationObjectIds) {
        const result = await sql<DBPresentationObject[]>`
          SELECT config FROM presentation_objects WHERE id = ${id}
        `;

        if (result.length === 0) {
          throw new Error(`Presentation object ${id} not found`);
        }

        const config: PresentationObjectConfig =
          parsePresentationObjectConfig(result[0].config);

        config.d.periodFilter = periodFilter;

        await sql`
          UPDATE presentation_objects
          SET config = ${JSON.stringify(presentationObjectConfigSchema.parse(config))},
              last_updated = ${lastUpdated}
          WHERE id = ${id}
        `;
      }
    });

    return {
      success: true,
      data: {
        lastUpdated,
        updatedCount: presentationObjectIds.length,
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
