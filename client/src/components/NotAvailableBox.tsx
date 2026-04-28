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
          class="border-base-300 bg-base-200 rounded border p-2"
          onClick={p.onClick}
        >
          <div class="flex aspect-video flex-col items-center justify-center">
            <span class="text-neutral text-xs">
              {t3({ en: "Not available", fr: "Non disponible" })}
            </span>
            <span class="text-neutral mt-1 text-[10px] opacity-60">
              {p.err ?? t3({ en: "Results not computed for this metric", fr: "Résultats non calculés pour cette métrique" })}
            </span>
          </div>
        </div>
      </Match>
      <Match when={!p.fillAreaNotAvailable}>
        <div
          class="flex aspect-video flex-col items-center justify-center"
          onClick={p.onClick}
        >
          <span class="text-neutral text-xs">
            {t3({ en: "Error", fr: "Erreur" })}
          </span>
          <Show when={p.err}>
            <span class="text-neutral mt-1 text-[10px] opacity-60">
              {p.err}
            </span>
          </Show>
        </div>
      </Match>
    </Switch>
  );
}
