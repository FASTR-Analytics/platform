import {
  defaultGridQuery,
  deriveGridConfig,
  getFetchConfigFromPresentationObjectConfig,
  hashFetchConfig,
  INDICATOR_DIMENSION,
  levelOptionsFor,
  periodChoicesFor,
  resolveEffectiveIndicatorFacts,
  resolveGridQuery,
  t3,
  type APIResponseWithData,
  type DatasetType,
  type DisaggregationOption,
  type FigureBundle,
  type GenericLongFormFetchConfig,
  type GridAvailable,
  type GridColumns,
  type GridQuery,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContext,
} from "lib";
import {
  Button,
  Csv,
  dataGridPropsFromTableData,
  downloadCsv,
  FrameTop,
  getLanguage,
  getTableDataTransformed,
  type SelectOption,
  StateHolderWrapper,
} from "panther";
import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
import { EmptyState } from "../_shared/mod.ts";
import { buildFigureInputs } from "~/generate_visualization/build_figure_inputs";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";
import {
  getSnapshotInstanceLocalization,
  instanceState,
} from "~/state/instance/t1_store";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  getGridRowsFromCacheOrFetch,
  type GridRows,
} from "~/state/products/t2_grid_items";
import { gridCellFunction } from "./cell_function";
import { columnLabel, Grid, GridMessage, type GridProps } from "./grid";
import { Toolbar } from "./toolbar";
import { createTrackedQuery } from "./tracked_query";

export type QueriesByFamily = Partial<Record<DatasetType, GridQuery>>;

// The Data table view: a metric read as a grid of units by indicators or by
// time. The state is one GridQuery per family, owned by the page so it
// outlives a package, scope or metric change; each read resolves it against
// the current package and scope, so such a change never rewrites what the
// user chose.
export function DataTable(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  metric: MetricWithStatus;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
}) {
  const info = createTrackedQuery(() =>
    getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      p.scope,
      p.metric.id,
    )
  );
  return (
    <StateHolderWrapper state={info()}>
      {(metricInfo) => (
        <ReadyFamilyTable
          ctx={p.ctx}
          scope={p.scope}
          family={p.family}
          metric={p.metric}
          info={metricInfo}
          query={p.query}
          setQuery={p.setQuery}
        />
      )}
    </StateHolderWrapper>
  );
}

function possibleValues(
  info: ResultsValueInfoForPresentationObject,
  disOpt: DisaggregationOption,
): { id: string; label: string }[] {
  const status = info.disaggregationPossibleValues[disOpt];
  return status?.status === "ok" ? status.values : [];
}

function indicatorOptions(
  family: DatasetType,
  ctx: RunAuthoringContext,
): SelectOption<string>[] {
  const entries = family === "hmis"
    ? ctx.hmisIndicators
    : family === "hfa"
    ? ctx.hfaTaxonomy.indicators
    : ctx.icehIndicators;
  return entries.map((i) => ({ value: i.id, label: i.label }));
}

function ReadyFamilyTable(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  metric: MetricWithStatus;
  info: ResultsValueInfoForPresentationObject;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
}) {
  const [find, setFind] = createSignal("");

  // The package's own time points and years, from the metric info. HFA
  // rounds take the instance's declared order; one the instance no longer
  // lists goes last.
  const available = createMemo((): GridAvailable => ({
    hfaTimePoints: hfaTimePointsInOrder(
      possibleValues(p.info, "time_point").map((v) => v.id),
    ),
    icehYears: possibleValues(p.info, "year")
      .map((v) => v.id)
      .toSorted((a, b) => Number(a) - Number(b)),
    icehStrats: possibleValues(p.info, "strat").map((v) => v.id),
  }));

  // Until the user edits it, the family's query is the default for the
  // current scope, so it follows a scope change.
  const intent = (): GridQuery =>
    p.query ?? defaultGridQuery(p.family, p.scope, p.ctx, available());
  const resolved = createMemo(() =>
    resolveGridQuery(intent(), p.scope, p.ctx, available())
  );
  const update = (patch: Partial<GridQuery>) =>
    p.setQuery({
      ...intent(),
      ...patch,
      ...(patch.indicators === undefined ? {} : {
        indicators: [...patch.indicators, ...resolved().droppedIndicators],
      }),
    });
  const clearDropped = () => {
    const dropped = new Set(resolved().droppedIndicators);
    p.setQuery({
      ...intent(),
      indicators: intent().indicators.filter((id) => !dropped.has(id)),
    });
  };

  const derived = createMemo(() =>
    deriveGridConfig(resolved().query, p.ctx, getLanguage())
  );
  // What one grid read is for. Only a change of fetch config or columns
  // makes a new one, and the grid is built from the config and columns its
  // rows were read for, never from a newer query paired with older rows.
  const readSpec = createMemo((): ReadSpec | undefined => {
    const d = derived();
    return d === undefined ? undefined : {
      fetchConfig: getFetchConfigFromPresentationObjectConfig(d.metric, d.config),
      config: d.config,
      columns: resolved().query.columns,
    };
  }, undefined, { equals: sameReadSpec });

  const read = createTrackedQuery((): Promise<APIResponseWithData<GridRead>> => {
    const spec = readSpec();
    const scope = p.scope;
    if (spec === undefined) {
      return Promise.resolve({
        success: false,
        err: "No read without a config",
      });
    }
    if (spec.fetchConfig.success === false) {
      return Promise.resolve(spec.fetchConfig);
    }
    return getGridRowsFromCacheOrFetch(
      scope,
      p.metric.resultsObjectId,
      spec.fetchConfig.data,
    ).then((res) =>
      res.success ? { success: true, data: { rows: res.data, spec, scope } } : res
    );
  });

  const rowHeaderLabel = createMemo(() => {
    const unit = resolved().query.unit;
    return unit.kind === "admin"
      ? t3(getDisplayDisaggregationLabel(unit.level, p.family))
      : possibleValues(p.info, "strat").find((v) => v.id === unit.strat)
        ?.label ?? unit.strat;
  });

  const grid = createMemo((): GridBuild | undefined => {
    const state = read();
    if (state.status !== "ready" || state.data.rows.status !== "ok") {
      return undefined;
    }
    const { rows, spec, scope } = state.data;
    return buildGrid({
      rows,
      config: spec.config,
      columns: spec.columns,
      metric: p.metric,
      info: p.info,
      scope,
      family: p.family,
    });
  });
  const readyGrid = (): GridProps | undefined => {
    const g = grid();
    return g?.ok ? g.grid : undefined;
  };

  const focusColumnId = createMemo((): string | null => {
    const g = readyGrid();
    const needle = find().trim().toLowerCase();
    if (g === undefined || needle === "") return null;
    return g.columns.find((c) =>
      columnLabel(g, c.id).toLowerCase().includes(needle)
    )?.id ?? null;
  });

  const download = () => {
    const g = readyGrid();
    return g === undefined ? undefined : () =>
      downloadCsv(
        new Csv({
          colHeaders: g.columns.map((c) => columnLabel(g, c.id)),
          rowHeaders: g.rows.map((r) => r.label),
          aoa: g.cells.map((row) => row.map((cell) => cell?.text ?? "")),
        }),
        `${p.family}_data_table.csv`,
      );
  };

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-spy-sm">
          <Toolbar
            query={resolved().query}
            levelOptions={levelOptionsFor(p.metric, p.scope).map((level) => ({
              value: level,
              label: t3(getDisplayDisaggregationLabel(level, p.family)),
            }))}
            stratOptions={possibleValues(p.info, "strat").map((v) => ({
              value: v.id,
              label: v.label,
            }))}
            indicatorOptions={indicatorOptions(p.family, p.ctx)}
            periodChoices={periodChoicesFor(
              p.family,
              resolved().query.columns,
              available(),
            )}
            onChange={update}
            find={find()}
            onFind={setFind}
            onDownload={download()}
          />
          <Show when={resolved().droppedIndicators.length > 0}>
            <div class="ui-gap-sm flex items-center text-sm">
              <span class="text-base-content-muted">
                {t3({
                  en: `${resolved().droppedIndicators.length} chosen indicator(s) are not in this package.`,
                  fr: `${resolved().droppedIndicators.length} indicateur(s) choisi(s) ne figurent pas dans ce paquet.`,
                  pt: `${resolved().droppedIndicators.length} indicador(es) escolhido(s) não estão neste pacote.`,
                })}
              </span>
              <Button onClick={clearDropped} size="sm" outline>
                {t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
              </Button>
            </div>
          </Show>
        </div>
      }
    >
      <div class="ui-pad h-full">
        <Show
          when={readSpec()}
          fallback={(p.metric.vizPresets?.length ?? 0) === 0
            ? <EmptyState kind="no_preset" />
            : <GridMessage status="no_data_available" />}
        >
          <StateHolderWrapper state={read()} noPad>
            {(data) => (
              <Switch>
                <Match when={data.rows.status !== "ok" && data.rows.status}>
                  {(status) => <GridMessage status={status()} />}
                </Match>
                <Match when={grid()} keyed>
                  {(g) =>
                    g.ok
                      ? (
                        <Grid
                          grid={g.grid}
                          rowHeaderLabel={rowHeaderLabel()}
                          focusColumnId={focusColumnId()}
                        />
                      )
                      : (
                        <div class="text-danger text-sm">{g.err}</div>
                      )}
                </Match>
              </Switch>
            )}
          </StateHolderWrapper>
        </Show>
      </div>
    </FrameTop>
  );
}

type ReadSpec = {
  fetchConfig: APIResponseWithData<GenericLongFormFetchConfig>;
  config: PresentationObjectConfig;
  columns: GridColumns;
};

type GridRead = { rows: GridRows; spec: ReadSpec; scope: PackageScope };

function sameReadSpec(
  a: ReadSpec | undefined,
  b: ReadSpec | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.columns !== b.columns) return false;
  const fa = a.fetchConfig;
  const fb = b.fetchConfig;
  if (fa.success && fb.success) {
    return hashFetchConfig(fa.data) === hashFetchConfig(fb.data);
  }
  return !fa.success && !fb.success && fa.err === fb.err;
}

function hfaTimePointsInOrder(ids: string[]): string[] {
  const order = new Map(
    instanceState.hfaTimePoints.map((tp) => [tp.label, tp.sortOrder]),
  );
  return ids.toSorted((a, b) =>
    (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
}

type GridBuild = { ok: true; grid: GridProps } | { ok: false; err: string };

// The canvas table's own pipeline over the grid rows (buildFigureInputs, so
// the effective config, roll-up pin, label replacements and header order are
// the canvas table's), then its pivot, then the DataGrid adapter.
function buildGrid(args: {
  rows: Extract<GridRows, { status: "ok" }>;
  config: PresentationObjectConfig;
  metric: MetricWithStatus;
  info: ResultsValueInfoForPresentationObject;
  scope: PackageScope;
  family: DatasetType;
  columns: GridColumns;
}): GridBuild {
  const { rows, config, metric, info } = args;
  const bundle: FigureBundle = {
    config,
    items: rows.items,
    resultsValue: {
      formatAs: metric.formatAs,
      valueProps: metric.valueProps,
      valueLabelReplacements: metric.valueLabelReplacements,
    },
    indicatorMetadata: rows.indicatorMetadata,
    dateRange: rows.dateRange,
    localization: getSnapshotInstanceLocalization(),
    metricId: metric.id,
    scope: { adminArea2: args.scope.adminArea2 },
    snapshotAt: "",
    provenance: { runId: args.scope.runId },
  };
  try {
    const inputs = buildFigureInputs(bundle);
    if (inputs.figureType !== "table") {
      return { ok: false, err: "Expected a table" };
    }
    const indicatorDim = INDICATOR_DIMENSION[args.family];
    const indicators = new Set(
      rows.items.map((item) => String(item[indicatorDim] ?? "")),
    );
    const facts = resolveEffectiveIndicatorFacts({
      metricFormatAs: metric.formatAs,
      config,
      indicatorFormats: info.indicatorFormats,
      indicatorRules: info.indicatorRules,
      possibleValues: info.disaggregationPossibleValues,
    });
    const grid = dataGridPropsFromTableData(
      getTableDataTransformed(inputs.data),
      gridCellFunction({
        family: args.family,
        columns: args.columns,
        facts,
        decimalPlaces: config.s.decimalPlaces,
        onlyIndicator: indicators.size === 1 ? [...indicators][0] : undefined,
      }),
    );
    return { ok: true, grid };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}
