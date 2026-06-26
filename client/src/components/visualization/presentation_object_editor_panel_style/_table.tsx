import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { METRICS_WITH_NEGATIVE_PCT_VALUES } from "~/generate_visualization/get_style_from_po/_0_conditional_consts";
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
  showScorecardMode: boolean;
};

type TableMode = "standard" | "scorecard";

export function TableStyleControls(p: Props) {
  const mode = (): TableMode => {
    if (p.tempConfig.s.specialScorecardTable) return "scorecard";
    return "standard";
  };

  const setMode = (v: TableMode) => {
    p.setTempConfig("s", "specialScorecardTable", v === "scorecard");
  };

  const modeOptions = () => {
    const opts: { value: string; label: string }[] = [
      { value: "standard", label: t3({ en: "Standard", fr: "Standard", pt: "Padrão" }) },
    ];
    if (p.showScorecardMode || mode() === "scorecard") {
      opts.push({
        value: "scorecard",
        label: t3({ en: "Scorecard table", fr: "Tableau de bord", pt: "Tabela de pontuação" }),
      });
    }
    return opts;
  };

  return (
    <>
      <Show when={modeOptions().length > 1}>
        <div class="ui-pad bg-base-200 border-base-300 rounded border">
          <RadioGroup
            label={t3({ en: "Table mode", fr: "Mode de tableau", pt: "Modo de tabela" })}
            options={modeOptions()}
            value={mode()}
            onChange={(v) => setMode(v as TableMode)}
          />
        </div>
      </Show>
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
          <Show when={!p.tempConfig.s.specialScorecardTable}>
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
          <Show when={p.tempConfig.s.specialScorecardTable || selectCf(p.tempConfig.s).type !== "none"}>
            <div class="pt-0.5"></div>
            <Checkbox
              checked={p.tempConfig.s.hideLegend}
              onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
              label={t3({ en: "Hide legend", fr: "Masquer la légende", pt: "Ocultar legenda" })}
            />
          </Show>
        </>
      </StyleSection>
      <Show when={!p.tempConfig.s.specialScorecardTable}>
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
            formatAs={p.poDetail.resultsValue.formatAs}
            decimalPlaces={p.tempConfig.s.decimalPlaces}
            allowNegative={METRICS_WITH_NEGATIVE_PCT_VALUES.includes(p.poDetail.resultsValue.id)}
          />
        </StyleSection>
      </Show>
    </>
  );
}
