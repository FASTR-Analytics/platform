// The lockstep guard for the Explore bindings (R15). The pure checks always
// run; the checks against the module definitions need the local modules
// checkout (FASTR_MODULES_LOCAL_DIR) and are skipped otherwise:
//
//   deno test -A --env-file server/tests/explore_views_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ADMIN_LEVELS,
  type DisaggregationOption,
  getDisaggregationAllowedPresentationOptions,
  type MetricDefinitionGithub,
  type MetricWithStatus,
  MODULE_REGISTRY,
  type ModuleDefinitionGithub,
  moduleDefinitionGithubSchema,
  type RunAuthoringContext,
} from "lib";
import {
  deriveViewConfig,
  type ExplorePossibleValues,
  resolveView,
} from "../../lib/explore_query.ts";
import {
  boundMetricIds,
  EXPLORE_LEVELS,
  EXPLORE_VIEWS,
  type ExploreViewBinding,
  type ExploreViewType,
  UNBOUND_METRICS,
} from "../../lib/explore_views.ts";
import { deriveAvailableDisaggregationOptions } from "../runs/disaggregation_availability.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");

const BINDINGS: { moduleId: string; binding: ExploreViewBinding }[] = Object
  .entries(EXPLORE_VIEWS).flatMap(([moduleId, bindings]) =>
    bindings.map((binding) => ({ moduleId, binding }))
  );

function laysOutArea(type: ExploreViewType): boolean {
  switch (type.type) {
    case "table":
      return type.rows === "area" || type.cols === "area";
    case "chart":
      return type.axis === "area";
    case "map":
      return true;
    case "timeseries":
      return false;
  }
}

function axesOf(type: ExploreViewType): string[] {
  switch (type.type) {
    case "table":
      return [type.rows, type.cols];
    case "chart":
      return [type.axis, ...(type.series === undefined ? [] : [type.series])];
    case "timeseries":
      return type.series === undefined ? [] : [type.series];
    case "map":
      return [];
  }
}

// Pure checks

Deno.test("bindings: view ids are unique per module and every view has a type", () => {
  for (const [moduleId, bindings] of Object.entries(EXPLORE_VIEWS)) {
    const ids = bindings.map((b) => b.id);
    assertEquals(
      new Set(ids).size,
      ids.length,
      `${moduleId} repeats a view id`,
    );
    for (const b of bindings) {
      assert(b.types.length > 0, `${moduleId}/${b.id} offers no type`);
      const types = b.types.map((t) => t.type);
      assertEquals(
        new Set(types).size,
        types.length,
        `${moduleId}/${b.id} repeats a type`,
      );
    }
  }
});

Deno.test("bindings: every axis names a role the view has, and rows differ from cols", () => {
  for (const { moduleId, binding } of BINDINGS) {
    const where = `${moduleId}/${binding.id}`;
    for (const type of binding.types) {
      if (type.type === "table") {
        assert(type.rows !== type.cols, `${where} table lays one axis twice`);
      }
      for (const axis of axesOf(type)) {
        if (axis === "unit") {
          assert(binding.unit !== undefined, `${where} lays out no unit`);
        }
        if (axis === "category") {
          assert(
            binding.category !== undefined,
            `${where} lays out no category`,
          );
        }
      }
    }
  }
});

Deno.test("bindings: a type's values are non-empty, and one when the unit is the series", () => {
  for (const { moduleId, binding } of BINDINGS) {
    for (const type of binding.types) {
      const where = `${moduleId}/${binding.id}/${type.type}`;
      if (type.values !== undefined) {
        assert(type.values.length > 0, `${where} names no value`);
      }
      if (
        type.type !== "table" && type.type !== "map" && type.series === "unit"
      ) {
        assert(
          type.values === undefined || type.values.length === 1,
          `${where} puts the unit on the series with several values`,
        );
      }
    }
  }
});

Deno.test("bindings: a byLevel view with a national key never lays the area out", () => {
  for (const { moduleId, binding } of BINDINGS) {
    if (
      "byLevel" in binding.metric &&
      binding.metric.byLevel.national !== undefined
    ) {
      assert(
        binding.types.every((t) => !laysOutArea(t)),
        `${moduleId}/${binding.id} lays the area out with a national option`,
      );
    }
  }
});

Deno.test("bindings: the over-time type is never bound on HFA", () => {
  for (const binding of EXPLORE_VIEWS["m010"] ?? []) {
    assert(
      binding.types.every((t) => t.type !== "timeseries"),
      `m010/${binding.id} offers the over-time type`,
    );
  }
});

// Checks against the module definitions

type Definitions = Map<string, ModuleDefinitionGithub>;

async function loadDefinitions(dir: string): Promise<Definitions> {
  const out: Definitions = new Map();
  for (const entry of MODULE_REGISTRY) {
    const text = await Deno.readTextFile(`${dir}/${entry.id}/definition.json`);
    out.set(entry.id, moduleDefinitionGithubSchema.parse(JSON.parse(text)));
  }
  return out;
}

function metricOf(
  definitions: Definitions,
  moduleId: string,
  metricId: string,
): MetricDefinitionGithub | undefined {
  return definitions.get(moduleId)?.metrics.find((m) => m.id === metricId);
}

function availableOptions(
  definition: ModuleDefinitionGithub,
  metric: MetricDefinitionGithub,
): DisaggregationOption[] {
  const ro = definition.resultsObjects.find((r) =>
    r.id === metric.resultsObjectId
  );
  const columns =
    ro === undefined || ro.createTableStatementPossibleColumns === false
      ? []
      : Object.keys(ro.createTableStatementPossibleColumns);
  return deriveAvailableDisaggregationOptions(new Set(columns), undefined);
}

function isTimeBased(dim: DisaggregationOption): boolean {
  return getDisaggregationAllowedPresentationOptions(dim) !== undefined;
}

// The authoring context the definitions describe, every metric ready, with
// one dummy value in every dictionary so each pin resolves.
function contextOf(definitions: Definitions): RunAuthoringContext {
  const modules = [...definitions.entries()].map(([id, def]) => ({
    id,
    label: def.label.en,
    family: def.family,
    tier: def.tier,
    sortOrder: def.sortOrder,
    hasParameters: false,
    lastRunAt: null,
    moduleDefinitionResultsObjectIds: def.resultsObjects.map((r) => r.id),
  }));
  const metrics: MetricWithStatus[] = [...definitions.entries()].flatMap((
    [moduleId, def],
  ) =>
    def.metrics.map((m): MetricWithStatus => {
      const available = availableOptions(def, m);
      return {
        id: m.id,
        moduleId,
        status: "ready",
        label: m.label.en,
        formatAs: m.formatAs,
        valueProps: m.valueProps,
        valueFunc: m.valueFunc,
        resultsObjectId: m.resultsObjectId,
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
  return {
    runId: "run",
    scopeToken: "token",
    modules,
    metrics,
    datasets: [],
    hmisIndicators: [{ id: "x", label: "x" }],
    icehIndicators: [{ id: "x", label: "x", category: "x" }],
    hfaTaxonomy: { indicators: [{ id: "x", label: "x", categoryId: "x" }] },
    presets: [],
    population: null,
  } as unknown as RunAuthoringContext;
}

const EVERY_VALUE: ExplorePossibleValues = Object.fromEntries(
  (
    [
      ...ADMIN_LEVELS,
      "indicator_common_id",
      "year",
      "month",
      "quarter_id",
      "period_id",
      "denominator",
      "denominator_best_or_survey",
      "source_indicator",
      "target_population",
      "ratio_type",
      "hfa_indicator",
      "hfa_variant_item",
      "hfa_category",
      "hfa_sub_category",
      "hfa_service_category",
      "time_point",
      "iceh_indicator",
      "strat",
      "level",
    ] satisfies DisaggregationOption[]
  ).map((dim) => [dim, { status: "ok", values: [{ id: "x", label: "x" }] }]),
);

// Every (switch option, level) a binding can read under, as view choices
// and a family query.
function variantsOf(binding: ExploreViewBinding) {
  const metric = binding.metric;
  if ("switch" in metric) {
    return metric.switch.options.map((o) => ({
      name: o.id,
      choices: { pinned: {}, switch: o.id },
      level: undefined,
    }));
  }
  if ("byLevel" in metric) {
    return EXPLORE_LEVELS.filter((l) => metric.byLevel[l] !== undefined).map((
      l,
    ) => ({ name: l, choices: { pinned: {} }, level: l }));
  }
  return [{ name: metric.id, choices: { pinned: {} }, level: undefined }];
}

Deno.test({
  name: "bindings: against the module definitions",
  ignore: MODULES_DIR === undefined,
  async fn(t) {
    const definitions = await loadDefinitions(MODULES_DIR ?? "");
    const ctx = contextOf(definitions);

    await t.step("every bound module is a registry module", () => {
      for (const moduleId of Object.keys(EXPLORE_VIEWS)) {
        assert(definitions.has(moduleId), `${moduleId} is not in the registry`);
      }
    });

    await t.step(
      "every bound metric exists in its module and is not hidden",
      () => {
        for (const { moduleId, binding } of BINDINGS) {
          for (const id of boundMetricIds(binding.metric)) {
            const metric = metricOf(definitions, moduleId, id);
            assert(
              metric !== undefined,
              `${moduleId}/${binding.id} reads ${id}, which ${moduleId} lacks`,
            );
            assert(
              !metric.hide,
              `${moduleId}/${binding.id} reads the hidden ${id}`,
            );
          }
        }
      },
    );

    await t.step(
      "every role dimension is a column of the metric's results object",
      () => {
        for (const { moduleId, binding } of BINDINGS) {
          const def = definitions.get(moduleId);
          if (def === undefined) continue;
          const where = `${moduleId}/${binding.id}`;
          const roles: DisaggregationOption[] = [
            ...(binding.unit === undefined ? [] : [binding.unit]),
            ...(binding.category === undefined ? [] : [binding.category]),
            ...(binding.facets ?? []),
          ];
          const timeColumn: DisaggregationOption = def.family === "hfa"
            ? "time_point"
            : "year";
          const levelOf = (id: string): DisaggregationOption | undefined =>
            "byLevel" in binding.metric
              ? EXPLORE_LEVELS.find((l) =>
                "byLevel" in binding.metric &&
                binding.metric.byLevel[l] === id &&
                l !== "national"
              ) as DisaggregationOption | undefined
              : undefined;
          for (const id of boundMetricIds(binding.metric)) {
            const metric = metricOf(definitions, moduleId, id);
            if (metric === undefined) continue;
            const available = availableOptions(def, metric);
            for (const dim of roles) {
              assert(
                available.includes(dim),
                `${where}: ${id} has no ${dim} column`,
              );
            }
            assert(
              available.includes(timeColumn),
              `${where}: ${id} has no ${timeColumn} column`,
            );
            const level = levelOf(id);
            if (level !== undefined) {
              assert(
                available.includes(level),
                `${where}: ${id} has no ${level} column`,
              );
            } else if (binding.types.some(laysOutArea)) {
              assert(
                ADMIN_LEVELS.some((l) => available.includes(l)),
                `${where}: ${id} has no admin area column to lay out`,
              );
            }
          }
        }
      },
    );

    await t.step(
      "every required non-time dimension is grouped, with at most one replicant per type",
      () => {
        for (const { moduleId, binding } of BINDINGS) {
          const def = definitions.get(moduleId);
          if (def === undefined) continue;
          for (const type of binding.types) {
            for (const variant of variantsOf(binding)) {
              const where =
                `${moduleId}/${binding.id}/${type.type}/${variant.name}`;
              const view = resolveView({
                binding,
                family: def.family,
                type: type.type,
                query: {
                  ...(variant.level === undefined
                    ? {}
                    : { level: variant.level }),
                  indicators: [],
                  period: { kind: "values", values: [] },
                  grain: "period_id",
                },
                choices: variant.choices,
                scopeArea: null,
                ctx,
                possibleValues: EVERY_VALUE,
              });
              assert(view !== undefined, `${where} resolves no view`);
              const derived = deriveViewConfig(view, "en");
              assert(derived !== undefined, `${where} derives no config`);
              const d = derived.config.d;
              const grouped = new Set<string>([
                ...d.disaggregateBy.map((e) => e.disOpt),
                ...(d.timeseriesGrouping === undefined
                  ? []
                  : [d.timeseriesGrouping]),
              ]);
              const metric = metricOf(definitions, moduleId, derived.metric.id);
              for (const dim of metric?.requiredDisaggregationOptions ?? []) {
                if (isTimeBased(dim)) continue;
                assert(
                  grouped.has(dim),
                  `${where} reads ${derived.metric.id} without its required ${dim}`,
                );
              }
              const replicants = d.disaggregateBy.filter((e) =>
                e.disDisplayOpt === "replicant"
              );
              assert(
                replicants.length <= 1,
                `${where} needs ${replicants.length} replicants`,
              );
            }
          }
        }
      },
    );

    await t.step("an over-time type's metric has a period column", () => {
      for (const { moduleId, binding } of BINDINGS) {
        const def = definitions.get(moduleId);
        if (
          def === undefined ||
          !binding.types.some((t) => t.type === "timeseries")
        ) {
          continue;
        }
        for (const id of boundMetricIds(binding.metric)) {
          const metric = metricOf(definitions, moduleId, id);
          if (metric === undefined) continue;
          const available = availableOptions(def, metric);
          assert(
            ["period_id", "quarter_id", "year"].some((c) =>
              available.includes(c as DisaggregationOption)
            ),
            `${moduleId}/${binding.id}: ${id} has no period column for the over-time type`,
          );
        }
      }
    });

    await t.step(
      "every non-hidden metric of a bound module is bound or listed unbound",
      () => {
        const bound = new Set(
          BINDINGS.flatMap((b) => boundMetricIds(b.binding.metric)),
        );
        const unbound = new Set(UNBOUND_METRICS.map((u) => u.metricId));
        for (const moduleId of Object.keys(EXPLORE_VIEWS)) {
          for (const metric of definitions.get(moduleId)?.metrics ?? []) {
            if (metric.hide) continue;
            assert(
              bound.has(metric.id) || unbound.has(metric.id),
              `${moduleId}: ${metric.id} is neither bound nor listed in UNBOUND_METRICS`,
            );
          }
        }
        for (const u of UNBOUND_METRICS) {
          const metric = [...definitions.values()].flatMap((d) => d.metrics)
            .find((m) => m.id === u.metricId);
          assert(
            metric !== undefined && !metric.hide,
            `UNBOUND_METRICS names ${u.metricId}, which no module has`,
          );
          assert(
            !bound.has(u.metricId),
            `UNBOUND_METRICS names the bound ${u.metricId}`,
          );
          assert(
            u.reason.length > 0,
            `UNBOUND_METRICS gives ${u.metricId} no reason`,
          );
        }
      },
    );
  },
});
