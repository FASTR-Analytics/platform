import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  {
    id: "e5edce68-369c-498e-a4b0-03ba73d31d6c",
    label: "Default 1. Percent change in volume due to outlier adjustment",
    resultsValueId: "m2-01-01",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "col",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
        periodFilter: {
          filterType: "last_12_months",
          periodOption: "period_id",
          min: 202405,
          max: 202504,
        },
      },
      s: {
        content: "lines",
        conditionalFormatting: "fmt-01-03",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Deviance Due to Outliers",
        subCaption:
          "Percent change in volume due to outlier adjustment, DATE_RANGE",
        footnote:
          "Outliers are reports which are suspiciously high compared to the usual volume reported by the facility in other months. Outliers are identified by assessing the within-facility variation in monthly reporting for each indicator. Outliers are defined observations which are greater than 10 times the median absolute deviation (MAD) from the monthly median value for the indicator in each time period, OR a value for which the proportional contribution in volume for a facility, indicator, and time period is greater than 80%. Outliers are only identified for indicators where the volume is greater than or equal to the median, the volume is not missing, and the average volume is greater than 100. The deviance is the difference in volume after removing the outlier. High levels of deviance can affect the plausiability of the data.",
      },
    },
  },
  {
    id: "b4750223-9ffd-43f6-958b-0ba9c0412df4",
    label: "Default 2. Percent change in volume due to completeness adjustment",
    resultsValueId: "m2-01-02",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "col",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
        periodFilter: {
          filterType: "last_12_months",
          periodOption: "period_id",
          min: 202405,
          max: 202504,
        },
      },
      s: {
        content: "lines",
        conditionalFormatting: "fmt-01-03",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Deviance Due to Incompleteness",
        subCaption:
          "Percent change in volume due to completeness adjustment, DATE_RANGE",
        footnote:
          "Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. The deviance is the difference in volume after imputing incomplete data. High levels of deviance can affect the plausiability of the data.",
      },
    },
  },
  {
    id: "5337d614-02b8-4de8-abcb-f390d2b7a714",
    label:
      "Default 3. Percent change in volume due to both outlier and completeness adjustment",
    resultsValueId: "m2-01-03",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "col",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
        periodFilter: {
          filterType: "last_12_months",
          periodOption: "period_id",
          min: 202405,
          max: 202504,
        },
      },
      s: {
        content: "lines",
        conditionalFormatting: "fmt-01-03",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Deviance Due to Incompleteness and Outliers",
        subCaption:
          "Percent change in volume due to both outlier and completeness adjustment, DATE_RANGE",
        footnote: "TBD",
      },
    },
  },
];
