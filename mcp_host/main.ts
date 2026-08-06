import { buildToolCatalog, createMCPServer } from "@timroberton/panther";
import {
  buildSystemPromptForContext,
  createAllServerActions,
  createGetSlideTool,
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
  getSharedToolsForModules,
  getSharedToolsForReports,
  getSharedToolsForSlideDecks,
  getSharedToolsForVisualizations,
  getViewingMetricsInstructions,
  getViewingReportsInstructions,
  getViewingSlideDecksInstructions,
  getViewingVisualizationsInstructions,
  setServerActionTransport,
} from "lib";
import { createHostAIToolEnv } from "./env.ts";
import { hydrateHeadlessState } from "./sse_hydration.ts";
import { instanceSnapshot, projectSnapshot } from "./snapshot.ts";

// The FASTR AI Assistant over MCP (stdio) — the thin fresh host of the
// REVIEW_MCP_HOST_ARCHITECTURE.md ruling: a plain `deno run` process that
// composes the shared lib tool factories against a PAT transport and a
// hydrated snapshot, and never imports anything under client/src. One
// process serves ONE project, authenticated as ONE user. Register with:
//
//   claude mcp add fastr -- deno run -A mcp_host/main.ts
//
// (cwd = this repo, so deno.json resolves "lib"/"@timroberton/panther"),
// with FASTR_MCP_BASE_URL, FASTR_MCP_TOKEN, FASTR_MCP_PROJECT_ID in env.
//
// Tools are built at boot against the snapshot's aliased arrays (see
// snapshot.ts); the `ready` gate hydrates both SSE streams before the first
// tool call executes. /pat facts the transport relies on (step-2/3 review
// findings): GET only (HEAD 403s), results are judged by the {success}
// envelope (onError returns HTTP 200 app-wide), deny-by-default allowlist.

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === "") {
    console.error(
      `fastr-assistant: missing required env var ${name} (need FASTR_MCP_BASE_URL, FASTR_MCP_TOKEN, FASTR_MCP_PROJECT_ID)`,
    );
    Deno.exit(1);
  }
  return value;
}

const baseUrl = requireEnv("FASTR_MCP_BASE_URL").replace(/\/+$/, "") + "/pat";
const token = requireEnv("FASTR_MCP_TOKEN");
const projectId = requireEnv("FASTR_MCP_PROJECT_ID");

setServerActionTransport({
  baseUrl,
  refreshSession: async () => {},
  getHeaders: () => ({ Authorization: `Bearer ${token}` }),
  credentials: "omit",
  onPersistentAuthFailure: ({ url }) => {
    console.error(
      `fastr-assistant: persistent auth failure calling ${url} — the personal access token may be revoked`,
    );
  },
});

const serverActions = createAllServerActions();
const env = createHostAIToolEnv(serverActions);

// The shared factories only — the MCP surface is exactly the tools the SPA
// chat shares with this host (15 reads + approval-gated create_report). The
// view-gated client tool groups and ask_user_questions are SPA-resident by
// design and are not registered here.
const tools = [
  ...getSharedToolsForMetrics(
    env,
    projectId,
    projectSnapshot.metrics,
    projectSnapshot.icehIndicators,
    projectSnapshot.hfaTaxonomy,
  ),
  // The package these tools read is resolved at CALL time via the snapshot,
  // so a run repoint mid-session moves them to the newly attached package —
  // same contract as the SPA's build_tools.ts.
  ...getSharedToolsForModules(
    env,
    projectId,
    () => projectSnapshot.attachedRunId,
    projectSnapshot.projectModules,
    projectSnapshot.metrics,
  ),
  ...getSharedToolsForVisualizations(
    env,
    projectId,
    projectSnapshot.visualizations,
    projectSnapshot.metrics,
  ),
  ...getSharedToolsForSlideDecks(projectSnapshot.slideDecks),
  ...getSharedToolsForReports(env, projectId, projectSnapshot.reports),
  ...getSharedToolsForMethodologyDocs(),
  ...getSharedToolsForInfo(),
  createGetSlideTool(env, projectId, projectSnapshot.metrics),
];

let hydrated = false;
async function ready(): Promise<void> {
  if (!hydrated) {
    await hydrateHeadlessState({ baseUrl, token, projectId });
    hydrated = true;
  }
}

const INSTRUCTIONS = [
  "FASTR Analytics assistant for ONE health-data project (the project is fixed for this connection; all ids are project-scoped).",
  "Rules:",
  "- Call get_orientation FIRST in a session: it carries the live project context — which metrics, visualizations, slide decks and reports exist right now, and how to query metric data.",
  "- Every tool takes explicit ids as input; discover ids with the get_available_* tools, never invent them.",
  "- Reads are safe to call freely. The only write, create_report, asks the user for confirmation before committing.",
  "- Data questions: use get_metric_data (CSV output). Load get_info topics before building domain-specific reports.",
].join("\n");

function buildGrounding(): string {
  const catalog = buildToolCatalog(tools);
  return [
    buildSystemPromptForContext(instanceSnapshot, projectSnapshot, catalog),
    getViewingMetricsInstructions(),
    getViewingVisualizationsInstructions(),
    getViewingSlideDecksInstructions(),
    getViewingReportsInstructions(),
  ].join("\n\n");
}

await createMCPServer({
  name: "fastr-assistant",
  version: "1.0.0",
  instructions: INSTRUCTIONS,
  groundingResource: buildGrounding,
  tools,
  approvalMode: "elicit",
  approvalPolicy: { requireForKind: "write", requireKind: true },
  ready,
}).serveStdio();
