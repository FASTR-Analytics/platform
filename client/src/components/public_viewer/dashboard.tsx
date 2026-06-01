import { useParams } from "@solidjs/router";
import type { PublicDashboardBundle } from "lib";
import { t3 } from "lib";
import {
  Button,
  ChartHolder,
  FrameLeft,
  FrameTop,
  Select,
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
        { credentials: "include" },
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

type PublicEntry = PublicDashboardBundle["entries"][number];
type PublicItem = PublicDashboardBundle["items"][number];

export function DashboardViewer(p: DashboardViewerProps) {
  const entries = () => p.bundle.entries;

  const currentItem = () => {
    const list = p.bundle.items;
    if (list.length === 0) return undefined;
    return list.find((i) => i.id === p.selectedItemId) ?? list[0];
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
          <GridLayout entries={entries()} />
        </Match>
        <Match when={layoutType() === "sidebar"}>
          <SidebarLayout
            entries={entries()}
            currentItem={currentItem()}
            setSelectedItemId={p.setSelectedItemId}
            onDownload={p.onDownload}
          />
        </Match>
      </Switch>
    </FrameTop>
  );
}

function replicantLabel(
  group: Extract<PublicEntry, { kind: "group" }>["group"],
  member: PublicItem,
): string {
  return (
    group.replicants.find((r) => r.value === member.replicantValue)?.label ??
    member.label
  );
}

export type SidebarLayoutProps = {
  entries: PublicEntry[];
  currentItem: PublicItem | undefined;
  setSelectedItemId: (id: string) => void;
  onDownload?: () => void;
};

export function SidebarLayout(p: SidebarLayoutProps) {
  const NavRow = (q: {
    label: string;
    active: boolean;
    indent?: boolean;
    onClick: () => void;
  }) => (
    <div
      class="ui-hoverable cursor-pointer truncate rounded px-2 py-1 text-sm"
      classList={{
        "bg-primary text-primary-content": q.active,
        "pl-5": q.indent,
        "text-base-content/70": q.indent && !q.active,
      }}
      onClick={q.onClick}
    >
      {q.label}
    </div>
  );

  return (
    <FrameLeft
      panelChildren={
        <div class="ui-pad border-base-300 ui-spy-sm h-full max-w-[400px] overflow-auto border-r">
          <For each={p.entries}>
            {(entry) => (
              <Switch>
                <Match when={entry.kind === "item" ? entry : undefined}>
                  {(it) => (
                    <NavRow
                      label={it().item.label}
                      active={p.currentItem?.id === it().item.id}
                      onClick={() => p.setSelectedItemId(it().item.id)}
                    />
                  )}
                </Match>
                <Match when={entry.kind === "group" ? entry : undefined}>
                  {(grp) => (
                    <div>
                      <div class="truncate px-2 py-1 text-sm select-none">
                        {grp().group.label}
                      </div>
                      <For each={grp().members}>
                        {(m) => (
                          <NavRow
                            indent
                            label={replicantLabel(grp().group, m)}
                            active={p.currentItem?.id === m.id}
                            onClick={() => p.setSelectedItemId(m.id)}
                          />
                        )}
                      </For>
                    </div>
                  )}
                </Match>
              </Switch>
            )}
          </For>
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
          when={p.currentItem}
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
          {(it) => (
            <DashboardItemChart
              itemId={it.id}
              strippedFigureInputs={it.strippedFigureInputs}
              source={it.source}
              geoData={it.geoData}
            />
          )}
        </Show>
      </div>
    </FrameLeft>
  );
}

export type GridLayoutProps = {
  entries: PublicEntry[];
};

export function GridLayout(p: GridLayoutProps) {
  return (
    <div class="ui-gap ui-pad grid content-start overflow-auto lg:grid-cols-2">
      <For each={p.entries}>
        {(entry) => (
          <div class="border-base-300 ui-pad aspect-video rounded border">
            <Switch>
              <Match when={entry.kind === "item" ? entry : undefined}>
                {(it) => (
                  <DashboardItemChart
                    itemId={it().item.id}
                    strippedFigureInputs={it().item.strippedFigureInputs}
                    source={it().item.source}
                    geoData={it().item.geoData}
                  />
                )}
              </Match>
              <Match when={entry.kind === "group" ? entry : undefined}>
                {(grp) => (
                  <GroupTile group={grp().group} members={grp().members} />
                )}
              </Match>
            </Switch>
          </div>
        )}
      </For>
    </div>
  );
}

function GroupTile(p: {
  group: Extract<PublicEntry, { kind: "group" }>["group"];
  members: PublicItem[];
}) {
  const [value, setValue] = createSignal(
    p.group.defaultReplicantValue ?? p.members[0]?.replicantValue ?? "",
  );
  const current = () =>
    p.members.find((m) => m.replicantValue === value()) ?? p.members[0];

  return (
    <div class="flex h-full w-full flex-col">
      <div class="ui-gap-sm flex items-center pb-1">
        <div class="text-neutral font-700 flex-1 truncate text-xs">
          {p.group.label}
        </div>
        <Select
          value={value()}
          options={p.group.replicants.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
          onChange={(v: string) => setValue(v)}
          size="sm"
        />
      </div>
      <div class="min-h-0 flex-1">
        <Show when={current()} keyed>
          {(it) => (
            <DashboardItemChart
              itemId={it.id}
              strippedFigureInputs={it.strippedFigureInputs}
              source={it.source}
              geoData={it.geoData}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

export type DashboardItemChartProps = {
  itemId: string;
  strippedFigureInputs: FigureInputs;
  source: PublicDashboardBundle["items"][number]["source"];
  geoData?: unknown;
};

// Public viewer (readable surface) → reflow (the ChartHolder default). The
// editor grid uses FigureThumbnail (zoom) instead, matching viz thumbnails.
export function DashboardItemChart(p: DashboardItemChartProps) {
  const fi = () =>
    hydrateFigureInputsForPublicRendering(
      p.strippedFigureInputs,
      p.source,
      p.geoData,
    );
  return (
    <ChartHolder
      canvasElementId={`${CANVAS_ID}_${p.itemId}`}
      chartInputs={fi()}
      height={"flex"}
    />
  );
}
