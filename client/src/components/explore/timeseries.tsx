import {
  defaultGridQuery,
  deriveTimeseriesConfig,
  periodChoicesFor,
  resolveGridQuery,
  type DatasetType,
  type GridAvailable,
  type GridQuery,
  type MetricWithStatus,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import {
  FigureHolder,
  FrameTop,
  getLanguage,
  StateHolderWrapper,
} from "panther";
import { createMemo, type JSX, Show } from "solid-js";
import { createFigurePreview } from "~/components/_shared/mod.ts";
import { liveFigureStyle } from "~/generate_visualization/mod";
import {
  DroppedIndicatorsNotice,
  EmptyState,
  GrainControl,
  indicatorOptions,
  IndicatorsControl,
  PeriodControl,
  queryEditors,
} from "./_shared/mod.ts";

// HMIS reads no time points or years, so the package offers nothing beyond
// the authoring context here.
const NO_TIME_VALUES: GridAvailable = {
  hfaTimePoints: [],
  icehYears: [],
  icehStrats: [],
};

// The Timeseries view: a metric's indicators as lines over time, one pane
// per indicator, laid out at the container width so a design unit is a CSS
// pixel. It shares the family's GridQuery with the data table (indicators,
// period and grain are its controls) and renders through the same
// scope-keyed items read as a figure in a product.
export function Timeseries(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  metric: MetricWithStatus;
  viewSelect: JSX.Element;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
}) {
  const intent = (): GridQuery =>
    p.query ?? defaultGridQuery(p.family, p.scope, p.ctx, NO_TIME_VALUES);
  const resolved = createMemo(() =>
    resolveGridQuery(intent(), "time", p.scope, p.ctx, NO_TIME_VALUES)
  );
  const { update, clearDropped } = queryEditors(intent, resolved, p.setQuery);
  const derived = createMemo(() =>
    deriveTimeseriesConfig(resolved().query, p.ctx, getLanguage())
  );

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-spy-sm">
          <div class="ui-gap-sm flex items-center">{p.viewSelect}</div>
          <div class="ui-gap-sm flex flex-wrap items-end">
            <IndicatorsControl
              values={resolved().query.indicators}
              options={indicatorOptions(p.family, p.ctx)}
              onChange={(indicators) => update({ indicators })}
            />
            <PeriodControl
              period={resolved().query.period}
              choices={periodChoicesFor(p.family, "time", NO_TIME_VALUES)}
              onChange={(period) => update({ period })}
            />
            <GrainControl
              value={resolved().query.grain}
              onChange={(grain) => update({ grain })}
            />
          </div>
          <Show when={resolved().droppedIndicators.length > 0}>
            <DroppedIndicatorsNotice
              count={resolved().droppedIndicators.length}
              onClear={clearDropped}
            />
          </Show>
        </div>
      }
    >
      <div class="ui-pad-x h-full w-full overflow-y-auto pb-4">
        <Show when={derived()} fallback={<EmptyState kind="no_preset" />}>
          {(d) => {
            const figure = createFigurePreview(() => ({
              scope: p.scope,
              metric: d().metric,
              config: d().config,
            }));
            return (
              <StateHolderWrapper state={figure()} noPad>
                {(inputs) => (
                  <FigureHolder
                    figureInputs={{ ...inputs, style: liveFigureStyle(inputs.style) }}
                    height="ideal"
                  />
                )}
              </StateHolderWrapper>
            );
          }}
        </Show>
      </div>
    </FrameTop>
  );
}
