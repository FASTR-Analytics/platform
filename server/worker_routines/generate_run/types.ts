import type {
  RunGenerationStep1Result,
  RunGenerationStep2Result,
} from "lib";

// Wire shapes between the launch host and the generate_run worker
// (PLAN_RESULTS_RUNS item 2): the start payload posted after the READY
// handshake, and the completion message the worker broadcasts so the host
// can terminate it and release the per-project generation claim.

export type GenerateRunStartData = {
  projectId: string;
  runId: string;
  label: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result;
};

export type GenerateRunEndedData = {
  projectId: string;
  runId: string;
  successOrError: "success" | "error";
};

export const RUN_GENERATION_ENDED_CHANNEL = "run_generation_ended";
