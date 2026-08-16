import { t3, type RunListingItem } from "lib";
import {
  Badge,
  Button,
  Checkbox,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createButtonAction,
  createQuery,
  getEditorWrapper,
  openComponent,
  type StateHolder,
} from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import {
  ResultsPackageContents,
  ResultsPackageProvenanceLine,
} from "~/components/_shared/results_package/package_contents";
import { projectPackageInternalsSource } from "~/components/_shared/results_package/internals_source";
import {
  PinnedBadge,
  RunStatusBadge,
} from "~/components/_shared/results_package/status";
import { ResultsPackageCompatibilityModal } from "./results_package_compatibility_modal";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { projectState } from "~/state/project/t1_store";

// The project "Results package" surface (PLAN_RESULTS_RUNS Phase 3 item 4):
// the package this project serves from, and — for an editor — the picker
// that repoints it at another. Generation belongs to the instance shell (a
// package belongs to no project); what a project does with packages is
// choose one.
//
// What the package CONTAINS is rendered by the shared
// `_shared/results_package/` components — byte-identical to the instance
// catalogue, because the answer to "what is in this package" lives in the
// run directory and does not depend on who is asking. This surface only adds
// its own chrome: the "in use" marker and the picker.
//
// The picker is editor-only, in the client and in the route guards: a
// non-editor member sees the package the project serves from and nothing
// else, so the other packages on the instance are not enumerated to them.
export function ProjectResultsPackage() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const canAttach = () =>
    instanceState.currentUserIsGlobalAdmin ||
    projectState.thisUserPermissions.can_configure_visualizations;

  const [attached, setAttached] = createSignal<
    StateHolder<RunListingItem | null>
  >({ status: "loading" });
  const [attachable, setAttachable] = createSignal<
    StateHolder<RunListingItem[]>
  >({ status: "loading" });
  const [version, setVersion] = createSignal(0);

  // Stale-while-revalidate: refetches on version bump and on attachedRunId
  // change — a repoint (this picker, or a generation publishing onto this
  // project) is the only thing that changes what either list holds. The
  // counter drops out-of-order completions (a repoint landing mid-fetch).
  let requestCounter = 0;
  createEffect(async () => {
    version();
    const _attachedRunId = projectState.attachedRunId;
    const projectId = projectState.id;
    const showPicker = canAttach();
    const requestId = ++requestCounter;
    const attachedRes = await serverActions.getAttachedResultsPackage({
      projectId,
    });
    if (requestId !== requestCounter) {
      return;
    }
    setAttached(
      attachedRes.success
        ? { status: "ready", data: attachedRes.data }
        : { status: "error", err: attachedRes.err },
    );
    if (!showPicker) {
      return;
    }
    const attachableRes = await serverActions.listAttachableResultsPackages({
      projectId,
    });
    if (requestId !== requestCounter) {
      return;
    }
    setAttachable(
      attachableRes.success
        ? { status: "ready", data: attachableRes.data }
        : { status: "error", err: attachableRes.err },
    );
  });

  const attachPackage = createButtonAction(
    async (run: RunListingItem) => {
      const confirmed = await openComponent({
        element: ResultsPackageCompatibilityModal,
        props: {
          projectId: projectState.id,
          runId: run.id,
          runLabel: run.label,
        },
      });
      if (confirmed !== true) {
        return { success: true as const };
      }
      return await serverActions.attachResultsPackage({
        projectId: projectState.id,
        run_id: run.id,
      });
    },
    () => {
      setVersion((v) => v + 1);
    },
  );

  // Follow the instance's pinned package (SYSTEM_08 "The pinned package
  // + followers"). The flag is T1 (`projectState.followPinned`, pushed on
  // project_config_updated) and the pin itself is instance T1
  // (`instanceState.pinnedRunId`), so nothing is refetched here: enabling may
  // also repoint the project, which arrives as run_attached and re-runs the
  // effect above. Subscribing before any package is pinned is allowed — the
  // project moves once an admin pins. The checkbox is keyed on a counter
  // bumped when a save is refused, because a controlled native checkbox has
  // already flipped visually by then and no store value changes to flip it
  // back.
  const [checkboxKey, setCheckboxKey] = createSignal(1);
  const setFollowPinned = createButtonAction(
    async (follow: boolean) => {
      const res = await serverActions.setProjectFollowPinned({
        projectId: projectState.id,
        follow,
      });
      if (res.success === false) {
        setCheckboxKey((k) => k + 1);
      }
      return res;
    },
  );

  // "Following, but not on the pin" is a real state (publish repointed this
  // project as a wizard attach target, it was locked while the pin moved, or
  // its repoint failed) — surface it and offer the manual realign, which is
  // just a manual attach TO the pin (that never clears the subscription).
  const behindPin = () =>
    projectState.followPinned &&
    instanceState.pinnedRunId !== null &&
    projectState.attachedRunId !== instanceState.pinnedRunId;
  const pinnedCandidate = (): RunListingItem | undefined => {
    const s = attachable();
    return s.status === "ready"
      ? s.data.find((r) => r.id === instanceState.pinnedRunId)
      : undefined;
  };

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={t3({
              en: "Results package",
              fr: "Paquet de résultats",
              pt: "Pacote de resultados",
            })}
          />
        }
      >
        <div class="ui-pad ui-spy">
          <StateHolderWrapper state={attached()} noPad>
            {(keyedAttached) => (
              <Show
                when={keyedAttached}
                keyed
                fallback={
                  <div class="text-base-content-muted">
                    {t3({
                      en: "This project has no results package attached yet.",
                      fr: "Aucun paquet de résultats n'est encore rattaché à ce projet.",
                      pt: "Este projeto ainda não tem nenhum pacote de resultados anexado.",
                    })}
                  </div>
                }
              >
                {(run) => (
                  <AttachedPackageCard run={run} openEditor={openEditor} />
                )}
              </Show>
            )}
          </StateHolderWrapper>

          <div class="ui-spy-sm">
            <h3 class="ui-text-heading">
              {t3({
                en: "Pinned package",
                fr: "Paquet épinglé",
                pt: "Pacote fixado",
              })}
            </h3>
            <Show
              when={canAttach()}
              fallback={
                <div class="text-base-content-muted text-sm">
                  <Show
                    when={projectState.followPinned}
                    fallback={t3({
                      en: "This project does not follow the instance's pinned package.",
                      fr: "Ce projet ne suit pas le paquet épinglé de l'instance.",
                      pt: "Este projeto não segue o pacote fixado da instância.",
                    })}
                  >
                    {t3({
                      en: "This project follows the instance's pinned package: whenever an administrator pins a different package, it switches to it.",
                      fr: "Ce projet suit le paquet épinglé de l'instance : chaque fois qu'un administrateur épingle un autre paquet, il y bascule.",
                      pt: "Este projeto segue o pacote fixado da instância: sempre que um administrador fixar outro pacote, muda para ele.",
                    })}
                  </Show>
                </div>
              }
            >
              <Show when={String(checkboxKey())} keyed>
                {(_key) => (
                  <Checkbox
                    checked={projectState.followPinned}
                    onChange={(v) => setFollowPinned.click(v)}
                    disabled={
                      projectState.isLocked ||
                      setFollowPinned.state().status === "loading"
                    }
                    label={t3({
                      en: "Always use the instance's pinned package",
                      fr: "Toujours utiliser le paquet épinglé de l'instance",
                      pt: "Usar sempre o pacote fixado da instância",
                    })}
                  />
                )}
              </Show>
              <div class="text-base-content-muted text-sm">
                <Show
                  when={instanceState.pinnedRunId !== null}
                  fallback={t3({
                    en: "No package is pinned on this instance yet; the project will switch to one as soon as an administrator pins it.",
                    fr: "Aucun paquet n'est encore épinglé sur cette instance ; le projet y basculera dès qu'un administrateur en épinglera un.",
                    pt: "Ainda não há nenhum pacote fixado nesta instância; o projeto mudará para um assim que um administrador o fixar.",
                  })}
                >
                  {t3({
                    en: "Whenever an administrator pins a different package, this project switches to it.",
                    fr: "Chaque fois qu'un administrateur épingle un autre paquet, ce projet y bascule.",
                    pt: "Sempre que um administrador fixar outro pacote, este projeto muda para ele.",
                  })}
                </Show>{" "}
                {t3({
                  en: "Choosing another package below turns this off.",
                  fr: "Choisir un autre paquet ci-dessous désactive cette option.",
                  pt: "Escolher outro pacote abaixo desativa esta opção.",
                })}
              </div>
            </Show>
            <Show when={behindPin()}>
              <div class="ui-gap flex items-center">
                <div class="text-warning flex-1 text-sm">
                  {t3({
                    en: "This project follows the pinned package but is currently on a different one.",
                    fr: "Ce projet suit le paquet épinglé mais se trouve actuellement sur un autre paquet.",
                    pt: "Este projeto segue o pacote fixado, mas está atualmente noutro pacote.",
                  })}
                </div>
                <Show when={canAttach() && pinnedCandidate()} keyed>
                  {(run) => (
                    <Button
                      size="sm"
                      outline
                      iconName="package"
                      onClick={() => attachPackage.click(run)}
                      state={attachPackage.state()}
                      disabled={projectState.isLocked}
                    >
                      {t3({
                        en: "Switch to pinned package",
                        fr: "Basculer vers le paquet épinglé",
                        pt: "Mudar para o pacote fixado",
                      })}
                    </Button>
                  )}
                </Show>
              </div>
            </Show>
          </div>

          <Show when={canAttach()}>
            <div class="ui-spy-sm">
              <h3 class="ui-text-heading">
                {t3({
                  en: "Other results packages",
                  fr: "Autres paquets de résultats",
                  pt: "Outros pacotes de resultados",
                })}
              </h3>
              <StateHolderWrapper state={attachable()} noPad>
                {(keyedAttachable) => (
                  <div class="ui-spy-sm">
                    <Show
                      when={keyedAttachable.length > 0}
                      fallback={
                        <div class="text-base-content-muted text-sm">
                          {t3({
                            en: "No other results packages are available on this instance.",
                            fr: "Aucun autre paquet de résultats n'est disponible sur cette instance.",
                            pt: "Não há outros pacotes de resultados disponíveis nesta instância.",
                          })}
                        </div>
                      }
                    >
                      <For each={keyedAttachable}>
                        {(run) => (
                          <div class="ui-pad-sm ui-gap flex items-center rounded border">
                            <div class="min-w-0 flex-1">
                              <div class="ui-gap-sm flex items-center">
                                <div class="truncate">{run.label}</div>
                                <Show when={run.id === instanceState.pinnedRunId}>
                                  <PinnedBadge />
                                </Show>
                              </div>
                              <ResultsPackageProvenanceLine
                                run={run}
                                showDiskSize={false}
                              />
                            </div>
                            <Button
                              size="sm"
                              outline
                              iconName="package"
                              onClick={() => attachPackage.click(run)}
                              state={attachPackage.state()}
                              disabled={projectState.isLocked}
                            >
                              {t3({
                                en: "Use this package",
                                fr: "Utiliser ce paquet",
                                pt: "Usar este pacote",
                              })}
                            </Button>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                )}
              </StateHolderWrapper>
            </div>
          </Show>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

// Persistent scope-mismatch warning on the attached package (one mechanism,
// two surfaces: same compatibility route as the pre-attach modal). Renders
// nothing while loading or on error — this is a passive advisory, not a gate.
function AttachedScopeCoverageWarning(p: { runId: string }) {
  const report = createQuery(() =>
    serverActions.getResultsPackageCompatibility({
      projectId: projectState.id,
      run_id: p.runId,
    }),
  );
  const uncovered = () => {
    const s = report.state();
    return (
      s.status === "ready" && s.data.projectAdminArea2Coverage === "uncovered"
    );
  };
  return (
    <Show when={uncovered()}>
      <div class="text-warning text-sm">
        {`${t3({
          en: "This package has no data for",
          fr: "Ce paquet ne contient aucune donnée pour",
          pt: "Este pacote não contém dados para",
        })} ${projectState.adminArea2}. ${t3({
          en: "Area-level metrics show no data; national-level metrics remain visible.",
          fr: "Les indicateurs au niveau des zones n'affichent aucune donnée ; les indicateurs nationaux restent visibles.",
          pt: "Os indicadores ao nível das zonas não mostram dados; os indicadores nacionais permanecem visíveis.",
        })}`}
      </div>
    </Show>
  );
}

function AttachedPackageCard(p: {
  run: RunListingItem;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  // What this member may explore inside the package they serve from. Tim's
  // ruling 2026-07-30: what lives inside the run package directory is visible
  // to a user of an attached project, governed per kind of content by the
  // per-project bits the app already had — script code, logs, data. A project
  // admin has all three; the Viewer and Editor presets have only
  // `can_view_data`. Nothing here names a runId: the server resolves the
  // package from `projects.run_id`.
  const internals = () =>
    projectPackageInternalsSource(
      projectState.id,
      projectState.thisUserPermissions,
    );

  return (
    <div class="ui-pad ui-spy-sm border-primary rounded border">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <Badge intent="primary" variant="solid">
          {t3({
            en: "In use",
            fr: "En cours d'utilisation",
            pt: "Em utilização",
          })}
        </Badge>
        <Show when={p.run.id === instanceState.pinnedRunId}>
          <PinnedBadge />
        </Show>
        <RunStatusBadge status={p.run.status} />
      </div>

      <ResultsPackageProvenanceLine run={p.run} showDiskSize={false} />

      <Show when={projectState.adminArea2 !== null}>
        <AttachedScopeCoverageWarning runId={p.run.id} />
      </Show>

      <ResultsPackageContents
        run={p.run}
        internals={internals()}
        openEditor={p.openEditor}
      />
    </div>
  );
}
