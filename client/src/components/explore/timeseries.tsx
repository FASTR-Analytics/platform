import {
  type DerivedConfig,
  type FamilyQuery,
  type PackageScope,
  type ResolvedView,
} from "lib";
import { FigureHolder, FrameTop, StateHolderWrapper } from "panther";
import { type JSX, Show } from "solid-js";
import { createFigurePreview } from "~/components/_shared/mod.ts";
import { liveFigureStyle } from "~/generate_visualization/mod";
import {
  DroppedIndicatorsNotice,
  GrainControl,
  IndicatorsControl,
  PeriodControl,
} from "./_shared/mod.ts";
import { GridMessage } from "./data_table/mod.ts";

// The Timeseries view: the resolved view's metric as lines over time, one
// pane per indicator, laid out at the container width so a design unit is a
// CSS pixel. The page resolves the view and derives the config; this renders
// it through the same scope-keyed items read as a figure in a product.
export function Timeseries(p: {
  scope: PackageScope;
  view: ResolvedView;
  derived: DerivedConfig | undefined;
  selectors: JSX.Element;
  onChange: (patch: Partial<FamilyQuery>) => void;
  onCategoryChange: (ids: string[]) => void;
  onClearDropped: () => void;
}) {
  return (
    <FrameTop
      panelPad="md"
      panelSpy="sm"
      panelChildren={
        <>
          {p.selectors}
          <div class="ui-gap-sm flex flex-wrap items-end">
            <Show
              when={p.view.category?.placement === "laid_out"
                ? p.view.category
                : undefined}
            >
              {(category) => (
                <IndicatorsControl
                  values={category().values}
                  options={category().options.map((o) => ({
                    value: o.id,
                    label: o.label,
                  }))}
                  onChange={p.onCategoryChange}
                />
              )}
            </Show>
            <Show when={p.view.time}>
              {(time) => (
                <PeriodControl
                  period={p.view.query.period}
                  choices={time().choices}
                  onChange={(period) => p.onChange({ period })}
                />
              )}
            </Show>
            <Show when={p.view.time?.grainShown}>
              <GrainControl
                value={p.view.query.grain}
                onChange={(grain) => p.onChange({ grain })}
              />
            </Show>
          </div>
          <Show when={p.view.droppedIndicators.length > 0}>
            <DroppedIndicatorsNotice
              count={p.view.droppedIndicators.length}
              onClear={p.onClearDropped}
            />
          </Show>
        </>
      }
    >
      <div class="ui-pad-x h-full w-full overflow-y-auto pb-4">
        <Show
          when={p.derived}
          fallback={<GridMessage status="no_data_available" />}
        >
          {(d) => {
            const figure = createFigurePreview(() => ({
              scope: p.scope,
              metric: d().metric,
              config: d().config,
            }));
            return (
              <StateHolderWrapper state={figure()}>
                {(inputs) => (
                  <FigureHolder
                    figureInputs={{
                      ...inputs,
                      style: liveFigureStyle({
                        ...inputs.style,
                        seriesColorFunc: () => ({ key: "success" }),
                      }),
                    }}
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
