import { DisaggregationOption, PackageScope, PresentationObjectConfig, ResultsValue } from "lib";
import { ReplicateByOptionsSelect } from "./replicate_by_options";

type Props = {
  scope: PackageScope;
  metric: ResultsValue;
  config: PresentationObjectConfig;
  replicateBy: DisaggregationOption;
  selectedValue: string;
  onChange: (value: string, allOptions?: string[]) => void;
};

// A labelled replicant Select for hosts that already hold the figure's metric
// and config — no detail fetch, because there is no row to fetch (D3).
export function InlineReplicantSelector(p: Props) {
  return (
    <div class="">
      <div class="pb-1 text-sm">{"Replicant"}</div>
      <ReplicateByOptionsSelect
        scope={p.scope}
        metric={p.metric}
        config={p.config}
        replicateBy={p.replicateBy}
        selectedReplicantValue={p.selectedValue}
        setSelectedReplicant={p.onChange}
        fullWidth
      />
    </div>
  );
}
