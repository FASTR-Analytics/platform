import {
  type AlertComponentProps,
  createQuery,
  ModalContainer,
  StateHolderWrapper,
} from "panther";
import {
  formatMetricsListForAI,
  hfaTimePointsForAI,
  type ResolvedPackageScope,
  t3,
  TC,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";

// Renders the metric-list formatter VERBATIM over the current view's package,
// so a human sees exactly what get_available_metrics puts in front of the
// model there: the pair's T2 authoring context with the HFA rounds the inner
// set lists.
export type AIDebugPanelProps = {
  scope: ResolvedPackageScope;
};

type Props = AlertComponentProps<AIDebugPanelProps, void>;

export function AIDebugPanel(p: Props) {
  const query = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.scope),
    t3(TC.loading),
  );

  return (
    <ModalContainer
      title={t3({
        en: "AI debug — available metrics (get_available_metrics)",
        fr: "Débogage IA — métriques disponibles (get_available_metrics)",
        pt: "Depuração da IA — métricas disponíveis (get_available_metrics)",
      })}
      width="lg"
      scroll="content"
      onClose={{ kind: "close", onClick: () => p.close() }}
    >
      <StateHolderWrapper state={query.state()} loadingAndErrorPad="md">
        {(ctx) => (
          <pre class="whitespace-pre-wrap break-words text-xs">
            {formatMetricsListForAI(ctx.metrics, ctx.modules, ctx.icehIndicators, {
              ...ctx.hfaTaxonomy,
              timePoints: hfaTimePointsForAI(instanceState.hfaTimePoints),
            })}
          </pre>
        )}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
