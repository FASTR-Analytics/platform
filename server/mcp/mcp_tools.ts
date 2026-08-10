import {
  AIToolFailure,
  buildToolCatalog,
  createAITool,
  scopeAITool,
} from "@timroberton/panther";
import type { AIToolWithMetadata } from "@timroberton/panther";
import { z } from "zod";
import type { AIToolEnv, ServerActionsType } from "lib";
import {
  buildSystemPromptForContext,
  createAllServerActions,
  createGetSlideTool,
  EMPTY_HFA_TAXONOMY,
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
} from "lib";
import {
  buildPrincipalTransport,
  invalidateProjectContext,
  type McpPrincipal,
  resolveInstanceState,
  resolveProjectContext,
} from "./context_cache.ts";

// deno-lint-ignore no-explicit-any
type AnyTool = AIToolWithMetadata<any>;

////////////////////////////////////////////////////////////////////////////////
// TEMPLATE TOOLS (boot-time, principal-free)
////////////////////////////////////////////////////////////////////////////////
//
// The scoped wrappers need the 13 project tools' names/descriptions/schemas
// BEFORE any principal or project exists — tools/list must answer statelessly.
// The factories are pure over their inputs and their schemas are static, so a
// boot-time instantiation against a throwing dummy env and empty arrays
// harvests exactly that. If any template handler ever runs, that is a bug in
// the scoped-wrapper delegation — fail loudly.

function templateThrow(): never {
  throw new Error(
    "mcp template env must never be invoked — the scoped wrapper failed to delegate to a resolved per-project tool",
  );
}

const TEMPLATE_ENV: AIToolEnv = {
  serverActions: new Proxy({}, {
    get: () => templateThrow,
  }) as ServerActionsType,
  getItems: templateThrow,
  getPODetail: templateThrow,
  getResultsValueInfo: templateThrow,
  getSlide: templateThrow,
  getReplicantOptions: templateThrow,
  getDimensionLabelConfig: templateThrow,
};

const TEMPLATE_PROJECT_ID = "__template__";

function buildTemplateTools(): AnyTool[] {
  return [
    ...getSharedToolsForMetrics(
      TEMPLATE_ENV,
      TEMPLATE_PROJECT_ID,
      [],
      [],
      structuredClone(EMPTY_HFA_TAXONOMY),
    ),
    ...getSharedToolsForModules(TEMPLATE_ENV, TEMPLATE_PROJECT_ID, [], []),
    ...getSharedToolsForVisualizations(
      TEMPLATE_ENV,
      TEMPLATE_PROJECT_ID,
      [],
      [],
    ),
    ...getSharedToolsForSlideDecks([]),
    ...getSharedToolsForReports(TEMPLATE_ENV, TEMPLATE_PROJECT_ID, []),
    createGetSlideTool(TEMPLATE_ENV, TEMPLATE_PROJECT_ID, []),
  ];
}

const TEMPLATE_TOOLS = buildTemplateTools();

const PROJECT_ID_DESCRIPTION =
  "The id of the project this call targets. List your projects (ids, labels, roles) with get_projects; every project tool requires this field.";

////////////////////////////////////////////////////////////////////////////////
// PER-PRINCIPAL TOOL SET (the D3 thunk)
////////////////////////////////////////////////////////////////////////////////

function formatProjectsList(
  projects: { id: string; label: string; role: string; isLocked: boolean }[],
): string {
  if (projects.length === 0) {
    return "You have no accessible projects on this instance.";
  }
  return [
    "Projects you can access (pass the id as projectId in project tools):",
    ...projects.map(
      (p) =>
        `- ${p.id} — "${p.label}" (role: ${p.role}${
          p.isLocked ? ", LOCKED — read-only" : ""
        })`,
    ),
  ].join("\n");
}

export function buildMcpToolsForPrincipal(principal: McpPrincipal): AnyTool[] {
  const transport = buildPrincipalTransport(principal.token);
  const serverActions = createAllServerActions(transport);

  const getProjects = async (): Promise<string> => {
    const res = await serverActions.getProjectsForUser({});
    if (!res.success) {
      throw new AIToolFailure(res.err);
    }
    return formatProjectsList(res.data);
  };

  const getProjectsTool = createAITool({
    name: "get_projects",
    description:
      "List the projects you can access on this FASTR instance — id, label, your role, and whether the project is locked (read-only). Call this first to discover projectId values for the project tools.",
    inputSchema: z.object({}),
    kind: "read",
    headless: true,
    handler: getProjects,
  });

  const getOrientationTool = createAITool({
    name: "get_orientation",
    description:
      "Read the orientation for this instance. With no argument: what this instance is and which projects you can access. With a projectId: the full project grounding — which metrics, modules, visualizations, slide decks and reports exist right now, and how to use the tools against them. Call it (with a projectId) before working in a project.",
    inputSchema: z.object({
      projectId: z.string().optional().describe(
        "Project to orient in. Omit to get the instance-level overview and your project list.",
      ),
    }),
    kind: "read",
    headless: true,
    handler: async (input) => {
      if (!input.projectId) {
        const instanceState = await resolveInstanceState(principal);
        const projectsText = await getProjects();
        return [
          `FASTR Analytics instance "${instanceState.instanceName}" — health-facility data analysis (projects contain metrics, visualizations, slide decks, and reports).`,
          projectsText,
          "Next: call get_orientation with a projectId to load that project's full grounding, then use the project tools (each takes the same projectId). The only write, create_report, asks the user for confirmation before committing.",
        ].join("\n\n");
      }
      const ctx = await resolveProjectContext(principal, input.projectId);
      const catalog = buildToolCatalog(ctx.sessionTools);
      return [
        `# Project: ${ctx.projectLabel} (projectId: ${ctx.projectId})${
          ctx.isLocked ? " — LOCKED (read-only)" : ""
        }\n\nEvery project tool call must include projectId: "${ctx.projectId}".`,
        buildSystemPromptForContext(
          ctx.instanceState,
          ctx.projectState,
          catalog,
        ),
        getViewingMetricsInstructions(),
        getViewingVisualizationsInstructions(),
        getViewingSlideDecksInstructions(),
        getViewingReportsInstructions(),
      ].join("\n\n");
    },
  });

  // The 13 project tools, scoped (PLAN_112 D7): the wrapper injects a
  // required projectId into the schema, and resolve() binds the call to the
  // per-(principal, project) context — authorization runs inside
  // resolveProjectContext on every cold resolve, and every data access runs
  // through the PAT middleware chain regardless.
  const scopedProjectTools = TEMPLATE_TOOLS.map((template) =>
    scopeAITool(template, {
      param: "projectId",
      description: PROJECT_ID_DESCRIPTION,
      resolve: async (projectId) => {
        const ctx = await resolveProjectContext(principal, projectId);
        const inner = ctx.sessionTools.find(
          (t) => t.sdkTool.name === template.sdkTool.name,
        );
        if (!inner) {
          throw new Error(
            `mcp: no session tool named "${template.sdkTool.name}" in the project context — template and session tool sets have drifted`,
          );
        }
        // Approval (write) tools: invalidate this (principal, project)
        // context after a successful commit, so the list tools and
        // orientation see the write immediately instead of after the 30s
        // TTL — a model that creates a report, lists, and sees nothing
        // might create a duplicate. The proposal passes through otherwise
        // untouched; commit still only runs after an accepted decision.
        const innerApproval = inner.metadata.approval;
        if (!innerApproval) {
          return inner;
        }
        return {
          sdkTool: inner.sdkTool,
          metadata: {
            ...inner.metadata,
            approval: {
              ...innerApproval,
              propose: async (input, view, proposeCtx) => {
                const proposal = await Promise.resolve(
                  innerApproval.propose(input, view, proposeCtx),
                );
                if (
                  proposal !== null && typeof proposal === "object" &&
                  "commit" in proposal &&
                  typeof proposal.commit === "function"
                ) {
                  const originalCommit = proposal.commit;
                  return {
                    ...proposal,
                    commit: async () => {
                      const output = await Promise.resolve(originalCommit());
                      invalidateProjectContext(principal, projectId);
                      return output;
                    },
                  };
                }
                return proposal;
              },
            },
          },
        };
      },
    })
  );

  return [
    getProjectsTool,
    getOrientationTool,
    ...scopedProjectTools,
    ...getSharedToolsForMethodologyDocs(),
    ...getSharedToolsForInfo(transport),
  ];
}
