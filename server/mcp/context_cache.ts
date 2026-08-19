import { AIToolFailure } from "@timroberton/panther";
import type { AIToolWithMetadata } from "@timroberton/panther";
import type {
  InstanceState,
  PackageGrounding,
  PeriodBounds,
  RunListingItem,
  RunManifest,
  ServerActionTransport,
} from "lib";
import {
  createAllServerActions,
  createDevGlobalUser,
  getSharedToolsForMetrics,
} from "lib";
import type { GlobalUser } from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getHfaTimePointsForAI } from "../db/instance/dataset_hfa.ts";
import {
  getPinnedRunId,
  getRunListingItem,
} from "../db/instance/run_generation.ts";
import { buildGlobalUserFromDb } from "../project_auth.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";
import { headlessAppFetch } from "../headless_app.ts";
import { getRunManifestCached } from "../runs/manifest_cache.ts";
import {
  getCommonIndicatorsFromManifestInputs,
  getHfaTaxonomyFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getProjectDatasetsFromManifest,
} from "../run_query/mod.ts";
import { createMcpAIToolEnv } from "./env.ts";
import {
  _BYPASS_AUTH,
  _INSTANCE_CALENDAR,
  _INSTANCE_FISCAL_YEAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
} from "../exposed_env_vars.ts";

// The /mcp endpoint reads the instance's PINNED results package (S8 "The
// pinned package + followers"): every tool call resolves the pin, and this
// cache is PURELY performance — correctness never depends on it. The pin is
// read from the DB on EVERY call (never from the 30 s InstanceState copy), so
// a pin-move is visible on the next call; the context behind a given
// (token, runId) is what the cache holds. Keyed by token because a context
// captures server actions bound to the building request's credential — a
// revoked token's context ages out in <=30 s and every dispatch through it
// 401s immediately anyway. OAuth tokens rotate (~hourly), so their entries
// die on rotation rather than by TTL — harmless, since the entry is a pure
// cache.

const CONTEXT_TTL_MS = 30_000;
const CONTEXT_LRU_CAP = 50;

export const NO_PIN_MESSAGE =
  "No results package is pinned on this instance. An admin with can_configure_data pins one under Results packages.";

export type McpPrincipal = { token: string; email: string };

export type McpPackageContext = {
  runId: string;
  run: RunListingItem;
  grounding: PackageGrounding;
  // The shared metric tools, fully bound to this (principal, package) — the
  // bound outer tools resolve their inner tool from this set by name, and
  // the overview's tool catalog renders from it.
  // deno-lint-ignore no-explicit-any
  sessionTools: AIToolWithMetadata<any>[];
};

// One key builder for every cache site — two hand-built keys drifted once
// and an invalidation silently missed. The separator (NUL) cannot occur in
// a token or a run id.
const KEY_SEPARATOR = String.fromCharCode(0);

function contextKey(principal: McpPrincipal, runId: string): string {
  return `${principal.token}${KEY_SEPARATOR}${runId}`;
}

type CacheEntry<T> = { value: T; builtAt: number };

const packageContexts = new Map<string, CacheEntry<McpPackageContext>>();
const instanceStates = new Map<string, CacheEntry<InstanceState>>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.builtAt > CONTEXT_TTL_MS) {
    map.delete(key);
    return null;
  }
  // LRU refresh: re-insert so Map iteration order tracks recency.
  map.delete(key);
  map.set(key, entry);
  return entry.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
  map.set(key, { value, builtAt: Date.now() });
  while (map.size > CONTEXT_LRU_CAP) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// The per-principal transport (PLAN_112 D4): every server action dispatches
// in-process through headlessApp's full middleware chain — credential verify
// (a PAT also gets its last-used stamp), deny-by-default allowlist, zod
// validation, instance permissions, logging.
export function buildPrincipalTransport(token: string): ServerActionTransport {
  return {
    baseUrl: "",
    refreshSession: async () => {},
    getHeaders: () => ({ Authorization: `Bearer ${token}` }),
    credentials: "omit",
    onPersistentAuthFailure: ({ url }) => {
      console.error(
        `[mcp] persistent auth failure calling ${url} — the credential may be revoked`,
      );
    },
    fetchImpl: headlessAppFetch,
  };
}

async function resolveGlobalUser(principal: McpPrincipal): Promise<GlobalUser> {
  if (_BYPASS_AUTH) {
    return createDevGlobalUser(
      _INSTANCE_NAME,
      _INSTANCE_LANGUAGE,
      _INSTANCE_CALENDAR,
      _INSTANCE_FISCAL_YEAR,
    );
  }
  return await buildGlobalUserFromDb(principal.email, null, null);
}

export async function resolveInstanceState(
  principal: McpPrincipal,
): Promise<InstanceState> {
  const cached = cacheGet(instanceStates, principal.email);
  if (cached) return cached;
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const globalUser = await resolveGlobalUser(principal);
  const res = await buildInstanceState(mainDb, globalUser);
  if (!res.success) {
    throw new Error(`Could not load instance state: ${res.err}`);
  }
  cacheSet(instanceStates, principal.email, res.data);
  return res.data;
}

// The pin, read now. null is a typed, expected state (a fresh instance, or
// after unpin/delete) — get_overview renders it; every other tool fails with
// NO_PIN_MESSAGE via requirePinnedPackageContext.
export async function resolvePinnedRunId(): Promise<string | null> {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const res = await getPinnedRunId(mainDb);
  if (!res.success) {
    throw new Error(`Could not read the pinned results package: ${res.err}`);
  }
  return res.data;
}

// The widest period range across the package's time-indexed results objects.
// A results object's periodBounds are in its own physicalTimeColumn's units
// (period_id YYYYMM, quarter_id YYYYQ, year YYYY), so min/max is taken within
// ONE unit: the finest-grained column present. null = nothing time-indexed.
const PHYSICAL_TIME_COLUMNS_FINEST_FIRST = [
  "period_id",
  "quarter_id",
  "year",
] as const;

export function packagePeriodCoverage(
  manifest: RunManifest,
): PeriodBounds | null {
  for (const column of PHYSICAL_TIME_COLUMNS_FINEST_FIRST) {
    const bounds = manifest.resultsObjects
      .filter((ro) => ro.physicalTimeColumn === column)
      .map((ro) => ro.periodBounds)
      .filter((pb): pb is PeriodBounds => pb !== null);
    if (bounds.length > 0) {
      return {
        min: Math.min(...bounds.map((b) => b.min)),
        max: Math.max(...bounds.map((b) => b.max)),
      };
    }
  }
  return null;
}

// Every package-tool result at /mcp starts with one provenance line naming
// the run it read (label + generated timestamp — the same identity
// get_overview gives; no run id, which no tool accepts as input). The pin
// can move between two calls of one conversation and a client may carry a
// stale catalog, so results are self-identifying by construction. Failures
// pass through unchanged.
export function buildSourceHeader(run: RunListingItem): string {
  return `Source: results package "${run.label}" (generated ${run.createdAt})`;
}

// deno-lint-ignore no-explicit-any
export function withSourceHeader<T extends AIToolWithMetadata<any>>(
  tool: T,
  run: RunListingItem,
): T {
  const header = buildSourceHeader(run);
  const prepend = (body: string) => `${header}\n\n${body}`;
  const inner = tool.sdkTool;
  return {
    metadata: tool.metadata,
    sdkTool: {
      ...inner,
      run: async (input: unknown) => prepend(await inner.run(input)),
      runWithView: async (input: unknown, getView?: () => unknown) =>
        prepend(
          inner.runWithView
            ? await inner.runWithView(input, getView)
            : await inner.run(input),
        ),
    },
  } as T;
}

export async function requirePinnedPackageContext(
  principal: McpPrincipal,
): Promise<McpPackageContext> {
  const runId = await resolvePinnedRunId();
  if (runId === null) {
    throw new AIToolFailure(NO_PIN_MESSAGE);
  }
  return await resolvePackageContext(principal, runId);
}

export async function resolvePackageContext(
  principal: McpPrincipal,
  runId: string,
): Promise<McpPackageContext> {
  const key = contextKey(principal, runId);
  const cached = cacheGet(packageContexts, key);
  if (cached) return cached;

  // The door check: the run-keyed routes enforce can_view_data on every
  // dispatch regardless; judging it here gives the model one clean failure
  // instead of a permission error on each tool.
  const globalUser = await resolveGlobalUser(principal);
  if (
    !globalUser.isGlobalAdmin && !globalUser.thisUserPermissions.can_view_data
  ) {
    throw new AIToolFailure(
      "Your account lacks the instance permission can_view_data, which the results-package reads require. Ask an instance admin to grant it.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runRes = await getRunListingItem(mainDb, runId);
  if (!runRes.success) {
    throw new Error(`Could not read results package ${runId}: ${runRes.err}`);
  }
  if (runRes.data === null) {
    throw new AIToolFailure(
      `The pinned results package (${runId}) no longer exists. ${NO_PIN_MESSAGE}`,
    );
  }
  const run = runRes.data;

  // The same manifest-derived catalog getProjectDetail builds for a project's
  // attached package (db/project/projects.ts) — one derivation, two callers.
  const manifest = await getRunManifestCached(runId);
  const runInputs = { runId, manifest };
  const metrics = getMetricsWithStatusFromManifest(manifest);
  const icehIndicators = await getIcehIndicatorsFromManifestInputs(runInputs);
  const hfaTaxonomy = await getHfaTaxonomyFromManifestInputs(
    runInputs,
    await getHfaTimePointsForAI(mainDb),
  );
  const grounding: PackageGrounding = {
    calendar: manifest.calendar,
    datasets: getProjectDatasetsFromManifest(manifest),
    commonIndicators: await getCommonIndicatorsFromManifestInputs(runInputs),
    icehIndicators,
    periodCoverage: packagePeriodCoverage(manifest),
  };

  const transport = buildPrincipalTransport(principal.token);
  const serverActions = createAllServerActions(transport);
  const env = createMcpAIToolEnv(serverActions, runId);

  // deno-lint-ignore no-explicit-any
  const sessionTools: AIToolWithMetadata<any>[] = getSharedToolsForMetrics(
    env,
    metrics,
    icehIndicators,
    hfaTaxonomy,
  ).map((tool) => withSourceHeader(tool, run));

  const context: McpPackageContext = {
    runId,
    run,
    grounding,
    sessionTools,
  };
  cacheSet(packageContexts, key, context);
  return context;
}
