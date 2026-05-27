import { useParams } from "@solidjs/router";
import type {
  APIResponseWithData,
  PublicDashboardBundle,
  PublicDashboardItem,
} from "lib";
import { t3 } from "lib";
import {
  Button,
  ChartHolder,
  SelectList,
  StateHolderWrapper,
  saveAs,
  timQuery,
} from "panther";
import { Show, createSignal } from "solid-js";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

const CANVAS_ID = "PUBLIC_DASHBOARD_CANVAS";

async function fetchBundle(
  projectId: string,
  slug: string,
): Promise<APIResponseWithData<PublicDashboardBundle>> {
  const res = await fetch(`${_SERVER_HOST}/api/d/${projectId}/${slug}`);
  return res.json();
}

export default function PublicDashboard() {
  const params = useParams<{ projectId: string; slug: string }>();
  const bundleHolder = timQuery(
    () => fetchBundle(params.projectId, params.slug),
    t3({ en: "Loading...", fr: "Chargement..." }),
  );
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>(
    undefined,
  );

  async function download() {
    const id = selectedItemId();
    if (!id) return;
    const canvas = document.getElementById(
      `${CANVAS_ID}_${id}`,
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
    saveAs(blob, "dashboard.png");
  }

  return (
    <StateHolderWrapper state={bundleHolder.state()}>
      {(bundle) => (
        <PublicDashboardInner
          bundle={bundle}
          selectedItemId={selectedItemId()}
          setSelectedItemId={setSelectedItemId}
          onDownload={download}
        />
      )}
    </StateHolderWrapper>
  );
}

type InnerProps = {
  bundle: PublicDashboardBundle;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string) => void;
  onDownload: () => void;
};

function PublicDashboardInner(p: InnerProps) {
  const items = () => [...p.bundle.items].sort((a, b) => a.sortOrder - b.sortOrder);

  const currentItem = () => {
    const list = items();
    if (list.length === 0) return undefined;
    const selected = p.selectedItemId;
    return list.find((i) => i.id === selected) ?? list[0];
  };

  const isRight = () => p.bundle.layout.menuPosition === "right";

  const sidebar = (
    <div
      class="border-base-300 ui-spy-sm flex w-64 min-w-0 flex-col overflow-auto md:h-screen"
      classList={{
        "border-r md:border-r": !isRight(),
        "border-l md:border-l md:order-2": isRight(),
      }}
    >
      <div class="border-base-300 ui-pad border-b">
        <div class="font-700 text-lg truncate">{p.bundle.title}</div>
      </div>
      <div class="flex-1 overflow-auto p-2">
        <SelectList
          options={items().map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          value={currentItem()?.id}
          onChange={(id) => p.setSelectedItemId(id)}
          intent="primary"
          fullWidth
        />
      </div>
    </div>
  );

  const main = (
    <div
      class="relative flex-1 overflow-auto"
      classList={{ "md:order-1": isRight() }}
    >
      <div class="absolute right-4 top-4 z-10">
        <Show when={currentItem()}>
          <Button onClick={p.onDownload} iconName="download" outline />
        </Show>
      </div>
      <Show
        when={currentItem()}
        keyed
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t3({
              en: "No items in this dashboard",
              fr: "Aucun élément dans ce tableau de bord",
            })}
          </div>
        }
      >
        {(item) => <PublicItemCanvas item={item} />}
      </Show>
    </div>
  );

  return (
    <div class="flex h-screen w-screen flex-col md:flex-row">
      {sidebar}
      {main}
    </div>
  );
}

function PublicItemCanvas(p: { item: PublicDashboardItem }) {
  const fi = () =>
    hydrateFigureInputsForPublicRendering(
      p.item.strippedFigureInputs,
      p.item.source,
      p.item.geoData,
    );
  return (
    <ChartHolder
      canvasElementId={`${CANVAS_ID}_${p.item.id}`}
      chartInputs={fi()}
      height={"flex"}
    />
  );
}
