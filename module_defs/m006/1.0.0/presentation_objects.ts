import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  //////////////
  //    __    //
  //  _/  |   //
  // / $$ |   //
  // $$$$ |   //
  //   $$ |   //
  //   $$ |   //
  //  _$$ |_  //
  // / $$   | //
  // $$$$$$/  //
  //          //
  //////////////

  {
    "id": "2a74f737-78e5-41a1-8f6d-7a3f59be2d19",
    "label":
      "Default 1. Couverture calculée à partir des données du SGIS (niveau national)",
    "resultsValueId": "m6-01-01",
    "config": {
      "d": {
        "type": "timeseries",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "indicator_common_id",
            "disDisplayOpt": "replicant",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": false,
        "includeNationalPosition": "bottom",
        "selectedReplicantValue": "anc1",
      },
      "s": {
        "scale": 2.7,
        "content": "lines",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "pastel-discrete",
        "decimalPlaces": 0,
        "hideLegend": false,
        "showDataLabels": true,
        "barsStacked": false,
        "specialCoverageChart": true,
        "diffAreas": false,
        "diffAreasOrder": "actual-expected",
        "diffInverted": false,
        "specialBarChart": false,
        "specialBarChartDiffThreshold": 0.1,
        "specialBarChartDataLabels": "threshold-values",
        "specialScorecardTable": false,
        "idealAspectRatio": "none",
        "verticalTickLabels": false,
        "allowVerticalColHeaders": true,
        "forceYMax1": false,
        "forceYMinAuto": false,
        "customSeriesStyles": [],
        "nColsInCellDisplay": "auto",
        "seriesColorFuncPropToUse": "series",
        "sortIndicatorValues": "none",
      },
      "t": {
        "caption": "Coverage estimates for REPLICANT",
        "captionRelFontSize": 2,
        "subCaption":
          "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
        "subCaptionRelFontSize": 1.3,
        "footnote":
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
  ////////////////
  //   ______   //
  //  /      \  //
  // /$$$$$$  | //
  // $$____$$ | //
  //  /    $$/  //
  // /$$$$$$/   //
  // $$ |_____  //
  // $$       | //
  // $$$$$$$$/  //
  //            //
  ////////////////
  {
    "id": "e5f8740b-a690-4a84-a0cd-05d529676f26",
    "label": "Deafult 2. Coverage calculated from HMIS data (Admin area 2)",
    "resultsValueId": "m6-01-02",
    "config": {
      "d": {
        "type": "timeseries",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "admin_area_2",
            "disDisplayOpt": "cell",
          },
          {
            "disOpt": "indicator_common_id",
            "disDisplayOpt": "replicant",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": true,
        "includeNationalPosition": "bottom",
        "selectedReplicantValue": "anc1",
      },
      "s": {
        "scale": 1.7,
        "content": "lines",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "pastel-discrete",
        "decimalPlaces": 0,
        "hideLegend": false,
        "showDataLabels": true,
        "barsStacked": false,
        "specialCoverageChart": true,
        "diffAreas": false,
        "diffAreasOrder": "actual-expected",
        "diffInverted": false,
        "specialBarChart": false,
        "specialBarChartDiffThreshold": 0.1,
        "specialBarChartDataLabels": "threshold-values",
        "specialScorecardTable": false,
        "idealAspectRatio": "none",
        "verticalTickLabels": false,
        "allowVerticalColHeaders": true,
        "forceYMax1": false,
        "forceYMinAuto": false,
        "customSeriesStyles": [],
        "nColsInCellDisplay": "auto",
        "seriesColorFuncPropToUse": "series",
        "sortIndicatorValues": "none",
      },
      "t": {
        "caption": "Subnational coverage estimates for REPLICANT",
        "captionRelFontSize": 2,
        "subCaption":
          "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
        "subCaptionRelFontSize": 1.3,
        "footnote":
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
  ////////////////
  //   ______   //
  //  /      \  //
  // /$$$$$$  | //
  // $$ ___$$ | //
  //   /   $$<  //
  //  _$$$$$  | //
  // /  \__$$ | //
  // $$    $$/  //
  //  $$$$$$/   //
  //            //
  ////////////////
  {
    "id": "e5f8740b-a690-4a84-a0cd-05d529676f27",
    "label": "Deafult 3. Coverage calculated from HMIS data (Admin area 3)",
    "resultsValueId": "m6-01-02",
    "config": {
      "d": {
        "type": "timeseries",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "admin_area_3",
            "disDisplayOpt": "cell",
          },
          {
            "disOpt": "indicator_common_id",
            "disDisplayOpt": "replicant",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": true,
        "includeNationalPosition": "bottom",
        "selectedReplicantValue": "anc1",
      },
      "s": {
        "scale": 1.7,
        "content": "lines",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "pastel-discrete",
        "decimalPlaces": 0,
        "hideLegend": false,
        "showDataLabels": true,
        "barsStacked": false,
        "specialCoverageChart": true,
        "diffAreas": false,
        "diffAreasOrder": "actual-expected",
        "diffInverted": false,
        "specialBarChart": false,
        "specialBarChartDiffThreshold": 0.1,
        "specialBarChartDataLabels": "threshold-values",
        "specialScorecardTable": false,
        "idealAspectRatio": "none",
        "verticalTickLabels": false,
        "allowVerticalColHeaders": true,
        "forceYMax1": false,
        "forceYMinAuto": false,
        "customSeriesStyles": [],
        "nColsInCellDisplay": "auto",
        "seriesColorFuncPropToUse": "series",
        "sortIndicatorValues": "none",
      },
      "t": {
        "caption": "Subnational coverage estimates for REPLICANT",
        "captionRelFontSize": 2,
        "subCaption":
          "DATE_RANGE\nDISCLAIMER: These results use routine data to provide rigorous, but not official estimates. They should be interpreted considering any data quality or representation limitations, including data quality findings and any other country specific factors.",
        "subCaptionRelFontSize": 1.3,
        "footnote":
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
  ////////////////
  //  __    __  //
  // /  |  /  | //
  // $$ |  $$ | //
  // $$ |__$$ | //
  // $$    $$ | //
  // $$$$$$$$ | //
  //       $$ | //
  //       $$ | //
  //       $$/  //
  //            //
  ////////////////
  {
    "id": "9d4977b4-0d87-44e1-b2bd-3eddcba623f4",
    "label": "Default 4. Coverage calculated from HMIS data (Admin area 2)",
    "resultsValueId": "m6-01-02",
    "config": {
      "d": {
        "type": "chart",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "admin_area_2",
            "disDisplayOpt": "indicator",
          },
          {
            "disOpt": "indicator_common_id",
            "disDisplayOpt": "replicant",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": false,
        "includeNationalPosition": "bottom",
        "selectedReplicantValue": "anc4",
        "valuesFilter": [
          "coverage_cov",
        ],
        "periodFilter": {
          "filterType": "last_12_months",
          "periodOption": "year",
          "min": 2005,
          "max": 2025,
        },
      },
      "s": {
        "scale": 3,
        "content": "bars",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "single-grey",
        "decimalPlaces": 0,
        "hideLegend": false,
        "showDataLabels": true,
        "barsStacked": false,
        "specialCoverageChart": false,
        "diffAreas": false,
        "diffAreasOrder": "actual-expected",
        "diffInverted": false,
        "specialBarChart": false,
        "specialBarChartDiffThreshold": 0.1,
        "specialBarChartDataLabels": "threshold-values",
        "specialScorecardTable": false,
        "idealAspectRatio": "none",
        "verticalTickLabels": false,
        "allowVerticalColHeaders": true,
        "forceYMax1": false,
        "forceYMinAuto": false,
        "customSeriesStyles": [],
        "nColsInCellDisplay": "auto",
        "seriesColorFuncPropToUse": "series",
        "sortIndicatorValues": "descending",
      },
      "t": {
        "caption": "Sub-national level coverage estimates, REPLICANT",
        "captionRelFontSize": 2,
        "subCaption": "DATE_RANGE",
        "subCaptionRelFontSize": 1.3,
        "footnote":
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
  ////////////////
  //  _______   //
  // /       |  //
  // $$$$$$$/   //
  // $$ |____   //
  // $$      \  //
  // $$$$$$$  | //
  // /  \__$$ | //
  // $$    $$/  //
  //  $$$$$$/   //
  //            //
  ////////////////
  {
    "id": "9d4977b4-0d87-44e1-b2bd-3eddcba623f5",
    "label": "Default 5. Coverage calculated from HMIS data (Admin area 3)",
    "resultsValueId": "m6-01-02",
    "config": {
      "d": {
        "type": "chart",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "admin_area_3",
            "disDisplayOpt": "indicator",
          },
          {
            "disOpt": "indicator_common_id",
            "disDisplayOpt": "replicant",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": false,
        "includeNationalPosition": "bottom",
        "selectedReplicantValue": "anc4",
        "valuesFilter": [
          "coverage_cov",
        ],
        "periodFilter": {
          "filterType": "last_12_months",
          "periodOption": "year",
          "min": 2005,
          "max": 2025,
        },
      },
      "s": {
        "scale": 3,
        "content": "bars",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "single-grey",
        "decimalPlaces": 0,
        "hideLegend": false,
        "showDataLabels": true,
        "barsStacked": false,
        "specialCoverageChart": false,
        "diffAreas": false,
        "diffAreasOrder": "actual-expected",
        "diffInverted": false,
        "specialBarChart": false,
        "specialBarChartDiffThreshold": 0.1,
        "specialBarChartDataLabels": "threshold-values",
        "specialScorecardTable": false,
        "idealAspectRatio": "none",
        "verticalTickLabels": false,
        "allowVerticalColHeaders": true,
        "forceYMax1": false,
        "forceYMinAuto": false,
        "customSeriesStyles": [],
        "nColsInCellDisplay": "auto",
        "seriesColorFuncPropToUse": "series",
        "sortIndicatorValues": "descending",
      },
      "t": {
        "caption": "Sub-national level coverage estimates, REPLICANT",
        "captionRelFontSize": 2,
        "subCaption": "DATE_RANGE",
        "subCaptionRelFontSize": 1.3,
        "footnote":
          "Estimating service coverage from administrative data can provide more timely information on coverage trends, or highlight data quality concerns. Numerators are the volumes reported in HMIS, adjusted for data quality. Denominators are selected from UN projections, survey estimates, or derived from HMIS volume for related indicators. National projections are made by applying HMIS trends to the most recent survey data. Subnational estimates are more sensitive to poor data quality, and projections from surveys are not calculated.\n\nMICS data courtesy of UNICEF. Multiple Indicator Cluster Surveys (various rounds) New York City, New York.\n\nDHS data courtesy of ICF. Demographic and Health Surveys (various rounds). Rockville, Maryland.\n\nData for the current year reflect the period available at the time of analysis; population figures have been scaled to match the corresponding duration.",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
];
