import type { ModuleDefinitionJSON } from "lib";

export const definition = {
  label: {
    en: "M1. Data quality assessment",
    fr: "M1. Évaluation de la qualité des données",
  },
  prerequisites: [],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "m001_module_data_quality_assessment.R",
    commit: "main",
  },
  assetsToImport: [],
  dataSources: [
    {
      sourceType: "dataset",
      replacementString: "PROJECT_DATA_HMIS",
      datasetType: "hmis",
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
      id: "M1_output_outliers.csv",
      description:
        "Detailed facility-level data with identified outliers and adjusted volumes",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        outlier_flag: "INTEGER NOT NULL",
      },
    },
    {
      id: "M1_output_completeness.csv",
      description:
        "Facility-level completeness data in a detailed long format, including reported and expected months",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        completeness_flag: "INTEGER NOT NULL",
      },
    },
    {
      id: "M1_output_consistency_geo.csv",
      description: "District-level consistency results",
      createTableStatementPossibleColumns: {
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        ratio_type: "TEXT NOT NULL",
        sconsistency: "INTEGER",
      },
    },
    {
      id: "M1_output_dqa.csv",
      description: "Facility-level results from DQA analysis",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        dqa_mean: "NUMERIC NOT NULL",
        dqa_score: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M1_output_outlier_list.csv",
      description: "Outlier list",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        admin_area_1: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        count: "NUMERIC NOT NULL",
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
      id: "m1-01-00",
      hide: true,
      resultsObjectId: "M1_output_outliers.csv",

      valueProps: ["facility_id"],
      valueFunc: "COUNT",
      valueLabelReplacements: {},
      label: { en: "Number of records", fr: "Nombre d'enregistrements" },
      requiredDisaggregationOptions: [],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Count of facility-month-indicator records in the dataset.",
          fr: "Nombre d'enregistrements établissement-mois-indicateur dans le jeu de données.",
        },
        methodology: {
          en: "COUNT of unique facility-indicator-period combinations in the database.",
          fr: "Décompte des combinaisons uniques établissement-indicateur-période dans la base de données.",
        },
        interpretation: {
          en: "Higher counts indicate more complete reporting coverage. Low counts may indicate data gaps or limited facility participation.",
          fr: "Des valeurs plus élevées indiquent une couverture de déclaration plus complète. Des valeurs basses peuvent indiquer des lacunes de données.",
        },
        typicalRange: {
          en: "Varies by country size and time period selected.",
          fr: "Varie selon la taille du pays et la période sélectionnée.",
        },
        useCases: [
          {
            en: "Assess data completeness",
            fr: "Évaluer la complétude des données",
          },
          {
            en: "Calculate reporting rates",
            fr: "Calculer les taux de déclaration",
          },
          {
            en: "Identify data gaps",
            fr: "Identifier les lacunes de données",
          },
        ],
        relatedMetrics: ["m1-02-02"],
        disaggregationGuidance: {
          en: "Disaggregate by admin_area to compare regional completeness. Use indicator_common_id to see which services have better reporting.",
          fr: "Désagréger par zone administrative pour comparer la complétude régionale.",
        },
      },
    },
    {
      id: "m1-01-01",
      resultsObjectId: "M1_output_outliers.csv",

      valueProps: ["outlier_flag"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        outlier_flag: "Binary variable indicating whether this an outlier",
      },
      label: {
        en: "Proportion of outliers",
        fr: "Proportion de valeurs aberrantes",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Proportion of data points flagged as statistical outliers in the dataset.",
          fr: "Proportion de points de données signalés comme valeurs aberrantes statistiques.",
        },
        methodology: {
          en: "AVG of binary outlier_flag column. Outliers identified using Median Absolute Deviation (MAD) with configurable threshold (default: 10 MADs).",
          fr: "Moyenne de la colonne binaire outlier_flag. Valeurs aberrantes identifiées par l'écart absolu médian (MAD).",
        },
        interpretation: {
          en: "Higher values indicate more data quality issues. Values above 5% typically warrant investigation. Compare across indicators and regions to identify systematic problems.",
          fr: "Des valeurs plus élevées indiquent davantage de problèmes de qualité des données. Les valeurs supérieures à 5% nécessitent généralement une investigation.",
        },
        typicalRange: {
          en: "0-5% for good quality data; 5-10% acceptable; >10% indicates significant issues.",
          fr: "0-5% pour des données de bonne qualité; 5-10% acceptable; >10% indique des problèmes significatifs.",
        },
        caveats: {
          en: "Threshold is configurable in module parameters. Compare results using consistent thresholds. Low reporting may mask outliers.",
          fr: "Le seuil est configurable. Comparez les résultats avec des seuils cohérents.",
        },
        useCases: [
          {
            en: "Assess overall data quality",
            fr: "Évaluer la qualité globale des données",
          },
          {
            en: "Identify facilities with reporting issues",
            fr: "Identifier les établissements ayant des problèmes de déclaration",
          },
          {
            en: "Track data quality improvements over time",
            fr: "Suivre les améliorations de la qualité des données",
          },
        ],
        relatedMetrics: ["m1-02-02", "m1-04-01"],
        disaggregationGuidance: {
          en: "Disaggregate by indicator_common_id to identify problem indicators. Use admin_area_2 for regional patterns. Combine with facility_type to see if certain facility types have more issues.",
          fr: "Désagréger par indicator_common_id pour identifier les indicateurs problématiques. Utiliser admin_area_2 pour les tendances régionales.",
        },
      },
      vizPresets: [
        {
          id: "outlier-table",
          label: {
            en: "Outlier proportion table",
            fr: "Tableau de proportion de valeurs aberrantes",
          },
          description: {
            en: "Table showing proportion of outliers by indicator and region",
            fr: "Tableau montrant la proportion de valeurs aberrantes par indicateur et région",
          },
          createDefaultVisualizationOnInstall:
            "c3cb0cc9-4352-4b27-8532-f18e465faec8",
          defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
          allowedFilters: ["indicator_common_id", "admin_area_2"],
          config: {
            d: {
              type: "table",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "col",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "col" },
                { disOpt: "admin_area_2", disDisplayOpt: "row" },
              ],
              filterBy: [],
            },
            s: {
              content: "lines",
              conditionalFormatting: "fmt-01-03",
              decimalPlaces: 1,
              idealAspectRatio: "ideal",
            },
            t: {
              caption: { en: "Outliers", fr: "Valeurs aberrantes" },
              subCaption: {
                en: "Percentage of facility-months that are outliers, DATE_RANGE",
                fr: "Pourcentage de mois-établissements qui sont des valeurs aberrantes, DATE_RANGE",
              },
              footnote: {
                en: "Outliers are reports which are suspiciously high compared to the usual volume reported by the facility in other months. Outliers are identified by assessing the within-facility variation in monthly reporting for each indicator. Outliers are defined observations which are greater than 10 times the median absolute deviation (MAD) from the monthly median value for the indicator in each time period, OR a value for which the proportional contribution in volume for a facility, indicator, and time period  is greater than 80%. Outliers are only identified for indicators where the volume is greater than or equal to the median, the volume is not missing, and the average volume is greater than 100.",
                fr: "Les valeurs aberrantes sont des rapports anormalement élevés par rapport au volume habituel déclaré par l'établissement au cours des autres mois. Elles sont identifiées en évaluant la variation intra-établissement des déclarations mensuelles pour chaque indicateur. Les valeurs aberrantes sont définies comme des observations supérieures à 10 fois l'écart absolu médian (MAD) par rapport à la valeur médiane mensuelle de l'indicateur pour chaque période, OU une valeur dont la contribution proportionnelle au volume pour un établissement, indicateur et période est supérieure à 80%. Les valeurs aberrantes ne sont identifiées que pour les indicateurs dont le volume est supérieur ou égal à la médiane, le volume n'est pas manquant, et le volume moyen est supérieur à 100.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m1-02-02",
      resultsObjectId: "M1_output_completeness.csv",

      valueProps: ["completeness_flag"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        completeness_flag:
          "Binary variable indicating whether the facility meets criteria",
      },
      label: {
        en: "Proportion of completed records",
        fr: "Proportion d'enregistrements complets",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Proportion of facility-indicator-period combinations meeting completeness criteria.",
          fr: "Proportion de combinaisons établissement-indicateur-période répondant aux critères de complétude.",
        },
        methodology: {
          en: "AVG of binary completeness_flag. Facilities must report consistently across expected periods to be flagged as complete.",
          fr: "Moyenne du drapeau binaire de complétude. Les établissements doivent déclarer régulièrement pour être considérés comme complets.",
        },
        interpretation: {
          en: "Higher values indicate better reporting consistency. Values below 80% suggest significant reporting gaps that may bias analysis.",
          fr: "Des valeurs plus élevées indiquent une meilleure cohérence des déclarations. Les valeurs inférieures à 80% suggèrent des lacunes significatives.",
        },
        typicalRange: {
          en: "80-100% is good; 60-80% moderate; <60% indicates major gaps.",
          fr: "80-100% est bon; 60-80% modéré; <60% indique des lacunes majeures.",
        },
        caveats: {
          en: "Definition of completeness can vary. Check module parameters for specific criteria used.",
          fr: "La définition de complétude peut varier. Vérifiez les paramètres du module.",
        },
        useCases: [
          {
            en: "Monitor reporting compliance",
            fr: "Surveiller la conformité des déclarations",
          },
          {
            en: "Identify facilities needing support",
            fr: "Identifier les établissements nécessitant un soutien",
          },
          {
            en: "Assess data reliability for analysis",
            fr: "Évaluer la fiabilité des données pour l'analyse",
          },
        ],
        relatedMetrics: ["m1-01-01"],
        disaggregationGuidance: {
          en: "Disaggregate by admin_area to identify regions with reporting challenges. Use indicator_common_id to see if specific services have lower compliance.",
          fr: "Désagréger par zone administrative pour identifier les régions avec des défis de déclaration.",
        },
      },
      vizPresets: [
        {
          id: "completeness-table",
          label: {
            en: "Completeness table by region",
            fr: "Tableau de complétude par région",
          },
          description: {
            en: "Table showing completeness by indicator and region",
            fr: "Tableau montrant la complétude par indicateur et région",
          },
          createDefaultVisualizationOnInstall:
            "c20f1672-edfc-4140-ae2c-09a30b50443a",
          defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
          allowedFilters: ["indicator_common_id", "admin_area_2"],
          config: {
            d: {
              type: "table",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "col",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "col" },
                { disOpt: "admin_area_2", disDisplayOpt: "row" },
              ],
              filterBy: [],
            },
            s: {
              content: "lines",
              conditionalFormatting: "fmt-90-80",
              decimalPlaces: 1,
              idealAspectRatio: "ideal",
            },
            t: {
              caption: {
                en: "Indicator Completeness",
                fr: "Complétude des indicateurs",
              },
              subCaption: {
                en: "Percentage of facility-months with complete data, DATE_RANGE",
                fr: "Pourcentage de mois-établissements avec des données complètes, DATE_RANGE",
              },
              footnote: {
                en: "Higher completeness improves the reliability of the data, especially when completeness is stable over time. Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. A high completeness does not indicate that the HMIS is representative of all service delivery in the country, as some services may not be delivered in facilities, or some facilities may not report.",
                fr: "Une complétude élevée améliore la fiabilité des données, surtout lorsqu'elle est stable dans le temps. La complétude est définie comme le pourcentage d'établissements déclarants chaque mois par rapport au nombre total d'établissements censés déclarer. Un établissement est censé déclarer s'il a déclaré un volume pour chaque indicateur à tout moment au cours de l'année. Une complétude élevée n'indique pas que le HMIS est représentatif de toute la prestation de services dans le pays, car certains services peuvent ne pas être fournis dans les établissements, ou certains établissements peuvent ne pas déclarer.",
              },
            },
          },
        },
        {
          id: "completeness-timeseries",
          label: {
            en: "Completeness over time",
            fr: "Complétude dans le temps",
          },
          description: {
            en: "Area chart showing completeness trends over time by indicator",
            fr: "Graphique en aires montrant les tendances de complétude dans le temps par indicateur",
          },
          createDefaultVisualizationOnInstall:
            "26dedd7c-4577-4022-928c-69e0ee790a71",
          allowedFilters: ["indicator_common_id"],
          config: {
            d: {
              type: "timeseries",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "series",
              disaggregateBy: [
                { disOpt: "indicator_common_id", disDisplayOpt: "row" },
              ],
              filterBy: [],
            },
            s: {
              content: "areas",
              decimalPlaces: 1,
              idealAspectRatio: "video",
            },
            t: {
              caption: {
                en: "Indicator completeness over time",
                fr: "Complétude des indicateurs dans le temps",
              },
              subCaption: {
                en: "Percentage of facility-months with complete data DATE_RANGE",
                fr: "Pourcentage de mois-établissements avec des données complètes DATE_RANGE",
              },
              footnote: {
                en: "Higher completeness improves the reliability of the data, especially when completeness is stable over time. Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. A high completeness does not indicate that the HMIS is representative of all service delivery in the country, as some services may not be delivered in facilities, or some facilities may not report.",
                fr: "Une complétude élevée améliore la fiabilité des données, surtout lorsqu'elle est stable dans le temps. La complétude est définie comme le pourcentage d'établissements déclarants chaque mois par rapport au nombre total d'établissements censés déclarer. Un établissement est censé déclarer s'il a déclaré un volume pour chaque indicateur à tout moment au cours de l'année. Une complétude élevée n'indique pas que le HMIS est représentatif de toute la prestation de services dans le pays, car certains services peuvent ne pas être fournis dans les établissements, ou certains établissements peuvent ne pas déclarer.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m1-03-01",
      resultsObjectId: "M1_output_consistency_geo.csv",

      valueProps: ["sconsistency"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        ratio_type: "Type of ratio being assessed",
        pair_anc: "ANC1 is larger than ANC4",
        pair_delivery: "Delivery is approximately equal to BCG",
        pair_pnc: "Delivery is larger than PNC1",
        pair_penta: "Penta 1 is larger than Penta 3",
      },
      label: {
        en: "Proportion of sub-national areas meeting consistency criteria",
        fr: "Proportion de zones sous-nationales répondant aux critères de cohérence",
      },
      requiredDisaggregationOptions: ["ratio_type"],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Proportion of sub-national areas where related indicators show logical consistency.",
          fr: "Proportion de zones sous-nationales où les indicateurs liés montrent une cohérence logique.",
        },
        methodology: {
          en: "AVG of sconsistency flag. Checks logical relationships between indicator pairs (e.g., ANC1 > ANC4, Penta1 > Penta3).",
          fr: "Moyenne du drapeau de cohérence. Vérifie les relations logiques entre paires d'indicateurs.",
        },
        interpretation: {
          en: "Higher values indicate better data quality. Low consistency suggests data entry errors or aggregation issues. Required disaggregation by ratio_type to see which consistency checks fail most often.",
          fr: "Des valeurs plus élevées indiquent une meilleure qualité des données. Une faible cohérence suggère des erreurs de saisie.",
        },
        typicalRange: {
          en: "90-100% is good; 70-90% acceptable; <70% needs investigation.",
          fr: "90-100% est bon; 70-90% acceptable; <70% nécessite investigation.",
        },
        caveats: {
          en: "Different ratio types have different expected pass rates. Some inconsistency may be clinically valid (e.g., vaccine stock-outs).",
          fr: "Différents types de ratios ont différents taux de réussite attendus.",
        },
        useCases: [
          {
            en: "Identify data quality issues",
            fr: "Identifier les problèmes de qualité des données",
          },
          {
            en: "Validate reporting accuracy",
            fr: "Valider la précision des déclarations",
          },
          {
            en: "Target training for facilities with issues",
            fr: "Cibler la formation pour les établissements ayant des problèmes",
          },
        ],
        relatedMetrics: ["m1-01-01"],
        disaggregationGuidance: {
          en: "Always disaggregate by ratio_type as each consistency check has different implications. Use admin_area to find regions with systematic issues.",
          fr: "Toujours désagréger par ratio_type car chaque contrôle de cohérence a des implications différentes.",
        },
      },
      vizPresets: [
        {
          id: "consistency-table",
          label: {
            en: "Internal consistency table",
            fr: "Tableau de cohérence interne",
          },
          description: {
            en: "Table showing consistency by ratio type and region",
            fr: "Tableau montrant la cohérence par type de ratio et région",
          },
          createDefaultVisualizationOnInstall:
            "cf5b8649-93c2-4bbe-8f2d-773f42ce8ec3",
          defaultPeriodFilterForDefaultVisualizations: { nMonths: 12 },
          allowedFilters: ["ratio_type", "admin_area_2"],
          config: {
            d: {
              type: "table",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "col",
              disaggregateBy: [
                { disOpt: "ratio_type", disDisplayOpt: "col" },
                { disOpt: "admin_area_2", disDisplayOpt: "row" },
              ],
              filterBy: [],
            },
            s: {
              content: "lines",
              conditionalFormatting: "fmt-90-80",
              decimalPlaces: 1,
              idealAspectRatio: "ideal",
            },
            t: {
              caption: { en: "Internal consistency", fr: "Cohérence interne" },
              subCaption: {
                en: "Percentage of sub-national areas meeting consistency benchmarks, DATE_RANGE",
                fr: "Pourcentage de zones sous-nationales atteignant les critères de cohérence, DATE_RANGE",
              },
              footnote: {
                en: "Internal consistency assesses the plausibility of reported data based on related indicators. Consistency metrics are approximate - depending on timing and seasonality, indicator definitions, and the nature of service delivery and reporting, values may be expected to sit outside plausible ranges. Indicators which are similar are expected to have roughy the same volume over the year (within a 30% margin). The data in this analysis is adjusted for outliers.",
                fr: "La cohérence interne évalue la plausibilité des données déclarées sur la base d'indicateurs liés. Les mesures de cohérence sont approximatives - selon le calendrier et la saisonnalité, les définitions des indicateurs, et la nature de la prestation de services et de la déclaration, les valeurs peuvent se situer en dehors des plages plausibles. Les indicateurs similaires sont censés avoir approximativement le même volume sur l'année (avec une marge de 30%). Les données de cette analyse sont ajustées pour les valeurs aberrantes.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m1-04-01",
      resultsObjectId: "M1_output_dqa.csv",

      valueProps: ["dqa_score"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        dqa_score: "Binary variable indicating adequate data quality",
      },
      label: {
        en: "Proportion of facilities with adequate data quality",
        fr: "Proportion d'établissements avec une qualité des données adéquate",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Proportion of facilities meeting the composite data quality assessment threshold.",
          fr: "Proportion d'établissements atteignant le seuil d'évaluation composite de la qualité des données.",
        },
        methodology: {
          en: "AVG of binary dqa_score based on composite assessment of completeness, outliers, and consistency.",
          fr: "Moyenne du score DQA binaire basé sur une évaluation composite de la complétude, des valeurs aberrantes et de la cohérence.",
        },
        interpretation: {
          en: "Higher values indicate more facilities with trustworthy data. Facilities below threshold may need additional support or data verification.",
          fr: "Des valeurs plus élevées indiquent plus d'établissements avec des données fiables.",
        },
        typicalRange: {
          en: "70-100% is acceptable; <70% indicates widespread quality issues.",
          fr: "70-100% est acceptable; <70% indique des problèmes de qualité généralisés.",
        },
        caveats: {
          en: "Composite score weights may need adjustment based on local context. Consider individual components for detailed diagnosis.",
          fr: "Les poids du score composite peuvent nécessiter un ajustement selon le contexte local.",
        },
        useCases: [
          {
            en: "Overall data quality monitoring",
            fr: "Suivi global de la qualité des données",
          },
          {
            en: "Identify priority facilities for support",
            fr: "Identifier les établissements prioritaires pour le soutien",
          },
          {
            en: "Track quality improvement programs",
            fr: "Suivre les programmes d'amélioration de la qualité",
          },
        ],
        relatedMetrics: ["m1-04-02", "m1-01-01", "m1-02-02"],
        disaggregationGuidance: {
          en: "Disaggregate by admin_area to identify regions needing quality improvement support. Use facility_type to see if certain facility levels have more challenges.",
          fr: "Désagréger par zone administrative pour identifier les régions nécessitant un soutien.",
        },
      },
      vizPresets: [
        {
          id: "dqa-score-table",
          label: {
            en: "Overall DQA score table",
            fr: "Tableau du score EQD global",
          },
          description: {
            en: "Table showing DQA scores by region and year",
            fr: "Tableau montrant les scores EQD par région et année",
          },
          createDefaultVisualizationOnInstall:
            "d46e1957-09dd-41c3-b7dc-b4409da23bbe",
          allowedFilters: ["admin_area_2"],
          config: {
            d: {
              type: "table",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "col",
              disaggregateBy: [
                { disOpt: "admin_area_2", disDisplayOpt: "row" },
                { disOpt: "year", disDisplayOpt: "col" },
              ],
              filterBy: [],
            },
            s: {
              content: "lines",
              conditionalFormatting: "fmt-80-70",
              decimalPlaces: 1,
              idealAspectRatio: "ideal",
            },
            t: {
              caption: { en: "Overall DQA score", fr: "Score EQD global" },
              subCaption: {
                en: "Percentage of facility-months with adequate data quality over time",
                fr: "Pourcentage de mois-établissements avec une qualité des données adéquate dans le temps",
              },
              footnote: {
                en: "Adequate data quality is defined as: 1) No missing data or outliers for OPD, Penta1, and ANC1, where available 2) Consistent reporting between Penta1/Penta3 and ANC1/ANC4.",
                fr: "La qualité adéquate des données est définie comme : 1) Pas de données manquantes ou de valeurs aberrantes pour OPD, Penta1 et ANC1, lorsque disponibles 2) Déclaration cohérente entre Penta1/Penta3 et ANC1/ANC4.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m1-04-02",
      resultsObjectId: "M1_output_dqa.csv",

      valueProps: ["dqa_mean"],
      valueFunc: "AVG",
      valueLabelReplacements: {
        dqa_mean: "Data quality score across facilities",
      },
      label: {
        en: "Average data quality score across facilities",
        fr: "Score moyen de qualité des données à travers les établissements",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Average composite data quality score across all facilities.",
          fr: "Score moyen composite de qualité des données à travers tous les établissements.",
        },
        methodology: {
          en: "AVG of continuous dqa_mean score. Combines completeness, outlier, and consistency assessments.",
          fr: "Moyenne du score dqa_mean continu. Combine les évaluations de complétude, valeurs aberrantes et cohérence.",
        },
        interpretation: {
          en: "Higher values indicate better overall data quality. Use alongside m1-04-01 to understand both average performance and threshold compliance.",
          fr: "Des valeurs plus élevées indiquent une meilleure qualité globale des données.",
        },
        typicalRange: {
          en: "0.7-1.0 is good; 0.5-0.7 moderate; <0.5 indicates significant issues.",
          fr: "0.7-1.0 est bon; 0.5-0.7 modéré; <0.5 indique des problèmes significatifs.",
        },
        useCases: [
          {
            en: "Track data quality trends",
            fr: "Suivre les tendances de qualité des données",
          },
          {
            en: "Compare regions or facility types",
            fr: "Comparer les régions ou types d'établissements",
          },
          {
            en: "Evaluate quality improvement interventions",
            fr: "Évaluer les interventions d'amélioration de la qualité",
          },
        ],
        relatedMetrics: ["m1-04-01"],
        disaggregationGuidance: {
          en: "Disaggregate by admin_area for regional comparison. Use time series to track improvement over time.",
          fr: "Désagréger par zone administrative pour comparaison régionale.",
        },
      },
      vizPresets: [
        {
          id: "mean-dqa-table",
          label: {
            en: "Mean DQA score table",
            fr: "Tableau du score EQD moyen",
          },
          description: {
            en: "Table showing mean DQA scores by region and year",
            fr: "Tableau montrant les scores EQD moyens par région et année",
          },
          createDefaultVisualizationOnInstall:
            "4dc02c21-29da-4a01-9812-469deedaaac8",
          allowedFilters: ["admin_area_2"],
          config: {
            d: {
              type: "table",
              periodOpt: "period_id",
              valuesDisDisplayOpt: "col",
              disaggregateBy: [
                { disOpt: "admin_area_2", disDisplayOpt: "row" },
                { disOpt: "year", disDisplayOpt: "col" },
              ],
              filterBy: [],
            },
            s: {
              content: "lines",
              conditionalFormatting: "fmt-80-70",
              decimalPlaces: 1,
              idealAspectRatio: "ideal",
            },
            t: {
              caption: { en: "Mean DQA score", fr: "Score EQD moyen" },
              subCaption: {
                en: "Average data quality score across facility-months",
                fr: "Score moyen de qualité des données à travers les mois-établissements",
              },
              footnote: {
                en: "Items included in the DQA score include: No missing data for 1) OPD, 2) Penta1, and 3) ANC1, where available; No outliers for 4) OPD, 5) Penta1, and 6) ANC1, where available; Consistent reporting between 7) Penta1/Penta3, 8) ANC1/ANC4, 9)BCG/Delivery, where available.",
                fr: "Les éléments inclus dans le score EQD comprennent : Pas de données manquantes pour 1) OPD, 2) Penta1 et 3) ANC1, lorsque disponibles ; Pas de valeurs aberrantes pour 4) OPD, 5) Penta1 et 6) ANC1, lorsque disponibles ; Déclaration cohérente entre 7) Penta1/Penta3, 8) ANC1/ANC4, 9) BCG/Accouchement, lorsque disponibles.",
              },
            },
          },
        },
      ],
    },
    {
      id: "m1-05-01",
      hide: true,
      resultsObjectId: "M1_output_outlier_list.csv",
      valueProps: ["count"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        dqa_score: "Indicator outliers",
      },
      label: {
        en: "Indicator outliers",
        fr: "Valeurs aberrantes des indicateurs",
      },
      requiredDisaggregationOptions: [],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Total number of outlier data points identified across all facilities.",
          fr: "Nombre total de points de données aberrants identifiés dans tous les établissements.",
        },
        methodology: {
          en: "SUM of outlier counts from the outlier list. Each outlier represents a facility-period-indicator combination flagged by MAD-based detection.",
          fr: "Somme des comptes de valeurs aberrantes de la liste des valeurs aberrantes. Chaque valeur aberrante représente une combinaison établissement-période-indicateur signalée par détection basée sur MAD.",
        },
        interpretation: {
          en: "Higher counts indicate more widespread data quality issues. Use alongside outlier proportion to understand both prevalence and severity of quality problems.",
          fr: "Des comptes plus élevés indiquent des problèmes de qualité des données plus répandus. Utiliser avec la proportion de valeurs aberrantes pour comprendre la prévalence et la gravité.",
        },
        typicalRange: {
          en: "Varies widely by dataset size and quality.",
          fr: "Varie considérablement selon la taille et la qualité du jeu de données.",
        },
        caveats: {
          en: "Absolute counts are less informative than proportions when comparing across different time periods or regions with varying reporting volumes.",
          fr: "Les comptes absolus sont moins informatifs que les proportions lors de comparaisons entre différentes périodes ou régions.",
        },
        useCases: [
          {
            en: "Track total outlier burden over time",
            fr: "Suivre le fardeau total des valeurs aberrantes au fil du temps",
          },
          {
            en: "Identify indicators with most quality issues",
            fr: "Identifier les indicateurs avec le plus de problèmes de qualité",
          },
          {
            en: "Prioritize data quality improvement efforts",
            fr: "Prioriser les efforts d'amélioration de la qualité des données",
          },
        ],
        relatedMetrics: ["m1-01-01"],
        disaggregationGuidance: {
          en: "Disaggregate by indicator_common_id to identify problem indicators. Use admin_area to find regions with highest outlier counts. Combine with m1-01-01 for context.",
          fr: "Désagréger par indicator_common_id pour identifier les indicateurs problématiques. Utiliser admin_area pour trouver les régions avec le plus de valeurs aberrantes.",
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
        description: "Proportion threshold for outlier detection",
        replacementString: "OUTLIER_PROPORTION_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "0.8",
        },
      },
      {
        description: "Minimum count threshold for consideration",
        replacementString: "MINIMUM_COUNT_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "100",
        },
      },
      {
        description: "Number of MADs",
        replacementString: "MADS",
        input: {
          inputType: "number",
          defaultValue: "10",
        },
      },
      {
        description: "Indicators subjected to DQA",
        replacementString: "DQA_INDICATORS",
        input: {
          inputType: "select",
          options: [
            { value: `c("anc1", "penta1", "opd")`, label: "anc1, penta1, opd" },
            { value: `c("anc1", "penta1")`, label: "anc1, penta1" },
            { value: `c("anc1", "opd")`, label: "anc1, opd" },
            { value: `c("penta1", "opd")`, label: "penta1, opd" },
            { value: `c("anc1")`, label: "anc1" },
            { value: `c("penta1")`, label: "penta1" },
            { value: `c("opd")`, label: "opd" },
          ],
          valueType: "number",
          defaultValue: `c("anc1", "penta1", "opd")`,
        },
      },
      {
        description: "Consistency pairs used",
        replacementString: "CONSISTENCY_PAIRS_USED",
        input: {
          inputType: "select",
          options: [
            {
              value: `c("penta", "anc", "delivery", "malaria")`,
              label: "penta, anc, delivery, malaria",
            },
            {
              value: `c("penta", "anc", "delivery")`,
              label: "penta, anc, delivery",
            },
            { value: `c("penta", "anc")`, label: "penta, anc" },
            { value: `c("penta", "delivery")`, label: "penta, delivery" },
            { value: `c("anc", "delivery")`, label: "anc, delivery" },
            { value: `c("anc")`, label: "anc" },
            { value: `c("delivery")`, label: "delivery" },
            { value: `c("penta")`, label: "penta" },
            { value: `c("malaria")`, label: "malaria" },
          ],
          valueType: "number",
          defaultValue: `c("penta", "anc", "delivery")`,
        },
      },
      {
        description:
          "Admin level used to join facilities to corresponding geo-consistency",
        replacementString: "GEOLEVEL",
        input: {
          inputType: "select",
          options: [
            { value: `admin_area_2`, label: "admin_area_2" },
            { value: `admin_area_3`, label: "admin_area_3" },
            { value: `admin_area_4`, label: "admin_area_4" },
          ],
          valueType: "string",
          defaultValue: "admin_area_3",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
