import { t3 } from "lib";
import { Button, toNum0 } from "panther";
import { Show } from "solid-js";

type Props = {
  connectionSummary: string;
  nIndicators: number | undefined; // undefined = preset pairs (fixed list, no indicator count to show separately)
  timeSummary: string;
  windowSummary: string;
  nPairs: number | undefined; // undefined when a recurring window can't be sized ahead of fire time
  queueNotice: string | undefined;
  queueBlockedReason: string | undefined;
  onBackToCredentials: () => void;
};

// Pure summary — the submit button itself lives in the wizard controller's
// ModalContainer rightButtons (matching the "Add visualization" pattern:
// step content never owns navigation/submit chrome).
export function Dhis2StepReview(p: Props) {
  return (
    <div class="ui-spy">
      <div class="border-border ui-pad ui-spy-sm rounded border text-sm">
        <div>
          <span class="font-700">
            {t3({ en: "Connection:", fr: "Connexion :", pt: "Ligação:" })}
          </span>{" "}
          {p.connectionSummary}
        </div>
        <Show when={p.nIndicators !== undefined}>
          <div>
            <span class="font-700">
              {t3({ en: "Indicators:", fr: "Indicateurs :", pt: "Indicadores:" })}
            </span>{" "}
            {toNum0(p.nIndicators ?? 0)}
          </div>
        </Show>
        <div>
          <span class="font-700">{t3({ en: "When:", fr: "Quand :", pt: "Quando:" })}</span>{" "}
          {p.timeSummary}
        </div>
        <div>
          <span class="font-700">
            {t3({ en: "Window:", fr: "Fenêtre :", pt: "Janela:" })}
          </span>{" "}
          {p.windowSummary}
        </div>
        <Show when={p.nPairs !== undefined}>
          <div class="font-700">
            {toNum0(p.nPairs ?? 0)}{" "}
            {t3({
              en: "(indicator, month) pairs",
              fr: "paires (indicateur, mois)",
              pt: "pares (indicador, mês)",
            })}
          </div>
        </Show>
      </div>

      <Show when={p.queueNotice}>
        <div class="border-border bg-base-200 ui-pad text-sm rounded border">
          {p.queueNotice}
        </div>
      </Show>

      <Show when={p.queueBlockedReason}>
        <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border text-sm">
          {p.queueBlockedReason}
          <Button onClick={p.onBackToCredentials} outline size="sm">
            {t3({ en: "Back to step 1", fr: "Retour à l'étape 1", pt: "Voltar ao passo 1" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
