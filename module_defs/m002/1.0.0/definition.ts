import type { ModuleDefinitionJSON } from "lib";

export const definition = {
  label: { en: "M2. Data quality adjustments", fr: "M2. Ajustements de la qualité des données" },
  prerequisites: ["m001"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "02_module_data_quality_adjustments.R",
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
      replacementString: "M1_output_completeness.csv",
      sourceType: "results_object",
      resultsObjectId: "M1_output_completeness.csv",
      moduleId: "m001",
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
      id: "M2_adjusted_data.csv",
      description:
        "Dataset including facility-level adjusted volumes for all adjustment scenarios",
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
      id: "M2_adjusted_data_admin_area.csv",
      description:
        "Dataset including admin-level adjusted volumes for all adjustment scenarios",
    },
    {
      id: "M2_adjusted_data_national.csv",
      description:
        "Dataset including national-level adjusted volumes for all adjustment scenarios",
    },
    {
      id: "M2_low_volume_exclusions.csv",
      description:
        "Tracks indicators potentially excluded from adjustment due to low volume",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        low_volume_exclude: "TEXT NOT NULL",
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
      id: "m2-01-01",
      resultsObjectId: "M2_adjusted_data.csv",
      label: { en: "Percent change in volume due to outlier adjustment", fr: "Changement en pourcentage du volume dû à l'ajustement des valeurs aberrantes" },
      valueProps: ["pct_change"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_change: "Percent change",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_final_none", func: "SUM" },
          { prop: "count_final_outliers", func: "SUM" },
        ],
        expression:
          "pct_change = ABS(count_final_none-count_final_outliers)/count_final_none",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Magnitude of change in reported service volumes after removing or adjusting outlier values.",
          fr: "Ampleur du changement dans les volumes de services déclarés après suppression ou ajustement des valeurs aberrantes.",
        },
        methodology: {
          en: "Calculated as ABS(unadjusted - outlier_adjusted) / unadjusted. Outlier adjustment replaces flagged extreme values using rolling mean imputation (6-month centered, forward, or backward windows) or facility-level means.",
          fr: "Calculé comme ABS(non ajusté - ajusté pour aberrants) / non ajusté. L'ajustement des aberrants remplace les valeurs extrêmes par imputation par moyenne mobile.",
        },
        interpretation: {
          en: "Higher percentages indicate that outliers had significant impact on reported volumes. Values above 10% suggest substantial data quality issues that could bias analysis if left unadjusted. Compare across indicators to identify those most affected.",
          fr: "Des pourcentages plus élevés indiquent que les aberrants ont eu un impact significatif. Les valeurs supérieures à 10% suggèrent des problèmes de qualité importants.",
        },
        typicalRange: {
          en: "0-5% indicates minimal outlier impact; 5-15% moderate; >15% suggests major quality issues.",
          fr: "0-5% indique un impact aberrant minimal; 5-15% modéré; >15% suggère des problèmes majeurs.",
        },
        caveats: {
          en: "Percentage change reflects magnitude but not direction. Large changes may be appropriate if outliers were genuine data errors, but could also indicate over-correction if flagged values were valid.",
          fr: "Le changement en pourcentage reflète l'ampleur mais pas la direction. Les grands changements peuvent être appropriés si les aberrants étaient des erreurs.",
        },
        useCases: [
          {
            en: "Assess impact of outlier correction on totals",
            fr: "Évaluer l'impact de la correction des aberrants sur les totaux",
          },
          {
            en: "Identify indicators most affected by outliers",
            fr: "Identifier les indicateurs les plus affectés par les aberrants",
          },
          {
            en: "Justify use of adjusted vs unadjusted data",
            fr: "Justifier l'utilisation de données ajustées vs non ajustées",
          },
        ],
        relatedMetrics: ["m2-01-02", "m2-01-03", "m1-01-01"],
        disaggregationGuidance: {
          en: "Disaggregate by indicator_common_id to identify which services are most affected by outlier adjustment. Use admin_area to find regions where outliers have larger impact. Time series analysis shows if adjustment impact changes over time.",
          fr: "Désagréger par indicator_common_id pour identifier quels services sont les plus affectés. Utiliser admin_area pour trouver les régions où l'impact est plus important.",
        },
      },
      vizPresets: [
        {
          id: "adjustment-table",
          label: {
            en: "Outlier adjustment impact table",
            fr: "Tableau d'impact de l'ajustement des valeurs aberrantes",
          },
          description: {
            en: "Table showing percent change due to outlier adjustment by indicator and region",
            fr: "Tableau montrant le changement en pourcentage dû à l'ajustement des valeurs aberrantes par indicateur et région",
          },
          createDefaultVisualizationOnInstall: "e5edce68-369c-498e-a4b0-03ba73d31d6c",
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
              caption: { en: "Deviance Due to Outliers", fr: "Déviance due aux valeurs aberrantes" },
              subCaption: { en: "Percent change in volume due to outlier adjustment, DATE_RANGE", fr: "Changement en pourcentage du volume dû à l'ajustement des valeurs aberrantes, DATE_RANGE" },
              footnote: { en: "Outliers are reports which are suspiciously high compared to the usual volume reported by the facility in other months. Outliers are identified by assessing the within-facility variation in monthly reporting for each indicator. Outliers are defined observations which are greater than 10 times the median absolute deviation (MAD) from the monthly median value for the indicator in each time period, OR a value for which the proportional contribution in volume for a facility, indicator, and time period is greater than 80%. Outliers are only identified for indicators where the volume is greater than or equal to the median, the volume is not missing, and the average volume is greater than 100. The deviance is the difference in volume after removing the outlier. High levels of deviance can affect the plausiability of the data.", fr: "Les valeurs aberrantes sont des rapports anormalement élevés par rapport au volume habituel déclaré par l'établissement au cours des autres mois. Elles sont identifiées en évaluant la variation intra-établissement des déclarations mensuelles pour chaque indicateur. Les valeurs aberrantes sont définies comme des observations supérieures à 10 fois l'écart absolu médian (MAD) par rapport à la valeur médiane mensuelle de l'indicateur pour chaque période, OU une valeur dont la contribution proportionnelle au volume pour un établissement, indicateur et période est supérieure à 80%. Les valeurs aberrantes ne sont identifiées que pour les indicateurs dont le volume est supérieur ou égal à la médiane, le volume n'est pas manquant, et le volume moyen est supérieur à 100. La déviance est la différence de volume après suppression de la valeur aberrante. Des niveaux élevés de déviance peuvent affecter la plausibilité des données." },
            },
          },
        },
      ],
    },
    {
      id: "m2-01-02",
      resultsObjectId: "M2_adjusted_data.csv",
      label: { en: "Percent change in volume due to completeness adjustment", fr: "Changement en pourcentage du volume dû à l'ajustement de complétude" },
      valueProps: ["pct_change"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_change: "Percent change",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_final_none", func: "SUM" },
          { prop: "count_final_completeness", func: "SUM" },
        ],
        expression:
          "pct_change = ABS(count_final_none-count_final_completeness)/count_final_none",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Magnitude of change in reported service volumes after imputing missing facility reports.",
          fr: "Ampleur du changement dans les volumes de services déclarés après imputation des rapports d'établissement manquants.",
        },
        methodology: {
          en: "Calculated as ABS(unadjusted - completeness_adjusted) / unadjusted. Completeness adjustment fills missing facility-period records using rolling mean imputation to account for non-reporting facilities.",
          fr: "Calculé comme ABS(non ajusté - ajusté pour complétude) / non ajusté. L'ajustement de complétude remplit les enregistrements manquants par imputation.",
        },
        interpretation: {
          en: "Higher percentages indicate significant missing data that affects totals. Values above 20% suggest incomplete reporting that could substantially underestimate service coverage. This adjustment increases volumes by filling gaps.",
          fr: "Des pourcentages plus élevés indiquent des données manquantes significatives. Les valeurs supérieures à 20% suggèrent une déclaration incomplète.",
        },
        typicalRange: {
          en: "0-10% indicates good reporting completeness; 10-30% moderate gaps; >30% indicates major reporting issues.",
          fr: "0-10% indique une bonne complétude; 10-30% lacunes modérées; >30% indique des problèmes de déclaration majeurs.",
        },
        caveats: {
          en: "Completeness adjustment assumes missing facilities have similar service volumes to reporting facilities. If non-reporting facilities systematically differ (e.g., closed or low-functioning), imputation may over- or under-estimate totals.",
          fr: "L'ajustement de complétude suppose que les établissements manquants ont des volumes similaires. Si les établissements non déclarants diffèrent systématiquement, l'imputation peut surestimer.",
        },
        useCases: [
          {
            en: "Assess impact of incomplete reporting on totals",
            fr: "Évaluer l'impact de la déclaration incomplète sur les totaux",
          },
          {
            en: "Identify periods with major reporting gaps",
            fr: "Identifier les périodes avec des lacunes de déclaration majeures",
          },
          {
            en: "Compare adjusted vs unadjusted trend analysis",
            fr: "Comparer l'analyse de tendance ajustée vs non ajustée",
          },
        ],
        relatedMetrics: ["m2-01-01", "m2-01-03", "m1-02-02"],
        disaggregationGuidance: {
          en: "Disaggregate by indicator_common_id to see which services have most missing data. Use time periods to identify when reporting completeness deteriorated. Admin_area disaggregation reveals geographic reporting patterns.",
          fr: "Désagréger par indicator_common_id pour voir quels services ont le plus de données manquantes. Utiliser les périodes pour identifier quand la complétude s'est détériorée.",
        },
      },
      vizPresets: [
        {
          id: "adjustment-table",
          label: {
            en: "Completeness adjustment impact table",
            fr: "Tableau d'impact de l'ajustement de complétude",
          },
          description: {
            en: "Table showing percent change due to completeness adjustment by indicator and region",
            fr: "Tableau montrant le changement en pourcentage dû à l'ajustement de complétude par indicateur et région",
          },
          createDefaultVisualizationOnInstall: "b4750223-9ffd-43f6-958b-0ba9c0412df4",
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
              caption: { en: "Deviance Due to Incompleteness", fr: "Déviance due à l'incomplétude" },
              subCaption: { en: "Percent change in volume due to completeness adjustment, DATE_RANGE", fr: "Changement en pourcentage du volume dû à l'ajustement de complétude, DATE_RANGE" },
              footnote: { en: "Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. The deviance is the difference in volume after imputing incomplete data. High levels of deviance can affect the plausiability of the data.", fr: "La complétude est définie comme le pourcentage d'établissements déclarants chaque mois par rapport au nombre total d'établissements censés déclarer. Un établissement est censé déclarer s'il a déclaré un volume pour chaque indicateur à tout moment au cours de l'année. La déviance est la différence de volume après imputation des données incomplètes. Des niveaux élevés de déviance peuvent affecter la plausibilité des données." },
            },
          },
        },
      ],
    },
    {
      id: "m2-01-03",
      resultsObjectId: "M2_adjusted_data.csv",
      label: { en: "Percent change in volume due to both outlier and completeness adjustment", fr: "Changement en pourcentage du volume dû à l'ajustement combiné des valeurs aberrantes et de la complétude" },
      valueProps: ["pct_change"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_change: "Percent change",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_final_none", func: "SUM" },
          { prop: "count_final_both", func: "SUM" },
        ],
        expression:
          "pct_change = ABS(count_final_none-count_final_both)/count_final_none",
      },
      requiredDisaggregationOptions: [],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
      aiDescription: {
        summary: {
          en: "Combined magnitude of change in reported service volumes after both outlier removal and missing data imputation.",
          fr: "Ampleur combinée du changement dans les volumes après suppression des aberrants et imputation des données manquantes.",
        },
        methodology: {
          en: "Calculated as ABS(unadjusted - both_adjusted) / unadjusted. Applies both outlier correction (replacing extreme values) and completeness adjustment (filling missing records) sequentially to produce fully-adjusted estimates.",
          fr: "Calculé comme ABS(non ajusté - ajusté pour les deux) / non ajusté. Applique à la fois la correction des aberrants et l'ajustement de complétude séquentiellement.",
        },
        interpretation: {
          en: "Represents the total impact of data quality corrections on service volumes. Higher percentages indicate that raw data required substantial adjustment. Compare with individual adjustment metrics (m2-01-01, m2-01-02) to understand whether outliers or completeness drove the change.",
          fr: "Représente l'impact total des corrections de qualité des données. Des pourcentages plus élevés indiquent que les données brutes nécessitaient un ajustement substantiel.",
        },
        typicalRange: {
          en: "0-10% indicates minor corrections; 10-25% moderate adjustment; >25% indicates major data quality issues requiring substantial correction.",
          fr: "0-10% indique des corrections mineures; 10-25% ajustement modéré; >25% indique des problèmes majeurs nécessitant correction substantielle.",
        },
        caveats: {
          en: "Combined adjustment effect is not simply additive - outlier and completeness adjustments interact. Large combined changes may indicate the need to verify that adjustments are appropriate rather than over-correcting.",
          fr: "L'effet d'ajustement combiné n'est pas simplement additif - les ajustements interagissent. Les grands changements combinés peuvent indiquer la nécessité de vérifier les ajustements.",
        },
        useCases: [
          {
            en: "Assess overall data quality correction needs",
            fr: "Évaluer les besoins globaux de correction de la qualité des données",
          },
          {
            en: "Compare fully-adjusted vs raw data trends",
            fr: "Comparer les tendances ajustées vs données brutes",
          },
          {
            en: "Document magnitude of data cleaning for transparency",
            fr: "Documenter l'ampleur du nettoyage des données pour la transparence",
          },
        ],
        relatedMetrics: ["m2-01-01", "m2-01-02"],
        disaggregationGuidance: {
          en: "Disaggregate by indicator_common_id to identify indicators requiring most adjustment. Time series shows if data quality improves over time (decreasing adjustment percentages). Regional disaggregation reveals geographic patterns in data quality.",
          fr: "Désagréger par indicator_common_id pour identifier les indicateurs nécessitant le plus d'ajustement. Les séries temporelles montrent si la qualité s'améliore.",
        },
      },
      vizPresets: [
        {
          id: "adjustment-table",
          label: {
            en: "Combined adjustment impact table",
            fr: "Tableau d'impact de l'ajustement combiné",
          },
          description: {
            en: "Table showing percent change due to combined outlier and completeness adjustment by indicator and region",
            fr: "Tableau montrant le changement en pourcentage dû à l'ajustement combiné des valeurs aberrantes et de la complétude par indicateur et région",
          },
          createDefaultVisualizationOnInstall: "5337d614-02b8-4de8-abcb-f390d2b7a714",
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
              caption: { en: "Deviance Due to Incompleteness and Outliers", fr: "Déviance due à l'incomplétude et aux valeurs aberrantes" },
              subCaption: { en: "Percent change in volume due to both outlier and completeness adjustment, DATE_RANGE", fr: "Changement en pourcentage du volume dû à l'ajustement combiné des valeurs aberrantes et de la complétude, DATE_RANGE" },
              footnote: { en: "TBD", fr: "TBD" },
            },
          },
        },
      ],
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
    configType: "none",
  },
} satisfies ModuleDefinitionJSON;
