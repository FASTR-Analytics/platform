import { APIResponseNoData, isFrench, t3, TC, VisualizationFolder } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Select,
  timActionButton,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { _PO_DETAIL_CACHE, _PO_ITEMS_CACHE, _REPLICANT_OPTIONS_CACHE, _METRIC_INFO_CACHE } from "~/state/caches/visualizations";

export function VisualizationSettings(
  p: AlertComponentProps<
    {
      projectId: string;
      presentationObjectId: string;
      resultsObjectId: string;
      moduleId: string;
      isDefault: boolean;
      existingLabel: string;
      currentFolderId: string | null;
      folders: VisualizationFolder[];
      mutateFunc: (newLabel: string) => Promise<APIResponseNoData>;
      silentFetchPoDetail: () => Promise<void>;
    },
    "NEEDS_UPDATE"
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.existingLabel);
  const [tempFolderId, setTempFolderId] = createSignal<string>(p.currentFolderId ?? "_none");

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t3(TC.mustEnterName) };
      }
      const newFolderId = tempFolderId() === "_none" ? null : tempFolderId();
      const folderChanged = newFolderId !== p.currentFolderId;
      if (folderChanged) {
        const folderRes = await serverActions.updatePresentationObjectFolder({
          projectId: p.projectId,
          po_id: p.presentationObjectId,
          folderId: newFolderId,
        });
        if (!folderRes.success) {
          return folderRes;
        }
      }
      return p.mutateFunc(goodLabel);
    },
    () => p.close("NEEDS_UPDATE"),
  );

  const clearCache = timActionButton(
    async () => {
      await _PO_DETAIL_CACHE.clearEntry({
        projectId: p.projectId,
        presentationObjectId: p.presentationObjectId,
      });

      await _METRIC_INFO_CACHE.clearEntry({
        projectId: p.projectId,
        metricId: p.resultsObjectId,
      });

      // Clear all items for this results object (all fetchConfig variations)
      await _PO_ITEMS_CACHE.clearEntriesWithPrefix([
        p.projectId,
        p.resultsObjectId,
      ]);

      // Clear all replicant options for this results object (all replicateBy and fetchConfig variations)
      await _REPLICANT_OPTIONS_CACHE.clearEntriesWithPrefix([
        p.projectId,
        p.resultsObjectId,
      ]);

      return { success: true };
    },
    // p.silentFetchPoDetail,
    () => p.close("NEEDS_UPDATE"),
  );

  const closeButton = async () => p.close(undefined);

  return (
    <AlertFormHolder
      formId="visualization-settings"
      header={t3({ en: "Visualization settings", fr: "Paramètres de la visualisation" })}
      savingState={p.isDefault ? undefined : save.state()}
      saveFunc={p.isDefault ? undefined : save.click}
      cancelFunc={closeButton}
      cancelButtonText={p.isDefault ? t3({ en: "Close", fr: "Fermer" }) : t3(TC.cancel)}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Show when={!p.isDefault}>
          <Input
            label={t3({ en: "Visualization name", fr: "Nom de la visualisation" })}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            autoFocus
          />
          <Select
            label={t3(TC.folder)}
            options={folderOptions()}
            value={tempFolderId()}
            onChange={setTempFolderId}
            fullWidth
          />
        </Show>

        <div class="border-base-300 rounded border ui-pad ui-spy-sm">
          <div class="text-xs text-base-content/70">
            {t3({ en: "Clear cached data for this visualization. Use this if the visualization is showing stale data.", fr: "Effacer les données mises en cache pour cette visualisation. Utilisez cette option si la visualisation affiche des données obsolètes." })}
          </div>
          <div class="">

            <Button
              onClick={clearCache.click}
              state={clearCache.state()}
              iconName="trash"
              outline
              type="button"
            >
              {t3({ en: "Clear cache", fr: "Vider le cache" })}
            </Button>
          </div>
        </div>
      </div>
    </AlertFormHolder>
  );
}
