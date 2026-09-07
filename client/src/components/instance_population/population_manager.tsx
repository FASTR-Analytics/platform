import {
  ALL_ADMIN_AREA_LEVELS,
  parseAdminAreaLevel,
  t3,
  TC,
  type AdminAreaLevel,
} from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  HeadingBar,
  Select,
  createDeleteAction,
  createFormAction,
  getEditorWrapper,
} from "panther";
import { Show, createSignal } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";
import { PopulationImportForm } from "./_import_form";
import { PopulationGrid } from "./_population_grid";

type Props = {
  backToInstance: () => void;
};

export function PopulationManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const canConfigure = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

  const hasData = () => instanceState.populationRowCount > 0;
  const levelIsSet = () => instanceState.populationLevel !== undefined;
  // An import validates every area against admin_areas_hmis_<level>.
  const hasHmisStructure = () =>
    (instanceState.structure?.hmis.adminArea2s ?? 0) > 0;
  const levelLabel = () => {
    const level = instanceState.populationLevel;
    return level === undefined ? undefined : t3(getAdminAreaLabel(level));
  };

  async function openImport() {
    await openEditor({ element: PopulationImportForm, props: {} });
  }

  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Delete all population data, for every population type, year and area? The population level setting is kept.",
        fr: "Supprimer toutes les données de population, pour tous les types, années et unités ? Le réglage du niveau de population est conservé.",
        pt: "Eliminar todos os dados de população, para todos os tipos, anos e zonas? A definição do nível de população é mantida.",
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
            subheading={levelLabel()}
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
              <div class="ui-pad ui-spy flex h-full w-72 flex-col overflow-auto">
                <LevelSetting locked={hasData()} />
                <div class="border-t" />
                <Button
                  onClick={openImport}
                  iconName="upload"
                  disabled={!levelIsSet() || !hasHmisStructure()}
                  fullWidth
                >
                  {t3({
                    en: "Import population data",
                    fr: "Importer des données",
                    pt: "Importar dados de população",
                  })}
                </Button>
                <Show when={!hasHmisStructure()}>
                  <div class="text-base-content-muted text-xs">
                    {t3({
                      en: "Import the HMIS facilities first: every population row is checked against their admin areas.",
                      fr: "Importez d'abord les établissements SNIS : chaque ligne de population est vérifiée par rapport à leurs unités administratives.",
                      pt: "Importe primeiro os estabelecimentos SNIS: cada linha de população é verificada contra as suas zonas administrativas.",
                    })}
                  </div>
                </Show>
                <Show when={hasHmisStructure() && !levelIsSet()}>
                  <div class="text-base-content-muted text-xs">
                    {t3({
                      en: "Choose the population level above before importing.",
                      fr: "Choisissez le niveau de population ci-dessus avant d'importer.",
                      pt: "Escolha o nível de população acima antes de importar.",
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
                      fr: "Supprimer toutes les données",
                      pt: "Eliminar todos os dados",
                    })}
                  </Button>
                </Show>
              </div>
            </Show>
          }
        >
          <Show
            when={hasData()}
            fallback={
              <EmptyStore
                canConfigure={canConfigure()}
                levelIsSet={levelIsSet()}
              />
            }
          >
            <PopulationGrid canConfigure={canConfigure()} />
          </Show>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}

// The setting is a Select over AA2 to the HMIS adminDepth, disabled with the
// reason while any row exists.
function LevelSetting(p: { locked: boolean }) {
  const depth = () => instanceState.structureSchemaHmis?.adminDepth ?? 1;
  const options = () =>
    ALL_ADMIN_AREA_LEVELS
      .filter((level) => level <= depth())
      .map((level) => ({
        value: String(level),
        label: t3(getAdminAreaLabel(level)),
      }));
  const [pending, setPending] = createSignal<AdminAreaLevel | undefined>(
    undefined,
  );
  const save = createFormAction(async () => {
    const level = pending();
    if (level === undefined) return { success: true };
    const res = await serverActions.setPopulationLevel({ level });
    if (res.success) setPending(undefined);
    return res;
  });

  return (
    <div class="ui-spy-sm">
      <Select
        label={t3({
          en: "Population level",
          fr: "Niveau de population",
          pt: "Nível de população",
        })}
        options={options()}
        value={String(pending() ?? instanceState.populationLevel ?? "")}
        onChange={(v) => setPending(parseAdminAreaLevel(Number(v)))}
        placeholder={t3({
          en: "Not set",
          fr: "Non défini",
          pt: "Não definido",
        })}
        disabled={p.locked || depth() < 2}
        fullWidth
      />
      <Show when={pending() !== undefined && !p.locked}>
        <Button
          onClick={save.click}
          state={save.state()}
          intent="success"
          size="sm"
          fullWidth
        >
          {t3({
            en: "Set population level",
            fr: "Définir le niveau de population",
            pt: "Definir o nível de população",
          })}
        </Button>
      </Show>
      <div class="text-base-content-muted text-xs">
        {p.locked
          ? t3({
              en: "Locked while population data is stored. To change the level, delete all population data first, then import again at the new level.",
              fr: "Verrouillé tant que des données de population sont enregistrées. Pour changer le niveau, supprimez d'abord toutes les données de population, puis importez de nouveau au nouveau niveau.",
              pt: "Bloqueado enquanto houver dados de população guardados. Para alterar o nível, elimine primeiro todos os dados de população e depois importe de novo ao novo nível.",
            })
          : t3({
              en: "The admin area level of every population row, for every population type. While any indicator formula uses a population, all indicator values in a results package are computed at this level and none below it; if no formula uses a population, this setting has no effect on results. It must be set before the first import.",
              fr: "Le niveau administratif de chaque ligne de population, pour tous les types de population. Tant qu'une formule d'indicateur utilise une population, toutes les valeurs d'indicateurs d'un paquet de résultats sont calculées à ce niveau et à aucun niveau inférieur ; si aucune formule n'utilise de population, ce réglage n'a aucun effet sur les résultats. Il doit être défini avant le premier import.",
              pt: "O nível administrativo de cada linha de população, para todos os tipos de população. Enquanto alguma fórmula de indicador usar uma população, todos os valores de indicadores de um pacote de resultados são calculados a este nível e a nenhum nível abaixo; se nenhuma fórmula usar uma população, esta definição não tem efeito nos resultados. Tem de ser definido antes da primeira importação.",
            })}
      </div>
    </div>
  );
}

function EmptyStore(p: { canConfigure: boolean; levelIsSet: boolean }) {
  return (
    <div class="ui-pad ui-spy-sm">
      <div>
        {t3({
          en: "No population data imported",
          fr: "Aucune donnée de population importée",
          pt: "Nenhum dado de população importado",
        })}
      </div>
      <Show when={p.canConfigure}>
        <div class="text-base-content-muted text-sm">
          {p.levelIsSet
            ? t3({
                en: "Annual population counts per admin area, one CSV row per area, year and population type, at the population level chosen on the right.",
                fr: "Effectifs annuels de population par unité administrative, une ligne CSV par unité, année et type de population, au niveau de population choisi à droite.",
                pt: "Efetivos anuais de população por zona administrativa, uma linha CSV por zona, ano e tipo de população, ao nível de população escolhido à direita.",
              })
            : t3({
                en: "First choose the population level in the panel on the right: the admin area level at which every population type will be stored and, while any indicator formula uses a population, at which all indicator values are computed. Then import a CSV.",
                fr: "Choisissez d'abord le niveau de population dans le panneau de droite : le niveau administratif auquel chaque type de population sera enregistré et, tant qu'une formule d'indicateur utilise une population, auquel toutes les valeurs d'indicateurs sont calculées. Importez ensuite un CSV.",
                pt: "Escolha primeiro o nível de população no painel à direita: o nível administrativo ao qual todos os tipos de população serão guardados e, enquanto alguma fórmula de indicador usar uma população, ao qual todos os valores de indicadores são calculados. Depois importe um CSV.",
              })}
        </div>
      </Show>
    </div>
  );
}
