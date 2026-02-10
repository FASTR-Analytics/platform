import type { ModuleDefinitionJSON } from "lib";

export const definition = {
  label: "M6. Coverage estimates ~ new, part 2",
  prerequisites: ["m005"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "06_module_coverage_estimates_part2.R",
    commit: "main",
  },
  assetsToImport: [],
  dataSources: [
    {
      replacementString: "M5_combined_results_national.csv",
      sourceType: "results_object",
      resultsObjectId: "M5_combined_results_national.csv",
      moduleId: "m005",
    },
    {
      replacementString: "M5_combined_results_admin2.csv",
      sourceType: "results_object",
      resultsObjectId: "M5_combined_results_admin2.csv",
      moduleId: "m005",
    },
    {
      replacementString: "M5_combined_results_admin3.csv",
      sourceType: "results_object",
      resultsObjectId: "M5_combined_results_admin3.csv",
      moduleId: "m005",
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
      id: "M6_coverage_estimation_national.csv",
      description: "Coverage estimates (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
    },
    {
      id: "M6_coverage_estimation_admin2.csv",
      description: "Coverage results (Admin area 2)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
    },
    {
      id: "M6_coverage_estimation_admin3.csv",
      description: "Coverage results (Admin area 3)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
    },
    // {
    //   id: "M5_coverage_estimation_admin2_simplified.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //
    // },
    // {
    //   id: "M5_coverage_estimation_admin3_simplified.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //
    // },
    // {
    //   id: "M4_selected_denominator_per_indicator.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //
    // },
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
      id: "m6-01-01",
      resultsObjectId: "M6_coverage_estimation_national.csv",
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
      label: "Coverage (all estimation types)",
      variantLabel: "National",
      requiredDisaggregationOptions: ["indicator_common_id", "year"],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "Comprehensive coverage estimates at national level using user-selected denominators, combining survey benchmarks with HMIS-derived trends.",
          fr: "Estimations de couverture complètes au niveau national utilisant des dénominateurs sélectionnés par l'utilisateur, combinant repères d'enquête avec tendances dérivées du HMIS.",
        },
        methodology: {
          en: "AVG of three coverage types: (1) original survey estimates when available, (2) survey estimates projected forward using HMIS year-over-year deltas (additive method), (3) HMIS-derived coverage using user-specified denominators. Denominators selected via module parameters (e.g., DENOM_ANC1, DENOM_PENTA1).",
          fr: "Moyenne de trois types de couverture: (1) estimations d'enquête originales, (2) estimations d'enquête projetées en utilisant les deltas HMIS année par année, (3) couverture dérivée du HMIS avec dénominateurs spécifiés.",
        },
        interpretation: {
          en: "This is the final, policy-relevant coverage metric combining best available data sources. Survey estimates anchor coverage to gold-standard benchmarks; projected estimates fill inter-survey gaps using HMIS momentum; HMIS coverage enables annual monitoring. Concordance between the three types validates data quality and denominator selection.",
          fr: "C'est la métrique de couverture finale pertinente pour les politiques, combinant les meilleures sources de données disponibles. Les estimations d'enquête ancrent la couverture aux repères étalon-or.",
        },
        typicalRange: {
          en: "0-100%. Coverage >100% indicates denominator or data quality problems requiring investigation.",
          fr: "0-100%. Couverture >100% indique des problèmes de dénominateur ou de qualité des données nécessitant investigation.",
        },
        caveats: {
          en: "Projection method assumes HMIS trends accurately reflect true coverage changes. Denominator selection (via module parameters) critically affects results - inappropriate denominators produce implausible coverage. Survey timing and data quality affect baseline accuracy.",
          fr: "La méthode de projection suppose que les tendances HMIS reflètent avec précision les vrais changements de couverture. La sélection du dénominateur affecte de manière critique les résultats.",
        },
        useCases: [
          {
            en: "Official coverage reporting and monitoring",
            fr: "Déclaration et surveillance officielle de la couverture",
          },
          {
            en: "Track progress toward health coverage targets",
            fr: "Suivre les progrès vers les objectifs de couverture sanitaire",
          },
          {
            en: "Validate HMIS-survey concordance",
            fr: "Valider la concordance HMIS-enquête",
          },
          {
            en: "Generate annual coverage time series",
            fr: "Générer des séries temporelles de couverture annuelles",
          },
        ],
        relatedMetrics: ["m6-02-01", "m6-03-01", "m4a-02-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id and year (both required). Compare the three coverage types to assess data quality - they should show consistent trends if both HMIS and denominators are reliable. Time series reveals coverage evolution and inter-survey projection accuracy.",
          fr: "Toujours désagréger par indicator_common_id et year (tous deux requis). Comparer les trois types de couverture pour évaluer la qualité des données.",
        },
      },
      vizPresets: [{
        id: "coverage-timeseries",
        label: { en: "Coverage timeseries (national)", fr: "Coverage timeseries (national)" },
        description: { en: "National coverage timeseries with survey benchmarks", fr: "National coverage timeseries with survey benchmarks" },
        createDefaultVisualizationOnInstall: "2a74f737-78e5-41a1-8f6d-7a3f59be2d19",
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
          s: { scale: 2.7, content: "lines", showDataLabels: true, specialCoverageChart: true },
          t: {
            caption: { en: "Coverage estimates for REPLICANT", fr: "Coverage estimates for REPLICANT" },
            subCaption: { en: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.", fr: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors." },
            footnote: { en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.", fr: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration." },
          },
        },
      }],
    },
    {
      id: "m6-02-01",
      resultsObjectId: "M6_coverage_estimation_admin2.csv",
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
      label: "Coverage (all estimation types)",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "Subnational coverage estimates at admin area 2 level combining survey, projected, and HMIS-derived values.",
          fr: "Estimations de couverture sous-nationales au niveau de la zone administrative 2 combinant valeurs d'enquête, projetées et dérivées du HMIS.",
        },
        methodology: {
          en: "AVG of survey, projected survey, and HMIS coverage at regional level. Uses user-specified denominators and survey projection methodology.",
          fr: "Moyenne de la couverture d'enquête, d'enquête projetée et HMIS au niveau régional. Utilise des dénominateurs spécifiés par l'utilisateur.",
        },
        interpretation: {
          en: "Enables regional equity analysis and geographic targeting. Compare across admin areas to identify coverage disparities. Three estimation types validate subnational data quality.",
          fr: "Permet l'analyse de l'équité régionale et le ciblage géographique. Comparer entre zones administratives pour identifier les disparités de couverture.",
        },
        typicalRange: {
          en: "0-100%. Regional variation expected; remote areas typically have lower coverage.",
          fr: "0-100%. Variation régionale attendue; zones éloignées ont généralement une couverture plus faible.",
        },
        useCases: [
          {
            en: "Regional coverage equity monitoring",
            fr: "Surveillance de l'équité de couverture régionale",
          },
          {
            en: "Geographic targeting of health interventions",
            fr: "Ciblage géographique des interventions sanitaires",
          },
        ],
        relatedMetrics: ["m6-02-02", "m6-01-01", "m6-03-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_2, and year (all required). Compare three coverage types for regional data quality validation.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_2 et year (tous requis). Comparer trois types de couverture pour la validation de la qualité des données régionales.",
        },
      },
      vizPresets: [{
        id: "coverage-timeseries",
        label: { en: "Coverage timeseries by region", fr: "Coverage timeseries by region" },
        description: { en: "Coverage trends over time by admin area 2", fr: "Coverage trends over time by admin area 2" },
        createDefaultVisualizationOnInstall: "e5f8740b-a690-4a84-a0cd-05d529676f26",
        needsReplicant: true,
        allowedFilters: ["admin_area_2"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "admin_area_2", disDisplayOpt: "cell" },
              { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
            ],
            filterBy: [],
            includeNationalForAdminArea2: true,
            selectedReplicantValue: "anc1",
          },
          s: { scale: 1.7, content: "lines", showDataLabels: true, specialCoverageChart: true },
          t: {
            caption: { en: "Subnational coverage estimates for REPLICANT", fr: "Subnational coverage estimates for REPLICANT" },
            subCaption: { en: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.", fr: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors." },
            footnote: { en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.", fr: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration." },
          },
        },
      }, {
        id: "coverage-bar",
        label: { en: "Coverage bar chart by region", fr: "Coverage bar chart by region" },
        description: { en: "Bar chart comparing coverage across regions", fr: "Bar chart comparing coverage across regions" },
        createDefaultVisualizationOnInstall: "9d4977b4-0d87-44e1-b2bd-3eddcba623f4",
        defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
        needsReplicant: true,
        allowedFilters: ["admin_area_2"],
        config: {
          d: {
            type: "chart",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "admin_area_2", disDisplayOpt: "indicator" },
              { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
            ],
            filterBy: [],
            selectedReplicantValue: "anc4",
            valuesFilter: ["coverage_cov"],
          },
          s: { showDataLabels: true, colorScale: "single-grey", sortIndicatorValues: "descending" },
          t: {
            caption: { en: "Sub-national level coverage estimates, REPLICANT", fr: "Sub-national level coverage estimates, REPLICANT" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.", fr: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration." },
          },
        },
      }],
    },
    {
      id: "m6-02-02",
      resultsObjectId: "M6_coverage_estimation_admin2.csv",
      valueProps: ["coverage_cov"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        coverage_cov: "Coverage calculated from HMIS data",
      },
      label: "Coverage (HMIS only)",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "HMIS-only coverage estimates at admin area 2 level for simplified regional monitoring.",
          fr: "Estimations de couverture HMIS uniquement au niveau de la zone administrative 2 pour une surveillance régionale simplifiée.",
        },
        methodology: {
          en: "AVG of HMIS-derived coverage only (excludes survey and projected values). Useful for operational dashboards focusing solely on routine data.",
          fr: "Moyenne de la couverture dérivée du HMIS uniquement (exclut les valeurs d'enquête et projetées). Utile pour les tableaux de bord opérationnels.",
        },
        interpretation: {
          en: "Simplified metric for routine monitoring without survey complexity. Use for operational decision-making and trend tracking.",
          fr: "Métrique simplifiée pour la surveillance de routine sans complexité d'enquête. Utiliser pour la prise de décision opérationnelle.",
        },
        typicalRange: {
          en: "0-100%. Should align with full coverage metric (m6-02-01) but may differ from survey estimates.",
          fr: "0-100%. Devrait s'aligner avec la métrique de couverture complète (m6-02-01) mais peut différer des estimations d'enquête.",
        },
        useCases: [
          {
            en: "Operational performance dashboards",
            fr: "Tableaux de bord de performance opérationnelle",
          },
        ],
        relatedMetrics: ["m6-02-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_2, and year (all required). Use for regional operational monitoring.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_2 et year (tous requis). Utiliser pour la surveillance opérationnelle régionale.",
        },
      },
    },
    {
      id: "m6-03-01",
      resultsObjectId: "M6_coverage_estimation_admin3.csv",
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
      label: "Coverage (all estimation types)",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "District-level coverage estimates combining survey, projected, and HMIS-derived values.",
          fr: "Estimations de couverture au niveau du district combinant valeurs d'enquête, projetées et dérivées du HMIS.",
        },
        methodology: {
          en: "AVG of survey, projected survey, and HMIS coverage at district level. Finest geographic resolution for coverage estimation.",
          fr: "Moyenne de la couverture d'enquête, d'enquête projetée et HMIS au niveau du district. Résolution géographique la plus fine.",
        },
        interpretation: {
          en: "Enables district-level targeting and micro-planning. Interpret with caution due to smaller sample sizes and denominator uncertainty.",
          fr: "Permet le ciblage au niveau du district et la micro-planification. Interpréter avec prudence en raison de petites tailles d'échantillon.",
        },
        typicalRange: {
          en: "0-100%. Greater variation expected at district level; interpret with caution.",
          fr: "0-100%. Plus grande variation attendue au niveau du district; interpréter avec prudence.",
        },
        useCases: [
          {
            en: "District-level health planning",
            fr: "Planification sanitaire au niveau du district",
          },
        ],
        relatedMetrics: ["m6-03-02", "m6-02-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_3, and year (all required). Compare with admin area 2 for context.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_3 et year (tous requis). Comparer avec la zone administrative 2 pour le contexte.",
        },
      },
      vizPresets: [{
        id: "coverage-timeseries",
        label: { en: "Coverage timeseries by district", fr: "Coverage timeseries by district" },
        description: { en: "Coverage trends over time by admin area 3", fr: "Coverage trends over time by admin area 3" },
        createDefaultVisualizationOnInstall: "e5f8740b-a690-4a84-a0cd-05d529676f27",
        needsReplicant: true,
        allowedFilters: ["admin_area_3"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "admin_area_3", disDisplayOpt: "cell" },
              { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
            ],
            filterBy: [],
            includeNationalForAdminArea2: true,
            selectedReplicantValue: "anc1",
          },
          s: { scale: 1.7, content: "lines", showDataLabels: true, specialCoverageChart: true },
          t: {
            caption: { en: "Subnational coverage estimates for REPLICANT", fr: "Subnational coverage estimates for REPLICANT" },
            subCaption: { en: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.", fr: "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors." },
            footnote: { en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.", fr: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration." },
          },
        },
      }, {
        id: "coverage-bar",
        label: { en: "Coverage bar chart by district", fr: "Coverage bar chart by district" },
        description: { en: "Bar chart comparing coverage across districts", fr: "Bar chart comparing coverage across districts" },
        createDefaultVisualizationOnInstall: "9d4977b4-0d87-44e1-b2bd-3eddcba623f5",
        defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
        needsReplicant: true,
        allowedFilters: ["admin_area_3"],
        config: {
          d: {
            type: "chart",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "admin_area_3", disDisplayOpt: "indicator" },
              { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
            ],
            filterBy: [],
            selectedReplicantValue: "anc4",
            valuesFilter: ["coverage_cov"],
          },
          s: { showDataLabels: true, colorScale: "single-grey", sortIndicatorValues: "descending" },
          t: {
            caption: { en: "Sub-national level coverage estimates, REPLICANT", fr: "Sub-national level coverage estimates, REPLICANT" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.", fr: "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration." },
          },
        },
      }],
    },
    {
      id: "m6-03-02",
      resultsObjectId: "M6_coverage_estimation_admin3.csv",
      valueProps: ["coverage_cov"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        coverage_cov: "Coverage calculated from HMIS data",
      },
      label: "Coverage (HMIS only)",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
      aiDescription: {
        summary: {
          en: "HMIS-only coverage estimates at district level for operational monitoring.",
          fr: "Estimations de couverture HMIS uniquement au niveau du district pour la surveillance opérationnelle.",
        },
        methodology: {
          en: "AVG of HMIS-derived coverage at district level. Excludes survey complexity for simplified operational use.",
          fr: "Moyenne de la couverture dérivée du HMIS au niveau du district. Exclut la complexité de l'enquête pour une utilisation opérationnelle simplifiée.",
        },
        interpretation: {
          en: "District-level operational metric. Use for micro-level performance tracking and facility supervision planning.",
          fr: "Métrique opérationnelle au niveau du district. Utiliser pour le suivi de la performance micro-niveau.",
        },
        typicalRange: {
          en: "0-100%. Highest variation expected at this level; use for operational monitoring only.",
          fr: "0-100%. Variation la plus élevée attendue à ce niveau; utiliser uniquement pour la surveillance opérationnelle.",
        },
        useCases: [
          {
            en: "District health management dashboards",
            fr: "Tableaux de bord de gestion sanitaire de district",
          },
        ],
        relatedMetrics: ["m6-03-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by indicator_common_id, admin_area_3, and year (all required). Simplified metric for district operations.",
          fr: "Toujours désagréger par indicator_common_id, admin_area_3 et year (tous requis). Métrique simplifiée pour les opérations de district.",
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
        description: "DENOM_ANC1",
        replacementString: "DENOM_ANC1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },
            ...[
              "danc1_pregnancy",
              "ddelivery_pregnancy",
              "dbcg_pregnancy",
              "dlivebirths_pregnancy",
              "dwpp_pregnancy",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_ANC4",
        replacementString: "DENOM_ANC4",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_pregnancy",
              "ddelivery_pregnancy",
              "dbcg_pregnancy",
              "dlivebirths_pregnancy",
              "dwpp_pregnancy",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },

      {
        description: "DENOM_DELIVERY",
        replacementString: "DENOM_DELIVERY",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_BCG",
        replacementString: "DENOM_BCG",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_SBA",
        replacementString: "DENOM_SBA",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PNC1_MOTHER",
        replacementString: "DENOM_PNC1_MOTHER",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PNC1",
        replacementString: "DENOM_PNC1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA1",
        replacementString: "DENOM_PENTA1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA2",
        replacementString: "DENOM_PENTA2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA3",
        replacementString: "DENOM_PENTA3",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV1",
        replacementString: "DENOM_OPV1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV2",
        replacementString: "DENOM_OPV2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV3",
        replacementString: "DENOM_OPV3",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_MEASLES1",
        replacementString: "DENOM_MEASLES1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_measles1",
              "ddelivery_measles1",
              "dpenta1_measles1",
              "dbcg_measles1",
              "dlivebirths_measles1",
              "dwpp_measles1",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_MEASLES2",
        replacementString: "DENOM_MEASLES2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_measles2",
              "ddelivery_measles2",
              "dpenta1_measles2",
              "dbcg_measles2",
              "dlivebirths_measles2",
              "dwpp_measles2",
              "danc1_measles2",
              "ddelivery_measles2",
              "dpenta1_measles2",
              "dbcg_measles2",
              "dlivebirths_measles2",
              "dwpp_measles2",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },

      {
        description: "DENOM_VITA",
        replacementString: "DENOM_VITA",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_FULLIMM",
        replacementString: "DENOM_FULLIMM",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
