import { ADMIN_LEVELS, type AdminLevel } from "./rollup.ts";
import type { TranslatableString } from "./translate/mod.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type {
  InstalledModuleSummary,
  MetricWithStatus,
} from "./types/modules.ts";
import type { RunAuthoringContext } from "./types/run_authoring_context.ts";

// The Explore page's bindings (SYSTEM_11 "Explore query model"): which views
// a module offers, which metric each reads, the roles it names and how each
// view type lays them out. Presentation is deployable and a manifest is
// frozen, so the bindings live here and not in the module definitions.

export type ExploreAxis = "area" | "unit" | "category" | "time" | "values";

export type ExploreViewType =
  | { type: "table"; rows: ExploreAxis; cols: ExploreAxis; values?: string[] }
  | { type: "timeseries"; series?: "unit"; values?: string[] }
  | {
    type: "chart";
    axis: "area" | "category";
    series?: "unit";
    values?: string[];
  }
  | { type: "map"; values?: string[] };

export type ExploreViewTypeId = ExploreViewType["type"];

export type ExploreLevel = "national" | AdminLevel;

// Shallowest first.
export const EXPLORE_LEVELS: readonly ExploreLevel[] = [
  "national",
  ...ADMIN_LEVELS,
];

export type ExploreSwitchOption = {
  id: string;
  label: TranslatableString;
  metricId: string;
};

export type ExploreMetricBinding =
  | { id: string }
  | { byLevel: Partial<Record<ExploreLevel, string>> }
  | { switch: { label: TranslatableString; options: ExploreSwitchOption[] } };

export type ExploreViewBinding = {
  id: string;
  label: TranslatableString;
  metric: ExploreMetricBinding;
  unit?: DisaggregationOption;
  category?: DisaggregationOption;
  facets?: DisaggregationOption[];
  types: ExploreViewType[];
};

export const EXPLORE_TYPE_LABELS: Record<
  ExploreViewTypeId,
  TranslatableString
> = {
  table: { en: "Table", fr: "Tableau", pt: "Tabela" },
  timeseries: {
    en: "Over time",
    fr: "Dans le temps",
    pt: "Ao longo do tempo",
  },
  chart: { en: "Chart", fr: "Graphique", pt: "Gráfico" },
  map: { en: "Map", fr: "Carte", pt: "Mapa" },
};

const AREA_BY_CATEGORY: ExploreViewType = {
  type: "table",
  rows: "area",
  cols: "category",
};
const AREA_BY_TIME: ExploreViewType = {
  type: "table",
  rows: "area",
  cols: "time",
};
const OVER_TIME: ExploreViewType = { type: "timeseries" };

// HFA results come observed, or with values carried forward from the round
// that last measured them.
const HFA_VALUES_LABEL: TranslatableString = {
  en: "Values",
  fr: "Valeurs",
  pt: "Valores",
};
const HFA_OBSERVED: TranslatableString = {
  en: "Observed",
  fr: "Observées",
  pt: "Observados",
};
const HFA_CARRIED: TranslatableString = {
  en: "With carry-forward",
  fr: "Avec valeurs reportées",
  pt: "Com valores transportados",
};
const HFA_VALUES_SWITCH: ExploreMetricBinding = {
  switch: {
    label: HFA_VALUES_LABEL,
    options: [
      { id: "observed", label: HFA_OBSERVED, metricId: "m10-01-01" },
      { id: "carried", label: HFA_CARRIED, metricId: "m10-01-02" },
    ],
  },
};

// Module id → its views in display order. The first type of a view is its
// default: the table wherever one exists.
export const EXPLORE_VIEWS: Record<string, ExploreViewBinding[]> = {
  m001: [
    {
      id: "outliers",
      label: {
        en: "Outliers",
        fr: "Valeurs aberrantes",
        pt: "Valores atípicos",
      },
      metric: { id: "m1-01-01" },
      category: "indicator_common_id",
      types: [AREA_BY_CATEGORY, OVER_TIME],
    },
    {
      id: "completeness",
      label: { en: "Completeness", fr: "Complétude", pt: "Completude" },
      metric: { id: "m1-02-02" },
      category: "indicator_common_id",
      types: [AREA_BY_CATEGORY, OVER_TIME],
    },
    {
      id: "consistency",
      label: {
        en: "Internal consistency",
        fr: "Cohérence interne",
        pt: "Coerência interna",
      },
      metric: { id: "m1-03-01" },
      category: "ratio_type",
      types: [AREA_BY_CATEGORY, OVER_TIME],
    },
    {
      id: "dqa_adequate",
      label: {
        en: "Facilities with adequate data quality",
        fr: "Établissements avec une qualité des données adéquate",
        pt: "Unidades sanitárias com qualidade de dados adequada",
      },
      metric: { id: "m1-04-01" },
      types: [AREA_BY_TIME, OVER_TIME],
    },
    {
      id: "dqa_mean",
      label: {
        en: "Mean data quality score",
        fr: "Score moyen de qualité des données",
        pt: "Pontuação média da qualidade dos dados",
      },
      metric: { id: "m1-04-02" },
      types: [AREA_BY_TIME, OVER_TIME],
    },
  ],
  m002: [
    {
      id: "adjustment_impact",
      label: {
        en: "Adjustment impact",
        fr: "Effet des ajustements",
        pt: "Impacto dos ajustes",
      },
      metric: {
        switch: {
          label: { en: "Adjustment", fr: "Ajustement", pt: "Ajuste" },
          options: [
            {
              id: "outliers",
              label: {
                en: "Outliers",
                fr: "Valeurs aberrantes",
                pt: "Valores atípicos",
              },
              metricId: "m2-01-01",
            },
            {
              id: "completeness",
              label: { en: "Completeness", fr: "Complétude", pt: "Completude" },
              metricId: "m2-01-02",
            },
            {
              id: "both",
              label: { en: "Both", fr: "Les deux", pt: "Ambos" },
              metricId: "m2-01-03",
            },
          ],
        },
      },
      category: "indicator_common_id",
      types: [AREA_BY_CATEGORY, OVER_TIME],
    },
  ],
  m005: [
    {
      id: "denominators",
      label: {
        en: "Denominator values",
        fr: "Valeurs des dénominateurs",
        pt: "Valores dos denominadores",
      },
      metric: { id: "m4a-01-01" },
      unit: "denominator",
      types: [{ type: "table", rows: "unit", cols: "time" }],
    },
    {
      id: "denominators_by_area",
      label: {
        en: "Denominator values by area",
        fr: "Valeurs des dénominateurs par zone",
        pt: "Valores dos denominadores por área",
      },
      metric: {
        byLevel: { admin_area_2: "m4a-01-02", admin_area_3: "m4a-01-03" },
      },
      facets: ["denominator"],
      types: [AREA_BY_TIME],
    },
    {
      id: "coverage_by_denominator",
      label: {
        en: "Coverage by denominator type",
        fr: "Couverture selon le type de dénominateur",
        pt: "Cobertura por tipo de denominador",
      },
      metric: {
        byLevel: {
          national: "m4a-02-01",
          admin_area_2: "m4a-02-02",
          admin_area_3: "m4a-02-03",
        },
      },
      unit: "denominator_best_or_survey",
      category: "indicator_common_id",
      types: [
        { type: "table", rows: "unit", cols: "category" },
        { type: "timeseries", series: "unit" },
      ],
    },
  ],
  m006: [
    {
      id: "coverage_over_time",
      label: {
        en: "Coverage over time",
        fr: "Couverture dans le temps",
        pt: "Cobertura ao longo do tempo",
      },
      metric: {
        byLevel: {
          national: "m6-01-01",
          admin_area_2: "m6-02-01",
          admin_area_3: "m6-03-01",
        },
      },
      category: "indicator_common_id",
      types: [OVER_TIME],
    },
    {
      id: "coverage_by_area",
      label: {
        en: "Coverage by area",
        fr: "Couverture par zone",
        pt: "Cobertura por área",
      },
      metric: {
        byLevel: { admin_area_2: "m6-02-01", admin_area_3: "m6-03-01" },
      },
      category: "indicator_common_id",
      types: [
        {
          type: "table",
          rows: "area",
          cols: "category",
          values: ["coverage_cov"],
        },
      ],
    },
  ],
  m010: [
    {
      id: "hfa_by_round",
      label: {
        en: "Indicators by survey round",
        fr: "Indicateurs par vague d'enquête",
        pt: "Indicadores por ronda de inquérito",
      },
      metric: HFA_VALUES_SWITCH,
      category: "hfa_indicator",
      facets: ["hfa_category"],
      types: [{ type: "table", rows: "category", cols: "time" }],
    },
    {
      id: "hfa_by_area",
      label: {
        en: "Indicators by area",
        fr: "Indicateurs par zone",
        pt: "Indicadores por área",
      },
      metric: HFA_VALUES_SWITCH,
      category: "hfa_indicator",
      facets: ["hfa_category"],
      types: [AREA_BY_CATEGORY],
    },
    {
      id: "hfa_variants",
      label: {
        en: "Indicators by variant item",
        fr: "Indicateurs par élément de variante",
        pt: "Indicadores por item de variante",
      },
      metric: {
        switch: {
          label: HFA_VALUES_LABEL,
          options: [
            { id: "observed", label: HFA_OBSERVED, metricId: "m10-03-01" },
            { id: "carried", label: HFA_CARRIED, metricId: "m10-03-02" },
          ],
        },
      },
      unit: "hfa_variant_item",
      category: "hfa_indicator",
      facets: ["hfa_category"],
      types: [{ type: "table", rows: "category", cols: "unit" }],
    },
    {
      id: "hfa_response",
      label: {
        en: "Don't-know and missing rates",
        fr: "Taux de « ne sait pas » et de valeurs manquantes",
        pt: "Taxas de « não sabe » e de valores em falta",
      },
      metric: {
        switch: {
          label: { en: "Rate", fr: "Taux", pt: "Taxa" },
          options: [
            {
              id: "dont_know",
              label: { en: "Don't know", fr: "Ne sait pas", pt: "Não sabe" },
              metricId: "m10-02-01",
            },
            {
              id: "missing",
              label: { en: "Missing", fr: "Manquant", pt: "Em falta" },
              metricId: "m10-02-02",
            },
          ],
        },
      },
      category: "hfa_indicator",
      facets: ["hfa_category"],
      types: [{ type: "table", rows: "category", cols: "time" }],
    },
  ],
  m011: [
    {
      id: "disruptions",
      label: {
        en: "Observed and expected services",
        fr: "Services observés et attendus",
        pt: "Serviços observados e esperados",
      },
      metric: { byLevel: { national: "m11-01-01", admin_area_2: "m11-01-02" } },
      category: "indicator_common_id",
      types: [OVER_TIME],
    },
  ],
  m012: [
    {
      id: "service_counts",
      label: {
        en: "Service counts",
        fr: "Volumes de services",
        pt: "Volumes de serviços",
      },
      metric: { id: "m12-01-01" },
      category: "indicator_common_id",
      types: [AREA_BY_CATEGORY, OVER_TIME],
    },
  ],
};

// Every non-hidden metric of a registry module that no binding reads, with
// the reason.
export const UNBOUND_METRICS: { metricId: string; reason: string }[] = [
  {
    metricId: "m6-02-02",
    reason:
      "Coverage (HMIS only) at admin area 2: its one value is the coverage_cov prop of m6-02-01, which coverage_by_area reads.",
  },
  {
    metricId: "m6-03-02",
    reason:
      "Coverage (HMIS only) at admin area 3: its one value is the coverage_cov prop of m6-03-01, which coverage_by_area reads.",
  },
];

export function boundMetricIds(metric: ExploreMetricBinding): string[] {
  if ("id" in metric) return [metric.id];
  if ("byLevel" in metric) {
    const byLevel = metric.byLevel;
    return EXPLORE_LEVELS.flatMap((level) => {
      const id = byLevel[level];
      return id === undefined ? [] : [id];
    });
  }
  return metric.switch.options.map((o) => o.metricId);
}

// A metric the package carries, stamped ready.
export function readyMetric(
  ctx: RunAuthoringContext,
  id: string,
): MetricWithStatus | undefined {
  const metric = ctx.metrics.find((m) => m.id === id);
  return metric?.status === "ready" ? metric : undefined;
}

// R7: a view is offered only for metrics the package carries: `{ id }`
// ready; `byLevel` and `switch` with at least one ready option.
export function viewsForModule(
  module: InstalledModuleSummary,
  ctx: RunAuthoringContext,
): ExploreViewBinding[] {
  return (EXPLORE_VIEWS[module.id] ?? []).filter((binding) =>
    boundMetricIds(binding.metric).some((id) =>
      readyMetric(ctx, id) !== undefined
    )
  );
}

// The key of every per-view state.
export function exploreViewKey(moduleId: string, viewId: string): string {
  return `${moduleId}/${viewId}`;
}
