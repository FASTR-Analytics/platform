import { formatReplicantLabelForDisplay, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ProgressBar,
  RadioGroup,
  getProgress,
  createFormAction,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { resolveFigureAndGeoFromVisualization } from "~/generate_visualization/mod";
import { resolveMembersWithProgress } from "./resolve_members_with_progress";

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
  // Display-only cleaned form of the selected replicant value (e.g. Nigeria
  // admin-area names). The underlying value passed to the server stays raw.
  const selectedReplicantLabel = p.selectedReplicant
    ? formatReplicantLabelForDisplay(
        p.selectedReplicant,
        p.replicateBy,
        instanceState.countryIso3,
      )
    : undefined;
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

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      // Add all → ONE replicant group: resolve every member's figureBlock +
      // the shared geojson once, then persist atomically (addDashboardItemGroup).
      if (hasReplicants && creationMode() === "all" && p.replicateBy) {
        let resolved;
        try {
          resolved = await resolveMembersWithProgress(
            p.allReplicants,
            (value) =>
              resolveFigureAndGeoFromVisualization(p.projectId, {
                type: "from_visualization",
                visualizationId: p.visualizationId,
                replicant: value,
              }),
            (frac, msg) => progress.onProgress(frac, msg),
          );
        } catch (err) {
          return {
            success: false as const,
            err: err instanceof Error ? err.message : String(err),
          };
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
          geoData: resolved.sharedGeoData,
          members: resolved.members,
        });
        if (!res.success) return res;
        progress.onProgress(
          1,
          `Added group of ${resolved.members.length}`,
        );
        return {
          success: true as const,
          data: { addedCount: resolved.members.length },
        };
      }

      // Single mode
      const itemLabel = selectedReplicantLabel
        ? `${p.visualizationLabel} - ${selectedReplicantLabel}`
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
                label: selectedReplicantLabel
                  ? t3({
                      en: `Selected replicant only (${selectedReplicantLabel})`,
                      fr: `Seulement le réplicant sélectionné (${selectedReplicantLabel})`,
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
