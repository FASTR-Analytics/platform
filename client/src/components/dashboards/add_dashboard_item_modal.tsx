import { t3 } from "lib";
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
  allReplicants: string[];
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

  async function addOne(replicant: string | undefined, itemLabel: string) {
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

      if (hasReplicants && creationMode() === "all") {
        let added = 0;
        for (let i = 0; i < p.allReplicants.length; i++) {
          const replicantValue = p.allReplicants[i];
          progress.onProgress(
            i / p.allReplicants.length,
            `Adding item ${i + 1} of ${p.allReplicants.length}...`,
          );
          try {
            const itemLabel = `${p.visualizationLabel} - ${replicantValue}`;
            const res = await addOne(replicantValue, itemLabel);
            if (!res.success) {
              return {
                success: false as const,
                err: `Failed on item ${i + 1} (${replicantValue}): ${res.err}. Added ${added}.`,
              };
            }
            added++;
          } catch (err) {
            return {
              success: false as const,
              err: `Failed on item ${i + 1}: ${err instanceof Error ? err.message : String(err)}. Added ${added}.`,
            };
          }
        }
        progress.onProgress(1, `Added ${added} items`);
        return { success: true as const, data: { addedCount: added } };
      }

      // Single mode
      const itemLabel = p.selectedReplicant
        ? `${p.visualizationLabel} - ${p.selectedReplicant}`
        : p.visualizationLabel;
      try {
        const res = await addOne(p.selectedReplicant, itemLabel);
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
                  en: `All replicants (${p.allReplicants.length})`,
                  fr: `Tous les réplicants (${p.allReplicants.length})`,
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
