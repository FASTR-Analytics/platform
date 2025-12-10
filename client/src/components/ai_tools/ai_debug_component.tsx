import { t } from "lib";
import { Button, getSelectOptions, getSelectOptionsFromIdLabel, Input, Select, timActionButton } from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
};

const TOOLS = [
  { id: "get_available_results_values", label: "Get Available Results Values" },
  { id: "get_results_value_details", label: "Get Results Value Details" },
  { id: "get_visualizations_list", label: "Get Visualizations List" },
  { id: "get_modules_list", label: "Get Modules List" },
];

export function AIToolsDebug(p: Props) {
  const [selectedTool, setSelectedTool] = createSignal<string>(TOOLS[0].id);
  const [moduleId, setModuleId] = createSignal("");
  const [resultsValueId, setResultsValueId] = createSignal("");
  const [output, setOutput] = createSignal<string | null>(null);

  const runTool = timActionButton(async () => {
    const tool = selectedTool();
    let result: string;

    if (tool === "get_available_results_values") {
      const res = await serverActions.getAllModulesWithResultsValues({
        projectId: p.projectId,
      });
      if (!res.success) return res;
      result = formatResultsValuesForAI(res.data);
    } else if (tool === "get_results_value_details") {
      if (!moduleId() || !resultsValueId()) {
        return { success: false, err: t("moduleId and resultsValueId are required") };
      }
      const res = await serverActions.getResultsValueInfoForPresentationObject({
        projectId: p.projectId,
        moduleId: moduleId(),
        resultsValueId: resultsValueId(),
      });
      if (!res.success) return res;
      result = formatResultsValueDetailsForAI(res.data);
    } else if (tool === "get_visualizations_list") {
      const res = await serverActions.getVisualizationsList({
        projectId: p.projectId,
      });
      if (!res.success) return res;
      result = res.data;
    } else if (tool === "get_modules_list") {
      const res = await serverActions.getModulesList({
        projectId: p.projectId,
      });
      if (!res.success) return res;
      result = res.data;
    } else {
      return { success: false, err: t("Unknown tool") };
    }

    setOutput(result);
    return { success: true, data: null };
  }, () => { });

  const needsParams = () => selectedTool() === "get_results_value_details";

  return (
    <div class="ui-pad ui-spy flex h-full flex-col">
      <h2 class="text-lg font-semibold">{t("AI Tools Debug")}</h2>

      <div class="ui-gap flex flex-wrap items-end">
        <Select
          label={t("Tool")}
          value={selectedTool()}
          onChange={setSelectedTool}
          options={getSelectOptionsFromIdLabel(TOOLS)}
        />

        <Show when={needsParams()}>
          <Input
            label={t("Module ID")}
            value={moduleId()}
            onChange={setModuleId}
            placeholder="e.g., m003"
          />
          <Input
            label={t("Results Value ID")}
            value={resultsValueId()}
            onChange={setResultsValueId}
            placeholder="e.g., m3-01-01"
          />
        </Show>

        <Button onClick={runTool.click} state={runTool.state()}>
          {t("Run")}
        </Button>
      </div>

      <Show when={output()}>
        <div class="border-base-300 flex-1 overflow-auto rounded border bg-neutral-50">
          <pre class="ui-pad whitespace-pre-wrap font-mono text-sm">
            {output()}
          </pre>
        </div>
      </Show>
    </div>
  );
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
  const lines: string[] = [
    "AVAILABLE DATA VALUES (ResultsValues)",
    "=".repeat(80),
    "",
  ];

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
        const label = typeof opt.label === "string" ? opt.label : opt.label.en;
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
    lines.push(
      `Period range: ${data.periodBounds.min} to ${data.periodBounds.max}`
    );
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
