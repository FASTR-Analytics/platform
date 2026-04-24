import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { Checkbox, RadioGroup, getSelectOptions } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { METRICS_WITH_NEGATIVE_PCT_VALUES } from "~/generate_visualization/get_style_from_po/_0_conditional_consts";
import { applyCfToTempConfig } from "../cf_store_helper";
import { ConditionalFormattingEditor } from "../conditional_formatting_editor";
import { StyleRevealGroup, StyleSection } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function MapStyleControls(p: Props) {
  return (
    <>
      <StyleSection label={t3({ en: "Display", fr: "Affichage" })}>
        <>
          <RadioGroup
            label={t3({
              en: "Map projection",
              fr: "Projection cartographique",
            })}
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
          <div class="pt-0.5"></div>
          <Checkbox
            checked={p.tempConfig.s.hideLegend}
            onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
            label={t3({ en: "Hide legend", fr: "Masquer la légende" })}
          />
        </>
      </StyleSection>
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
          allowNegative={METRICS_WITH_NEGATIVE_PCT_VALUES.includes(p.poDetail.resultsValue.id)}
        />
      </StyleSection>
      <StyleSection label={t3({ en: "Labels", fr: "Étiquettes" })}>
        <>
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
          <Show when={p.tempConfig.s.showDataLabels}>
            <StyleRevealGroup>
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
            </StyleRevealGroup>
          </Show>
        </>
      </StyleSection>
    </>
  );
}
