import { ProjectState, t3, TC, type DatasetHfaInfoInProject } from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  MultiSelect,
  ProgressBar,
  StateHolderWrapper,
  getProgress,
  createButtonAction,
  createQuery,
} from "panther";
import { createSignal, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

export function SettingsForProjectDatasetHfa(
  p: EditorComponentProps<
    {
      projectState: ProjectState;
      hfaInfo: DatasetHfaInfoInProject | undefined;
      skipModuleRerun?: boolean;
    },
    undefined
  >,
) {
  const serviceCategoriesQuery = createQuery(
    () => serverActions.getHfaIndicatorServiceCategories({}),
    t3({
      en: "Loading service categories...",
      fr: "Chargement des catégories de service...",
      pt: "A carregar categorias de serviço...",
    }),
  );

  const existingScope = p.hfaInfo?.serviceCategoryScope ?? [];
  const [includeAll, setIncludeAll] = createSignal(existingScope.length === 0);
  const [selected, setSelected] = createSignal<string[]>(existingScope);

  const { progressFrom0To100, progressMsg, onProgress } = getProgress();

  const save = createButtonAction(
    async () => {
      const scope = includeAll() ? [] : selected();
      if (!includeAll() && scope.length === 0) {
        return {
          success: false,
          err: t3({
            en: "Select at least one service category, or choose Include all.",
            fr: "Sélectionnez au moins une catégorie de service, ou choisissez Tout inclure.",
            pt: "Selecione pelo menos uma categoria de serviço, ou escolha Incluir tudo.",
          }),
        };
      }
      return await serverActions.addDatasetToProject(
        {
          projectId: p.projectState.id,
          datasetType: "hfa",
          windowing: undefined,
          serviceCategoryScope: scope,
          skipModuleRerun: p.skipModuleRerun,
        },
        onProgress,
      );
    },
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "HFA data settings", fr: "Paramètres des données FOSA", pt: "Definições de dados HFA" })}
        >
          <div class="ui-gap-sm flex">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              disabled={save.state().status === "loading"}
              iconName="save"
            >
              {t3(TC.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t3(TC.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <Switch>
          <Match when={save.state().status === "loading"}>
            <ProgressBar
              progressFrom0To100={progressFrom0To100()}
              progressMsg={progressMsg()}
            />
          </Match>
          <Match when={true}>
            <StateHolderWrapper state={serviceCategoriesQuery.state()}>
              {(serviceCategories) => (
                <div class="ui-spy max-w-lg">
                  <div class="text-neutral text-sm">
                    {t3({
                      en: "Choose which service categories to include in this project. Only indicators tagged with a selected category are imported. Changes take effect when the data is (re)added.",
                      fr: "Choisissez les catégories de service à inclure dans ce projet. Seuls les indicateurs associés à une catégorie sélectionnée sont importés. Les modifications prennent effet lors du (ré)ajout des données.",
                      pt: "Escolha as categorias de serviço a incluir neste projeto. Apenas os indicadores associados a uma categoria selecionada são importados. As alterações entram em vigor quando os dados são (re)adicionados.",
                    })}
                  </div>
                  <Checkbox
                    label={t3({
                      en: "Include all service categories",
                      fr: "Inclure toutes les catégories de service",
                      pt: "Incluir todas as categorias de serviço",
                    })}
                    checked={includeAll()}
                    onChange={setIncludeAll}
                  />
                  <Show when={!includeAll()}>
                    <MultiSelect
                      values={selected()}
                      onChange={setSelected}
                      options={serviceCategories.map((sc) => ({
                        value: sc.id,
                        label: sc.label,
                      }))}
                    />
                  </Show>
                </div>
              )}
            </StateHolderWrapper>
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}
