import {
  type ColorKeyOrString,
  type Language,
  type LegendInput,
  type LegendItem,
} from "panther";
import {
  _CF_GREEN,
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  _CF_RED,
  PeriodOption,
  PresentationObjectConfig,
  pickLang,
  selectCf,
  TranslatableString,
  type FigureLocalization,
} from "lib";
import { compileCfToLegend } from "./conditional_formatting/compile";
import {
  isSpecialBarChartActive,
  isSpecialCoverageChartActive,
  isSpecialDisruptionsChartActive,
  isSpecialScorecardTableActive,
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

export function getLegendFromConfig(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  localization: Pick<FigureLocalization, "language">,
): LegendInput | undefined {
  const { language } = localization;
  if (isSpecialScorecardTableActive(config)) {
    return [
      { label: pickLang(language, { en: "On track", fr: "En bonne voie", pt: "No bom caminho" }), color: _CF_LIGHTER_GREEN },
      { label: pickLang(language, { en: "Progress needed", fr: "Progrès nécessaire", pt: "Progresso necessário" }), color: _CF_LIGHTER_YELLOW },
      { label: pickLang(language, { en: "Not on track", fr: "Pas en bonne voie", pt: "Fora do bom caminho" }), color: _CF_LIGHTER_RED },
    ];
  }
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
  const cf = selectCf(config.s);
  if (cf.type === "none") return undefined;
  return compileCfToLegend(cf, formatAs);
}

// Internal helpers still used by conditional_formatting_scorecard.ts for
// hardcoded scorecard cell coloring. These are NOT part of the user-facing
// CF system and do not participate in the ConditionalFormatting union.
export function getCutoffColorFunc(
  c1: number,
  c2: number,
  v: number | string | undefined | null,
  alternativeMidColor?: ColorKeyOrString,
) {
  if (v === ".") return "#ffffff";
  const goodNum = Number(v);
  if (isNaN(goodNum)) return "#ffffff";
  if (goodNum < c2) return _CF_LIGHTER_RED;
  if (goodNum < c1) return alternativeMidColor ?? _CF_LIGHTER_YELLOW;
  return _CF_LIGHTER_GREEN;
}

export function getCutoffColorFuncReverse(
  c1: number,
  c2: number,
  v: number | string | undefined | null,
) {
  if (v === ".") return "#ffffff";
  const goodNum = Number(v);
  if (isNaN(goodNum)) return "#ffffff";
  if (goodNum >= c2) return _CF_LIGHTER_RED;
  if (goodNum >= c1) return _CF_LIGHTER_YELLOW;
  return _CF_LIGHTER_GREEN;
}
