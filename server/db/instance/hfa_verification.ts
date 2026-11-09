import type { Sql, TransactionSql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  HFA_VERIFICATION_MODEL_RULE_IDS,
  type HfaVerificationFinding,
  type HfaVerificationModelRuleId,
  type HfaVerificationNewFinding,
  type HfaVerificationNotChecked,
  type HfaVerificationResult,
  type HfaVerificationRows,
  hfaVerificationRulesOffSchema,
  type HfaVerificationRunState,
  type HfaVerificationRunStatus,
  parseJsonOrThrow,
  t3,
} from "lib";
import { isHUser } from "../../auth/operators.ts";
import { instantiateHfaVerificationWorker } from "../../worker_routines/hfa_verification/instantiate_worker.ts";
import { clearWorker, setWorker } from "../../worker_routines/worker_store.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type {
  DBHfaIndicatorVerification,
  DBHfaVerificationFinding,
  DBHfaVerificationRun,
} from "./_main_database_types.ts";

const RULES_OFF_KEY = "hfa_verification_rules_off";

export async function getHfaVerificationRulesOff(
  sql: Sql,
): Promise<HfaVerificationModelRuleId[]> {
  const row = (
    await sql<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config
      WHERE config_key = ${RULES_OFF_KEY}
    `
  ).at(0);
  return row === undefined
    ? []
    : hfaVerificationRulesOffSchema.parse(JSON.parse(row.config_json_value));
}

function findingFromRow(row: DBHfaVerificationFinding): HfaVerificationFinding {
  return {
    id: row.id,
    indicatorId: row.indicator_id,
    rule: row.rule as HfaVerificationModelRuleId,
    timePoint: row.time_point,
    message: row.message,
    suggestion: row.suggestion,
    dismissedAt: row.dismissed_at?.toISOString() ?? null,
    dismissedBy: row.dismissed_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getHfaVerification(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaVerificationRows>> {
  return await tryCatchDatabaseAsync(async () => {
    const [verifications, findings, rulesOff] = await Promise.all([
      mainDb<DBHfaIndicatorVerification[]>`
        SELECT * FROM hfa_indicator_verifications ORDER BY indicator_id
      `,
      mainDb<DBHfaVerificationFinding[]>`
        SELECT * FROM hfa_verification_findings
        ORDER BY indicator_id, created_at, id
      `,
      getHfaVerificationRulesOff(mainDb),
    ]);
    return {
      success: true,
      data: {
        verifications: verifications.map((r) => ({
          indicatorId: r.indicator_id,
          inputHash: r.input_hash,
          model: r.model,
          verifiedAt: r.verified_at.toISOString(),
          verifiedBy: r.verified_by,
        })),
        findings: findings.map(findingFromRow),
        rulesOff,
      },
    };
  });
}

type DismissedPair = { rule: string; timePoint: string | null };

// What a result leaves to insert: findings about a round that is not a time
// point dropped, so one bad round does not fail the save; findings sharing a
// rule and round merged into one; and findings of a dismissed rule dropped,
// for its round, or every round when the dismissed finding was about the
// whole indicator. A returned finding about the whole indicator is not
// suppressed by a dismissal of one round.
function findingsToInsert(
  findings: HfaVerificationNewFinding[],
  timePoints: ReadonlySet<string>,
  dismissed: DismissedPair[],
): HfaVerificationNewFinding[] {
  const merged = new Map<string, HfaVerificationNewFinding>();
  for (const f of findings) {
    if (f.timePoint !== null && !timePoints.has(f.timePoint)) continue;
    if (
      dismissed.some((d) =>
        d.rule === f.rule &&
        (d.timePoint === null || d.timePoint === f.timePoint)
      )
    ) continue;
    const key = `${f.rule}\u0000${f.timePoint ?? ""}`;
    const same = merged.get(key);
    merged.set(
      key,
      same === undefined ? f : {
        ...same,
        message: `${same.message}\n\n${f.message}`,
        suggestion: same.suggestion === null
          ? f.suggestion
          : f.suggestion === null
          ? same.suggestion
          : `${same.suggestion}\n\n${f.suggestion}`,
      },
    );
  }
  return [...merged.values()];
}

// Each indicator's verification row is replaced, its undismissed findings are
// replaced by what the result leaves, and its dismissed findings stay, inside
// the caller's transaction. A result for an indicator deleted since the run
// read it is skipped; a later result for the same indicator wins. The
// indicators and time points read are key-share-locked: a delete or a round
// rename waits for the save; an edit or an import's stamp does not.
export async function saveHfaIndicatorVerifications(
  sql: TransactionSql,
  results: HfaVerificationResult[],
  verifiedBy: string,
): Promise<void> {
  const byIndicator = new Map(results.map((r) => [r.indicatorId, r]));
  const existing = new Set(
    (await sql<{ indicator_id: string }[]>`
      SELECT indicator_id FROM hfa_indicators
      WHERE indicator_id = ANY(${[...byIndicator.keys()]})
      FOR KEY SHARE
    `).map((r) => r.indicator_id),
  );
  const kept = [...byIndicator.values()].filter((r) =>
    existing.has(r.indicatorId)
  );
  if (kept.length === 0) return;
  const ids = kept.map((r) => r.indicatorId);
  const [{ now }] = await sql<{ now: Date }[]>`SELECT now() AS now`;
  const timePoints = new Set(
    (await sql<{ label: string }[]>`
      SELECT label FROM hfa_time_points FOR KEY SHARE
    `).map((r) => r.label),
  );
  const dismissed = new Map<string, DismissedPair[]>();
  for (
    const d of await sql<
      { indicator_id: string; rule: string; time_point: string | null }[]
    >`
      SELECT indicator_id, rule, time_point FROM hfa_verification_findings
      WHERE indicator_id = ANY(${ids}) AND dismissed_at IS NOT NULL
    `
  ) {
    const list = dismissed.get(d.indicator_id) ?? [];
    list.push({ rule: d.rule, timePoint: d.time_point });
    dismissed.set(d.indicator_id, list);
  }
  await sql`
    INSERT INTO hfa_indicator_verifications ${
    sql(
      kept.map((r) => ({
        indicator_id: r.indicatorId,
        input_hash: r.inputHash,
        model: r.model,
        verified_at: now,
        verified_by: verifiedBy,
      })),
      "indicator_id",
      "input_hash",
      "model",
      "verified_at",
      "verified_by",
    )
  }
    ON CONFLICT (indicator_id) DO UPDATE SET
      input_hash = EXCLUDED.input_hash,
      model = EXCLUDED.model,
      verified_at = EXCLUDED.verified_at,
      verified_by = EXCLUDED.verified_by
  `;
  await sql`
    DELETE FROM hfa_verification_findings
    WHERE indicator_id = ANY(${ids}) AND dismissed_at IS NULL
  `;
  const rows = kept.flatMap((r) =>
    findingsToInsert(
      r.findings,
      timePoints,
      dismissed.get(r.indicatorId) ?? [],
    ).map((f) => ({
      id: crypto.randomUUID(),
      indicator_id: r.indicatorId,
      rule: f.rule,
      time_point: f.timePoint,
      message: f.message,
      suggestion: f.suggestion,
      created_at: now,
    }))
  );
  if (rows.length > 0) {
    await sql`
      INSERT INTO hfa_verification_findings ${
      sql(
        rows,
        "id",
        "indicator_id",
        "rule",
        "time_point",
        "message",
        "suggestion",
        "created_at",
      )
    }
    `;
  }
}

// A finding already in the asked state keeps its stamp.
export async function setHfaVerificationFindingsDismissed(
  mainDb: Sql,
  findingIds: string[],
  dismissed: boolean,
  by: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (dismissed) {
      await mainDb`
        UPDATE hfa_verification_findings
        SET dismissed_at = now(), dismissed_by = ${by}
        WHERE id = ANY(${findingIds}) AND dismissed_at IS NULL
      `;
    } else {
      await mainDb`
        UPDATE hfa_verification_findings
        SET dismissed_at = NULL, dismissed_by = NULL
        WHERE id = ANY(${findingIds}) AND dismissed_at IS NOT NULL
      `;
    }
    return { success: true };
  });
}

// Stored in the rules list's order, so one set of switches is one value.
export async function setHfaVerificationRulesOff(
  mainDb: Sql,
  ruleIds: HfaVerificationModelRuleId[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const off = new Set(ruleIds);
    const value = JSON.stringify(
      HFA_VERIFICATION_MODEL_RULE_IDS.filter((id) => off.has(id)),
    );
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES (${RULES_OFF_KEY}, ${value})
      ON CONFLICT (config_key) DO UPDATE SET config_json_value = ${value}
    `;
    return { success: true };
  });
}

// Moves on every write: a save moves the verification and finding stamps
// and counts, a dismissal or an undismissal moves the dismissed count, a
// rule switch moves the config value, and a round rename, which cascades into
// the findings, moves the rounds they name.
export async function getHfaVerificationVersion(mainDb: Sql): Promise<string> {
  const result = await mainDb<{ version: string | null }[]>`
    SELECT MD5(
      COALESCE((SELECT MAX(verified_at) FROM hfa_indicator_verifications)::text, '') || '|' ||
      (SELECT COUNT(*) FROM hfa_indicator_verifications)::text || '|' ||
      COALESCE((SELECT MAX(created_at) FROM hfa_verification_findings)::text, '') || '|' ||
      (SELECT COUNT(*) FROM hfa_verification_findings)::text || '|' ||
      (SELECT COUNT(dismissed_at) FROM hfa_verification_findings)::text || '|' ||
      COALESCE((SELECT MAX(dismissed_at) FROM hfa_verification_findings)::text, '') || '|' ||
      COALESCE((SELECT string_agg(DISTINCT time_point, ',' ORDER BY time_point) FROM hfa_verification_findings), '') || '|' ||
      COALESCE((
        SELECT config_json_value FROM instance_config WHERE config_key = ${RULES_OFF_KEY}
      ), '')
    ) AS version
  `;
  return result[0]?.version ?? "none";
}

// Every transaction on a run takes the run row before any queue row, so an
// answer, a start, a stop and the end cannot deadlock one another.

// Serializes starts, so two with no live run cannot both create one.
const HFA_VERIFICATION_RUN_ADVISORY_LOCK_KEY = 727403;

export type HfaVerificationQueued =
  | { kind: "stopping" }
  | { kind: "queued" }
  | { kind: "created"; runId: string };

// With a run running, the ids join its queue under the caller: an unclaimed
// row keeps its queuer, and a claimed one is marked to be checked again after
// its answer, as the caller's. With none live, the ended run is deleted and a
// new one starts with the ids as its queue. A stopping run takes nothing.
export async function queueHfaVerificationIndicators(
  mainDb: Sql,
  indicatorIds: string[],
  queuedBy: string,
): Promise<HfaVerificationQueued> {
  return await mainDb.begin(async (sql): Promise<HfaVerificationQueued> => {
    await sql`SELECT pg_advisory_xact_lock(${HFA_VERIFICATION_RUN_ADVISORY_LOCK_KEY})`;
    const live = (
      await sql<Pick<DBHfaVerificationRun, "id" | "status">[]>`
        SELECT id, status FROM hfa_verification_runs
        WHERE status IN ('running', 'stopping')
        FOR UPDATE
      `
    ).at(0);
    if (live?.status === "stopping") return { kind: "stopping" };
    const runId = live?.id ?? crypto.randomUUID();
    if (live === undefined) {
      await sql`DELETE FROM hfa_verification_runs`;
      await sql`
        INSERT INTO hfa_verification_runs
          (id, status, started_by, started_at, done, not_checked)
        VALUES (${runId}, 'running', ${queuedBy}, now(), 0, '[]')
      `;
    }
    await sql`
      INSERT INTO hfa_verification_queue (indicator_id, queued_by, queued_at)
      SELECT indicator_id, ${queuedBy}, now() FROM hfa_indicators
      WHERE indicator_id = ANY(${indicatorIds})
      ON CONFLICT (indicator_id) DO UPDATE SET
        requeue = true,
        queued_by = EXCLUDED.queued_by,
        queued_at = EXCLUDED.queued_at
      WHERE hfa_verification_queue.claimed_at IS NOT NULL
    `;
    return live === undefined ? { kind: "created", runId } : { kind: "queued" };
  });
}

// Queues the ids, refusing while a run is stopping, and spawns a new run's
// worker once the queue commits. `onWorkerCrash` runs after a crashed
// worker's run is marked as an error.
export async function startHfaVerificationRun(
  mainDb: Sql,
  indicatorIds: string[],
  queuedBy: string,
  onWorkerCrash: () => Promise<void>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const start = await queueHfaVerificationIndicators(
      mainDb,
      indicatorIds,
      queuedBy,
    );
    if (start.kind === "stopping") {
      return {
        success: false,
        err: t3({
          en: "A verification run is stopping. Verify again once it has ended.",
          fr:
            "Une vérification est en cours d'arrêt. Vérifiez à nouveau une fois qu'elle est terminée.",
          pt:
            "Uma verificação está a parar. Verifique novamente quando ela terminar.",
        }),
      };
    }
    if (start.kind === "created") {
      try {
        spawnHfaVerificationWorker(mainDb, start.runId, onWorkerCrash);
      } catch (e) {
        await endHfaVerificationRun(
          mainDb,
          start.runId,
          `Failed to start the verification worker: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        throw e;
      }
    }
    return { success: true };
  });
}

function spawnHfaVerificationWorker(
  mainDb: Sql,
  runId: string,
  onWorkerCrash: () => Promise<void>,
): void {
  const worker = instantiateHfaVerificationWorker({ runId });
  setWorker("hfa_verification", worker);
  worker.addEventListener("error", async (e) => {
    console.error("HFA verification worker crashed:", e);
    e.preventDefault();
    clearWorker("hfa_verification", worker);
    worker.terminate();
    try {
      await endHfaVerificationRun(
        mainDb,
        runId,
        `Worker crashed: ${e.message || "Unknown error"}`,
      );
      await onWorkerCrash();
    } catch (err) {
      console.error(
        "Failed to end the HFA verification run after a crash:",
        err,
      );
    }
  });
  worker.addEventListener("message", (e) => {
    if (e.data === "COMPLETED") {
      clearWorker("hfa_verification", worker);
      worker.terminate();
    }
  });
}

// A running run stops claiming: its unclaimed indicators leave the queue and
// none in flight is checked again. The worker ends it once the calls in
// flight have answered. Anything else is left as it is.
export async function stopHfaVerificationRun(
  mainDb: Sql,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      const running = (
        await sql<Pick<DBHfaVerificationRun, "id">[]>`
          SELECT id FROM hfa_verification_runs WHERE status = 'running'
          FOR UPDATE
        `
      ).at(0);
      if (running === undefined) return;
      await sql`DELETE FROM hfa_verification_queue WHERE claimed_at IS NULL`;
      await sql`UPDATE hfa_verification_queue SET requeue = false`;
      await sql`
        UPDATE hfa_verification_runs SET status = 'stopping'
        WHERE id = ${running.id}
      `;
    });
    return { success: true };
  });
}

export async function getHfaVerificationRunStatus(
  sql: Sql,
  runId: string,
): Promise<HfaVerificationRunStatus | undefined> {
  return (
    await sql<Pick<DBHfaVerificationRun, "status">[]>`
      SELECT status FROM hfa_verification_runs WHERE id = ${runId}
    `
  ).at(0)?.status;
}

export type HfaVerificationClaim = { indicatorId: string; queuedBy: string };

// The oldest unclaimed queue row, in the indicators' order within one Verify.
export async function claimHfaVerificationQueueRow(
  sql: Sql,
): Promise<HfaVerificationClaim | undefined> {
  const row = (
    await sql<{ indicator_id: string; queued_by: string }[]>`
      UPDATE hfa_verification_queue SET claimed_at = now()
      WHERE indicator_id = (
        SELECT q.indicator_id FROM hfa_verification_queue q
        JOIN hfa_indicators i ON i.indicator_id = q.indicator_id
        WHERE q.claimed_at IS NULL
        ORDER BY q.queued_at, i.sort_order, q.indicator_id
        LIMIT 1
        FOR UPDATE OF q SKIP LOCKED
      )
      RETURNING indicator_id, queued_by
    `
  ).at(0);
  return row === undefined
    ? undefined
    : { indicatorId: row.indicator_id, queuedBy: row.queued_by };
}

export type HfaVerificationAnswer =
  | { result: HfaVerificationResult }
  | { notChecked: HfaVerificationNotChecked };

// One answer, in one transaction: a result saved under the claim's queuer,
// or the indicator listed as not checked; its queue row deleted, or released
// to be claimed again when another Verify asked for it meanwhile.
export async function saveHfaVerificationAnswer(
  mainDb: Sql,
  runId: string,
  claim: HfaVerificationClaim,
  answer: HfaVerificationAnswer,
): Promise<void> {
  await mainDb.begin(async (sql) => {
    const [run] = await sql<Pick<DBHfaVerificationRun, "not_checked">[]>`
      SELECT not_checked FROM hfa_verification_runs WHERE id = ${runId}
      FOR UPDATE
    `;
    if ("result" in answer) {
      await saveHfaIndicatorVerifications(sql, [answer.result], claim.queuedBy);
    }
    const queued = (
      await sql<{ requeue: boolean }[]>`
        SELECT requeue FROM hfa_verification_queue
        WHERE indicator_id = ${claim.indicatorId}
        FOR UPDATE
      `
    ).at(0);
    if (queued?.requeue) {
      await sql`
        UPDATE hfa_verification_queue SET claimed_at = NULL, requeue = false
        WHERE indicator_id = ${claim.indicatorId}
      `;
    } else {
      await sql`
        DELETE FROM hfa_verification_queue
        WHERE indicator_id = ${claim.indicatorId}
      `;
    }
    const notChecked = "notChecked" in answer
      ? JSON.stringify([
        ...parseJsonOrThrow<HfaVerificationNotChecked[]>(run.not_checked),
        answer.notChecked,
      ])
      : run.not_checked;
    await sql`
      UPDATE hfa_verification_runs
      SET done = done + 1, not_checked = ${notChecked}
      WHERE id = ${runId}
    `;
  });
}

// Without an error, a running run completes only when its queue is empty, and
// reports false otherwise so the worker claims again; a stopping run stops.
// With one, the run ends in error. A run that ends leaves an empty queue; a
// run already ended, or replaced by a later one, is left as it is.
export async function endHfaVerificationRun(
  mainDb: Sql,
  runId: string,
  error: string | undefined,
): Promise<boolean> {
  return await mainDb.begin(async (sql) => {
    const run = (
      await sql<Pick<DBHfaVerificationRun, "status">[]>`
        SELECT status FROM hfa_verification_runs
        WHERE id = ${runId} AND status IN ('running', 'stopping')
        FOR UPDATE
      `
    ).at(0);
    if (run === undefined) return true;
    if (error === undefined && run.status === "running") {
      const [{ queued }] = await sql<{ queued: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM hfa_verification_queue) AS queued
      `;
      if (queued) return false;
    }
    const status: HfaVerificationRunStatus = error !== undefined
      ? "error"
      : run.status === "stopping"
      ? "stopped"
      : "completed";
    await sql`DELETE FROM hfa_verification_queue`;
    await sql`
      UPDATE hfa_verification_runs
      SET status = ${status}, ended_at = now(), error = ${error ?? null}
      WHERE id = ${runId}
    `;
    return true;
  });
}

export async function getHfaVerificationRunState(
  sql: Sql,
): Promise<HfaVerificationRunState | undefined> {
  const run = (
    await sql<DBHfaVerificationRun[]>`SELECT * FROM hfa_verification_runs`
  ).at(0);
  if (run === undefined) return undefined;
  const pending = await sql<{ indicator_id: string }[]>`
    SELECT q.indicator_id FROM hfa_verification_queue q
    JOIN hfa_indicators i ON i.indicator_id = q.indicator_id
    ORDER BY q.queued_at, i.sort_order, q.indicator_id
  `;
  return {
    status: run.status,
    startedBy: run.started_by,
    startedAt: run.started_at.toISOString(),
    endedAt: run.ended_at?.toISOString() ?? null,
    done: run.done,
    pending: pending.map((r) => r.indicator_id),
    notChecked: parseJsonOrThrow<HfaVerificationNotChecked[]>(
      run.not_checked,
    ),
    error: run.error,
  };
}

// Whether a queuer's calls skip the token limits, by the rule a session of
// theirs takes (global_user.ts): an operator, or a user marked unlimited.
export async function getHfaVerificationQueuerUnlimitedAi(
  sql: Sql,
  email: string,
): Promise<boolean> {
  if (isHUser(email)) return true;
  const row = (
    await sql<{ unlimited_ai: boolean }[]>`
      SELECT unlimited_ai FROM users WHERE email = ${email}
    `
  ).at(0);
  return row?.unlimited_ai ?? false;
}

// Startup sweep: a restart leaves a live run with no worker, onto which every
// later Verify would queue indicators that nothing answers.
export async function markStaleHfaVerificationRuns(
  mainDb: Sql,
): Promise<number> {
  return await mainDb.begin(async (sql) => {
    const swept = await sql`
      UPDATE hfa_verification_runs
      SET status = 'error', ended_at = now(), error = ${
      t3({
        en:
          "Interrupted by a server restart. Verify checks the indicators it did not reach.",
        fr:
          "Interrompue par un redémarrage du serveur. Vérifier contrôle les indicateurs qu'elle n'a pas atteints.",
        pt:
          "Interrompida por um reinício do servidor. Verificar verifica os indicadores que ela não alcançou.",
      })
    }
      WHERE status IN ('running', 'stopping')
      RETURNING id
    `;
    await sql`DELETE FROM hfa_verification_queue`;
    return swept.length;
  });
}
