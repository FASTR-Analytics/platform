import {
  DisaggregationOption,
  getFetchConfigFromPresentationObjectConfig,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t3,
  TC,
  translateIndicatorId,
  throwIfErrWithData,
} from "lib";
import {
  Select,
  SelectList,
  StateHolderWrapper,
  timQuery,
  getSelectOptions,
} from "panther";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/replicant_options_cache";
import { createEffect, Match, Switch } from "solid-js";
import { trackDeep } from "@solid-primitives/deep";

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
// Pres obj
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type ReplicateByOptionsPresentationObjectProps = {
  replicateBy: DisaggregationOption;
  config: PresentationObjectConfig;
  poDetail: PresentationObjectDetail;
  selectedReplicantValue: string | undefined;
  setSelectedReplicant: (v: string, allOptions?: string[]) => void;
  fullWidth?: boolean;
};
export function ReplicateByOptionsPresentationObject(
  p: ReplicateByOptionsPresentationObjectProps,
) {
  const replicantOptions = timQuery(() => {
    const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
      p.poDetail.resultsValue,
      p.config,
      { excludeReplicantFilter: true },
    );
    throwIfErrWithData(resFetchConfig);
    return getReplicantOptionsFromCacheOrFetch(
      p.poDetail.projectId,
      p.poDetail.resultsValue.resultsObjectId,
      p.replicateBy,
      resFetchConfig.data,
    );
  }, t3(TC.loading));

  createEffect(() => {
    trackDeep(p.config.d.filterBy);
    replicantOptions.fetch();
  });

  return (
    <div class="ui-pad h-full max-w-[40rem] flex-none overflow-auto border-r">
      <StateHolderWrapper state={replicantOptions.state()} noPad>
        {(keyedReplicantOptions) => {
          return (
            <Switch>
              <Match when={keyedReplicantOptions.status === "too_many_values"}>
                <div class="text-sm w-36">
                  {t3({ en: "Too many replicant values (over 500). Use filter options to narrow down.", fr: "Trop de valeurs de réplicant (plus de 500). Utilisez les options de filtre pour affiner." })}
                </div>
              </Match>
              <Match when={keyedReplicantOptions.status === "no_values_available"}>
                <div class="text-sm w-36">
                  {t3({ en: "No data available with current filter selection.", fr: "Aucune donnée disponible avec la sélection de filtre actuelle." })}
                </div>
              </Match>
              <Match when={keyedReplicantOptions.status === "ok"}>
                {(() => {
                  const options = getSelectOptions(
                    (keyedReplicantOptions as Extract<typeof keyedReplicantOptions, { status: "ok" }>).possibleValues
                  ).map((opt) => ({
                    ...opt,
                    label:
                      p.replicateBy === "indicator_common_id"
                        ? translateIndicatorId(opt.value).toUpperCase()
                        : opt.label,
                  }));

                  return (
                    <SelectList
                      options={options}
                      value={p.selectedReplicantValue}
                      onChange={(v: string) => p.setSelectedReplicant(v)}
                      emptyMessage={t3({ en: "No replicant options", fr: "Aucune option de réplicant" })}
                    />
                  );
                })()}
              </Match>
            </Switch>
          );
        }}
      </StateHolderWrapper>
    </div>
  );
}

export function ReplicateByOptionsPresentationObjectSelect(
  p: ReplicateByOptionsPresentationObjectProps,
) {
  const replicantOptions = timQuery(() => {
    const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
      p.poDetail.resultsValue,
      p.config,
      { excludeReplicantFilter: true },
    );
    throwIfErrWithData(resFetchConfig);
    return getReplicantOptionsFromCacheOrFetch(
      p.poDetail.projectId,
      p.poDetail.resultsValue.resultsObjectId,
      p.replicateBy,
      resFetchConfig.data,
    );
  }, t3(TC.loading));

  createEffect(() => {
    trackDeep(p.config.d.filterBy);
    replicantOptions.fetch();
  });

  createEffect(() => {
    const state = replicantOptions.state();
    if (state.status === "ready" && state.data.status === "ok") {
      p.setSelectedReplicant(p.selectedReplicantValue || "", state.data.possibleValues);
    }
  });

  return (
    <StateHolderWrapper state={replicantOptions.state()}>
      {(keyedReplicantOptions) => {
        return (
          <Switch>
            <Match when={keyedReplicantOptions.status === "too_many_values"}>
              <div class="text-sm w-36">
                {t3({ en: "Too many replicant values (over 500). Use filter options to narrow down.", fr: "Trop de valeurs de réplicant (plus de 500). Utilisez les options de filtre pour affiner." })}
              </div>
            </Match>
            <Match when={keyedReplicantOptions.status === "no_values_available"}>
              <div class="text-sm w-36">
                {t3({ en: "No data available with current filter selection.", fr: "Aucune donnée disponible avec la sélection de filtre actuelle." })}
              </div>
            </Match>
            <Match when={keyedReplicantOptions.status === "ok"}>
              {(() => {
                const possibleValues = (keyedReplicantOptions as Extract<typeof keyedReplicantOptions, { status: "ok" }>).possibleValues;

                return (
                  <Select
                    options={possibleValues.map((pv: string) => {
                      return {
                        value: pv,
                        label:
                          p.replicateBy === "indicator_common_id"
                            ? translateIndicatorId(pv).toUpperCase()
                            : pv,
                      };
                    })}
                    value={p.selectedReplicantValue}
                    onChange={(v) => p.setSelectedReplicant(v, possibleValues)}
                    fullWidth={p.fullWidth}
                    placeholder={t3({ en: "Needs selection", fr: "Nécessite une sélection" })}
                  />
                );
              })()}
            </Match>
          </Switch>
        );
      }}
    </StateHolderWrapper>
  );
}
