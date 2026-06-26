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
      <StyleSection label={t3({ en: "Display", fr: "Affichage", pt: "Exibição" })}>
        <>
          <RadioGroup
            label={t3({
              en: "Map projection",
              fr: "Projection cartographique",
              pt: "Projeção cartográfica",
            })}
            options={[
              {
                value: "equirectangular",
                label: t3({ en: "Equirectangular", fr: "Équirectangulaire", pt: "Equirretangular" }),
              },
              {
                value: "mercator",
                label: t3({ en: "Mercator", fr: "Mercator", pt: "Mercator" }),
              },
              {
                value: "naturalEarth1",
                label: t3({ en: "Natural Earth", fr: "Natural Earth", pt: "Natural Earth" }),
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
            label={t3({ en: "Hide legend", fr: "Masquer la légende", pt: "Ocultar legenda" })}
          />
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
          formatAs={p.poDetail.resultsValue.formatAs}
          decimalPlaces={p.tempConfig.s.decimalPlaces}
          allowNegative={METRICS_WITH_NEGATIVE_PCT_VALUES.includes(p.poDetail.resultsValue.id)}
        />
      </StyleSection>
      <StyleSection label={t3({ en: "Labels", fr: "Étiquettes", pt: "Rótulos" })}>
        <>
          <Checkbox
            checked={p.tempConfig.s.mapShowRegionLabels ?? false}
            onChange={(v) => p.setTempConfig("s", "mapShowRegionLabels", v)}
            label={t3({
              en: "Show region labels",
              fr: "Afficher les noms de région",
              pt: "Mostrar rótulos de região",
            })}
          />
          <Checkbox
            checked={p.tempConfig.s.showDataLabels}
            onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
            label={t3({
              en: "Show data labels",
              fr: "Afficher les étiquettes de données",
              pt: "Mostrar rótulos de dados",
            })}
          />
          <Show
            when={
              p.tempConfig.s.mapShowRegionLabels || p.tempConfig.s.showDataLabels
            }
          >
            <StyleRevealGroup>
              <RadioGroup
                label={t3({
                  en: "Label placement",
                  fr: "Placement des étiquettes",
                  pt: "Posicionamento dos rótulos",
                })}
                options={[
                  {
                    value: "centroid",
                    label: t3({ en: "Center", fr: "Centre", pt: "Centro" }),
                  },
                  {
                    value: "callout",
                    label: t3({ en: "Callout", fr: "Légende", pt: "Chamada" }),
                  },
                  {
                    value: "auto",
                    label: t3({ en: "Auto", fr: "Auto", pt: "Automático" }),
                  },
                ]}
                value={p.tempConfig.s.mapDataLabelMode ?? "centroid"}
                onChange={(v) =>
                  p.setTempConfig(
                    "s",
                    "mapDataLabelMode",
                    v as "centroid" | "callout" | "auto",
                  )
                }
              />
            </StyleRevealGroup>
          </Show>
          <Show when={p.tempConfig.s.showDataLabels}>
            <StyleRevealGroup>
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
            </StyleRevealGroup>
          </Show>
        </>
      </StyleSection>
    </>
  );
}
