import { t3 } from "lib";
import type { ProjectDetail } from "lib";
import { type AlertComponentProps } from "panther";
import type { SolidTourManagerController } from "@njwse/roadtrip/solid";
import { For, Show, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { setPendingTourReplay } from "~/state/t4_ui";
import {
  getInstanceTourCatalogue,
  getTourCatalogue,
  type InstanceTab,
  type InstanceTourCatalogueEntry,
  type TourCatalogueEntry,
} from "./catalogue";
import {
  TourCatalogueFrame,
  TourRow,
  getAreaItems,
  type TourCategory,
} from "./tour_catalogue_layout";
import { clerkOnboardingStorage } from "./storage";

const INSTANCE_CATEGORY_ID = "instance";

type ProjectFacts = { projectId: string; label: string; facts: ProjectDetail };

type TourTarget = { projectId: string; label: string };

// Why no project qualifies: the reason from the project that came closest
// (highest TourReason rank), and that project's label so the row can say
// which project the reason is about. `nearest` is null when the user has no
// projects at all.
type Unavailability = { text: string; nearest: string | null };

// Instance-level catalogue. The "Instance" category's tours play right here
// (an instance tab switch + start on the instance tour manager). The project
// categories need a project: on mount the modal fetches every accessible
// project's detail, evaluates each tour against each project in list order,
// and offers Play only for tours some project qualifies for: the play
// navigates into that project (pendingTourReplay is consumed by the project
// shell after hydration, which then runs the tour's own navigate + start
// chain).
export function TourCatalogueInstanceModal(
  p: AlertComponentProps<
    {
      projects: { id: string; label: string }[];
      openProject: (projectId: string) => void;
      instanceManager: SolidTourManagerController;
      openInstanceTab: (tab: InstanceTab) => void;
    },
    undefined
  >,
) {
  const catalogue = getTourCatalogue();
  const instanceCatalogue = getInstanceTourCatalogue();

  const [targets, setTargets] = createSignal<
    Map<string, TourTarget | null> | undefined
  >(undefined);
  const [reasons, setReasons] = createSignal<Map<string, Unavailability>>(
    new Map(),
  );

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

      const nextTargets = new Map<string, TourTarget | null>();
      const nextReasons = new Map<string, Unavailability>();
      // The reason shown when no project qualifies is the one from the
      // project that gets furthest (highest rank): the most actionable gap.
      const nearestUnavailability = (
        entry: TourCatalogueEntry,
      ): Unavailability => {
        let best: { rank: number; text: string; label: string } | null = null;
        for (const d of projects) {
          const reason = entry.unavailableReason(d.facts);
          if (best === null || reason.rank > best.rank) {
            best = { ...reason, label: d.label };
          }
        }
        return best
          ? { text: best.text, nearest: best.label }
          : {
              text: t3({
                en: "You don't have access to any project yet",
                fr: "Vous n'avez encore accès à aucun projet",
                pt: "Ainda não tem acesso a nenhum projeto",
              }),
              nearest: null,
            };
      };
      for (const entry of catalogue) {
        const hit = projects.find((d) => entry.available(d.facts));
        const target = hit
          ? { projectId: hit.projectId, label: hit.label }
          : null;
        nextTargets.set(entry.id, target);
        if (!target) nextReasons.set(entry.id, nearestUnavailability(entry));
      }
      setReasons(nextReasons);
      setTargets(nextTargets);
    })();
  });

  // Instance tours are answered by their (reactive) manager. Project tours
  // have no manager here: their managers live in the project shell, which
  // is not mounted, so their seen-flags are read straight from storage,
  // which is synchronous and already hydrated by the time this modal opens.
  const seen = (id: string): boolean =>
    p.instanceManager.hasTour(id)
      ? p.instanceManager.hasSeen(id)
      : clerkOnboardingStorage.get(`tour:${id}`) === true;

  function playInProject(entry: TourCatalogueEntry, target: TourTarget) {
    p.close(undefined);
    setPendingTourReplay(entry.id);
    p.openProject(target.projectId);
  }

  function playInstanceTour(entry: InstanceTourCatalogueEntry) {
    p.close(undefined);
    p.openInstanceTab(entry.tab);
    void p.instanceManager.start(entry.id);
  }

  const categories: TourCategory[] = [
    {
      id: INSTANCE_CATEGORY_ID,
      heading: t3({ en: "Instance", fr: "Instance", pt: "Instância" }),
      iconName: "layoutGrid",
    },
    ...getAreaItems().map((a) => ({
      id: a.area as string,
      heading: a.heading,
      iconName: a.iconName,
    })),
  ];

  return (
    <TourCatalogueFrame
      categories={categories}
      initialCategory={INSTANCE_CATEGORY_ID}
      loading={false}
      loadingText=""
      close={() => p.close(undefined)}
      renderCategory={(categoryId) =>
        categoryId === INSTANCE_CATEGORY_ID ? (
          // Instance tours play right here: no project fetch needed, so this
          // category renders immediately while the qualification check runs.
          <For each={instanceCatalogue}>
            {(entry) => (
              <TourRow
                label={entry.label}
                description={entry.description}
                seen={seen(entry.id)}
                available={entry.available()}
                reason={entry.unavailableReason().text}
                onPlay={() => playInstanceTour(entry)}
              />
            )}
          </For>
        ) : targets() === undefined ? (
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "Checking your projects…",
              fr: "Vérification de vos projets…",
              pt: "A verificar os seus projetos…",
            })}
          </div>
        ) : (
          <For
            each={catalogue.filter((e) => (e.area as string) === categoryId)}
          >
            {(entry) => {
              const target = () => targets()?.get(entry.id) ?? null;
              const why = () => reasons().get(entry.id);
              return (
                <TourRow
                  label={entry.label}
                  description={entry.description}
                  seen={seen(entry.id)}
                  available={target() !== null}
                  reason={why()?.text ?? ""}
                  detail={
                    <>
                      <Show when={target()}>
                        {(tgt) => (
                          <div class="text-base-content-muted mt-1 text-xs">
                            {t3({
                              en: "Opens project",
                              fr: "Ouvre le projet",
                              pt: "Abre o projeto",
                            })}{" "}
                            <span class="font-700">{tgt().label}</span>
                          </div>
                        )}
                      </Show>
                      {/* No project qualifies: say which one the reason
                          below is about, the one that came closest. */}
                      <Show when={target() === null && why()?.nearest}>
                        {(nearest) => (
                          <div class="text-base-content-muted mt-1 text-xs">
                            {p.projects.length > 1
                              ? t3({
                                  en: "Nearest project",
                                  fr: "Projet le plus proche",
                                  pt: "Projeto mais próximo",
                                })
                              : t3({
                                  en: "Project",
                                  fr: "Projet",
                                  pt: "Projeto",
                                })}{" "}
                            <span class="font-700">{nearest()}</span>
                          </div>
                        )}
                      </Show>
                    </>
                  }
                  onPlay={() => {
                    const tgt = target();
                    if (tgt) playInProject(entry, tgt);
                  }}
                />
              );
            }}
          </For>
        )
      }
    />
  );
}
