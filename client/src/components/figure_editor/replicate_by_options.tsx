import {
  DisaggregationOption,
  formatReplicantLabelForDisplay,
  getFetchConfigFromPresentationObjectConfig,
  PackageScope,
  PresentationObjectConfig,
  ReplicantOptionsForPresentationObject,
  ResultsValue,
  t3,
  TC,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";
import {
  SelectList,
  SelectSearch,
  StateHolder,
  StateHolderWrapper,
  getSelectOptionsFromIdLabel,
  selectOptionToListItem,
} from "panther";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/products/t2_replicant_options";
import { createEffect, createSignal, Match, onCleanup, Switch } from "solid-js";
import { trackDeep } from "@solid-primitives/deep";

// The replicant picker: which values of the replicated dimension a figure can be
// pinned to, under one PackageScope. Two presentations of the same data — a
// full-height list beside the editor preview, and a compact Select — so the
// load is written once here and shared.
//
// There is no version-key read any more: the options cache is keyed by
// `(runId, scopeToken, …)`, so a scope or package change lands on a DIFFERENT
// entry rather than invalidating this one (D8). Re-reading `p.scope` inside the
// tracked effect is what makes a mid-edit reattach re-query.

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

type ReplicateByOptionsProps = {
  scope: PackageScope;
  replicateBy: DisaggregationOption;
  config: PresentationObjectConfig;
  metric: ResultsValue;
  selectedReplicantValue: string | undefined;
  setSelectedReplicant: (v: string, allOptions?: string[]) => void;
  fullWidth?: boolean;
};

// The one loader both presentations use. Aborts a superseded in-flight load so
// an older filter's option list can never land after a newer one.
function createReplicantOptions(p: ReplicateByOptionsProps) {
  const [replicantOptions, setReplicantOptions] = createSignal<
    StateHolder<ReplicantOptionsForPresentationObject>
  >({
    status: "loading",
    msg: t3(TC.loading),
  });

  createEffect(() => {
    trackDeep(p.config.d.filterBy);
    // periodFilter also narrows the server's option list (its bounds become
    // periodFilterExactBounds), and trackDeep(filterBy) doesn't subscribe to
    // it — without this read a bounds edit left a stale picker list. Reading
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
    const scope = { runId: p.scope.runId, adminArea2: p.scope.adminArea2 };
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

// The non-"ok" statuses, rendered identically by both presentations.
function ReplicantOptionsMessage(mp: {
  status: ReplicantOptionsForPresentationObject["status"];
}) {
  return (
    <Switch>
      <Match when={mp.status === "too_many_values"}>
        <div class="w-36 text-sm">
          {t3({
            en: "Too many replicant values (over 500). Use filter options to narrow down.",
            fr: "Trop de valeurs de réplicant (plus de 500). Utilisez les options de filtre pour affiner.",
            pt: "Demasiados valores de replicante (mais de 500). Utilize as opções de filtro para restringir.",
          })}
        </div>
      </Match>
      <Match when={mp.status === "no_values_available"}>
        <div class="w-36 text-sm">
          {t3({
            en: "No data available with current filter selection.",
            fr: "Aucune donnée disponible avec la sélection de filtre actuelle.",
            pt: "Não há dados disponíveis com a seleção de filtros atual.",
          })}
        </div>
      </Match>
      <Match when={mp.status === "error"}>
        <div class="text-danger w-36 text-sm">
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

export function ReplicateByOptionsList(p: ReplicateByOptionsProps) {
  const replicantOptions = createReplicantOptions(p);

  return (
    <div class="ui-pad h-full max-w-[40rem] flex-none overflow-auto border-r">
      <StateHolderWrapper state={replicantOptions()} noPad>
        {(keyedReplicantOptions) => (
          <Switch fallback={<ReplicantOptionsMessage status={keyedReplicantOptions.status} />}>
            <Match when={keyedReplicantOptions.status === "ok" && keyedReplicantOptions} keyed>
              {(ok) => (
                <SelectList
                  items={cleanedReplicantSelectOptions(
                    (ok as Extract<typeof ok, { status: "ok" }>).possibleValues,
                    p.replicateBy,
                  ).map(selectOptionToListItem)}
                  value={p.selectedReplicantValue}
                  onChange={(v: string) => p.setSelectedReplicant(v)}
                  emptyMessage={t3({
                    en: "No replicant options",
                    fr: "Aucune option de réplicant",
                    pt: "Nenhuma opção de replicante",
                  })}
                />
              )}
            </Match>
          </Switch>
        )}
      </StateHolderWrapper>
    </div>
  );
}

export function ReplicateByOptionsSelect(p: ReplicateByOptionsProps) {
  const replicantOptions = createReplicantOptions(p);

  // Report the full option list back to the host as soon as it resolves, so a
  // caller that needs to fan out over every replicant (or validate a stored
  // pick) does not have to re-query it.
  createEffect(() => {
    const state = replicantOptions();
    if (state.status === "ready" && state.data.status === "ok") {
      p.setSelectedReplicant(
        p.selectedReplicantValue || "",
        state.data.possibleValues.map((pv) => pv.id),
      );
    }
  });

  return (
    <StateHolderWrapper state={replicantOptions()}>
      {(keyedReplicantOptions) => (
        <Switch fallback={<ReplicantOptionsMessage status={keyedReplicantOptions.status} />}>
          <Match when={keyedReplicantOptions.status === "ok" && keyedReplicantOptions} keyed>
            {(ok) => {
              const possibleValues = (ok as Extract<typeof ok, { status: "ok" }>)
                .possibleValues;
              return (
                <SelectSearch
                  options={cleanedReplicantSelectOptions(
                    possibleValues,
                    p.replicateBy,
                  )}
                  value={p.selectedReplicantValue}
                  onChange={(v) =>
                    p.setSelectedReplicant(v, possibleValues.map((pv) => pv.id))}
                  fullWidth={p.fullWidth}
                  placeholder={t3({
                    en: "Needs selection",
                    fr: "Nécessite une sélection",
                    pt: "Requer seleção",
                  })}
                />
              );
            }}
          </Match>
        </Switch>
      )}
    </StateHolderWrapper>
  );
}
