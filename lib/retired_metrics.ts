import type { TranslatableString } from "@timroberton/panther";
import { FACILITY_ROLLUP_COLUMNS } from "./rollup.ts";
import type { Language } from "./translate/mod.ts";
import type { FigureBundle } from "./types/_figure_bundle.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { MetricWithStatus } from "./types/modules.ts";

// Metrics of modules that left the registry (m003 and m004) while figures
// built on them live on in stored documents. A stored figure is `{ metricId, config }` frozen with
// its data, so a retired id keeps rendering; what it cannot do is UPDATE to a
// package that lacks its module. Each entry names the metric that answers the
// same question in a current package and how a config carries across: the
// value props it renames, the chart mode it swaps, and the preset-authored
// texts it replaces. Every path that resolves a stored figure's metric against
// a package goes through resolveFigureMetric, so the transition is one rule.
//
// Frozen vocabulary: the ids, labels and preset texts below are what the
// retired definitions said when they last shipped, kept because stored
// documents still carry them. Nothing here reads the modules repo.

type ValuePropRenames = Readonly<Record<string, string>>;

type TextSwap = Readonly<{
  from: TranslatableString;
  to: TranslatableString | null;
}>;

type Successor = Readonly<{
  metricId: string;
  moduleId: string;
  // A value filter entry is renamed through this map and dropped when the
  // successor has no counterpart.
  valueProps: ValuePropRenames;
  // The retired module's disruptions chart is the successor's band chart.
  bandChart?: true;
  // Preset-authored captions and footnotes of the retired metric, with the
  // text the successor's preset carries instead. A stored text is replaced
  // only when it equals one of these, in any language, and only by a text in
  // the figure's own language: a user's own words are kept, and so is a
  // translation the successor lacks.
  texts: readonly TextSwap[];
}>;

export type RetiredMetric = Readonly<{
  id: string;
  moduleId: string;
  moduleLabel: TranslatableString;
  label: TranslatableString;
  successor: (config: PresentationObjectConfig) => Successor;
}>;

const M003_LABEL: TranslatableString = {
  en: "M3. Service utilization",
  fr: "M3. Utilisation des services",
  pt: "M3. Utilização dos serviços",
};

const DATE_RANGE: TranslatableString = {
  en: "DATE_RANGE",
  fr: "PLAGE_DE_DATES",
  pt: "INTERVALO_DE_DATAS",
};

// m3-01-01 summed one of four adjustment bases per figure. A figure showing
// one basis becomes the indicator value on the package's own basis (m012); a
// figure comparing bases keeps the four props on the adjusted data (m002), as
// does one grouped or filtered by a facility column, which only the adjusted
// data's results object carries (it alone has facility_id).
const M12_INDICATOR_VALUE: Successor = {
  metricId: "m12-01-01",
  moduleId: "m012",
  valueProps: {},
  texts: [
    {
      from: {
        en: "Service utilization over time",
        fr: "Utilisation des services dans le temps",
        pt: "Utilização dos serviços ao longo do tempo",
      },
      to: {
        en: "Indicator values over time",
        fr: "Valeurs des indicateurs dans le temps",
        pt: "Valores dos indicadores ao longo do tempo",
      },
    },
    {
      from: {
        en: "Service volume by quarter & quarter-on-quarter change",
        fr:
          "Volume de services par trimestre et variation trimestre par trimestre",
        pt: "Volume de serviços por trimestre e variação trimestre a trimestre",
      },
      to: {
        en: "Indicator values by quarter and quarter-on-quarter change",
        fr:
          "Valeurs des indicateurs par trimestre et variation trimestre par trimestre",
        pt:
          "Valores dos indicadores por trimestre e variação trimestre a trimestre",
      },
    },
    {
      from: {
        en: "Service volume by year & year-on-year change",
        fr: "Volume de services par année et variation d'une année sur l'autre",
        pt: "Volume de serviços por ano e variação de um ano para o outro",
      },
      to: {
        en: "Indicator values by year and year-on-year change",
        fr:
          "Valeurs des indicateurs par année et variation d'une année sur l'autre",
        pt: "Valores dos indicadores por ano e variação de um ano para o outro",
      },
    },
    {
      from: {
        en: "Yearly volume is adjusted for both outliers and completeness.",
        fr:
          "Le volume annuel est ajusté à la fois pour les valeurs aberrantes et la complétude.",
        pt:
          "O volume anual é ajustado tanto para valores atípicos como para a completude.",
      },
      to: null,
    },
    {
      from: {
        en: "Service volume is adjusted for outliers.",
        fr: "Le volume de services est ajusté pour les valeurs aberrantes.",
        pt: "O volume de serviços é ajustado para valores atípicos.",
      },
      to: null,
    },
    {
      from: {
        en: "Yearly volume is adjusted for outliers.",
        fr: "Le volume annuel est ajusté pour les valeurs aberrantes.",
        pt: "O volume anual é ajustado para valores atípicos.",
      },
      to: null,
    },
  ],
};

const M2_VOLUME_BY_ADJUSTMENT: Successor = {
  metricId: "m2-02-01",
  moduleId: "m002",
  valueProps: {
    count_final_none: "count_final_none",
    count_final_outliers: "count_final_outliers",
    count_final_completeness: "count_final_completeness",
    count_final_both: "count_final_both",
  },
  texts: [],
};

const BAND_CHART_CAPTION: TranslatableString = {
  en: "Observed vs expected services with 95% credible interval",
  fr: "Services observés vs attendus avec intervalle de crédibilité à 95%",
};

const DISRUPTIONS_FOOTNOTE: TranslatableString = {
  en:
    "This graph quantifies changes in service volume compared to historical trends and accounting for seasonality. These signals should be triangulated to other data and contextual knowledge to determine if the results are an artifact of data quality. Unexpected volume changes are estimated by comparing the observed volume to the expected volume based on historical trends and seasonality. Previous large unexpected changes in the historical data are removed. This analysis is an interrupted time series regression with facility-level fixed effects.",
  fr:
    "Ce graphique quantifie les changements du volume de services par rapport aux tendances historiques et en tenant compte de la saisonnalité. Ces signaux doivent être triangulés avec d'autres données et connaissances contextuelles pour déterminer si les résultats sont un artefact de la qualité des données. Les changements de volume inattendus sont estimés en comparant le volume observé au volume attendu basé sur les tendances historiques et la saisonnalité. Les grands changements inattendus précédents dans les données historiques sont supprimés. Cette analyse est une régression de séries temporelles interrompues avec effets fixes au niveau de l'établissement.",
  pt:
    "Este gráfico quantifica as alterações no volume de serviços em comparação com as tendências históricas e tendo em conta a sazonalidade. Estes sinais devem ser triangulados com outros dados e conhecimento contextual para determinar se os resultados são um artefacto da qualidade dos dados. As alterações de volume inesperadas são estimadas comparando o volume observado com o volume esperado com base nas tendências históricas e na sazonalidade. As grandes alterações inesperadas anteriores nos dados históricos são removidas. Esta análise é uma regressão de séries temporais interrompidas com efeitos fixos ao nível do estabelecimento.",
};

// m3-0x-01 plotted the actual count against the expected count where the two
// differed by more than a threshold. The band chart of the same level plots
// observed and expected with the credible band; it needs all four props, so a
// value filter is dropped while the chart is on.
function bandChart(level: 1 | 2 | 3 | 4): Successor {
  return {
    metricId: `m11-01-0${level}`,
    moduleId: "m011",
    valueProps: {
      count_sum: "observed",
      count_expected_if_above_diff_threshold: "expected",
    },
    bandChart: true,
    texts: [
      {
        from: {
          en: "Disruptions and surpluses in service volume, nationally",
          fr:
            "Perturbations et excédents du volume de services, au niveau national",
          pt:
            "Perturbações e excedentes no volume de serviços, a nível nacional",
        },
        to: BAND_CHART_CAPTION,
      },
      {
        from: {
          en: "Disruptions and surpluses in service volume, sub-nationally",
          fr:
            "Perturbations et excédents du volume de services, au niveau sous-national",
          pt:
            "Perturbações e excedentes no volume de serviços, a nível subnacional",
        },
        to: BAND_CHART_CAPTION,
      },
      { from: DISRUPTIONS_FOOTNOTE, to: null },
    ],
  };
}

const DISRUPTION_FOOTNOTE: TranslatableString = {
  en:
    "Negative values indicate fewer services than expected. The expected value is the Bayesian model's estimate from trend and seasonality for the facilities that reported in the month.",
  fr:
    "Les valeurs négatives indiquent moins de services qu'attendu. La valeur attendue est l'estimation du modèle bayésien à partir de la tendance et de la saisonnalité pour les établissements ayant rapporté dans le mois.",
};

function disruptionMapSubCaption(level: 2 | 3): TextSwap {
  return {
    from: {
      en:
        `Percentage difference between actual and expected service volume by Admin Area ${level}, DATE_RANGE`,
      fr:
        `Différence en pourcentage entre le volume de services réel et attendu par Zone administrative ${level}, PLAGE_DE_DATES`,
      pt:
        `Diferença percentual entre o volume de serviços real e esperado por Área administrativa ${level}, INTERVALO_DE_DATAS`,
    },
    to: {
      en:
        `Percentage difference between observed and expected services by Admin Area ${level}, DATE_RANGE`,
      fr:
        `Différence en pourcentage entre les services observés et attendus par Zone administrative ${level}, PLAGE_DE_DATES`,
    },
  };
}

// m3-0x-02 was the percentage difference at one admin level per metric; the
// successor sums observed and expected at any level, so the level stays a
// disaggregation of the config and one metric serves them all.
const M11_PERCENT_DIFFERENCE: Successor = {
  metricId: "m11-02-01",
  moduleId: "m011",
  valueProps: { pct_diff: "pct_diff" },
  texts: [
    {
      from: DATE_RANGE,
      to: {
        en:
          "Percentage difference between observed and expected services, DATE_RANGE",
        fr:
          "Différence en pourcentage entre les services observés et attendus, PLAGE_DE_DATES",
      },
    },
    disruptionMapSubCaption(2),
    disruptionMapSubCaption(3),
    {
      from: {
        en:
          "Negative values indicate service delivery below expected levels. Expected values are based on pre-disruption trends.",
        fr:
          "Les valeurs négatives indiquent une prestation de services inférieure aux niveaux attendus. Les valeurs attendues sont basées sur les tendances pré-perturbation.",
        pt:
          "Os valores negativos indicam uma prestação de serviços abaixo dos níveis esperados. Os valores esperados baseiam-se nas tendências anteriores à perturbação.",
      },
      to: DISRUPTION_FOOTNOTE,
    },
  ],
};

const M11_OBSERVED_EXPECTED: Successor = {
  metricId: "m11-02-02",
  moduleId: "m011",
  valueProps: { count_sum: "observed", count_expect_sum: "expected" },
  texts: [],
};

const DISRUPTIONS_LABEL: TranslatableString = {
  en: "Disruptions and surpluses",
  fr: "Perturbations et excédents",
  pt: "Perturbações e excedentes",
};
const PERCENT_DIFFERENCE_LABEL: TranslatableString = {
  en: "Difference between actual and expected service volume (%)",
  fr: "Différence entre le volume de services réel et attendu (%)",
  pt: "Diferença entre o volume de serviços real e esperado (%)",
};
const ACTUAL_EXPECTED_LABEL: TranslatableString = {
  en: "Actual vs expected service volume",
  fr: "Volume de services réel vs attendu",
  pt: "Volume de serviços real vs esperado",
};

const LEVEL_LABEL: Record<1 | 2 | 3 | 4, TranslatableString> = {
  1: { en: "National", fr: "National", pt: "Nacional" },
  2: {
    en: "Admin area 2",
    fr: "Zone administrative 2",
    pt: "Área administrativa 2",
  },
  3: {
    en: "Admin area 3",
    fr: "Zone administrative 3",
    pt: "Área administrativa 3",
  },
  4: {
    en: "Admin area 4",
    fr: "Zone administrative 4",
    pt: "Área administrativa 4",
  },
};

function withVariant(
  label: TranslatableString,
  variant: TranslatableString,
): TranslatableString {
  return {
    en: `${label.en} (${variant.en})`,
    fr: `${label.fr} (${variant.fr})`,
    pt: `${label.pt ?? label.en} (${variant.pt ?? variant.en})`,
  };
}

function m003Metric(
  id: string,
  label: TranslatableString,
  successor: Successor,
): RetiredMetric {
  return {
    id,
    moduleId: "m003",
    moduleLabel: M003_LABEL,
    label,
    successor: () => successor,
  };
}

// m3-02 to m3-05 were one metric trio per admin level, numbered from the
// national level (1) to admin area 4.
function m003LevelMetrics(level: 1 | 2 | 3 | 4): RetiredMetric[] {
  const group = level + 1;
  const variant = LEVEL_LABEL[level];
  return [
    m003Metric(
      `m3-0${group}-01`,
      withVariant(DISRUPTIONS_LABEL, variant),
      bandChart(level),
    ),
    m003Metric(
      `m3-0${group}-02`,
      withVariant(PERCENT_DIFFERENCE_LABEL, variant),
      M11_PERCENT_DIFFERENCE,
    ),
    m003Metric(
      `m3-0${group}-03`,
      withVariant(ACTUAL_EXPECTED_LABEL, variant),
      M11_OBSERVED_EXPECTED,
    ),
  ];
}

const M004_LABEL: TranslatableString = {
  en: "M4. Coverage estimates",
  fr: "M4. Estimations de couverture",
  pt: "M4. Estimativas de cobertura",
};

const COVERAGE_LABEL: TranslatableString = {
  en: "Coverage calculated from HMIS data",
  fr: "Couverture calculée à partir des données HMIS",
  pt: "Cobertura calculada a partir dos dados do HMIS",
};

// m4-01-01, the national coverage estimate on three estimation bases, is
// m6-01-01 with one more sentence in its footnote. The subnational pair,
// HMIS-derived coverage alone, is m006's HMIS-only pair, which ships no
// presets, so a carried figure keeps its texts.
const M6_COVERAGE_NATIONAL: Successor = {
  metricId: "m6-01-01",
  moduleId: "m006",
  valueProps: {
    coverage_original_estimate: "coverage_original_estimate",
    coverage_avgsurveyprojection: "coverage_avgsurveyprojection",
    coverage_cov: "coverage_cov",
  },
  texts: [
    {
      from: {
        en:
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
        fr:
          "L'estimation de la couverture des services à partir des données administratives peut fournir des informations plus rapides sur les tendances de couverture, ou mettre en évidence des problèmes de qualité des données. Les numérateurs sont les volumes déclarés dans le HMIS, ajustés pour la qualité des données. Les dénominateurs sont sélectionnés à partir des projections de l'ONU, des estimations d'enquête, ou dérivés du volume HMIS pour les indicateurs liés. Les projections nationales sont réalisées en appliquant les tendances HMIS aux données d'enquête les plus récentes. Les estimations sous-nationales sont plus sensibles à la mauvaise qualité des données, et les projections à partir des enquêtes ne sont pas calculées.\n\nDonnées MICS avec l'aimable autorisation de l'UNICEF. Enquêtes par grappes à indicateurs multiples (divers cycles). New York, New York.\n\nDonnées EDS avec l'aimable autorisation d'ICF. Enquêtes démographiques et de santé (divers cycles). Rockville, Maryland.",
        pt:
          "A estimativa da cobertura dos serviços a partir de dados administrativos pode fornecer informação mais atempada sobre as tendências de cobertura, ou evidenciar preocupações com a qualidade dos dados. Os numeradores são os volumes reportados no SIS, ajustados para a qualidade dos dados. Os denominadores são selecionados a partir das projeções da ONU, de estimativas de inquéritos, ou derivados do volume do SIS para indicadores relacionados. As projeções nacionais são feitas aplicando as tendências do SIS aos dados de inquérito mais recentes. As estimativas subnacionais são mais sensíveis à fraca qualidade dos dados, e as projeções a partir de inquéritos não são calculadas.\n\nDados MICS por cortesia da UNICEF. Inquéritos de Indicadores Múltiplos (várias rondas). Nova Iorque, Nova Iorque.\n\nDados DHS por cortesia da ICF. Inquéritos Demográficos e de Saúde (várias rondas). Rockville, Maryland.",
      },
      to: {
        en:
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        fr:
          "L'estimation de la couverture des services à partir des données administratives peut fournir des informations plus rapides sur les tendances de couverture, ou mettre en évidence des problèmes de qualité des données. Les numérateurs sont les volumes déclarés dans le HMIS, ajustés pour la qualité des données. Les dénominateurs sont sélectionnés à partir des projections de l'ONU, des estimations d'enquête, ou dérivés du volume HMIS pour les indicateurs liés. Les projections nationales sont réalisées en appliquant les tendances HMIS aux données d'enquête les plus récentes. Les estimations sous-nationales sont plus sensibles à la mauvaise qualité des données, et les projections à partir des enquêtes ne sont pas calculées.\n\nDonnées MICS avec l'aimable autorisation de l'UNICEF. Enquêtes par grappes à indicateurs multiples (divers cycles). New York, New York.\n\nDonnées EDS avec l'aimable autorisation d'ICF. Enquêtes démographiques et de santé (divers cycles). Rockville, Maryland.\n\nLes données de l'année en cours reflètent la période disponible au moment de l'analyse ; les chiffres de population ont été ajustés pour correspondre à la durée correspondante.",
        pt:
          "A estimativa da cobertura dos serviços a partir de dados administrativos pode fornecer informação mais atempada sobre as tendências de cobertura, ou evidenciar preocupações com a qualidade dos dados. Os numeradores são os volumes reportados no SIS, ajustados para a qualidade dos dados. Os denominadores são selecionados a partir das projeções da ONU, de estimativas de inquéritos, ou derivados do volume do SIS para indicadores relacionados. As projeções nacionais são feitas aplicando as tendências do SIS aos dados de inquérito mais recentes. As estimativas subnacionais são mais sensíveis à fraca qualidade dos dados, e as projeções a partir de inquéritos não são calculadas.\n\nDados MICS por cortesia da UNICEF. Inquéritos de Indicadores Múltiplos (várias rondas). Nova Iorque, Nova Iorque.\n\nDados DHS por cortesia da ICF. Inquéritos Demográficos e de Saúde (várias rondas). Rockville, Maryland.\n\nOs dados do ano em curso refletem o período disponível no momento da análise; os valores da população foram ajustados para corresponder à duração correspondente.",
      },
    },
  ],
};

function m6CoverageHmis(level: 2 | 3): Successor {
  return {
    metricId: `m6-0${level}-02`,
    moduleId: "m006",
    valueProps: { coverage_cov: "coverage_cov" },
    texts: [],
  };
}

const M004_LEVEL_LABEL: Record<1 | 2 | 3, TranslatableString> = {
  1: LEVEL_LABEL[1],
  2: {
    en: "Admin Area 2",
    fr: "Zone administrative 2",
    pt: "Área Administrativa 2",
  },
  3: {
    en: "Admin Area 3",
    fr: "Zone administrative 3",
    pt: "Área Administrativa 3",
  },
};

function m004Metric(level: 1 | 2 | 3, successor: Successor): RetiredMetric {
  return {
    id: `m4-0${level}-01`,
    moduleId: "m004",
    moduleLabel: M004_LABEL,
    label: withVariant(COVERAGE_LABEL, M004_LEVEL_LABEL[level]),
    successor: () => successor,
  };
}

export const RETIRED_METRICS: readonly RetiredMetric[] = [
  {
    id: "m3-01-01",
    moduleId: "m003",
    moduleLabel: M003_LABEL,
    label: {
      en: "Number of services reported, by adjustment type",
      fr: "Nombre de services déclarés, par type d'ajustement",
      pt: "Número de serviços notificados, por tipo de ajuste",
    },
    successor: (config) =>
      config.d.valuesFilter?.length === 1 && !usesFacilityColumn(config)
        ? M12_INDICATOR_VALUE
        : M2_VOLUME_BY_ADJUSTMENT,
  },
  ...m003LevelMetrics(1),
  ...m003LevelMetrics(2),
  ...m003LevelMetrics(3),
  ...m003LevelMetrics(4),
  m004Metric(1, M6_COVERAGE_NATIONAL),
  m004Metric(2, m6CoverageHmis(2)),
  m004Metric(3, m6CoverageHmis(3)),
];

function usesFacilityColumn(config: PresentationObjectConfig): boolean {
  const facility: readonly string[] = FACILITY_ROLLUP_COLUMNS;
  return config.d.disaggregateBy.some((e) => facility.includes(e.disOpt)) ||
    config.d.filterBy.some((f) => facility.includes(f.disOpt));
}

export function retiredMetric(metricId: string): RetiredMetric | undefined {
  return RETIRED_METRICS.find((m) => m.id === metricId);
}

export type FigureSuccession = Readonly<{
  metricId: string;
  moduleId: string;
  config: PresentationObjectConfig;
}>;

// A stored figure of a retired metric, carried to its successor. `language`
// is the figure's own (the bundle's localization), the language its preset
// texts were resolved in at insertion.
export function succeedRetiredFigure(
  retired: RetiredMetric,
  config: PresentationObjectConfig,
  language: Language,
): FigureSuccession {
  const successor = retired.successor(config);
  return {
    metricId: successor.metricId,
    moduleId: successor.moduleId,
    config: carryConfig(config, successor, language),
  };
}

function carryConfig(
  config: PresentationObjectConfig,
  successor: Successor,
  language: Language,
): PresentationObjectConfig {
  const band = successor.bandChart === true && config.s.specialDisruptionsChart;
  const renamed = (config.d.valuesFilter ?? []).flatMap((prop) => {
    const next = successor.valueProps[prop];
    return next === undefined ? [] : [next];
  });
  const { valuesFilter: _dropped, ...dWithoutFilter } = config.d;
  const d = band || renamed.length === 0
    ? dWithoutFilter
    : { ...dWithoutFilter, valuesFilter: renamed };
  const s = band
    ? {
      ...config.s,
      content: "lines" as const,
      specialDisruptionsChart: false,
      specialDisruptionsChartV2: true,
    }
    : config.s;
  return { d, s, t: swapTexts(config.t, successor.texts, language) };
}

function swapTexts(
  t: PresentationObjectConfig["t"],
  swaps: readonly TextSwap[],
  language: Language,
): PresentationObjectConfig["t"] {
  const swap = (text: string): string => {
    if (text === "") return text;
    const match = swaps.find(({ from }) =>
      from.en === text || from.fr === text || from.pt === text
    );
    if (match === undefined) return text;
    if (match.to === null) return "";
    return match.to[language] ?? text;
  };
  return {
    ...t,
    caption: swap(t.caption),
    subCaption: swap(t.subCaption),
    footnote: swap(t.footnote),
  };
}

export type FigureMetricResolution<
  M extends { id: string } = MetricWithStatus,
> =
  | {
    kind: "current";
    metric: M;
    config: PresentationObjectConfig;
  }
  | {
    kind: "succeeded";
    metric: M;
    config: PresentationObjectConfig;
    retired: RetiredMetric;
  }
  | {
    kind: "absent";
    metricId: string;
    retired:
      | {
        metric: RetiredMetric;
        successor: { metricId: string; moduleId: string };
      }
      | undefined;
  };

// A stored figure as this lookup reads it: a FigureBundle, or a bundle's
// metric and config with another language.
export type StoredFigure = Pick<FigureBundle, "metricId" | "config"> & {
  localization: Pick<FigureBundle["localization"], "language">;
};

// The metric a stored figure resolves to in a package: its own when the
// package carries it, else its successor with the config carried across, else
// nothing, naming the retired metric and its successor when there is one. The
// one lookup every update, edit and AI path runs; it reads a metric's id only.
export function resolveFigureMetric<M extends { id: string }>(
  metrics: readonly M[],
  figure: StoredFigure,
): FigureMetricResolution<M> {
  const current = metrics.find((m) => m.id === figure.metricId);
  if (current !== undefined) {
    return { kind: "current", metric: current, config: figure.config };
  }
  const retired = retiredMetric(figure.metricId);
  if (retired === undefined) {
    return { kind: "absent", metricId: figure.metricId, retired: undefined };
  }
  const succession = succeedRetiredFigure(
    retired,
    figure.config,
    figure.localization.language,
  );
  const successor = metrics.find((m) => m.id === succession.metricId);
  if (successor !== undefined) {
    return {
      kind: "succeeded",
      metric: successor,
      config: succession.config,
      retired,
    };
  }
  return {
    kind: "absent",
    metricId: figure.metricId,
    retired: {
      metric: retired,
      successor: {
        metricId: succession.metricId,
        moduleId: succession.moduleId,
      },
    },
  };
}
