import {
  type DisplayedRule,
  type IndicatorFormat,
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { metricAllowsNegativeScale } from "~/generate_visualization/special_chart_checks";
import { Checkbox, RadioGroup, getSelectOptions } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { applyCfToTempConfig } from "../cf_store_helper";
import { ConditionalFormattingEditor } from "../conditional_formatting_editor";
import { StyleSection } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  showNValuesToggle: boolean;
  /** Format the figure's values will actually be written in (resolved from the
   *  draft config — HFA metrics all declare "number"). */
  effectiveFormatAs: IndicatorFormat;
  /** Present for an "indicator" metric: the displayed indicators' own rules. */
  indicatorCfSource: DisplayedRule[] | undefined;
};

export function TableStyleControls(p: Props) {
  return (
    <>
      <StyleSection label={t3({ en: "Display", fr: "Affichage", pt: "Apresentação" })}>
        <>
          <Checkbox
            label={t3({
              en: "Allow vertical column headers",
              fr: "Autoriser les en-têtes de colonnes verticales",
              pt: "Permitir cabeçalhos de coluna verticais",
            })}
            checked={p.tempConfig.s.allowVerticalColHeaders}
            onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
          />
          <Show when={p.showNValuesToggle}>
            <Checkbox
              label={t3({
                en: "Show sample sizes in column headers",
                fr: "Afficher les tailles d'échantillon dans les en-têtes de colonnes",
                pt: "Mostrar tamanhos de amostra nos cabeçalhos das colunas",
              })}
              checked={p.tempConfig.s.showNValues ?? false}
              onChange={(v) => p.setTempConfig("s", "showNValues", v)}
            />
          </Show>
          <Show when={p.effectiveFormatAs !== "rate_per_10k"}>
            <div class="pt-0.5"></div>
            <RadioGroup
              label={t3({ en: "Decimal places", fr: "Décimales", pt: "Casas decimais" })}
              options={getSelectOptions(["0", "1", "2", "3"])}
              value={String(p.tempConfig.s.decimalPlaces)}
              onChange={(v) =>
                p.setTempConfig(
                  "s",
                  "decimalPlaces",
                  Number(v) as 0 | 1 | 2 | 3,
                )
              }
              horizontal
            />
          </Show>
          <Show when={selectCf(p.tempConfig.s).type !== "none"}>
            <div class="pt-0.5"></div>
            <Checkbox
              checked={p.tempConfig.s.hideLegend}
              onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
              label={t3({ en: "Hide legend", fr: "Masquer la légende", pt: "Ocultar legenda" })}
            />
          </Show>
        </>
      </StyleSection>
      <StyleSection
        label={t3({
          en: "Conditional formatting",
          fr: "Mise en forme conditionnelle",
          pt: "Formatação condicional",
        })}
      >
        <ConditionalFormattingEditor
          value={selectCf(p.tempConfig.s)}
          onChange={(cf) => applyCfToTempConfig(p.setTempConfig, cf)}
          formatAs={p.effectiveFormatAs}
          decimalPlaces={p.tempConfig.s.decimalPlaces}
          allowNegative={metricAllowsNegativeScale(p.poDetail.resultsValue.id)}
          indicatorSource={p.indicatorCfSource}
        />
      </StyleSection>
    </>
  );
}
