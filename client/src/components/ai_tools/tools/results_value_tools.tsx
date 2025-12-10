import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";

export function createResultsValueTools(projectId: string) {
  return [
    createAITool({
      name: "get_available_results_values",
      description:
        "Get all available ResultsValues from installed modules. Each ResultsValue represents a data metric that can be visualized. Returns module info, value labels, disaggregation options (dimensions you can break data down by), and period options (time granularity).",
      inputSchema: z.object({}),
      handler: async () => {
        const res = await serverActions.getAllModulesWithResultsValues({
          projectId,
        });
        if (!res.success) throw new Error(res.err);
        return formatResultsValuesForAI(res.data);
      },
      inProgressLabel: "Getting available data values...",
    }),

    createAITool({
      name: "get_results_value_details",
      description:
        "Get detailed information about a specific ResultsValue including data availability, period bounds (min/max time range), and possible values for each disaggregation dimension.",
      inputSchema: z.object({
        moduleId: z.string().describe("Module ID containing the data"),
        resultsValueId: z.string().describe("ResultsValue ID to get details for"),
      }),
      handler: async (input) => {
        const res = await serverActions.getResultsValueInfoForPresentationObject(
          {
            projectId,
            moduleId: input.moduleId,
            resultsValueId: input.resultsValueId,
          }
        );
        if (!res.success) throw new Error(res.err);
        return formatResultsValueDetailsForAI(res.data);
      },
      inProgressLabel: "Getting data value details...",
    }),
  ];
}

function formatResultsValuesForAI(
  modules: {
    id: string;
    label: string;
    resultsValues: {
      id: string;
      label: string;
      formatAs: string;
      disaggregationOptions: {
        value: string;
        label: string | { en: string; fr?: string };
        isRequired: boolean;
      }[];
      periodOptions: string[];
      aiDescription?: {
        summary: string;
        methodology?: string;
        interpretation?: string;
        useCases?: string[];
      };
    }[];
  }[]
): string {
  const lines: string[] = ["AVAILABLE DATA VALUES (ResultsValues)", "=".repeat(80), ""];

  for (const module of modules) {
    lines.push(`MODULE: ${module.label} (${module.id})`);
    lines.push("-".repeat(40));

    if (module.resultsValues.length === 0) {
      lines.push("  No results values available");
    }

    for (const rv of module.resultsValues) {
      lines.push(`  ID: ${rv.id}`);
      lines.push(`  Label: ${rv.label}`);
      lines.push(`  Format: ${rv.formatAs}`);

      if (rv.aiDescription?.summary) {
        lines.push(`  Description: ${rv.aiDescription.summary}`);
      }

      lines.push(`  Disaggregation options:`);
      for (const opt of rv.disaggregationOptions) {
        const label =
          typeof opt.label === "string" ? opt.label : opt.label.en;
        const required = opt.isRequired ? " (required)" : "";
        lines.push(`    - ${opt.value}: ${label}${required}`);
      }

      lines.push(`  Period options: ${rv.periodOptions.join(", ")}`);
      lines.push("");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatResultsValueDetailsForAI(data: {
  periodBounds?: { min: number; max: number };
  disaggregationPossibleValues: {
    [key: string]:
    | { status: "ok"; values: string[] }
    | { status: "too_many_values" }
    | { status: "no_values_available" }
    | undefined;
  };
}): string {
  const lines: string[] = ["RESULTS VALUE DETAILS", "=".repeat(80), ""];

  if (data.periodBounds) {
    lines.push(`Period range: ${data.periodBounds.min} to ${data.periodBounds.max}`);
    lines.push("");
  }

  lines.push("Disaggregation dimensions:");
  for (const [disOpt, info] of Object.entries(data.disaggregationPossibleValues)) {
    if (!info) continue;
    lines.push(`  ${disOpt}:`);
    if (info.status === "too_many_values") {
      lines.push(`    Status: Too many values (use filtering)`);
    } else if (info.status === "no_values_available") {
      lines.push(`    Status: No values available`);
    } else if (info.status === "ok") {
      lines.push(`    Values (${info.values.length}):`);
      for (const val of info.values.slice(0, 20)) {
        lines.push(`      - ${val}`);
      }
      if (info.values.length > 20) {
        lines.push(`      ... and ${info.values.length - 20} more`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
