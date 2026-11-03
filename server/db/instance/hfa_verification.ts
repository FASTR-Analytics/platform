import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  HFA_VERIFICATION_MODEL_RULE_IDS,
  type HfaVerificationFinding,
  type HfaVerificationModelRuleId,
  type HfaVerificationNewFinding,
  type HfaVerificationResult,
  type HfaVerificationRows,
  hfaVerificationRulesOffSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type {
  DBHfaIndicatorVerification,
  DBHfaVerificationFinding,
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

// One transaction for the whole batch: each indicator's verification row is
// replaced, its undismissed findings are replaced by what the result leaves,
// and its dismissed findings stay. A result for an indicator deleted since
// the run read it is skipped, so one deletion does not fail the batch; a
// later result for the same indicator wins. The indicators and time points
// read are key-share-locked: a delete or a round rename waits for the save;
// an edit or an import's stamp does not.
export async function saveHfaIndicatorVerifications(
  mainDb: Sql,
  results: HfaVerificationResult[],
  verifiedBy: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
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
    });
    return { success: true };
  });
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
