import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";
import { convertToHfaIndicators, indicators } from "./hfa_indicators.ts";

export const definition = {
  label: "HFA001. Health facility assessment",
  prerequisites: [],
  scriptSource: { type: "local", filename: "./script.R" },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [],
  dataSources: [
    {
      sourceType: "dataset",
      replacementString: "PROJECT_DATA_HFA",
      datasetType: "hfa",
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
      id: "HFA001_results.csv",
      description: "HFA results table",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        admin_area_1: "TEXT NOT NULL",
        hfa_indicator: "TEXT NOT NULL",
        hfa_category: "TEXT NOT NULL",
        time_point: "INTEGER NOT NULL",
        facility_ownership: "TEXT NOT NULL",
        facility_type: "TEXT NOT NULL",
        facility_custom_1: "TEXT NOT NULL",
        facility_custom_2: "TEXT NOT NULL",
        facility_custom_3: "TEXT NOT NULL",
        facility_custom_4: "TEXT NOT NULL",
        facility_custom_5: "TEXT NOT NULL",
        value: "NUMERIC",
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
      id: "hfa001-percentage",
      resultsObjectId: "HFA001_results.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: {},
      label:
        "HFA indicators (percentage/proportion) - use for binary indicators",
      requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
      formatAs: "percent",
      periodOptions: [],
      aiDescription: {
        summary: {
          en:
            "Percentage or proportion of facilities meeting specific HFA assessment criteria.",
          fr:
            "Pourcentage ou proportion d'établissements répondant aux critères d'évaluation HFA spécifiques.",
        },
        methodology: {
          en:
            "AVG of binary indicator values (0 or 1) from Health Facility Assessment data. Each facility receives 0 (criterion not met) or 1 (criterion met), and the average yields the proportion meeting the standard.",
          fr:
            "Moyenne des valeurs d'indicateur binaire (0 ou 1) des données d'évaluation des établissements de santé. Chaque établissement reçoit 0 (critère non rempli) ou 1 (critère rempli).",
        },
        interpretation: {
          en:
            "Higher values indicate better facility readiness or service availability. Disaggregation by hfa_category helps identify specific domains (e.g., infrastructure, equipment, staff) needing improvement.",
          fr:
            "Des valeurs plus élevées indiquent une meilleure préparation des établissements ou disponibilité des services. La désagrégation par hfa_category aide à identifier les domaines spécifiques nécessitant amélioration.",
        },
        typicalRange: {
          en:
            "0-100%. Target thresholds vary by indicator type and national standards.",
          fr:
            "0-100%. Les seuils cibles varient selon le type d'indicateur et les normes nationales.",
        },
        caveats: {
          en:
            "HFA data is typically cross-sectional and may not reflect temporal trends. Survey timing and facility sampling affect comparability across assessments.",
          fr:
            "Les données HFA sont généralement transversales et peuvent ne pas refléter les tendances temporelles.",
        },
        useCases: [
          {
            en: "Measure facility readiness across regions",
            fr:
              "Mesurer la préparation des établissements à travers les régions",
          },
          {
            en: "Track infrastructure and equipment availability",
            fr:
              "Suivre la disponibilité des infrastructures et équipements",
          },
          {
            en: "Identify gaps in service delivery capacity",
            fr:
              "Identifier les lacunes dans la capacité de prestation de services",
          },
        ],
        relatedMetrics: ["hfa001-count"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by hfa_indicator and time_point (both required). Use admin_area to compare regional readiness. Disaggregate by facility_type or facility_ownership to identify disparities between facility levels or public/private sectors.",
          fr:
            "Toujours désagréger par hfa_indicator et time_point (tous deux requis). Utiliser admin_area pour comparer la préparation régionale.",
        },
      },
    },
    {
      id: "hfa001-average",
      resultsObjectId: "HFA001_results.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: {},
      label:
        "HFA indicators (mean/average value) - use for averaging numeric indicators",
      requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
      formatAs: "number",
      periodOptions: [],
      aiDescription: {
        summary: {
          en:
            "Average value of continuous HFA indicators across facilities (e.g., number of staff, beds, or consultation rooms).",
          fr:
            "Valeur moyenne des indicateurs HFA continus à travers les établissements (p. ex. nombre de personnel, lits ou salles de consultation).",
        },
        methodology: {
          en:
            "AVG of numeric indicator values from Health Facility Assessment data. Calculates the mean value across all facilities in the selected geographic area or facility type.",
          fr:
            "Moyenne des valeurs d'indicateur numérique des données d'évaluation des établissements de santé. Calcule la valeur moyenne à travers tous les établissements.",
        },
        interpretation: {
          en:
            "Higher averages may indicate better resource availability, but should be interpreted considering facility size, catchment population, and service level. Use alongside total counts and facility type disaggregation for context.",
          fr:
            "Des moyennes plus élevées peuvent indiquer une meilleure disponibilité des ressources, mais doivent être interprétées en tenant compte de la taille de l'établissement.",
        },
        typicalRange: {
          en:
            "Varies by indicator type. Staff counts typically 5-50 per facility; bed counts 10-200 depending on facility level.",
          fr:
            "Varie selon le type d'indicateur. Comptes de personnel généralement 5-50 par établissement; lits 10-200 selon le niveau.",
        },
        caveats: {
          en:
            "Averages can be skewed by outlier facilities (very large hospitals). Consider using median or disaggregating by facility type for more robust analysis.",
          fr:
            "Les moyennes peuvent être faussées par des établissements aberrants (très grands hôpitaux). Considérer l'utilisation de la médiane.",
        },
        useCases: [
          {
            en: "Assess average staffing levels by region",
            fr: "Évaluer les niveaux de dotation moyens par région",
          },
          {
            en: "Compare infrastructure capacity across facility types",
            fr:
              "Comparer la capacité d'infrastructure entre types d'établissements",
          },
          {
            en: "Monitor resource distribution equity",
            fr: "Surveiller l'équité de la distribution des ressources",
          },
        ],
        relatedMetrics: ["hfa001-total", "hfa001-count"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by hfa_indicator and time_point. Disaggregate by facility_type to avoid misleading averages that mix hospitals with health posts. Use admin_area for regional comparisons.",
          fr:
            "Toujours désagréger par hfa_indicator et time_point. Désagréger par facility_type pour éviter des moyennes trompeuses.",
        },
      },
    },
    {
      id: "hfa001-total",
      resultsObjectId: "HFA001_results.csv",
      valueProps: ["value"],
      valueFunc: "SUM",
      valueLabelReplacements: {},
      label: "HFA indicators (total/sum) - use for summing numeric values",
      requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
      formatAs: "number",
      periodOptions: [],
      aiDescription: {
        summary: {
          en:
            "Total sum of continuous HFA indicator values across all facilities (e.g., total beds, total staff, total equipment items).",
          fr:
            "Somme totale des valeurs d'indicateur HFA continu à travers tous les établissements (p. ex. total de lits, personnel total, articles d'équipement totaux).",
        },
        methodology: {
          en:
            "SUM of numeric indicator values from Health Facility Assessment data. Aggregates counts across all facilities in the selected geographic area to provide total resource availability.",
          fr:
            "Somme des valeurs d'indicateur numérique des données d'évaluation des établissements de santé. Agrège les comptes à travers tous les établissements.",
        },
        interpretation: {
          en:
            "Higher totals indicate greater absolute resource availability in the region. Compare against population size to assess per-capita resource levels. Use alongside facility counts to understand resource distribution.",
          fr:
            "Des totaux plus élevés indiquent une plus grande disponibilité absolue des ressources dans la région. Comparer à la taille de la population.",
        },
        typicalRange: {
          en:
            "Varies widely by region size and facility count. Urban regions with many facilities will have higher totals.",
          fr:
            "Varie considérablement selon la taille de la région et le nombre d'établissements. Les régions urbaines auront des totaux plus élevés.",
        },
        caveats: {
          en:
            "Total counts are sensitive to the number of facilities surveyed. Missing facilities or incomplete assessments will underestimate totals. Compare proportions or per-capita rates for more robust analysis.",
          fr:
            "Les comptes totaux sont sensibles au nombre d'établissements évalués. Les établissements manquants sous-estimeront les totaux.",
        },
        useCases: [
          {
            en: "Calculate total health workforce in a region",
            fr:
              "Calculer la main-d'œuvre sanitaire totale dans une région",
          },
          {
            en: "Assess overall infrastructure capacity",
            fr: "Évaluer la capacité globale de l'infrastructure",
          },
          {
            en: "Plan resource allocation and distribution",
            fr: "Planifier l'allocation et la distribution des ressources",
          },
        ],
        relatedMetrics: ["hfa001-average", "hfa001-count"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by hfa_indicator and time_point. Use admin_area for regional totals. Combine with population data to calculate per-capita resource availability. Disaggregate by facility_type to understand resource concentration.",
          fr:
            "Toujours désagréger par hfa_indicator et time_point. Utiliser admin_area pour les totaux régionaux.",
        },
      },
    },
    {
      id: "hfa001-count",
      resultsObjectId: "HFA001_results.csv",
      valueProps: ["value"],
      valueFunc: "COUNT",
      valueLabelReplacements: {},
      label: "HFA indicators (record count) - useful for data quality checks",
      requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
      formatAs: "number",
      periodOptions: [],
      aiDescription: {
        summary: {
          en:
            "Number of facilities with recorded values for a specific HFA indicator.",
          fr:
            "Nombre d'établissements avec des valeurs enregistrées pour un indicateur HFA spécifique.",
        },
        methodology: {
          en:
            "COUNT of facility records in the HFA results table for each indicator-timepoint combination. Provides the sample size for that indicator.",
          fr:
            "Décompte des enregistrements d'établissements dans la table de résultats HFA pour chaque combinaison indicateur-période.",
        },
        interpretation: {
          en:
            "Higher counts indicate better survey coverage for that indicator. Low counts may indicate missing data, skipped questions, or that the indicator only applies to certain facility types. Compare against total facility counts to assess completeness.",
          fr:
            "Des comptes plus élevés indiquent une meilleure couverture de l'enquête pour cet indicateur. Des comptes faibles peuvent indiquer des données manquantes.",
        },
        typicalRange: {
          en:
            "Should ideally match the total number of facilities assessed. Lower counts may indicate indicator-specific skip patterns.",
          fr:
            "Devrait idéalement correspondre au nombre total d'établissements évalués. Des comptes inférieurs peuvent indiquer des modèles de saut.",
        },
        caveats: {
          en:
            "Record count does not indicate data quality, only presence. Use percentage metrics to assess actual indicator performance.",
          fr:
            "Le compte d'enregistrements n'indique pas la qualité des données, seulement la présence.",
        },
        useCases: [
          {
            en: "Verify HFA survey coverage completeness",
            fr:
              "Vérifier la complétude de la couverture de l'enquête HFA",
          },
          {
            en: "Identify indicators with missing data",
            fr: "Identifier les indicateurs avec des données manquantes",
          },
          {
            en: "Validate sample sizes for statistical analysis",
            fr: "Valider les tailles d'échantillon pour l'analyse statistique",
          },
        ],
        relatedMetrics: ["hfa001-percentage", "hfa001-average", "hfa001-total"],
        disaggregationGuidance: {
          en:
            "Always disaggregate by hfa_indicator and time_point. Use admin_area to verify regional survey coverage. Disaggregate by facility_type to understand which facility levels were included in the assessment.",
          fr:
            "Toujours désagréger par hfa_indicator et time_point. Utiliser admin_area pour vérifier la couverture régionale de l'enquête.",
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
    configType: "hfa",
    indicators: convertToHfaIndicators(indicators),
  },
} satisfies ModuleDefinitionJSON;
