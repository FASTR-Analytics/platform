// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type ScriptRunLimits = {
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  processes: number;
};

export type ScriptRunInput = { name: string; parquet: string };

export type RScriptRun = {
  imageDigest: string;
  script: string;
  inputs: ScriptRunInput[];
  limits: ScriptRunLimits;
  scratchParent: string;
};

export type ScriptRunTable = { name: string; parquet: string };

export type ScriptRunFailure =
  | { kind: "timeout"; message: string }
  | { kind: "exit"; exitCode: number; message: string }
  | { kind: "table"; table: string; message: string };

export type ScriptRunResult<T> =
  | { status: "ok"; log: string; taken: T }
  | { status: "failed"; log: string; failure: ScriptRunFailure };

export type DockerImageResult =
  | { status: "ok"; digest: string }
  | { status: "no_image" }
  | { status: "no_docker" };
