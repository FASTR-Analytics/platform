import { DisaggregationOption } from "lib";
import { StateHolderWrapper, createQuery } from "panther";
import { getPODetailFromCacheorFetch } from "~/state/project/t2_presentation_objects";
import { ReplicateByOptionsSelect } from "~/components/figure_editor/replicate_by_options";
import { requireProjectPackageScope } from "~/state/project/t1_store";

type Props = {
  projectId: string;
  presentationObjectId: string;
  replicateBy: DisaggregationOption;
  selectedValue: string;
  onChange: (value: string, allOptions?: string[]) => void;
};

export function InlineReplicantSelector(p: Props) {
  const poDetail = createQuery(async () => {
    return await getPODetailFromCacheorFetch(
      p.projectId,
      p.presentationObjectId,
    );
  }, "Loading...");

  return (
    <StateHolderWrapper state={poDetail.state()}>
      {(keyedPoDetail) => (
        <div class="">
          <div class="pb-1 text-sm">{"Replicant"}</div>
          <ReplicateByOptionsSelect
            scope={requireProjectPackageScope()}
            replicateBy={p.replicateBy}
            config={keyedPoDetail.config}
            metric={keyedPoDetail.resultsValue}
            selectedReplicantValue={p.selectedValue}
            setSelectedReplicant={p.onChange}
            fullWidth
          />
        </div>
      )}
    </StateHolderWrapper>
  );
}
