import { type Language, type LegendInput } from "panther";
import {
  _CF_GREEN,
  _CF_RED,
  type EffectiveIndicatorFacts,
  type IndicatorFormat,
  PeriodOption,
  PresentationObjectConfig,
  pickLang,
  selectCf,
  TranslatableString,
  type FigureLocalization,
} from "lib";
import { compileCfToLegend } from "./conditional_formatting/compile";
import { BAND_GREY } from "./get_style_from_po/_6_disruptions_v2";
import {
  isSpecialBarChartActive,
  isSpecialCoverageChartActive,
  isSpecialDisruptionsChartActive,
  isSpecialDisruptionsChartV2Active,
} from "./special_chart_checks";

function getPeriodChangeLabels(
  timeseriesGrouping: PeriodOption,
  _inverted: boolean,
  language: Language,
): { increase: string; decrease: string } {
  const labels = getPeriodChangeTranslatableStrings(timeseriesGrouping);
  return {
    increase: pickLang(language, labels.increase),
    decrease: pickLang(language, labels.decrease),
  };
}

function getPeriodChangeTranslatableStrings(
  timeseriesGrouping: PeriodOption,
): {
  increase: TranslatableString;
  decrease: TranslatableString;
} {
  switch (timeseriesGrouping) {
    case "period_id":
      return {
        increase: {
          en: "Greater than 10% month-to-month increase",
          fr: "Augmentation de plus de 10% d'un mois à l'autre",
          pt: "Aumento superior a 10% de um mês para o outro",
        },
        decrease: {
          en: "Greater than 10% month-to-month decrease",
          fr: "Diminution de plus de 10% d'un mois à l'autre",
          pt: "Diminuição superior a 10% de um mês para o outro",
        },
      };
    case "quarter_id":
      return {
        increase: {
          en: "Greater than 10% quarter-to-quarter increase",
          fr: "Augmentation de plus de 10% d'un trimestre à l'autre",
          pt: "Aumento superior a 10% de um trimestre para o outro",
        },
        decrease: {
          en: "Greater than 10% quarter-to-quarter decrease",
          fr: "Diminution de plus de 10% d'un trimestre à l'autre",
          pt: "Diminuição superior a 10% de um trimestre para o outro",
        },
      };
    case "year":
      return {
        increase: {
          en: "Greater than 10% year-on-year increase",
          fr: "Augmentation de plus de 10% d'une année sur l'autre",
          pt: "Aumento superior a 10% de um ano para o outro",
        },
        decrease: {
          en: "Greater than 10% year-on-year decrease",
          fr: "Diminution de plus de 10% d'une année sur l'autre",
          pt: "Diminuição superior a 10% de um ano para o outro",
        },
      };
  }
}

// The CF legend is emitted only for figures that PAINT conditional formatting
// — table cells, map regions, bars — for every CF source. Lines, points and
// pie slices never consult CF, and an explicit legend would replace the
// categorical series legend panther derives for them.
export function figurePaintsCf(config: PresentationObjectConfig): boolean {
  switch (config.d.type) {
    case "table":
    case "map":
      return true;
    case "chart":
    case "timeseries":
      return config.s.content === "bars";
    case "pie":
      return false;
  }
}

export function getLegendFromConfig(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  facts: EffectiveIndicatorFacts,
  localization: Pick<FigureLocalization, "language">,
): LegendInput | undefined {
  const { language } = localization;
  if (isSpecialCoverageChartActive(config)) {
    return [
      {
        label: pickLang(language, { en: "Administrative data", fr: "Données administratives", pt: "Dados administrativos" }),
        color: "#CED4DB",
        pointStyle: "as-line",
      },
      {
        label: pickLang(language, { en: "Survey-based estimate", fr: "Estimation basée sur des enquêtes", pt: "Estimativa baseada em inquéritos" }),
        color: "#000000",
        pointStyle: "as-line",
      },
      {
        label: pickLang(language, { en: "Projected estimate", fr: "Estimation projetée", pt: "Estimativa projetada" }),
        color: "#F04D44",
        pointStyle: "as-line",
      },
    ];
  }
  if (isSpecialBarChartActive(config)) {
    if (!config.d.timeseriesGrouping) return undefined;
    const labels = getPeriodChangeLabels(
      config.d.timeseriesGrouping,
      config.s.specialBarChartInverted,
      language,
    );
    if (config.s.specialBarChartInverted) {
      return [
        { label: labels.increase, color: _CF_RED },
        { label: labels.decrease, color: _CF_GREEN },
      ];
    }
    return [
      { label: labels.increase, color: _CF_GREEN },
      { label: labels.decrease, color: _CF_RED },
    ];
  }
  if (isSpecialDisruptionsChartActive(config)) {
    if (config.s.diffInverted) {
      return [
        { label: pickLang(language, { en: "Actual", fr: "Réel", pt: "Real" }), color: "#000000", pointStyle: "as-line" },
        {
          label: pickLang(language, { en: "Expected", fr: "Attendu", pt: "Esperado" }),
          color: "#000000",
          pointStyle: "as-line",
          lineDash: "dashed",
          lineStrokeWidthScaleFactor: 0.5,
        },
        { label: pickLang(language, { en: "Excess", fr: "Excès", pt: "Excesso" }), color: _CF_RED },
        { label: pickLang(language, { en: "Reduction", fr: "Réduction", pt: "Redução" }), color: _CF_GREEN },
      ];
    }
    return [
      { label: pickLang(language, { en: "Actual", fr: "Réel", pt: "Real" }), color: "#000000", pointStyle: "as-line" },
      {
        label: pickLang(language, { en: "Expected", fr: "Attendu", pt: "Esperado" }),
        color: "#000000",
        pointStyle: "as-line",
        lineDash: "dashed",
        lineStrokeWidthScaleFactor: 0.5,
      },
      { label: pickLang(language, { en: "Surplus", fr: "Excédent", pt: "Excedente" }), color: _CF_GREEN },
      { label: pickLang(language, { en: "Disruption", fr: "Perturbation", pt: "Perturbação" }), color: _CF_RED },
    ];
  }
  if (isSpecialDisruptionsChartV2Active(config)) {
    const surplusColor = config.s.diffInverted ? _CF_RED : _CF_GREEN;
    const deficitColor = config.s.diffInverted ? _CF_GREEN : _CF_RED;
    return [
      { label: pickLang(language, { en: "Observed", fr: "Observé", pt: "Observado" }), color: "#000000", pointStyle: "as-line" },
      {
        label: pickLang(language, { en: "Expected", fr: "Attendu", pt: "Esperado" }),
        color: "#000000",
        pointStyle: "as-line",
        lineDash: "dashed",
        lineStrokeWidthScaleFactor: 0.5,
      },
      {
        label: pickLang(language, {
          en: "95% credible interval",
          fr: "Intervalle de crédibilité à 95%",
          pt: "Intervalo de credibilidade de 95%",
        }),
        color: BAND_GREY,
      },
      { label: pickLang(language, { en: "Surplus", fr: "Excédent", pt: "Excedente" }), color: surplusColor },
      { label: pickLang(language, { en: "Deficit", fr: "Déficit", pt: "Défice" }), color: deficitColor },
    ];
  }
  const cf = selectCf(config.s);
  if (cf.type === "none" || !figurePaintsCf(config)) return undefined;
  return compileCfToLegend(cf, formatAs, facts, language);
}
