import { t3 } from "lib";
import { Match, Show, Switch } from "solid-js";

type Props = {
  err?: string;
  onClick?: () => void;
  fillAreaNotAvailable?: boolean;
};

export function NotAvailableBox(p: Props) {
  return (
    <Switch>
      <Match when={p.fillAreaNotAvailable}>
        <div
          class="bg-base-200 flex aspect-video flex-col items-center justify-center rounded"
          onClick={p.onClick}
        >
          <span class="ui-text-caption">
            {t3({ en: "Not available", fr: "Non disponible", pt: "Não disponível" })}
          </span>
          <span class="text-base-content-muted mt-1 text-[10px]">
            {p.err ?? t3({ en: "Results not computed for this metric", fr: "Résultats non calculés pour cette métrique", pt: "Resultados não calculados para esta métrica" })}
          </span>
        </div>
      </Match>
      <Match when={!p.fillAreaNotAvailable}>
        <div
          class="flex aspect-video flex-col items-center justify-center"
          onClick={p.onClick}
        >
          <span class="ui-text-caption">
            {t3({ en: "Error", fr: "Erreur", pt: "Erro" })}
          </span>
          <Show when={p.err}>
            <span class="text-base-content-muted mt-1 text-[10px]">
              {p.err}
            </span>
          </Show>
        </div>
      </Match>
    </Switch>
  );
}
