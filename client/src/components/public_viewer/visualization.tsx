import { useParams, useSearchParams } from "@solidjs/router";
import { ChartHolder, StateHolderWrapper, timQuery } from "panther";
import type { APIResponseWithData, ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

async function fetchBundle(
  token: string,
): Promise<APIResponseWithData<ShareVizBundle>> {
  const res = await fetch(`${_SERVER_HOST}/api/share/viz/${token}`);
  return res.json();
}

export default function PublicVisualization() {
  const params = useParams<{ token: string }>();
  const [searchParams] = useSearchParams<{ embed?: string; height?: string }>();
  const bundleHolder = timQuery(() => fetchBundle(params.token), "Loading...");

  const isEmbed = () => searchParams.embed === "true";
  const chartHeight = () =>
    searchParams.height === "ideal" ? "ideal" : "flex";

  return (
    <div
      class="h-full w-full overflow-y-auto"
      classList={{
        "ui-pad-lg": !isEmbed(),
      }}
    >
      <StateHolderWrapper state={bundleHolder.state()} noPad>
        {(bundle) => {
          const fi = hydrateFigureInputsForPublicRendering(
            bundle.strippedFigureInputs,
            bundle.source,
            bundle.geoData,
            bundle.indicatorMetadata,
          );
          return (
            <ChartHolder
              noRescaleWithWidthChange
              chartInputs={fi}
              height={chartHeight()}
            />
          );
        }}
      </StateHolderWrapper>
    </div>
  );
}
