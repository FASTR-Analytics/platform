import {
  type AlertComponentProps,
  Button,
  ModalContainer,
} from "panther";
import {
  t3,
  type HfaTaxonomyForAI,
  type MetricWithStatus,
} from "lib";
import { formatMetricsListForAI } from "lib";

// Renders the metric-list formatter VERBATIM, so a human sees exactly what
// get_available_metrics puts in front of the model.
export type AIDebugPanelProps = {
  metrics: MetricWithStatus[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: HfaTaxonomyForAI;
};

type Props = AlertComponentProps<AIDebugPanelProps, void>;

export function AIDebugPanel(p: Props) {
  const content = () =>
    formatMetricsListForAI(p.metrics, p.icehIndicators, p.hfaTaxonomy);

  return (
    <ModalContainer
      title={t3({ en: "AI debug — available metrics (get_available_metrics)", fr: "Débogage IA — métriques disponibles (get_available_metrics)", pt: "Depuração da IA — métricas disponíveis (get_available_metrics)" })}
      width="lg"
      scroll="content"
      rightButtons={
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>
      }
    >
      <pre class="whitespace-pre-wrap break-words text-xs">{content()}</pre>
    </ModalContainer>
  );
}
