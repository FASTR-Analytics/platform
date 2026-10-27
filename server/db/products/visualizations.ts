import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type FigureBundle,
  figureBundleSchema,
  parseJsonOrThrow,
  type VisualizationDetail,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { touchProduct, VISUALIZATION_NOT_FOUND } from "./_product_row.ts";

// The two columns every bundle write sets beside the bundle: what it was
// resolved under, copied out of the JSON so the product summary reads its
// staleness without the bundle (see the table's note in _main_database.sql).
export function visualizationResolvedPair(
  bundle: FigureBundle,
): { resolved_run_id: string; resolved_definition_hash: string } {
  return {
    resolved_run_id: bundle.provenance.runId,
    resolved_definition_hash: bundle.scope.definitionHash,
  };
}

// A visualization's version is the product's stamp (as for a report); every
// read that compares the CRDT stamp against it joins the registry.
type VisualizationStampRow = {
  crdt_state: string | null;
  crdt_state_last_updated: string | null;
  last_updated: string;
};

export async function getVisualizationDetail(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<VisualizationDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        { id: string; label: string; bundle: string; last_updated: string }[]
      >`
        SELECT v.id, p.label, v.bundle, p.last_updated
        FROM visualizations v
        INNER JOIN products p ON p.id = v.id
        WHERE v.id = ${productId}
      `
    ).at(0);
    if (!row) {
      throw new Error(VISUALIZATION_NOT_FOUND);
    }
    return {
      success: true,
      data: {
        id: row.id,
        label: row.label,
        bundle: parseJsonOrThrow<FigureBundle>(row.bundle),
        lastUpdated: row.last_updated,
      },
    };
  });
}

// A non-collab bundle write (no room live). The bundle is parsed here, so a
// caller cannot store one the checkpoint would refuse. Bumps the product
// alone, which leaves the CRDT state stale: the next room open re-seeds from
// this content.
export async function updateVisualizationBundle(
  mainDb: Sql,
  productId: string,
  bundle: FigureBundle,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const parsed = figureBundleSchema.parse(bundle);
    const lastUpdated = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "visualization", lastUpdated);
      await sql`
        UPDATE visualizations
        SET ${
        sql({
          bundle: JSON.stringify(parsed),
          ...visualizationResolvedPair(parsed),
        })
      }
        WHERE id = ${productId}
      `;
    });
    return { success: true, data: { lastUpdated } };
  });
}

// The persisted Yjs CRDT state (collab rooms), current only while
// crdt_state_last_updated matches the PRODUCT's last_updated.
export async function getVisualizationCrdtState(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<VisualizationStampRow[]>`
        SELECT v.crdt_state, v.crdt_state_last_updated, p.last_updated
        FROM visualizations v
        INNER JOIN products p ON p.id = v.id
        WHERE v.id = ${productId}
      `
    ).at(0);
    if (!row) {
      throw new Error(VISUALIZATION_NOT_FOUND);
    }
    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;
    return {
      success: true,
      data: { state: isCurrent ? row.crdt_state : null },
    };
  });
}

// Collab checkpoint: the materialized bundle AND the Yjs state in one
// transaction, always overwriting (collab is authoritative). Policy lives in
// the caller (prepareVisualizationCheckpoint): the bundle is already parsed,
// and `crdtTrusted` false stamps NULL so the next room open re-seeds.
export async function saveVisualizationCheckpoint(
  mainDb: Sql,
  productId: string,
  bundle: FigureBundle,
  crdtState: string,
  crdtTrusted: boolean,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "visualization", lastUpdated);
      await sql`
        UPDATE visualizations
        SET ${
        sql({
          bundle: JSON.stringify(bundle),
          ...visualizationResolvedPair(bundle),
          crdt_state: crdtState,
          crdt_state_last_updated: crdtTrusted ? lastUpdated : null,
        })
      }
        WHERE id = ${productId}
      `;
    });
    return { success: true, data: { lastUpdated } };
  });
}

// The visualization half of createVisualization: runs INSIDE its
// transaction, after the new `products` row exists.
export async function insertNewVisualizationDetail(
  sql: Sql,
  productId: string,
  bundle: FigureBundle,
): Promise<void> {
  const parsed = figureBundleSchema.parse(bundle);
  await sql`
    INSERT INTO visualizations ${
    sql({
      id: productId,
      bundle: JSON.stringify(parsed),
      ...visualizationResolvedPair(parsed),
    })
  }
  `;
}

// The visualization half of duplicateProduct: runs INSIDE its transaction,
// after the new `products` row exists. The bundle is copied verbatim; the
// CRDT state is not, so the copy's first room seeds a lineage of its own.
export async function duplicateVisualizationDetail(
  sql: Sql,
  productId: string,
  newProductId: string,
): Promise<void> {
  const rows = await sql`
    INSERT INTO visualizations
      (id, bundle, resolved_run_id, resolved_definition_hash)
    SELECT ${newProductId}, bundle, resolved_run_id, resolved_definition_hash
    FROM visualizations WHERE id = ${productId}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(VISUALIZATION_NOT_FOUND);
  }
}
