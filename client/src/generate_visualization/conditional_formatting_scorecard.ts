// export const _SCORECARD = {

import {
  type ResultsValue,
  type ItemsHolderPresentationObject,
  type PresentationObjectConfig,
  withReplicant,
  _CF_GREEN,
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
} from "lib";
import { toNum0, toNum1, to100Pct0, type ADTFigure } from "panther";
import {
  getCutoffColorFunc,
  getCutoffColorFuncReverse,
  getLegendItemsFromConfig,
} from "./conditional_formatting";
import { getTableJsonDataConfigFromPresentationObjectConfig } from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";

const _SCORECARD = new Map(
  Object.entries({
    ///////////////////////////
    //                       //
    //    Maternal Health    //
    //                       //
    ///////////////////////////
    anc_coverage_1_visit: {
      group: "1. Maternal Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "1a. 1st Antenatal Visit / Expected Pregnancies",
    },
    anc4_anc1_ratio: {
      group: "1. Maternal Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label:
        "1b. At least four antenatal care visits among women receiving antenatal care",
    },
    skilled_birth_attendance: {
      group: "1. Maternal Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "1c. Skilled Birth Attendant / Deliveries",
    },
    uterotonics_coverage: {
      group: "1. Maternal Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "1d. Use of uterotonics in labour and delivery",
    },
    fistula_per_1000_deliveries: {
      group: "1. Maternal Health",
      thresholdType: "10-20",
      // dataFormatter: to100Pct0,
      label: "1e. New fistula cases (out of deliveries)",
    },
    //////////////////////////
    //                      //
    //    Newborn Health    //
    //                      //
    //////////////////////////
    newborn_resuscitation: {
      group: "2. Newborn Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "2a. % of asphyxiated newborns resuscitated",
    },
    postnatal_visits_3d: {
      group: "2. Newborn Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "2b. Postnatal care within 3 days of delivery",
    },
    lbw_kmc_coverage: {
      group: "2. Newborn Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "2c. Kangaroo Mother Care (KMC) for newborns with low birthweight",
    },
    birth_registration: {
      group: "2. Newborn Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "2d. Birth registration",
    },
    ///////////////////////
    //                   //
    //    Rep. health    //
    //                   //
    ///////////////////////
    modern_contraceptive_use: {
      group: "3. Rep. Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "3a. Women aged 15–49 using modern contraceptive",
    },
    ////////////////////////
    //                    //
    //    Child Health    //
    //                    //
    ////////////////////////
    pneumonia_antibiotic_treatment: {
      group: "4. Child Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "4a. % of new pneumonia cases <5 years given antibiotics",
    },
    diarrhea_ors_zinc_treatment: {
      group: "4. Child Health",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "4b. % of new diarrhoea cases <5 years given ORS and zinc",
    },
    ///////////////////
    //               //
    //    Malaria    //
    //               //
    ///////////////////
    iptp3_coverage: {
      group: "5. Malaria / TB / HIV",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label:
        "5a. % of pregnant women that receive at least 3 doses of IPTP (IPTP3)",
    },
    malaria_act_treatment_rate: {
      group: "5. Malaria / TB / HIV",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "5b. % of confirmed uncomplicated malaria given ACT",
    },
    under5_llin_coverage: {
      group: "5. Malaria / TB / HIV",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "5c. % children under 5 years who received LLIN",
    },
    ////////////////////////
    //                    //
    //    Immunization    //
    //                    //
    ////////////////////////
    bcg_coverage: {
      group: "6. Immunization",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "6a. BCG Coverage",
    },
    penta3_coverage: {
      group: "6. Immunization",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "6b. Penta3 Coverage",
    },
    fully_immunized_coverage: {
      group: "6. Immunization",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "6c. % of Fully Immunized Infants <1 year",
    },
    vaccine_stockout_percentage: {
      group: "6. Immunization",
      thresholdType: "10-20",
      // dataFormatter: to100Pct0,
      label: "6d. Health Facilities With Vaccine Stockout",
    },
    /////////////////////
    //                 //
    //    Nutrition    //
    //                 //
    /////////////////////
    exclusive_breastfeeding_rate: {
      group: "7. Nutrition",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "7a. Exclusive Breastfeeding Age 0-5 Months",
    },
    growth_monitoring_coverage: {
      group: "7. Nutrition",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "7b. % of children under five receiving growth monitoring",
    },
    ///////////////
    //           //
    //    GBV    //
    //           //
    ///////////////
    gbv_care_coverage: {
      group: "8. GASHE",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "8a. % gender based violence cases receiving care",
    },
    /////////////////
    //             //
    //    NHMIS    //
    //             //
    /////////////////
    nhmis_data_timeliness_final: {
      group: "9. NHMIS",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "9a. Timely Reporting (2019)",
    },
    nhmis_reporting_rate_final: {
      group: "9. NHMIS",
      thresholdType: "80-60",
      // dataFormatter: to100Pct0,
      label: "9b. Complete reporting (2019)",
    },
  }),
);

const _SCORECARD_LABEL_TO_THRESHOLD = new Map(
  Array.from(_SCORECARD.values()).map((item) => [
    item.label,
    item.thresholdType,
  ]),
);

// const _SCORECARD_LABEL_TO_DATA_FORMATTER = new Map(
//   Array.from(_SCORECARD.values()).map((item) => [
//     item.label,
//     item.dataFormatter,
//   ]),
// );

export function getSpecialScorecardTableFigureInputs(
  resultsValue: ResultsValue,
  ih: ItemsHolderPresentationObject,
  config: PresentationObjectConfig,
): ADTFigure {
  // Type guard - this function should only be called with status: "ok"
  if (ih.status !== "ok") {
    throw new Error("getSpecialScorecardTableFigureInputs called with non-ok status");
  }

  const jsonArray = ih.items.map((item) => {
    const id = item.indicator_common_id;
    const s = _SCORECARD.get(id);
    return {
      ...item,
      indicator_common_id: s?.label ?? id,
      group: s?.group ?? "Unknown",
    };
  });
  const jsonDataConfig = getTableJsonDataConfigFromPresentationObjectConfig(
    resultsValue,
    config,
    {},
    jsonArray,
  );
  jsonDataConfig.colGroupProp = "group";
  const style = getStyleFromPresentationObject(resultsValue, config);
  style.table!.cellBackgroundColorFormatter = (v, info) => {
    const thresholdType = _SCORECARD_LABEL_TO_THRESHOLD.get(info.colHeader);
    if (thresholdType === "80-60") {
      return getCutoffColorFunc(80, 60, v);
    }
    if (thresholdType === "10-20") {
      return getCutoffColorFuncReverse(10, 20, v);
    }
    return { key: "base100" };
  };
  style.table!.cellValueFormatter = (v) => to100Pct0(v);
  style.surrounds!.legendPosition = "bottom-left";
  style.legend!.maxLegendItemsInOneColumn = 1;
  return {
    tableData: {
      jsonArray,
      jsonDataConfig,
    },
    style,
    legendItemsOrLabels: [
      { label: "On track", color: _CF_LIGHTER_GREEN },
      { label: "Progress", color: _CF_LIGHTER_YELLOW },
      { label: "Not on track", color: _CF_LIGHTER_RED },
    ],
  };
}
