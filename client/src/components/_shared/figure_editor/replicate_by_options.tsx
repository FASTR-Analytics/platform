import {
  dimensionValueSelectLabel,
  DisaggregationOption,
  formatReplicantLabelForDisplay,
  getFetchConfigFromPresentationObjectConfig,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
  RunReplicantOptions,
  t3,
  TC,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";
import { Button, SelectSearch, StateHolder, StateHolderWrapper } from "panther";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/products/t2_replicant_options";
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Switch,
} from "solid-js";
import { trackDeep } from "@solid-primitives/deep";

// The replicant strip above the editor preview: which value of the replicated
// dimension the figure shows, under one PackageScope.

// Replicant picker options with Nigeria admin-area labels cleaned for display
// (raw id/value untouched). Re-sorts by cleaned label only when cleaning
// changed something, so the server's order is kept otherwise.
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
  return cleaned.map((c) => ({
    value: c.id,
    label: dimensionValueSelectLabel(replicateBy, c.id, c.label),
  }));
}

type ReplicateByOptionsProps = {
  scope: PackageScope;
  replicateBy: DisaggregationOption;
  config: PresentationObjectConfig;
  metric: ResultsValue;
  selectedReplicantValue: string | undefined;
  setSelectedReplicant: (v: string) => void;
};

// Aborts a superseded in-flight load so an older filter's option list can
// never land after a newer one.
function createReplicantOptions(p: ReplicateByOptionsProps) {
  const [replicantOptions, setReplicantOptions] = createSignal<
    StateHolder<RunReplicantOptions>
  >({
    status: "loading",
    msg: t3(TC.loading),
  });

  createEffect(() => {
    trackDeep(p.config.d.filterBy);
    // periodFilter also narrows the server's option list (its bounds become
    // periodFilterExactBounds), and trackDeep(filterBy) doesn't subscribe to
    // it: without this read a bounds edit left a stale picker list. Reading
    // the property itself also covers wholesale replacement.
    if (p.config.d.periodFilter) {
      trackDeep(p.config.d.periodFilter);
    }
    const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
      p.metric,
      p.config,
      { excludeReplicantFilter: true },
    );
    if (!resFetchConfig.success) {
      setReplicantOptions({ status: "error", err: resFetchConfig.err });
      return;
    }
    // Tracked reads, all before the first await: a product reattached mid-edit
    // moves the scope, which must re-query.
    const scope = { runId: p.scope.runId, scopeId: p.scope.scopeId };
    const metricId = p.metric.id;
    const replicateBy = p.replicateBy;
    const fetchConfig = resFetchConfig.data;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    setReplicantOptions({ status: "loading", msg: t3(TC.loading) });
    async function load() {
      try {
        const res = await getReplicantOptionsFromCacheOrFetch(
          scope,
          metricId,
          replicateBy,
          fetchConfig,
        );
        if (controller.signal.aborted) return;
        if (res.success) {
          setReplicantOptions({ status: "ready", data: res.data });
        } else {
          setReplicantOptions({ status: "error", err: res.err });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setReplicantOptions({
          status: "error",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    load();
  });

  return replicantOptions;
}

function ReplicantOptionsMessage(mp: {
  status: RunReplicantOptions["status"];
}) {
  return (
    <Switch>
      <Match when={mp.status === "no_values_available"}>
        <div>
          {t3({
            en: "No data available with current filter selection.",
            fr:
              "Aucune donnée disponible avec la sélection de filtre actuelle.",
            pt: "Não há dados disponíveis com a seleção de filtros atual.",
          })}
        </div>
      </Match>
      <Match when={mp.status === "error"}>
        <div class="text-danger">
          {t3({
            en: "Could not load values.",
            fr: "Impossible de charger les valeurs.",
            pt: "Não foi possível carregar os valores.",
          })}
        </div>
      </Match>
    </Switch>
  );
}

export function ReplicateByOptionsSelect(p: ReplicateByOptionsProps) {
  const replicantOptions = createReplicantOptions(p);
  const dimensionLabel = () =>
    t3(getDisplayDisaggregationLabel(p.replicateBy, p.metric.datasetFamily));

  return (
    <div class="ui-pad ui-gap flex flex-wrap items-end border-b">
      <StateHolderWrapper state={replicantOptions()}>
        {(keyedReplicantOptions) => (
          <Switch
            fallback={
              <ReplicantOptionsMessage status={keyedReplicantOptions.status} />
            }
          >
            <Match
              when={keyedReplicantOptions.status === "ok" &&
                keyedReplicantOptions}
              keyed
            >
              {(ok) => {
                const options = createMemo(() =>
                  cleanedReplicantSelectOptions(
                    (ok as Extract<typeof ok, { status: "ok" }>)
                      .possibleValues,
                    p.replicateBy,
                  )
                );
                const index = () =>
                  options().findIndex((opt) =>
                    opt.value === p.selectedReplicantValue
                  );
                const stepTo = (i: number) =>
                  p.setSelectedReplicant(options()[i].value);
                return (
                  <>
                    <div class="w-96">
                      <SelectSearch
                        label={<span class="font-700">{dimensionLabel()}</span>}
                        options={options()}
                        value={p.selectedReplicantValue}
                        onChange={p.setSelectedReplicant}
                        fullWidth
                      />
                    </div>
                    <div class="ui-gap-sm flex items-center">
                      <Button
                        iconName="chevronLeft"
                        outline
                        ariaLabel={t3({
                          en: `Previous value of ${dimensionLabel()}`,
                          fr: `Valeur précédente pour ${dimensionLabel()}`,
                          pt: `Valor anterior de ${dimensionLabel()}`,
                        })}
                        disabled={index() <= 0}
                        onClick={() => stepTo(index() - 1)}
                      />
                      <Button
                        iconName="chevronRight"
                        outline
                        ariaLabel={t3({
                          en: `Next value of ${dimensionLabel()}`,
                          fr: `Valeur suivante pour ${dimensionLabel()}`,
                          pt: `Valor seguinte de ${dimensionLabel()}`,
                        })}
                        disabled={index() === options().length - 1}
                        onClick={() => stepTo(index() + 1)}
                      />
                    </div>
                  </>
                );
              }}
            </Match>
          </Switch>
        )}
      </StateHolderWrapper>
    </div>
  );
}
