import {
  DisaggregationOption,
  formatReplicantLabelForDisplay,
  getFetchConfigFromPresentationObjectConfig,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t3,
  TC,
  throwIfErrWithData,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";
import {
  Select,
  SelectList,
  StateHolderWrapper,
  createQuery,
  getSelectOptionsFromIdLabel,
  selectOptionToListItem,
} from "panther";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
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

// Replicant picker options with Nigeria admin-area labels cleaned for display
// (raw id/value untouched). Re-sorts by cleaned label only when cleaning
// changed something, so the server's ORDER BY ordering is preserved otherwise.
function cleanedReplicantSelectOptions(
  possibleValues: { id: string; label: string }[],
  replicateBy: DisaggregationOption,
) {
  const cleaned = possibleValues.map((pv) => ({
    id: pv.id,
    label: formatReplicantLabelForDisplay(
      pv.label,
      replicateBy,
      instanceState.countryIso3,
    ),
  }));
  if (cleaned.some((c, i) => c.label !== possibleValues[i].label)) {
    cleaned.sort((a, b) => a.label.localeCompare(b.label));
  }
  return getSelectOptionsFromIdLabel(cleaned);
}

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
  const replicantOptions = createQuery(() => {
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
                <div class="w-36 text-sm">
                  {t3({
                    en: "Too many replicant values (over 500). Use filter options to narrow down.",
                    fr: "Trop de valeurs de réplicant (plus de 500). Utilisez les options de filtre pour affiner.",
                  })}
                </div>
              </Match>
              <Match
                when={keyedReplicantOptions.status === "no_values_available"}
              >
                <div class="w-36 text-sm">
                  {t3({
                    en: "No data available with current filter selection.",
                    fr: "Aucune donnée disponible avec la sélection de filtre actuelle.",
                  })}
                </div>
              </Match>
              <Match when={keyedReplicantOptions.status === "ok"}>
                {(() => {
                  const options = cleanedReplicantSelectOptions(
                    (
                      keyedReplicantOptions as Extract<
                        typeof keyedReplicantOptions,
                        { status: "ok" }
                      >
                    ).possibleValues,
                    p.replicateBy,
                  );

                  return (
                    <SelectList
                      items={options.map(selectOptionToListItem)}
                      value={p.selectedReplicantValue}
                      onChange={(v: string) => p.setSelectedReplicant(v)}
                      emptyMessage={t3({
                        en: "No replicant options",
                        fr: "Aucune option de réplicant",
                      })}
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
  const replicantOptions = createQuery(() => {
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
      p.setSelectedReplicant(
        p.selectedReplicantValue || "",
        state.data.possibleValues.map(pv => pv.id),
      );
    }
  });

  return (
    <StateHolderWrapper state={replicantOptions.state()}>
      {(keyedReplicantOptions) => {
        return (
          <Switch>
            <Match when={keyedReplicantOptions.status === "too_many_values"}>
              <div class="w-36 text-sm">
                {t3({
                  en: "Too many replicant values (over 500). Use filter options to narrow down.",
                  fr: "Trop de valeurs de réplicant (plus de 500). Utilisez les options de filtre pour affiner.",
                })}
              </div>
            </Match>
            <Match
              when={keyedReplicantOptions.status === "no_values_available"}
            >
              <div class="w-36 text-sm">
                {t3({
                  en: "No data available with current filter selection.",
                  fr: "Aucune donnée disponible avec la sélection de filtre actuelle.",
                })}
              </div>
            </Match>
            <Match when={keyedReplicantOptions.status === "ok"}>
              {(() => {
                const possibleValues = (
                  keyedReplicantOptions as Extract<
                    typeof keyedReplicantOptions,
                    { status: "ok" }
                  >
                ).possibleValues;

                return (
                  <Select
                    options={cleanedReplicantSelectOptions(
                      possibleValues,
                      p.replicateBy,
                    )}
                    value={p.selectedReplicantValue}
                    onChange={(v) => p.setSelectedReplicant(v, possibleValues.map(pv => pv.id))}
                    fullWidth={p.fullWidth}
                    placeholder={t3({
                      en: "Needs selection",
                      fr: "Nécessite une sélection",
                    })}
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
