import { PresentationObjectConfig, PresentationObjectDetail, t3 } from "lib";
import {
  Button,
  Checkbox,
  LabelHolder,
  RadioGroup,
  Select,
  Slider,
  getSelectOptions,
  toPct0,
} from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { StyleRevealGroup, StyleSection } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  editCustomSeriesStyles: () => Promise<void>;
};

const DOUGHNUT_INNER_RADIUS_RATIO = 0.55;
const DEFAULT_GROUP_SMALL_SLICES_THRESHOLD = 0.03;

export function PieStyleControls(p: Props) {
  return (
    <>
      <StyleSection label={t3({ en: "Display", fr: "Affichage", pt: "Exibição" })}>
        <>
          <RadioGroup
            label={t3({ en: "Shape", fr: "Forme", pt: "Forma" })}
            options={[
              { value: "pie", label: t3({ en: "Pie", fr: "Camembert", pt: "Circular" }) },
              { value: "doughnut", label: t3({ en: "Doughnut", fr: "Anneau", pt: "Anel" }) },
            ]}
            value={(p.tempConfig.s.pieInnerRadiusRatio ?? 0) > 0 ? "doughnut" : "pie"}
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "pieInnerRadiusRatio",
                v === "doughnut" ? DOUGHNUT_INNER_RADIUS_RATIO : 0,
              )
            }
          />
          <Show when={(p.tempConfig.s.pieInnerRadiusRatio ?? 0) > 0}>
            <StyleRevealGroup>
              <Checkbox
                checked={!!p.tempConfig.s.pieShowCenterValue}
                onChange={(v) => p.setTempConfig("s", "pieShowCenterValue", v)}
                label={t3({
                  en: "Show value in centre",
                  fr: "Afficher la valeur au centre",
                  pt: "Mostrar o valor no centro",
                })}
              />
            </StyleRevealGroup>
          </Show>
          <div class="pt-0.5"></div>
          <Show when={p.poDetail.resultsValue.formatAs === "percent"}>
            <Checkbox
              checked={!!p.tempConfig.s.pieCompletionMode}
              onChange={(v) => p.setTempConfig("s", "pieCompletionMode", v)}
              label={t3({
                en: "Show each value against 100%",
                fr: "Afficher chaque valeur sur 100 %",
                pt: "Mostrar cada valor sobre 100%",
              })}
            />
          </Show>
          <Checkbox
            checked={p.tempConfig.s.hideLegend}
            onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
            label={t3({ en: "Hide legend", fr: "Masquer la légende", pt: "Ocultar legenda" })}
          />
        </>
      </StyleSection>
      <StyleSection label={t3({ en: "Sorting", fr: "Tri", pt: "Ordenação" })}>
        <>
          <LabelHolder
            label={t3({
              en: "Sort slices by value",
              fr: "Trier les tranches par valeur",
              pt: "Ordenar fatias por valor",
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
          <div class="pt-0.5"></div>
          <Checkbox
            label={t3({
              en: "Group small slices",
              fr: "Regrouper les petites tranches",
              pt: "Agrupar fatias pequenas",
            })}
            checked={!!p.tempConfig.s.pieGroupSmallSlices}
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "pieGroupSmallSlices",
                v ? DEFAULT_GROUP_SMALL_SLICES_THRESHOLD : 0,
              )
            }
          />
          <Show when={!!p.tempConfig.s.pieGroupSmallSlices}>
            <StyleRevealGroup>
              <Slider
                label={t3({
                  en: "Group slices below",
                  fr: "Regrouper les tranches sous",
                  pt: "Agrupar fatias abaixo de",
                })}
                value={p.tempConfig.s.pieGroupSmallSlices ?? DEFAULT_GROUP_SMALL_SLICES_THRESHOLD}
                onChange={(v) => p.setTempConfig("s", "pieGroupSmallSlices", v)}
                fullWidth
                showValueInLabel
                min={0.01}
                max={0.2}
                step={0.01}
                valueInLabelFormatter={toPct0}
              />
            </StyleRevealGroup>
          </Show>
        </>
      </StyleSection>
      <StyleSection label={t3({ en: "Labels", fr: "Étiquettes", pt: "Rótulos" })}>
        <>
          <Checkbox
            checked={p.tempConfig.s.showDataLabels}
            onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
            label={t3({
              en: "Show data labels",
              fr: "Afficher les étiquettes de données",
              pt: "Mostrar rótulos de dados",
            })}
          />
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
      <StyleSection label={t3({ en: "Colors", fr: "Couleurs", pt: "Cores" })}>
        <>
          <Select
            label={t3({ en: "Color scale", fr: "Échelle de couleurs", pt: "Escala de cores" })}
            options={[
              {
                value: "pastel-discrete",
                label: t3({ en: "Discrete 1", fr: "Discret 1", pt: "Discreto 1" }),
              },
              {
                value: "alt-discrete",
                label: t3({ en: "Discrete 2", fr: "Discret 2", pt: "Discreto 2" }),
              },
              {
                value: "red-green",
                label: t3({ en: "Red-green", fr: "Rouge-vert", pt: "Vermelho-verde" }),
              },
              {
                value: "blue-green",
                label: t3({ en: "Blue-green", fr: "Bleu-vert", pt: "Azul-verde" }),
              },
              {
                value: "single-grey",
                label: t3({ en: "Single grey", fr: "Gris simple", pt: "Cinzento único" }),
              },
              {
                value: "custom",
                label: t3({
                  en: "Custom colours",
                  fr: "Couleurs personnalisées",
                  pt: "Cores personalizadas",
                }),
              },
            ]}
            value={p.tempConfig.s.colorScale}
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "colorScale",
                v as
                  | "pastel-discrete"
                  | "alt-discrete"
                  | "red-green"
                  | "blue-green"
                  | "single-grey"
                  | "custom",
              )
            }
            fullWidth
          />
          <Show when={p.tempConfig.s.colorScale === "custom"}>
            <StyleRevealGroup>
              <Button onClick={p.editCustomSeriesStyles} iconName="settings">
                {t3({
                  en: "Set custom colours",
                  fr: "Définir des couleurs personnalisées",
                  pt: "Definir cores personalizadas",
                })}
              </Button>
            </StyleRevealGroup>
          </Show>
        </>
      </StyleSection>
    </>
  );
}
