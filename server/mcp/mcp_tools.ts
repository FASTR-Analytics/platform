import {
  bindAITool,
  buildToolCatalog,
  createAITool,
} from "@timroberton/panther";
import type { AIToolWithMetadata } from "@timroberton/panther";
import { z } from "zod";
import type { AIToolEnv } from "lib";
import {
  buildDataCoverageSections,
  buildInstanceContextSections,
  buildPackageGroundingSections,
  buildSystemPrompt,
  EMPTY_HFA_TAXONOMY,
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
  INFO_TOPICS,
} from "lib";
import {
  buildPrincipalTransport,
  type McpPrincipal,
  NO_PIN_MESSAGE,
  requirePinnedPackageContext,
  resolveInstanceState,
  resolvePackageContext,
  resolvePinnedRunId,
} from "./context_cache.ts";

// deno-lint-ignore no-explicit-any
type AnyTool = AIToolWithMetadata<any>;

////////////////////////////////////////////////////////////////////////////////
// TEMPLATE TOOLS (boot-time, package-free)
////////////////////////////////////////////////////////////////////////////////
//
// tools/list must answer statelessly, and panther builds a principal's tool
// set ONCE per core (30 min idle TTL) — but the package behind the tools is
// the instance's pin, which can move mid-session. So each package tool is a
// static outer tool (name/description/schema from a boot-time template
// instantiated against a throwing env and empty catalogs — the factories are
// pure over their inputs and their schemas are static) that resolves the
// CURRENT pinned-package context per call and delegates to the inner tool by
// name (bindAITool). If a template handler ever runs, delegation failed —
// fail loudly.

function templateThrow(): never {
  throw new Error(
    "mcp template env must never be invoked — the bound wrapper failed to delegate to a resolved package tool",
  );
}

const TEMPLATE_ENV: AIToolEnv = {
  getItems: templateThrow,
  getResultsValueInfo: templateThrow,
};

const TEMPLATE_TOOLS: AnyTool[] = getSharedToolsForMetrics(
  TEMPLATE_ENV,
  [],
  [],
  structuredClone(EMPTY_HFA_TAXONOMY),
);

////////////////////////////////////////////////////////////////////////////////
// PER-PRINCIPAL TOOL SET (the D3 thunk)
////////////////////////////////////////////////////////////////////////////////

export function buildMcpToolsForPrincipal(principal: McpPrincipal): AnyTool[] {
  const transport = buildPrincipalTransport(principal.token);

  const getOverviewTool = createAITool({
    name: "get_overview",
    description:
      "Overview of this FASTR instance: country, the pinned results package and what it holds (datasets, indicators, analysis modules), terminology, and how to use the other tools. Call this first.",
    inputSchema: z.object({}),
    kind: "read",
    headless: true,
    handler: async () => {
      const instanceState = await resolveInstanceState(principal);
      const runId = await resolvePinnedRunId();
      // The overview answers WITHOUT a pin — a connector still connects and
      // the model can explain what to do; every other tool fails typed.
      if (runId === null) {
        return [
          `FASTR Analytics instance "${instanceState.instanceName}" — health-facility data analysis over the instance's pinned results package.`,
          NO_PIN_MESSAGE,
          "Until a package is pinned, the package tools (get_available_metrics, get_metric_data) cannot answer. The reference tools (get_methodology_docs_list, get_methodology_doc_content, get_info) still work.",
        ].join("\n\n");
      }
      const ctx = await resolvePackageContext(principal, runId);
      const contextSection = [
        ...buildInstanceContextSections(instanceState),
        "# Results package (pinned)",
        "",
        `**Name:** ${ctx.run.label}`,
        `**Generated:** ${ctx.run.createdAt}`,
        ...buildPackageGroundingSections(ctx.grounding),
        ...buildDataCoverageSections(instanceState),
        "",
        "Every tool here reads this package at national scope. Discover metric ids with get_available_metrics; never invent them.",
        "",
        "---",
        "",
      ].join("\n");
      return buildSystemPrompt({
        contextSection,
        toolCatalog: buildToolCatalog(ctx.sessionTools),
        infoTopics: INFO_TOPICS,
        roleAndPurpose:
          "You are an AI assistant helping users explore and analyze the health data in this instance's pinned results package. You can list metrics and query metric data (CSV), and read the FASTR methodology and reference docs. Everything is read-only.",
        extraCorePrinciples: [],
      });
    },
  });

  // The 2 package tools, bound: the outer tool is the boot-time template
  // (static schema); resolve() runs per call, reads the pin, and hands back
  // the inner tool from that package's context — authorization (instance
  // can_view_data) runs inside resolvePackageContext on every cold resolve,
  // and every data access runs through the headless middleware chain
  // regardless.
  const boundPackageTools = TEMPLATE_TOOLS.map((template) =>
    bindAITool(template, async () => {
      const ctx = await requirePinnedPackageContext(principal);
      const inner = ctx.sessionTools.find(
        (t) => t.sdkTool.name === template.sdkTool.name,
      );
      if (!inner) {
        throw new Error(
          `mcp: no session tool named "${template.sdkTool.name}" in the package context — template and session tool sets have drifted`,
        );
      }
      return inner;
    })
  );

  return [
    getOverviewTool,
    ...boundPackageTools,
    ...getSharedToolsForMethodologyDocs(),
    ...getSharedToolsForInfo(INFO_TOPICS, transport),
  ];
}
