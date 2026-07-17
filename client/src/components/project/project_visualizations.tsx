import { PresentationObjectSummary, t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openAlert,
  openComponent,
} from "panther";
import { Show, createSignal } from "solid-js";
import { PresentationObjectPanelDisplay } from "~/components/PresentationObjectPanelDisplay";
import { VisualizationEditor } from "../visualization";
import { AddVisualization } from "./add_visualization";
import { getPODetailFromCacheorFetch } from "~/state/project/t2_presentation_objects";
import { updateProjectView, vizSortMode, setVizSortMode } from "~/state/t4_ui";
import { SortControl } from "~/components/_shared/sort_control";
import { projectState } from "~/state/project/t1_store";
import { useAIProjectContext } from "~/components/project_ai/context";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";

type Props = {
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectVisualizations(p: Props) {
  const [searchText, setSearchText] = createSignal<string>("");
  const { aiContext } = useAIProjectContext();

  async function openVisualizationEditor(po: PresentationObjectSummary) {
    if (po.isDefault) {
      const poDetailRes = await getPODetailFromCacheorFetch(
        projectState.id,
        po.id,
      );
      if (poDetailRes.success === false) {
        await openAlert({
          text: t3({
            en: "Failed to load visualization",
            fr: "Échec du chargement de la visualisation",
            pt: "Falha ao carregar a visualização",
          }),
          intent: "danger",
        });
        return;
      }

      const result = await p.openProjectEditor({
        element: VisualizationEditor,
        props: {
          mode: "create" as const,
          projectId: projectState.id,
          label: `${t3({ en: "Copy of", fr: "Copie de", pt: "Cópia de" })} ${poDetailRes.data.label}`,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectState,

            resultsValue: poDetailRes.data.resultsValue,
            config: poDetailRes.data.config,
          }),
        },
      });

      if (result?.created) {
        // SSE will update projectState automatically
        updateProjectView({
          vizGroupingMode: "folders",
          vizSelectedGroup:
            result.created.folderId === null
              ? "_unfiled"
              : result.created.folderId,
        });
      }
      return;
    }

    await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "edit" as const,
        projectId: projectState.id,
        presentationObjectId: po.id,
        returnToContext: aiContext(),
        ...snapshotForVizEditor({
          projectState,
        }),
      },
    });
    // SSE will update projectState automatically
  }

  async function attempAddPresentationObject() {
    const res = await openComponent({
      element: AddVisualization,
      props: {
        projectId: projectState.id,
        metrics: projectState.metrics,
        modules: projectState.projectModules,
      },
    });
    if (res === undefined) {
      return;
    }

    await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "create" as const,
        projectId: projectState.id,
        label: res.label,
        returnToContext: aiContext(),
        ...snapshotForVizEditor({
          projectState,

          resultsValue: res.resultsValue,
          config: res.config,
        }),
      },
    });
  }

  // async function attemptAICreatePresentationObject() {
  //   const res = await openComponent({
  //     element: CreateVisualizationFromPromptModal,
  //     props: {
  //       projectId: projectState.id,
  //       instanceDetail: p.instanceDetail,
  //       projectState: projectState,
  //     },
  //   });
  //   if (res === undefined) {
  //     return;
  //   }

  //   await p.openProjectEditor({
  //     element: VisualizationEditor,
  //     props: {
  //       mode: "create" as const,
  //       projectId: projectState.id,
  //       label: res.label,
  //       resultsValue: res.resultsValue,
  //       config: res.config,
  //       instanceDetail: p.instanceDetail,
  //       projectState: projectState,
  //       isGlobalAdmin: p.isGlobalAdmin,
  //     },
  //   });
  // }

  // async function attemptBackupPresentationObjects() {
  //   const res = await serverActions.backupPresentationObjects({
  //     projectId: p.projectState.id,
  //   });
  //   if (res.success === false) {
  //     await openAlert({ text: t("Backup failed"), intent: "danger" });
  //     return;
  //   }
  //   downloadJson(
  //     res.data,
  //     `visualizations_${new Date().toDateString().replaceAll(" ", "_")}.json`,
  //     "keep-undefined",
  //   );
  // }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Visualizations", fr: "Visualisations", pt: "Visualizações" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          centerChildren={
            <SortControl value={vizSortMode()} onChange={setVizSortMode} />
          }
        >
          <Show
            when={
              !projectState.isLocked && projectState.projectModules.length > 0
            }
          >
            <div class="ui-gap-sm flex items-center">
              {/* <Button onClick={attemptAICreatePresentationObject} iconName="sparkles" outline>
                {t("Create with AI")}
              </Button> */}
              <Button onClick={attempAddPresentationObject} iconName="plus">
                {t3({
                  en: "Create visualization",
                  fr: "Créer une visualisation",
                  pt: "Criar visualização",
                })}
              </Button>
            </div>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectState.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-base-content-muted text-sm">
            {t3({
              en: "You need to enable at least one module to create visualizations",
              fr: "Vous devez activer au moins un module pour créer des visualisations",
              pt: "Tem de ativar pelo menos um módulo para criar visualizações",
            })}
          </div>
        }
      >
        <PresentationObjectPanelDisplay
          projectState={projectState}
          searchText={searchText().trim()}
          onClick={openVisualizationEditor}
        />
      </Show>
    </FrameTop>
  );
}
