import { ResultsValue, t3 } from "lib";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
import { For, Show } from "solid-js";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";

export function MetricDetailsModal(
  p: AlertComponentProps<
    {
      metric: ResultsValue;
    },
    undefined
  >,
) {
  return (
    <ModalContainer
      width="xl"
      topPanel={
        <div class="ui-gap-sm flex items-start">
          <div class="flex-1">
            <div class="font-700 text-base-content text-xl">
              {p.metric.label}
            </div>
            <Show when={p.metric.variantLabel}>
              <div class="text-base-content-muted text-base">{p.metric.variantLabel}</div>
            </Show>
          </div>
          <div class="bg-primary-subtle text-primary-subtle-content rounded px-3 py-1 text-sm">
            {p.metric.formatAs}
          </div>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      <Show when={p.metric.aiDescription}>
        <div class="bg-base-200 ui-spy-sm rounded p-3">
          <div>
            <div class="font-700 text-sm">{t3({ en: "Summary", fr: "Résumé", pt: "Resumo" })}</div>
            <div class="text-sm">{t3(p.metric.aiDescription!.summary)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Methodology", fr: "Méthodologie", pt: "Metodologia" })}</div>
            <div class="text-sm">{t3(p.metric.aiDescription!.methodology)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Interpretation", fr: "Interprétation", pt: "Interpretação" })}</div>
            <div class="text-sm">{t3(p.metric.aiDescription!.interpretation)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Typical range", fr: "Plage typique", pt: "Intervalo típico" })}</div>
            <div class="text-sm">{t3(p.metric.aiDescription!.typicalRange)}</div>
          </div>
          <Show when={p.metric.aiDescription!.caveats}>
            <div>
              <div class="font-700 text-sm">{t3({ en: "Caveats", fr: "Mises en garde", pt: "Advertências" })}</div>
              <div class="text-sm">{t3(p.metric.aiDescription!.caveats!)}</div>
            </div>
          </Show>
        </div>
      </Show>

      <div class="ui-spy-sm">
        <div class="ui-gap grid grid-cols-2">
          <div>
            <div class="ui-text-caption font-700">{t3({ en: "Metric ID", fr: "ID de la métrique", pt: "ID da métrica" })}</div>
            <div class="font-mono text-sm">{p.metric.id}</div>
          </div>
          <div>
            <div class="ui-text-caption font-700">
              {t3({ en: "Results object ID", fr: "ID de l'objet de résultats", pt: "ID do objeto de resultados" })}
            </div>
            <div class="font-mono text-sm">{p.metric.resultsObjectId}</div>
          </div>
        </div>

        <div>
          <div class="ui-text-caption font-700 mb-1">
            {t3({ en: "Value props", fr: "Propriétés de valeur", pt: "Propriedades de valor" })}
          </div>
          <div class="ui-gap-sm flex flex-wrap">
            <For each={p.metric.valueProps}>
              {(prop) => (
                <span class="bg-base-200 font-mono rounded px-2 py-1 text-xs">
                  {prop}
                </span>
              )}
            </For>
          </div>
        </div>

        <div>
          <div class="ui-text-caption font-700 mb-1">
            {t3({ en: "Value func", fr: "Fonction de valeur", pt: "Função de valor" })}
          </div>
          <div class="bg-base-200 font-mono rounded p-2 text-sm">
            {p.metric.valueFunc}
          </div>
        </div>

        {/* <Show when={p.metric.postAggregationExpression}>
          <div>
            <div class="ui-text-caption font-700 mb-1">
              {t("Post aggregation expression")}
            </div>
            <div class="bg-base-200 font-mono rounded p-2 text-sm">
              {p.metric.postAggregationExpression}
            </div>
          </div>
        </Show> */}

        <div>
          <div class="ui-text-caption font-700 mb-1">
            {t3({ en: "Period options", fr: "Options de période", pt: "Opções de período" })}
          </div>
          <div class="ui-gap-sm flex flex-wrap">
            <Show when={p.metric.mostGranularTimePeriodColumnInResultsFile}>
              {(v) => (
                <span class="bg-base-200 font-mono rounded px-2 py-1 text-xs">
                  {v()}
                </span>
              )}
            </Show>
          </div>
        </div>

        <div>
          <div class="ui-text-caption font-700 mb-1">
            {t3({ en: "Disaggregation options", fr: "Options de désagrégation", pt: "Opções de desagregação" })}
          </div>
          <div class="ui-gap-sm grid grid-cols-2">
            <For each={p.metric.disaggregationOptions}>
              {(disOpt) => (
                <div class="border-border flex items-start gap-2 rounded border p-2">
                  <div class="flex-1">
                    <div class="font-700 text-sm">
                      {t3(getDisplayDisaggregationLabel(disOpt.value))}
                    </div>
                    <div class="font-mono ui-text-caption">
                      {disOpt.value}
                    </div>
                    <Show when={disOpt.allowedPresentationOptions}>
                      <div class="ui-text-caption mt-1">
                        {t3({ en: "Allowed for", fr: "Autorisé pour", pt: "Permitido para" })}:{" "}
                        {disOpt.allowedPresentationOptions!.join(", ")}
                      </div>
                    </Show>
                  </div>
                  <Show when={disOpt.isRequired}>
                    <span class="bg-primary-subtle text-primary-subtle-content rounded px-2 py-1 text-xs">
                      {t3({ en: "Required", fr: "Requis", pt: "Obrigatório" })}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>

        <Show when={p.metric.valueLabelReplacements}>
          <div>
            <div class="ui-text-caption font-700 mb-1">
              {t3({ en: "Value label replacements", fr: "Remplacements des libellés de valeur", pt: "Substituições de rótulos de valor" })}
            </div>
            <div class="ui-spy-sm">
              <For each={Object.entries(p.metric.valueLabelReplacements!)}>
                {([key, value]) => (
                  <div class="border-border flex items-center gap-2 rounded border p-2">
                    <span class="font-mono flex-1 text-sm">{key}</span>
                    <span class="text-base-content-muted">→</span>
                    <span class="font-mono flex-1 text-sm">{value}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
