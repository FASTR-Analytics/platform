import { useParams, useSearchParams } from "@solidjs/router";
import { Button, ChartHolder, saveAs } from "panther";
import { createSignal, Match, Switch } from "solid-js";
import type { ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";
import { PasswordGate } from "~/components/PasswordGate";

const CANVAS_ID = "PUBLIC_VIZ_CANVAS";

type ViewState =
  | { status: "loading" }
  | { status: "password_required"; wrongPassword?: true }
  | { status: "not_found" }
  | { status: "ready"; bundle: ShareVizBundle };

export default function PublicVisualization() {
  const params = useParams<{ token: string }>();
  const [searchParams] = useSearchParams<{
    pad?: string;
    padding?: string;
    height?: string;
    noRescale?: string;
  }>();

  const [viewState, setViewState] = createSignal<ViewState>({ status: "loading" });

  const padding = () =>
    searchParams.pad === "true" || searchParams.padding === "true";
  const chartHeight = () =>
    searchParams.height === "ideal" ? "ideal" : "flex";
  const noRescale = () => searchParams.noRescale === "true";

  const load = async (password?: string) => {
    setViewState({ status: "loading" });
    try {
      const res = password
        ? await fetch(`${_SERVER_HOST}/api/share/viz/${params.token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          })
        : await fetch(`${_SERVER_HOST}/api/share/viz/${params.token}`);

      const json = await res.json();

      if (json.requiresPassword) {
        setViewState({ status: "password_required" });
      } else if (json.wrongPassword) {
        setViewState({ status: "password_required", wrongPassword: true });
      } else if (!json.success) {
        setViewState({ status: "not_found" });
      } else {
        setViewState({ status: "ready", bundle: json.data as ShareVizBundle });
      }
    } catch {
      setViewState({ status: "not_found" });
    }
  };

  load();

  const download = async () => {
    const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
    if (!canvas) return;
    const pad = 50;
    const backCanvas = new OffscreenCanvas(canvas.width + 2 * pad, canvas.height + 2 * pad);
    const ctx = backCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);
    ctx.drawImage(canvas, pad, pad);
    const blob = await backCanvas.convertToBlob({ type: "image/png", quality: 1 });
    saveAs(blob, "visualization.png");
  };

  return (
    <div
      class="relative h-full w-full overflow-y-auto"
      classList={{ "ui-pad-lg": padding() }}
    >
      <Switch>
        <Match when={viewState().status === "loading"}>
          <div class="flex h-full items-center justify-center">
            <div class="text-neutral text-sm">Loading...</div>
          </div>
        </Match>

        <Match when={viewState().status === "not_found"}>
          <div class="flex h-full items-center justify-center">
            <div class="text-neutral text-sm">Visualization not found.</div>
          </div>
        </Match>

        <Match when={viewState().status === "password_required" || viewState().status === "ready"}>
          {(() => {
            const state = viewState();
            return (
              <PasswordGate
                requiresPassword={state.status === "password_required"}
                wrongPassword={(state as { wrongPassword?: true }).wrongPassword}
                onSubmit={(pwd) => load(pwd)}
              >
                {state.status === "ready" && (() => {
                  const fi = hydrateFigureInputsForPublicRendering(
                    (state as { bundle: ShareVizBundle }).bundle.strippedFigureInputs,
                    (state as { bundle: ShareVizBundle }).bundle.source,
                    (state as { bundle: ShareVizBundle }).bundle.geoData,
                    (state as { bundle: ShareVizBundle }).bundle.indicatorMetadata,
                  );
                  return (
                    <>
                      <div class="absolute top-4 right-4 z-10">
                        <Button onClick={download} iconName="download" outline />
                      </div>
                      <ChartHolder
                        canvasElementId={CANVAS_ID}
                        noRescaleWithWidthChange={noRescale()}
                        chartInputs={fi}
                        height={chartHeight()}
                      />
                    </>
                  );
                })()}
              </PasswordGate>
            );
          })()}
        </Match>
      </Switch>
    </div>
  );
}
