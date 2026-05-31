import { useParams } from "@solidjs/router";
import type { PublicDashboardBundle } from "lib";
import { t3 } from "lib";
import {
  Button,
  ChartHolder,
  FrameLeft,
  FrameRight,
  FrameTop,
  SelectList,
  StateHolderWrapper,
  saveAs,
  timQuery,
  type FigureInputs,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

const CANVAS_ID = "PUBLIC_DASHBOARD_CANVAS";

export default function PublicDashboard() {
  const params = useParams<{ projectId: string; slug: string }>();

  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>(
    undefined,
  );

  const bundleHolder = timQuery<PublicDashboardBundle>(
    async () => {
      const res = await fetch(
        `${_SERVER_HOST}/api/d/${params.projectId}/${params.slug}`,
      );
      const resJson = await res.json();
      return resJson;
    },
    t3({ en: "Loading...", fr: "Chargement..." }),
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
        <DashboardViewer
          bundle={bundle}
          selectedItemId={selectedItemId()}
          setSelectedItemId={setSelectedItemId}
          onDownload={download}
        />
      )}
    </StateHolderWrapper>
  );
}

export type DashboardViewerProps = {
  bundle: PublicDashboardBundle;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string) => void;
  onDownload?: () => void;
};

export function DashboardViewer(p: DashboardViewerProps) {
  const items = () =>
    [...p.bundle.items].sort((a, b) => a.sortOrder - b.sortOrder);

  const currentItem = () => {
    const list = items();
    if (list.length === 0) return undefined;
    const selected = p.selectedItemId;
    return list.find((i) => i.id === selected) ?? list[0];
  };

  const layoutType = () => p.bundle.layout.type;

  return (
    <FrameTop
      panelChildren={
        <div class="font-700 border-base-300 ui-pad border-b text-lg">
          {p.bundle.title}
        </div>
      }
    >
      <Switch>
        <Match when={layoutType() === "grid"}>
          <GridLayout title={p.bundle.title} items={items()} />
        </Match>
        <Match when={layoutType() === "sidebar"}>
          <SidebarLayout
            title={p.bundle.title}
            items={items()}
            currentItem={currentItem()}
            setSelectedItemId={p.setSelectedItemId}
            onDownload={p.onDownload}
          />
        </Match>
      </Switch>
    </FrameTop>
  );
}

export type SidebarLayoutProps = {
  title: string;
  items: PublicDashboardBundle["items"];
  currentItem: PublicDashboardBundle["items"][number] | undefined;
  setSelectedItemId: (id: string) => void;
  onDownload?: () => void;
};

export function SidebarLayout(p: SidebarLayoutProps) {
  return (
    <FrameLeft
      panelChildren={
        <div class="ui-pad border-base-300 h-full max-w-[400px] border-r">
          <SelectList
            items={p.items.map((item) => ({
              id: item.id,
              label: item.label,
            }))}
            value={p.currentItem?.id}
            onChange={(id) => p.setSelectedItemId(id)}
            intent="primary"
            fullWidth
          />
        </div>
      }
    >
      <div class="ui-pad relative h-full w-full overflow-auto">
        <div class="absolute top-4 right-4 z-10">
          <Show when={p.currentItem}>
            <Button onClick={p.onDownload} iconName="download" outline />
          </Show>
        </div>
        <Show
          when={p.currentItem?.id}
          keyed
          fallback={
            <div class="text-neutral text-sm">
              {t3({
                en: "No items in this dashboard",
                fr: "Aucun élément dans ce tableau de bord",
              })}
            </div>
          }
        >
          {(id) => {
            const item = () => p.items.find((i) => i.id === id);
            return (
              <Show when={item()}>
                {(it) => (
                  <DashboardItemChart
                    itemId={id}
                    strippedFigureInputs={it().strippedFigureInputs}
                    source={it().source}
                    geoData={it().geoData}
                  />
                )}
              </Show>
            );
          }}
        </Show>
      </div>
    </FrameLeft>
  );
}

export type GridLayoutProps = {
  title: string;
  items: PublicDashboardBundle["items"];
};

export function GridLayout(p: GridLayoutProps) {
  return (
    <div class="ui-gap ui-pad grid grid-cols-2 content-start overflow-auto">
      <For each={p.items}>
        {(item) => (
          <div class="border-base-300 ui-pad aspect-video rounded border">
            <DashboardItemChart
              itemId={item.id}
              strippedFigureInputs={item.strippedFigureInputs}
              source={item.source}
              geoData={item.geoData}
            />
          </div>
        )}
      </For>
    </div>
  );
}

export type DashboardItemChartProps = {
  itemId: string;
  strippedFigureInputs: FigureInputs;
  source: PublicDashboardBundle["items"][number]["source"];
  geoData?: unknown;
};

export function DashboardItemChart(p: DashboardItemChartProps) {
  const fi = () =>
    hydrateFigureInputsForPublicRendering(
      p.strippedFigureInputs,
      p.source,
      p.geoData,
    );
  const scaledFi = (): FigureInputs => {
    const originalFi = fi();
    return {
      ...originalFi,
      style: {
        ...originalFi.style,
        scale: 1,
      },
    };
  };
  return (
    <ChartHolder
      canvasElementId={`${CANVAS_ID}_${p.itemId}`}
      chartInputs={scaledFi()}
      height={"flex"}
    />
  );
}
