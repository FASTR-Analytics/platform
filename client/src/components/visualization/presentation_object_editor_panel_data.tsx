import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectDetail,
  hasOnlyOneFilteredValue,
} from "lib";
import { timQuery } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/po_cache";
import {
  DataValuesSummary,
  PresentationTypeSummary,
} from "./presentation_object_editor_panel_data/_1_summary";
import { Filters } from "./presentation_object_editor_panel_data/_2_filters";
import { DisaggregationSection } from "./presentation_object_editor_panel_data/_3_disaggregation";

type Props = {
  projectDetail: ProjectDetail;
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  viewResultsObject: (resultsObjectId: string) => Promise<void>;
};

export function PresentationObjectEditorPanelData(p: Props) {
  const pds = useProjectDirtyStates();

  const resultsValueInfo = timQuery(() => {
    return getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      p.poDetail.projectId,
      p.poDetail.resultsValue.moduleId,
      p.poDetail.resultsValue.id,
    );
  }, "Loading...");

  const allowedFilterOptions = () => {
    return p.poDetail.resultsValue.disaggregationOptions.filter((disOpt) => {
      return (
        !disOpt.allowedPresentationOptions ||
        disOpt.allowedPresentationOptions.includes(p.tempConfig.d.type)
      );
    });
  };

  const allowedDisaggregationOptions = () =>
    allowedFilterOptions().filter((disOpt) => {
      return !hasOnlyOneFilteredValue(p.tempConfig, disOpt.value);
    });

  return (
    <div class="ui-pad ui-spy h-full w-full overflow-auto">
      <DataValuesSummary poDetail={p.poDetail} />
      <PresentationTypeSummary poDetail={p.poDetail} />

      <Filters
        poDetail={p.poDetail}
        tempConfig={p.tempConfig}
        setTempConfig={p.setTempConfig}
        resultsValueInfo={resultsValueInfo}
        allowedFilterOptions={allowedFilterOptions()}
      />

      <DisaggregationSection
        poDetail={p.poDetail}
        tempConfig={p.tempConfig}
        setTempConfig={p.setTempConfig}
        allowedDisaggregationOptions={allowedDisaggregationOptions()}
      />
    </div>
  );
}
