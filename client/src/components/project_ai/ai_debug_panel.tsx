import { createSignal } from "solid-js";
import {
  type AlertComponentProps,
  type SelectOption,
  Button,
  ModalContainer,
  Select,
} from "panther";
import { t3, type MetricWithStatus, type PresentationObjectSummary } from "lib";
import { formatMetricsListForAI } from "./ai_tools/tools/_internal/format_metrics_list_for_ai";
import { formatVisualizationsListForAI } from "./ai_tools/tools/_internal/format_visualizations_list_for_ai";

type DebugView = "metrics" | "visualizations";

const DEBUG_VIEW_OPTIONS: SelectOption<DebugView>[] = [
  { value: "metrics", label: "Available metrics (get_available_metrics)" },
  { value: "visualizations", label: "Available visualizations (get_available_visualizations)" },
];

export type AIDebugPanelProps = {
  metrics: MetricWithStatus[];
  visualizations: PresentationObjectSummary[];
};

type Props = AlertComponentProps<AIDebugPanelProps, void>;

export function AIDebugPanel(p: Props) {
  const [view, setView] = createSignal<DebugView>("metrics");

  const content = () => {
    switch (view()) {
      case "metrics":
        return formatMetricsListForAI(p.metrics);
      case "visualizations":
        return formatVisualizationsListForAI(p.visualizations);
    }
  };

  return (
    <ModalContainer
      title={t3({ en: "AI debug — tool output preview", fr: "Débogage IA — aperçu de la sortie des outils" })}
      width="lg"
      scroll="content"
      rightButtons={
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          {t3({ en: "Close", fr: "Fermer" })}
        </Button>
      }
    >
      <div class="flex flex-col gap-3">
        <Select
          value={view()}
          options={DEBUG_VIEW_OPTIONS}
          onChange={(v) => setView(v as DebugView)}
          fullWidth
        />
        <pre class="whitespace-pre-wrap break-words text-xs">{content()}</pre>
      </div>
    </ModalContainer>
  );
}
