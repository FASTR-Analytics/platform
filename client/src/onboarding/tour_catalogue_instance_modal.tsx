import { t3 } from "lib";
import type { ProjectDetail, SlideType } from "lib";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
import { For, Show, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { setPendingTourReplay } from "~/state/t4_ui";
import {
  findProjectWithSlideOfType,
  getTourCatalogue,
  type TourCatalogueEntry,
  type TourProjectFacts,
} from "./catalogue";
import { SLIDE_TOUR_TYPES, getAreaHeadings } from "./tour_catalogue_modal";
import { clerkOnboardingStorage } from "./storage";

const SLIDE_TOUR_TYPE_BY_ID: Record<string, SlideType> = {
  "slide-cover-intro": "cover",
  "slide-section-intro": "section",
  "slide-content-intro": "content",
};

type ProjectFacts = { projectId: string; label: string; facts: ProjectDetail };

type TourTarget = { projectId: string; label: string };

// Instance-level catalogue: no project is open, so on mount it fetches every
// accessible project's detail, evaluates each tour against each project in
// list order, and offers Replay only for tours some project qualifies for —
// the replay navigates into that project (pendingTourReplay is consumed by
// the project shell after hydration, which then runs the tour's own
// navigate + start chain).
export function TourCatalogueInstanceModal(
  p: AlertComponentProps<
    {
      projects: { id: string; label: string }[];
      openProject: (projectId: string) => void;
    },
    undefined
  >,
) {
  const catalogue = getTourCatalogue();
  const groups = getAreaHeadings()
    .map((g) => ({
      heading: g.heading,
      entries: catalogue.filter((e) => e.area === g.area),
    }))
    .filter((g) => g.entries.length > 0);

  const [targets, setTargets] = createSignal<
    Map<string, TourTarget | null> | undefined
  >(undefined);
  const [reasons, setReasons] = createSignal<Map<string, string>>(new Map());

  onMount(() => {
    void (async () => {
      const details = await Promise.all(
        p.projects.map(async (project) => {
          const res = await serverActions.getProjectDetail({
            projectId: project.id,
          });
          return res.success
            ? ({
                projectId: project.id,
                label: project.label,
                facts: res.data,
              } satisfies ProjectFacts)
            : null;
        }),
      );
      const projects = details.filter((d): d is ProjectFacts => d !== null);

      // Slide types live only in the slide documents — search the qualifying
      // projects' decks for each type (early-exits at the first hit).
      const slideCandidates = projects
        .filter(
          (d) =>
            d.facts.thisUserPermissions.can_view_slide_decks &&
            d.facts.slideDecks.length > 0,
        )
        .map((d) => ({
          projectId: d.projectId,
          slideDecks: d.facts.slideDecks,
        }));
      const slidePresent: Partial<Record<SlideType, boolean>> = {};
      const slideTargets: Partial<Record<SlideType, TourTarget>> = {};
      for (const type of SLIDE_TOUR_TYPES) {
        const found = await findProjectWithSlideOfType(slideCandidates, type);
        slidePresent[type] = found !== null;
        if (found) {
          const project = projects.find((d) => d.projectId === found.projectId);
          if (project) {
            slideTargets[type] = {
              projectId: project.projectId,
              label: project.label,
            };
          }
        }
      }

      const nextTargets = new Map<string, TourTarget | null>();
      const nextReasons = new Map<string, string>();
      const factsWithSlides = (d: ProjectFacts): TourProjectFacts => ({
        ...d.facts,
        slideTypesPresent: slidePresent,
      });
      for (const entry of catalogue) {
        const slideType = SLIDE_TOUR_TYPE_BY_ID[entry.id];
        const target = slideType
          ? (slideTargets[slideType] ?? null)
          : (() => {
              const hit = projects.find((d) => entry.available(d.facts));
              return hit
                ? { projectId: hit.projectId, label: hit.label }
                : null;
            })();
        nextTargets.set(entry.id, target);
        if (!target && projects[0]) {
          nextReasons.set(
            entry.id,
            entry.unavailableReason(factsWithSlides(projects[0])),
          );
        }
      }
      setReasons(nextReasons);
      setTargets(nextTargets);
    })();
  });

  const seen = (id: string): boolean =>
    clerkOnboardingStorage.get(`tour:${id}`) === true;

  function replay(entry: TourCatalogueEntry, target: TourTarget) {
    p.close(undefined);
    setPendingTourReplay(entry.id);
    p.openProject(target.projectId);
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
      <Show
        when={targets()}
        fallback={
          <div class="text-base-content-muted ui-pad text-sm">
            {t3({
              en: "Checking your projects…",
              fr: "Vérification de vos projets…",
              pt: "A verificar os seus projetos…",
            })}
          </div>
        }
      >
        {(resolvedTargets) => (
          <div class="ui-spy">
            <For each={groups}>
              {(group) => (
                <div class="ui-spy-sm">
                  <div class="font-700 text-base-content-muted text-xs uppercase">
                    {group.heading}
                  </div>
                  <For each={group.entries}>
                    {(entry) => {
                      const target = () =>
                        resolvedTargets().get(entry.id) ?? null;
                      return (
                        <div
                          class="flex items-center gap-3 rounded border px-4 py-3"
                          classList={{ "opacity-60": target() === null }}
                        >
                          <div class="min-w-0 flex-1">
                            <div class="text-base-content flex items-center gap-2">
                              <span class="font-700">{entry.label}</span>
                              <span class="text-base-content-muted rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
                                {seen(entry.id)
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
                            <Show when={target()}>
                              {(t) => (
                                <div class="text-base-content-muted mt-1 text-xs">
                                  {t3({
                                    en: "Opens project",
                                    fr: "Ouvre le projet",
                                    pt: "Abre o projeto",
                                  })}{" "}
                                  <span class="font-700">{t().label}</span>
                                </div>
                              )}
                            </Show>
                            <Show when={target() === null}>
                              <div class="text-base-content-muted mt-1 text-sm italic">
                                {reasons().get(entry.id) ?? ""}
                              </div>
                            </Show>
                          </div>
                          <Show when={target()}>
                            {(t) => (
                              <Button
                                size="sm"
                                onClick={() => replay(entry, t())}
                              >
                                {t3({
                                  en: "Replay",
                                  fr: "Rejouer",
                                  pt: "Repetir",
                                })}
                              </Button>
                            )}
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </ModalContainer>
  );
}
