// Pins the generation fraction of SYSTEM_08 "The stage": done is set by the
// stage alone, so it is monotonic whatever the reuse plan pre-marks, and
// total is the module count plus prepare, resolve-and-plan, and finalize.
//
//   deno test -A --env-file server/tests/run_progress_test.ts

import { assertEquals } from "@std/assert";
import {
  type RunProgress,
  runProgressSteps,
  type RunStage,
  runStageLabel,
} from "lib";

const MODULES = ["m012", "m001", "m002"];

function progressAt(
  stage: RunStage,
  moduleStatus: RunProgress["moduleStatus"] = {},
): RunProgress {
  return {
    moduleOrder: MODULES,
    moduleStatus,
    currentModuleId: stage.kind === "module" ? stage.moduleId : null,
    stage,
    errorDetail: null,
  };
}

const TABLE: [RunStage, number][] = [
  [{ kind: "queued" }, 0],
  [{ kind: "exporting", family: "hmis" }, 0],
  [{ kind: "converting", family: "hfa" }, 0],
  [{ kind: "resolving" }, 1],
  [{ kind: "planning" }, 1],
  [{ kind: "module", moduleId: "m012" }, 2],
  [{ kind: "module", moduleId: "m001" }, 3],
  [{ kind: "module", moduleId: "m002" }, 4],
  [{ kind: "finalizing", moduleId: null }, 5],
  [{ kind: "finalizing", moduleId: "m001" }, 5],
  [{ kind: "publishing" }, 5],
  [{ kind: "ended" }, 6],
];

Deno.test("every stage kind maps to the done/total table", () => {
  for (const [stage, done] of TABLE) {
    assertEquals(
      runProgressSteps(progressAt(stage)),
      { done, total: 6 },
      JSON.stringify(stage),
    );
  }
});

Deno.test("a reuse plan that pre-marks later modules does not move the fraction", () => {
  const progress = progressAt({ kind: "module", moduleId: "m012" }, {
    m012: "running",
    m001: "reused",
    m002: "reused",
  });
  assertEquals(runProgressSteps(progress), { done: 2, total: 6 });
});

Deno.test("total counts three fixed steps beside the modules", () => {
  const empty: RunProgress = {
    moduleOrder: [],
    moduleStatus: {},
    currentModuleId: null,
    stage: { kind: "ended" },
    errorDetail: null,
  };
  assertEquals(runProgressSteps(empty), { done: 3, total: 3 });
});

Deno.test("the module sentence follows the module's status", () => {
  const running = progressAt({ kind: "module", moduleId: "m012" }, {
    m012: "running",
  });
  const reused = progressAt({ kind: "module", moduleId: "m012" }, {
    m012: "reused",
  });
  assertEquals(runStageLabel(running).startsWith("Running "), true);
  assertEquals(runStageLabel(reused).startsWith("Reusing outputs for "), true);
  assertEquals(
    runStageLabel(progressAt({ kind: "exporting", family: "hmis" })),
    "Exporting HMIS data",
  );
  assertEquals(
    runStageLabel(progressAt({ kind: "finalizing", moduleId: null })),
    "Building the package",
  );
});
