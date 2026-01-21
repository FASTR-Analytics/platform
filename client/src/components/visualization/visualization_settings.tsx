import { APIResponseNoData, isFrench, t, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  timActionButton,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
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
      mutateFunc: (newLabel: string) => Promise<APIResponseNoData>;
      silentFetchPoDetail: () => Promise<void>;
    },
    "NEEDS_UPDATE"
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.existingLabel);

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t("You must enter a name") };
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
      header={t2("Visualization settings")}
      savingState={p.isDefault ? undefined : save.state()}
      saveFunc={p.isDefault ? undefined : save.click}
      cancelFunc={closeButton}
      cancelButtonText={t2(p.isDefault ? "Close" : "Cancel")}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Show when={!p.isDefault}>
          <Input
            label={t2(T.FRENCH_UI_STRINGS.visualization_name)}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            autoFocus
          />
        </Show>

        <div class="border-base-300 rounded border ui-pad ui-spy-sm">
          <div class="text-xs text-base-content/70">
            {t2("Clear cached data for this visualization. Use this if the visualization is showing stale data.")}
          </div>
          <div class="">

            <Button
              onClick={clearCache.click}
              state={clearCache.state()}
              iconName="trash"
              outline
              type="button"
            >
              {t2("Clear cache")}
            </Button>
          </div>
        </div>
      </div>
    </AlertFormHolder>
  );
}
