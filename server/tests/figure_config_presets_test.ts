// The figure config against the module definitions of the local checkout
// (FASTR_MODULES_LOCAL_DIR): every preset and every config the Explore page
// derives converts, fits the schema and passes the metric checks; what the
// converted config derives equals what today's functions derive from the
// stored one, but for the cases the conversion means to change; the wizard's
// starting config passes for every metric and type; and two configs of one
// metric that read two queries hold two settings keys.
//
//   FASTR_MODULES_LOCAL_DIR=<modules repo> deno test -A --env-file server/tests/figure_config_presets_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  type FigureConfig,
  figureFetchConfig,
  get_PRESENTATION_SELECT_OPTIONS,
  type MetricWithStatus,
  settingsKey,
  startingFigureConfig,
  validateFigureConfig,
} from "lib";
import { canonical, compareWithToday } from "./_figure_config_comparison.ts";
import {
  exploreItems,
  type FigureConfigItem,
  metricsOf,
  presetItems,
} from "./_figure_config_sets.ts";
import { loadModuleDefinitions } from "./_module_definitions.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");

// Two configs read one query exactly when their fetch configs hold the same
// values, groups, filters, period filter and roll-up, each list as a set.
function fetchIdentity(config: FigureConfig, metric: MetricWithStatus): string {
  const fetch = figureFetchConfig(config, metric);
  return fetch.success
    ? canonical({
      ...fetch.data,
      values: fetch.data.values.map((v) => `${v.func}&${v.prop}`).sort(),
      groupBys: [...fetch.data.groupBys].sort(),
      filters: fetch.data.filters
        .map((f) => [f.disOpt, f.values.map(String).sort()])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    })
    : fetch.err;
}

Deno.test({
  name: "figure config: presets, Explore configs, starting configs",
  ignore: MODULES_DIR === undefined,
  async fn(t) {
    const definitions = await loadModuleDefinitions(MODULES_DIR ?? "");
    const metrics = metricsOf(definitions);
    const items = [
      ...presetItems(metrics),
      ...exploreItems(definitions, metrics),
    ];
    const converted = new Map<FigureConfigItem, FigureConfig>();

    await t.step(
      "every preset and Explore config converts, fits and passes",
      () => {
        assertEquals(presetItems(metrics).length, 50);
        assert(items.length > 200, `${items.length} configs`);
        const failures: string[] = [];
        for (const item of items) {
          const c = compareWithToday({
            metric: item.metric,
            config: item.config,
            singleValueDims: new Set(),
          });
          if (c.kind !== "converted") {
            failures.push(`${item.id}: ${c.kind} ${canonical(c)}`);
            continue;
          }
          converted.set(item, c.config);
          if (c.problems.length > 0) {
            failures.push(`${item.id}: ${canonical(c.problems)}`);
          }
          for (const d of c.differences) {
            if (
              d.listed !== "filteredDimGrouped" &&
              d.listed !== "valuePropsOnTwoAxesToday"
            ) {
              failures.push(
                `${item.id}: ${d.aspect} today ${d.today}, converted ${d.next}`,
              );
            }
          }
        }
        assertEquals(failures, []);
      },
    );

    await t.step("the starting config of every metric and type passes", () => {
      const failures: string[] = [];
      for (const metric of metrics) {
        const optional = metric.disaggregationOptions
          .filter((o) => !o.isRequired)
          .map((o) => o.value);
        for (
          const { value: type } of get_PRESENTATION_SELECT_OPTIONS(
            metric.disaggregationOptions,
          )
        ) {
          for (const chosen of [[], ...optional.map((dim) => [dim])]) {
            const config = startingFigureConfig(metric, type, chosen);
            const problems = validateFigureConfig(config, metric);
            if (problems.length > 0) {
              failures.push(
                `${metric.id} ${type} [${chosen}]: ${canonical(problems)}`,
              );
            }
          }
        }
      }
      assertEquals(failures, []);
    });

    await t.step(
      "two configs that read two queries hold two settings keys",
      () => {
        const byMetric = new Map<
          string,
          { item: FigureConfigItem; config: FigureConfig }[]
        >();
        for (const [item, config] of converted) {
          const list = byMetric.get(item.metric.id) ?? [];
          list.push({ item, config });
          byMetric.set(item.metric.id, list);
        }
        let pairs = 0;
        const failures: string[] = [];
        for (const [metricId, list] of byMetric) {
          const keyed = list.map(({ item, config }) => ({
            id: item.id,
            fetch: fetchIdentity(config, item.metric),
            key: settingsKey(metricId, config),
          }));
          for (let i = 0; i < keyed.length; i++) {
            for (let j = i + 1; j < keyed.length; j++) {
              if (keyed[i].fetch === keyed[j].fetch) continue;
              pairs++;
              if (keyed[i].key === keyed[j].key) {
                failures.push(`${keyed[i].id} and ${keyed[j].id}`);
              }
            }
          }
        }
        assert(pairs > 0);
        assertEquals(failures, []);
      },
    );
  },
});
