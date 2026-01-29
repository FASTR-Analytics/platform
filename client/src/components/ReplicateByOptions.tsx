import {
  DisaggregationOption,
  getFetchConfigFromPresentationObjectConfig,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t2,
  T,
  throwIfErrWithData,
} from "lib";
import {
  Select,
  StateHolderWrapper,
  timQuery,
  getSelectOptions,
} from "panther";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/replicant_options_cache";
import { t } from "lib";
import { SelectList } from "panther";
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
  }, "Loading...");

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
                  {t("Too many replicant values (over 500). Use filter options to narrow down.")}
                </div>
              </Match>
              <Match when={keyedReplicantOptions.status === "no_values_available"}>
                <div class="text-sm w-36">
                  {t("No data available with current filter selection.")}
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
                        ? t(opt.value).toUpperCase()
                        : opt.label,
                  }));

                  return (
                    <SelectList
                      options={options}
                      value={p.selectedReplicantValue}
                      onChange={(v: string) => p.setSelectedReplicant(v)}
                      emptyMessage={t("No replicant options")}
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
  }, t2(T.FRENCH_UI_STRINGS.loading_1));

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
                {t("Too many replicant values (over 500). Use filter options to narrow down.")}
              </div>
            </Match>
            <Match when={keyedReplicantOptions.status === "no_values_available"}>
              <div class="text-sm w-36">
                {t("No data available with current filter selection.")}
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
                            ? t(pv).toUpperCase()
                            : pv,
                      };
                    })}
                    value={p.selectedReplicantValue}
                    onChange={(v) => p.setSelectedReplicant(v, possibleValues)}
                    fullWidth={p.fullWidth}
                    invalidMsg={
                      !p.selectedReplicantValue ? t2(T.FRENCH_UI_STRINGS.needs_selection) : undefined
                    }
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
