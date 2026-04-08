import { PresentationObjectConfig, PresentationObjectDetail, t3 } from "lib";
import { Checkbox, LabelHolder, RadioGroup } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { ChartLikeControls } from "./_chart_like_controls";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  editCustomSeriesStyles: () => Promise<void>;
};

export function ChartStyleControls(p: Props) {
  return (
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
      />
      <LabelHolder
        label={t3({
          en: "Sort indicator values",
          fr: "Trier les valeurs des indicateurs",
        })}
      >
        <div class="space-y-1">
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
      <Show when={p.tempConfig.s.content === "bars"}>
        <Checkbox
          label={t3({ en: "Stacked bars", fr: "Histogramme empilé" })}
          checked={p.tempConfig.s.barsStacked}
          onChange={(v) => p.setTempConfig("s", "barsStacked", v)}
        />
      </Show>
      <Checkbox
        label={t3({
          en: "Vertical tick labels",
          fr: "Étiquettes de graduation verticales",
        })}
        checked={p.tempConfig.s.verticalTickLabels}
        onChange={(v) => p.setTempConfig("s", "verticalTickLabels", v)}
      />
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
