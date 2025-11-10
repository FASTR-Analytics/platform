import {
  PresentationObjectDetail,
  get_PRESENTATION_OPTIONS_MAP,
  t,
  t2,
  T,
} from "lib";
import { For } from "solid-js";

type DataValuesSummaryProps = {
  poDetail: PresentationObjectDetail;
};

export function DataValuesSummary(p: DataValuesSummaryProps) {
  return (
    <div class="">
      <div class="text-md font-700 pb-1">
        {t2(T.FRENCH_UI_STRINGS.data_values)}
      </div>
      <div class="pb-0.5 text-sm">{t2(p.poDetail.resultsValue.label)}</div>
      <For each={p.poDetail.resultsValue.valueProps}>
        {(vp) => {
          return (
            <div class="text-sm">
              &rarr;{" "}
              {p.poDetail.resultsValue.valueLabelReplacements?.[vp] ?? vp}
            </div>
          );
        }}
      </For>
    </div>
  );
}

type PresentationTypeSummaryProps = {
  poDetail: PresentationObjectDetail;
};

export function PresentationTypeSummary(p: PresentationTypeSummaryProps) {
  return (
    <div class="">
      <div class="text-md font-700 pb-1">
        {t2(T.Visualizations.presentation_types)}
      </div>
      <div class="text-sm">
        &rarr; {get_PRESENTATION_OPTIONS_MAP()[p.poDetail.config.d.type]}
      </div>
    </div>
  );
}
