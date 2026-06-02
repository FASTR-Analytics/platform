import {
  createEffect,
  createResource,
  Match,
  Switch,
  type JSX,
} from "solid-js";
import { ChartHolder, type FigureInputs } from "panther";
import type { FigureBlock } from "lib";
import {
  figureSourceToHydrationSource,
  hydrateFigureInputsForRendering,
} from "~/generate_visualization/mod";

type Props = {
  figure: FigureBlock;
  onMeasured?: () => void;
};

// One reusable FigureBlock -> live ChartHolder embed (editor widget and the
// View-mode preview renderImage both use this). reflow + height="ideal"
// per PROTOCOL_ALL_SIZING (editor is a readable surface). Re-hydrates reactively
// when the figure block changes (e.g. refresh / AI replace of an existing id).
export function ReportFigureEmbed(props: Props): JSX.Element {
  const [hydrated] = createResource(
    () => props.figure,
    async (figure) => {
      const fi = figure.figureInputs;
      if (!fi) throw new Error("Figure has no stored inputs");
      const source = figure.source
        ? figureSourceToHydrationSource(figure.source)
        : undefined;
      return await hydrateFigureInputsForRendering(fi, source);
    },
  );

  createEffect(() => {
    if (hydrated.state === "ready") props.onMeasured?.();
  });

  return (
    <Switch>
      <Match when={hydrated.loading}>
        <div class="ui-pad text-base-content/50 text-xs">Loading figure…</div>
      </Match>
      <Match when={hydrated.error}>
        <div class="ui-pad text-danger text-xs">
          {hydrated.error instanceof Error
            ? hydrated.error.message
            : String(hydrated.error)}
        </div>
      </Match>
      <Match when={hydrated()}>
        {(fi) => (
          <ChartHolder
            chartInputs={fi() as FigureInputs}
            height="ideal"
            sizing="zoom"
          />
        )}
      </Match>
    </Switch>
  );
}
