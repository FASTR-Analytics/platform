import {
  type DisaggregationOption,
  getDisaggregationAllowedPresentationOptions,
  type MetricDefinitionGithub,
  type MetricWithStatus,
  MODULE_REGISTRY,
  type ModuleDefinitionGithub,
  moduleDefinitionGithubSchema,
  type StructureColumns,
} from "lib";
import { deriveAvailableDisaggregationOptions } from "../runs/disaggregation_availability.ts";

// The module definitions of the local checkout (FASTR_MODULES_LOCAL_DIR), read
// as the loader reads them, and the metrics a package generated from them
// would carry in its authoring context: what the lockstep tests check the
// app's bindings and tables against.

export type ModuleDefinitions = Map<string, ModuleDefinitionGithub>;

export async function loadModuleDefinitions(
  dir: string,
): Promise<ModuleDefinitions> {
  const out: ModuleDefinitions = new Map();
  for (const entry of MODULE_REGISTRY) {
    const text = await Deno.readTextFile(`${dir}/${entry.id}/definition.json`);
    out.set(entry.id, moduleDefinitionGithubSchema.parse(JSON.parse(text)));
  }
  return out;
}

// The disaggregation options a metric's results object offers, from the
// columns its definition declares, as finalize would stamp them for a package
// with the given facility columns enabled (none by default).
export function availableOptionsOf(
  definition: ModuleDefinitionGithub,
  metric: MetricDefinitionGithub,
  facilityColumns?: StructureColumns,
): DisaggregationOption[] {
  const ro = definition.resultsObjects.find((r) =>
    r.id === metric.resultsObjectId
  );
  const columns =
    ro === undefined || ro.createTableStatementPossibleColumns === false
      ? []
      : Object.keys(ro.createTableStatementPossibleColumns);
  return deriveAvailableDisaggregationOptions(
    new Set(columns),
    facilityColumns,
  );
}

// Every facility column enabled: the widest package an instance can build.
export const EVERY_FACILITY_COLUMN: StructureColumns = {
  includeNames: false,
  includeTypes: true,
  includeOwnership: true,
  includeCustom1: true,
  includeCustom2: true,
  includeCustom3: true,
  includeCustom4: true,
  includeCustom5: true,
};

// Every metric of the definitions as the authoring context carries it, each
// ready, labelled in English, with the options its results object's columns
// give and no presets.
export function metricsWithStatusOf(
  definitions: ModuleDefinitions,
  facilityColumns?: StructureColumns,
): MetricWithStatus[] {
  return [...definitions.entries()].flatMap(([moduleId, def]) =>
    def.metrics.map((m): MetricWithStatus => {
      const available = availableOptionsOf(def, m, facilityColumns);
      return {
        id: m.id,
        moduleId,
        status: "ready",
        label: m.label.en,
        variantLabel: m.variantLabel?.en,
        formatAs: m.formatAs,
        valueProps: m.valueProps,
        valueFunc: m.valueFunc,
        valueLabelReplacements: m.valueLabelReplacements,
        postAggregationExpression: m.postAggregationExpression ?? undefined,
        catalogExpressionEvaluation: m.catalogExpressionEvaluation ?? undefined,
        resultsObjectId: m.resultsObjectId,
        datasetFamily: def.family,
        mostGranularTimePeriodColumnInResultsFile:
          available.includes("period_id")
            ? "period_id"
            : available.includes("quarter_id")
            ? "quarter_id"
            : available.includes("year")
            ? "year"
            : undefined,
        disaggregationOptions: available.map((value) => ({
          value,
          isRequired: m.requiredDisaggregationOptions.includes(value),
          allowedPresentationOptions:
            getDisaggregationAllowedPresentationOptions(value),
        })),
        vizPresets: [],
      };
    })
  );
}
