// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ScriptRunHost,
  ScriptRunLaunch,
  ScriptRunLaunched,
} from "./execute.ts";

const LOG_LIMIT_BYTES = 65_536;
const KILL_RETRY_MS = 250;

// The scratch directory is given by its real path, so a file reached through
// a symlink the script made, as the file or as a directory above it, has a
// real path that differs from the one the protocol joins and is refused.
export const DOCKER_HOST: ScriptRunHost = {
  makeScratch: async (parent) =>
    await Deno.realPath(
      await Deno.makeTempDir({ dir: parent, prefix: "scratch_" }),
    ),
  makeDir: (path) => Deno.mkdir(path),
  writeText: (path, text) => Deno.writeTextFile(path, text),
  copyFile: (from, to) => Deno.copyFile(from, to),
  readText: async (path) =>
    await isRegularFile(path) ? await Deno.readTextFile(path) : undefined,
  isFile: isRegularFile,
  remove: (path) => Deno.remove(path, { recursive: true }),
  launch: launchContainer,
};

export async function docker(
  args: string[],
): Promise<Deno.CommandOutput | undefined> {
  try {
    return await new Deno.Command("docker", {
      args,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw cause;
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await Deno.lstat(path)).isFile &&
      await Deno.realPath(path) === path;
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      return false;
    }
    throw cause;
  }
}

async function launchContainer(
  launch: ScriptRunLaunch,
): Promise<ScriptRunLaunched> {
  const name = `panther_script_run_${crypto.randomUUID()}`;
  const child = new Deno.Command("docker", {
    args: runArgs(name, launch),
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const [stdout, stderr, status, timedOut] = await Promise.all([
    readTail(child.stdout),
    readTail(child.stderr),
    child.status,
    killAtLimit(name, launch.limits.timeoutMs, child.status),
  ]);
  return {
    exitCode: status.code,
    timedOut,
    log: [stdout, stderr].filter((text) => text !== "").join("\n"),
  };
}

// The scratch directory is the only file system the script can write
// besides a /tmp in memory, and its files belong to the server's own user,
// so the server can move tables out of it and remove it on Linux as well,
// where a container's root would own them. The entrypoint is set, so an
// image's own entrypoint never runs ahead of the harness.
function runArgs(name: string, launch: ScriptRunLaunch): string[] {
  const { memoryMb, cpus, processes } = launch.limits;
  const [program, ...args] = launch.command;
  const uid = Deno.uid();
  const gid = Deno.gid();
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--pull",
    "never",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--memory",
    `${memoryMb}m`,
    "--memory-swap",
    `${memoryMb}m`,
    "--cpus",
    String(cpus),
    "--pids-limit",
    String(processes),
    ...(uid === null || gid === null ? [] : ["--user", `${uid}:${gid}`]),
    "--env",
    "HOME=/tmp",
    "--volume",
    `${launch.scratch}:/work`,
    "--workdir",
    "/work",
    "--entrypoint",
    program,
    launch.imageDigest,
    ...args,
  ];
}

// A kill sent before `docker run` has created the container fails, so it is
// sent again until the container is killed or the run ends on its own. The
// CLI is killed only through the container: killing the CLI alone leaves the
// container running.
async function killAtLimit(
  name: string,
  timeoutMs: number,
  exited: Promise<unknown>,
): Promise<boolean> {
  if (!await outlasts(exited, timeoutMs)) {
    return false;
  }
  do {
    if ((await docker(["kill", name]))?.success === true) {
      return true;
    }
  } while (await outlasts(exited, KILL_RETRY_MS));
  return false;
}

async function outlasts(
  exited: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  const passed = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => passed.resolve(true), ms);
  const ended = async () => {
    await exited;
    return false;
  };
  try {
    return await Promise.race([ended(), passed.promise]);
  } finally {
    clearTimeout(timer);
  }
}

// Only the end of a long log is kept: a script that prints a large table
// would otherwise hold it all in the server's memory, and an error is at the
// end. The cut ends at a line break unless the last line alone passes the
// limit, since an error is printed at its end.
async function readTail(stream: ReadableStream<Uint8Array>): Promise<string> {
  let tail = new Uint8Array(0);
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    const joined = new Uint8Array(tail.length + chunk.length);
    joined.set(tail);
    joined.set(chunk, tail.length);
    tail = joined.length > LOG_LIMIT_BYTES
      ? joined.slice(joined.length - LOG_LIMIT_BYTES)
      : joined;
  }
  const text = new TextDecoder().decode(tail);
  if (total === tail.length) {
    return text.trimEnd();
  }
  const afterBreak = text.slice(text.indexOf("\n") + 1);
  const kept = afterBreak.trim() === "" ? text : afterBreak;
  const cut = total - new TextEncoder().encode(kept).length;
  return `[the first ${cut} bytes of output were cut]\n${kept.trimEnd()}`;
}
