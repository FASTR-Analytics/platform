import type { RunProgress } from "lib";
import {
  notifyInstanceRScript,
  notifyInstanceRunProgress,
} from "../../task_management/notify_instance_updated.ts";
import {
  notifyProjectRScript,
  notifyProjectRunProgress,
} from "../../task_management/notify_project_v2.ts";

// Generation telemetry fans out on TWO channels (Q-B ruling), and every
// emitter in the pipeline uses these so the pairing is one fact rather than
// five:
//   - INSTANCE SSE, for the results-package catalogue. This is the only
//     channel a run launched with no attach targets has, and routesInstanceSSE
//     drops both messages for callers without can_configure_data.
//   - PROJECT SSE, once per attach target, for the project's Results package
//     surface — unchanged from item 1.

export function notifyRunProgress(
  attachTargetProjectIds: string[],
  runId: string,
  progress: RunProgress,
): void {
  notifyInstanceRunProgress(runId, progress);
  for (const projectId of attachTargetProjectIds) {
    notifyProjectRunProgress(projectId, runId, progress);
  }
}

export function notifyRunRScript(
  attachTargetProjectIds: string[],
  runId: string,
  moduleId: string,
  text: string,
): void {
  notifyInstanceRScript(runId, moduleId, text);
  for (const projectId of attachTargetProjectIds) {
    notifyProjectRScript(projectId, moduleId, text);
  }
}
