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

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function TableStyleControls(p: Props) {
  return (
    <>
      <Checkbox
        label={t3({
          en: "Special RMNCAH Scorecard table",
          fr: "Tableau de bord de résultats spécial RMNCAH",
        })}
        checked={p.tempConfig.s.specialScorecardTable}
        onChange={(v) => p.setTempConfig("s", "specialScorecardTable", v)}
      />
      <Checkbox
        label={t3({
          en: "Allow vertical column headers",
          fr: "Autoriser les en-têtes de colonnes verticales",
        })}
        checked={p.tempConfig.s.allowVerticalColHeaders}
        onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
      />
      <Show when={!p.tempConfig.s.specialScorecardTable}>
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
