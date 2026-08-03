import { t3, TC } from "lib";
import {
  Button,
  Icon,
  ModalContainer,
  SelectList,
  type IconName,
} from "panther";
import { For, Show, createSignal, type JSX } from "solid-js";
import { getTourCatalogue, type TourCatalogueEntry } from "./catalogue";

export type TourArea = TourCatalogueEntry["area"];

// App tab order with the tab nav's own icons, so the sidebar reads as the
// app's areas.
export function getAreaItems(): {
  area: TourArea;
  heading: string;
  iconName: IconName;
}[] {
  return [
    {
      area: "reports",
      heading: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
      iconName: "report",
    },
    {
      area: "decks",
      heading: t3({
        en: "Slide decks",
        fr: "Présentations",
        pt: "Apresentações",
      }),
      iconName: "presentation",
    },
    {
      area: "dashboards",
      heading: t3({
        en: "Dashboards",
        fr: "Tableaux de bord",
        pt: "Painéis",
      }),
      iconName: "layoutDashboard",
    },
    {
      area: "visualizations",
      heading: t3({
        en: "Visualizations",
        fr: "Visualisations",
        pt: "Visualizações",
      }),
      iconName: "chart",
    },
    {
      area: "modules",
      heading: t3({ en: "Modules", fr: "Modules", pt: "Módulos" }),
      iconName: "code",
    },
    {
      area: "data",
      heading: t3({ en: "Data", fr: "Données", pt: "Dados" }),
      iconName: "database",
    },
    { area: "settings", heading: t3(TC.settings), iconName: "settings" },
  ];
}

// Shared shell for the two Tours modals: xl modal, category sidebar on the
// left, the selected category's tour rows on the right. Row content and
// actions come from the caller (per-project facts in-project; cross-project
// qualification at instance level).
export function TourCatalogueFrame(p: {
  initialArea?: TourArea;
  loading: boolean;
  loadingText: string;
  close: () => void;
  renderEntry: (entry: TourCatalogueEntry) => JSX.Element;
}) {
  const catalogue = getTourCatalogue();
  const areas = getAreaItems();
  const [selectedArea, setSelectedArea] = createSignal<TourArea>(
    p.initialArea ?? "reports",
  );
  const entries = () => catalogue.filter((e) => e.area === selectedArea());
  return (
    <ModalContainer
      width="xl"
      scroll="content"
      topPanel={
        <div class="font-700 text-base-content text-xl">
          {t3({
            en: "Guided tours",
            fr: "Visites guidées",
            pt: "Visitas guiadas",
          })}
        </div>
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button intent="neutral" onClick={() => p.close()}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      <div class="flex h-[min(650px,65vh)] gap-4">
        <div class="w-52 flex-none overflow-y-auto border-r pr-4">
          <SelectList
            items={areas.map((a) => ({ id: a.area, label: a.heading }))}
            value={selectedArea()}
            onChange={(v) => setSelectedArea(v as TourArea)}
            renderItem={(item) => {
              const area = areas.find((a) => a.area === item.id);
              return (
                <div class="flex items-center gap-2">
                  <span class="inline-block w-5 flex-none">
                    <Icon iconName={area?.iconName ?? "report"} />
                  </span>
                  <span class="truncate">{area?.heading}</span>
                </div>
              );
            }}
            fullWidth
          />
        </div>
        <div class="flex-1 overflow-y-auto">
          <Show
            when={!p.loading}
            fallback={
              <div class="text-base-content-muted text-sm">{p.loadingText}</div>
            }
          >
            <div class="ui-spy-sm">
              <For each={entries()}>{(entry) => p.renderEntry(entry)}</For>
            </div>
          </Show>
        </div>
      </div>
    </ModalContainer>
  );
}

// One tour row; the caller supplies seen/availability state, the reason shown
// when unavailable, an optional detail line (e.g. which project a play opens),
// and the Play handler.
export function TourRow(p: {
  entry: TourCatalogueEntry;
  seen: boolean;
  available: boolean;
  reason: string;
  detail?: JSX.Element;
  onPlay: () => void;
}) {
  return (
    <div
      class="flex items-center gap-3 rounded border px-4 py-3"
      classList={{ "opacity-60": !p.available }}
    >
      <div class="min-w-0 flex-1">
        <div class="text-base-content flex items-center gap-2">
          <span class="font-700">{p.entry.label}</span>
          <span class="text-base-content-muted rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
            {p.seen
              ? t3({ en: "Seen", fr: "Vue", pt: "Vista" })
              : t3({
                  en: "Not seen yet",
                  fr: "Pas encore vue",
                  pt: "Ainda não vista",
                })}
          </span>
        </div>
        <div class="text-base-content-muted mt-1 text-sm">
          {p.entry.description}
        </div>
        {p.detail}
        <Show when={!p.available}>
          <div class="text-base-content-muted mt-1 text-sm italic">
            {p.reason}
          </div>
        </Show>
      </div>
      <Show when={p.available}>
        <Button size="sm" onClick={p.onPlay}>
          {t3({ en: "Play", fr: "Lancer", pt: "Reproduzir" })}
        </Button>
      </Show>
    </div>
  );
}
