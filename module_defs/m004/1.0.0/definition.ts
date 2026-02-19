import type { ModuleDefinitionJSON } from "lib";

export const definition = {
  label: { en: "M4. Coverage estimates", fr: "M4. Estimations de couverture" },
  prerequisites: ["m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "m004_module_coverage_estimates.R",
    commit: "main",
  },
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
      id: "M4_coverage_estimation.csv",
      description: "Coverage estimates (National)",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
      },
    },
    {
      id: "M4_coverage_estimation_admin_area_2.csv",
      description: "Coverage results (sub-national level)",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_cov: "NUMERIC",
      },
    },
    {
      id: "M4_coverage_estimation_admin_area_3.csv",
      description: "Coverage results (sub-national level)",
      createTableStatementPossibleColumns: {
        admin_area_3: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_cov: "NUMERIC",
      },
    },
    {
      id: "M4_selected_denominator_per_indicator.csv",
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
      id: "m4-01-01",
      resultsObjectId: "M4_coverage_estimation.csv",
      valueProps: [
        "coverage_original_estimate",
        "coverage_avgsurveyprojection",
        "coverage_cov",
      ],
      valueFunc: "AVG",
      valueLabelReplacements: {
        coverage_original_estimate: "Survey-based estimate (when available)",
        coverage_avgsurveyprojection:
          "Projected survey estimate (when survey data is missing)",
        coverage_cov: "Coverage calculated from HMIS data",
      },
      label: {
        en: "Coverage calculated from HMIS data",
        fr: "Couverture calculée à partir des données HMIS",
      },
      variantLabel: { en: "National", fr: "National" },
      requiredDisaggregationOptions: ["indicator_common_id", "year"],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "Health service coverage estimates at national level, comparing HMIS-derived coverage with survey-based benchmarks.",
          fr: "Estimations de couverture des services de santé au niveau national, comparant la couverture dérivée du HMIS avec les repères d'enquête.",
        },
        methodology: {
          en: "AVG of three coverage types: (1) original survey estimates when available, (2) projected survey estimates using HMIS trends, (3) HMIS-derived coverage calculated as service volumes divided by population denominators. Denominators selected based on minimizing error against survey benchmarks.",
          fr: "Moyenne de trois types de couverture: (1) estimations d'enquête originales, (2) estimations d'enquête projetées utilisant les tendances HMIS, (3) couverture dérivée du HMIS.",
        },
        interpretation: {
          en: "Three values provide complementary perspectives: survey estimates are gold standard but sparse; projected estimates fill gaps using HMIS trends; HMIS-derived estimates enable annual monitoring. Large gaps between HMIS and survey coverage suggest data quality issues or denominator problems.",
          fr: "Trois valeurs fournissent des perspectives complémentaires: les estimations d'enquête sont l'étalon-or mais rares; les estimations projetées comblent les lacunes.",
        },
        typicalRange: {
          en: "0-100% for coverage. Maternal services typically 40-80%; vaccination 60-95%; varies by country context.",
          fr: "0-100% pour la couverture. Services maternels généralement 40-80%; vaccination 60-95%; varie selon le contexte.",
        },
        caveats: {
          en: "Denominator selection is critical - inappropriate denominators can produce implausible coverage >100%. Projection assumes HMIS trends reflect true coverage changes. Survey timing and HMIS data quality affect comparability.",
          fr: "La sélection du dénominateur est critique - les dénominateurs inappropriés peuvent produire une couverture >100%. La projection suppose que les tendances HMIS reflètent les vrais changements.",
        },
        useCases: [
          {
            en: "Monitor annual coverage trends between surveys",
            fr: "Surveiller les tendances de couverture annuelles entre enquêtes",
          },
          {
            en: "Validate HMIS data against survey benchmarks",
            fr: "Valider les données HMIS contre les repères d'enquête",
          },
          {
            en: "Assess denominator quality and selection",
            fr: "Évaluer la qualité et sélection du dénominateur",
          },
        ],
        relatedMetrics: ["m4-02-01", "m4-03-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id and year (both required). Compare the three coverage types to assess HMIS-survey concordance. Time series reveals coverage trends and data quality evolution.",
          fr: "Toujours désagréger par indicator_common_id et year (tous deux requis). Comparer les trois types de couverture pour évaluer la concordance HMIS-enquête.",
        },
      },
      vizPresets: [
        {
          id: "coverage-timeseries",
          label: {
            en: "Coverage timeseries (national)",
            fr: "Séries temporelles de couverture (national)",
          },
          description: {
            en: "National coverage timeseries with survey benchmarks",
            fr: "Séries temporelles de couverture nationale avec repères d'enquête",
          },
          createDefaultVisualizationOnInstall:
            "3e3230cb-ad9e-48b9-b3ce-7bd01255d20b",
          needsReplicant: true,
          allowedFilters: [],
          config: {
            d: {
              type: "timeseries",
              periodOpt: "year",
              valuesDisDisplayOpt: "series",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
              ],
              filterBy: [],
              selectedReplicantValue: "anc1",
            },
            s: { content: "lines", specialCoverageChart: true },
            t: {
              caption: {
                en: "Coverage estimates for REPLICANT",
                fr: "Estimations de couverture pour REPLICANT",
              },
              subCaption: {
                en: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
                fr: "DATE_RANGE\nAVERTISSEMENT : Ces résultats utilisent des données de routine pour fournir des estimations rigoureuses mais non officielles. Ils doivent être interprétés en tenant compte des limitations de qualité des données ou de représentativité, y compris les résultats d'évaluation de la qualité des données et tout autre facteur spécifique au pays.",
              },
              footnote: {
                en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
                fr: "L'estimation de la couverture des services à partir des données administratives peut fournir des informations plus rapides sur les tendances de couverture, ou mettre en évidence des problèmes de qualité des données. Les numérateurs sont les volumes déclarés dans le HMIS, ajustés pour la qualité des données. Les dénominateurs sont sélectionnés à partir des projections de l'ONU, des estimations d'enquête, ou dérivés du volume HMIS pour les indicateurs liés. Les projections nationales sont réalisées en appliquant les tendances HMIS aux données d'enquête les plus récentes. Les estimations sous-nationales sont plus sensibles à la mauvaise qualité des données, et les projections à partir des enquêtes ne sont pas calculées.\n\nDonnées MICS avec l'aimable autorisation de l'UNICEF. Enquêtes par grappes à indicateurs multiples (divers cycles). New York, New York.\n\nDonnées EDS avec l'aimable autorisation d'ICF. Enquêtes démographiques et de santé (divers cycles). Rockville, Maryland.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m4-02-01",
      resultsObjectId: "M4_coverage_estimation_admin_area_2.csv",
      valueProps: ["coverage_cov"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        coverage_cov: "Coverage calculated from HMIS data",
      },
      label: {
        en: "Coverage calculated from HMIS data",
        fr: "Couverture calculée à partir des données HMIS",
      },
      variantLabel: { en: "Admin Area 2", fr: "Zone administrative 2" },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "HMIS-derived health service coverage at admin area 2 (province/state) level.",
          fr: "Couverture des services de santé dérivée du HMIS au niveau de la zone administrative 2 (province/état).",
        },
        methodology: {
          en: "AVG of coverage calculated as HMIS service volumes divided by subnational population denominators. Uses nationally-selected denominator with subnational fallback if national-only denominator chosen.",
          fr: "Moyenne de la couverture calculée comme volumes de services HMIS divisés par dénominateurs de population sous-nationale.",
        },
        interpretation: {
          en: "Enables subnational coverage monitoring and equity analysis. Compare across regions to identify geographic disparities. Coverage >100% indicates denominator or data quality issues.",
          fr: "Permet la surveillance de la couverture sous-nationale et l'analyse de l'équité. Comparer entre régions pour identifier les disparités géographiques.",
        },
        typicalRange: {
          en: "0-100%. Regional variation expected; coverage gaps often larger in remote/underserved areas.",
          fr: "0-100%. Variation régionale attendue; écarts de couverture souvent plus grands dans les zones éloignées.",
        },
        caveats: {
          en: "Subnational denominators may be less reliable than national. Migration and population estimates affect accuracy. Some denominators only available at national level.",
          fr: "Les dénominateurs sous-nationaux peuvent être moins fiables que nationaux. Les estimations de migration et population affectent la précision.",
        },
        useCases: [
          {
            en: "Assess regional coverage equity",
            fr: "Évaluer l'équité de couverture régionale",
          },
          {
            en: "Target low-coverage areas for improvement",
            fr: "Cibler les zones de faible couverture pour amélioration",
          },
          {
            en: "Monitor subnational performance",
            fr: "Surveiller la performance sous-nationale",
          },
        ],
        relatedMetrics: ["m4-01-01", "m4-03-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_2, and year (all required). Map visualization effectively shows geographic coverage patterns. Time series reveals regional improvement or deterioration.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_2 et year (tous requis). La visualisation cartographique montre efficacement les modèles de couverture géographique.",
        },
      },
      vizPresets: [
        {
          id: "coverage-timeseries",
          label: {
            en: "Coverage timeseries by region",
            fr: "Séries temporelles de couverture par région",
          },
          description: {
            en: "Coverage trends over time by admin area 2",
            fr: "Tendances de couverture dans le temps par zone administrative 2",
          },
          createDefaultVisualizationOnInstall:
            "a7727717-92d9-4676-b533-9b98be426a81",
          allowedFilters: ["admin_area_2"],
          config: {
            d: {
              type: "timeseries",
              periodOpt: "year",
              valuesDisDisplayOpt: "series",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "series" },
                { disOpt: "admin_area_2", disDisplayOpt: "cell" },
              ],
              filterBy: [],
            },
            s: { scale: 1.9, content: "lines", decimalPlaces: 1 },
            t: {
              caption: {
                en: "Coverage estimates",
                fr: "Estimations de couverture",
              },
              subCaption: {
                en: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
                fr: "DATE_RANGE\nAVERTISSEMENT : Ces résultats utilisent des données de routine pour fournir des estimations rigoureuses mais non officielles. Ils doivent être interprétés en tenant compte des limitations de qualité des données ou de représentativité, y compris les résultats d'évaluation de la qualité des données et tout autre facteur spécifique au pays.",
              },
              footnote: {
                en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
                fr: "L'estimation de la couverture des services à partir des données administratives peut fournir des informations plus rapides sur les tendances de couverture, ou mettre en évidence des problèmes de qualité des données. Les numérateurs sont les volumes déclarés dans le HMIS, ajustés pour la qualité des données. Les dénominateurs sont sélectionnés à partir des projections de l'ONU, des estimations d'enquête, ou dérivés du volume HMIS pour les indicateurs liés. Les projections nationales sont réalisées en appliquant les tendances HMIS aux données d'enquête les plus récentes. Les estimations sous-nationales sont plus sensibles à la mauvaise qualité des données, et les projections à partir des enquêtes ne sont pas calculées.\n\nDonnées MICS avec l'aimable autorisation de l'UNICEF. Enquêtes par grappes à indicateurs multiples (divers cycles). New York, New York.\n\nDonnées EDS avec l'aimable autorisation d'ICF. Enquêtes démographiques et de santé (divers cycles). Rockville, Maryland.",
              },
            },
          },
        },
        {
          id: "coverage-bar",
          label: {
            en: "Coverage bar chart by region",
            fr: "Diagramme à barres de couverture par région",
          },
          description: {
            en: "Bar chart comparing coverage across regions",
            fr: "Diagramme à barres comparant la couverture entre régions",
          },
          createDefaultVisualizationOnInstall:
            "d452dfcf-2cc9-4c7f-bfb0-bf5b8ab6433d",
          needsReplicant: true,
          allowedFilters: ["admin_area_2"],
          config: {
            d: {
              type: "chart",
              periodOpt: "year",
              valuesDisDisplayOpt: "indicator",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
                { disOpt: "admin_area_2", disDisplayOpt: "indicator" },
                { disOpt: "year", disDisplayOpt: "cell" },
              ],
              filterBy: [],
              selectedReplicantValue: "anc1",
            },
            s: {
              colorScale: "single-grey",
              decimalPlaces: 1,
              sortIndicatorValues: "descending",
            },
            t: {
              caption: {
                en: "Sub-national level coverage estimates, REPLICANT",
                fr: "Estimations de couverture au niveau sous-national, REPLICANT",
              },
              subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
              footnote: {
                en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
                fr: "L'estimation de la couverture des services à partir des données administratives peut fournir des informations plus rapides sur les tendances de couverture, ou mettre en évidence des problèmes de qualité des données. Les numérateurs sont les volumes déclarés dans le HMIS, ajustés pour la qualité des données. Les dénominateurs sont sélectionnés à partir des projections de l'ONU, des estimations d'enquête, ou dérivés du volume HMIS pour les indicateurs liés. Les projections nationales sont réalisées en appliquant les tendances HMIS aux données d'enquête les plus récentes. Les estimations sous-nationales sont plus sensibles à la mauvaise qualité des données, et les projections à partir des enquêtes ne sont pas calculées.\n\nDonnées MICS avec l'aimable autorisation de l'UNICEF. Enquêtes par grappes à indicateurs multiples (divers cycles). New York, New York.\n\nDonnées EDS avec l'aimable autorisation d'ICF. Enquêtes démographiques et de santé (divers cycles). Rockville, Maryland.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m4-03-01",
      resultsObjectId: "M4_coverage_estimation_admin_area_3.csv",
      valueProps: ["coverage_cov"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        coverage_cov: "Coverage calculated from HMIS data",
      },
      label: {
        en: "Coverage calculated from HMIS data",
        fr: "Couverture calculée à partir des données HMIS",
      },
      variantLabel: { en: "Admin Area 3", fr: "Zone administrative 3" },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "HMIS-derived health service coverage at admin area 3 (district) level.",
          fr: "Couverture des services de santé dérivée du HMIS au niveau de la zone administrative 3 (district).",
        },
        methodology: {
          en: "AVG of district-level coverage calculated as HMIS service volumes divided by district population denominators. Finest geographic resolution for coverage monitoring.",
          fr: "Moyenne de la couverture au niveau du district calculée comme volumes de services HMIS divisés par dénominateurs de population du district.",
        },
        interpretation: {
          en: "Enables district-level targeting and operational planning. Useful for identifying micro-level coverage gaps. Interpret with caution if sample sizes small.",
          fr: "Permet le ciblage au niveau du district et la planification opérationnelle. Utile pour identifier les lacunes de couverture au micro-niveau.",
        },
        typicalRange: {
          en: "0-100%. Greater variation expected than higher geographic levels due to smaller denominators and sample sizes.",
          fr: "0-100%. Plus grande variation attendue que les niveaux géographiques supérieurs en raison de plus petits dénominateurs.",
        },
        caveats: {
          en: "District-level denominators may have substantial uncertainty. Population mobility and small sample sizes increase volatility. Only available when ANALYSIS_LEVEL includes admin_area_3.",
          fr: "Les dénominateurs au niveau du district peuvent avoir une incertitude substantielle. Disponible uniquement lorsque ANALYSIS_LEVEL inclut admin_area_3.",
        },
        useCases: [
          {
            en: "District-level operational planning",
            fr: "Planification opérationnelle au niveau du district",
          },
          {
            en: "Identify micro-level coverage gaps",
            fr: "Identifier les lacunes de couverture au micro-niveau",
          },
          {
            en: "Support targeted facility supervision",
            fr: "Soutenir la supervision ciblée des établissements",
          },
        ],
        relatedMetrics: ["m4-01-01", "m4-02-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_3, and year (all required). Consider aggregating to admin_area_2 if district-level estimates appear unstable.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_3 et year (tous requis). Considérer l'agrégation à admin_area_2 si les estimations au niveau district semblent instables.",
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
