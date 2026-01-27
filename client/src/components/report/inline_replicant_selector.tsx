import { DisaggregationOption, t2, T } from "lib";
import { StateHolderWrapper, timQuery } from "panther";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { ReplicateByOptionsPresentationObjectSelect } from "~/components/ReplicateByOptions";

type Props = {
  projectId: string;
  presentationObjectId: string;
  replicateBy: DisaggregationOption;
  selectedValue: string;
  onChange: (value: string) => void;
};

export function InlineReplicantSelector(p: Props) {
  const poDetail = timQuery(async () => {
    return await getPODetailFromCacheorFetch(
      p.projectId,
      p.presentationObjectId,
    );
  }, t2(T.FRENCH_UI_STRINGS.loading_1));

  return (
    <StateHolderWrapper state={poDetail.state()}>
      {(keyedPoDetail) => (
        <div class="">
          <div class="pb-1 text-sm">{t2(T.FRENCH_UI_STRINGS.replicant)}</div>
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
