// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { join } from "../deps.ts";
import type {
  RScriptRun,
  ScriptRunFailure,
  ScriptRunLimits,
  ScriptRunResult,
  ScriptRunTable,
} from "../types.ts";

export type ScriptRunLaunch = {
  imageDigest: string;
  scratch: string;
  command: string[];
  limits: ScriptRunLimits;
};

export type ScriptRunLaunched = {
  exitCode: number;
  timedOut: boolean;
  log: string;
};

// Every file operation and the launch go through the host, so the protocol
// runs the same over Deno and Docker as over the in-memory host the tests
// give it. `readText` and `isFile` answer only for a regular file reached
// through no symlink, as the file or as `outputs/` itself: the script can
// leave a symlink in the scratch directory, and one the server followed
// would read or hand out a file outside it.
export type ScriptRunHost = {
  makeScratch: (parent: string) => Promise<string>;
  makeDir: (path: string) => Promise<void>;
  writeText: (path: string, text: string) => Promise<void>;
  copyFile: (from: string, to: string) => Promise<void>;
  readText: (path: string) => Promise<string | undefined>;
  isFile: (path: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
  launch: (launch: ScriptRunLaunch) => Promise<ScriptRunLaunched>;
};

const R_COMMAND = ["Rscript", "harness.R"];
const RESULT_FILE = "result.json";
const OUTPUT_FILE = /^outputs\/[1-9][0-9]*\.parquet$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const KILLED_EXIT = 137;
const DOCKER_EXIT = 125;
const NOT_RUNNABLE_EXITS = [126, 127];

type Captured =
  | { status: "ok"; tables: ScriptRunTable[] }
  | { status: "failed"; failure: ScriptRunFailure };

export async function executeRScript<T>(
  run: RScriptRun,
  take: (tables: ScriptRunTable[]) => Promise<T>,
  harness: string,
  host: ScriptRunHost,
): Promise<ScriptRunResult<T>> {
  assertRun(run);
  const scratch = await host.makeScratch(run.scratchParent);
  try {
    await stage(scratch, run, harness, host);
    const launched = await host.launch({
      imageDigest: run.imageDigest,
      scratch,
      command: R_COMMAND,
      limits: run.limits,
    });
    const captured = await capture(scratch, launched, run.limits, host);
    return captured.status === "ok"
      ? { status: "ok", log: launched.log, taken: await take(captured.tables) }
      : { status: "failed", log: launched.log, failure: captured.failure };
  } finally {
    await host.remove(scratch);
  }
}

function assertRun(run: RScriptRun): void {
  if (!IMAGE_DIGEST.test(run.imageDigest)) {
    throw new Error(
      `imageDigest "${run.imageDigest}" is not an image digest (sha256:…): resolve the tag with resolveDockerImage`,
    );
  }
  const names = new Set<string>();
  for (const { name } of run.inputs) {
    if (name === "") {
      throw new Error("An input's name is empty");
    }
    if (names.has(name)) {
      throw new Error(`Input "${name}" is named twice`);
    }
    names.add(name);
  }
  const { timeoutMs, memoryMb, cpus, processes } = run.limits;
  for (
    const [field, value] of Object.entries({ timeoutMs, memoryMb, processes })
  ) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`limits.${field} must be a positive integer`);
    }
  }
  if (!(cpus > 0)) {
    throw new Error("limits.cpus must be positive");
  }
}

async function stage(
  scratch: string,
  run: RScriptRun,
  harness: string,
  host: ScriptRunHost,
): Promise<void> {
  await host.makeDir(join(scratch, "inputs"));
  await host.makeDir(join(scratch, "outputs"));
  const inputs = run.inputs.map((input, i) => ({
    name: input.name,
    file: `inputs/${i + 1}.parquet`,
  }));
  for (const [i, input] of run.inputs.entries()) {
    await host.copyFile(input.parquet, join(scratch, inputs[i].file));
  }
  await host.writeText(
    join(scratch, "manifest.json"),
    JSON.stringify({ inputs }),
  );
  await host.writeText(join(scratch, "script.R"), run.script);
  await host.writeText(join(scratch, "harness.R"), harness);
}

async function capture(
  scratch: string,
  launched: ScriptRunLaunched,
  limits: ScriptRunLimits,
  host: ScriptRunHost,
): Promise<Captured> {
  if (launched.timedOut) {
    return failed({
      kind: "timeout",
      message: `The script ran past the time limit of ${
        limits.timeoutMs / 1000
      } seconds and was stopped`,
    });
  }
  if (launched.exitCode !== 0) {
    return failed({
      kind: "exit",
      exitCode: launched.exitCode,
      message: exitMessage(launched.exitCode, limits),
    });
  }
  const text = await host.readText(join(scratch, RESULT_FILE));
  // A script that calls quit() ends the container before the harness writes
  // its result, with whatever status the script gave.
  if (text === undefined) {
    return failed({
      kind: "exit",
      exitCode: 0,
      message: "The script ended the run before its tables were written",
    });
  }
  const result = parseResult(text);
  if (result === undefined) {
    return failed({
      kind: "exit",
      exitCode: 0,
      message: `The harness's ${RESULT_FILE} could not be read`,
    });
  }
  if ("failure" in result) {
    return failed({
      kind: "table",
      table: result.failure.table,
      message:
        `Table "${result.failure.table}" could not be written: ${result.failure.reason}`,
    });
  }
  const tables: ScriptRunTable[] = [];
  for (const { name, file } of result.tables) {
    const parquet = join(scratch, file);
    if (!await host.isFile(parquet)) {
      return failed({
        kind: "table",
        table: name,
        message: `Table "${name}" was not written`,
      });
    }
    tables.push({ name, parquet });
  }
  return { status: "ok", tables };
}

function failed(failure: ScriptRunFailure): Captured {
  return { status: "failed", failure };
}

function exitMessage(exitCode: number, limits: ScriptRunLimits): string {
  if (exitCode === KILLED_EXIT) {
    return `The container was killed (exit code ${exitCode}), most often for passing the memory limit of ${limits.memoryMb} MB`;
  }
  if (exitCode === DOCKER_EXIT) {
    return `Docker could not start the container (exit code ${exitCode})`;
  }
  if (NOT_RUNNABLE_EXITS.includes(exitCode)) {
    return `The image could not run Rscript (exit code ${exitCode})`;
  }
  return `The script stopped with exit code ${exitCode}`;
}

type HarnessResult =
  | { tables: { name: string; file: string }[] }
  | { failure: { table: string; reason: string } };

// The script can write result.json itself and then quit() before the harness
// does, so a table's file is trusted only as one of the harness's own names
// under outputs/, never a path that leaves the scratch directory.
function parseResult(text: string): HarnessResult | undefined {
  const json = parseJson(text);
  if (!isRecord(json)) {
    return undefined;
  }
  const { tables, failure } = json;
  if (isRecord(failure)) {
    const { table, reason } = failure;
    return typeof table === "string" && typeof reason === "string"
      ? { failure: { table, reason } }
      : undefined;
  }
  if (!Array.isArray(tables)) {
    return undefined;
  }
  const parsed: { name: string; file: string }[] = [];
  for (const entry of tables) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { name, file } = entry;
    if (
      typeof name !== "string" || name === "" || typeof file !== "string" ||
      !OUTPUT_FILE.test(file) ||
      parsed.some((p) => p.name === name || p.file === file)
    ) {
      return undefined;
    }
    parsed.push({ name, file });
  }
  return { tables: parsed };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
