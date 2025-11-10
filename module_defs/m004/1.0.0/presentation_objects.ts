import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  {
    id: "3e3230cb-ad9e-48b9-b3ce-7bd01255d20b",
    label: "Default 1. Coverage calculated from HMIS data (National)",
    resultsValueId: "m4-01-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "year",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "replicant",
          },
        ],
        filterBy: [],
        selectedReplicantValue: "anc1",
      },
      s: {
        content: "lines",
        customSeriesStyles: [],
        specialCoverageChart: true,
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Coverage estimates for REPLICANT",
        subCaption:
          "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
        footnote:
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
      },
    },
  },
  {
    id: "a7727717-92d9-4676-b533-9b98be426a81",
    label: "Default 2. Coverage calculated from HMIS data (Admin Area 2)",
    resultsValueId: "m4-02-01",
    config: {
      d: {
        type: "timeseries",
        periodOpt: "year",
        valuesDisDisplayOpt: "series",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "series",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "cell",
          },
        ],
        filterBy: [],
      },
      s: {
        scale: 1.9,
        content: "lines",
        decimalPlaces: 1,
        customSeriesStyles: [],
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Coverage estimates",
        subCaption:
          "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
        footnote:
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
      },
    },
  },
  {
    id: "d452dfcf-2cc9-4c7f-bfb0-bf5b8ab6433d",
    label: "Default 3. Coverage calculated from HMIS data (Admin Area 2)",
    resultsValueId: "m4-02-01",
    config: {
      d: {
        type: "chart",
        periodOpt: "year",
        valuesDisDisplayOpt: "indicator",
        disaggregateBy: [
          {
            disOpt: "indicator_common_id",
            disDisplayOpt: "replicant",
          },
          {
            disOpt: "admin_area_2",
            disDisplayOpt: "indicator",
          },
          {
            disOpt: "year",
            disDisplayOpt: "cell",
          },
        ],
        filterBy: [],
        selectedReplicantValue: "anc1",
      },
      s: {
        colorScale: "single-grey",
        decimalPlaces: 1,
        customSeriesStyles: [],
        sortIndicatorValues: "descending",
        specialBarChartDataLabels: "all-values",
        specialBarChartDiffThreshold: 10,
      },
      t: {
        caption: "Sub-national level coverage estimates, REPLICANT",
        subCaption: "DATE_RANGE",
        footnote:
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.",
      },
    },
  },
];
