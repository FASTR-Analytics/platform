import type { PartialDefaultPresentationObjectJSON } from "lib";

export const presentationObjects: PartialDefaultPresentationObjectJSON[] = [
  {
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
    "id": "15ca88bd-6183-4e71-bb26-3277dd8eb02f",
    "label":
      "Coverage estimated with different denominators (National)",
    "metricId": "m4a-02-01",
    "config": {
      "d": {
        "type": "timeseries",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "series",
        "disaggregateBy": [
          {
            "disOpt": "denominator_best_or_survey",
            "disDisplayOpt": "series",
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
      },
      "s": {
        "scale": 3,
        "content": "lines",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "pastel-discrete",
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
        "sortIndicatorValues": "none",
      },
      "t": {
        "caption": "Coverage based of different denominators, REPLICANT",
        "captionRelFontSize": 2,
        "subCaption": "DATE_RANGE",
        "subCaptionRelFontSize": 1.3,
        "footnote": "",
        "footnoteRelFontSize": 0.9,
      },
    },
  }, ////////////////
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
    "id": "1f8d2940-803c-43f0-b17b-278b271d34a7",
    "label": "Denominator values (National)",
    "metricId": "m4a-01-01",
    "config": {
      "d": {
        "type": "table",
        "periodOpt": "year",
        "valuesDisDisplayOpt": "col",
        "disaggregateBy": [
          {
            "disOpt": "denominator",
            "disDisplayOpt": "row",
          },
          {
            "disOpt": "year",
            "disDisplayOpt": "col",
          },
          {
            "disOpt": "source_indicator",
            "disDisplayOpt": "rowGroup",
          },
        ],
        "filterBy": [],
        "includeNationalForAdminArea2": false,
        "includeNationalPosition": "bottom",
      },
      "s": {
        "scale": 3,
        "content": "bars",
        "conditionalFormatting": "none",
        "allowIndividualRowLimits": true,
        "colorScale": "pastel-discrete",
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
        "idealAspectRatio": "ideal",
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
        "caption": "",
        "captionRelFontSize": 2,
        "subCaption": "",
        "subCaptionRelFontSize": 1.3,
        "footnote": "",
        "footnoteRelFontSize": 0.9,
      },
    },
  },
];
