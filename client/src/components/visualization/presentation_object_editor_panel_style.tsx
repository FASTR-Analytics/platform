import {
  PeriodOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  get_PERIOD_OPTION_MAP,
  getDisaggregatorDisplayProp,
  t3,
} from "lib";
import {
  Button,
  Checkbox,
  ColorPicker,
  LabelHolder,
  RadioGroup,
  Select,
  Slider,
  getSelectOptions,
  getSelectOptionsWithFirstCapital,
  openComponent,
  toNum0,
  toPct0,
} from "panther";
import { Show } from "solid-js";
import { SetStoreFunction, unwrap } from "solid-js/store";
import { CustomSeriesStyles } from "~/components/forms_editors/custom_series_styles";

type Props = {
  projectId: string;
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function PresentationObjectEditorPanelStyle(p: Props) {
  async function editCustomSeriesStyles() {
    const res = await openComponent({
      element: CustomSeriesStyles,
      props: {
        starting: p.tempConfig.s.customSeriesStyles
          ? unwrap(p.tempConfig.s.customSeriesStyles)
          : undefined,
      },
    });
    if (res) {
      p.setTempConfig("s", "customSeriesStyles", res);
    }
  }

  const usingCells = () =>
    !!getDisaggregatorDisplayProp(p.poDetail.resultsValue, p.tempConfig, [
      "cell",
    ]);

  const includesAdminArea3 = () =>
    p.tempConfig.d.disaggregateBy.some((d) => d.disOpt === "admin_area_3");

  return (
    <div class="ui-pad ui-spy h-full w-full overflow-auto">
      <Show when={p.tempConfig.d.type === "timeseries"}>
        <RadioGroup
          label={t3({ en: "Period", fr: "Période" })}
          options={p.poDetail.resultsValue.periodOptions.map((value) => {
            return { value, label: get_PERIOD_OPTION_MAP()[value] };
          })}
          value={p.tempConfig.d.periodOpt}
          onChange={(v) => p.setTempConfig("d", "periodOpt", v as PeriodOption)}
        />
      </Show>
      <Slider
        label={t3({ en: "Scale", fr: "Échelle" })}
        min={0.1}
        max={5}
        step={0.1}
        value={p.tempConfig.s.scale}
        onChange={(v) => p.setTempConfig("s", "scale", v)}
        fullWidth
        showValueInLabel
        ticks={{
          major: [0.1, 1, 2, 3, 4, 5],
          showLabels: true,
          labelFormatter: toNum0,
        }}
      />
      <Show when={p.tempConfig.d.type === "table"}>
        <Checkbox
          label={t3({ en: "Allow vertical column headers", fr: "Autoriser les en-têtes de colonnes verticales" })}
          checked={p.tempConfig.s.allowVerticalColHeaders}
          onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
        />
      </Show>
      <Show when={usingCells()}>
        <LabelHolder label={t3({ en: "Number of grid columns", fr: "Nombre de colonnes de grille" })}>
          <div class="ui-spy-sm">
            <Checkbox
              label={t3({ en: "Auto", fr: "Auto" })}
              checked={p.tempConfig.s.nColsInCellDisplay === "auto"}
              onChange={(v) => {
                if (v) {
                  p.setTempConfig("s", "nColsInCellDisplay", "auto");
                } else {
                  p.setTempConfig("s", "nColsInCellDisplay", 2);
                }
              }}
            />
            <Show when={p.tempConfig.s.nColsInCellDisplay !== "auto"}>
              <Slider
                label={t3({ en: "Columns", fr: "Colonnes" })}
                min={1}
                max={10}
                step={1}
                value={p.tempConfig.s.nColsInCellDisplay as number}
                onChange={(v) => p.setTempConfig("s", "nColsInCellDisplay", v)}
                fullWidth
                showValueInLabel
              />
            </Show>
          </div>
        </LabelHolder>
      </Show>
      <Show when={p.tempConfig.d.type === "timeseries"}>
        <RadioGroup
          label={t3({ en: "Display format", fr: "Format d'affichage" })}
          options={[
            { value: "lines", label: t3({ en: "Lines", fr: "Lignes" }) },
            { value: "areas", label: t3({ en: "Areas", fr: "Zones" }) },
            { value: "bars", label: t3({ en: "Bars", fr: "Barres" }) },
          ]}
          value={p.tempConfig.s.content}
          onChange={(v) =>
            p.setTempConfig("s", "content", v as "lines" | "areas" | "bars")
          }
        />
        <Checkbox
          label={t3({ en: "Special coverage chart", fr: "Graphique de couverture spéciale" })}
          checked={p.tempConfig.s.specialCoverageChart}
          onChange={(v) => p.setTempConfig("s", "specialCoverageChart", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type === "chart"}>
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
        <LabelHolder label={t3({ en: "Sort indicator values", fr: "Trier les valeurs des indicateurs" })}>
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
            /></div>
        </LabelHolder>
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "table" && p.tempConfig.d.type !== "map" && p.tempConfig.s.content === "bars"
        }
      >
        <Checkbox
          label={t3({ en: "Stacked bars", fr: "Histogramme empilé" })}
          checked={p.tempConfig.s.barsStacked}
          onChange={(v) => p.setTempConfig("s", "barsStacked", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type === "table"}>
        <Checkbox
          label={t3({ en: "Special RMNCAH Scorecard table", fr: "Tableau de bord de résultats spécial RMNCAH" })}
          checked={p.tempConfig.s.specialScorecardTable}
          onChange={(v) => p.setTempConfig("s", "specialScorecardTable", v)}
        />
      </Show>
      <Show
        when={
          p.tempConfig.d.type === "timeseries" &&
          p.tempConfig.s.content === "bars"
        }
      >
        <div class="ui-spy-sm">
          <Checkbox
            label={t3({ en: "Special percent change chart", fr: "Graphique de variation spéciale en pourcentage" })}
            checked={p.tempConfig.s.specialBarChart}
            onChange={(v) => p.setTempConfig("s", "specialBarChart", v)}
          />
          <Show when={p.tempConfig.s.specialBarChart}>
            <div class="ui-spy-sm border-base-300 rounded border p-4">
              <Slider
                label={t3({ en: "Threshold", fr: "Seuil" })}
                value={p.tempConfig.s.specialBarChartDiffThreshold ?? 0.1}
                onChange={(v) =>
                  p.setTempConfig("s", "specialBarChartDiffThreshold", v)
                }
                fullWidth
                showValueInLabel
                min={0}
                max={0.25}
                step={0.01}
                valueInLabelFormatter={toPct0}
              />
              <Checkbox
                label={t3({ en: "Invert red/green for higher/lower", fr: "Inverser rouge/vert pour plus élevé/plus bas" })}
                checked={p.tempConfig.s.specialBarChartInverted}
                onChange={(v) => p.setTempConfig("s", "specialBarChartInverted", v)}
              />
              <Show when={p.tempConfig.s.showDataLabels}>
                <Checkbox
                  label={t3({ en: "Only show data labels on bars exceeding threshold", fr: "Afficher seulement les étiquettes de données sur les barres dépassant le seuil" })}
                  checked={
                    p.tempConfig.s.specialBarChartDataLabels === undefined ||
                    p.tempConfig.s.specialBarChartDataLabels ===
                    "threshold-values"
                  }
                  onChange={(v) =>
                    p.setTempConfig(
                      "s",
                      "specialBarChartDataLabels",
                      v ? "threshold-values" : "all-values",
                    )
                  }
                />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <div class="ui-spy-sm">
        <Show when={p.tempConfig.s.content === "areas"}>
          <Checkbox
            label={t3({ en: "Diff areas", fr: "Zones de différences" })}
            checked={p.tempConfig.s.diffAreas}
            onChange={(v) => p.setTempConfig("s", "diffAreas", v)}
          />
          <Show when={p.tempConfig.s.diffAreas}>
            <div class="ui-spy-sm border-base-300 rounded border p-4">
              <Checkbox
                label={t3({ en: "Invert red/green for surplus/disruptions", fr: "Inverser rouge/vert pour excédents/perturbations" })}
                checked={p.tempConfig.s.diffInverted}
                onChange={(v) => p.setTempConfig("s", "diffInverted", v)}
              /></div>
          </Show>
          {/* <Show when={p.tempConfig.s.diffAreas}>
          <RadioGroup
            label={t("Diff areas order")}
            options={getSelectOptions(["actual-expected", "expected-actual"])}
            value={p.tempConfig.s.diffAreasOrder}
            onChange={(v) =>
              p.setTempConfig(
                "s",
                "diffAreasOrder",
                v as "actual-expected" | "expected-actual",
              )
            }
          />
        </Show> */}
        </Show></div>
      <Show when={p.tempConfig.d.type === "chart"}>
        <Checkbox
          label={t3({ en: "Vertical tick labels", fr: "Étiquettes de graduation verticales" })}
          checked={p.tempConfig.s.verticalTickLabels}
          onChange={(v) => p.setTempConfig("s", "verticalTickLabels", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table"}>
        <Show when={p.tempConfig.s.content === "bars" || p.tempConfig.s.content === "points" || p.tempConfig.d.type === "map"}>
          <Checkbox
            checked={p.tempConfig.s.showDataLabels}
            onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
            label={t3({ en: "Show data labels", fr: "Afficher les étiquettes de données" })}
          />
        </Show>
        <Show when={p.tempConfig.d.type !== "map" && (p.tempConfig.s.content === "lines" || p.tempConfig.s.content === "areas")}>
          <Checkbox
            checked={p.tempConfig.s.showDataLabelsLineCharts}
            onChange={(v) => p.setTempConfig("s", "showDataLabelsLineCharts", v)}
            label={t3({ en: "Show data labels in line charts", fr: "Afficher les étiquettes de données dans les graphiques en ligne" })}
          />
        </Show>
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "table" &&
          p.tempConfig.d.type !== "map" &&
          p.poDetail.resultsValue.formatAs === "percent"
        }
      >
        <Checkbox
          label={t3({ en: "Force y-axis max of 100%", fr: "Forcer le maximum de l'axe Y à 100 %" })}
          checked={p.tempConfig.s.forceYMax1}
          onChange={(v) => p.setTempConfig("s", "forceYMax1", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table" && p.tempConfig.d.type !== "map"}>
        <Checkbox
          label={t3({ en: "Allow auto y-axis min", fr: "Autoriser le minimum automatique de l'axe Y" })}
          checked={p.tempConfig.s.forceYMinAuto}
          onChange={(v) => p.setTempConfig("s", "forceYMinAuto", v)}
        />
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "table" ||
          !p.tempConfig.s.specialScorecardTable
        }
      >
        <RadioGroup
          label={t3({ en: "Decimal places", fr: "Décimales" })}
          options={getSelectOptions(["0", "1", "2", "3"])}
          value={String(p.tempConfig.s.decimalPlaces)}
          onChange={(v) =>
            p.setTempConfig("s", "decimalPlaces", Number(v) as 1 | 2 | 3)
          }
          horizontal
        />
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "map" && (
          p.tempConfig.d.type !== "table" ||
          !p.tempConfig.s.specialScorecardTable)
        }
      >
        <RadioGroup
          label={t3({ en: "Conditional formatting", fr: "Mise en forme conditionnelle" })}
          options={getSelectOptionsWithFirstCapital([
            "none",
            "fmt-90-80",
            "fmt-80-70",
            "fmt-10-20",
            "fmt-05-10",
            "fmt-01-03",
            "fmt-neg10-pos10",
            "fmt-thresholds-1-2-5",
            "fmt-thresholds-2-5-10",
            "fmt-thresholds-5-10-20",
          ])}
          value={p.tempConfig.s.conditionalFormatting}
          onChange={(v) =>
            p.setTempConfig("s", "conditionalFormatting", v as "none" | string)
          }
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table" && p.tempConfig.d.type !== "map"}>
        <Checkbox
          label={t3({ en: "Allow individual row limits", fr: "Autoriser des limites par ligne" })}
          checked={p.tempConfig.s.allowIndividualRowLimits}
          onChange={(v) => p.setTempConfig("s", "allowIndividualRowLimits", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table" && p.tempConfig.d.type !== "map"}>
        <div class="ui-spy-sm">
          <RadioGroup
            label={t3({ en: "Color scale", fr: "Échelle de couleurs" })}
            options={[
              { value: "pastel-discrete", label: t3({ en: "Discrete 1", fr: "Discret 1" }) },
              { value: "alt-discrete", label: t3({ en: "Discrete 2", fr: "Discret 2" }) },
              { value: "red-green", label: t3({ en: "Red-green", fr: "Rouge-vert" }) },
              { value: "blue-green", label: t3({ en: "Blue-green", fr: "Bleu-vert" }) },
              { value: "single-grey", label: t3({ en: "Single grey", fr: "Gris simple" }) },
              {
                value: "custom",
                label: t3({ en: "Custom colours", fr: "Couleurs personnalisées" }),
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
            <div class="text-right">
              <Button onClick={editCustomSeriesStyles} iconName="settings">
                {t3({ en: "Set custom colours", fr: "Définir des couleurs personnalisées" })}
              </Button>
            </div>
          </Show>
          <Select
            label={t3({ en: "Color scale mapping", fr: "Correspondance de l'échelle de couleurs" })}
            options={
              p.tempConfig.d.type === "timeseries"
                ? [
                  { value: "series", label: t3({ en: "Series (lines/bars)", fr: "Séries (lignes/barres)" }) },
                  { value: "cell", label: t3({ en: "Grid cells", fr: "Cellules de la grille" }) },
                  { value: "col", label: t3({ en: "Column groups", fr: "Groupes de colonnes" }) },
                  { value: "row", label: t3({ en: "Row groups", fr: "Groupes de lignes" }) },
                ]
                : [
                  { value: "series", label: t3({ en: "Series (sub-bars)", fr: "Series (sub-bars)" }) },
                  { value: "cell", label: t3({ en: "Grid cells", fr: "Cellules de la grille" }) },
                  { value: "col", label: t3({ en: "Column groups", fr: "Groupes de colonnes" }) },
                  { value: "row", label: t3({ en: "Row groups", fr: "Groupes de lignes" }) },
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
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "table" ||
          p.tempConfig.s.conditionalFormatting !== "none"
        }
      >
        <Checkbox
          checked={p.tempConfig.s.hideLegend}
          onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
          label={t3({ en: "Hide legend", fr: "Masquer la légende" })}
        />
      </Show>
      <Show when={includesAdminArea3()}>
        <Checkbox
          checked={p.tempConfig.s.formatAdminArea3Labels}
          onChange={(v) => p.setTempConfig("s", "formatAdminArea3Labels", v)}
          label={t3({ en: "Format Nigeria Admin Area 3 labels (e.g., 'ab Abia State' → 'Abia')", fr: "Formater les libellés de zone administrative 3 du Nigeria (ex. : 'ab Abia State' → 'Abia')" })}
        />
      </Show>
      <Show when={p.tempConfig.d.type === "map"}>
        <RadioGroup
          label={t3({ en: "Map projection", fr: "Projection cartographique" })}
          options={[
            { value: "equirectangular", label: t3({ en: "Equirectangular", fr: "Équirectangulaire" }) },
            { value: "mercator", label: t3({ en: "Mercator", fr: "Mercator" }) },
            { value: "naturalEarth1", label: t3({ en: "Natural Earth", fr: "Natural Earth" }) },
          ]}
          value={p.tempConfig.s.mapProjection}
          onChange={(v) =>
            p.setTempConfig("s", "mapProjection", v as "equirectangular" | "mercator" | "naturalEarth1")
          }
        />
        <div class="ui-spy-sm">
          <RadioGroup
            label={t3({ en: "Color preset", fr: "Préréglage de couleurs" })}
            options={[
              { value: "red-green", label: t3({ en: "Red → Green", fr: "Rouge → Vert" }) },
              { value: "red", label: t3({ en: "Red", fr: "Rouge" }) },
              { value: "blue", label: t3({ en: "Blue", fr: "Bleu" }) },
              { value: "green", label: t3({ en: "Green", fr: "Vert" }) },
              { value: "custom", label: t3({ en: "Custom", fr: "Personnalisé" }) },
            ]}
            value={p.tempConfig.s.mapColorPreset}
            onChange={(v) =>
              p.setTempConfig("s", "mapColorPreset", v as "red" | "blue" | "green" | "red-green" | "custom")
            }
          />
          <Show when={p.tempConfig.s.mapColorPreset === "custom"}>
            <ColorPicker
              label={t3({ en: "From color", fr: "Couleur de départ" })}
              value={p.tempConfig.s.mapColorFrom}
              onChange={(v) => p.setTempConfig("s", "mapColorFrom", v)}
              colorSet="standard"
              fullWidth
            />
            <ColorPicker
              label={t3({ en: "To color", fr: "Couleur d'arrivée" })}
              value={p.tempConfig.s.mapColorTo}
              onChange={(v) => p.setTempConfig("s", "mapColorTo", v)}
              colorSet="standard"
              fullWidth
            />
          </Show>
        </div>
        <Checkbox
          label={t3({ en: "Reverse scale", fr: "Inverser l'échelle" })}
          checked={p.tempConfig.s.mapColorReverse}
          onChange={(v) => p.setTempConfig("s", "mapColorReverse", v)}
        />
        <RadioGroup
          label={t3({ en: "Scale type", fr: "Type d'échelle" })}
          options={[
            { value: "continuous", label: t3({ en: "Continuous", fr: "Continue" }) },
            { value: "discrete", label: t3({ en: "Discrete", fr: "Discrète" }) },
          ]}
          value={p.tempConfig.s.mapScaleType}
          onChange={(v) => p.setTempConfig("s", "mapScaleType", v as "continuous" | "discrete")}
          horizontal
        />
        <Show when={p.tempConfig.s.mapScaleType === "discrete"}>
          <Slider
            label={t3({ en: "Number of steps", fr: "Nombre de paliers" })}
            min={3}
            max={7}
            step={1}
            value={p.tempConfig.s.mapDiscreteSteps}
            onChange={(v) => p.setTempConfig("s", "mapDiscreteSteps", v)}
            fullWidth
            showValueInLabel
          />
        </Show>
        <div class="ui-spy-sm">
          <Checkbox
            label={t3({ en: "Fix value range", fr: "Fixer la plage de valeurs" })}
            checked={p.tempConfig.s.mapDomainType === "fixed"}
            onChange={(v) => p.setTempConfig("s", "mapDomainType", v ? "fixed" : "auto")}
          />
          <Show when={p.tempConfig.s.mapDomainType === "fixed"}>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-sm">
                {t3({ en: "Min", fr: "Min" })}
                <input
                  type="number"
                  step="0.01"
                  value={p.tempConfig.s.mapDomainMin}
                  onInput={(e) => p.setTempConfig("s", "mapDomainMin", Number(e.currentTarget.value))}
                  class="border-base-300 w-24 rounded border px-2 py-1 text-sm"
                />
              </label>
              <label class="flex items-center gap-1.5 text-sm">
                {t3({ en: "Max", fr: "Max" })}
                <input
                  type="number"
                  step="0.01"
                  value={p.tempConfig.s.mapDomainMax}
                  onInput={(e) => p.setTempConfig("s", "mapDomainMax", Number(e.currentTarget.value))}
                  class="border-base-300 w-24 rounded border px-2 py-1 text-sm"
                />
              </label>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
