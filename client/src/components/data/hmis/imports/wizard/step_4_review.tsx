import { type Dhis2SelectionDescription, type HmisIndicator, t3 } from "lib";
import { createQuery, plural, toNum0 } from "panther";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  dataIdWithIndicator,
  dhis2FormulaRemedy,
  dhis2IdLabel,
  dhis2NotFoundRemedy,
  indicatorsByDataId,
} from "~/components/data/hmis/_shared/mod.ts";
import { IdListLine } from "./id_list_line";

type Props = {
  connectionSummary: string;
  nIndicators: number | undefined; // undefined = preset pairs (fixed list, no indicator count to show separately)
  // What the selected indicators expand to (PLAN_A7 ruling 3); undefined
  // for preset pairs, whose list is fixed.
  description: Dhis2SelectionDescription | undefined;
  dictionary: HmisIndicator[] | undefined;
  timeSummary: string;
  windowSummary: string;
  nPairs: number | undefined; // undefined when a recurring window can't be sized ahead of fire time
  queueNotice: string | undefined;
};

// The submit button itself lives in the wizard controller's ModalContainer
// actions (matching the "Add visualization" pattern: step content never owns
// navigation/submit chrome).
export function Dhis2StepReview(p: Props) {
  const byDataId = createMemo(() => indicatorsByDataId(p.dictionary ?? []));
  return (
    <div class="ui-spy">
      <Show when={p.description}>
        {(d) => (
          <SelectionClassification
            dataIds={d().elements.map((e) => e.dataId)}
            byDataId={byDataId()}
          />
        )}
      </Show>

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
              {t3({
                en: "Indicators:",
                fr: "Indicateurs :",
                pt: "Indicadores:",
              })}
            </span>{" "}
            {toNum0(p.nIndicators ?? 0)}
            <Show when={p.description}>
              {(d) => (
                <>
                  {" "}({toNum0(d().elements.length)} {t3({
                    en: "DHIS2 elements",
                    fr: "éléments DHIS2",
                    pt: "elementos DHIS2",
                  })})
                </>
              )}
            </Show>
          </div>
        </Show>
        <div>
          <span class="font-700">
            {t3({ en: "When:", fr: "Quand :", pt: "Quando:" })}
          </span>{" "}
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
            {toNum0(p.nPairs ?? 0)} {t3({
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
    </div>
  );
}

function formulaSummary(n: number): string {
  return plural(n, {
    one: t3({
      en:
        "1 selected indicator points to a DHIS2 formula (what DHIS2 calls an indicator), which a DHIS2 import does not fetch, so every month of it will fail",
      fr:
        "1 indicateur sélectionné pointe vers une formule DHIS2 (ce que DHIS2 appelle un indicateur), qu'une importation DHIS2 ne récupère pas : chacun de ses mois échouera",
      pt:
        "1 indicador selecionado aponta para uma fórmula DHIS2 (aquilo a que o DHIS2 chama um indicador), que uma importação DHIS2 não obtém, pelo que todos os seus meses falharão",
    }),
    other: t3({
      en:
        `${n} selected indicators point to DHIS2 formulas (what DHIS2 calls indicators), which a DHIS2 import does not fetch, so every month of them will fail`,
      fr:
        `${n} indicateurs sélectionnés pointent vers des formules DHIS2 (ce que DHIS2 appelle des indicateurs), qu'une importation DHIS2 ne récupère pas : chacun de leurs mois échouera`,
      pt:
        `${n} indicadores selecionados apontam para fórmulas DHIS2 (aquilo a que o DHIS2 chama indicadores), que uma importação DHIS2 não obtém, pelo que todos os seus meses falharão`,
    }),
  });
}

function notFoundSummary(n: number): string {
  return plural(n, {
    one: t3({
      en:
        "1 selected indicator points to nothing in DHIS2, so every month of it will fail",
      fr:
        "1 indicateur sélectionné ne pointe vers rien dans DHIS2 : chacun de ses mois échouera",
      pt:
        "1 indicador selecionado não aponta para nada no DHIS2, pelo que todos os seus meses falharão",
    }),
    other: t3({
      en:
        `${n} selected indicators point to nothing in DHIS2, so every month of them will fail`,
      fr:
        `${n} indicateurs sélectionnés ne pointent vers rien dans DHIS2 : chacun de leurs mois échouera`,
      pt:
        `${n} indicadores selecionados não apontam para nada no DHIS2, pelo que todos os seus meses falharão`,
    }),
  });
}

function SelectionClassification(p: {
  dataIds: string[];
  byDataId: Map<string, HmisIndicator>;
}) {
  const classification = createQuery(() =>
    serverActions.classifyDatasetHmisDhis2Selection({ dataIds: p.dataIds })
  );
  const error = () => {
    const s = classification.state();
    return s.status === "error" ? s.err : undefined;
  };
  const data = () => {
    const s = classification.state();
    return s.status === "ready" ? s.data : undefined;
  };
  const listed = (ids: string[]) =>
    ids.map((id) => dataIdWithIndicator(id, p.byDataId.get(id)));
  return (
    <Switch>
      <Match when={classification.state().status === "loading"}>
        <div>
          {t3({
            en: "Checking the selected DHIS2 ids with DHIS2...",
            fr:
              "Vérification des identifiants DHIS2 sélectionnés auprès de DHIS2...",
            pt: "A verificar os IDs DHIS2 selecionados junto do DHIS2...",
          })}
        </div>
      </Match>
      <Match when={error()}>
        {(err) => (
          <div>
            {t3({
              en: "The selected DHIS2 ids could not be checked before launch",
              fr:
                "Les identifiants DHIS2 sélectionnés n'ont pas pu être vérifiés avant le lancement",
              pt:
                "Os IDs DHIS2 selecionados não puderam ser verificados antes do início",
            })} ({err()}). {t3({
              en: "The import checks them when it runs.",
              fr: "L'importation les vérifie lors de son exécution.",
              pt: "A importação verifica-os quando é executada.",
            })}
          </div>
        )}
      </Match>
      <Match when={data()}>
        {(result) => (
          <>
            <Show when={result().formulaIds.length > 0}>
              <div class="ui-spy-sm">
                <IdListLine
                  ids={listed(result().formulaIds)}
                  summary={formulaSummary(result().formulaIds.length)}
                  class="text-danger"
                />
                <div>{dhis2FormulaRemedy()}</div>
              </div>
            </Show>
            <Show when={result().notFoundIds.length > 0}>
              <div class="ui-spy-sm">
                <IdListLine
                  ids={listed(result().notFoundIds)}
                  summary={notFoundSummary(result().notFoundIds.length)}
                  class="text-danger"
                />
                <div>{dhis2NotFoundRemedy()}</div>
              </div>
            </Show>
          </>
        )}
      </Match>
    </Switch>
  );
}

function uploadedNotFetchedSummary(n: number): string {
  return plural(n, {
    one: t3({
      en:
        "1 indicator of type Uploaded is not fetched, because a DHIS2 import cannot fetch it",
      fr:
        "1 indicateur de type Téléversé n'est pas récupéré, car une importation DHIS2 ne peut pas le récupérer",
      pt:
        "1 indicador do tipo Carregado não é obtido, porque uma importação DHIS2 não o pode obter",
    }),
    other: t3({
      en:
        `${n} indicators of type Uploaded are not fetched, because a DHIS2 import cannot fetch them`,
      fr:
        `${n} indicateurs de type Téléversé ne sont pas récupérés, car une importation DHIS2 ne peut pas les récupérer`,
      pt:
        `${n} indicadores do tipo Carregado não são obtidos, porque uma importação DHIS2 não os pode obter`,
    }),
  });
}

function populationNotFetchedSummary(n: number): string {
  return plural(n, {
    one: t3({
      en:
        "1 population figure is not fetched, because it comes from the Population page, not DHIS2",
      fr:
        "1 valeur de population n'est pas récupérée, car elle provient de la page Population et non de DHIS2",
      pt:
        "1 valor de população não é obtido, porque provém da página População e não do DHIS2",
    }),
    other: t3({
      en:
        `${n} population figures are not fetched, because they come from the Population page, not DHIS2`,
      fr:
        `${n} valeurs de population ne sont pas récupérées, car elles proviennent de la page Population et non de DHIS2`,
      pt:
        `${n} valores de população não são obtidos, porque provêm da página População e não do DHIS2`,
    }),
  });
}

// The covered elements, one row per DHIS2 element indicator the selection
// reaches, then the dropped parts with the reason each is not fetched.
function SelectionDescription(p: { description: Dhis2SelectionDescription }) {
  return (
    <div class="ui-spy-sm text-sm">
      <div class="ui-text-heading">
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
                {t3({
                  en: "Indicator ID",
                  fr: "ID indicateur",
                  pt: "ID do indicador",
                })}
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
      <IdListLine
        ids={p.description.uploadedDropped}
        summary={uploadedNotFetchedSummary(
          p.description.uploadedDropped.length,
        )}
      />
      <IdListLine
        ids={p.description.populationTermsDropped}
        summary={populationNotFetchedSummary(
          p.description.populationTermsDropped.length,
        )}
      />
      <For each={p.description.unresolvable}>
        {(u) => (
          <div class="text-danger">
            {t3({
              en: "Not fetched, because the formula does not resolve:",
              fr: "Non récupéré, car la formule ne se résout pas :",
              pt: "Não obtido, porque a fórmula não se resolve:",
            })} <span class="font-mono">{u.id}</span> ({u.problem})
          </div>
        )}
      </For>
    </div>
  );
}
