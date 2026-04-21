import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { Checkbox } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { applyCfToTempConfig } from "../cf_store_helper";
import { ConditionalFormattingEditor } from "../conditional_formatting_editor";
import { StyleSectionLabel } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function TableStyleControls(p: Props) {
  return (
    <>
      <StyleSectionLabel>
        {t3({ en: "Display", fr: "Affichage" })}
      </StyleSectionLabel>
      <div class="ui-spy-sm">
        <Checkbox
          label={t3({
            en: "Allow vertical column headers",
            fr: "Autoriser les en-têtes de colonnes verticales",
          })}
          checked={p.tempConfig.s.allowVerticalColHeaders}
          onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
        />
      </div>
      <Show when={!p.tempConfig.s.specialScorecardTable}>
        <StyleSectionLabel>
          {t3({ en: "Conditional formatting", fr: "Mise en forme conditionnelle" })}
        </StyleSectionLabel>
        <ConditionalFormattingEditor
          value={selectCf(p.tempConfig.s)}
          onChange={(cf) => applyCfToTempConfig(p.setTempConfig, cf)}
          formatAs={p.poDetail.resultsValue.formatAs}
          decimalPlaces={p.tempConfig.s.decimalPlaces}
        />
      </Show>
    </>
  );
}
