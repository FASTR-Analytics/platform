import type { Sql } from "postgres";
import {
  MODULE_REGISTRY,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
  type APIResponseNoData,
  type APIResponseWithData,
  type RunGenerationAttemptDetail,
  type RunGenerationStep1Result,
  type RunGenerationStep2Result,
} from "lib";
import type { DBRunGenerationAttempt } from "./_main_database_types.ts";

// The results-package launch wizard's attempt record (PLAN_RESULTS_RUNS
// item 2): one configuring attempt per source project
// (structure_upload_attempts pattern). The attempt is configuration only —
// status_type is only ever 'configuring', execution state lives on the runs
// catalog row — so there is no claim machinery here; each config-step write
// advances step and nulls downstream results, and the row is deleted at
// launch (and by discard).

const CONFIGURING_STATUS = JSON.stringify({ status: "configuring" });

async function getRawAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<DBRunGenerationAttempt | undefined> {
  const rows = await mainDb<DBRunGenerationAttempt[]>`
SELECT * FROM run_generation_attempts WHERE source_project_id = ${projectId}
`;
  return rows.at(0);
}

export async function createRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
INSERT INTO run_generation_attempts
  (source_project_id, date_started, step, status, status_type)
VALUES
  (${projectId}, ${new Date().toISOString()}, 1, ${CONFIGURING_STATUS}, 'configuring')
ON CONFLICT (source_project_id) DO UPDATE SET
  date_started = EXCLUDED.date_started,
  step = 1,
  status = EXCLUDED.status,
  status_type = 'configuring',
  step_1_result = NULL,
  step_2_result = NULL
`;
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem creating results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function getRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunGenerationAttemptDetail>> {
  try {
    const raw = await getRawAttempt(mainDb, projectId);
    if (raw === undefined) {
      return {
        success: false,
        err: "No results-package configuration in progress for this project",
      };
    }
    const step1Result: RunGenerationStep1Result | null =
      raw.step_1_result === null
        ? null
        : runGenerationStep1ResultSchema.parse(JSON.parse(raw.step_1_result));
    const step2Result: RunGenerationStep2Result | null =
      raw.step_2_result === null
        ? null
        : runGenerationStep2ResultSchema.parse(JSON.parse(raw.step_2_result));
    return {
      success: true,
      data: {
        step: raw.step,
        dateStarted: raw.date_started,
        status: { status: "configuring" },
        step1Result,
        step2Result,
      },
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem getting results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function updateRunGenerationAttemptStep1(
  mainDb: Sql,
  projectId: string,
  step1Result: RunGenerationStep1Result,
): Promise<APIResponseNoData> {
  try {
    if (
      step1Result.hmis === null &&
      step1Result.hfa === null &&
      step1Result.iceh === false
    ) {
      return {
        success: false,
        err: "Select at least one data family for the results package",
      };
    }
    const rows = await mainDb`
UPDATE run_generation_attempts SET
  step = 2,
  step_1_result = ${JSON.stringify(step1Result)},
  step_2_result = NULL
WHERE source_project_id = ${projectId}
RETURNING source_project_id
`;
    if (rows.length === 0) {
      return {
        success: false,
        err: "No results-package configuration in progress for this project",
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem saving data selection: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function updateRunGenerationAttemptStep2(
  mainDb: Sql,
  projectId: string,
  step2Result: RunGenerationStep2Result,
): Promise<APIResponseNoData> {
  try {
    if (step2Result.modules.length === 0) {
      return {
        success: false,
        err: "Select at least one module for the results package",
      };
    }
    const moduleIds = new Set(step2Result.modules.map((m) => m.moduleId));
    if (moduleIds.size !== step2Result.modules.length) {
      return { success: false, err: "Duplicate module in selection" };
    }
    for (const moduleId of moduleIds) {
      if (!MODULE_REGISTRY.some((m) => m.id === moduleId)) {
        return { success: false, err: `Unknown module: ${moduleId}` };
      }
    }
    const rows = await mainDb`
UPDATE run_generation_attempts SET
  step = 3,
  step_2_result = ${JSON.stringify(step2Result)}
WHERE source_project_id = ${projectId} AND step_1_result IS NOT NULL
RETURNING source_project_id
`;
    if (rows.length === 0) {
      return {
        success: false,
        err: "Not yet ready for this step — choose data first",
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem saving module selection: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function deleteRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
DELETE FROM run_generation_attempts WHERE source_project_id = ${projectId}
`;
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem discarding results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
