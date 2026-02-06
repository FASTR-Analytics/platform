import { getTextRenderingOptions, ReplicantValueOverride } from "lib";
import type { AlertComponentProps, FigureInputs, StateHolder } from "panther";
import { Button, ChartHolder, Loading, openComponent } from "panther";
import { createSignal, Match, onMount, Switch } from "solid-js";
import { getPOFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/po_cache";

type Props = {
  projectId: string;
  presentationObjectId: string;
  replicantValue?: string;
};

export function VisualizationPreview(p: Props) {
  const [figureInputs, setFigureInputs] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
    msg: "Loading...",
  });

  // Build replicant override if provided
  const replicateOverride: ReplicantValueOverride | undefined = p.replicantValue
    ? { selectedReplicantValue: p.replicantValue }
    : undefined;

  async function fetchFigureInputs() {
    const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
      p.projectId,
      p.presentationObjectId,
      replicateOverride,
    );
    for await (const state of iter) {
      setFigureInputs(state);
    }
  }

  onMount(() => {
    fetchFigureInputs();
  });

  function openExpandedView() {
    const state = figureInputs();
    if (state.status !== "ready") return;

    openComponent<ExpandedVisualizationModalProps, void>({
      element: ExpandedVisualizationModal,
      props: { figureInputs: state.data },
    });
  }

  return (
    <div
      class="border-base-300 cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
      onClick={openExpandedView}
    >
      <VisualizationStateWrapper
        state={figureInputs()}
        scalePixelResolution={0.2}
      />
    </div>
  );
}

type VisualizationStateWrapperProps = {
  state: StateHolder<FigureInputs>;
  scalePixelResolution?: number;
};

function VisualizationStateWrapper(p: VisualizationStateWrapperProps) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div class="aspect-video text-xs">
          <Loading msg={(p.state as { msg?: string }).msg} noPad />
        </div>
      </Match>
      <Match when={p.state.status === "error"}>
        <div class="text-danger aspect-video text-xs">
          {(p.state as { err?: string }).err ?? "Error"}
        </div>
      </Match>
      <Match when={p.state.status === "ready"} keyed>
        <div class="aspect-video overflow-hidden">
          <ChartHolder
            chartInputs={(p.state as { data: FigureInputs }).data}
            height="ideal"
            noRescaleWithWidthChange
            textRenderingOptions={getTextRenderingOptions()}
            scalePixelResolution={p.scalePixelResolution}
          />
        </div>
      </Match>
    </Switch>
  );
}

type ExpandedVisualizationModalProps = {
  figureInputs: FigureInputs;
};

function ExpandedVisualizationModal(p: AlertComponentProps<ExpandedVisualizationModalProps, void>) {
  return (
    <div class="ui-pad flex flex-col" style={{ "max-width": "90vw", "max-height": "90vh" }}>
      <div class="min-h-0 flex-1 overflow-auto">
        <div style={{ width: "min(80vw, 1200px)" }}>
          <ChartHolder
            chartInputs={p.figureInputs}
            height="ideal"
            noRescaleWithWidthChange
            textRenderingOptions={getTextRenderingOptions()}
            scalePixelResolution={0.5}
          />
        </div>
      </div>
      <div class="ui-pad-top flex shrink-0 justify-end">
        <Button onClick={() => p.close(undefined)}>Close</Button>
      </div>
    </div>
  );
}
