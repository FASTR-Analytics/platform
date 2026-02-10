import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

const _VALUE_LABELS = {
  best: "Best",
  survey: "Survey",
  danc1_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on ANC 1st visits.",
  danc1_delivery:
    "Estimated number of deliveries derived from HMIS data on ANC 1st visits.",
  danc1_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on ANC 1st visits.",
  danc1_livebirth:
    "Estimated number of live births derived from HMIS data on ANC 1st visits.",
  danc1_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on ANC 1st visits.",
  danc1_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on ANC 1st visits.",
  danc1_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on ANC 1st visits.",
  dbcg_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on BCG doses.",
  dbcg_livebirth:
    "Estimated number of live births derived from HMIS data on BCG doses.",
  dbcg_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on BCG doses.",
  ddelivery_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on institutional deliveries.",
  ddelivery_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on institutional deliveries.",
  ddelivery_livebirth:
    "Estimated number of live births derived from HMIS data on institutional deliveries.",
  ddelivery_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on institutional deliveries.",
  ddelivery_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on institutional deliveries.",
  ddelivery_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on institutional deliveries.",
  dlivebirths_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on live births.",
  dlivebirths_delivery:
    "Estimated number of deliveries derived from HMIS data on live births.",
  dlivebirths_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on live births.",
  dlivebirths_livebirth:
    "Estimated number of live births derived from HMIS data on live births.",
  dlivebirths_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on live births.",
  dlivebirths_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on live births.",
  dlivebirths_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on live births.",
  dpenta1_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on Penta-1 doses.",
  dpenta1_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on Penta-1 doses.",
  dpenta1_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on Penta-1 doses.",
  dwpp_dpt:
    "Estimated number of infants eligible for DPT1 based on UN WPP estimates.",
  dwpp_livebirth: "Estimated number of live births based on UN WPP estimates.",
  dwpp_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) based on UN WPP estimates.",
  dwpp_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) based on UN WPP estimates.",
  dwpp_pregnancy: "Estimated number of pregnancies based on UN WPP estimates.",

  source_anc1: "HMIS data on ANC 1st visits",
  source_delivery: "HMIS data on institutional deliveries",
  source_bcg: "HMIS data on BCG doses",
  source_penta1: "HMIS data on Penta-1 doses",
  source_wpp: "UN WPP estimates",
  source_livebirths: "HMIS data on live births",
  target_pregnancy: "Pregnancies",
  target_delivery: "Deliveries",
  target_birth: "Total births (live + stillbirths)",
  target_livebirth: "Live births",
  target_dpt: "Infants eligible for DPT1",
  target_measles1: "Children eligible for measles dose 1 (MCV1)",
  target_measles2: "Children eligible for measles dose 2 (MCV2)",
  target_vitaminA:
    "Children aged 6-59 months eligible for Vitamin A supplementation",
  target_fully_immunized:
    "Children under 1 year eligible for full immunization",
};

export const definition = {
  label: "M5. Coverage estimates ~ new, part 1",
  prerequisites: ["m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "05_module_coverage_estimates_part1.R",
    commit: "main",
  },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [
    "survey_data_unified.csv",
    "population_estimates_only.csv",
    "ng_province_denominators_corrected.csv",
    "ng_national_denominators_corrected.csv",
    "chmis_national_for_module4.csv",
    "chmis_admin_area_for_module4.csv",
  ],
  dataSources: [
    {
      replacementString: "M2_adjusted_data_national.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_national.csv",
      moduleId: "m002",
    },
    {
      replacementString: "M2_adjusted_data_admin_area.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_admin_area.csv",
      moduleId: "m002",
    },
  ],
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  _______                                 __    __                               __                                     __               //
  // /       \                               /  |  /  |                             /  |                                   /  |              //
  // $$$$$$$  |  ______    _______  __    __ $$ | _$$ |_    _______         ______  $$ |____      __   ______    _______  _$$ |_    _______  //
  // $$ |__$$ | /      \  /       |/  |  /  |$$ |/ $$   |  /       |       /      \ $$      \    /  | /      \  /       |/ $$   |  /       | //
  // $$    $$< /$$$$$$  |/$$$$$$$/ $$ |  $$ |$$ |$$$$$$/  /$$$$$$$/       /$$$$$$  |$$$$$$$  |   $$/ /$$$$$$  |/$$$$$$$/ $$$$$$/  /$$$$$$$/  //
  // $$$$$$$  |$$    $$ |$$      \ $$ |  $$ |$$ |  $$ | __$$      \       $$ |  $$ |$$ |  $$ |   /  |$$    $$ |$$ |        $$ | __$$      \  //
  // $$ |  $$ |$$$$$$$$/  $$$$$$  |$$ \__$$ |$$ |  $$ |/  |$$$$$$  |      $$ \__$$ |$$ |__$$ |   $$ |$$$$$$$$/ $$ \_____   $$ |/  |$$$$$$  | //
  // $$ |  $$ |$$       |/     $$/ $$    $$/ $$ |  $$  $$//     $$/       $$    $$/ $$    $$/    $$ |$$       |$$       |  $$  $$//     $$/  //
  // $$/   $$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/    $$$$/ $$$$$$$/         $$$$$$/  $$$$$$$/__   $$ | $$$$$$$/  $$$$$$$/    $$$$/ $$$$$$$/   //
  //                                                                                       /  \__$$ |                                        //
  //                                                                                       $$    $$/                                         //
  //                                                                                        $$$$$$/                                          //
  //                                                                                                                                         //
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  resultsObjects: [
    {
      id: "M5_denominators_national.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_denominators_admin2.csv",
      description: "Selected denominators (Admin area 2)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_denominators_admin3.csv",
      description: "Selected denominators (Admin area 3)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_combined_results_national.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_combined_results_admin2.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_combined_results_admin3.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_selected_denominator_per_indicator.csv",
      description: "Selected denominators",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        denominator_national: "TEXT NOT NULL",
        denominator_admin2: "TEXT NOT NULL",
        denominator_admin3: "TEXT NOT NULL",
      },
    },
  ],
  /////////////////////////////////////////////////////////////////////////
  //  __       __              __                __                      //
  // /  \     /  |            /  |              /  |                     //
  // $$  \   /$$ |  ______   _$$ |_     ______  $$/   _______   _______  //
  // $$$  \ /$$$ | /      \ / $$   |   /      \ /  | /       | /       | //
  // $$$$  /$$$$ |/$$$$$$  |$$$$$$/   /$$$$$$  |$$ |/$$$$$$$/ /$$$$$$$/  //
  // $$ $$ $$/$$ |$$    $$ |  $$ | __ $$ |  $$/ $$ |$$ |      $$      \  //
  // $$ |$$$/ $$ |$$$$$$$$/   $$ |/  |$$ |      $$ |$$ \_____  $$$$$$  | //
  // $$ | $/  $$ |$$       |  $$  $$/ $$ |      $$ |$$       |/     $$/  //
  // $$/      $$/  $$$$$$$/    $$$$/  $$/       $$/  $$$$$$$/ $$$$$$$/   //
  //                                                                     //
  /////////////////////////////////////////////////////////////////////////
  metrics: [
    {
      id: "m4a-01-01",
      resultsObjectId: "M5_denominators_national.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "National",
      requiredDisaggregationOptions: ["denominator", "year"],
      formatAs: "number",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "Population denominators for coverage calculation at national level, derived from multiple sources and methods.",
          fr:
            "Dénominateurs de population pour le calcul de couverture au niveau national, dérivés de multiples sources et méthodes.",
        },
        methodology: {
          en:
            "AVG of denominator values from different sources: HMIS-derived (from ANC1, delivery, BCG, Penta1), UNWPP-based, and survey-based. Each denominator type represents a different method for estimating target populations (pregnancies, births, infants eligible for vaccination, etc.).",
          fr:
            "Moyenne des valeurs de dénominateur de différentes sources: dérivées du HMIS (de ANC1, accouchement, BCG, Penta1), basées sur UNWPP, et basées sur enquête.",
        },
        interpretation: {
          en:
            "Compare denominator values from different sources to assess consistency. Large discrepancies indicate uncertainty in population estimates. The 'best' denominator is selected to minimize error against survey coverage benchmarks. Use source_indicator and target_population disaggregation to understand denominator derivation.",
          fr:
            "Comparer les valeurs de dénominateur de différentes sources pour évaluer la cohérence. Les grandes divergences indiquent une incertitude dans les estimations de population.",
        },
        typicalRange: {
          en:
            "Varies by country size and indicator type. Pregnancy denominators typically 2-5% of total population; infant denominators 2-4%.",
          fr:
            "Varie selon la taille du pays et le type d'indicateur. Dénominateurs de grossesse généralement 2-5% de la population totale; dénominateurs de nourrissons 2-4%.",
        },
        caveats: {
          en:
            "Denominator quality is critical for coverage estimation. Different sources use different assumptions (mortality rates, fertility rates, etc.). UNWPP denominators only available at national level. Survey-based denominators depend on survey coverage accuracy.",
          fr:
            "La qualité du dénominateur est critique pour l'estimation de couverture. Les dénominateurs UNWPP sont uniquement disponibles au niveau national.",
        },
        useCases: [
          {
            en: "Assess population estimate uncertainty",
            fr: "Évaluer l'incertitude de l'estimation de la population",
          },
          {
            en: "Compare alternative denominator sources",
            fr: "Comparer les sources de dénominateur alternatives",
          },
          {
            en: "Select appropriate denominators for coverage calculation",
            fr:
              "Sélectionner les dénominateurs appropriés pour le calcul de couverture",
          },
        ],
        relatedMetrics: ["m4a-02-01", "m4a-01-02", "m4a-01-03"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator and year (both required). Disaggregate by source_indicator to see HMIS-derived vs UNWPP vs survey sources. Use target_population to understand which population group each denominator represents.",
          fr:
            "Toujours désagréger par denominator et year (tous deux requis). Désagréger par source_indicator pour voir les sources dérivées du HMIS vs UNWPP vs enquête.",
        },
      },
      vizPresets: [{
        id: "values-table",
        label: { en: "Denominator values table", fr: "Denominator values table" },
        description: { en: "Table of denominator values by source and year", fr: "Table of denominator values by source and year" },
        allowedFilters: ["denominator", "source_indicator"],
        config: {
          d: {
            type: "table",
            periodOpt: "year",
            valuesDisDisplayOpt: "col",
            disaggregateBy: [
              { disOpt: "denominator", disDisplayOpt: "row" },
              { disOpt: "year", disDisplayOpt: "col" },
              { disOpt: "source_indicator", disDisplayOpt: "rowGroup" },
            ],
            filterBy: [],
          },
          s: { showDataLabels: true, idealAspectRatio: "ideal" },
        },
      }],
    },
    {
      id: "m4a-01-02",
      resultsObjectId: "M5_denominators_admin2.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "denominator",
        "admin_area_2",
        "year",
      ],
      formatAs: "number",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "Subnational population denominators for coverage calculation at admin area 2 level.",
          fr:
            "Dénominateurs de population sous-nationaux pour le calcul de couverture au niveau de la zone administrative 2.",
        },
        methodology: {
          en:
            "AVG of denominators derived from subnational HMIS data and survey estimates. UNWPP denominators not available at this level. Uses national-level methodology adapted to subnational populations.",
          fr:
            "Moyenne des dénominateurs dérivés des données HMIS sous-nationales et estimations d'enquête. Dénominateurs UNWPP non disponibles à ce niveau.",
        },
        interpretation: {
          en:
            "Subnational denominators enable regional coverage monitoring. Compare across admin areas to assess population estimate consistency. Larger regional variation suggests denominator uncertainty.",
          fr:
            "Les dénominateurs sous-nationaux permettent la surveillance de la couverture régionale. Comparer entre zones administratives pour évaluer la cohérence des estimations.",
        },
        typicalRange: {
          en:
            "Varies by region size and population. Proportional to national denominators.",
          fr:
            "Varie selon la taille de la région et la population. Proportionnel aux dénominateurs nationaux.",
        },
        useCases: [
          {
            en: "Regional coverage calculation",
            fr: "Calcul de couverture régionale",
          },
          {
            en: "Assess subnational population estimate quality",
            fr: "Évaluer la qualité des estimations de population sous-nationale",
          },
        ],
        relatedMetrics: ["m4a-01-01", "m4a-02-02"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator, admin_area_2, and year (all required). Compare denominator sources to assess regional data quality.",
          fr:
            "Toujours désagréger par denominator, admin_area_2 et year (tous requis). Comparer les sources de dénominateur pour évaluer la qualité des données régionales.",
        },
      },
    },
    {
      id: "m4a-01-03",
      resultsObjectId: "M5_denominators_admin3.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "denominator",
        "admin_area_3",
        "year",
      ],
      formatAs: "number",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "District-level population denominators for coverage calculation at admin area 3 level.",
          fr:
            "Dénominateurs de population au niveau du district pour le calcul de couverture au niveau de la zone administrative 3.",
        },
        methodology: {
          en:
            "AVG of district-level denominators. Finest geographic resolution available. Only generated when ANALYSIS_LEVEL includes admin_area_3.",
          fr:
            "Moyenne des dénominateurs au niveau du district. Résolution géographique la plus fine disponible. Généré uniquement lorsque ANALYSIS_LEVEL inclut admin_area_3.",
        },
        interpretation: {
          en:
            "District denominators most uncertain due to small sample sizes and population mobility. Use with caution for micro-level targeting.",
          fr:
            "Les dénominateurs de district sont les plus incertains en raison de petites tailles d'échantillon et mobilité de la population.",
        },
        typicalRange: {
          en:
            "Varies by district size. Smaller than admin area 2 denominators, proportional to population.",
          fr:
            "Varie selon la taille du district. Plus petit que les dénominateurs de zone administrative 2, proportionnel à la population.",
        },
        useCases: [
          {
            en: "District-level coverage calculation",
            fr: "Calcul de couverture au niveau du district",
          },
        ],
        relatedMetrics: ["m4a-01-01", "m4a-02-03"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator, admin_area_3, and year (all required). Interpret with caution due to denominator uncertainty at this level.",
          fr:
            "Toujours désagréger par denominator, admin_area_3 et year (tous requis). Interpréter avec prudence en raison de l'incertitude du dénominateur à ce niveau.",
        },
      },
    },
    {
      id: "m4a-02-01",
      resultsObjectId: "M5_combined_results_national.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "National",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "Coverage estimates calculated using alternative denominator sources, plus survey benchmarks at national level.",
          fr:
            "Estimations de couverture calculées utilisant des sources de dénominateur alternatives, plus repères d'enquête au niveau national.",
        },
        methodology: {
          en:
            "AVG of coverage calculated as HMIS numerators divided by each available denominator type. Includes 'best' denominator (selected to minimize survey error) and 'survey' (original survey estimate). Enables comparison of how denominator choice affects coverage estimates.",
          fr:
            "Moyenne de la couverture calculée comme numérateurs HMIS divisés par chaque type de dénominateur disponible. Inclut le 'meilleur' dénominateur et l'estimé d'enquête.",
        },
        interpretation: {
          en:
            "Large variation across denominator types indicates denominator uncertainty. Coverage estimates should be similar to survey values when using appropriate denominators. Coverage >100% suggests denominator underestimation or HMIS over-reporting.",
          fr:
            "Une grande variation entre types de dénominateur indique une incertitude. Les estimations de couverture devraient être similaires aux valeurs d'enquête avec des dénominateurs appropriés.",
        },
        typicalRange: {
          en:
            "0-100%. Denominators producing >100% coverage are likely inappropriate or require data quality investigation.",
          fr:
            "0-100%. Les dénominateurs produisant >100% de couverture sont probablement inappropriés ou nécessitent une investigation de qualité.",
        },
        caveats: {
          en:
            "Denominator selection is subjective and affects results. The 'best' denominator minimizes squared error against surveys but may not be appropriate for all analytical purposes.",
          fr:
            "La sélection du dénominateur est subjective et affecte les résultats. Le 'meilleur' dénominateur minimise l'erreur quadratique mais peut ne pas être approprié pour tous les objectifs.",
        },
        useCases: [
          {
            en: "Assess sensitivity to denominator choice",
            fr: "Évaluer la sensibilité au choix du dénominateur",
          },
          {
            en: "Validate HMIS data against survey benchmarks",
            fr: "Valider les données HMIS contre les repères d'enquête",
          },
          {
            en: "Select appropriate denominator for final coverage estimation",
            fr:
              "Sélectionner le dénominateur approprié pour l'estimation de couverture finale",
          },
        ],
        relatedMetrics: ["m4a-01-01", "m4a-02-02", "m4a-02-03"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator_best_or_survey, indicator_common_id, and year (all required). Compare 'best' vs 'survey' to validate denominator selection. Visualize all denominator types to assess range of plausible coverage estimates.",
          fr:
            "Toujours désagréger par denominator_best_or_survey, indicator_common_id et year (tous requis). Comparer 'meilleur' vs 'enquête' pour valider la sélection du dénominateur.",
        },
      },
      vizPresets: [{
        id: "coverage-timeseries",
        label: { en: "Coverage by denominator type", fr: "Coverage by denominator type" },
        description: { en: "Timeseries comparing coverage across denominator sources", fr: "Timeseries comparing coverage across denominator sources" },
        needsReplicant: true,
        allowedFilters: ["denominator_best_or_survey"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "denominator_best_or_survey", disDisplayOpt: "series" },
              { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
            ],
            filterBy: [],
            selectedReplicantValue: "anc4",
          },
          s: { content: "lines", showDataLabels: true },
        },
      }],
    },
    {
      id: "m4a-02-02",
      resultsObjectId: "M5_combined_results_admin2.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "admin_area_2",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "Subnational coverage estimates using alternative denominators at admin area 2 level.",
          fr:
            "Estimations de couverture sous-nationales utilisant des dénominateurs alternatifs au niveau de la zone administrative 2.",
        },
        methodology: {
          en:
            "AVG of coverage with different denominator types at subnational level. National-only denominators (e.g., UNWPP) replaced with subnational alternatives.",
          fr:
            "Moyenne de la couverture avec différents types de dénominateur au niveau sous-national. Dénominateurs nationaux uniquement remplacés par alternatives sous-nationales.",
        },
        interpretation: {
          en:
            "Enables assessment of denominator uncertainty at regional level. Useful for understanding geographic variation in coverage and denominator quality.",
          fr:
            "Permet l'évaluation de l'incertitude du dénominateur au niveau régional. Utile pour comprendre la variation géographique de la couverture.",
        },
        typicalRange: {
          en:
            "0-100%. Variation across denominators indicates uncertainty in regional coverage estimates.",
          fr:
            "0-100%. La variation entre dénominateurs indique une incertitude dans les estimations de couverture régionale.",
        },
        useCases: [
          {
            en: "Regional coverage sensitivity analysis",
            fr: "Analyse de sensibilité de la couverture régionale",
          },
        ],
        relatedMetrics: ["m4a-02-01", "m4a-01-02"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator_best_or_survey, admin_area_2, indicator_common_id, and year (all required). Compare denominator types to assess regional estimate uncertainty.",
          fr:
            "Toujours désagréger par denominator_best_or_survey, admin_area_2, indicator_common_id et year (tous requis). Comparer les types de dénominateur pour évaluer l'incertitude des estimations régionales.",
        },
      },
    },
    {
      id: "m4a-02-03",
      resultsObjectId: "M5_combined_results_admin3.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "admin_area_3",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en:
            "District-level coverage estimates using alternative denominators at admin area 3 level.",
          fr:
            "Estimations de couverture au niveau du district utilisant des dénominateurs alternatifs au niveau de la zone administrative 3.",
        },
        methodology: {
          en:
            "AVG of coverage with different denominator types at district level. Highest geographic resolution for coverage estimation.",
          fr:
            "Moyenne de la couverture avec différents types de dénominateur au niveau du district. Plus haute résolution géographique pour l'estimation de couverture.",
        },
        interpretation: {
          en:
            "District-level denominator uncertainty typically highest. Use to understand micro-level coverage patterns but interpret with caution.",
          fr:
            "L'incertitude du dénominateur au niveau du district est généralement la plus élevée. Utiliser pour comprendre les modèles de couverture micro-niveau avec prudence.",
        },
        typicalRange: {
          en:
            "0-100%. Wide variation across denominators common due to small sample sizes and denominator uncertainty.",
          fr:
            "0-100%. Variation large entre dénominateurs commune en raison de petites tailles d'échantillon et incertitude du dénominateur.",
        },
        useCases: [
          {
            en: "District-level coverage sensitivity analysis",
            fr: "Analyse de sensibilité de la couverture au niveau du district",
          },
        ],
        relatedMetrics: ["m4a-02-01", "m4a-01-03"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by denominator_best_or_survey, admin_area_3, indicator_common_id, and year (all required). High uncertainty at this level - consider aggregating to admin area 2.",
          fr:
            "Toujours désagréger par denominator_best_or_survey, admin_area_3, indicator_common_id et year (tous requis). Incertitude élevée à ce niveau - considérer l'agrégation à la zone administrative 2.",
        },
      },
    },
  ],
  ////////////////////////////////////////////////////////////////////
  //  _______                                                       //
  // /       \                                                      //
  // $$$$$$$  | ______    ______   ______   _____  ____    _______  //
  // $$ |__$$ |/      \  /      \ /      \ /     \/    \  /       | //
  // $$    $$/ $$$$$$  |/$$$$$$  |$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
  // $$$$$$$/  /    $$ |$$ |  $$/ /    $$ |$$ | $$ | $$ |$$      \  //
  // $$ |     /$$$$$$$ |$$ |     /$$$$$$$ |$$ | $$ | $$ | $$$$$$  | //
  // $$ |     $$    $$ |$$ |     $$    $$ |$$ | $$ | $$ |/     $$/  //
  // $$/       $$$$$$$/ $$/       $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
  //                                                                //
  ////////////////////////////////////////////////////////////////////
  configRequirements: {
    configType: "parameters",
    parameters: [
      {
        description: "Count value to use",
        replacementString: "SELECTED_COUNT_VARIABLE",
        input: {
          inputType: "select",
          options: [
            { value: `count_final_none`, label: "Count (unadjusted)" },
            {
              value: `count_final_outliers`,
              label: "Count (adjusted for outliers)",
            },
            {
              value: `count_final_completeness`,
              label: "Count (adjusted for completeness)",
            },
            {
              value: `count_final_both`,
              label: "Count (adjusted for outliers and completeness)",
            },
          ],
          valueType: "string",
          defaultValue: "count_final_outliers",
        },
      },
      {
        description: "Level to calculate coverage for",
        replacementString: "ANALYSIS_LEVEL",
        input: {
          inputType: "select",
          options: [
            { value: `NATIONAL_ONLY`, label: "National only" },
            {
              value: `NATIONAL_PLUS_AA2`,
              label: "National and admin area 2",
            },
            {
              value: `NATIONAL_PLUS_AA2_AA3`,
              label: "National, admin area 2, and admin area 3",
            },
          ],
          valueType: "string",
          defaultValue: "NATIONAL_PLUS_AA2",
        },
      },
      {
        description: "Pregnancy loss rate",
        replacementString: "PREGNANCY_LOSS_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.03",
        },
      },
      {
        description: "Twin rate",
        replacementString: "TWIN_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.015",
        },
      },
      {
        description: "Stillbirth rate",
        replacementString: "STILLBIRTH_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.02",
        },
      },
      {
        description: "Neonatal mortality rate",
        replacementString: "P1_NMR",
        input: {
          inputType: "number",
          defaultValue: "0.039",
        },
      },
      {
        description: "Postneonatal mortality rate",
        replacementString: "P2_PNMR",
        input: {
          inputType: "number",
          defaultValue: "0.028",
        },
      },
      {
        description: "Infant mortality rate",
        replacementString: "INFANT_MORTALITY_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.067",
        },
      },
      {
        description: "Under 5 mortality rate",
        replacementString: "UNDER5_MORTALITY_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.103",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
