import { FigureBlock, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ProgressBar,
  RadioGroup,
  getProgress,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { resolveFigureAndGeoFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";

type Props = {
  projectId: string;
  dashboardId: string;
  visualizationId: string;
  visualizationLabel: string;
  selectedReplicant: string | undefined;
  replicateBy: string | undefined;
  allReplicants: { value: string; label: string }[];
};

type ReturnType = { addedCount: number };

export function AddDashboardItemConfirmModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const hasReplicants = p.allReplicants.length > 0;
  const [creationMode, setCreationMode] = createSignal<"single" | "all">(
    "single",
  );
  const progress = getProgress();

  // Single add → one standalone item (unchanged behaviour).
  async function addSingle(replicant: string | undefined, itemLabel: string) {
    const { figureBlock, geoData } = await resolveFigureAndGeoFromVisualization(
      p.projectId,
      {
        type: "from_visualization",
        visualizationId: p.visualizationId,
        replicant,
      },
    );
    return await serverActions.addDashboardItem({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      label: itemLabel,
      figureBlock,
      geoData,
    });
  }

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      // Add all → ONE replicant group: resolve every member's figureBlock +
      // the shared geojson once, then persist atomically (addDashboardItemGroup).
      if (hasReplicants && creationMode() === "all" && p.replicateBy) {
        const members: {
          replicantValue: string;
          label: string;
          figureBlock: FigureBlock;
        }[] = [];
        let sharedGeoData: unknown = undefined;
        for (let i = 0; i < p.allReplicants.length; i++) {
          const { value, label } = p.allReplicants[i];
          progress.onProgress(
            (i / p.allReplicants.length) * 0.9,
            `Resolving ${i + 1} of ${p.allReplicants.length}...`,
          );
          try {
            const { figureBlock, geoData } =
              await resolveFigureAndGeoFromVisualization(p.projectId, {
                type: "from_visualization",
                visualizationId: p.visualizationId,
                replicant: value,
              });
            members.push({ replicantValue: value, label, figureBlock });
            if (sharedGeoData === undefined && geoData !== undefined) {
              sharedGeoData = geoData;
            }
          } catch (err) {
            return {
              success: false as const,
              err: `Failed resolving replicant ${i + 1} (${label}): ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }
        progress.onProgress(0.95, "Saving group...");
        const res = await serverActions.addDashboardItemGroup({
          projectId: p.projectId,
          dashboard_id: p.dashboardId,
          label: p.visualizationLabel,
          replicateBy: p.replicateBy,
          defaultReplicantValue:
            p.selectedReplicant ?? p.allReplicants[0]?.value,
          replicants: p.allReplicants,
          geoData: sharedGeoData,
          members,
        });
        if (!res.success) return res;
        progress.onProgress(1, `Added group of ${members.length}`);
        return { success: true as const, data: { addedCount: members.length } };
      }

      // Single mode
      const itemLabel = p.selectedReplicant
        ? `${p.visualizationLabel} - ${p.selectedReplicant}`
        : p.visualizationLabel;
      try {
        const res = await addSingle(p.selectedReplicant, itemLabel);
        if (!res.success) return res;
        return { success: true as const, data: { addedCount: 1 } };
      } catch (err) {
        return {
          success: false as const,
          err: err instanceof Error ? err.message : String(err),
        };
      }
    },
    (data) => p.close({ addedCount: data.addedCount }),
  );

  return (
    <AlertFormHolder
      formId="confirm-add-dashboard-item"
      header={t3({ en: "Add to dashboard", fr: "Ajouter au tableau de bord" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="text-sm">
          <span class="font-700">{p.visualizationLabel}</span>
        </div>
        <Show when={hasReplicants}>
          <RadioGroup
            label={t3({ en: "Add", fr: "Ajouter" })}
            value={creationMode()}
            options={[
              {
                value: "single",
                label: p.selectedReplicant
                  ? t3({
                      en: `Selected replicant only (${p.selectedReplicant})`,
                      fr: `Seulement le réplicant sélectionné (${p.selectedReplicant})`,
                    })
                  : t3({
                      en: "Selected replicant only",
                      fr: "Seulement le réplicant sélectionné",
                    }),
              },
              {
                value: "all",
                label: t3({
                  en: `All replicants as a group (${p.allReplicants.length})`,
                  fr: `Tous les réplicants en groupe (${p.allReplicants.length})`,
                }),
              },
            ]}
            onChange={(v) => setCreationMode(v as "single" | "all")}
          />
        </Show>
        <Show when={save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>
      </div>
    </AlertFormHolder>
  );
}
