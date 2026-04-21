import { PresentationObjectConfig, PresentationObjectDetail, selectCf, t3 } from "lib";
import {
  Button,
  Checkbox,
  RadioGroup,
  Select,
} from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { applyCfToTempConfig } from "../cf_store_helper";
import { ConditionalFormattingEditor } from "../conditional_formatting_editor";
import { StyleRevealGroup, StyleSectionLabel } from "./_style_components";

type Props = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  editCustomSeriesStyles: () => Promise<void>;
  isColorOverridden: () => boolean;
};

export function ChartLikeControls(p: Props) {
  return (
    <>
      <Show when={!p.isColorOverridden()}>
        <StyleSectionLabel>
          {t3({ en: "Colors", fr: "Couleurs" })}
        </StyleSectionLabel>
        <div class="ui-spy-sm">
          <RadioGroup
            label={t3({ en: "Color scale", fr: "Échelle de couleurs" })}
            options={[
              {
                value: "pastel-discrete",
                label: t3({ en: "Discrete 1", fr: "Discret 1" }),
              },
              {
                value: "alt-discrete",
                label: t3({ en: "Discrete 2", fr: "Discret 2" }),
              },
              {
                value: "red-green",
                label: t3({ en: "Red-green", fr: "Rouge-vert" }),
              },
              {
                value: "blue-green",
                label: t3({ en: "Blue-green", fr: "Bleu-vert" }),
              },
              {
                value: "single-grey",
                label: t3({ en: "Single grey", fr: "Gris simple" }),
              },
              {
                value: "custom",
                label: t3({
                  en: "Custom colours",
                  fr: "Couleurs personnalisées",
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
          />
          <Show when={p.tempConfig.s.colorScale === "custom"}>
            <StyleRevealGroup>
              <Button onClick={p.editCustomSeriesStyles} iconName="settings">
                {t3({
                  en: "Set custom colours",
                  fr: "Définir des couleurs personnalisées",
                })}
              </Button>
            </StyleRevealGroup>
          </Show>
          <Select
            label={t3({
              en: "Color scale mapping",
              fr: "Correspondance de l'échelle de couleurs",
            })}
            options={
              p.tempConfig.d.type === "timeseries"
                ? [
                    {
                      value: "series",
                      label: t3({
                        en: "Series (lines/bars)",
                        fr: "Séries (lignes/barres)",
                      }),
                    },
                    {
                      value: "cell",
                      label: t3({
                        en: "Grid cells",
                        fr: "Cellules de la grille",
                      }),
                    },
                    {
                      value: "col",
                      label: t3({
                        en: "Column groups",
                        fr: "Groupes de colonnes",
                      }),
                    },
                    {
                      value: "row",
                      label: t3({ en: "Row groups", fr: "Groupes de lignes" }),
                    },
                  ]
                : [
                    {
                      value: "series",
                      label: t3({
                        en: "Series (sub-bars)",
                        fr: "Series (sub-bars)",
                      }),
                    },
                    {
                      value: "cell",
                      label: t3({
                        en: "Grid cells",
                        fr: "Cellules de la grille",
                      }),
                    },
                    {
                      value: "col",
                      label: t3({
                        en: "Column groups",
                        fr: "Groupes de colonnes",
                      }),
                    },
                    {
                      value: "row",
                      label: t3({ en: "Row groups", fr: "Groupes de lignes" }),
                    },
                  ]
            }
            value={p.tempConfig.s.seriesColorFuncPropToUse}
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "seriesColorFuncPropToUse",
                v as "series" | "cell" | "col" | "row",
              )
            }
            fullWidth
          />
        </div>
        <StyleSectionLabel>
          {t3({ en: "Conditional formatting", fr: "Mise en forme conditionnelle" })}
        </StyleSectionLabel>
        <ConditionalFormattingEditor
          value={selectCf(p.tempConfig.s)}
          onChange={(cf) => applyCfToTempConfig(p.setTempConfig, cf)}
          formatAs={p.poDetail.resultsValue.formatAs}
          decimalPlaces={p.tempConfig.s.decimalPlaces}
        />
      </Show>
      <StyleSectionLabel>
        {t3({ en: "Labels", fr: "Étiquettes" })}
      </StyleSectionLabel>
      <div class="ui-spy-sm">
        <Show
          when={
            p.tempConfig.s.content === "bars" ||
            p.tempConfig.s.content === "points"
          }
        >
          <Checkbox
            checked={p.tempConfig.s.showDataLabels}
            onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
            label={t3({
              en: "Show data labels",
              fr: "Afficher les étiquettes de données",
            })}
          />
        </Show>
        <Show
          when={
            p.tempConfig.s.content === "lines" ||
            p.tempConfig.s.content === "areas"
          }
        >
          <Checkbox
            checked={p.tempConfig.s.showDataLabelsLineCharts}
            onChange={(v) =>
              p.setTempConfig("s", "showDataLabelsLineCharts", v)
            }
            label={t3({
              en: "Show data labels",
              fr: "Afficher les étiquettes de données",
            })}
          />
        </Show>
      </div>
      <StyleSectionLabel>
        {t3({ en: "Axis", fr: "Axe" })}
      </StyleSectionLabel>
      <div class="ui-spy-sm">
        <Show when={p.poDetail.resultsValue.formatAs === "percent"}>
          <Checkbox
            label={t3({
              en: "Force y-axis max of 100%",
              fr: "Forcer le maximum de l'axe Y à 100 %",
            })}
            checked={p.tempConfig.s.forceYMax1}
            onChange={(v) => p.setTempConfig("s", "forceYMax1", v)}
          />
        </Show>
        <Checkbox
          label={t3({
            en: "Allow auto y-axis min",
            fr: "Autoriser le minimum automatique de l'axe Y",
          })}
          checked={p.tempConfig.s.forceYMinAuto}
          onChange={(v) => p.setTempConfig("s", "forceYMinAuto", v)}
        />
        <Checkbox
          label={t3({
            en: "Allow individual row limits",
            fr: "Autoriser des limites par ligne",
          })}
          checked={p.tempConfig.s.allowIndividualRowLimits}
          onChange={(v) => p.setTempConfig("s", "allowIndividualRowLimits", v)}
        />
      </div>
    </>
  );
}
