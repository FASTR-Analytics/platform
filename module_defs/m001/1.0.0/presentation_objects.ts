import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  {
    id: "c3cb0cc9-4352-4b27-8532-f18e465faec8",
    label: "Proportion of outliers",
    metricId: "m1-01-01",
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
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Outliers",
        subCaption:
          "Percentage of facility-months that are outliers, DATE_RANGE",
        footnote:
          "Outliers are reports which are suspiciously high compared to the usual volume reported by the facility in other months. Outliers are identified by assessing the within-facility variation in monthly reporting for each indicator. Outliers are defined observations which are greater than 10 times the median absolute deviation (MAD) from the monthly median value for the indicator in each time period, OR a value for which the proportional contribution in volume for a facility, indicator, and time period  is greater than 80%. Outliers are only identified for indicators where the volume is greater than or equal to the median, the volume is not missing, and the average volume is greater than 100.",
      },
    },
  },
  {
    id: "c20f1672-edfc-4140-ae2c-09a30b50443a",
    label: "Proportion of completed records",
    metricId: "m1-02-02",
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
        conditionalFormatting: "fmt-90-80",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Indicator Completeness",
        subCaption:
          "Percentage of facility-months with complete data, DATE_RANGE",
        footnote:
          "Higher completeness improves the reliability of the data, especially when completeness is stable over time. Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. A high completeness does not indicate that the HMIS is representative of all service delivery in the country, as some services may not be delivered in facilities, or some facilities may not report.",
      },
    },
  },
  {
    id: "26dedd7c-4577-4022-928c-69e0ee790a71",
    label: "Proportion of completed records over time",
    metricId: "m1-02-02",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
      },
      s: {
        content: "areas",
        decimalPlaces: 1,
        idealAspectRatio: "video",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Indicator completeness over time",
        subCaption:
          "Percentage of facility-months with complete data DATE_RANGE",
        footnote:
          "Higher completeness improves the reliability of the data, especially when completeness is stable over time. Completeness is defined as the percentage of reporting facilities each month out of the total number of facilities expected to report. A facility is expected to report if it has reported any volume for each indicator anytime within a year. A high completeness does not indicate that the HMIS is representative of all service delivery in the country, as some services may not be delivered in facilities, or some facilities may not report.",
      },
    },
  },
  {
    id: "cf5b8649-93c2-4bbe-8f2d-773f42ce8ec3",
    label:
      "Proportion of sub-national areas meeting consistency criteria",
    metricId: "m1-03-01",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "ratio_type",
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
        conditionalFormatting: "fmt-90-80",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Internal consistency",
        subCaption:
          "Percentage of sub-national areas meeting consistency benchmarks, DATE_RANGE",
        footnote:
          "Internal consistency assesses the plausibility of reported data based on related indicators. Consistency metrics are approximate - depending on timing and seasonality, indicator definitions, and the nature of service delivery and reporting, values may be expected to sit outside plausible ranges. Indicators which are similar are expected to have roughy the same volume over the year (within a 30% margin). The data in this analysis is adjusted for outliers.",
      },
    },
  },
  {
    id: "d46e1957-09dd-41c3-b7dc-b4409da23bbe",
    label: "Overall DQA score",
    metricId: "m1-04-01",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
          },
          {
            disOpt: "year",
            disDisplayOpt: "col",
          },
        ],
        filterBy: [],
      },
      s: {
        content: "lines",
        conditionalFormatting: "fmt-80-70",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Overall DQA score",
        subCaption:
          "Percentage of facility-months with adequate data quality over time",
        footnote:
          "Adequate data quality is defined as: 1) No missing data or outliers for OPD, Penta1, and ANC1, where available 2) Consistent reporting between Penta1/Penta3 and ANC1/ANC4.",
      },
    },
  },
  {
    id: "4dc02c21-29da-4a01-9812-469deedaaac8",
    label: "Mean DQA score",
    metricId: "m1-04-02",
    config: {
      d: {
        type: "table",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "col",
        disaggregateBy: [
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
          },
          {
            disOpt: "year",
            disDisplayOpt: "col",
          },
        ],
        filterBy: [],
      },
      s: {
        content: "lines",
        conditionalFormatting: "fmt-80-70",
        decimalPlaces: 1,
        idealAspectRatio: "ideal",
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Mean DQA score",
        subCaption: "Average data quality score across facility-months",
        footnote:
          "Items included in the DQA score include: No missing data for 1) OPD, 2) Penta1, and 3) ANC1, where available; No outliers for 4) OPD, 5) Penta1, and 6) ANC1, where available; Consistent reporting between 7) Penta1/Penta3, 8) ANC1/ANC4, 9)BCG/Delivery, where available.",
      },
    },
  },
];
