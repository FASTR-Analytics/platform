import { PresentationObjectConfig, t3 } from "lib";
import {
  Checkbox,
  RadioGroup,
  getSelectOptionsWithFirstCapital,
} from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type Props = {
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
        <RadioGroup
          label={t3({
            en: "Conditional formatting",
            fr: "Mise en forme conditionnelle",
          })}
          options={getSelectOptionsWithFirstCapital([
            "none",
            "fmt-90-80",
            "fmt-80-70",
            "fmt-10-20",
            "fmt-05-10",
            "fmt-01-03",
            "fmt-neg10-pos10",
            "fmt-thresholds-1-2-5",
            "fmt-thresholds-2-5-10",
            "fmt-thresholds-5-10-20",
          ])}
          value={p.tempConfig.s.conditionalFormatting}
          onChange={(v) =>
            p.setTempConfig("s", "conditionalFormatting", v as "none" | string)
          }
        />
      </Show>
    </>
  );
}
