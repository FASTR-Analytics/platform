import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  {
    id: "45f2bcd8-879d-4423-a4b0-a84127e168bf",
    label: "Default 1. Number of services reported",
    metricId: "m3-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "cell",
          },
        ],
        filterBy: [],
        valuesFilter: ["count_final_outliers"],
      },
      s: {
        content: "lines",
        decimalPlaces: 0,
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Service utilization over time",
        subCaption: "DATE_RANGE",
        footnote: "Yearly volume is adjusted for outliers.",
      },
    },
  },
  {
    id: "7196a784-8665-41ad-b563-965c59937def",
    label: "Default 2. Change in service volume, quarterly",
    metricId: "m3-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "quarter_id",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
        valuesFilter: ["count_final_outliers"],
        periodFilter: {
          filterType: "last_12_months",
          periodOption: "period_id",
          min: 202401,
          max: 202504,
        },
      },
      s: {
        decimalPlaces: 0,
        customSeriesStyles: [],
        specialBarChart: true,
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Service volume by quarter & quarter-on-quarter change",
        subCaption: "DATE_RANGE",
        footnote: "Service volume is adjusted for outliers.",
      },
    },
  },
  {
    id: "cfc11e32-5102-484c-b242-892bb132c410",
    label: "Default 3. Change in service volume, annually",
    metricId: "m3-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "year",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "row",
          },
        ],
        filterBy: [],
        valuesFilter: ["count_final_outliers"],
      },
      s: {
        decimalPlaces: 0,
        customSeriesStyles: [],
        specialBarChart: true,
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Service volume by year & year-on-year change",
        subCaption: "DATE_RANGE",
        footnote: "Service volume is adjusted for outliers.",
      },
    },
  },
  {
    id: "20658bc8-2b24-4adc-8090-407c6e34f22a",
    label: "Default 4. Change in service volume (Admin area 2)",
    metricId: "m3-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "year",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "row",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "col",
          },
        ],
        filterBy: [],
        valuesFilter: ["count_final_outliers"],
      },
      s: {
        scale: 1.7,
        decimalPlaces: 0,
        customSeriesStyles: [],
        specialBarChart: true,
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Service volume by year & year-on-year change",
        subCaption: "DATE_RANGE",
        footnote: "Yearly volume is adjusted for outliers.",
      },
    },
  },
  {
    id: "e51a15fd-acfc-4da9-8797-b462b9626cff",
    label: "Default 5. Actual vs expected number of services (National)",
    metricId: "m3-02-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "cell",
          },
        ],
        filterBy: [],
      },
      s: {
        scale: 2.5,
        content: "areas",
        decimalPlaces: 0,
        diffAreas: true,
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Disruptions and surpluses in service volume, nationally",
        subCaption: "DATE_RANGE",
        footnote:
          "This graph quantifies changes in service volume compared to historical trends and accounting for seasonality. These signals should be triangulated to other data and contextual knowledge to determine if the results are an artifact of data quality. Unexpected volume changes are estimated by comparing the observed volume to the expected volume based on historical trends and seasonality. Previous large unexpected changes in the historical data are removed. This analysis is an interrupted time series regression with facility-level fixed effects.",
      },
    },
  },
  {
    id: "e1916b10-433a-4b19-b376-491a66b81f11",
    label: "Default 6. Actual vs expected number of services (Admin area 2)",
    metricId: "m3-03-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "period_id",
        valuesDisDisplayOpt: "series",
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
        filterBy: [
          {
            disOpt: "indicator_common_id",
            values: ["anc1", "anc4", "bcg", "delivery", "penta3", "penta1"],
          },
        ],
      },
      s: {
        scale: 1.6,
        content: "areas",
        decimalPlaces: 0,
        diffAreas: true,
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
      },
      t: {
        caption: "Disruptions and surpluses in service volume, sub-nationally",
        subCaption: "DATE_RANGE",
        footnote:
          "This graph quantifies changes in service volume compared to historical trends and accounting for seasonality. These signals should be triangulated to other data and contextual knowledge to determine if the results are an artifact of data quality. Unexpected volume changes are estimated by comparing the observed volume to the expected volume based on historical trends and seasonality. Previous large unexpected changes in the historical data are removed. This analysis is an interrupted time series regression with facility-level fixed effects.",
      },
    },
  },
  {
    id: "508f17cc-fbfd-4585-a2e8-8242234898c3",
    label: "Default 7. Volume change due to data quality adjustments",
    metricId: "m3-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "year",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "col",
          },
        ],
        filterBy: [
          {
            disOpt: "indicator_common_id",
            values: ["anc1", "anc4", "bcg", "delivery", "penta1", "penta3"],
          },
        ],
        valuesFilter: [
          "count_final_outliers",
          "count_final_none",
          "count_final_completeness",
          "count_final_both",
        ],
      },
      s: {
        scale: 1.8,
        colorScale: "custom",
        decimalPlaces: 0,
        showDataLabels: false,
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 0.1,
        customSeriesStyles: [
          {
            color: "#00897b",
            lineStyle: "solid",
            strokeWidth: 5,
          },
          {
            color: "#757575",
            lineStyle: "solid",
            strokeWidth: 5,
          },
          {
            color: "#8e24aa",
            lineStyle: "solid",
            strokeWidth: 5,
          },
          {
            color: "#7cb342",
            lineStyle: "solid",
            strokeWidth: 5,
          },
        ],
      },
      t: {
        caption: "Change in volume due to data quality adjustments",
        subCaption: "DATE_RANGE",
      },
    },
  },
];
