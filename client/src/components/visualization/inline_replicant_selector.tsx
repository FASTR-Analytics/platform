import { DisaggregationOption } from "lib";
import { StateHolderWrapper, timQuery } from "panther";
import { getPODetailFromCacheorFetch } from "~/state/project/t2_presentation_objects";
import { ReplicateByOptionsPresentationObjectSelect } from "~/components/ReplicateByOptions";

type Props = {
  projectId: string;
  presentationObjectId: string;
  replicateBy: DisaggregationOption;
  selectedValue: string;
  onChange: (value: string, allOptions?: string[]) => void;
};

export function InlineReplicantSelector(p: Props) {
  const poDetail = timQuery(async () => {
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
          <ReplicateByOptionsPresentationObjectSelect
            replicateBy={p.replicateBy}
            config={keyedPoDetail.config}
            poDetail={keyedPoDetail}
            selectedReplicantValue={p.selectedValue}
            setSelectedReplicant={p.onChange}
            fullWidth
          />
        </div>
      )}
    </StateHolderWrapper>
  );
}
