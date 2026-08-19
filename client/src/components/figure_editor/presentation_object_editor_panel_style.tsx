import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  ResultsValueInfoForPresentationObject,
  getDisaggregatorDisplayProp,
  type IndicatorFormat,
} from "lib";
import { openComponent } from "panther";
import { Match, Show, Switch } from "solid-js";
import { SetStoreFunction, unwrap } from "solid-js/store";
import { CustomSeriesStyles } from "~/components/forms_editors/custom_series_styles";
import {
  canUseSpecialCoverageChart,
  canUseSpecialDisruptionsChart,
  canUseSpecialPercentChangeChart,
  canUseSpecialScorecardTable,
} from "~/generate_visualization/special_chart_checks";
import { SharedControlsTop } from "./presentation_object_editor_panel_style/_shared";
import { TimeseriesStyleControls } from "./presentation_object_editor_panel_style/_timeseries";
import { ChartStyleControls } from "./presentation_object_editor_panel_style/_chart";
import { TableStyleControls } from "./presentation_object_editor_panel_style/_table";
import { MapStyleControls } from "./presentation_object_editor_panel_style/_map";
import { PieStyleControls } from "./presentation_object_editor_panel_style/_pie";
import { CustomValueOrderSection } from "./presentation_object_editor_panel_style/_custom_value_order";

type Props = {
  projectId: string;
  poDetail: PresentationObjectDetail;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  effectiveConfig: PresentationObjectConfig;
  effectiveValueProps: string[];
  /** The format the figure's values will actually be written in — resolved
   *  from the draft config, not the metric's stored formatAs, which is
   *  "number" for every HFA metric regardless of what it displays. */
  effectiveFormatAs: IndicatorFormat;
};

export function PresentationObjectEditorPanelStyle(p: Props) {
  const metricId = () => p.poDetail.resultsValue.id;

  const showCoverageMode = () => canUseSpecialCoverageChart(metricId());
  const showPercentChangeMode = () => canUseSpecialPercentChangeChart(metricId());
  const showDisruptionsMode = () => canUseSpecialDisruptionsChart(metricId());
  const showScorecardMode = () => canUseSpecialScorecardTable(metricId());

  // n is a survey concept and is counted over facility rows, so the server only
  // emits it for HFA metrics whose results table has facility_id. Offering the
  // toggle anywhere else would be a switch that does nothing.
  const showNValuesToggle = () =>
    p.poDetail.resultsValue.datasetFamily === "hfa" &&
    p.poDetail.resultsValue.hasFacilityLevelRows === true;

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
    !!getDisaggregatorDisplayProp(p.poDetail.resultsValue, p.effectiveConfig, [
      "cell",
    ], p.effectiveValueProps);


  return (
    <div data-viz-panel-scroll
      data-tour="viz-panel-style" class="ui-pad ui-spy h-full w-full overflow-auto">
      <SharedControlsTop
        poDetail={p.poDetail}
        tempConfig={p.tempConfig}
        setTempConfig={p.setTempConfig}
        usingCells={usingCells}
      />
      <Switch>
        <Match when={p.tempConfig.d.type === "timeseries"}>
          <TimeseriesStyleControls
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            editCustomSeriesStyles={editCustomSeriesStyles}
            showCoverageMode={showCoverageMode()}
            showPercentChangeMode={showPercentChangeMode()}
            showDisruptionsMode={showDisruptionsMode()}
            effectiveFormatAs={p.effectiveFormatAs}
          />
        </Match>
        <Match when={p.tempConfig.d.type === "chart"}>
          <ChartStyleControls
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            editCustomSeriesStyles={editCustomSeriesStyles}
            effectiveFormatAs={p.effectiveFormatAs}
          />
        </Match>
        <Match when={p.tempConfig.d.type === "table"}>
          <TableStyleControls
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            showScorecardMode={showScorecardMode()}
            showNValuesToggle={showNValuesToggle()}
            effectiveFormatAs={p.effectiveFormatAs}
          />
        </Match>
        <Match when={p.tempConfig.d.type === "map"}>
          <MapStyleControls
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            effectiveFormatAs={p.effectiveFormatAs}
          />
        </Match>
        <Match when={p.tempConfig.d.type === "pie"}>
          <PieStyleControls
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            editCustomSeriesStyles={editCustomSeriesStyles}
            effectiveFormatAs={p.effectiveFormatAs}
          />
        </Match>
      </Switch>
      <Show when={p.tempConfig.d.type !== "map"}>
        <CustomValueOrderSection
          resultsValueInfo={p.resultsValueInfo}
          tempConfig={p.tempConfig}
          setTempConfig={p.setTempConfig}
          effectiveValueProps={p.effectiveValueProps}
        />
      </Show>
    </div>
  );
}
