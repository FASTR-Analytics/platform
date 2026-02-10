import type { ModuleDefinitionJSON } from "lib";

export const definition = {
  label: { en: "M3. Service utilization", fr: "M3. Utilisation des services" },
  prerequisites: ["m001", "m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "03_module_service_utilization.R",
    commit: "main",
  },
  assetsToImport: [],
  dataSources: [
    {
      sourceType: "dataset",
      replacementString: "PROJECT_DATA_HMIS",
      datasetType: "hmis",
    },
    {
      replacementString: "M1_output_outliers.csv",
      sourceType: "results_object",
      resultsObjectId: "M1_output_outliers.csv",
      moduleId: "m001",
    },
    {
      replacementString: "M2_adjusted_data_admin_area.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_admin_area.csv",
      moduleId: "m002",
    },
    {
      replacementString: "M2_adjusted_data.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data.csv",
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
      id: "M3_service_utilization.csv",
      description:
        "Service utilization data with adjusted volumes for all adjustment scenarios",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        count_final_none: "NUMERIC",
        count_final_outliers: "NUMERIC",
        count_final_completeness: "NUMERIC",
        count_final_both: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_1.csv",
      description: "National-level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_2.csv",
      description: "Admin area 2 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_3.csv",
      description: "Admin area 3 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_4.csv",
      description: "Admin area 4 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_chartout.csv",
      description: "Control chart analysis results with tagged anomalies",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_1.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 1)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_2.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 2)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_3.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 3)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_4.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 4)",
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
      id: "m3-01-01",
      resultsObjectId: "M3_service_utilization.csv",
      valueProps: [
        "count_final_none",
        "count_final_outliers",
        "count_final_completeness",
        "count_final_both",
      ],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_final_none: "Number of services reported",
        count_final_outliers: "Number of services after outlier adjustment",
        count_final_completeness:
          "Number of services after completeness adjustment",
        count_final_both:
          "Number of services after both outlier and completeness adjustment",
      },
      label: { en: "Number of services reported, by adjustment type", fr: "Nombre de services déclarés, par type d'ajustement" },
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Total service volumes across four data quality adjustment scenarios: unadjusted, outlier-adjusted, completeness-adjusted, and both adjustments combined.",
          fr:
            "Volumes totaux de services à travers quatre scénarios d'ajustement de qualité: non ajusté, ajusté pour aberrants, ajusté pour complétude, et les deux ajustements combinés.",
        },
        methodology: {
          en:
            "SUM of service counts under each adjustment type. Four values are presented: (1) raw reported volumes, (2) outlier-adjusted volumes, (3) completeness-adjusted volumes, (4) fully-adjusted volumes with both corrections applied.",
          fr:
            "Somme des comptes de services sous chaque type d'ajustement. Quatre valeurs sont présentées: (1) volumes bruts déclarés, (2) volumes ajustés pour aberrants, (3) volumes ajustés pour complétude, (4) volumes totalement ajustés.",
        },
        interpretation: {
          en:
            "Comparing the four adjustment types reveals the impact of data quality corrections on service totals. Large differences between unadjusted and adjusted values indicate significant data quality issues. Users can select which adjustment scenario to use for subsequent analysis based on their data quality tolerance.",
          fr:
            "La comparaison des quatre types d'ajustement révèle l'impact des corrections de qualité sur les totaux de services. De grandes différences indiquent des problèmes de qualité importants.",
        },
        typicalRange: {
          en:
            "Varies by service type and dataset quality. Completeness adjustment typically increases totals; outlier adjustment may increase or decrease totals.",
          fr:
            "Varie selon le type de service et la qualité du jeu de données. L'ajustement de complétude augmente généralement les totaux.",
        },
        caveats: {
          en:
            "The appropriate adjustment type depends on analytical goals. Conservative analyses may prefer minimal adjustment; comprehensive coverage estimates may require full adjustment. Maternal/neonatal/under-5 deaths are excluded from all adjustments.",
          fr:
            "Le type d'ajustement approprié dépend des objectifs analytiques. Les décès maternels/néonatals/moins de 5 ans sont exclus de tous les ajustements.",
        },
        useCases: [
          {
            en: "Compare impact of different adjustment approaches",
            fr:
              "Comparer l'impact de différentes approches d'ajustement",
          },
          {
            en: "Select appropriate data version for analysis",
            fr: "Sélectionner la version de données appropriée pour l'analyse",
          },
          {
            en: "Document data processing decisions",
            fr: "Documenter les décisions de traitement des données",
          },
        ],
        relatedMetrics: ["m2-01-01", "m2-01-02", "m2-01-03"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id (required) to see adjustment impact per service. Time series reveals if data quality improves over time. Regional disaggregation shows geographic variation in adjustment needs.",
          fr:
            "Toujours désagréger par indicator_common_id (requis) pour voir l'impact de l'ajustement par service. Les séries temporelles révèlent si la qualité s'améliore.",
        },
      },
      vizPresets: [{
        id: "volume-monthly",
        label: { en: "Service volume over time (monthly)", fr: "Volume de services dans le temps (mensuel)" },
        description: { en: "Line chart showing monthly service volume by indicator", fr: "Graphique linéaire montrant le volume de services mensuel par indicateur" },
        createDefaultVisualizationOnInstall: "45f2bcd8-879d-4423-a4b0-a84127e168bf",
        allowedFilters: ["indicator_common_id"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "period_id",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "cell" }],
            filterBy: [],
            valuesFilter: ["count_final_outliers"],
          },
          s: { content: "lines" },
          t: {
            caption: { en: "Service utilization over time", fr: "Utilisation des services dans le temps" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Yearly volume is adjusted for outliers.", fr: "Le volume annuel est ajusté pour les valeurs aberrantes." },
          },
        },
      }, {
        id: "volume-quarterly",
        label: { en: "Volume quarterly change", fr: "Variation trimestrielle du volume" },
        description: { en: "Bar chart showing quarterly volume with quarter-on-quarter change", fr: "Diagramme à barres montrant le volume trimestriel avec variation trimestre par trimestre" },
        createDefaultVisualizationOnInstall: "7196a784-8665-41ad-b563-965c59937def",
        defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
        allowedFilters: ["indicator_common_id"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "quarter_id",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "row" }],
            filterBy: [],
            valuesFilter: ["count_final_outliers"],
          },
          s: { specialBarChart: true, specialBarChartDataLabels: "all-values" },
          t: {
            caption: { en: "Service volume by quarter & quarter-on-quarter change", fr: "Volume de services par trimestre et variation trimestre par trimestre" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Service volume is adjusted for outliers.", fr: "Le volume de services est ajusté pour les valeurs aberrantes." },
          },
        },
      }, {
        id: "volume-annual",
        label: { en: "Volume annual change", fr: "Variation annuelle du volume" },
        description: { en: "Bar chart showing annual volume with year-on-year change", fr: "Diagramme à barres montrant le volume annuel avec variation d'une année sur l'autre" },
        createDefaultVisualizationOnInstall: "cfc11e32-5102-484c-b242-892bb132c410",
        allowedFilters: ["indicator_common_id"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "row" }],
            filterBy: [],
            valuesFilter: ["count_final_outliers"],
          },
          s: { specialBarChart: true, specialBarChartDataLabels: "all-values" },
          t: {
            caption: { en: "Service volume by year & year-on-year change", fr: "Volume de services par année et variation d'une année sur l'autre" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Service volume is adjusted for outliers.", fr: "Le volume de services est ajusté pour les valeurs aberrantes." },
          },
        },
      }, {
        id: "volume-subnational",
        label: { en: "Volume annual change by region", fr: "Variation annuelle du volume par région" },
        description: { en: "Bar chart showing annual volume change by indicator and admin area", fr: "Diagramme à barres montrant la variation annuelle du volume par indicateur et zone administrative" },
        createDefaultVisualizationOnInstall: "20658bc8-2b24-4adc-8090-407c6e34f22a",
        allowedFilters: ["indicator_common_id", "admin_area_2"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "indicator_common_id", disDisplayOpt: "row" },
              { disOpt: "admin_area_2", disDisplayOpt: "col" },
            ],
            filterBy: [],
            valuesFilter: ["count_final_outliers"],
          },
          s: { scale: 1.7, specialBarChart: true, specialBarChartDataLabels: "all-values" },
          t: {
            caption: { en: "Service volume by year & year-on-year change", fr: "Volume de services par année et variation d'une année sur l'autre" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "Yearly volume is adjusted for outliers.", fr: "Le volume annuel est ajusté pour les valeurs aberrantes." },
          },
        },
      }, {
        id: "dq-comparison",
        label: { en: "Data quality adjustment comparison", fr: "Comparaison des ajustements de qualité des données" },
        description: { en: "Line chart comparing volume under different adjustment scenarios", fr: "Graphique linéaire comparant le volume selon différents scénarios d'ajustement" },
        createDefaultVisualizationOnInstall: "508f17cc-fbfd-4585-a2e8-8242234898c3",
        allowedFilters: ["indicator_common_id"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "year",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "col" }],
            filterBy: [{ disOpt: "indicator_common_id", values: ["anc1", "anc4", "bcg", "delivery", "penta1", "penta3"] }],
            valuesFilter: ["count_final_outliers", "count_final_none", "count_final_completeness", "count_final_both"],
          },
          s: {
            scale: 1.8,
            colorScale: "custom",
            customSeriesStyles: [
              { color: "#00897b", lineStyle: "solid", strokeWidth: 5 },
              { color: "#757575", lineStyle: "solid", strokeWidth: 5 },
              { color: "#8e24aa", lineStyle: "solid", strokeWidth: 5 },
              { color: "#7cb342", lineStyle: "solid", strokeWidth: 5 },
            ],
          },
          t: {
            caption: { en: "Change in volume due to data quality adjustments", fr: "Variation du volume due aux ajustements de qualité des données" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
          },
        },
      }],
    },
    {
      id: "m3-02-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_1.csv",
      label: { en: "Actual vs expected service volume", fr: "Volume de services réel vs attendu" },
      variantLabel: { en: "National", fr: "National" },
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Comparison of actual reported service volumes against model-predicted expected volumes at national level.",
          fr:
            "Comparaison des volumes de services réels déclarés par rapport aux volumes attendus prédits par modèle au niveau national.",
        },
        methodology: {
          en:
            "SUM of actual reported counts vs SUM of expected counts from robust regression models. Expected volumes are calculated using panel regression with time trends, seasonal patterns, and disruption flags. Only periods with differences exceeding the configured threshold are included.",
          fr:
            "Somme des comptes réels déclarés vs somme des comptes attendus des modèles de régression robustes. Les volumes attendus sont calculés par régression de panel.",
        },
        interpretation: {
          en:
            "Deviations between actual and expected volumes indicate potential service disruptions or anomalies. Periods where actual falls below expected suggest service delivery problems; actual above expected may indicate data quality issues, campaigns, or genuine increases in demand.",
          fr:
            "Les écarts entre volumes réels et attendus indiquent des perturbations potentielles de services. Les périodes où le réel est inférieur à l'attendu suggèrent des problèmes de prestation.",
        },
        typicalRange: {
          en:
            "Expected volumes should closely track actual volumes in stable periods. Deviations during crises, campaigns, or data system changes are normal.",
          fr:
            "Les volumes attendus devraient suivre de près les volumes réels en périodes stables. Les écarts pendant les crises sont normaux.",
        },
        caveats: {
          en:
            "Model quality depends on sufficient historical data and stable baseline periods. Expected values are only shown when difference exceeds the configured DIFFPERCENT threshold (default 10%), so small deviations are filtered out.",
          fr:
            "La qualité du modèle dépend de données historiques suffisantes. Les valeurs attendues ne sont affichées que lorsque la différence dépasse le seuil DIFFPERCENT configuré.",
        },
        useCases: [
          {
            en: "Identify service delivery disruptions",
            fr: "Identifier les perturbations de la prestation de services",
          },
          {
            en: "Validate data quality during specific periods",
            fr: "Valider la qualité des données pendant des périodes spécifiques",
          },
          {
            en: "Track service recovery after emergencies",
            fr: "Suivre la récupération des services après les urgences",
          },
        ],
        relatedMetrics: ["m3-02-02", "m3-03-01", "m3-04-01", "m3-05-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id (required) to see service-specific patterns. Time series visualization is essential for identifying disruption periods and recovery trends.",
          fr:
            "Toujours désagréger par indicator_common_id (requis) pour voir les modèles spécifiques au service. La visualisation en séries temporelles est essentielle.",
        },
      },
      vizPresets: [{
        id: "disruption-chart",
        label: { en: "Disruptions and surpluses (national)", fr: "Perturbations et excédents (national)" },
        description: { en: "Area chart showing actual vs expected service volume nationally", fr: "Graphique en aires montrant le volume de services réel vs attendu au niveau national" },
        createDefaultVisualizationOnInstall: "e51a15fd-acfc-4da9-8797-b462b9626cff",
        allowedFilters: ["indicator_common_id"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "period_id",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "cell" }],
            filterBy: [],
          },
          s: { scale: 2.5, content: "areas", diffAreas: true },
          t: {
            caption: { en: "Disruptions and surpluses in service volume, nationally", fr: "Perturbations et excédents du volume de services, au niveau national" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "This graph quantifies changes in service volume compared to historical trends and accounting for seasonality. These signals should be triangulated to other data and contextual knowledge to determine if the results are an artifact of data quality. Unexpected volume changes are estimated by comparing the observed volume to the expected volume based on historical trends and seasonality. Previous large unexpected changes in the historical data are removed. This analysis is an interrupted time series regression with facility-level fixed effects.", fr: "Ce graphique quantifie les changements du volume de services par rapport aux tendances historiques et en tenant compte de la saisonnalité. Ces signaux doivent être triangulés avec d'autres données et connaissances contextuelles pour déterminer si les résultats sont un artefact de la qualité des données. Les changements de volume inattendus sont estimés en comparant le volume observé au volume attendu basé sur les tendances historiques et la saisonnalité. Les grands changements inattendus précédents dans les données historiques sont supprimés. Cette analyse est une régression de séries temporelles interrompues avec effets fixes au niveau de l'établissement." },
          },
        },
      }],
    },
    {
      id: "m3-02-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_1.csv",
      label: { en: "Difference between actual and expected service volume", fr: "Différence entre le volume de services réel et attendu" },
      variantLabel: { en: "National", fr: "National" },
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Percentage difference between actual and model-predicted service volumes at national level.",
          fr:
            "Différence en pourcentage entre les volumes de services réels et prédits par modèle au niveau national.",
        },
        methodology: {
          en:
            "Calculated as (actual - expected) / expected. Positive values indicate volumes above expected; negative values indicate shortfalls. Expected volumes come from robust panel regression models accounting for trends and seasonality.",
          fr:
            "Calculé comme (réel - attendu) / attendu. Les valeurs positives indiquent des volumes au-dessus de l'attendu; les valeurs négatives indiquent des déficits.",
        },
        interpretation: {
          en:
            "Negative values indicate service disruptions or underperformance relative to expected levels. Values below -20% warrant investigation. Positive values may reflect data quality issues, special campaigns, increased demand, or genuine service improvements. Use alongside control chart flags for context.",
          fr:
            "Les valeurs négatives indiquent des perturbations de services. Les valeurs inférieures à -20% nécessitent une investigation. Les valeurs positives peuvent refléter des problèmes de qualité.",
        },
        typicalRange: {
          en:
            "±10% is within normal variation; ±10-30% indicates moderate disruption; >30% deviation suggests major disruption or data issues.",
          fr:
            "±10% est dans la variation normale; ±10-30% indique une perturbation modérée; >30% suggère une perturbation majeure.",
        },
        caveats: {
          en:
            "Percentage differences can be misleading for indicators with small absolute volumes. Model predictions assume stable baseline patterns - structural changes in the health system may appear as disruptions.",
          fr:
            "Les différences en pourcentage peuvent être trompeuses pour les indicateurs avec de petits volumes absolus. Les prédictions du modèle supposent des modèles de base stables.",
        },
        useCases: [
          {
            en: "Quantify severity of service disruptions",
            fr: "Quantifier la gravité des perturbations de services",
          },
          {
            en: "Prioritize geographic areas for intervention",
            fr: "Prioriser les zones géographiques pour l'intervention",
          },
          {
            en: "Track service restoration progress",
            fr: "Suivre les progrès de restauration des services",
          },
        ],
        relatedMetrics: ["m3-02-01", "m3-03-02", "m3-04-02", "m3-05-02"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id (required). Time series shows disruption evolution and recovery patterns. Consider using absolute differences (m3-02-01) alongside percentages for low-volume indicators.",
          fr:
            "Toujours désagréger par indicator_common_id (requis). Les séries temporelles montrent l'évolution de la perturbation et les modèles de récupération.",
        },
      },
    },
    {
      id: "m3-03-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_2.csv",
      label: { en: "Actual vs expected service volume", fr: "Volume de services réel vs attendu" },
      variantLabel: { en: "Admin area 2", fr: "Zone administrative 2" },
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Comparison of actual reported service volumes against model-predicted expected volumes at admin area 2 (province/state) level.",
          fr:
            "Comparaison des volumes de services réels contre volumes attendus au niveau de la zone administrative 2 (province/état).",
        },
        methodology: {
          en:
            "SUM of actual vs expected counts from area-specific robust regression models. Expected volumes account for local time trends and seasonal patterns. Only periods exceeding the difference threshold are shown.",
          fr:
            "Somme des comptes réels vs attendus des modèles de régression robustes spécifiques à la zone. Les volumes attendus tiennent compte des tendances temporelles locales.",
        },
        interpretation: {
          en:
            "Enables subnational identification of service disruptions. Compare across admin areas to identify geographic hotspots of service delivery problems. Areas with persistent negative deviations need targeted support.",
          fr:
            "Permet l'identification sous-nationale des perturbations de services. Comparer entre zones pour identifier les points chauds géographiques de problèmes de prestation.",
        },
        typicalRange: {
          en:
            "Expected to closely match actual in stable regions. Deviations indicate local disruptions, data issues, or demand changes.",
          fr:
            "Attendu pour correspondre étroitement au réel dans les régions stables. Les écarts indiquent des perturbations locales.",
        },
        caveats: {
          en:
            "Smaller geographic areas may have more volatile patterns, making model predictions less reliable. Consider aggregating to higher levels if area-specific models perform poorly.",
          fr:
            "Les zones géographiques plus petites peuvent avoir des modèles plus volatils, rendant les prédictions moins fiables.",
        },
        useCases: [
          {
            en: "Identify regions with service disruptions",
            fr: "Identifier les régions avec des perturbations de services",
          },
          {
            en: "Allocate resources to underperforming areas",
            fr:
              "Allouer des ressources aux zones sous-performantes",
          },
          {
            en: "Compare disruption patterns across regions",
            fr: "Comparer les modèles de perturbation entre régions",
          },
        ],
        relatedMetrics: ["m3-03-02", "m3-02-01", "m3-04-01", "m3-05-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_2 (both required). Time series reveals when and where disruptions occurred. Map visualization effectively shows geographic distribution of service gaps.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_2 (tous deux requis). Les séries temporelles révèlent quand et où les perturbations se sont produites.",
        },
      },
      vizPresets: [{
        id: "disruption-chart",
        label: { en: "Disruptions and surpluses (subnational)", fr: "Perturbations et excédents (sous-national)" },
        description: { en: "Area chart showing actual vs expected service volume by region", fr: "Graphique en aires montrant le volume de services réel vs attendu par région" },
        createDefaultVisualizationOnInstall: "e1916b10-433a-4b19-b376-491a66b81f11",
        allowedFilters: ["indicator_common_id", "admin_area_2"],
        config: {
          d: {
            type: "timeseries",
            periodOpt: "period_id",
            valuesDisDisplayOpt: "series",
            disaggregateBy: [
              { disOpt: "indicator_common_id", disDisplayOpt: "col" },
              { disOpt: "admin_area_2", disDisplayOpt: "row" },
            ],
            filterBy: [{ disOpt: "indicator_common_id", values: ["anc1", "anc4", "bcg", "delivery", "penta3", "penta1"] }],
          },
          s: { scale: 1.6, content: "areas", diffAreas: true },
          t: {
            caption: { en: "Disruptions and surpluses in service volume, sub-nationally", fr: "Perturbations et excédents du volume de services, au niveau sous-national" },
            subCaption: { en: "DATE_RANGE", fr: "DATE_RANGE" },
            footnote: { en: "This graph quantifies changes in service volume compared to historical trends and accounting for seasonality. These signals should be triangulated to other data and contextual knowledge to determine if the results are an artifact of data quality. Unexpected volume changes are estimated by comparing the observed volume to the expected volume based on historical trends and seasonality. Previous large unexpected changes in the historical data are removed. This analysis is an interrupted time series regression with facility-level fixed effects.", fr: "Ce graphique quantifie les changements du volume de services par rapport aux tendances historiques et en tenant compte de la saisonnalité. Ces signaux doivent être triangulés avec d'autres données et connaissances contextuelles pour déterminer si les résultats sont un artefact de la qualité des données. Les changements de volume inattendus sont estimés en comparant le volume observé au volume attendu basé sur les tendances historiques et la saisonnalité. Les grands changements inattendus précédents dans les données historiques sont supprimés. Cette analyse est une régression de séries temporelles interrompues avec effets fixes au niveau de l'établissement." },
          },
        },
      }],
    },
    {
      id: "m3-03-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_2.csv",
      label: { en: "Difference between actual and expected service volume", fr: "Différence entre le volume de services réel et attendu" },
      variantLabel: { en: "Admin area 2", fr: "Zone administrative 2" },
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Percentage difference between actual and expected service volumes at admin area 2 level.",
          fr:
            "Différence en pourcentage entre volumes réels et attendus au niveau de la zone administrative 2.",
        },
        methodology: {
          en:
            "(actual - expected) / expected at subnational level. Quantifies service delivery gaps or surpluses for each province/state.",
          fr:
            "(réel - attendu) / attendu au niveau sous-national. Quantifie les écarts ou excédents de prestation de services.",
        },
        interpretation: {
          en:
            "Negative values indicate regional shortfalls; positive values may indicate improved service delivery or data issues. Compare across regions to identify areas needing support.",
          fr:
            "Les valeurs négatives indiquent des déficits régionaux; les valeurs positives peuvent indiquer une amélioration ou des problèmes de données.",
        },
        typicalRange: {
          en: "±10-30% variation common; >30% deviation warrants investigation.",
          fr: "Variation de ±10-30% commune; écart >30% nécessite investigation.",
        },
        useCases: [
          {
            en: "Quantify regional service gaps",
            fr: "Quantifier les écarts de services régionaux",
          },
          {
            en: "Target interventions to specific areas",
            fr: "Cibler les interventions vers des zones spécifiques",
          },
        ],
        relatedMetrics: ["m3-03-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_2 (both required). Time series reveals disruption patterns over time.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_2 (tous deux requis). Les séries temporelles révèlent les modèles de perturbation au fil du temps.",
        },
      },
    },
    {
      id: "m3-04-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_3.csv",
      label: { en: "Actual vs expected service volume", fr: "Volume de services réel vs attendu" },
      variantLabel: { en: "Admin area 3", fr: "Zone administrative 3" },
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Comparison of actual vs expected service volumes at admin area 3 (district) level.",
          fr:
            "Comparaison des volumes réels vs attendus au niveau de la zone administrative 3 (district).",
        },
        methodology: {
          en:
            "District-level disruption analysis using robust regression models. Enables fine-grained geographic targeting.",
          fr:
            "Analyse de perturbation au niveau du district utilisant des modèles de régression robustes.",
        },
        interpretation: {
          en:
            "Identifies district-specific service delivery problems. Use for operational planning and targeted supervision.",
          fr:
            "Identifie les problèmes de prestation spécifiques au district. Utiliser pour la planification opérationnelle.",
        },
        typicalRange: {
          en:
            "Varies by district size. Expect similar patterns to admin area 2 but with more volatility.",
          fr:
            "Varie selon la taille du district. S'attendre à des modèles similaires à la zone administrative 2 mais avec plus de volatilité.",
        },
        useCases: [
          {
            en: "District-level operational planning",
            fr: "Planification opérationnelle au niveau du district",
          },
        ],
        relatedMetrics: ["m3-04-02", "m3-03-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_3 (both required). Time series and maps reveal district-level patterns.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_3 (tous deux requis). Les séries temporelles et cartes révèlent les modèles au niveau du district.",
        },
      },
    },
    {
      id: "m3-04-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_3.csv",
      label: { en: "Difference between actual and expected service volume", fr: "Différence entre le volume de services réel et attendu" },
      variantLabel: { en: "Admin area 3", fr: "Zone administrative 3" },
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Percentage difference between actual and expected service volumes at district level.",
          fr:
            "Différence en pourcentage entre volumes réels et attendus au niveau du district.",
        },
        methodology: {
          en:
            "(actual - expected) / expected at district level. Quantifies local service delivery performance.",
          fr:
            "(réel - attendu) / attendu au niveau du district. Quantifie la performance locale de prestation.",
        },
        interpretation: {
          en:
            "Enables district-level performance monitoring. Prioritize districts with largest negative deviations.",
          fr:
            "Permet la surveillance de la performance au niveau du district. Prioriser les districts avec les plus grands écarts négatifs.",
        },
        typicalRange: {
          en:
            "±10-40% variation common at district level; >40% deviation warrants investigation.",
          fr:
            "Variation de ±10-40% commune au niveau du district; écart >40% nécessite investigation.",
        },
        useCases: [
          {
            en: "District performance monitoring",
            fr: "Surveillance de la performance du district",
          },
        ],
        relatedMetrics: ["m3-04-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_3 (both required). Compare with admin area 2 for context.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_3 (tous deux requis). Comparer avec la zone administrative 2 pour le contexte.",
        },
      },
    },
    {
      id: "m3-05-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_4.csv",
      label: { en: "Actual vs expected service volume", fr: "Volume de services réel vs attendu" },
      variantLabel: { en: "Admin area 4", fr: "Zone administrative 4" },
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_4",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Comparison of actual vs expected service volumes at admin area 4 (sub-district) level.",
          fr:
            "Comparaison des volumes réels vs attendus au niveau de la zone administrative 4 (sous-district).",
        },
        methodology: {
          en:
            "Sub-district level disruption analysis. Only generated when RUN_ADMIN_AREA_4_ANALYSIS parameter is enabled.",
          fr:
            "Analyse de perturbation au niveau sous-district. Généré uniquement si le paramètre RUN_ADMIN_AREA_4_ANALYSIS est activé.",
        },
        interpretation: {
          en:
            "Highest geographic resolution for disruption detection. Use for micro-level targeting and facility-level support.",
          fr:
            "Plus haute résolution géographique pour la détection de perturbations. Utiliser pour le ciblage micro-niveau.",
        },
        typicalRange: {
          en:
            "Highly variable by sub-district. Expect greater volatility than higher geographic levels.",
          fr:
            "Très variable selon le sous-district. S'attendre à plus de volatilité que les niveaux géographiques supérieurs.",
        },
        useCases: [
          {
            en: "Facility-catchment area analysis",
            fr: "Analyse de la zone de desserte de l'établissement",
          },
        ],
        relatedMetrics: ["m3-05-02"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_4 (both required). Only available when RUN_ADMIN_AREA_4_ANALYSIS enabled.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_4 (tous deux requis). Disponible uniquement si RUN_ADMIN_AREA_4_ANALYSIS activé.",
        },
      },
    },
    {
      id: "m3-05-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_4.csv",
      label: { en: "Difference between actual and expected service volume", fr: "Différence entre le volume de services réel et attendu" },
      variantLabel: { en: "Admin area 4", fr: "Zone administrative 4" },
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_4",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en:
            "Percentage difference between actual and expected service volumes at sub-district level.",
          fr:
            "Différence en pourcentage entre volumes réels et attendus au niveau sous-district.",
        },
        methodology: {
          en:
            "(actual - expected) / expected at sub-district level. Finest geographic granularity for performance assessment.",
          fr:
            "(réel - attendu) / attendu au niveau sous-district. Granularité géographique la plus fine pour l'évaluation.",
        },
        interpretation: {
          en:
            "Enables targeted facility-level interventions. Small sample sizes at this level may increase volatility.",
          fr:
            "Permet des interventions ciblées au niveau de l'établissement. Les petites tailles d'échantillon peuvent augmenter la volatilité.",
        },
        typicalRange: {
          en:
            "±20-50% variation common; high volatility expected at this granular level.",
          fr:
            "Variation de ±20-50% commune; forte volatilité attendue à ce niveau granulaire.",
        },
        useCases: [
          {
            en: "Facility-specific performance tracking",
            fr: "Suivi de la performance spécifique à l'établissement",
          },
        ],
        relatedMetrics: ["m3-05-01"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by indicator_common_id and admin_area_4 (both required). Interpret with caution due to small sample sizes.",
          fr:
            "Toujours désagréger par indicator_common_id et admin_area_4 (tous deux requis). Interpréter avec prudence en raison de petites tailles d'échantillon.",
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
        description: "Count variable to use for modeling",
        replacementString: "SELECTEDCOUNT",
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
        description: "Count variable to use for visualization",
        replacementString: "VISUALIZATIONCOUNT",
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
        description: "Run district-level model (admin_area_3)",
        replacementString: "RUN_DISTRICT_MODEL",
        input: {
          inputType: "select",
          options: [
            { value: `TRUE`, label: "Yes" },
            { value: `FALSE`, label: "No" },
          ],
          valueType: "number",
          defaultValue: "FALSE",
        },
      },
      {
        description: "Run admin_area_4 analysis",
        replacementString: "RUN_ADMIN_AREA_4_ANALYSIS",
        input: {
          inputType: "select",
          options: [
            { value: `TRUE`, label: "Yes" },
            { value: `FALSE`, label: "No" },
          ],
          valueType: "number",
          defaultValue: "FALSE",
        },
      },
      {
        description: "Threshold for MAD-based control limits",
        replacementString: "MADS_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "1.5",
        },
      },
      {
        description: "Smoothing window (k)",
        replacementString: "SMOOTH_K",
        input: {
          inputType: "number",
          defaultValue: "7",
        },
      },
      {
        description: "Dip threshold (proportion of expected)",
        replacementString: "DIP_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "0.9",
        },
      },
      {
        description: "Difference percent threshold for visualization",
        replacementString: "DIFFPERCENT",
        input: {
          inputType: "number",
          defaultValue: "10",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
