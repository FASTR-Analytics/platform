import { t, type DisaggregationOption } from "lib";
import { Button, getSelectOptionsFromIdLabel, Input, Select, timActionButton } from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getMetricDataForAI } from "./get_metric_data_for_ai";

type Props = {
  projectId: string;
};

const TOOLS = [
  { id: "get_available_metrics", label: "Get Available Metrics" },
  { id: "get_metric_data", label: "Get Metric Data" },
  { id: "get_visualizations_list", label: "Get Visualizations List" },
  { id: "get_modules_list", label: "Get Modules List" },
];

export function AIToolsDebug(p: Props) {
  const [selectedTool, setSelectedTool] = createSignal<string>(TOOLS[0].id);
  const [output, setOutput] = createSignal<string | null>(null);

  // Inputs for get_metric_data
  const [metricId, setMetricId] = createSignal("");
  const [disaggregations, setDisaggregations] = createSignal("");

  const runTool = timActionButton(async () => {
    const tool = selectedTool();
    let result: string;

    if (tool === "get_available_metrics") {
      const res = await serverActions.getMetricsListForAI({
        projectId: p.projectId,
      });
      if (!res.success) return res;
      result = res.data;
    } else if (tool === "get_metric_data") {
      if (!metricId()) {
        return { success: false, err: "metricId is required" };
      }
      const disaggArr = disaggregations()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) as DisaggregationOption[];
      try {
        result = await getMetricDataForAI(
          p.projectId,
          metricId(),
          disaggArr,
        );
      } catch (error) {
        return { success: false, err: String(error) };
      }
    } else if (tool === "get_visualizations_list") {
      const res = await serverActions.getVisualizationsListForAI({
        projectId: p.projectId,
      });
      if (!res.success) return res;
      result = res.data;
    } else if (tool === "get_modules_list") {
      const res = await serverActions.getModulesListForAI({
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

  const needsMetricInputs = () => selectedTool() === "get_metric_data";

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

        <Show when={needsMetricInputs()}>
          <Input
            label="Metric ID"
            value={metricId()}
            onChange={setMetricId}
            placeholder="e.g., m1-01-00"
          />
          <Input
            label="Disaggregations"
            value={disaggregations()}
            onChange={setDisaggregations}
            placeholder="e.g., indicator_common_id, year"
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
