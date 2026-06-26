import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  selectCf,
  t3,
} from "lib";
import { Button, Checkbox, RadioGroup, Select, getSelectOptions } from "panther";
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
  editCustomSeriesStyles: () => Promise<void>;
  isColorOverridden: () => boolean;
};

export function ChartLikeControls(p: Props) {
  return (
    <>
      <Show when={!p.isColorOverridden()}>
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
            <Select
              label={t3({
                en: "Color scale mapping",
                fr: "Correspondance de l'échelle de couleurs",
                pt: "Correspondência da escala de cores",
              })}
              options={
                p.tempConfig.d.type === "timeseries"
                  ? [
                      {
                        value: "series",
                        label: t3({
                          en: "Series (lines/bars)",
                          fr: "Séries (lignes/barres)",
                          pt: "Séries (linhas/barras)",
                        }),
                      },
                      {
                        value: "cell",
                        label: t3({
                          en: "Grid cells",
                          fr: "Cellules de la grille",
                          pt: "Células da grelha",
                        }),
                      },
                      {
                        value: "col",
                        label: t3({
                          en: "Column groups",
                          fr: "Groupes de colonnes",
                          pt: "Grupos de colunas",
                        }),
                      },
                      {
                        value: "row",
                        label: t3({
                          en: "Row groups",
                          fr: "Groupes de lignes",
                          pt: "Grupos de linhas",
                        }),
                      },
                    ]
                  : [
                      {
                        value: "series",
                        label: t3({
                          en: "Series (sub-bars)",
                          fr: "Series (sub-bars)",
                          pt: "Séries (sub-barras)",
                        }),
                      },
                      {
                        value: "cell",
                        label: t3({
                          en: "Grid cells",
                          fr: "Cellules de la grille",
                          pt: "Células da grelha",
                        }),
                      },
                      {
                        value: "col",
                        label: t3({
                          en: "Column groups",
                          fr: "Groupes de colonnes",
                          pt: "Grupos de colunas",
                        }),
                      },
                      {
                        value: "row",
                        label: t3({
                          en: "Row groups",
                          fr: "Groupes de lignes",
                          pt: "Grupos de linhas",
                        }),
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
      </Show>
      <StyleSection label={t3({ en: "Labels", fr: "Étiquettes", pt: "Rótulos" })}>
        <>
          <Show
            when={
              p.tempConfig.s.content === "bars" ||
              p.tempConfig.s.content === "points" ||
              p.tempConfig.s.content === "points-connectors"
            }
          >
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
                    p.setTempConfig("s", "decimalPlaces", Number(v) as 0 | 1 | 2 | 3)
                  }
                  horizontal
                />
              </StyleRevealGroup>
            </Show>
          </Show>
          <Show
            when={
              p.tempConfig.s.content === "lines" ||
              p.tempConfig.s.content === "lines-area" ||
              p.tempConfig.s.content === "lines-points"
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
                pt: "Mostrar rótulos de dados",
              })}
            />
            <Show when={p.tempConfig.s.showDataLabelsLineCharts}>
              <StyleRevealGroup>
                <RadioGroup
                  label={t3({ en: "Decimal places", fr: "Décimales", pt: "Casas decimais" })}
                  options={getSelectOptions(["0", "1", "2", "3"])}
                  value={String(p.tempConfig.s.decimalPlaces)}
                  onChange={(v) =>
                    p.setTempConfig("s", "decimalPlaces", Number(v) as 0 | 1 | 2 | 3)
                  }
                  horizontal
                />
              </StyleRevealGroup>
            </Show>
          </Show>
        </>
      </StyleSection>
      <StyleSection label={t3({ en: "Axis", fr: "Axe", pt: "Eixo" })}>
        <>
          <Show when={p.poDetail.resultsValue.formatAs === "percent"}>
            <Checkbox
              label={t3({
                en: "Force y-axis max of 100%",
                fr: "Forcer le maximum de l'axe Y à 100 %",
                pt: "Forçar máximo do eixo Y de 100%",
              })}
              checked={p.tempConfig.s.forceYMax1}
              onChange={(v) => p.setTempConfig("s", "forceYMax1", v)}
            />
          </Show>
          <Checkbox
            label={t3({
              en: "Allow auto y-axis min",
              fr: "Autoriser le minimum automatique de l'axe Y",
              pt: "Permitir mínimo automático do eixo Y",
            })}
            checked={p.tempConfig.s.forceYMinAuto}
            onChange={(v) => p.setTempConfig("s", "forceYMinAuto", v)}
          />
          <Checkbox
            label={t3({
              en: "Allow individual row limits",
              fr: "Autoriser des limites par ligne",
              pt: "Permitir limites individuais por linha",
            })}
            checked={p.tempConfig.s.allowIndividualRowLimits}
            onChange={(v) =>
              p.setTempConfig("s", "allowIndividualRowLimits", v)
            }
          />
        </>
      </StyleSection>
    </>
  );
}
