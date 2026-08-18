import { t3, type RunListingItem } from "lib";
import {
  Button,
  Checkbox,
  FrameTop,
  HeadingBar,
  SelectSearch,
  createButtonAction,
  createQuery,
  getEditorWrapper,
  openComponent,
  type SelectOption,
} from "panther";
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import {
  ResultsPackageProvenanceLine,
  ResultsPackageView,
} from "~/components/_shared/results_package/package_view";
import {
  PinnedBadge,
  canViewPackageContents,
} from "~/components/_shared/results_package/status";
import { ResultsPackageCompatibilityModal } from "./results_package_compatibility_modal";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { projectState } from "~/state/project/t1_store";
import { setResultsPackageTabLoadCount } from "~/state/t4_ui";

// The project "Results package" surface (PLAN_RESULTS_RUNS Phase 3 item 4):
// two halves with two permission models.
//
// The CONFIGURE card is the project's relationship with packages — which one
// it serves from (the picker) and whether it follows the instance's pin — and
// is the editor's (`can_configure_visualizations`, or global admin). It
// renders synchronously from T1 (`projectState.attachedRun`, `followPinned`,
// `instanceState.pinnedRunId`); its one fetch is the picker's option list.
//
// The VIEWER is the package itself, rendered by the shared ResultsPackageView
// exactly as the instance catalogue renders it, under the instance data bits
// (Tim's ruling 2026-08-18: what a package contains is a function of the
// runId, not of who is asking). Generation belongs to the instance shell.

export function canOpenProjectResultsPackageTab(): boolean {
  return canAttachPackage() || canViewPackageContents();
}

function canAttachPackage(): boolean {
  return (
    instanceState.currentUserIsGlobalAdmin ||
    projectState.thisUserPermissions.can_configure_visualizations
  );
}

export function ProjectResultsPackage() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // The onboarding manager counts this tab as visible only while this is > 0
  // (its anchors render synchronously from T1, so mount is the settle).
  onMount(() => setResultsPackageTabLoadCount((n) => n + 1));
  onCleanup(() => setResultsPackageTabLoadCount(0));

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            data-tour="results-package-header"
            heading={t3({
              en: "Results package",
              fr: "Paquet de résultats",
              pt: "Pacote de resultados",
            })}
          />
        }
      >
        <div class="ui-pad ui-spy">
          <Show when={canAttachPackage()}>
            <PackageSettings />
          </Show>

          <Show
            when={projectState.attachedRun}
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
              <div data-tour="results-package-attached">
                <Show
                  when={canViewPackageContents()}
                  fallback={<AttachedPackageSummary run={run} />}
                >
                  <div data-tour="results-package-contents">
                    <ResultsPackageView
                      run={run}
                      headerNote={
                        <Show when={projectState.adminArea2 !== null}>
                          <AttachedScopeCoverageWarning runId={run.id} />
                        </Show>
                      }
                      openEditor={openEditor}
                    />
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

// The picker + follow-pinned subscription. Options are every ready package
// on the instance (T3 once per mount, editors only — the one genuinely
// project-context read on this page). Two-step on purpose: a native <select>
// flips before we can veto, and the compatibility modal must be able to
// cancel — so the selection is local until "Use this package" confirms it.
// No refetch after a repoint: `run_attached` moves `attachedRunId` and the
// candidate resets to it.
function PackageSettings() {
  const options = createQuery(() =>
    serverActions.listAttachableResultsPackages({ projectId: projectState.id }),
  );
  const readyRuns = (): RunListingItem[] => {
    const s = options.state();
    return s.status === "ready" ? s.data : [];
  };
  const runLabel = (id: string): string =>
    readyRuns().find((r) => r.id === id)?.label ??
    (projectState.attachedRun?.id === id ? projectState.attachedRun.label : id);

  const selectOptions = createMemo((): SelectOption<string>[] => {
    const runs = readyRuns();
    const attached = projectState.attachedRun;
    const withAttached =
      attached !== null && !runs.some((r) => r.id === attached.id)
        ? [attached, ...runs]
        : runs;
    return withAttached.map((r) => ({
      value: r.id,
      label: [
        r.label,
        r.id === projectState.attachedRunId
          ? t3({
              en: "in use",
              fr: "en cours d'utilisation",
              pt: "em utilização",
            })
          : undefined,
        r.id === instanceState.pinnedRunId
          ? t3({ en: "pinned", fr: "épinglé", pt: "fixado" })
          : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(" · "),
    }));
  });

  const [candidate, setCandidate] = createSignal<string | undefined>(undefined);
  createEffect(
    on(
      () => projectState.attachedRunId,
      () => setCandidate(undefined),
    ),
  );
  const selectedId = (): string | undefined =>
    candidate() ?? projectState.attachedRunId ?? undefined;
  const isDifferent = () =>
    selectedId() !== undefined && selectedId() !== projectState.attachedRunId;

  const attachPackage = createButtonAction(async (runId: string) => {
    const confirmed = await openComponent({
      element: ResultsPackageCompatibilityModal,
      props: {
        projectId: projectState.id,
        runId,
        runLabel: runLabel(runId),
      },
    });
    if (confirmed !== true) {
      return { success: true as const };
    }
    return await serverActions.attachResultsPackage({
      projectId: projectState.id,
      run_id: runId,
    });
  });

  // Follow the instance's pinned package (SYSTEM_08 "The pinned package
  // + followers"). The flag is T1 (`projectState.followPinned`, pushed on
  // project_config_updated) and the pin itself is instance T1
  // (`instanceState.pinnedRunId`), so nothing is refetched here: enabling may
  // also repoint the project, which arrives as run_attached. Subscribing
  // before any package is pinned is allowed — the project moves once an admin
  // pins. The checkbox is keyed on a counter bumped when a save is refused,
  // because a controlled native checkbox has already flipped visually by then
  // and no store value changes to flip it back.
  const [checkboxKey, setCheckboxKey] = createSignal(1);
  const setFollowPinned = createButtonAction(async (follow: boolean) => {
    const res = await serverActions.setProjectFollowPinned({
      projectId: projectState.id,
      follow,
    });
    if (res.success === false) {
      setCheckboxKey((k) => k + 1);
    }
    return res;
  });

  // "Following, but not on the pin" is a real state (publish repointed this
  // project as a wizard attach target, it was locked while the pin moved, or
  // its repoint failed) — surface it and offer the manual realign, which is
  // just a manual attach TO the pin (that never clears the subscription).
  const behindPin = () =>
    projectState.followPinned &&
    instanceState.pinnedRunId !== null &&
    projectState.attachedRunId !== instanceState.pinnedRunId;

  const locked = () => projectState.isLocked;

  return (
    <div class="ui-spy">
      <Show when={String(checkboxKey())} keyed>
        {(_key) => (
          <Checkbox
            checked={projectState.followPinned}
            onChange={(v) => setFollowPinned.click(v)}
            disabled={locked() || setFollowPinned.state().status === "loading"}
            label={t3({
              en: "Always use the instance's pinned package",
              fr: "Toujours utiliser le paquet épinglé de l'instance",
              pt: "Usar sempre o pacote fixado da instância",
            })}
          />
        )}
      </Show>
      <Show when={behindPin() && instanceState.pinnedRunId} keyed>
        {(pinnedRunId) => (
          <div class="ui-gap flex items-center">
            <div class="text-warning flex-1 text-sm">
              {t3({
                en: "This project follows the pinned package but is currently on a different one.",
                fr: "Ce projet suit le paquet épinglé mais se trouve actuellement sur un autre paquet.",
                pt: "Este projeto segue o pacote fixado, mas está atualmente noutro pacote.",
              })}
            </div>
            <Button
              size="sm"
              outline
              iconName="package"
              onClick={() => attachPackage.click(pinnedRunId)}
              state={attachPackage.state()}
              disabled={locked()}
            >
              {t3({
                en: "Switch to pinned package",
                fr: "Basculer vers le paquet épinglé",
                pt: "Mudar para o pacote fixado",
              })}
            </Button>
          </div>
        )}
      </Show>
      <Show when={!projectState.followPinned}>
        <div class="ui-gap flex items-end" data-tour="results-package-picker">
          <SelectSearch<string>
            label={t3({
              en: "Results package in use",
              fr: "Paquet de résultats utilisé",
              pt: "Pacote de resultados em utilização",
            })}
            value={selectedId()}
            options={selectOptions()}
            onChange={setCandidate}
            disabled={options.state().status !== "ready" || locked()}
            fullWidth
            placeholder={t3({
              en: "No package attached",
              fr: "Aucun paquet rattaché",
              pt: "Nenhum pacote anexado",
            })}
          />
          <Button
            iconName="package"
            onClick={() => attachPackage.click(selectedId() ?? "")}
            state={attachPackage.state()}
            disabled={!isDifferent() || locked()}
          >
            {t3({
              en: "Use this package",
              fr: "Utiliser ce paquet",
              pt: "Usar este pacote",
            })}
          </Button>
        </div>
      </Show>
    </div>
  );
}

// What a member without the instance data bit sees of the attached package:
// the row itself (T1), which is the project's own configuration fact.
function AttachedPackageSummary(p: { run: RunListingItem }) {
  return (
    <div class="ui-spy-sm">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <Show when={p.run.id === instanceState.pinnedRunId}>
          <PinnedBadge />
        </Show>
      </div>
      <ResultsPackageProvenanceLine run={p.run} />
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Viewing what this package contains needs the instance's data permission.",
          fr: "Voir le contenu de ce paquet nécessite la permission de données de l'instance.",
          pt: "Ver o conteúdo deste pacote requer a permissão de dados da instância.",
        })}
      </div>
    </div>
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
