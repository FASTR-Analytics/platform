// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { join, resolve } from "./deps.ts";
import { docker, DOCKER_HOST } from "./_internal/docker.ts";
import { executeRScript } from "./_internal/execute.ts";
import type {
  DockerImageResult,
  RScriptRun,
  ScriptRunResult,
  ScriptRunTable,
} from "./types.ts";

let harness: Promise<string> | undefined;

export async function runRScript<T>(
  run: RScriptRun,
  take: (tables: ScriptRunTable[]) => Promise<T>,
): Promise<ScriptRunResult<T>> {
  harness ??= Deno.readTextFile(join(import.meta.dirname!, "harness.R"));
  return await executeRScript(
    { ...run, scratchParent: resolve(run.scratchParent) },
    take,
    await harness,
    DOCKER_HOST,
  );
}

export async function resolveDockerImage(
  tag: string,
): Promise<DockerImageResult> {
  const inspected = await docker([
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    tag,
  ]);
  if (inspected?.success === true) {
    return {
      status: "ok",
      digest: new TextDecoder().decode(inspected.stdout).trim(),
    };
  }
  return await isDockerAvailable()
    ? { status: "no_image" }
    : { status: "no_docker" };
}

export async function isDockerAvailable(): Promise<boolean> {
  const version = await docker(["version", "--format", "{{.Server.Version}}"]);
  return version?.success === true;
}
