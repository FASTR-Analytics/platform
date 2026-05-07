import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ChartHolder } from "panther";
import type { ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

async function fetchBundle(token: string): Promise<ShareVizBundle | null> {
  const res = await fetch(`${_SERVER_HOST}/share/viz/${token}`);
  const json = await res.json();
  if (!json.success) return null;
  return json.data as ShareVizBundle;
}

export default function PublicVisualization() {
  const params = useParams<{ token: string }>();
  const [bundle] = createResource(() => params.token, fetchBundle);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", "flex-direction": "column" }}>
      <Show when={bundle.loading}>
        <div style={{ padding: "20px" }}>Loading...</div>
      </Show>
      <Show when={bundle.error || (bundle() === null && !bundle.loading)}>
        <div style={{ padding: "20px" }}>Visualization not found</div>
      </Show>
      <Show when={bundle()}>
        {(b) => {
          const fi = hydrateFigureInputsForPublicRendering(
            b().strippedFigureInputs,
            b().source,
            b().geoData,
            b().indicatorMetadata,
          );
          return (
            <>
              <div style={{ padding: "12px 20px", "border-bottom": "1px solid #e5e5e5" }}>
                <h1 style={{ margin: 0, "font-size": "18px" }}>{b().label}</h1>
              </div>
              <div style={{ flex: 1 }}>
                <ChartHolder chartInputs={fi} height="flex" />
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}
