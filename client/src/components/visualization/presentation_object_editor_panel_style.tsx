import {
  PeriodOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  get_PERIOD_OPTION_MAP,
  getDisaggregatorDisplayProp,
  t2,
  T,
} from "lib";
import {
  AspectRatio,
  Button,
  Checkbox,
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
import { t } from "lib";

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
          label={t2(T.FRENCH_UI_STRINGS.period)}
          options={p.poDetail.resultsValue.periodOptions.map((value) => {
            return { value, label: get_PERIOD_OPTION_MAP()[value] };
          })}
          value={p.tempConfig.d.periodOpt}
          onChange={(v) => p.setTempConfig("d", "periodOpt", v as PeriodOption)}
        />
      </Show>
      <Slider
        label={t2(T.FRENCH_UI_STRINGS.scale)}
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
      <Show when={p.tempConfig.d.type !== "table"}>
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.aspect_ratio)}
          options={[
            { value: "none", label: "Fit to area" },
            { value: "video", label: "16 x 9" },
            { value: "square", label: "1 x 1" },
          ]}
          value={p.tempConfig.s.idealAspectRatio}
          onChange={(v) =>
            p.setTempConfig(
              "s",
              "idealAspectRatio",
              v as "none" | "ideal" | AspectRatio,
            )
          }
        />
      </Show>
      <Show when={p.tempConfig.d.type === "table"}>
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.aspect_ratio)}
          options={[
            { value: "none", label: "Fit to area" },
            { value: "ideal", label: "Ideal for table" },
          ]}
          value={p.tempConfig.s.idealAspectRatio}
          onChange={(v) =>
            p.setTempConfig(
              "s",
              "idealAspectRatio",
              v as "none" | "ideal" | AspectRatio,
            )
          }
        />
      </Show>
      <Show when={p.tempConfig.d.type === "table"}>
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.allow_vertical_column_headers)}
          checked={p.tempConfig.s.allowVerticalColHeaders}
          onChange={(v) => p.setTempConfig("s", "allowVerticalColHeaders", v)}
        />
      </Show>
      <Show when={usingCells()}>
        <LabelHolder label={t2(T.Visualizations.number_grid_columns)}>
          <div class="ui-spy-sm">
            <Checkbox
              label={t("Auto")}
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
                label={t2(T.FRENCH_UI_STRINGS.columns)}
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
          label={t2(T.FRENCH_UI_STRINGS.display_format)}
          options={[
            { value: "lines", label: t2(T.FRENCH_UI_STRINGS.lines) },
            { value: "areas", label: t2(T.FRENCH_UI_STRINGS.areas) },
            { value: "bars", label: t2(T.FRENCH_UI_STRINGS.bars) },
          ]}
          value={p.tempConfig.s.content}
          onChange={(v) =>
            p.setTempConfig("s", "content", v as "lines" | "areas" | "bars")
          }
        />
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.special_coverage_chart)}
          checked={p.tempConfig.s.specialCoverageChart}
          onChange={(v) => p.setTempConfig("s", "specialCoverageChart", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type === "chart"}>
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.display_format)}
          options={[
            { value: "bars", label: t2(T.FRENCH_UI_STRINGS.bars) },
            { value: "points", label: t("Points") },
            { value: "lines", label: t2(T.FRENCH_UI_STRINGS.lines) },
          ]}
          value={p.tempConfig.s.content}
          onChange={(v) =>
            p.setTempConfig("s", "content", v as "bars" | "points")
          }
        />
        <LabelHolder label={t2(T.FRENCH_UI_STRINGS.sort_indicator_values)}>
          <div class="space-y-1">
            <Checkbox
              label={t2(T.FRENCH_UI_STRINGS.descending)}
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
              label={t2(T.FRENCH_UI_STRINGS.ascending)}
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
          p.tempConfig.d.type !== "table" && p.tempConfig.s.content === "bars"
        }
      >
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.stacked_bars)}
          checked={p.tempConfig.s.barsStacked}
          onChange={(v) => p.setTempConfig("s", "barsStacked", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type === "table"}>
        <Checkbox
          label={t2(T.Visualizations.special_scorecard)}
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
            label={t2(T.FRENCH_UI_STRINGS.special_percent_change_chart)}
            checked={p.tempConfig.s.specialBarChart}
            onChange={(v) => p.setTempConfig("s", "specialBarChart", v)}
          />
          <Show when={p.tempConfig.s.specialBarChart}>
            <div class="ui-spy-sm border-base-300 rounded border p-4">
              <Slider
                label={t2(T.FRENCH_UI_STRINGS.threshold)}
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
                label={t("Invert red/green for higher/lower")}
                checked={p.tempConfig.s.specialBarChartInverted}
                onChange={(v) => p.setTempConfig("s", "specialBarChartInverted", v)}
              />
              <Show when={p.tempConfig.s.showDataLabels}>
                <Checkbox
                  label={t2(T.FRENCH_UI_STRINGS.only_show_data_labels_on_bars)}
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
            label={t2(T.FRENCH_UI_STRINGS.diff_areas)}
            checked={p.tempConfig.s.diffAreas}
            onChange={(v) => p.setTempConfig("s", "diffAreas", v)}
          />
          <Show when={p.tempConfig.s.diffAreas}>
            <div class="ui-spy-sm border-base-300 rounded border p-4">
              <Checkbox
                label={t("Invert red/green for surplus/disruptions")}
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
          label={t2(T.FRENCH_UI_STRINGS.vertical_tick_labels)}
          checked={p.tempConfig.s.verticalTickLabels}
          onChange={(v) => p.setTempConfig("s", "verticalTickLabels", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table"}>
        <Show when={p.tempConfig.s.content === "bars" || p.tempConfig.s.content === "points"}>
          <Checkbox
            checked={p.tempConfig.s.showDataLabels}
            onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
            label={t2(T.FRENCH_UI_STRINGS.show_data_labels)}
          />
        </Show>
        <Show when={p.tempConfig.s.content === "lines" || p.tempConfig.s.content === "areas"}>
          <Checkbox
            checked={p.tempConfig.s.showDataLabelsLineCharts}
            onChange={(v) => p.setTempConfig("s", "showDataLabelsLineCharts", v)}
            label={t2(T.FRENCH_UI_STRINGS.show_data_labels) + " in line charts"}
          />
        </Show>
      </Show>
      <Show
        when={
          p.tempConfig.d.type !== "table" &&
          p.poDetail.resultsValue.formatAs === "percent"
        }
      >
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.force_yaxis_max_of_100)}
          checked={p.tempConfig.s.forceYMax1}
          onChange={(v) => p.setTempConfig("s", "forceYMax1", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table"}>
        <Checkbox
          label={t2(T.Visualizations.allow_yaxis_min)}
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
          label={t2(T.FRENCH_UI_STRINGS.decimal_places)}
          options={getSelectOptions(["0", "1", "2", "3"])}
          value={String(p.tempConfig.s.decimalPlaces)}
          onChange={(v) =>
            p.setTempConfig("s", "decimalPlaces", Number(v) as 1 | 2 | 3)
          }
          horizontal
        />
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.conditional_formatting)}
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
      <Show when={p.tempConfig.d.type !== "table"}>
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.allow_individual_row_limits)}
          checked={p.tempConfig.s.allowIndividualRowLimits}
          onChange={(v) => p.setTempConfig("s", "allowIndividualRowLimits", v)}
        />
      </Show>
      <Show when={p.tempConfig.d.type !== "table"}>
        <div class="ui-spy-sm">
          <RadioGroup
            label={t2(T.FRENCH_UI_STRINGS.color_scale)}
            options={[
              { value: "pastel-discrete", label: "Discrete 1" },
              { value: "alt-discrete", label: "Discrete 2" },
              { value: "red-green", label: "Red-green" },
              { value: "blue-green", label: "Blue-green" },
              { value: "single-grey", label: "Single grey" },
              {
                value: "custom",
                label: t2(T.FRENCH_UI_STRINGS.custom_colours),
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
                {t2(T.FRENCH_UI_STRINGS.set_custom_colours)}
              </Button>
            </div>
          </Show>
          <Select
            label={t2(T.FRENCH_UI_STRINGS.color_scale_mapping)}
            options={
              p.tempConfig.d.type === "timeseries"
                ? [
                  { value: "series", label: "Series (lines / bars)" },
                  { value: "cell", label: "Grid cells" },
                  { value: "col", label: "Column groups" },
                  { value: "row", label: "Row groups" },
                ]
                : [
                  { value: "series", label: "Series (sub-bars)" },
                  { value: "cell", label: "Grid cells" },
                  { value: "col", label: "Column groups" },
                  { value: "row", label: "Row groups" },
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
          label={t2(T.FRENCH_UI_STRINGS.hide_legend)}
        />
      </Show>
      <Show when={includesAdminArea3()}>
        <Checkbox
          checked={p.tempConfig.s.formatAdminArea3Labels}
          onChange={(v) => p.setTempConfig("s", "formatAdminArea3Labels", v)}
          label={t("Format Nigeria Admin Area 3 labels (e.g., 'ab Abia State' → 'Abia')")}
        />
      </Show>
    </div>
  );
}
