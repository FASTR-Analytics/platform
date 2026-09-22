import {
  t3,
  TC,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContext,
} from "lib";
import {
  ButtonGroup,
  createQuery,
  SelectList,
  StateHolderWrapper,
  type ListEntry,
} from "panther";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { ReplicateByOptionsSelect } from "~/components/_shared/figure_editor/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  defaultPeriodChoiceId,
  INDICATOR_DIMENSION,
  periodChoicesFor,
  possibleValueIds,
  presetConfig,
  replicantDimension,
  withPeriod,
  withReplicantValue,
  type FamilyPrimary,
} from "./explore_query";
import { IndicatorDetail } from "./indicator_detail";
import { Scorecard } from "./scorecard";

// One family of one package at one scope: the indicator rail, the period
// chips, the scorecard and the selected indicator's detail. The scorecard
// query is the scorecard metric's first preset's data config; the period
// chips replace its window and apply to the detail figures too.
export function FamilyView(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  primary: FamilyPrimary;
}) {
  return (
    <Show
      when={p.primary.metric?.status === "ready" ? p.primary.metric : undefined}
      keyed
      fallback={
        <div class="text-base-content-muted text-sm">
          {p.primary.metric?.statusReason ??
            t3({
              en: "This module produced no metric in this package",
              fr: "Ce module n'a produit aucun indicateur dans ce paquet",
              pt: "Este módulo não produziu nenhuma métrica neste pacote",
            })}
        </div>
      }
    >
      {(metric) => (
        <ReadyFamilyView
          ctx={p.ctx}
          scope={p.scope}
          primary={p.primary}
          metric={metric}
        />
      )}
    </Show>
  );
}

function ReadyFamilyView(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  primary: FamilyPrimary;
  metric: MetricWithStatus;
}) {
  const family = () => p.primary.family;
  const indicatorDimension = () => INDICATOR_DIMENSION[family()];
  const presets = () => p.metric.vizPresets ?? [];
  const scorecardPreset = () => presets()[0];
  const scorecardBase = createMemo((): PresentationObjectConfig | undefined => {
    const preset = scorecardPreset();
    return preset === undefined ? undefined : presetConfig(preset);
  });

  // The metric's queryable shape: labels, formats, rules and the values a
  // dimension can take (ICEH's survey years come from here).
  const info = createQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.scope,
        p.metric.id,
      ),
    t3(TC.loading),
  );
  const infoData = (): ResultsValueInfoForPresentationObject | undefined => {
    const state = info.state();
    return state.status === "ready" ? state.data : undefined;
  };

  const periodChoices = createMemo(() =>
    periodChoicesFor(family(), {
      hfaTimePoints: instanceState.hfaTimePoints.map((tp) => tp.label),
      icehYears: (possibleValueIds(infoData(), "year") ?? [])
        .toSorted((a, b) => b.localeCompare(a)),
      all: t3({ en: "All", fr: "Tout", pt: "Tudo" }),
      last12Months: t3({
        en: "Last 12 months",
        fr: "12 derniers mois",
        pt: "Últimos 12 meses",
      }),
      lastQuarter: t3({
        en: "Last quarter",
        fr: "Dernier trimestre",
        pt: "Último trimestre",
      }),
      lastYear: t3({ en: "Last year", fr: "Dernière année", pt: "Último ano" }),
    })
  );
  const [chosenPeriodId, setChosenPeriodId] = createSignal<string | undefined>(
    undefined,
  );
  const periodChoice = createMemo(() => {
    const choices = periodChoices();
    const chosen = chosenPeriodId();
    return choices.find((c) => c.id === chosen) ??
      choices.find((c) => c.id === defaultPeriodChoiceId(family(), choices));
  });

  const [selectedIndicator, setSelectedIndicator] = createSignal<
    string | undefined
  >(undefined);
  const [replicant, setReplicant] = createSignal<string>("");
  createEffect(on([family, () => p.scope.runId], () => {
    setSelectedIndicator(undefined);
    setChosenPeriodId(undefined);
    setReplicant("");
  }));

  const scorecardConfig = createMemo((): PresentationObjectConfig | undefined => {
    const base = scorecardBase();
    if (base === undefined) return undefined;
    const withWindow = withPeriod(base, periodChoice());
    return replicant() === "" ? withWindow : withReplicantValue(withWindow, replicant());
  });
  const replicateBy = () => {
    const base = scorecardBase();
    return base === undefined ? undefined : replicantDimension(base);
  };

  const catalog = createMemo((): Map<string, string> => {
    switch (family()) {
      case "hmis":
        return new Map(p.ctx.hmisIndicators.map((i) => [i.id, i.label]));
      case "hfa":
        return new Map(p.ctx.hfaTaxonomy.indicators.map((i) => [i.id, i.label]));
      case "iceh":
        return new Map(p.ctx.icehIndicators.map((i) => [i.id, i.label]));
    }
  });
  const railItems = createMemo((): ListEntry<string>[] => {
    if (family() === "iceh") {
      const entries: ListEntry<string>[] = [];
      let category: string | undefined = undefined;
      for (const ind of p.ctx.icehIndicators) {
        if (ind.category !== category) {
          category = ind.category;
          entries.push({ header: category });
        }
        entries.push({ id: ind.id, label: ind.label });
      }
      return entries;
    }
    return [...catalog()].map(([id, label]) => ({ id, label }));
  });

  return (
    <div class="ui-gap flex items-start">
      <div class="w-64 flex-none">
        <div class="ui-text-caption font-700 pb-2">
          {t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" })}
        </div>
        <SelectList
          items={railItems()}
          value={selectedIndicator()}
          onChange={setSelectedIndicator}
          fullWidth
          emptyMessage={t3({
            en: "No indicators in this package",
            fr: "Aucun indicateur dans ce paquet",
            pt: "Nenhum indicador neste pacote",
          })}
        />
      </div>
      <div class="ui-spy min-w-0 flex-1">
        <div class="ui-gap flex flex-wrap items-end">
          <ButtonGroup
            label={t3({ en: "Period", fr: "Période", pt: "Período" })}
            items={periodChoices().map((c) => ({ id: c.id, label: c.label }))}
            value={periodChoice()?.id}
            onChange={(id) => setChosenPeriodId(id)}
            size="sm"
          />
          <Show when={replicateBy() && scorecardConfig()} keyed>
            {(config) => (
              <ReplicateByOptionsSelect
                scope={p.scope}
                replicateBy={replicateBy()!}
                config={config}
                metric={p.metric}
                selectedReplicantValue={replicant() || undefined}
                setSelectedReplicant={(v, all) =>
                  setReplicant(v || all?.[0] || "")}
              />
            )}
          </Show>
        </div>
        <StateHolderWrapper state={info.state()} noPad>
          {(metricInfo) => (
            <Show
              when={scorecardConfig()}
              keyed
              fallback={
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "This metric declares no visualization preset",
                    fr: "Cet indicateur ne déclare aucune visualisation prédéfinie",
                    pt: "Esta métrica não declara nenhuma visualização predefinida",
                  })}
                </div>
              }
            >
              {(config) => (
                <Scorecard
                  scope={p.scope}
                  metric={p.metric}
                  config={config}
                  info={metricInfo}
                  indicatorDimension={indicatorDimension()}
                  catalog={catalog()}
                  selectedIndicator={selectedIndicator()}
                  onSelectIndicator={setSelectedIndicator}
                />
              )}
            </Show>
          )}
        </StateHolderWrapper>
        <Show when={selectedIndicator()} keyed>
          {(indicatorId) => (
            <IndicatorDetail
              scope={p.scope}
              metric={p.metric}
              presets={presets().slice(1)}
              indicatorDimension={indicatorDimension()}
              indicatorId={indicatorId}
              indicatorLabel={catalog().get(indicatorId) ?? indicatorId}
              periodChoice={periodChoice()}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
