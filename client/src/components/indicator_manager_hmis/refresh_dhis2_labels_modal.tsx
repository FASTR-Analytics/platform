import {
  AlertComponentProps,
  Button,
  Callout,
  ModalContainer,
  createButtonAction,
} from "panther";
import { createSignal, Show } from "solid-js";
import { type Dhis2LabelRefresh, t3, TC } from "lib";
import { serverActions } from "~/server_actions";

// The DHIS2 name refresh, explained before it runs and reported after: one
// request the button waits on with its spinner (DHIS2 reports no partial
// progress, so there is no bar to draw), then the counts in place of the
// explanation. A failure is the action's alert; the button is ready again.
type Props = AlertComponentProps<{ elementCount: number }, undefined>;

export function RefreshDhis2LabelsModal(p: Props) {
  const [result, setResult] = createSignal<Dhis2LabelRefresh>();
  const refresh = createButtonAction(
    () => serverActions.refreshDhis2Labels({}),
    (data) => {
      setResult(data);
    },
  );

  return (
    <ModalContainer
      title={t3({
        en: "Refresh DHIS2 names",
        fr: "Actualiser les noms DHIS2",
        pt: "Atualizar nomes DHIS2",
      })}
      rightButtons={
        <Show
          when={result()}
          fallback={
            <>
              <Button intent="neutral" onClick={() => p.close(undefined)}>
                {t3(TC.cancel)}
              </Button>
              <Button intent="primary" iconName="refresh" state={refresh.state()} onClick={refresh.click}>
                {t3({ en: "Refresh", fr: "Actualiser", pt: "Atualizar" })}
              </Button>
            </>
          }
        >
          <Button intent="primary" onClick={() => p.close(undefined)}>
            {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
          </Button>
        </Show>
      }
    >
      <div class="ui-spy text-sm">
        <Show when={result()} fallback={<Explanation elementCount={p.elementCount} />}>
          {(r) => <Result result={r()} />}
        </Show>
      </div>
    </ModalContainer>
  );
}

function Explanation(p: { elementCount: number }) {
  return (
    <>
      <div>
        {t3({
          en: "Reads the current name of every DHIS2 element indicator from DHIS2, by its DHIS2 id, and stores it as the indicator's DHIS2 name.",
          fr: "Lit le nom actuel de chaque indicateur élément DHIS2 depuis DHIS2, par son identifiant DHIS2, et l'enregistre comme nom DHIS2 de l'indicateur.",
          pt: "Lê o nome atual de cada indicador elemento DHIS2 a partir do DHIS2, pelo seu ID DHIS2, e guarda-o como nome DHIS2 do indicador.",
        })}
      </div>
      <div>
        {t3({
          en: "Labels, ids and data are not changed. An element DHIS2 no longer has keeps its stored name.",
          fr: "Les libellés, les identifiants et les données ne changent pas. Un élément que DHIS2 n'a plus conserve son nom enregistré.",
          pt: "Os rótulos, os IDs e os dados não mudam. Um elemento que o DHIS2 já não tem mantém o nome guardado.",
        })}
      </div>
      <div class="font-700">
        {t3({
          en: `${p.elementCount} DHIS2 element indicator(s) will be read.`,
          fr: `${p.elementCount} indicateur(s) élément DHIS2 seront lus.`,
          pt: `${p.elementCount} indicador(es) elemento DHIS2 serão lidos.`,
        })}
      </div>
    </>
  );
}

function Result(p: { result: Dhis2LabelRefresh }) {
  return (
    <>
      <Callout intent="success" pad="sm">
        {t3({
          en: `${p.result.refreshed} DHIS2 name(s) updated, ${p.result.unchanged} already current.`,
          fr: `${p.result.refreshed} nom(s) DHIS2 mis à jour, ${p.result.unchanged} déjà à jour.`,
          pt: `${p.result.refreshed} nome(s) DHIS2 atualizado(s), ${p.result.unchanged} já atual(is).`,
        })}
      </Callout>
      <Show when={p.result.notFound.length > 0}>
        <Callout intent="warning" pad="sm">
          {t3({
            en: "Not found in DHIS2, left as they are:",
            fr: "Introuvables dans DHIS2, laissés tels quels :",
            pt: "Não encontrados no DHIS2, mantidos como estão:",
          })}{" "}
          <span class="font-mono">{p.result.notFound.join(", ")}</span>
        </Callout>
      </Show>
    </>
  );
}
