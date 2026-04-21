import { PresentationObjectConfig, PresentationObjectDetail, t3 } from "lib";
import { Checkbox, LabelHolder, RadioGroup } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { ChartLikeControls } from "./_chart_like_controls";
import { StyleRevealGroup, StyleSectionLabel } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  editCustomSeriesStyles: () => Promise<void>;
};

export function ChartStyleControls(p: Props) {
  return (
    <>
      <StyleSectionLabel>
        {t3({ en: "Display", fr: "Affichage" })}
      </StyleSectionLabel>
      <div class="ui-spy-sm">
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
      </div>
      <StyleSectionLabel>
        {t3({ en: "Sorting", fr: "Tri" })}
      </StyleSectionLabel>
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
