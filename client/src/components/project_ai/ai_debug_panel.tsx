import { createSignal } from "solid-js";
import {
  type AlertComponentProps,
  type SelectOption,
  Button,
  ModalContainer,
  Select,
} from "panther";
import {
  t3,
  type HfaTaxonomyForAI,
  type MetricWithStatus,
  type PresentationObjectSummary,
} from "lib";
import { formatMetricsListForAI } from "./ai_tools/tools/_internal/format_metrics_list_for_ai";
import { formatVisualizationsListForAI } from "./ai_tools/tools/_internal/format_visualizations_list_for_ai";

type DebugView = "metrics" | "visualizations";

function getDebugViewOptions(): SelectOption<DebugView>[] {
  return [
    { value: "metrics", label: t3({ en: "Available metrics (get_available_metrics)", fr: "Métriques disponibles (get_available_metrics)", pt: "Métricas disponíveis (get_available_metrics)" }) },
    { value: "visualizations", label: t3({ en: "Available visualizations (get_available_visualizations)", fr: "Visualisations disponibles (get_available_visualizations)", pt: "Visualizações disponíveis (get_available_visualizations)" }) },
  ];
}

export type AIDebugPanelProps = {
  metrics: MetricWithStatus[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: HfaTaxonomyForAI;
  visualizations: PresentationObjectSummary[];
};

type Props = AlertComponentProps<AIDebugPanelProps, void>;

export function AIDebugPanel(p: Props) {
  const [view, setView] = createSignal<DebugView>("metrics");

  const content = () => {
    switch (view()) {
      case "metrics":
        return formatMetricsListForAI(p.metrics, p.icehIndicators, p.hfaTaxonomy);
      case "visualizations":
        return formatVisualizationsListForAI(p.visualizations);
    }
  };

  return (
    <ModalContainer
      title={t3({ en: "AI debug — tool output preview", fr: "Débogage IA — aperçu de la sortie des outils", pt: "Depuração da IA — pré-visualização da saída das ferramentas" })}
      width="lg"
      scroll="content"
      rightButtons={
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>
      }
    >
      <div class="flex flex-col gap-3">
        <Select
          value={view()}
          options={getDebugViewOptions()}
          onChange={(v) => setView(v as DebugView)}
          fullWidth
        />
        <pre class="whitespace-pre-wrap break-words text-xs">{content()}</pre>
      </div>
    </ModalContainer>
  );
}
