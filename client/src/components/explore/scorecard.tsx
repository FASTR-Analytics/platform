import {
  resolveEffectiveIndicatorFacts,
  t3,
  type DisaggregationOption,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import { DataGrid, StateHolderWrapper, type DataGridHit } from "panther";
import { createMemo, createSignal, Show } from "solid-js";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  buildScorecardGrid,
  dimensionLabeller,
  indicatorForHit,
  possibleValueIds,
} from "./explore_query";
import { createTrackedQuery } from "./tracked_query";

// The scorecard query rendered through the grid: sortable columns, a hover
// value per cell, threshold colouring, and a click on a row or cell selecting
// its indicator in the rail.
export function Scorecard(p: {
  scope: PackageScope;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
  info: ResultsValueInfoForPresentationObject;
  indicatorDimension: DisaggregationOption;
  catalog: Map<string, string>;
  selectedIndicator: string | undefined;
  onSelectIndicator: (id: string) => void;
}) {
  const items = createTrackedQuery(() =>
    getPresentationObjectItemsFromCacheOrFetch(p.scope, p.metric, p.config)
  );

  const facts = createMemo(() =>
    resolveEffectiveIndicatorFacts({
      metricFormatAs: p.metric.formatAs,
      config: p.config,
      indicatorFormats: p.info.indicatorFormats,
      indicatorRules: p.info.indicatorRules,
      possibleValues: p.info.disaggregationPossibleValues,
    })
  );
  const labelFor = createMemo(() => dimensionLabeller(p.info, p.catalog));
  const catalogOrder = (disOpt: DisaggregationOption) =>
    disOpt === p.indicatorDimension
      ? [...p.catalog.keys()]
      : possibleValueIds(p.info, disOpt);

  const [hover, setHover] = createSignal<DataGridHit | null>(null);

  return (
    <StateHolderWrapper state={items()} noPad>
      {(fetched) => {
        const grid = createMemo(() =>
          fetched.ih.status === "ok"
            ? buildScorecardGrid({
              items: fetched.ih.items,
              config: fetched.config,
              valueProp: p.metric.valueProps[0],
              indicatorDimension: p.indicatorDimension,
              facts: facts(),
              labelFor: labelFor(),
              catalogOrder,
            })
            : undefined
        );
        const select = (hit: { rowId: string; columnId: string }) => {
          const g = grid();
          const id = g === undefined
            ? undefined
            : indicatorForHit(g, p.indicatorDimension, hit);
          if (id !== undefined) p.onSelectIndicator(id);
        };
        return (
          <Show
            when={grid()}
            keyed
            fallback={
              <div class="text-base-content-muted text-sm">
                {fetched.ih.status === "too_many_items"
                  ? t3({
                    en: "Too many data points for the scorecard",
                    fr: "Trop de points de données pour le tableau de bord",
                    pt: "Demasiados pontos de dados para o painel",
                  })
                  : t3({
                    en: "No data for this selection",
                    fr: "Aucune donnée pour cette sélection",
                    pt: "Nenhum dado para esta seleção",
                  })}
              </div>
            }
          >
            {(g) => (
              <div class="ui-spy-sm">
                <div class="h-[60vh]">
                  <DataGrid
                    columns={g.columns}
                    columnGroups={g.columnGroups}
                    rows={g.rows}
                    cells={g.cells}
                    rowHeaderLabel={g.rowDimension === undefined
                      ? ""
                      : t3(labelForDimension(g.rowDimension))}
                    fitToAvailableHeight
                    onCellHover={setHover}
                    onCellClick={select}
                    onRowClick={g.rowDimension === p.indicatorDimension
                      ? (rowId) => select({ rowId, columnId: "" })
                      : undefined}
                  />
                </div>
                <div class="ui-text-caption h-4 truncate">
                  <Show when={hover()} keyed>
                    {(hit) =>
                      `${g.rows.find((r) => r.id === hit.rowId)?.label ?? hit.rowId} · ${
                        g.columns.find((c) => c.id === hit.columnId)?.label ??
                          hit.columnId
                      }: ${hit.cell?.text ?? "–"}`}
                  </Show>
                </div>
              </div>
            )}
          </Show>
        );
      }}
    </StateHolderWrapper>
  );
}

function labelForDimension(
  disOpt: DisaggregationOption,
): { en: string; fr: string; pt: string } {
  switch (disOpt) {
    case "indicator_common_id":
    case "hfa_indicator":
    case "iceh_indicator":
      return { en: "Indicator", fr: "Indicateur", pt: "Indicador" };
    default:
      return { en: "", fr: "", pt: "" };
  }
}
