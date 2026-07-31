import { t3, TC } from "lib";
import type { TourManagerController } from "@njwse/roadtrip";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
import { For, Show, createSignal } from "solid-js";
import { getTourCatalogue, type TourCatalogueEntry } from "./catalogue";

type Area = TourCatalogueEntry["area"];

// App tab order, so the modal reads like the navigation
function getAreaHeadings(): { area: Area; heading: string }[] {
  return [
    {
      area: "reports",
      heading: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
    },
    {
      area: "decks",
      heading: t3({
        en: "Slide decks",
        fr: "Présentations",
        pt: "Apresentações",
      }),
    },
    {
      area: "dashboards",
      heading: t3({
        en: "Dashboards",
        fr: "Tableaux de bord",
        pt: "Painéis",
      }),
    },
    {
      area: "visualizations",
      heading: t3({
        en: "Visualizations",
        fr: "Visualisations",
        pt: "Visualizações",
      }),
    },
    {
      area: "modules",
      heading: t3({ en: "Modules", fr: "Modules", pt: "Módulos" }),
    },
    {
      area: "data",
      heading: t3({ en: "Data", fr: "Données", pt: "Dados" }),
    },
    { area: "settings", heading: t3(TC.settings) },
  ];
}

// Catalogue of every onboarding tour: Replay navigates to where the tour runs
// (switching tab and opening a document/slide where needed) and starts it;
// unavailable tours are greyed out with a reason. The per-area managers come
// from the project shell as props, so they share its lifecycle and each
// action is routed to its owner via hasTour().
export function TourCatalogueModal(
  p: AlertComponentProps<{ managers: TourManagerController[] }, undefined>,
) {
  const catalogue = getTourCatalogue();
  const groups = getAreaHeadings()
    .map((g) => ({
      heading: g.heading,
      entries: catalogue.filter((e) => e.area === g.area),
    }))
    .filter((g) => g.entries.length > 0);

  const managerFor = (id: string) => p.managers.find((m) => m.hasTour(id));

  // hasSeen() isn't reactive — bump after any reset so the chips re-render,
  // and once hydration settles in case the modal opened before it finished
  const [seenRev, setSeenRev] = createSignal(0);
  void Promise.all(p.managers.map((m) => m.ready)).then(() =>
    setSeenRev((r) => r + 1),
  );
  const seen = (id: string): boolean => {
    seenRev();
    return managerFor(id)?.hasSeen(id) ?? false;
  };

  function replay(entry: TourCatalogueEntry) {
    const manager = managerFor(entry.id);
    p.close(undefined);
    entry.navigate();
    // start() runs regardless of seen state, so no reset is needed
    void manager?.start(entry.id);
  }

  return (
    <ModalContainer
      width="md"
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
          <Button intent="neutral" onClick={() => p.close(undefined)}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      <div class="ui-spy">
        <For each={groups}>
          {(group) => (
            <div class="ui-spy-sm">
              <div class="font-700 text-base-content-muted text-xs uppercase">
                {group.heading}
              </div>
              <For each={group.entries}>
                {(entry) => {
                  const isAvailable = () => entry.available();
                  const isSeen = () => seen(entry.id);
                  return (
                    <div
                      class="flex items-center gap-3 rounded border px-4 py-3"
                      classList={{ "opacity-60": !isAvailable() }}
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-base-content flex items-center gap-2">
                          <span class="font-700">{entry.label}</span>
                          <span class="text-base-content-muted rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
                            {isSeen()
                              ? t3({ en: "Seen", fr: "Vue", pt: "Vista" })
                              : t3({
                                  en: "Not seen yet",
                                  fr: "Pas encore vue",
                                  pt: "Ainda não vista",
                                })}
                          </span>
                        </div>
                        <div class="text-base-content-muted mt-1 text-sm">
                          {entry.description}
                        </div>
                        <Show when={!isAvailable()}>
                          <div class="text-base-content-muted mt-1 text-sm italic">
                            {entry.unavailableReason()}
                          </div>
                        </Show>
                      </div>
                      <Show when={isAvailable()}>
                        <Button size="sm" onClick={() => replay(entry)}>
                          {t3({ en: "Replay", fr: "Rejouer", pt: "Repetir" })}
                        </Button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>
    </ModalContainer>
  );
}
