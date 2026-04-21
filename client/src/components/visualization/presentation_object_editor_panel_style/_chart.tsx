import { PresentationObjectConfig, PresentationObjectDetail, t3 } from "lib";
import { Checkbox, LabelHolder, RadioGroup } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { ChartLikeControls } from "./_chart_like_controls";
import { StyleRevealGroup, StyleSection } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  editCustomSeriesStyles: () => Promise<void>;
};

export function ChartStyleControls(p: Props) {
  return (
    <>
      <StyleSection label={t3({ en: "Display", fr: "Affichage" })}>
        <>
          <RadioGroup
            label={t3({ en: "Display format", fr: "Format d'affichage" })}
            options={[
              { value: "bars", label: t3({ en: "Bars", fr: "Barres" }) },
              { value: "points", label: t3({ en: "Points", fr: "Points" }) },
              { value: "lines", label: t3({ en: "Lines", fr: "Lignes" }) },
            ]}
            value={p.tempConfig.s.content}
            onChange={(v) =>
              p.setTempConfig("s", "content", v as "bars" | "points")
            }
            horizontal
          />
          <Show when={p.tempConfig.s.content === "bars"}>
            <StyleRevealGroup>
              <Checkbox
                label={t3({ en: "Stacked bars", fr: "Histogramme empilé" })}
                checked={p.tempConfig.s.barsStacked}
                onChange={(v) => p.setTempConfig("s", "barsStacked", v)}
              />
            </StyleRevealGroup>
          </Show>
          <div class="pt-0.5"></div>
          <Checkbox
            label={t3({ en: "Horizontal", fr: "Horizontal" })}
            checked={p.tempConfig.s.horizontal ?? false}
            onChange={(v) => p.setTempConfig("s", "horizontal", v)}
          />
          <Show when={!p.tempConfig.s.horizontal}>
            <StyleRevealGroup>
              <Checkbox
                label={t3({
                  en: "Vertical tick labels",
                  fr: "Étiquettes de graduation verticales",
                })}
                checked={p.tempConfig.s.verticalTickLabels}
                onChange={(v) => p.setTempConfig("s", "verticalTickLabels", v)}
              />
            </StyleRevealGroup>
          </Show>
          <div class="pt-0.5"></div>
          <Checkbox
            checked={p.tempConfig.s.hideLegend}
            onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
            label={t3({ en: "Hide legend", fr: "Masquer la légende" })}
          />
        </>
      </StyleSection>
      <StyleSection label={t3({ en: "Sorting", fr: "Tri" })}>
        <LabelHolder
          label={t3({
            en: "Sort indicator values",
            fr: "Trier les valeurs des indicateurs",
          })}
        >
          <div class="ui-spy-sm">
            <Checkbox
              label={t3({ en: "Descending", fr: "Décroissant" })}
              checked={p.tempConfig.s.sortIndicatorValues === "descending"}
              onChange={(v) =>
                p.setTempConfig(
                  "s",
                  "sortIndicatorValues",
                  v ? "descending" : "none",
                )
              }
            />
            <Checkbox
              label={t3({ en: "Ascending", fr: "Croissant" })}
              checked={p.tempConfig.s.sortIndicatorValues === "ascending"}
              onChange={(v) =>
                p.setTempConfig(
                  "s",
                  "sortIndicatorValues",
                  v ? "ascending" : "none",
                )
              }
            />
          </div>
        </LabelHolder>
      </StyleSection>
      <ChartLikeControls
        poDetail={p.poDetail}
        tempConfig={p.tempConfig}
        setTempConfig={p.setTempConfig}
        editCustomSeriesStyles={p.editCustomSeriesStyles}
        isColorOverridden={() => false}
      />
    </>
  );
}
