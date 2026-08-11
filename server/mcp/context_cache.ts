import { AIToolFailure } from "@timroberton/panther";
import type { AIToolWithMetadata } from "@timroberton/panther";
import type { InstanceState, ProjectState, ServerActionTransport } from "lib";
import {
  createAllServerActions,
  createDevGlobalUser,
  createGetSlideTool,
  getSharedToolsForMetrics,
  getSharedToolsForModules,
  getSharedToolsForReports,
  getSharedToolsForSlideDecks,
  getSharedToolsForVisualizations,
} from "lib";
import type { GlobalUser } from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  buildGlobalUserFromDb,
  resolveProjectUserAccess,
} from "../project_auth.ts";
import { buildProjectState } from "../task_management/build_project_state.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";
import { headlessAppFetch } from "../headless_app.ts";
import { createMcpAIToolEnv } from "./env.ts";
import {
  _BYPASS_AUTH,
  _INSTANCE_CALENDAR,
  _INSTANCE_FISCAL_YEAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
} from "../exposed_env_vars.ts";

// The /mcp endpoint is stateless above the wire (PLAN_112 D1): every project
// tool call carries projectId, authorization runs per call, and this cache is
// PURELY performance — correctness never depends on it. Keyed by (token,
// projectId): contexts capture serverActions bound to the building request's
// credential, so token-keying makes revocation invalidation exact (a revoked
// token's context ages out in <=30s and every dispatch through it 401s
// immediately anyway). OAuth tokens rotate (~hourly), so their entries die on
// rotation rather than by TTL — harmless, since the entry is a pure cache.

const CONTEXT_TTL_MS = 30_000;
const CONTEXT_LRU_CAP = 50;

export type McpPrincipal = { token: string; email: string };

export type McpProjectContext = {
  projectId: string;
  projectLabel: string;
  isLocked: boolean;
  projectState: ProjectState;
  instanceState: InstanceState;
  // The 13 project tools, fully bound to this (principal, project) — the
  // scoped wrappers resolve their inner tool from this set by name, and the
  // orientation catalog renders from it.
  // deno-lint-ignore no-explicit-any
  sessionTools: AIToolWithMetadata<any>[];
};

// One key builder for cache writes AND invalidation — the two sites drifted
// once (a literal NUL in one template, a space in the other) and the
// invalidation silently missed. The separator cannot occur in a token or a
// project id.
function contextKey(principal: McpPrincipal, projectId: string): string {
  return `${principal.token}\u0000${projectId}`;
}

type CacheEntry<T> = { value: T; builtAt: number };

const projectContexts = new Map<string, CacheEntry<McpProjectContext>>();
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
// validation, project permissions incl. locked-project write denial, logging.
// Revocation reaches staged commits: a commit closure holds actions bound to
// this token, so if the credential is revoked during a confirm window the
// commit's own dispatch 401s.
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

// Dropped after a successful write commit (mcp_tools wraps commit): the list
// tools and orientation read the cached project state, and a model that
// creates a report, lists, and sees nothing might create a duplicate. The
// next call transparently rebuilds with the write visible.
export function invalidateProjectContext(
  principal: McpPrincipal,
  projectId: string,
): void {
  projectContexts.delete(contextKey(principal, projectId));
}

export async function resolveProjectContext(
  principal: McpPrincipal,
  projectId: string,
): Promise<McpProjectContext> {
  const key = contextKey(principal, projectId);
  const cached = cacheGet(projectContexts, key);
  if (cached) return cached;

  const globalUser = await resolveGlobalUser(principal);
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  let access: Awaited<ReturnType<typeof resolveProjectUserAccess>>;
  try {
    access = await resolveProjectUserAccess(globalUser, projectId, mainDb);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Middleware error:")) {
      // Clean authorization failure the model can read and recover from —
      // wrong or foreign projectId is an EXPECTED input error (D1).
      throw new AIToolFailure(
        `No access to project "${projectId}" (it may not exist, or you have no role on it). Call get_projects to list your accessible projects.`,
      );
    }
    throw error;
  }

  // projectDb only after the permission check passes (no connection-cache
  // entries keyed by unauthorized project ids — same rule as the SSE route).
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  const stateRes = await buildProjectState(
    mainDb,
    { projectDb, projectId },
    access.projectUser,
  );
  if (!stateRes.success) {
    throw new Error(`Could not load project state: ${stateRes.err}`);
  }
  const projectState = stateRes.data;
  const instanceState = await resolveInstanceState(principal);

  const transport = buildPrincipalTransport(principal.token);
  const serverActions = createAllServerActions(transport);
  const env = createMcpAIToolEnv(serverActions, instanceState);

  // deno-lint-ignore no-explicit-any
  const sessionTools: AIToolWithMetadata<any>[] = [
    ...getSharedToolsForMetrics(
      env,
      projectId,
      projectState.metrics,
      projectState.icehIndicators,
      projectState.hfaTaxonomy,
    ),
    ...getSharedToolsForModules(
      env,
      projectId,
      projectState.projectModules,
      projectState.metrics,
    ),
    ...getSharedToolsForVisualizations(
      env,
      projectId,
      projectState.visualizations,
      projectState.metrics,
    ),
    ...getSharedToolsForSlideDecks(projectState.slideDecks),
    ...getSharedToolsForReports(env, projectId, projectState.reports),
    createGetSlideTool(env, projectId, projectState.metrics),
  ];

  const context: McpProjectContext = {
    projectId,
    projectLabel: access.projectLabel,
    isLocked: access.isLocked,
    projectState,
    instanceState,
    sessionTools,
  };
  cacheSet(projectContexts, key, context);
  return context;
}
