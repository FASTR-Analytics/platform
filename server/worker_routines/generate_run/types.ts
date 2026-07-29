import type {
  RunGenerationStep1Result,
  RunGenerationStep2Result,
} from "lib";

// Wire shapes between the launch host and the generate_run worker
// (PLAN_RESULTS_RUNS item 2): the start payload posted after the READY
// handshake, and the completion message the worker broadcasts so the host
// can terminate it and release the generation claim.
//
// A run belongs to no project (Q-A): `attachTargetProjectIds` is the
// launch-time attach selection — the projects the publish transaction
// repoints and the projects progress is pushed to. It may be empty; the run
// is then published unattached and picked up from a project's attach picker.

export type GenerateRunStartData = {
  attachTargetProjectIds: string[];
  runId: string;
  label: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result;
};

export type GenerateRunEndedData = {
  runId: string;
  successOrError: "success" | "error";
};

export const RUN_GENERATION_ENDED_CHANNEL = "run_generation_ended";
