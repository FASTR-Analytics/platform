import {
  type APIResponseWithData,
  type DatasetType,
  type DerivedConfig,
  type FigureBundle,
  type GenericLongFormFetchConfig,
  getFetchConfigFromPresentationObjectConfig,
  hashFetchConfig,
  INDICATOR_DIMENSION,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  resolveEffectiveIndicatorFacts,
  type ResultsValueInfoForPresentationObject,
  selectCf,
  t3,
} from "lib";
import {
  Csv,
  dataGridPropsFromTableData,
  downloadCsv,
  foldString,
  getTableDataTransformed,
  matchesSearch,
  searchTokens,
  StateHolderWrapper,
} from "panther";
import {
  createEffect,
  createMemo,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { createTrackedQuery, EmptyState } from "../_shared/mod.ts";
import { buildFigureInputs } from "~/generate_visualization/build_figure_inputs";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";
import {
  figureScopeStamp,
  getSnapshotInstanceLocalization,
} from "~/state/instance/t1_store";
import {
  getGridRowsFromCacheOrFetch,
  type GridRows,
} from "~/state/products/t2_grid_items";
import { gridCellFunction } from "./cell_function";
import { columnLabel, Grid, type GridProps } from "./grid";

// The Data table body: the derived table config's rows read as a grid,
// pivoted and rendered. The frame owns the toolbar; it passes the find text
// in and takes the Download action back through `setDownload`, which is
// undefined until a grid is built.
export function DataTable(p: {
  scope: PackageScope;
  family: DatasetType;
  derived: DerivedConfig;
  info: ResultsValueInfoForPresentationObject;
  find: string;
  setDownload: (download: (() => void) | undefined) => void;
}) {
  // What one grid read is for. Only a change of fetch config, metric or
  // layout makes a new one, and the grid is built from the config its rows
  // were read for, never from a newer config paired with older rows.
  const readSpec = createMemo(
    (): ReadSpec => ({
      fetchConfig: getFetchConfigFromPresentationObjectConfig(
        p.derived.metric,
        p.derived.config,
      ),
      config: p.derived.config,
      metric: p.derived.metric,
    }),
    undefined,
    { equals: sameReadSpec },
  );

  const read = createTrackedQuery(
    (): Promise<APIResponseWithData<GridRead>> => {
      const spec = readSpec();
      const scope = p.scope;
      if (spec.fetchConfig.success === false) {
        return Promise.resolve(spec.fetchConfig);
      }
      return getGridRowsFromCacheOrFetch(
        scope,
        spec.metric.resultsObjectId,
        spec.fetchConfig.data,
      ).then((res) =>
        res.success
          ? { success: true, data: { rows: res.data, spec, scope } }
          : res
      );
    },
  );

  const grid = createMemo((): GridBuild | undefined => {
    const state = read();
    if (state.status !== "ready" || state.data.rows.status !== "ok") {
      return undefined;
    }
    const { rows, spec, scope } = state.data;
    return buildGrid({
      rows,
      config: spec.config,
      metric: spec.metric,
      info: p.info,
      scope,
      family: p.family,
    });
  });
  const readyGrid = (): GridProps | undefined => {
    const g = grid();
    return g?.ok ? g.grid : undefined;
  };
  const gridError = (): string | undefined => {
    const g = grid();
    return g?.ok === false ? g.err : undefined;
  };

  // The row dimension of the config the rows were read for.
  const rowHeaderLabel = createMemo((): string => {
    const state = read();
    const dim = state.status === "ready"
      ? state.data.spec.config.d.disaggregateBy.find((e) =>
        e.disDisplayOpt === "row"
      )?.disOpt
      : undefined;
    return dim === undefined
      ? ""
      : t3(getDisplayDisaggregationLabel(dim, p.family));
  });

  const foldedColumnLabels = createMemo(() => {
    const g = readyGrid();
    return g === undefined ? [] : g.columns.map((c) => ({
      id: c.id,
      folded: foldString(columnLabel(g, c.id)),
    }));
  });
  const focusColumnId = createMemo((): string | null => {
    const tokens = searchTokens(p.find);
    if (tokens.length === 0) return null;
    return foldedColumnLabels().find((c) => matchesSearch(c.folded, tokens))
      ?.id ?? null;
  });

  createEffect(() => {
    const g = readyGrid();
    p.setDownload(
      g === undefined ? undefined : () =>
        downloadCsv(
          new Csv({
            colHeaders: g.columns.map((c) => columnLabel(g, c.id)),
            rowHeaders: g.rows.map((r) => r.label),
            aoa: g.cells.map((row) => row.map((cell) => cell?.text ?? "")),
          }),
          `${p.family}_data_table.csv`,
        ),
    );
  });
  onCleanup(() => p.setDownload(undefined));

  return (
    <div class="ui-pad-x h-full pb-4">
      <StateHolderWrapper state={read()}>
        {(data) => (
          <Switch>
            <Match when={data.rows.status !== "ok" && data.rows.status}>
              {(status) => <EmptyState kind={status()} />}
            </Match>
            <Match when={grid()}>
              <Show
                when={readyGrid()}
                keyed
                fallback={<div class="text-danger text-sm">{gridError()}</div>}
              >
                {(g) => (
                  <Grid
                    grid={g}
                    rowHeaderLabel={rowHeaderLabel()}
                    focusColumnId={focusColumnId()}
                  />
                )}
              </Show>
            </Match>
          </Switch>
        )}
      </StateHolderWrapper>
    </div>
  );
}

type ReadSpec = {
  fetchConfig: APIResponseWithData<GenericLongFormFetchConfig>;
  config: PresentationObjectConfig;
  metric: MetricWithStatus;
};

type GridRead = { rows: GridRows; spec: ReadSpec; scope: PackageScope };

function sameReadSpec(a: ReadSpec | undefined, b: ReadSpec): boolean {
  if (a === undefined) return false;
  if (
    a.metric.id !== b.metric.id ||
    JSON.stringify(a.config.d.disaggregateBy) !==
      JSON.stringify(b.config.d.disaggregateBy)
  ) {
    return false;
  }
  const fa = a.fetchConfig;
  const fb = b.fetchConfig;
  if (fa.success && fb.success) {
    return hashFetchConfig(fa.data) === hashFetchConfig(fb.data);
  }
  return !fa.success && !fb.success && fa.err === fb.err;
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
    scope: figureScopeStamp(args.scope, rows.scopeToken, args.family),
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
        cf: selectCf(config.s),
        indicatorAxis: config.d.disaggregateBy.find((e) =>
          e.disOpt === indicatorDim
        )?.disDisplayOpt,
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
