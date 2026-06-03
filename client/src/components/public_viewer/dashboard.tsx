import { useParams } from "@solidjs/router";
import type {
  PublicDashboardBundle,
  PublicDashboardEntry,
  PublicDashboardEntryGroup,
  PublicDashboardItem,
} from "lib";
import { FIGURE_EXPORT_WIDTH_PX, t3, TC } from "lib";
import {
  AlertProvider,
  Button,
  ChartHolder,
  downloadBase64Image,
  FrameLeft,
  FrameLeftResizable,
  FrameTop,
  getFigureAsBase64,
  HeadingBar,
  MarkdownPresentationJsx,
  openComponent,
  Select,
  StateHolderWrapper,
  timQuery,
  type FigureInputs,
} from "panther";
import { createSignal, For, type JSX, Match, Show, Switch } from "solid-js";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";
import {
  DownloadFigureModal,
  type DownloadFigureResult,
} from "./download_figure_modal.tsx";
import { DashboardLogos } from "./dashboard_logos.tsx";
import { AboutDashboardModal } from "./about_dashboard_modal.tsx";

function openAbout(bundle: PublicDashboardBundle): void {
  void openComponent({
    element: AboutDashboardModal,
    props: {
      body: bundle.about.body,
      logos: bundle.logos.selected,
    },
  });
}

export default function PublicDashboard() {
  const params = useParams<{ projectId: string; slug: string }>();

  const bundleHolder = timQuery<PublicDashboardBundle>(async () => {
    const res = await fetch(
      `${_SERVER_HOST}/api/d/${params.projectId}/${params.slug}`,
      { credentials: "include" },
    );
    return await res.json();
  }, t3(TC.loading));

  return (
    <>
      <StateHolderWrapper state={bundleHolder.state()}>
        {(bundle) => <DashboardViewer bundle={bundle} />}
      </StateHolderWrapper>
      {/* Public routes render outside the app shell, so the modal host that
          powers openComponent must be mounted here. */}
      <AlertProvider />
    </>
  );
}

type PublicEntry = PublicDashboardEntry;
type PublicItem = PublicDashboardItem;

type DashboardViewerProps = {
  bundle: PublicDashboardBundle;
};

function DashboardViewer(p: DashboardViewerProps) {
  const [selectedItemId, setSelectedItemId] = createSignal<string>();

  const currentItem = () => {
    const list = p.bundle.items;
    if (list.length === 0) {
      return undefined;
    }
    return list.find((i) => i.id === selectedItemId()) ?? list[0];
  };

  const layoutType = () => p.bundle.layout.type;

  // Sidebar shows one chart at a time, so a single header Download is
  // unambiguous; the grid shows many, so each tile downloads itself instead.
  const headerDownloadItem = () =>
    layoutType() === "sidebar" ? currentItem() : undefined;

  const hasLogos = () => p.bundle.logos.selected.length > 0;
  const logoPlacement = () => p.bundle.logos.placement ?? "right";

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          class="border-base-300"
          heading={<span class="font-800 text-2xl">{p.bundle.title}</span>}
          leftChildren={
            <Show when={hasLogos() && logoPlacement() === "left"}>
              <DashboardLogos selected={p.bundle.logos.selected} />
            </Show>
          }
        >
          <div class="ui-gap-sm flex items-center">
            <Show when={p.bundle.about.body.trim()}>
              <Button
                onClick={() => openAbout(p.bundle)}
                iconName="info"
                outline
              >
                {t3({
                  en: "About this dashboard",
                  fr: "À propos de ce tableau de bord",
                })}
              </Button>
            </Show>
            <Show when={headerDownloadItem()} keyed>
              {(it) => (
                <Button
                  onClick={() => downloadItem(it)}
                  iconName="download"
                  outline
                >
                  {t3({ en: "Download", fr: "Télécharger" })}
                </Button>
              )}
            </Show>
            <Show when={hasLogos() && logoPlacement() === "right"}>
              <DashboardLogos selected={p.bundle.logos.selected} />
            </Show>
          </div>
        </HeadingBar>
      }
    >
      <div class="flex h-full w-full flex-col">
        <Show when={p.bundle.about.summary.trim()}>
          <div class="border-base-300 ui-pad border-b text-sm">
            <MarkdownPresentationJsx markdown={p.bundle.about.summary} />
          </div>
        </Show>
        <div class="min-h-0 flex-1">
          <Switch>
            <Match when={layoutType() === "sidebar"}>
              <SidebarLayout
                entries={p.bundle.entries}
                currentItem={currentItem()}
                setSelectedItemId={setSelectedItemId}
              />
            </Match>
            <Match when={layoutType() === "grid"}>
              <GridLayout entries={p.bundle.entries} />
            </Match>
          </Switch>
        </div>
      </div>
    </FrameTop>
  );
}

type SidebarLayoutProps = {
  entries: PublicEntry[];
  currentItem: PublicItem | undefined;
  setSelectedItemId: (id: string) => void;
};

function SidebarLayout(p: SidebarLayoutProps) {
  return (
    <FrameLeft
      panelChildren={
        <div class="ui-pad border-base-300 ui-spy-sm h-full w-56 overflow-auto border-r lg:w-64 xl:w-72">
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
                    <div class="space-y-1">
                      <div class="px-2 py-1 text-sm select-none">
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
          {(it) => <DashboardItemChart item={it} />}
        </Show>
      </div>
    </FrameLeft>
  );
}

function NavRow(p: {
  label: string;
  active: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      class="ui-hoverable cursor-pointer rounded px-2 py-1 text-sm"
      classList={{
        "bg-primary text-primary-content": p.active,
        "pl-5": p.indent,
        "text-base-content/70": p.indent && !p.active,
      }}
      onClick={p.onClick}
    >
      {p.label}
    </div>
  );
}

type GridLayoutProps = {
  entries: PublicEntry[];
};

function GridLayout(p: GridLayoutProps) {
  return (
    <div class="ui-gap ui-pad grid content-start overflow-auto lg:grid-cols-2">
      <For each={p.entries}>
        {(entry) => (
          <div class="border-base-300 ui-pad flex aspect-video flex-col rounded border">
            <Switch>
              <Match when={entry.kind === "item" ? entry : undefined}>
                {(it) => <ItemTile item={it().item} />}
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

function ItemTile(p: { item: PublicItem }) {
  return (
    <div class="flex h-full w-full flex-col">
      <TileHeader
        label={p.item.label}
        onDownload={() => downloadItem(p.item)}
      />
      <div class="min-h-0 flex-1">
        <DashboardItemChart item={p.item} />
      </div>
    </div>
  );
}

function GroupTile(p: {
  group: PublicDashboardEntryGroup;
  members: PublicItem[];
}) {
  const [value, setValue] = createSignal(
    p.group.defaultReplicantValue ?? p.members[0]?.replicantValue ?? "",
  );
  const current = () =>
    p.members.find((m) => m.replicantValue === value()) ?? p.members[0];

  return (
    <div class="flex h-full w-full flex-col">
      <TileHeader
        label={p.group.label}
        onDownload={() => {
          const c = current();
          if (c) {
            downloadItem(c);
          }
        }}
      >
        <Select
          value={value()}
          options={p.group.replicants.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
          onChange={(v: string) => setValue(v)}
          size="sm"
        />
      </TileHeader>
      <div class="min-h-0 flex-1">
        <Show when={current()} keyed>
          {(it) => <DashboardItemChart item={it} />}
        </Show>
      </div>
    </div>
  );
}

function TileHeader(p: {
  label: string;
  onDownload: () => void;
  children?: JSX.Element;
}) {
  return (
    <div class="ui-gap-sm flex items-center pb-1">
      <div class="text-neutral font-700 flex-1 truncate text-xs">{p.label}</div>
      {p.children}
      <Button
        onClick={p.onDownload}
        iconName="download"
        intent="neutral"
        outline
        size="sm"
        ariaLabel={t3({ en: "Download", fr: "Télécharger" })}
      />
    </div>
  );
}

function DashboardItemChart(p: { item: PublicItem }) {
  return <ChartHolder chartInputs={itemFigureInputs(p.item)} height="flex" />;
}

function replicantLabel(
  group: PublicDashboardEntryGroup,
  member: PublicItem,
): string {
  return (
    group.replicants.find((r) => r.value === member.replicantValue)?.label ??
    member.label
  );
}

function itemFigureInputs(item: PublicItem): FigureInputs {
  return hydrateFigureInputsForPublicRendering(
    item.strippedFigureInputs,
    item.source,
    item.geoData,
  );
}

const DOWNLOAD_MARGIN_DU = 40;

// Background and margin are baked into the figure's surrounds so the plain
// panther export helper renders them — no manual canvas compositing.
function figureInputsForDownload(
  fi: FigureInputs,
  transparent: boolean,
  padding: boolean,
): FigureInputs {
  return {
    ...fi,
    style: {
      ...fi.style,
      surrounds: {
        ...fi.style?.surrounds,
        backgroundColor: transparent ? "none" : "#ffffff",
        padding: padding ? DOWNLOAD_MARGIN_DU : 0,
      },
    },
  };
}

async function downloadItem(item: PublicItem): Promise<void> {
  const res = await openComponent<Record<string, never>, DownloadFigureResult>({
    element: DownloadFigureModal,
    props: {},
  });
  if (!res) {
    return;
  }
  const cleanLabel = item.label.trim().replace(/\s+/g, "_") || "figure";
  const fi = figureInputsForDownload(
    itemFigureInputs(item),
    res.transparent,
    res.padding,
  );
  downloadBase64Image(
    getFigureAsBase64(fi, FIGURE_EXPORT_WIDTH_PX),
    `${cleanLabel}.png`,
  );
}
