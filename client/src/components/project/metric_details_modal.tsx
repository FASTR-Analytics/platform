import { ResultsValue, t2, t3 } from "lib";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
import { For, Show } from "solid-js";

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
              <div class="text-neutral text-base">{p.metric.variantLabel}</div>
            </Show>
          </div>
          <div class="bg-primary/10 text-primary rounded px-3 py-1 text-sm">
            {p.metric.formatAs}
          </div>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3({ en: "Close", fr: "Fermer" })}
          </Button>,
        ]
      }
    >
      <Show when={p.metric.aiDescription}>
        <div class="bg-base-200 ui-spy-sm rounded p-3">
          <div>
            <div class="font-700 text-sm">{t3({ en: "Summary", fr: "Résumé" })}</div>
            <div class="text-sm">{t2(p.metric.aiDescription!.summary)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Methodology", fr: "Méthodologie" })}</div>
            <div class="text-sm">{t2(p.metric.aiDescription!.methodology)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Interpretation", fr: "Interprétation" })}</div>
            <div class="text-sm">{t2(p.metric.aiDescription!.interpretation)}</div>
          </div>
          <div>
            <div class="font-700 text-sm">{t3({ en: "Typical range", fr: "Plage typique" })}</div>
            <div class="text-sm">{t2(p.metric.aiDescription!.typicalRange)}</div>
          </div>
          <Show when={p.metric.aiDescription!.caveats}>
            <div>
              <div class="font-700 text-sm">{t3({ en: "Caveats", fr: "Mises en garde" })}</div>
              <div class="text-sm">{t2(p.metric.aiDescription!.caveats!)}</div>
            </div>
          </Show>
        </div>
      </Show>

      <div class="ui-spy-sm">
        <div class="ui-gap grid grid-cols-2">
          <div>
            <div class="text-neutral font-700 text-xs">{t3({ en: "Metric ID", fr: "ID de la métrique" })}</div>
            <div class="font-mono text-sm">{p.metric.id}</div>
          </div>
          <div>
            <div class="text-neutral font-700 text-xs">
              {t3({ en: "Results object ID", fr: "ID de l'objet de résultats" })}
            </div>
            <div class="font-mono text-sm">{p.metric.resultsObjectId}</div>
          </div>
        </div>

        <div>
          <div class="text-neutral font-700 mb-1 text-xs">
            {t3({ en: "Value props", fr: "Propriétés de valeur" })}
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
          <div class="text-neutral font-700 mb-1 text-xs">
            {t3({ en: "Value func", fr: "Fonction de valeur" })}
          </div>
          <div class="bg-base-200 font-mono rounded p-2 text-sm">
            {p.metric.valueFunc}
          </div>
        </div>

        {/* <Show when={p.metric.postAggregationExpression}>
          <div>
            <div class="text-neutral font-700 mb-1 text-xs">
              {t("Post aggregation expression")}
            </div>
            <div class="bg-base-200 font-mono rounded p-2 text-sm">
              {p.metric.postAggregationExpression}
            </div>
          </div>
        </Show> */}

        <div>
          <div class="text-neutral font-700 mb-1 text-xs">
            {t3({ en: "Period options", fr: "Options de période" })}
          </div>
          <div class="ui-gap-sm flex flex-wrap">
            <For each={p.metric.periodOptions}>
              {(period) => (
                <span class="bg-base-200 font-mono rounded px-2 py-1 text-xs">
                  {period}
                </span>
              )}
            </For>
          </div>
        </div>

        <div>
          <div class="text-neutral font-700 mb-1 text-xs">
            {t3({ en: "Disaggregation options", fr: "Options de désagrégation" })}
          </div>
          <div class="ui-gap-sm grid grid-cols-2">
            <For each={p.metric.disaggregationOptions}>
              {(disOpt) => (
                <div class="border-base-300 flex items-start gap-2 rounded border p-2">
                  <div class="flex-1">
                    <div class="font-700 text-sm">
                      {typeof disOpt.label === "string"
                        ? disOpt.label
                        : t2(disOpt.label)}
                    </div>
                    <div class="font-mono text-neutral text-xs">
                      {disOpt.value}
                    </div>
                    <Show when={disOpt.allowedPresentationOptions}>
                      <div class="text-neutral mt-1 text-xs">
                        {t3({ en: "Allowed for", fr: "Autorisé pour" })}:{" "}
                        {disOpt.allowedPresentationOptions!.join(", ")}
                      </div>
                    </Show>
                  </div>
                  <Show when={disOpt.isRequired}>
                    <span class="bg-primary/10 text-primary rounded px-2 py-1 text-xs">
                      {t3({ en: "Required", fr: "Requis" })}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>

        <Show when={p.metric.valueLabelReplacements}>
          <div>
            <div class="text-neutral font-700 mb-1 text-xs">
              {t3({ en: "Value label replacements", fr: "Remplacements des libellés de valeur" })}
            </div>
            <div class="ui-spy-sm">
              <For each={Object.entries(p.metric.valueLabelReplacements!)}>
                {([key, value]) => (
                  <div class="border-base-300 flex items-center gap-2 rounded border p-2">
                    <span class="font-mono flex-1 text-sm">{key}</span>
                    <span class="text-neutral">→</span>
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
