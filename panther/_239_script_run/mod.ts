// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  isDockerAvailable,
  resolveDockerImage,
  runRScript,
} from "./run_r_script.ts";
export type {
  DockerImageResult,
  RScriptRun,
  ScriptRunFailure,
  ScriptRunInput,
  ScriptRunLimits,
  ScriptRunResult,
  ScriptRunTable,
} from "./types.ts";
