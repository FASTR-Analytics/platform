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
      <StyleSection label={t3({ en: "Display", fr: "Affichage", pt: "Exibição" })}>
        <>
          <RadioGroup
            label={t3({ en: "Display format", fr: "Format d'affichage", pt: "Formato de exibição" })}
            options={[
              { value: "bars", label: t3({ en: "Bars", fr: "Barres", pt: "Barras" }) },
              { value: "points", label: t3({ en: "Points", fr: "Points", pt: "Pontos" }) },
              { value: "lines", label: t3({ en: "Lines", fr: "Lignes", pt: "Linhas" }) },
            ]}
            value={
              p.tempConfig.s.content === "lines-points" ||
              p.tempConfig.s.content === "lines-area"
                ? "lines"
                : p.tempConfig.s.content === "points-connectors"
                  ? "points"
                  : p.tempConfig.s.content
            }
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "content",
                v as "bars" | "points" | "lines",
              )
            }
            horizontal
          />
          <Show when={p.tempConfig.s.content === "bars"}>
            <StyleRevealGroup>
              <Checkbox
                label={t3({ en: "Stacked bars", fr: "Histogramme empilé", pt: "Barras empilhadas" })}
                checked={p.tempConfig.s.barsStacked}
                onChange={(v) => p.setTempConfig("s", "barsStacked", v)}
              />
            </StyleRevealGroup>
          </Show>
          <Show
            when={
              p.tempConfig.s.content === "points" ||
              p.tempConfig.s.content === "points-connectors"
            }
          >
            <StyleRevealGroup>
              <Checkbox
                label={t3({ en: "Add connectors", fr: "Ajouter des connecteurs", pt: "Adicionar conectores" })}
                checked={p.tempConfig.s.content === "points-connectors"}
                onChange={(v) =>
                  p.setTempConfig(
                    "s",
                    "content",
                    v ? "points-connectors" : "points",
                  )
                }
              />
            </StyleRevealGroup>
          </Show>
          <Show
            when={
              p.tempConfig.s.content === "lines" ||
              p.tempConfig.s.content === "lines-points" ||
              p.tempConfig.s.content === "lines-area"
            }
          >
            <StyleRevealGroup>
              <Checkbox
                label={t3({ en: "Add points", fr: "Ajouter des points", pt: "Adicionar pontos" })}
                checked={p.tempConfig.s.content === "lines-points"}
                onChange={(v) =>
                  p.setTempConfig("s", "content", v ? "lines-points" : "lines")
                }
              />
              <Checkbox
                label={t3({ en: "Fill area", fr: "Remplir la zone", pt: "Preencher área" })}
                checked={p.tempConfig.s.content === "lines-area"}
                onChange={(v) =>
                  p.setTempConfig("s", "content", v ? "lines-area" : "lines")
                }
              />
            </StyleRevealGroup>
          </Show>
          <div class="pt-0.5"></div>
          <Checkbox
            label={t3({ en: "Horizontal", fr: "Horizontal", pt: "Horizontal" })}
            checked={p.tempConfig.s.horizontal ?? false}
            onChange={(v) => p.setTempConfig("s", "horizontal", v)}
          />
          <Show when={!p.tempConfig.s.horizontal}>
            <StyleRevealGroup>
              <Checkbox
                label={t3({
                  en: "Vertical tick labels",
                  fr: "Étiquettes de graduation verticales",
                  pt: "Rótulos de graduação verticais",
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
            label={t3({ en: "Hide legend", fr: "Masquer la légende", pt: "Ocultar legenda" })}
          />
        </>
      </StyleSection>
      <StyleSection label={t3({ en: "Sorting", fr: "Tri", pt: "Ordenação" })}>
        <LabelHolder
          label={t3({
            en: "Sort indicator values",
            fr: "Trier les valeurs des indicateurs",
            pt: "Ordenar valores dos indicadores",
          })}
        >
          <div class="ui-spy-sm">
            <Checkbox
              label={t3({ en: "Descending", fr: "Décroissant", pt: "Descendente" })}
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
              label={t3({ en: "Ascending", fr: "Croissant", pt: "Ascendente" })}
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
