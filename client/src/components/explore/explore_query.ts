import {
  deriveConfigFromVizPreset,
  MODULE_FAMILY_ORDER,
  selectCf,
  thresholdBucketIndex,
  type DatasetType,
  type DisaggregationOption,
  type EffectiveIndicatorFacts,
  type InstalledModuleSummary,
  type JsonArrayItem,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContext,
  type ThresholdsRule,
  type VizPreset,
} from "lib";
import {
  getColor,
  getLanguage,
  type DataGridCell,
  type DataGridColumn,
  type DataGridColumnGroup,
  type DataGridRow,
} from "panther";
import { unwrap } from "solid-js/store";
import { formatIndicatorValue } from "~/generate_visualization/get_style_from_po/_0_common";

// The disaggregation that names a family's indicators.
export const INDICATOR_DIMENSION: Record<DatasetType, DisaggregationOption> = {
  hmis: "indicator_common_id",
  hfa: "hfa_indicator",
  iceh: "iceh_indicator",
};

export type FamilyPrimary = {
  family: DatasetType;
  module: InstalledModuleSummary;
  // The scorecard metric: the primary module's first ready metric by id, or
  // its first metric by id when none is ready, so the stamped reason shows.
  metric: MetricWithStatus | undefined;
};

// The families offered: those whose primary module is in the package, in
// family order.
export function familiesInPackage(ctx: RunAuthoringContext): FamilyPrimary[] {
  return MODULE_FAMILY_ORDER.flatMap((family) => {
    const module = ctx.modules.find((m) =>
      m.family === family && m.tier === "primary"
    );
    if (module === undefined) return [];
    const metrics = ctx.metrics
      .filter((m) => m.moduleId === module.id)
      .toSorted((a, b) => a.id.localeCompare(b.id));
    return [{
      family,
      module,
      metric: metrics.find((m) => m.status === "ready") ?? metrics[0],
    }];
  });
}

// A preset's config as the picker derives it, cloned to plain data first
// because the authoring context may be a Solid store.
export function presetConfig(preset: VizPreset): PresentationObjectConfig {
  return deriveConfigFromVizPreset(
    structuredClone(unwrap(preset)),
    getLanguage(),
  );
}

export type PeriodChoice = {
  id: string;
  label: string;
  apply: (d: PresentationObjectConfig["d"]) => PresentationObjectConfig["d"];
};

function withoutFilter(
  d: PresentationObjectConfig["d"],
  disOpt: DisaggregationOption,
): PresentationObjectConfig["d"]["filterBy"] {
  return d.filterBy.filter((f) => f.disOpt !== disOpt);
}

// HMIS windows replace the query's periodFilter; HFA time points and ICEH
// survey years are values of a dimension, so they filter it and drop any
// calendar window the preset carried.
export function periodChoicesFor(
  family: DatasetType,
  labels: {
    hfaTimePoints: string[];
    icehYears: string[];
    all: string;
    last12Months: string;
    lastQuarter: string;
    lastYear: string;
  },
): PeriodChoice[] {
  if (family === "hmis") {
    return [
      {
        id: "last_12_months",
        label: labels.last12Months,
        apply: (d) => ({
          ...d,
          periodFilter: { filterType: "last_n_months", nMonths: 12 },
        }),
      },
      {
        id: "last_quarter",
        label: labels.lastQuarter,
        apply: (d) => ({
          ...d,
          periodFilter: { filterType: "last_calendar_quarter" },
        }),
      },
      {
        id: "last_year",
        label: labels.lastYear,
        apply: (d) => ({
          ...d,
          periodFilter: { filterType: "last_calendar_year" },
        }),
      },
      {
        id: "all",
        label: labels.all,
        apply: (d) => ({ ...d, periodFilter: undefined }),
      },
    ];
  }
  const disOpt: DisaggregationOption = family === "hfa" ? "time_point" : "year";
  const values = family === "hfa" ? labels.hfaTimePoints : labels.icehYears;
  return [
    ...values.map((value) => ({
      id: value,
      label: value,
      apply: (d: PresentationObjectConfig["d"]) => ({
        ...d,
        periodFilter: undefined,
        filterBy: [...withoutFilter(d, disOpt), { disOpt, values: [value] }],
      }),
    })),
    {
      id: "all",
      label: labels.all,
      apply: (d) => ({
        ...d,
        periodFilter: undefined,
        filterBy: withoutFilter(d, disOpt),
      }),
    },
  ];
}

// HMIS opens on the scorecard preset's own window, HFA on every round (its
// scorecard already puts time points side by side), ICEH on the latest year.
export function defaultPeriodChoiceId(
  family: DatasetType,
  choices: PeriodChoice[],
): string {
  if (family === "hmis") return "last_12_months";
  if (family === "hfa") return "all";
  return choices[0]?.id ?? "all";
}

export function withPeriod(
  config: PresentationObjectConfig,
  choice: PeriodChoice | undefined,
): PresentationObjectConfig {
  return choice === undefined
    ? config
    : { ...config, d: choice.apply(config.d) };
}

export function withReplicantValue(
  config: PresentationObjectConfig,
  value: string,
): PresentationObjectConfig {
  return { ...config, d: { ...config.d, selectedReplicantValue: value } };
}

export function replicantDimension(
  config: PresentationObjectConfig,
): DisaggregationOption | undefined {
  return config.d.disaggregateBy.find((x) => x.disDisplayOpt === "replicant")
    ?.disOpt;
}

// A preset pinned to one indicator: through its replicant slot when the
// preset replicates by the indicator dimension, else a filter on it. A
// preset that disaggregates by the dimension collapses it through
// getEffectivePOConfig's filtered_to_one_value rule.
export function filteredToIndicator(
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption,
  indicatorId: string,
): PresentationObjectConfig {
  if (replicantDimension(config) === disOpt) {
    return withReplicantValue(config, indicatorId);
  }
  return {
    ...config,
    d: {
      ...config.d,
      filterBy: [
        ...withoutFilter(config.d, disOpt),
        { disOpt, values: [indicatorId] },
      ],
    },
  };
}

export type ScorecardGrid = {
  columns: DataGridColumn[];
  columnGroups: DataGridColumnGroup[] | undefined;
  rows: DataGridRow[];
  cells: (DataGridCell | undefined)[][];
  rowDimension: DisaggregationOption | undefined;
  columnDimension: DisaggregationOption | undefined;
};

const COLUMN_KEY_SEPARATOR = "::";

function dimensionFor(
  d: PresentationObjectConfig["d"],
  display: "row" | "col" | "colGroup",
): DisaggregationOption | undefined {
  return d.disaggregateBy.find((x) => x.disDisplayOpt === display)?.disOpt;
}

function valueOf(
  item: JsonArrayItem,
  disOpt: DisaggregationOption | undefined,
): string {
  return disOpt === undefined ? "" : String(item[disOpt] ?? "");
}

function orderedIds(
  items: JsonArrayItem[],
  disOpt: DisaggregationOption | undefined,
  catalogOrder: (disOpt: DisaggregationOption) => string[] | undefined,
): string[] {
  const seen = [...new Set(items.map((item) => valueOf(item, disOpt)))];
  const order = disOpt === undefined ? undefined : catalogOrder(disOpt);
  if (order === undefined) return seen.toSorted((a, b) => a.localeCompare(b));
  const position = new Map(order.map((id, i) => [id, i]));
  return seen.toSorted((a, b) =>
    (position.get(a) ?? order.length) - (position.get(b) ?? order.length) ||
    a.localeCompare(b)
  );
}

// The scorecard query's rows pivoted for the grid: the config's row, col and
// colGroup dimensions become the axes, the value prop the cell text, and each
// cell is coloured by the preset's fixed rule where it declares one, else by
// its indicator's own rule.
export function buildScorecardGrid(args: {
  items: JsonArrayItem[];
  config: PresentationObjectConfig;
  valueProp: string;
  indicatorDimension: DisaggregationOption;
  facts: EffectiveIndicatorFacts;
  labelFor: (disOpt: DisaggregationOption, id: string) => string;
  catalogOrder: (disOpt: DisaggregationOption) => string[] | undefined;
}): ScorecardGrid {
  const { items, config, valueProp, indicatorDimension, facts } = args;
  const rowDim = dimensionFor(config.d, "row");
  const colDim = dimensionFor(config.d, "col");
  const groupDim = dimensionFor(config.d, "colGroup");
  const decimals = config.s.decimalPlaces;
  const cf = selectCf(config.s);
  const fixedRule: ThresholdsRule | undefined = cf.type === "thresholds"
    ? cf
    : undefined;

  const rowIds = orderedIds(items, rowDim, args.catalogOrder);
  const groupIds = orderedIds(items, groupDim, args.catalogOrder);
  const colIds = orderedIds(items, colDim, args.catalogOrder);
  const columnKey = (groupId: string, colId: string) =>
    groupDim === undefined ? colId : `${groupId}${COLUMN_KEY_SEPARATOR}${colId}`;

  const columns: DataGridColumn[] = groupIds.flatMap((groupId) =>
    colIds.map((colId) => ({
      id: columnKey(groupId, colId),
      label: colDim === undefined ? "" : args.labelFor(colDim, colId),
      ...(groupDim === undefined ? {} : { groupId }),
    }))
  );
  const columnGroups = groupDim === undefined
    ? undefined
    : groupIds.map((id) => ({ id, label: args.labelFor(groupDim, id) }));
  const rows: DataGridRow[] = rowIds.map((id) => ({
    id,
    label: rowDim === undefined ? "" : args.labelFor(rowDim, id),
  }));

  const byCell = new Map<string, JsonArrayItem>();
  for (const item of items) {
    const column = columnKey(valueOf(item, groupDim), valueOf(item, colDim));
    byCell.set(`${valueOf(item, rowDim)}${COLUMN_KEY_SEPARATOR}${column}`, item);
  }

  const cells = rows.map((row) =>
    columns.map((column): DataGridCell | undefined => {
      const item = byCell.get(`${row.id}${COLUMN_KEY_SEPARATOR}${column.id}`);
      const raw = item?.[valueProp];
      if (raw === undefined || raw === null || raw === "") return undefined;
      const value = Number(raw);
      if (Number.isNaN(value)) return { text: String(raw) };
      const indicatorId = indicatorDimension === rowDim
        ? row.id
        : indicatorDimension === colDim
        ? column.id.split(COLUMN_KEY_SEPARATOR).at(-1)
        : undefined;
      const ids = indicatorId === undefined ? [] : [indicatorId];
      const rule = fixedRule ?? facts.ruleForValue(ids);
      const bucket = rule === undefined
        ? undefined
        : thresholdBucketIndex(rule, value);
      const colour = rule !== undefined && bucket !== undefined
        ? getColor(rule.buckets[bucket].color)
        : undefined;
      return {
        text: formatIndicatorValue(value, facts.formatForValue(ids), decimals),
        value,
        ...(colour === undefined ? {} : { bg: colour }),
      };
    })
  );

  return {
    columns,
    columnGroups,
    rows,
    cells,
    rowDimension: rowDim,
    columnDimension: colDim,
  };
}

// The indicator a grid hit names, from whichever axis carries the dimension.
export function indicatorForHit(
  grid: ScorecardGrid,
  indicatorDimension: DisaggregationOption,
  hit: { rowId: string; columnId: string },
): string | undefined {
  const id = grid.rowDimension === indicatorDimension
    ? hit.rowId
    : grid.columnDimension === indicatorDimension
    ? hit.columnId.split(COLUMN_KEY_SEPARATOR).at(-1)
    : undefined;
  return id === "" ? undefined : id;
}

// Labels for a dimension's values: the metric info's possible values first,
// the family catalog second, the id itself last.
export function dimensionLabeller(
  info: ResultsValueInfoForPresentationObject | undefined,
  catalog: Map<string, string>,
): (disOpt: DisaggregationOption, id: string) => string {
  return (disOpt, id) => {
    const status = info?.disaggregationPossibleValues[disOpt];
    if (status?.status === "ok") {
      const found = status.values.find((v) => v.id === id);
      if (found !== undefined) return found.label;
    }
    return catalog.get(id) ?? id;
  };
}

// The values a metric's info enumerates for a dimension, when it can.
export function possibleValueIds(
  info: ResultsValueInfoForPresentationObject | undefined,
  disOpt: DisaggregationOption,
): string[] | undefined {
  const status = info?.disaggregationPossibleValues[disOpt];
  return status?.status === "ok" ? status.values.map((v) => v.id) : undefined;
}
