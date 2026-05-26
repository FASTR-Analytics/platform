import { useParams, useSearchParams } from "@solidjs/router";
import {
  Button,
  ChartHolder,
  saveAs,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { Show } from "solid-js";
import type { APIResponseWithData, ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

const CANVAS_ID = "PUBLIC_VIZ_CANVAS";

async function fetchBundle(
  token: string,
): Promise<APIResponseWithData<ShareVizBundle>> {
  const res = await fetch(`${_SERVER_HOST}/api/share/viz/${token}`);
  return res.json();
}

export default function PublicVisualization() {
  const params = useParams<{ token: string }>();
  const [searchParams] = useSearchParams<{
    pad?: string;
    padding?: string;
    height?: string;
    noRescale?: string;
  }>();
  const bundleHolder = timQuery(() => fetchBundle(params.token), "Loading...");

  const padding = () =>
    searchParams.pad === "true" || searchParams.padding === "true";
  const chartHeight = () =>
    searchParams.height === "ideal" ? "ideal" : "flex";
  const noRescale = () => searchParams.noRescale === "true";

  const download = async () => {
    const canvas = document.getElementById(
      CANVAS_ID,
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    const padding = 50;
    const newW = canvas.width + 2 * padding;
    const newH = canvas.height + 2 * padding;
    const backCanvas = new OffscreenCanvas(newW, newH);
    const ctx = backCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, newW, newH);
    ctx.drawImage(canvas, padding, padding);
    const blob = await backCanvas.convertToBlob({
      type: "image/png",
      quality: 1,
    });
    saveAs(blob, "visualization.png");
  };

  return (
    <div
      class="relative h-full w-full overflow-y-auto"
      classList={{
        "ui-pad-lg": padding(),
      }}
    >
      {/* <Show when={padding()}> */}
      <div class="absolute top-4 right-4 z-10">
        <Button onClick={download} iconName="download" outline>
          {/* Download */}
        </Button>
      </div>
      {/* </Show> */}
      <StateHolderWrapper state={bundleHolder.state()} noPad>
        {(bundle) => {
          const fi = hydrateFigureInputsForPublicRendering(
            bundle.strippedFigureInputs,
            bundle.source,
            bundle.geoData,
          );
          return (
            <ChartHolder
              canvasElementId={CANVAS_ID}
              noRescaleWithWidthChange={noRescale()}
              chartInputs={fi}
              height={chartHeight()}
            />
          );
        }}
      </StateHolderWrapper>
    </div>
  );
}
