import {
  t3,
  type Dhis2SelectionClassification,
  type Dhis2SelectionDescription,
  type HmisIndicator,
} from "lib";
import { createQuery, toNum0 } from "panther";
import { For, Show, createMemo } from "solid-js";
import {
  dataIdWithIndicator,
  dhis2FormulaRemedy,
  dhis2IdLabel,
  dhis2NotFoundRemedy,
  indicatorsByDataId,
} from "~/components/indicator_manager_hmis/_indicator_display";
import { serverActions } from "~/server_actions";
import { IdListLine } from "./_id_list_line";

type Props = {
  connectionSummary: string;
  nIndicators: number | undefined; // undefined = preset pairs (fixed list, no indicator count to show separately)
  // What the selected indicators expand to (PLAN_A7 ruling 3); undefined
  // for preset pairs, whose list is fixed.
  description: Dhis2SelectionDescription | undefined;
  // The dictionary the picker loaded, which names the ids DHIS2 refuses.
  indicators: HmisIndicator[] | undefined;
  timeSummary: string;
  windowSummary: string;
  nPairs: number | undefined; // undefined when a recurring window can't be sized ahead of fire time
  queueNotice: string | undefined;
};

// Pure summary: the submit button itself lives in the wizard controller's
// ModalContainer actions (matching the "Add visualization" pattern:
// step content never owns navigation/submit chrome).
export function Dhis2StepReview(p: Props) {
  return (
    <div class="ui-spy">
      <Show when={p.description}>
        {(d) => (
          <PreLaunchClassification
            dataIds={d().elements.map((e) => e.dataId)}
            indicators={p.indicators ?? []}
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
    </div>
  );
}

function formulaSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 selected indicator points to a DHIS2 formula (what DHIS2 calls an indicator), which this import does not fetch: every month of it will fail, and its existing data is kept",
        fr: "1 indicateur sélectionné pointe vers une formule DHIS2 (ce que DHIS2 appelle un indicateur), que cette importation ne récupère pas : chaque mois échouera, et ses données existantes sont conservées",
        pt: "1 indicador selecionado aponta para uma fórmula DHIS2 (o que o DHIS2 chama um indicador), que esta importação não obtém: todos os meses falharão, e os seus dados existentes são mantidos",
      })
    : t3({
        en: `${n} selected indicators point to DHIS2 formulas (what DHIS2 calls an indicator), which this import does not fetch: every month of each will fail, and their existing data is kept`,
        fr: `${n} indicateurs sélectionnés pointent vers des formules DHIS2 (ce que DHIS2 appelle un indicateur), que cette importation ne récupère pas : chaque mois de chacun échouera, et leurs données existantes sont conservées`,
        pt: `${n} indicadores selecionados apontam para fórmulas DHIS2 (o que o DHIS2 chama um indicador), que esta importação não obtém: todos os meses de cada um falharão, e os seus dados existentes são mantidos`,
      });
}

function notFoundSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 selected indicator points to nothing in DHIS2 (no data element or operand has its id): every month of it will fail",
        fr: "1 indicateur sélectionné ne correspond à rien dans DHIS2 (aucun élément de données ni opérande n'a son identifiant) : chaque mois échouera",
        pt: "1 indicador selecionado não aponta para nada no DHIS2 (nenhum elemento de dados nem operando tem o seu ID): todos os meses falharão",
      })
    : t3({
        en: `${n} selected indicators point to nothing in DHIS2 (no data element or operand has their ids): every month of each will fail`,
        fr: `${n} indicateurs sélectionnés ne correspondent à rien dans DHIS2 (aucun élément de données ni opérande n'a leurs identifiants) : chaque mois de chacun échouera`,
        pt: `${n} indicadores selecionados não apontam para nada no DHIS2 (nenhum elemento de dados nem operando tem os seus IDs): todos os meses de cada um falharão`,
      });
}

// Asks DHIS2 what the selection's data ids are when the step opens, and
// warns about the ids the run will refuse. Never gates the launch: an error
// is one line, and the run classifies again when it starts.
function PreLaunchClassification(p: {
  dataIds: string[];
  indicators: HmisIndicator[];
}) {
  const classification = createQuery(() =>
    serverActions.classifyDatasetHmisDhis2Selection({ dataIds: p.dataIds }),
  );
  const byDataId = createMemo(() => indicatorsByDataId(p.indicators));
  const label = (dataId: string) =>
    dataIdWithIndicator(byDataId().get(dataId), dataId);
  const errorText = () => {
    const s = classification.state();
    return s.status === "error" ? s.err : undefined;
  };
  const refused = (): Dhis2SelectionClassification | undefined => {
    const s = classification.state();
    return s.status === "ready" &&
        (s.data.formulaIds.length > 0 || s.data.notFoundIds.length > 0)
      ? s.data
      : undefined;
  };
  return (
    <>
      <Show when={classification.state().status === "loading"}>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Asking DHIS2 what the selected ids are...",
            fr: "Interrogation de DHIS2 sur les identifiants sélectionnés...",
            pt: "A perguntar ao DHIS2 o que são os IDs selecionados...",
          })}
        </div>
      </Show>
      <Show when={errorText()}>
        {(err) => (
          <div class="text-base-content-muted text-sm">
            {t3({
              en: `Could not ask DHIS2 what the selected ids are (${err()}). The import classifies them itself when it runs.`,
              fr: `Impossible d'interroger DHIS2 sur les identifiants sélectionnés (${err()}). L'importation les classera elle-même lors de son exécution.`,
              pt: `Não foi possível perguntar ao DHIS2 o que são os IDs selecionados (${err()}). A importação classifica-os quando for executada.`,
            })}
          </div>
        )}
      </Show>
      <Show when={refused()}>
        {(r) => (
          <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border text-sm">
            <IdListLine
              ids={r().formulaIds.map(label)}
              summary={formulaSummary(r().formulaIds.length)}
            />
            <Show when={r().formulaIds.length > 0}>
              <div>{dhis2FormulaRemedy()}</div>
            </Show>
            <IdListLine
              ids={r().notFoundIds.map(label)}
              summary={notFoundSummary(r().notFoundIds.length)}
            />
            <Show when={r().notFoundIds.length > 0}>
              <div>{dhis2NotFoundRemedy()}</div>
            </Show>
          </div>
        )}
      </Show>
    </>
  );
}

function uploadedNotFetchedSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 indicator of type Uploaded is not fetched, because a DHIS2 import cannot fetch it",
        fr: "1 indicateur de type Téléversé n'est pas récupéré, car une importation DHIS2 ne peut pas le récupérer",
        pt: "1 indicador do tipo Carregado não é obtido, porque uma importação DHIS2 não o pode obter",
      })
    : t3({
        en: `${n} indicators of type Uploaded are not fetched, because a DHIS2 import cannot fetch them`,
        fr: `${n} indicateurs de type Téléversé ne sont pas récupérés, car une importation DHIS2 ne peut pas les récupérer`,
        pt: `${n} indicadores do tipo Carregado não são obtidos, porque uma importação DHIS2 não os pode obter`,
      });
}

function populationNotFetchedSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 population figure is not fetched, because it comes from the Population page, not DHIS2",
        fr: "1 valeur de population n'est pas récupérée, car elle provient de la page Population et non de DHIS2",
        pt: "1 valor de população não é obtido, porque provém da página População e não do DHIS2",
      })
    : t3({
        en: `${n} population figures are not fetched, because they come from the Population page, not DHIS2`,
        fr: `${n} valeurs de population ne sont pas récupérées, car elles proviennent de la page Population et non de DHIS2`,
        pt: `${n} valores de população não são obtidos, porque provêm da página População e não do DHIS2`,
      });
}

// The covered elements, one row per DHIS2 element indicator the selection
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
      <IdListLine
        ids={p.description.uploadedDropped}
        summary={uploadedNotFetchedSummary(p.description.uploadedDropped.length)}
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
            })}{" "}
            <span class="font-mono">{u.id}</span> ({u.problem})
          </div>
        )}
      </For>
    </div>
  );
}
