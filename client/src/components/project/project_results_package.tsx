import { t3, type RunListingItem } from "lib";
import {
  Badge,
  Button,
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
import { RunStatusBadge } from "~/components/_shared/results_package/status";
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
                              <div class="truncate">{run.label}</div>
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
