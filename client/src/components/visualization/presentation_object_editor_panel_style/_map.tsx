import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { Checkbox, RadioGroup } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { applyCfToTempConfig } from "../cf_store_helper";
import { ConditionalFormattingEditor } from "../conditional_formatting_editor";
import { StyleSectionLabel } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function MapStyleControls(p: Props) {
  return (
    <>
      <StyleSectionLabel>
        {t3({ en: "Display", fr: "Affichage" })}
      </StyleSectionLabel>
      <RadioGroup
        label={t3({ en: "Map projection", fr: "Projection cartographique" })}
        options={[
          {
            value: "equirectangular",
            label: t3({ en: "Equirectangular", fr: "Équirectangulaire" }),
          },
          {
            value: "mercator",
            label: t3({ en: "Mercator", fr: "Mercator" }),
          },
          {
            value: "naturalEarth1",
            label: t3({ en: "Natural Earth", fr: "Natural Earth" }),
          },
        ]}
        value={p.tempConfig.s.mapProjection}
        onChange={(v) =>
          p.setTempConfig(
            "s",
            "mapProjection",
            v as "equirectangular" | "mercator" | "naturalEarth1",
          )
        }
      />
      <StyleSectionLabel>
        {t3({ en: "Conditional formatting", fr: "Mise en forme conditionnelle" })}
      </StyleSectionLabel>
      <ConditionalFormattingEditor
        value={selectCf(p.tempConfig.s)}
        onChange={(cf) => applyCfToTempConfig(p.setTempConfig, cf)}
        formatAs={p.poDetail.resultsValue.formatAs}
        decimalPlaces={p.tempConfig.s.decimalPlaces}
      />
      <StyleSectionLabel>
        {t3({ en: "Labels", fr: "Étiquettes" })}
      </StyleSectionLabel>
      <div class="ui-spy-sm">
        <Checkbox
          checked={p.tempConfig.s.mapShowRegionLabels ?? false}
          onChange={(v) => p.setTempConfig("s", "mapShowRegionLabels", v)}
          label={t3({
            en: "Show region labels",
            fr: "Afficher les noms de région",
          })}
        />
        <Checkbox
          checked={p.tempConfig.s.showDataLabels}
          onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
          label={t3({
            en: "Show data labels",
            fr: "Afficher les étiquettes de données",
          })}
        />
      </div>
    </>
  );
}
