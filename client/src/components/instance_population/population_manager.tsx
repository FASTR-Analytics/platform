// The instance Population page: the store's values as a grid per population
// type against the HMIS structure at the population level, CSV import/export,
// and the population type vocabulary.

import { t3, TC } from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  HeadingBar,
  createDeleteAction,
  getEditorWrapper,
} from "panther";
import { Show } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { PopulationImportForm } from "./_import_form";
import { PopulationGrid } from "./_population_grid";
import { PopulationTypesEditor } from "./_population_types";

type Props = {
  backToInstance: () => void;
};

export function PopulationManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const canConfigure = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

  const hasData = () => instanceState.populationLevel !== null;
  // An import validates every area against admin_areas_hmis_<level>.
  const hasHmisStructure = () =>
    (instanceState.structure?.hmis.adminArea2s ?? 0) > 0;

  async function openImport() {
    await openEditor({ element: PopulationImportForm, props: {} });
  }

  async function openTypes() {
    await openEditor({ element: PopulationTypesEditor, props: {} });
  }

  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Delete all population data? This also clears the population level; the next import sets it again.",
        fr: "Supprimer toutes les données de population ? Le niveau de population est aussi effacé ; le prochain import le fixera de nouveau.",
        pt: "Eliminar todos os dados de população? O nível de população também é apagado; a próxima importação volta a defini-lo.",
      }),
      () => serverActions.deleteAllPopulation({}),
    );
    await deleteAction.click();
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={p.backToInstance}
            heading={t3({
              en: "Population",
              fr: "Population",
              pt: "População",
            })}
          >
            <Show when={hasData()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/population/export/csv?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={canConfigure()}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <Button
                  onClick={openImport}
                  iconName="upload"
                  disabled={!hasHmisStructure()}
                  fullWidth
                >
                  {t3({
                    en: "Import CSV",
                    fr: "Importer un CSV",
                    pt: "Importar CSV",
                  })}
                </Button>
                <Show when={!hasHmisStructure()}>
                  <div class="text-base-content-muted text-xs">
                    {t3({
                      en: "Import the HMIS facility structure first: population data is validated against its admin areas.",
                      fr: "Importez d'abord la structure des établissements SNIS : les données de population sont vérifiées par rapport à ses unités administratives.",
                      pt: "Importe primeiro a estrutura de estabelecimentos SNIS: os valores são validados contra as suas zonas administrativas.",
                    })}
                  </div>
                </Show>
                <Show when={hasData()}>
                  <Button
                    onClick={attemptDeleteAll}
                    intent="danger"
                    outline
                    iconName="trash"
                    fullWidth
                  >
                    {t3({
                      en: "Delete all population data",
                      fr: "Supprimer toutes les données de population",
                      pt: "Eliminar todos os dados de população",
                    })}
                  </Button>
                </Show>
                <Button onClick={openTypes} iconName="pencil" fullWidth>
                  {t3({
                    en: "Manage population types",
                    fr: "Gérer les types de population",
                    pt: "Gerir os tipos de população",
                  })}
                </Button>
              </div>
            </Show>
          }
        >
          <Show
            when={hasData()}
            fallback={<EmptyStore canConfigure={canConfigure()} />}
          >
            <PopulationGrid canConfigure={canConfigure()} />
          </Show>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}

function EmptyStore(p: { canConfigure: boolean }) {
  return (
    <div class="ui-pad ui-spy-sm text-base-content-muted text-sm">
      <div>
        {t3({
          en: "No population data. Annual population counts per admin area feed the indicator formulas that divide by a population. The first import sets the population level: the admin area level of its rows, which every later import must match.",
          fr: "Aucune donnée de population. Les effectifs annuels de population par unité administrative alimentent les formules d'indicateurs qui divisent par une population. Le premier import fixe le niveau de population : le niveau administratif de ses lignes, que chaque import suivant doit respecter.",
          pt: "Sem dados de população. Os efetivos anuais de população por zona administrativa alimentam as fórmulas de indicadores que dividem por uma população. A primeira importação define o nível de população: o nível administrativo das suas linhas, que todas as importações seguintes têm de respeitar.",
        })}
      </div>
      <Show when={p.canConfigure}>
        <div>
          {t3({
            en: "Import a CSV to add population data.",
            fr: "Importez un CSV pour ajouter des données de population.",
            pt: "Importe um CSV para adicionar dados de população.",
          })}
        </div>
      </Show>
    </div>
  );
}
