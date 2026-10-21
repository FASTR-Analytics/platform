// The apply of the DHIS2 id repair: one transaction per instance that
// re-checks every precondition against the live tables, writes the plan,
// and resolves the dictionary as written before commit. Any failure throws
// and rolls the whole apply back.

import type { Sql } from "postgres";
import { type HmisIndicatorDefinition, parseJsonOrThrow } from "lib";
import {
  checkDefinitionsResolve,
  getHmisIndicators,
  type IndicatorInsert,
  insertIndicators,
  renameReferences,
  writeMembers,
} from "../db/instance/indicators.ts";
import { assertNoRunningDatasetHmisImportRun } from "../db/instance/dataset_hmis_import_runs.ts";
import { readRowSpans, readStaleLedgerCounts } from "./gather.ts";
import {
  type Dhis2IdFixAction,
  type Dhis2IdFixOutcome,
  type Dhis2IdFixPlan,
  type Dhis2IdFixRowSpan,
  type Dhis2IdFixStaleLedgerRows,
  type Dhis2IdFixSumRewrite,
  rewriteSumMembers,
  sumMemberChanges,
} from "./plan.ts";

export type Dhis2IdFixActionResult = {
  indicatorId: string;
  outcome: Dhis2IdFixAction["outcome"];
  rowsMoved: number;
  rowsDeleted: number;
};

export type Dhis2IdFixApplyResult = {
  versionId: number | null;
  actions: Dhis2IdFixActionResult[];
  sumsRewritten: string[];
  staleLedgerRowsDeleted: number;
};

// The file `apply` was given against the plan recomputed from live state,
// `plannedAt` aside. Each difference is one line a person can read.
export function diffDhis2IdFixPlans(
  given: Dhis2IdFixPlan,
  recomputed: Dhis2IdFixPlan,
): string[] {
  const differences: string[] = [];
  const scalar = (
    key: "dhis2Url" | "elementsChecked" | "elementsHealthy",
  ) => {
    if (given[key] !== recomputed[key]) {
      differences.push(
        `${key}: the plan says ${
          JSON.stringify(given[key])
        }, live state gives ${JSON.stringify(recomputed[key])}`,
      );
    }
  };
  scalar("dhis2Url");
  scalar("elementsChecked");
  scalar("elementsHealthy");
  const byKey = <T>(items: T[], key: (item: T) => string) =>
    new Map(items.map((item) => [key(item), JSON.stringify(item)]));
  const compare = <T>(
    label: string,
    a: T[],
    b: T[],
    key: (item: T) => string,
  ) => {
    const planned = byKey(a, key);
    const live = byKey(b, key);
    for (const [k, v] of planned) {
      const other = live.get(k);
      if (other === undefined) {
        differences.push(`${label} ${k}: in the plan, not in live state`);
      } else if (other !== v) {
        differences.push(`${label} ${k}: plan ${v}, live ${other}`);
      }
    }
    for (const k of live.keys()) {
      if (!planned.has(k)) {
        differences.push(`${label} ${k}: in live state, not in the plan`);
      }
    }
  };
  compare("action", given.actions, recomputed.actions, (a) => a.indicatorId);
  compare(
    "created element",
    given.createdElements,
    recomputed.createdElements,
    (c) => c.dataId,
  );
  compare(
    "sum rewrite",
    given.sumRewrites,
    recomputed.sumRewrites,
    (s) => s.sumId,
  );
  compare(
    "stale ledger rows",
    given.staleLedgerRows,
    recomputed.staleLedgerRows,
    (s) => s.indicatorId,
  );
  return differences;
}

class PreconditionFailed extends Error {}

function fail(message: string): never {
  throw new PreconditionFailed(message);
}

// The live state the preconditions read, through the same reads the planner's
// facts come from, once for the whole plan.
type LiveState = {
  definitions: Map<string, HmisIndicatorDefinition>;
  holders: Map<string, string>;
  rows: Record<string, Dhis2IdFixRowSpan>;
  staleLedger: Record<string, number>;
};

async function readLiveState(
  sql: Sql,
  plan: Dhis2IdFixPlan,
): Promise<LiveState> {
  const indicators = await getHmisIndicators(sql);
  return {
    definitions: new Map(
      indicators.map((i) => [i.indicator_common_id, i.definition]),
    ),
    holders: new Map(
      indicators.flatMap((i) =>
        i.definition.type === "uploaded" ||
          i.definition.type === "dhis2_element"
          ? [[i.definition.data_id, i.indicator_common_id]]
          : []
      ),
    ),
    rows: await readRowSpans(sql, plan.actions.map((a) => a.dataId)),
    staleLedger: await readStaleLedgerCounts(
      sql,
      plan.staleLedgerRows.map((s) => s.dataId),
    ),
  };
}

async function checkPreconditions(
  sql: Sql,
  plan: Dhis2IdFixPlan,
): Promise<void> {
  await assertNoRunningDatasetHmisImportRun(sql);
  const stored = await sql<{ url: string }[]>`
    SELECT url FROM instance_dhis2_credentials
  `;
  const url = stored.at(0)?.url;
  if (url !== plan.dhis2Url) {
    fail(
      `The stored DHIS2 URL is ${JSON.stringify(url)}, the plan's is ${
        JSON.stringify(plan.dhis2Url)
      }`,
    );
  }
  const live = await readLiveState(sql, plan);
  for (const action of plan.actions) {
    const current = live.definitions.get(action.indicatorId);
    if (
      current?.type !== "dhis2_element" || current.data_id !== action.dataId
    ) {
      fail(
        `${action.indicatorId} is no longer a DHIS2 element under ${action.dataId}`,
      );
    }
    const count = live.rows[action.dataId]?.count ?? 0;
    if (count !== action.rows.count) {
      fail(
        `${action.indicatorId} has ${count} rows, the plan counted ${action.rows.count}`,
      );
    }
    if (action.outcome === "retarget") {
      const holder = live.holders.get(action.newDataId);
      if (holder !== undefined) {
        fail(`${action.newDataId} is now held by ${holder}`);
      }
    }
    if (action.outcome === "duplicate") {
      const holder = live.holders.get(action.holderDataId);
      if (holder !== action.holder) {
        fail(
          `${action.holderDataId} is held by ${
            holder ?? "no indicator"
          }, the plan's holder is ${action.holder}`,
        );
      }
    }
  }
  for (const created of plan.createdElements) {
    const holder = live.holders.get(created.dataId);
    if (holder !== undefined) {
      fail(`${created.dataId} is now held by ${holder}`);
    }
    if (live.definitions.has(created.indicatorId)) {
      fail(`Indicator id ${created.indicatorId} is taken`);
    }
  }
  const changes = sumMemberChanges(plan.actions);
  for (const rewrite of plan.sumRewrites) {
    checkSumRewrite(rewrite, changes, live);
  }
  const toUploaded = new Map(
    plan.actions
      .filter((a) => a.outcome === "to_uploaded")
      .map((a) => [a.indicatorId, a.dataId]),
  );
  for (const stale of plan.staleLedgerRows) {
    checkStaleLedgerRows(stale, toUploaded, live);
  }
}

// The indicator is Uploaded under the data id, or becomes so by an action
// of this plan, and the stale rows are the ones the plan counted.
function checkStaleLedgerRows(
  stale: Dhis2IdFixStaleLedgerRows,
  toUploaded: Map<string, string>,
  live: LiveState,
): void {
  const current = live.definitions.get(stale.indicatorId);
  const uploaded = current?.type === "uploaded" &&
    current.data_id === stale.dataId;
  if (!uploaded && toUploaded.get(stale.indicatorId) !== stale.dataId) {
    fail(`${stale.indicatorId} is not Uploaded under ${stale.dataId}`);
  }
  const count = live.staleLedger[stale.dataId] ?? 0;
  if (count !== stale.count) {
    fail(
      `${stale.indicatorId} has ${count} stale ledger rows, the plan counted ${stale.count}`,
    );
  }
}

async function deleteStaleLedgerRows(
  sql: Sql,
  stale: Dhis2IdFixStaleLedgerRows[],
): Promise<number> {
  if (stale.length === 0) return 0;
  const deleted = await sql`
    DELETE FROM dataset_hmis_import_ledger
    WHERE data_id = ANY(${stale.map((s) => s.dataId)})
      AND status = 'error' AND n_records = 0
  `;
  return deleted.count;
}

// The rewrite recomputed from the Sum's live members must be the plan's.
function checkSumRewrite(
  rewrite: Dhis2IdFixSumRewrite,
  changes: Map<string, Dhis2IdFixOutcome>,
  live: LiveState,
): void {
  const sum = live.definitions.get(rewrite.sumId);
  if (sum?.type !== "sum") {
    fail(`${rewrite.sumId} is no longer a Sum`);
  }
  const rewritten = rewriteSumMembers(sum.members, changes);
  if (
    rewritten === undefined ||
    JSON.stringify(rewritten) !== JSON.stringify(rewrite.members)
  ) {
    fail(
      `Sum ${rewrite.sumId} no longer names the members the plan read: its rewrite would be [${
        (rewritten ?? sum.members).join(", ")
      }], the plan's is [${rewrite.members.join(", ")}]`,
    );
  }
  if (rewrite.members.length === 0) {
    fail(`Sum ${rewrite.sumId} would be left with no members`);
  }
}

async function deleteRowsAndLedger(
  sql: Sql,
  dataId: string,
): Promise<number> {
  await sql`DELETE FROM dataset_hmis_import_ledger WHERE data_id = ${dataId}`;
  const deleted = await sql`DELETE FROM dataset_hmis WHERE data_id = ${dataId}`;
  return deleted.count;
}

// The ledger FK is not deferrable, so its rows cannot reference the old key
// while the indicator moves: they are copied aside, removed, and written
// back under the new key once the indicator and the data rows hold it.
async function retarget(
  sql: Sql,
  action: Extract<Dhis2IdFixAction, { outcome: "retarget" }>,
): Promise<number> {
  await sql`
    CREATE TEMP TABLE dhis2_id_fix_ledger AS
    SELECT * FROM dataset_hmis_import_ledger WHERE data_id = ${action.dataId}
  `;
  await sql`DELETE FROM dataset_hmis_import_ledger WHERE data_id = ${action.dataId}`;
  await sql`
    UPDATE indicators
    SET data_id = ${action.newDataId}, dhis2_label = ${action.dhis2Label},
      updated_at = CURRENT_TIMESTAMP
    WHERE indicator_common_id = ${action.indicatorId}
  `;
  const moved = await sql`
    UPDATE dataset_hmis SET data_id = ${action.newDataId}
    WHERE data_id = ${action.dataId}
  `;
  await sql`
    INSERT INTO dataset_hmis_import_ledger (
      data_id, period_id, n_records, sum_count, skipped_values,
      skipped_values_sample, route, status, error, imported_at, version_id
    )
    SELECT ${action.newDataId}, period_id, n_records, sum_count, skipped_values,
      skipped_values_sample, route, status, error, imported_at, version_id
    FROM dhis2_id_fix_ledger
  `;
  await sql`DROP TABLE dhis2_id_fix_ledger`;
  return moved.count;
}

async function applyAction(
  sql: Sql,
  action: Dhis2IdFixAction,
): Promise<Dhis2IdFixActionResult> {
  const result = {
    indicatorId: action.indicatorId,
    outcome: action.outcome,
    rowsMoved: 0,
    rowsDeleted: 0,
  };
  switch (action.outcome) {
    case "retarget":
      result.rowsMoved = await retarget(sql, action);
      break;
    case "to_sum":
      result.rowsDeleted = await deleteRowsAndLedger(sql, action.dataId);
      await sql`
        UPDATE indicators
        SET definition_type = 'sum', data_id = NULL, dhis2_label = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${action.indicatorId}
      `;
      await writeMembers(sql, action.indicatorId, action.members);
      break;
    case "to_calculated":
      result.rowsDeleted = await deleteRowsAndLedger(sql, action.dataId);
      await sql`
        UPDATE indicators
        SET definition_type = 'calculated', data_id = NULL, dhis2_label = NULL,
          expression = ${action.expression}, format_as = ${action.formatAs},
          thresholds = NULL, target = NULL, expected_low_counts = FALSE,
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${action.indicatorId}
      `;
      break;
    case "to_uploaded":
      await sql`
        UPDATE indicators
        SET definition_type = 'uploaded', dhis2_label = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${action.indicatorId}
      `;
      break;
    case "duplicate":
      if (action.includeHolderInAnalysis) {
        await sql`
          UPDATE indicators
          SET include_in_analysis = TRUE, updated_at = CURRENT_TIMESTAMP
          WHERE indicator_common_id = ${action.holder}
        `;
      }
      result.rowsDeleted = await deleteRowsAndLedger(sql, action.dataId);
      await sql`
        DELETE FROM indicators WHERE indicator_common_id = ${action.indicatorId}
      `;
      break;
  }
  return result;
}

// One version row for the whole apply, negative like a windowed deletion's,
// so the dataset summaries' stamp moves and the deletion is on record.
async function mintDeletionVersion(
  sql: Sql,
  rowsDeleted: number,
  indicators: string[],
): Promise<number> {
  const max = await sql<{ max: number | null }[]>`
    SELECT MAX(id) AS max FROM dataset_hmis_versions
  `;
  const versionId = (max[0].max ?? 0) + 1;
  await sql`
    INSERT INTO dataset_hmis_versions
      (id, n_rows_total_imported, n_rows_inserted, n_rows_updated, staging_result)
    VALUES (${versionId}, ${-rowsDeleted}, ${-rowsDeleted}, 0, ${
    JSON.stringify({
      kind: "deletion",
      rowsDeleted,
      dateImported: new Date().toISOString(),
      indicators,
    })
  })
  `;
  return versionId;
}

async function checkDictionaryResolves(sql: Sql): Promise<void> {
  const unresolved = await checkDefinitionsResolve(sql, new Map());
  if (unresolved !== undefined) fail(unresolved);
  const empty = await sql<{ indicator_common_id: string }[]>`
    SELECT i.indicator_common_id FROM indicators i
    WHERE i.definition_type = 'sum'
      AND NOT EXISTS (
        SELECT 1 FROM indicator_sum_members m WHERE m.sum_id = i.indicator_common_id
      )
  `;
  if (empty.length > 0) {
    fail(
      `A Sum has no members: ${
        empty.map((r) => r.indicator_common_id).join(", ")
      }`,
    );
  }
}

export async function applyDhis2IdFix(
  mainDb: Sql,
  plan: Dhis2IdFixPlan,
): Promise<Dhis2IdFixApplyResult> {
  return await mainDb.begin(async (sql) => {
    // Dictionary writes wait for the apply, so the preconditions hold
    // through the writes.
    await sql`LOCK TABLE indicators IN SHARE ROW EXCLUSIVE MODE`;
    await checkPreconditions(sql, plan);
    // A retarget moves the indicator's key before its rows.
    await sql`SET CONSTRAINTS dataset_hmis_data_id_fkey DEFERRED`;

    await insertIndicators(
      sql,
      plan.createdElements.map((created): IndicatorInsert => ({
        indicator_common_id: created.indicatorId,
        indicator_common_label: created.label,
        definition: { type: "dhis2_element", data_id: created.dataId },
        dhis2_label: created.label,
        include_in_analysis: false,
        format_as: "number",
        thresholds: null,
        direction: "higher-is-better",
        target: null,
        expected_low_counts: false,
      })),
    );
    // A Sum may name only an indicator that exists and has rows (the member
    // FK cascades the has_rows flag into a CHECK and blocks a delete), so
    // every Sum stops naming an indicator an action retypes or deletes before
    // the actions run.
    for (const rewrite of plan.sumRewrites) {
      await writeMembers(sql, rewrite.sumId, rewrite.members);
      await sql`
        UPDATE indicators SET updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${rewrite.sumId}
      `;
    }
    await renameReferences(
      sql,
      new Map(
        plan.actions.flatMap((a): [string, string][] =>
          a.outcome === "duplicate" ? [[a.indicatorId, a.holder]] : []
        ),
      ),
    );
    const actions: Dhis2IdFixActionResult[] = [];
    for (const action of plan.actions) {
      actions.push(await applyAction(sql, action));
    }
    const staleLedgerRowsDeleted = await deleteStaleLedgerRows(
      sql,
      plan.staleLedgerRows,
    );
    const rowsDeleted = actions.reduce((n, a) => n + a.rowsDeleted, 0);
    const versionId = rowsDeleted > 0
      ? await mintDeletionVersion(
        sql,
        rowsDeleted,
        actions.filter((a) => a.rowsDeleted > 0).map((a) => a.indicatorId),
      )
      : null;
    await checkDictionaryResolves(sql);
    return {
      versionId,
      actions,
      sumsRewritten: plan.sumRewrites.map((s) => s.sumId),
      staleLedgerRowsDeleted,
    };
  });
}

export function isDhis2IdFixPlanFile(value: unknown): value is Dhis2IdFixPlan {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.dhis2Url === "string" && typeof v.plannedAt === "string" &&
    typeof v.elementsChecked === "number" &&
    typeof v.elementsHealthy === "number" &&
    Array.isArray(v.createdElements) && Array.isArray(v.actions) &&
    Array.isArray(v.sumRewrites) && Array.isArray(v.staleLedgerRows);
}

export function readDhis2IdFixPlanFile(text: string): Dhis2IdFixPlan {
  const parsed = parseJsonOrThrow<unknown>(text);
  if (!isDhis2IdFixPlanFile(parsed)) {
    throw new Error("The input is not a plan file written by `plan`");
  }
  return parsed;
}
