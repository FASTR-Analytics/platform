import {
  defaultGridQuery,
  deriveGridConfig,
  familiesOffered,
  getFetchConfigFromPresentationObjectConfig,
  hashFetchConfig,
  INDICATOR_DIMENSION,
  levelOptionsFor,
  periodChoicesFor,
  primaryMetricFor,
  resolveEffectiveIndicatorFacts,
  resolveGridQuery,
  t3,
  type APIResponseWithData,
  type DatasetType,
  type DisaggregationOption,
  type FigureBundle,
  type GenericLongFormFetchConfig,
  type GridAvailable,
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
import { exploreFamily, setExploreFamily } from "~/state/t4_ui";
import { gridCellFunction } from "./cell_function";
import { columnLabel, Grid, GridMessage, type GridProps } from "./grid";
import { Toolbar } from "./toolbar";
import { createTrackedQuery } from "./tracked_query";

export type QueriesByFamily = Partial<Record<DatasetType, GridQuery>>;

// The Data table tab: one family's primary metric read as a grid of units by
// indicators or by time. The state is one GridQuery per family, owned by the
// page so it outlives a package, scope or tab change; each read resolves it
// against the current package and scope, so such a change never rewrites
// what the user chose.
export function DataTable(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  queries: QueriesByFamily;
  setQueries: (queries: QueriesByFamily) => void;
}) {
  const offered = createMemo(() => familiesOffered(p.ctx));
  const family = createMemo((): DatasetType | undefined =>
    offered().includes(exploreFamily()) ? exploreFamily() : offered()[0]
  );

  return (
    <Show
      when={family()}
      keyed
      fallback={
        <div class="ui-pad text-base-content-muted text-sm">
          {t3({
            en: "This package has no primary module, so there are no results to explore. Generate a package that includes one.",
            fr: "Ce paquet n'a aucun module principal, il n'y a donc aucun résultat à explorer. Générez un paquet qui en inclut un.",
            pt: "Este pacote não tem nenhum módulo principal, pelo que não há resultados para explorar. Gere um pacote que inclua um.",
          })}
        </div>
      }
    >
      {(f) => (
        <Show
          when={primaryMetricFor(f, p.ctx)}
          keyed
          fallback={
            <div class="ui-pad text-base-content-muted text-sm">
              {unavailableReason(f, p.ctx)}
            </div>
          }
        >
          {(metric) => (
            <FamilyTable
              ctx={p.ctx}
              scope={p.scope}
              family={f}
              families={offered()}
              metric={metric}
              query={p.queries[f]}
              setQuery={(q) => p.setQueries({ ...p.queries, [f]: q })}
            />
          )}
        </Show>
      )}
    </Show>
  );
}

// The stamped reason on the primary module's first metric by id.
function unavailableReason(
  family: DatasetType,
  ctx: RunAuthoringContext,
): string {
  const module = ctx.modules.find((m) =>
    m.family === family && m.tier === "primary"
  );
  const first = ctx.metrics
    .filter((m) => m.moduleId === module?.id)
    .toSorted((a, b) => a.id.localeCompare(b.id))[0];
  return first?.statusReason ??
    t3({
      en: "This module produced no metric in this package",
      fr: "Ce module n'a produit aucun indicateur dans ce paquet",
      pt: "Este módulo não produziu nenhuma métrica neste pacote",
    });
}

function FamilyTable(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  families: DatasetType[];
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
          families={p.families}
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
  families: DatasetType[];
  metric: MetricWithStatus;
  info: ResultsValueInfoForPresentationObject;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
}) {
  const [find, setFind] = createSignal("");

  const available = createMemo((): GridAvailable => ({
    hfaTimePoints: instanceState.hfaTimePoints
      .toSorted((a, b) =>
        a.periodId.localeCompare(b.periodId) || a.sortOrder - b.sortOrder
      )
      .map((tp) => tp.label),
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
  const fetchConfig = createMemo(
    (): APIResponseWithData<GenericLongFormFetchConfig> | undefined => {
      const d = derived();
      return d === undefined
        ? undefined
        : getFetchConfigFromPresentationObjectConfig(d.metric, d.config);
    },
    undefined,
    { equals: sameFetchConfig },
  );

  const rows = createTrackedQuery((): Promise<APIResponseWithData<GridRows>> => {
    const fc = fetchConfig();
    if (fc === undefined) {
      return Promise.resolve({
        success: true,
        data: { status: "no_data_available" },
      });
    }
    if (fc.success === false) return Promise.resolve(fc);
    return getGridRowsFromCacheOrFetch(
      p.scope,
      p.metric.resultsObjectId,
      fc.data,
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
    const state = rows();
    const d = derived();
    if (state.status !== "ready" || state.data.status !== "ok" || !d) {
      return undefined;
    }
    return buildGrid({
      rows: state.data,
      config: d.config,
      metric: p.metric,
      info: p.info,
      scope: p.scope,
      family: p.family,
      columns: resolved().query.columns,
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
            families={p.families}
            onFamily={setExploreFamily}
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
          when={derived()}
          fallback={
            <GridMessage
              status={(p.metric.vizPresets?.length ?? 0) === 0
                ? "no_preset"
                : "no_data_available"}
            />
          }
        >
          <StateHolderWrapper state={rows()} noPad>
            {(data) => (
              <Switch>
                <Match when={data.status !== "ok" && data.status}>
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

function sameFetchConfig(
  a: APIResponseWithData<GenericLongFormFetchConfig> | undefined,
  b: APIResponseWithData<GenericLongFormFetchConfig> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.success && b.success) {
    return hashFetchConfig(a.data) === hashFetchConfig(b.data);
  }
  return !a.success && !b.success && a.err === b.err;
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
  columns: GridQuery["columns"];
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
