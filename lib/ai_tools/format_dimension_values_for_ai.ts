import { AIToolFailure } from "@timroberton/panther";
import type {
  AiDimensionValuesQuery,
  DisaggregationPossibleValuesStatus,
  HfaTaxonomyForAI,
  MetricWithStatus,
  ResultsValueInfoForPresentationObject,
  RunAuthoringContext,
  RunHmisIndicator,
} from "../types/mod.ts";
import type { AIToolEnv } from "./env.ts";
import {
  describeIndicatorFacts,
  metricIdentityLines,
  periodCoverageLine,
} from "./format_metric_data_for_ai.ts";
import {
  formatValueForAI,
  type SearchForAI,
  searchForAI,
} from "./format_value_list_for_ai.ts";
import {
  AI_INLINE_LIST_MAX,
  AI_VALUE_PAGE_MAX,
  pageForAI,
} from "./read_bounds.ts";

// What the package states about each indicator of each family, joined to a
// dimension's values by id.
export type IndicatorFactsForAI = {
  hmisIndicators: RunAuthoringContext["hmisIndicators"];
  icehIndicators: RunAuthoringContext["icehIndicators"];
  hfaIndicators: HfaTaxonomyForAI["indicators"];
};

export const HMIS_INDICATOR_LINE_SHAPE =
  "id: label [format; direction; thresholds in display units; target] = formula over counts and population types (computed indicators only)";

// One HMIS indicator as the package block and get_dimension_values write it:
// the facts the package declares and nothing for a fact it lacks, so a legacy
// package's indicator reads `id: label`.
export function describeHmisIndicatorLine(ind: RunHmisIndicator): string {
  const facts = [
    ...(ind.format_as ? [ind.format_as] : []),
    ...describeIndicatorFacts(ind),
  ];
  return `${ind.id}: ${ind.label}${factsText(facts)}${
    ind.expression ? ` = ${ind.expression}` : ""
  }`;
}

function factsText(facts: string[]): string {
  return facts.length > 0 ? ` [${facts.join("; ")}]` : "";
}

type Value = { id: string; label: string };

// An indicator dimension writes each value on a line of its own with its
// facts, under a heading that names the line's shape; any other dimension
// writes its values on one line.
type ValueWriter = { lineShape?: string; write: (v: Value) => string };

function valueWriter(disOpt: string, facts: IndicatorFactsForAI): ValueWriter {
  if (disOpt === "indicator_common_id") {
    const byId = new Map(facts.hmisIndicators.map((i) => [i.id, i]));
    return {
      lineShape: HMIS_INDICATOR_LINE_SHAPE,
      write: (v) =>
        describeHmisIndicatorLine({
          ...byId.get(v.id),
          id: v.id,
          label: v.label,
        }),
    };
  }
  if (disOpt === "hfa_indicator") {
    const byId = new Map(facts.hfaIndicators.map((i) => [i.id, i]));
    return {
      lineShape:
        "id: label [measure; category; sub-category; service categories; variant group]",
      write: (v) => {
        const ind = byId.get(v.id);
        const indFacts = ind === undefined ? [] : [
          ...(ind.measure ? [ind.measure] : []),
          ...(ind.categoryId ? [`category ${ind.categoryId}`] : []),
          ...(ind.subCategoryId ? [`sub-category ${ind.subCategoryId}`] : []),
          ...(ind.serviceCategoryIds.length > 0
            ? [`service categories ${ind.serviceCategoryIds.join(", ")}`]
            : []),
          ...(ind.variantGroupId
            ? [`variant group ${ind.variantGroupId}`]
            : []),
        ];
        return `${v.id}: ${v.label}${factsText(indFacts)}`;
      },
    };
  }
  if (disOpt === "iceh_indicator") {
    const byId = new Map(facts.icehIndicators.map((i) => [i.id, i]));
    return {
      lineShape: "id: label [category]",
      write: (v) => {
        const category = byId.get(v.id)?.category;
        return `${v.id}: ${v.label}${
          factsText(category ? [`category ${category}`] : [])
        }`;
      },
    };
  }
  return { write: formatValueForAI };
}

function heading(
  disOpt: string,
  counts: string,
  writer: ValueWriter,
  rest: string,
): string {
  const shape = writer.lineShape === undefined
    ? ""
    : `, each line ${writer.lineShape}`;
  return `**${disOpt}** (${counts})${shape}${rest}`;
}

function body(lines: string[], writer: ValueWriter): string[] {
  return writer.lineShape === undefined
    ? [lines.join(", ")]
    : lines.map((line) => `- ${line}`);
}

function statusLine(
  disOpt: string,
  status: Exclude<DisaggregationPossibleValuesStatus, { status: "ok" }>,
): string {
  return status.status === "no_values_available"
    ? `**${disOpt}**: no values available.`
    : `**${disOpt}**: its values could not be read: ${status.message}`;
}

function countText(
  n: number,
  search: SearchForAI | undefined,
  matched: number,
): string {
  const values = `${n} value${n === 1 ? "" : "s"}`;
  return search === undefined
    ? values
    : `${values}; ${matched} match ${search.quoted}`;
}

function dimensionInListing(
  disOpt: string,
  status: DisaggregationPossibleValuesStatus,
  search: SearchForAI | undefined,
  facts: IndicatorFactsForAI,
): string[] {
  if (status.status !== "ok") {
    return [statusLine(disOpt, status)];
  }
  const writer = valueWriter(disOpt, facts);
  const lines = status.values.map(writer.write);
  const matched = search === undefined ? lines : lines.filter(search.matches);
  const counts = countText(lines.length, search, matched.length);
  if (search === undefined && lines.length > AI_INLINE_LIST_MAX) {
    return [
      `**${disOpt}** (${counts}): more than ${AI_INLINE_LIST_MAX} to write here; pass disOpt "${disOpt}" to list them, with search to find some.`,
    ];
  }
  if (matched.length === 0) {
    return [`**${disOpt}** (${counts})`];
  }
  if (matched.length > AI_INLINE_LIST_MAX) {
    return [
      heading(
        disOpt,
        counts,
        writer,
        `; the first ${AI_INLINE_LIST_MAX} are written, and disOpt "${disOpt}" with the same search lists them all:`,
      ),
      ...body(matched.slice(0, AI_INLINE_LIST_MAX), writer),
    ];
  }
  return [heading(disOpt, counts, writer, ":"), ...body(matched, writer)];
}

function dimensionInPages(
  disOpt: string,
  status: DisaggregationPossibleValuesStatus,
  search: SearchForAI | undefined,
  offset: number,
  facts: IndicatorFactsForAI,
): string[] {
  if (status.status !== "ok") {
    return [statusLine(disOpt, status)];
  }
  const writer = valueWriter(disOpt, facts);
  const lines = status.values.map(writer.write);
  const listed = search === undefined ? lines : lines.filter(search.matches);
  const page = pageForAI(
    listed,
    offset,
    AI_VALUE_PAGE_MAX,
    search === undefined ? "values" : "matching values",
  );
  const counts = countText(lines.length, search, listed.length);
  return page.entries.length === 0 ? [`**${disOpt}** (${counts})`] : [
    heading(disOpt, counts, writer, ":"),
    page.summary,
    ...body(page.entries, writer),
  ];
}

// get_dimension_values: the values of a metric's dimensions under the read's
// scope and no filter, every dimension with its count or one dimension in
// pages, searched by the copilot's terms over each value's line as written.
export function formatDimensionValuesForAI(
  metric: MetricWithStatus,
  valueInfo: ResultsValueInfoForPresentationObject,
  query: AiDimensionValuesQuery,
  facts: IndicatorFactsForAI,
): string {
  const search = query.search === undefined
    ? undefined
    : searchForAI(query.search);
  if (query.search !== undefined && search === undefined) {
    throw new AIToolFailure(
      `search ${
        JSON.stringify(query.search)
      } holds no word to match: give at least one term with a letter or digit.`,
    );
  }
  const head = [
    "# DIMENSION VALUES",
    "",
    ...metricIdentityLines(metric),
    periodCoverageLine(valueInfo.periodBounds ?? null),
    "",
    "Values under the read's scope, before any filter: a figure's own filters can leave fewer. A filter or selectedReplicant takes a value by its id, which is written before its label.",
    "",
  ];
  if (query.disOpt === undefined) {
    const dimensions = Object.entries(valueInfo.disaggregationPossibleValues)
      .flatMap(([disOpt, status]) =>
        status === undefined
          ? []
          : [dimensionInListing(disOpt, status, search, facts).join("\n")]
      );
    return [...head, dimensions.join("\n\n")].join("\n");
  }
  const status = valueInfo.disaggregationPossibleValues[query.disOpt];
  if (status === undefined) {
    throw new Error(
      `The value info of metric "${metric.id}" has no entry for its dimension "${query.disOpt}"`,
    );
  }
  return [
    ...head,
    ...dimensionInPages(query.disOpt, status, search, query.offset ?? 0, facts),
  ].join("\n");
}

export async function getDimensionValuesForAI(
  env: AIToolEnv,
  metrics: MetricWithStatus[],
  facts: IndicatorFactsForAI,
  query: AiDimensionValuesQuery,
): Promise<string> {
  const metric = metrics.find((m) => m.id === query.metricId);
  if (metric === undefined) {
    throw new AIToolFailure(
      `Metric "${query.metricId}" is not in this results package. get_available_metrics lists its metrics.`,
    );
  }
  if (metric.status !== "ready") {
    throw new AIToolFailure(
      `Metric "${metric.id}" has no data in this results package${
        metric.statusReason ? `: ${metric.statusReason}` : "."
      }`,
    );
  }
  if (query.offset !== undefined && query.disOpt === undefined) {
    throw new AIToolFailure(
      "offset pages one dimension's values: pass disOpt with it.",
    );
  }
  const dimensions = metric.disaggregationOptions.map((opt) => opt.value);
  if (query.disOpt !== undefined && !dimensions.includes(query.disOpt)) {
    throw new AIToolFailure(
      `Metric "${metric.id}" has no dimension "${query.disOpt}". Its dimensions: ${
        dimensions.join(", ")
      }.`,
    );
  }
  const res = await env.getResultsValueInfo(metric.id);
  if (!res.success) {
    throw new AIToolFailure(res.err);
  }
  return formatDimensionValuesForAI(metric, res.data, query, facts);
}
