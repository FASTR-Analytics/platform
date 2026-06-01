import { createSignal, Match, onMount, Switch, type JSX } from "solid-js";
import { ChartHolder, type FigureInputs, type StateHolder } from "panther";
import type { FigureBlock } from "lib";
import {
  figureSourceToHydrationSource,
  hydrateFigureInputsForRendering,
} from "~/generate_visualization/mod";

type Props = {
  figure: FigureBlock;
  onMeasured?: () => void;
};

// One reusable FigureBlock -> live ChartHolder embed (editor widget, preview
// renderImage, and DraftReportPreview all use this). reflow + height="ideal"
// per PROTOCOL_ALL_SIZING (editor is a readable surface).
export function ReportFigureEmbed(props: Props): JSX.Element {
  const [state, setState] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
  });

  onMount(async () => {
    const fi = props.figure.figureInputs;
    if (!fi) {
      setState({ status: "error", err: "Figure has no stored inputs" });
      return;
    }
    try {
      const source = props.figure.source
        ? figureSourceToHydrationSource(props.figure.source)
        : undefined;
      const hydrated = await hydrateFigureInputsForRendering(fi, source);
      setState({ status: "ready", data: hydrated });
      props.onMeasured?.();
    } catch (e) {
      setState({
        status: "error",
        err: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return (
    <Switch>
      <Match when={state().status === "loading"}>
        <div class="ui-pad text-base-content/50 text-xs">Loading figure…</div>
      </Match>
      <Match when={state().status === "error"}>
        <div class="ui-pad text-danger text-xs">
          {(state() as { err?: string }).err ?? "Error"}
        </div>
      </Match>
      <Match when={state().status === "ready"}>
        <ChartHolder
          chartInputs={(state() as { data: FigureInputs }).data}
          height="ideal"
        />
      </Match>
    </Switch>
  );
}
