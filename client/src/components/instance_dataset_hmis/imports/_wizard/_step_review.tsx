import { t3, type Dhis2SelectionDescription } from "lib";
import { Button, toNum0 } from "panther";
import { For, Show } from "solid-js";
import { dhis2IdLabel } from "~/components/indicator_manager_hmis/_indicator_display";

type Props = {
  connectionSummary: string;
  nIndicators: number | undefined; // undefined = preset pairs (fixed list, no indicator count to show separately)
  // What the selected indicators expand to (PLAN_A7 ruling 3); undefined
  // for preset pairs, whose list is fixed.
  description: Dhis2SelectionDescription | undefined;
  timeSummary: string;
  windowSummary: string;
  nPairs: number | undefined; // undefined when a recurring window can't be sized ahead of fire time
  queueNotice: string | undefined;
  queueBlockedReason: string | undefined;
  onBackToCredentials: () => void;
};

// Pure summary: the submit button itself lives in the wizard controller's
// ModalContainer rightButtons (matching the "Add visualization" pattern:
// step content never owns navigation/submit chrome).
export function Dhis2StepReview(p: Props) {
  return (
    <div class="ui-spy">
      <div class="ui-pad ui-spy-sm rounded border text-sm">
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
            <Show when={p.description}>
              {(d) => (
                <>
                  {" "}({toNum0(d().elements.length)}{" "}
                  {t3({ en: "DHIS2 elements", fr: "éléments DHIS2", pt: "elementos DHIS2" })})
                </>
              )}
            </Show>
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
              en: "(DHIS2 element, month) pairs",
              fr: "paires (élément DHIS2, mois)",
              pt: "pares (elemento DHIS2, mês)",
            })}
          </div>
        </Show>
      </div>

      <Show when={p.description}>
        {(d) => <SelectionDescription description={d()} />}
      </Show>

      <Show when={p.queueNotice}>
        <div class="bg-base-200 ui-pad text-sm rounded border">
          {p.queueNotice}
        </div>
      </Show>

      <Show when={p.queueBlockedReason}>
        <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border text-sm">
          {p.queueBlockedReason}
          <Button onClick={p.onBackToCredentials} intent="danger" size="sm">
            {t3({ en: "Back to step 1", fr: "Retour à l'étape 1", pt: "Voltar ao passo 1" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}

// The covered elements, one row per DHIS2-element indicator the selection
// reaches, then the dropped parts with the reason each is not fetched.
function SelectionDescription(p: { description: Dhis2SelectionDescription }) {
  return (
    <div class="ui-spy-sm text-sm">
      <div class="font-700">
        {t3({
          en: "DHIS2 elements this import fetches",
          fr: "Éléments DHIS2 que cette importation récupère",
          pt: "Elementos DHIS2 que esta importação obtém",
        })}
      </div>
      <div class="max-h-64 overflow-auto rounded border">
        <table class="w-full text-left text-xs">
          <thead class="bg-base-200 sticky top-0">
            <tr>
              <th class="px-2 py-1 font-700">
                {t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" })}
              </th>
              <th class="px-2 py-1 font-700">
                {t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" })}
              </th>
              <th class="px-2 py-1 font-700">{dhis2IdLabel()}</th>
            </tr>
          </thead>
          <tbody>
            <For each={p.description.elements}>
              {(e) => (
                <tr class="border-t">
                  <td class="px-2 py-1 font-mono">{e.indicatorId}</td>
                  <td class="px-2 py-1">{e.label}</td>
                  <td class="px-2 py-1 font-mono">{e.dataId}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={p.description.uploadedDropped.length > 0}>
        <div>
          {t3({
            en: "Not fetched, because a DHIS2 import cannot fetch an Uploaded indicator:",
            fr: "Non récupérés, car une importation DHIS2 ne peut pas récupérer un indicateur téléversé :",
            pt: "Não obtidos, porque uma importação DHIS2 não pode obter um indicador carregado:",
          })}{" "}
          <span class="font-mono">{p.description.uploadedDropped.join(", ")}</span>
        </div>
      </Show>
      <Show when={p.description.populationTermsDropped.length > 0}>
        <div>
          {t3({
            en: "Not fetched, because a population term comes from the population store:",
            fr: "Non récupérés, car un terme de population provient du registre de population :",
            pt: "Não obtidos, porque um termo de população provém do registo de população:",
          })}{" "}
          <span class="font-mono">
            {p.description.populationTermsDropped.join(", ")}
          </span>
        </div>
      </Show>
      <For each={p.description.unresolvable}>
        {(u) => (
          <div class="text-danger">
            {t3({
              en: "Not fetched, because the formula does not resolve:",
              fr: "Non récupéré, car la formule ne se résout pas :",
              pt: "Não obtido, porque a fórmula não se resolve:",
            })}{" "}
            <span class="font-mono">{u.id}</span> ({u.problem})
          </div>
        )}
      </For>
    </div>
  );
}
