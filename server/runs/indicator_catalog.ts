// =============================================================================
// The run's indicator catalog — ONE derivation, two callers
// =============================================================================
//
// Composes IndicatorMetadata per module from the run's input mirrors. Called
// by the finalize writer (buildRunPackageIntoTmp, over the tmp dir it is
// building) and by the manifest transform block (over an existing package
// dir), so a stamped catalog and a recomputed one cannot disagree.
//
// The read path never calls it: getIndicatorMetadataFromRun is a manifest
// lookup. That is the point — this used to run per request, re-reading 5–8
// JSONs and re-sorting them in TS to replicate the DB ORDER BYs it replaced.
//
// Whatever this reads becomes a permanent part of the package format
// (PROTOCOL_APP_MIGRATIONS, "Recompute only"): the input mirrors listed below
// can never be dropped from a package.
//
// =============================================================================

import { z } from "zod";
import {
  composeHfaIndicatorLabel,
  getDatasetTypes,
  getHfaIndicatorMeasure,
  ICEH_STRAT_INFO,
  type HfaIndicatorAggregation,
  type HfaIndicatorType,
  type IndicatorMetadata,
  type RunModule,
  type RunModuleIndicators,
} from "lib";
import { runInputFilePath } from "./run_paths.ts";

const hfaIndicatorRow = z.object({
  var_name: z.string(),
  short_label: z.string(),
  definition: z.string(),
  type: z.string(),
  aggregation: z.string(),
  sort_order: z.number(),
});

const labeledRow = z.object({
  id: z.string(),
  label: z.string(),
  sort_order: z.number(),
});

const icehIndicatorRow = z.object({
  iceh_indicator: z.string(),
  indicator_name: z.string(),
  category: z.string(),
  sort_order: z.number(),
});

const indicatorRow = z.object({
  indicator_common_id: z.string().nullable(),
  indicator_common_label: z.string().nullable(),
});

const calculatedIndicatorRow = z.object({
  calculated_indicator_id: z.string(),
  label: z.string(),
  group_label: z.string(),
  sort_order: z.number(),
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  threshold_direction: z.enum(["higher_is_better", "lower_is_better"]),
  threshold_green: z.number(),
  threshold_yellow: z.number(),
});

// HFA dimensions whose values are labelled but carry no format: categories,
// sub-categories, service categories, and the variant items that label the
// hfa_variant_item column. Files absent from a package predate the feature
// that added them and yield no rows.
const HFA_LABEL_ONLY_FILES = [
  "hfa_indicator_categories_snapshot.json",
  "hfa_indicator_sub_categories_snapshot.json",
  "hfa_indicator_service_categories_snapshot.json",
  "hfa_indicator_variant_items_snapshot.json",
];

// Reads one input mirror; yields no rows when the package does not carry it.
export type RunInputRowsReader = <T>(
  fileName: string,
  rowSchema: z.ZodType<T>,
) => Promise<T[]>;

export async function buildRunIndicatorCatalog(
  modules: RunModule[],
  readRows: RunInputRowsReader,
): Promise<RunModuleIndicators[]> {
  const catalog: RunModuleIndicators[] = [];
  for (const mod of modules) {
    catalog.push({
      moduleId: mod.id,
      indicators: await deriveIndicatorMetadata(mod.moduleDefinition, readRows),
    });
  }
  return catalog;
}

async function deriveIndicatorMetadata(
  moduleDefinition: string,
  readRows: RunInputRowsReader,
): Promise<IndicatorMetadata[]> {
  const metadata: IndicatorMetadata[] = [];

  const datasetTypes = getDatasetTypes(moduleDefinition);
  const isHfaModule = isHfaScriptGeneration(moduleDefinition);
  const isIcehModule = datasetTypes.includes("iceh");

  if (isHfaModule) {
    const hfaIndicators = (
      await readRows("hfa_indicators_snapshot.json", hfaIndicatorRow)
    ).sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.var_name.localeCompare(b.var_name),
    );
    for (const row of hfaIndicators) {
      metadata.push({
        id: row.var_name,
        label: composeHfaIndicatorLabel(
          { shortLabel: row.short_label, definition: row.definition },
          "compact",
        ),
        format_as: getHfaIndicatorMeasure(
          row.type as HfaIndicatorType,
          row.aggregation as HfaIndicatorAggregation,
        ).kind,
        sort_order: row.sort_order,
      });
    }
    for (const fileName of HFA_LABEL_ONLY_FILES) {
      const rows = (await readRows(fileName, labeledRow)).sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      );
      for (const row of rows) {
        metadata.push({
          id: row.id,
          label: row.label,
          sort_order: row.sort_order,
        });
      }
    }
    return metadata;
  }

  if (isIcehModule) {
    const icehIndicators = (
      await readRows("iceh_indicators_snapshot.json", icehIndicatorRow)
    ).sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.iceh_indicator.localeCompare(b.iceh_indicator),
    );
    for (const ind of icehIndicators) {
      metadata.push({
        id: ind.iceh_indicator,
        label: ind.indicator_name,
        format_as: "percent",
        group_label: ind.category,
        sort_order: ind.sort_order,
      });
    }
    for (const [stratCode, info] of Object.entries(ICEH_STRAT_INFO)) {
      metadata.push({
        id: stratCode,
        label: info.label,
        sort_order: info.sortOrder,
      });
      if (info.levels) {
        for (const [levelCode, levelLabel] of Object.entries(info.levels)) {
          metadata.push({ id: levelCode, label: levelLabel });
        }
      }
    }
    return metadata;
  }

  const rawIndicators = await readRows("indicators.json", indicatorRow);
  for (const ind of rawIndicators) {
    if (ind.indicator_common_id && ind.indicator_common_label) {
      metadata.push({
        id: ind.indicator_common_id,
        label: ind.indicator_common_label,
      });
    }
  }

  // Calculated indicators override a raw indicator of the same id, so this
  // merges by id rather than appending.
  const snapshot = (
    await readRows(
      "calculated_indicators_snapshot.json",
      calculatedIndicatorRow,
    )
  ).sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.calculated_indicator_id.localeCompare(b.calculated_indicator_id),
  );
  const metadataById = new Map(metadata.map((m) => [m.id, m]));
  for (const ci of snapshot) {
    metadataById.set(ci.calculated_indicator_id, {
      id: ci.calculated_indicator_id,
      label: ci.label,
      format_as: ci.format_as,
      threshold_direction: ci.threshold_direction,
      threshold_green: ci.threshold_green,
      threshold_yellow: ci.threshold_yellow,
      group_label: ci.group_label,
      sort_order: ci.sort_order,
    });
  }
  return Array.from(metadataById.values());
}

function isHfaScriptGeneration(moduleDefinition: string): boolean {
  try {
    return JSON.parse(moduleDefinition).scriptGenerationType === "hfa";
  } catch {
    return false;
  }
}

// The two failure classes of an input mirror, kept apart on purpose — they sit
// on opposite sides of the PROTOCOL_APP_MIGRATIONS failure table.
//
// RunInputReadError: the BYTES are unavailable — the listed file is missing or
// unreadable, or what is there is not valid JSON. That is an operational fault
// of the package (half-restored backup, truncated write), not invalid data and
// not a code defect. The boot/read path catches it and funnels it into the
// `unreadable` outcome — package unavailable, boot proceeds.
//
// RunInputRowSchemaError: the bytes ARE valid JSON but do not match the row
// schema this file's rows are read with. That is shape drift — a row schema in
// this file changed without a migration — so it is a code defect and must
// fail-stop boot exactly as a manifest Zod failure does. Nothing catches it.
export class RunInputReadError extends Error {
  constructor(fileName: string, cause: string) {
    super(`input mirror ${fileName} could not be read (${cause})`);
  }
}

export class RunInputRowSchemaError extends Error {
  constructor(fileName: string, issues: z.ZodIssue[]) {
    super(
      `input mirror ${fileName} does not match its row schema — ${
        describeIssues(issues)
      }`,
    );
  }
}

// Named paths, bounded: a drifted mirror can carry an issue per row, and the
// first few name the offending field just as well as ten thousand do.
function describeIssues(issues: z.ZodIssue[]): string {
  const shown = issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  const rest = issues.length - 3;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

// A reader over a package directory on disk — the writer's tmp dir or an
// existing package. `inputFiles` is the manifest's own list, so a mirror the
// package does not carry is skipped without a stat.
export function runDirInputRowsReader(
  runDir: string,
  inputFiles: string[],
): RunInputRowsReader {
  return async <T>(fileName: string, rowSchema: z.ZodType<T>) => {
    if (!inputFiles.includes(`inputs/${fileName}`)) {
      return [] as T[];
    }
    let raw: string;
    try {
      raw = await Deno.readTextFile(runInputFilePath(runDir, fileName));
    } catch (e) {
      throw new RunInputReadError(fileName, errorText(e));
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      throw new RunInputReadError(fileName, `not valid JSON: ${errorText(e)}`);
    }
    const rows = z.array(rowSchema).safeParse(json);
    if (!rows.success) {
      throw new RunInputRowSchemaError(fileName, rows.error.issues);
    }
    return rows.data;
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
