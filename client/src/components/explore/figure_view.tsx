import {
  type DerivedConfig,
  hasOneLinePerPane,
  type PackageScope,
  type ResolvedView,
} from "lib";
import {
  type CustomFigureStyleOptions,
  FigureHolder,
  StateHolderWrapper,
} from "panther";
import { createFigurePreview } from "~/components/_shared/mod.ts";
import { liveFigureStyle } from "~/generate_visualization/mod";

// The figure types' body: the derived config fetched and built through
// `createFigurePreview`, so it shares the scope-keyed items cache with
// products, and rendered by `FigureHolder` at its ideal height in a pane
// that scrolls, laid out at the container width so a design unit is a CSS
// pixel, under the live figure style. An over-time view whose every pane
// holds one line draws it in the success colour; one with several lines
// keeps the figure's own colours and its legend.
export function FigureView(p: {
  scope: PackageScope;
  view: ResolvedView;
  derived: DerivedConfig;
}) {
  const figure = createFigurePreview(() => ({
    scope: p.scope,
    metric: p.derived.metric,
    config: p.derived.config,
  }));
  const style = (own: CustomFigureStyleOptions): CustomFigureStyleOptions =>
    liveFigureStyle(
      hasOneLinePerPane(p.view.type, p.view.metric)
        ? { ...own, seriesColorFunc: () => ({ key: "success" }) }
        : own,
    );
  return (
    <div class="ui-pad-x h-full w-full overflow-y-auto pb-4">
      <StateHolderWrapper state={figure()}>
        {(inputs) => (
          <FigureHolder
            figureInputs={{ ...inputs, style: style(inputs.style ?? {}) }}
            height="ideal"
          />
        )}
      </StateHolderWrapper>
    </div>
  );
}
