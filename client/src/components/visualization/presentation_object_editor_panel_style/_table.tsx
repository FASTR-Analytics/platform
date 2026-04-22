import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
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
};

export function TableStyleControls(p: Props) {
  return (
    <>
      <StyleSection label={t3({ en: "Display", fr: "Affichage" })}>
        <>
          <Checkbox
            label={t3({
              en: "Allow vertical column headers",
              fr: "Autoriser les en-têtes de colonnes verticales",
            })}
            checked={p.tempConfig.s.allowVerticalColHeaders}
            onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
          />
          <Show when={!p.tempConfig.s.specialScorecardTable}>
            <div class="pt-0.5"></div>
            <RadioGroup
              label={t3({ en: "Decimal places", fr: "Décimales" })}
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
              label={t3({ en: "Hide legend", fr: "Masquer la légende" })}
            />
          </Show>
        </>
      </StyleSection>
      <Show when={!p.tempConfig.s.specialScorecardTable}>
        <StyleSection
          label={t3({
            en: "Conditional formatting",
            fr: "Mise en forme conditionnelle",
          })}
        >
          <ConditionalFormattingEditor
            value={selectCf(p.tempConfig.s)}
            onChange={(cf) => applyCfToTempConfig(p.setTempConfig, cf)}
            formatAs={p.poDetail.resultsValue.formatAs}
            decimalPlaces={p.tempConfig.s.decimalPlaces}
          />
        </StyleSection>
      </Show>
    </>
  );
}
