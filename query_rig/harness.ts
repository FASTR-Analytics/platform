import { scopeToken, type InstanceCalendar } from "lib";
import { _RUNS_DIR_PATH } from "../server/exposed_env_vars.ts";
import { getRunManifestCached, runDirPath } from "../server/runs/mod.ts";
import type { RunReadContext } from "../server/run_query/mod.ts";
import type { Fixture } from "./fixtures.ts";

// The wrapper script points _RUNS_DIR_PATH (= SANDBOX_DIR_PATH) at a throwaway
// directory and never sources the real .env, so the rig cannot read or write a
// live instance's packages even by accident.
export async function ensureRunsDir(): Promise<void> {
  await Deno.mkdir(_RUNS_DIR_PATH, { recursive: true });
}

// The (run, scope) pair the CALLER supplies — the whole of a read context
// under D7. Built here rather than through getReadyRunReadContext because that
// gate reads the instance-DB catalog row for `status = 'ready'`; the rig's
// packages exist only on disk, and the gate is a route-level concern.
//
// The manifest is loaded through the production cache, so every fixture's
// manifest goes through transformRunManifestFile and runManifestSchema on the
// way in. `calendar` is a manifest FIELD now (never the process global), so a
// calendar case is a manifest copy — exactly what the read path would see from
// a package generated on an Ethiopian-calendar instance.
export async function readContextFor(
  fx: Fixture,
  adminArea2: string | null,
  calendar: InstanceCalendar,
): Promise<RunReadContext> {
  const manifest = await getRunManifestCached(fx.runId);
  return {
    runId: fx.runId,
    runDir: runDirPath(fx.runId),
    manifest: manifest.calendar === calendar
      ? manifest
      : { ...manifest, calendar },
    adminArea2,
    scopeToken: scopeToken(adminArea2),
  };
}

export type Failure = { case: string; detail: string };

// Rows come back in whatever order the engine chose — the queries carry no
// ORDER BY, and the executor's own total order is a determinism device, not a
// meaningful sort — so equality is multiset equality, not sequence equality.
export function canonicalise(rows: Record<string, unknown>[]): string {
  return JSON.stringify(
    rows
      .map((r) =>
        Object.keys(r)
          .sort()
          .map((k) => [k, r[k]])
      )
      .map((pairs) => JSON.stringify(pairs))
      .sort()
  );
}

export function rowsMatch(
  actual: Record<string, unknown>[],
  expected: Record<string, unknown>[]
): boolean {
  return canonicalise(actual) === canonicalise(expected);
}
