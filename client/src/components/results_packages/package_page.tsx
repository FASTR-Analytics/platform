import {
  MODULE_FAMILY_ORDER,
  compareModules,
  getModuleFamilyLabel,
  t3,
  TC,
  type DatasetType,
  type InstalledModuleSummary,
  type PackageScope,
  type RunAuthoringContext,
  type RunCatalogItem,
  type RunDetail,
  type RunListingItem,
  type RunPopulation,
  type RunProgress,
} from "lib";
import {
  Button,
  Callout,
  CollapsibleSection,
  FrameTop,
  HeadingBar,
  LoadingIndicator,
  StateHolderWrapper,
  TabsNavigation,
  createButtonAction,
  createDeleteAction,
  createQuery,
  formatFileSize,
  getEditorWrapper,
  openConfirm,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import {
  FamilyPane,
  ModuleProgressChip,
  PinnedBadge,
  RunStatusBadge,
  ViewFiles,
  ViewLogs,
  ViewScript,
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
  type OpenEditor,
} from "./package_view/mod.ts";
import { PRODUCT_TYPE_REGISTRY } from "~/components/products/mod.ts";
import {
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getRunDetailFromCacheOrFetch } from "~/state/instance/t2_runs";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;
type OpenViewer = (element: Viewer, moduleId: string) => void;

type Props = {
  runId: string;
  // Accessors into the catalogue's page-local SSE listeners, which stay
  // mounted under this page: progress patches in place and the R line is
  // keyed by run and module.
  liveProgress: () => RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  close: (v: undefined) => void;
};

// One results package, full page, opened from the catalogue list through the
// shell wrapper: the package's one host (SYSTEM_08), so every status renders
// here. A ready package is a tab bar of its families, each a module list
// beside the selected module's pane; a generating or failed one is its
// progress. The page owns the housekeeping chrome (pin/unpin, guarded
// delete, "in use by") and the editor wrapper the viewers open into.
//
// The row is read live from T1 rather than snapshotted through the wrapper. A
// freshly launched run is opened before its catalogue refetch lands, so the
// page waits for the row to appear and closes itself only once a row it has
// shown is removed.
export function ResultsPackagePage(p: Props) {
  const run = createMemo(() =>
    instanceState.runsCatalog.find((r) => r.id === p.runId),
  );
  let seen = false;
  createEffect(() => {
    const row = run();
    if (row !== undefined) {
      seen = true;
    } else if (seen) {
      p.close(undefined);
    }
  });

  const { openEditor, EditorWrapper } = getEditorWrapper();

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            onBack={() => p.close(undefined)}
            heading={t3({
              en: "Results package",
              fr: "Paquet de résultats",
              pt: "Pacote de resultados",
            })}
          />
        }
      >
        <Show when={run()} fallback={<LoadingIndicator />}>
          {(run) => (
            <PackageBody
              run={run()}
              liveProgress={p.liveProgress}
              latestRLine={p.latestRLine}
              openEditor={openEditor}
            />
          )}
        </Show>
      </FrameTop>
    </EditorWrapper>
  );
}

function PackageBody(p: {
  run: RunCatalogItem;
  liveProgress: () => RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  openEditor: OpenEditor;
}) {
  const progress = () => p.liveProgress() ?? p.run.progress;

  // Guarded hard delete (fork ruling 3): ONE act (catalog row, files and
  // cached results) with no archived state and no automatic GC. The server
  // refuses while a product points at the package or it is still generating;
  // the page states the reason rather than hiding the button, so an
  // undeletable package is never a mystery. No refetch on success: the SSE
  // push updates the store and the page closes when its row is gone.
  const deleteBlockedReason = (): string | null => {
    if (p.run.status === "generating") {
      return t3({
        en: "Cannot delete while generating",
        fr: "Suppression impossible pendant la génération",
        pt: "Não é possível eliminar durante a geração",
      });
    }
    if (isPinned()) {
      return t3({
        en: "Cannot delete while pinned",
        fr: "Suppression impossible tant qu'il est épinglé",
        pt: "Não é possível eliminar enquanto estiver fixado",
      });
    }
    if (p.run.attachedProducts.length > 0) {
      return t3({
        en: "Cannot delete while in use",
        fr: "Suppression impossible tant qu'il est utilisé",
        pt: "Não é possível eliminar enquanto estiver em uso",
      });
    }
    return null;
  };

  const deletePackage = createDeleteAction(
    {
      text: t3({
        en: "Delete this results package? Its files and cached results are permanently removed.",
        fr: "Supprimer ce paquet de résultats ? Ses fichiers et ses résultats mis en cache sont définitivement supprimés.",
        pt: "Eliminar este pacote de resultados? Os seus ficheiros e resultados em cache são removidos permanentemente.",
      }),
      itemList: [p.run.label],
    },
    () => serverActions.deleteRun({ run_id: p.run.id }),
  );

  // Pin / unpin (SYSTEM_08 "The pinned package"): an explicit act on a ready
  // package that moves no product. Unpin is run-keyed. No refetch on success:
  // the pin push and catalogue nonce update the store, and both badges and
  // buttons derive from `instanceState.pinnedRunId`.
  const isPinned = () => p.run.id === instanceState.pinnedRunId;

  const pinPackage = createButtonAction(async () => {
    const ok = await openConfirm({
      title: t3({
        en: "Pin this results package?",
        fr: "Épingler ce paquet de résultats ?",
        pt: "Fixar este pacote de resultados?",
      }),
      text: t3({
        en: "It becomes the instance's pinned package: new decks and reports start on it. Existing products keep their package.",
        fr: "Il devient le paquet épinglé de l'instance : les nouvelles présentations et les nouveaux rapports l'utilisent. Les produits existants gardent leur paquet.",
        pt: "Passa a ser o pacote fixado da instância: as novas apresentações e os novos relatórios começam com ele. Os produtos existentes mantêm o seu pacote.",
      }),
      confirmButtonLabel: t3({ en: "Pin", fr: "Épingler", pt: "Fixar" }),
    });
    if (!ok) {
      return { success: true };
    }
    return await serverActions.pinResultsPackage({ run_id: p.run.id });
  });

  const unpinPackage = createButtonAction(() =>
    serverActions.unpinResultsPackage({ run_id: p.run.id }),
  );

  // A generating or failed run has no manifest, so its modules are named
  // from the registry (status.tsx).
  const openViewer: OpenViewer = (element, moduleId) => {
    void p.openEditor({
      element,
      props: {
        runId: p.run.id,
        // Read plane: a manifest module id is plain text here (PLAN_1a §0
        // clause 3).
        moduleId,
        moduleLabel: moduleLabel(moduleId),
      },
    });
  };

  const housekeeping = (
    <>
      <Switch>
        <Match when={isPinned()}>
          <Button
            size="sm"
            outline
            state={unpinPackage.state()}
            onClick={unpinPackage.click}
          >
            {t3({ en: "Unpin", fr: "Désépingler", pt: "Desafixar" })}
          </Button>
        </Match>
        <Match when={p.run.status === "ready"}>
          <Button
            size="sm"
            outline
            state={pinPackage.state()}
            onClick={pinPackage.click}
          >
            {t3({ en: "Pin", fr: "Épingler", pt: "Fixar" })}
          </Button>
        </Match>
      </Switch>
      <Switch>
        <Match when={deleteBlockedReason()} keyed>
          {(reason) => <div class="ui-text-caption">{reason}</div>}
        </Match>
        <Match when={deleteBlockedReason() === null}>
          <Button
            size="sm"
            intent="danger"
            outline
            iconName="trash"
            onClick={deletePackage.click}
          >
            {t3(TC.delete)}
          </Button>
        </Match>
      </Switch>
    </>
  );

  const usageLine = (
    <Show
      when={p.run.attachedProducts.length > 0}
      fallback={
        <div
          class="ui-text-caption"
          data-tour="instance-results-packages-usage"
        >
          {t3({
            en: "Not used by any deck or report",
            fr: "Utilisé par aucune présentation ni aucun rapport",
            pt: "Não usado por nenhuma apresentação nem relatório",
          })}
        </div>
      }
    >
      <Callout data-tour="instance-results-packages-usage" noBorder>
        <span class="font-700">
          {t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}:
        </span>{" "}
        {p.run.attachedProducts
          .map(
            (product) =>
              `${product.label} (${PRODUCT_TYPE_REGISTRY[product.type].label()})`,
          )
          .join(", ")}
      </Callout>
    </Show>
  );

  return (
    <div
      class="ui-pad ui-spy h-full overflow-y-scroll"
      data-tour="instance-results-packages-card"
    >
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate text-lg">{p.run.label}</div>
        <Show when={isPinned()}>
          <PinnedBadge />
        </Show>
        <RunStatusBadge status={p.run.status} />
        {housekeeping}
      </div>
      <ProvenanceLine run={p.run} />
      {usageLine}
      <Switch>
        <Match when={p.run.status === "ready"}>
          <ReadyPackageBody runId={p.run.id} openEditor={p.openEditor} />
        </Match>
        <Match when={p.run.status === "generating" && progress()} keyed>
          {(keyedProgress) => (
            <div class="ui-spy-sm">
              <div class="ui-gap-sm flex flex-wrap">
                <For each={keyedProgress.moduleOrder}>
                  {(moduleId) => (
                    <ModuleProgressChip
                      label={moduleLabel(moduleId)}
                      status={keyedProgress.moduleStatus[moduleId] ?? "pending"}
                    />
                  )}
                </For>
              </div>
              <Show when={keyedProgress.currentModuleId} keyed>
                {(currentModuleId) => (
                  <div class="ui-text-caption truncate font-mono">
                    {p.latestRLine(currentModuleId) ?? "..."}
                  </div>
                )}
              </Show>
            </div>
          )}
        </Match>
        <Match when={p.run.status === "failed"}>
          <div class="ui-spy-sm">
            <FailedErrorDetail errorDetail={progress()?.errorDetail ?? null} />
            {/* The module list comes from the stored progress, and viewers are
                offered only for modules that started: a pending module never
                got a workspace. A crash/pipeline failure publishes the partial
                workspace for inspection (no manifest, so there is no summary);
                boot-interrupted and pre-worker-failed runs have NO directory at
                all, so their viewers open onto the typed no-script/log/files
                states: accepted, degrades loudly. */}
            <Show when={progress()} keyed>
              {(keyedProgress) => (
                <For each={keyedProgress.moduleOrder}>
                  {(moduleId) => {
                    const status =
                      keyedProgress.moduleStatus[moduleId] ?? "pending";
                    return (
                      <div class="ui-gap-sm flex items-center text-sm">
                        <div class="flex w-64">
                          <ModuleProgressChip
                            label={moduleLabel(moduleId)}
                            status={status}
                          />
                        </div>
                        <Show when={status !== "pending"}>
                          <FailedModuleViewerButtons
                            moduleId={moduleId}
                            openViewer={openViewer}
                          />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              )}
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  );
}

// A READY package below its header: the population stamp, then one tab per
// family the package ran, in family order, each a module list beside the
// selected module's pane. The page scope (starts national), the active
// family (starts at the first) and the selected module per family (starts
// at the primary) are page state, never stored. Both reads are T2,
// immutable by identity, so a revisit is a cache hit.
function ReadyPackageBody(p: { runId: string; openEditor: OpenEditor }) {
  const reads = createQuery(async () => {
    const [detail, ctx] = await Promise.all([
      getRunDetailFromCacheOrFetch(p.runId),
      getRunAuthoringContextFromCacheOrFetch(p.runId),
    ]);
    if (!detail.success) return detail;
    if (!ctx.success) return ctx;
    return {
      success: true,
      data: { detail: detail.data, ctx: ctx.data },
    } as const;
  }, t3(TC.loading));

  const [selection, setSelection] = createSignal<ScopeSelection>({
    mode: "national",
  });
  const [adminArea2, setAdminArea2] = createSignal<string | null>(null);
  function changeScope(next: ScopeSelection): void {
    setSelection(next);
    const stored = storedValueFromScopeSelection(next);
    if (stored !== undefined) setAdminArea2(stored);
  }
  const scope = (): PackageScope => ({
    runId: p.runId,
    adminArea2: adminArea2(),
  });

  return (
    <StateHolderWrapper state={reads.state()} noPad>
      {(data: { detail: RunDetail; ctx: RunAuthoringContext }) => (
        <>
          <Show
            when={
              data.detail.population?.active
                ? data.detail.population
                : undefined
            }
            keyed
          >
            {(population) => <PopulationSection population={population} />}
          </Show>
          <FamilyTabs
            runId={p.runId}
            detail={data.detail}
            ctx={data.ctx}
            scope={scope()}
            selection={selection()}
            onChangeScope={changeScope}
            openEditor={p.openEditor}
          />
        </>
      )}
    </StateHolderWrapper>
  );
}

type FamilyModules = { family: DatasetType; modules: InstalledModuleSummary[] };

function FamilyTabs(p: {
  runId: string;
  detail: RunDetail;
  ctx: RunAuthoringContext;
  scope: PackageScope;
  selection: ScopeSelection;
  onChangeScope: (s: ScopeSelection) => void;
  openEditor: OpenEditor;
}) {
  const modulesByFamily = createMemo((): FamilyModules[] =>
    MODULE_FAMILY_ORDER.flatMap((family) => {
      const modules = p.ctx.modules
        .filter((m) => m.family === family)
        .toSorted(compareModules);
      return modules.length === 0 ? [] : [{ family, modules }];
    }),
  );
  const [chosenFamily, setChosenFamily] = createSignal<DatasetType>();
  const active = createMemo(
    () =>
      modulesByFamily().find((f) => f.family === chosenFamily()) ??
      modulesByFamily()[0],
  );
  const [chosenModule, setChosenModule] = createSignal<
    Partial<Record<DatasetType, string>>
  >({});
  const selectedModuleId = (family: FamilyModules) =>
    chosenModule()[family.family] ?? family.modules[0].id;

  return (
    <Show
      when={active()}
      keyed
      fallback={
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "This package has no modules",
            fr: "Ce paquet n'a aucun module",
            pt: "Este pacote não tem módulos",
          })}
        </div>
      }
    >
      {(family) => (
        <div class="ui-spy">
          <TabsNavigation
            items={modulesByFamily().map((f) => ({
              id: f.family,
              label: getModuleFamilyLabel(f.family),
            }))}
            value={family.family}
            onChange={setChosenFamily}
            noPad
          />
          <FamilyPane
            runId={p.runId}
            modules={family.modules}
            selectedModuleId={selectedModuleId(family)}
            onSelectModule={(moduleId) =>
              setChosenModule((prev) => ({
                ...prev,
                [family.family]: moduleId,
              }))
            }
            detail={p.detail}
            ctx={p.ctx}
            scope={p.scope}
            selection={p.selection}
            onChangeScope={p.onChangeScope}
            openEditor={p.openEditor}
          />
        </div>
      )}
    </Show>
  );
}

// The manifest's population stamp (SYSTEM_08 "population.csv"): what the
// package's rate indicators were computed over. Rendered only when a formula
// named a population, so an instance that never uses one sees nothing.
function PopulationSection(p: { population: RunPopulation }) {
  const level = () =>
    t3(getAdminAreaLabelForLevel(p.population.adminAreaLevel));
  return (
    <CollapsibleSection
      title={t3({ en: "Population", fr: "Population", pt: "População" })}
    >
      <div class="ui-pad ui-spy-sm">
        <div class="text-sm">
          <span class="text-base-content-muted">
            {t3({ en: "Level", fr: "Niveau", pt: "Nível" })}
          </span>
          {`: ${level()}`}
        </div>
        <Show
          when={p.population.coverage}
          keyed
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "Coverage not recorded for this package",
                fr: "Couverture non enregistrée pour ce paquet",
                pt: "Cobertura não registada para este pacote",
              })}
            </div>
          }
        >
          {(coverage) => (
            <For each={coverage}>
              {(c) => (
                <div class="text-sm">
                  <span class="text-base-content-muted">
                    {c.populationType}
                  </span>
                  {`: ${t3({
                    en: `${c.areasCovered} of ${c.areasTotal} areas`,
                    fr: `${c.areasCovered} zones sur ${c.areasTotal}`,
                    pt: `${c.areasCovered} de ${c.areasTotal} áreas`,
                  })}, ${coveredMonths(c.firstCoveredPeriodId, c.lastCoveredPeriodId)}`}
                </div>
              )}
            </For>
          )}
        </Show>
      </div>
    </CollapsibleSection>
  );
}

// Period ids are YYYYMM in the instance's own calendar, so the id's digits
// are the month label.
function coveredMonths(first: number | null, last: number | null): string {
  if (first === null || last === null) {
    return t3({
      en: "no months covered",
      fr: "aucun mois couvert",
      pt: "nenhum mês coberto",
    });
  }
  return t3({
    en: `${formatPeriodId(first)} to ${formatPeriodId(last)}`,
    fr: `${formatPeriodId(first)} à ${formatPeriodId(last)}`,
    pt: `${formatPeriodId(first)} a ${formatPeriodId(last)}`,
  });
}

function formatPeriodId(periodId: number): string {
  return `${Math.floor(periodId / 100)}-${String(periodId % 100).padStart(2, "0")}`;
}

// The package's provenance line: when it was made, by whom, how, and how much
// disk it holds: read off the run's own record, not the viewer's
// relationship to it.
function ProvenanceLine(p: { run: RunListingItem }) {
  return (
    <div class="ui-text-caption">
      {new Date(p.run.createdAt).toLocaleString()}
      {p.run.createdBy !== null ? ` · ${p.run.createdBy}` : ""}
      {p.run.provenance === "synthetic-backfill"
        ? ` · ${t3({
            en: "created from pre-existing results",
            fr: "créé à partir de résultats préexistants",
            pt: "criado a partir de resultados preexistentes",
          })}`
        : ""}
      {p.run.summary?.diskSizeBytes != null
        ? ` · ${formatFileSize(p.run.summary.diskSizeBytes, 1)}`
        : ""}
    </div>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors): clamp it to a few lines, expandable on demand. Display-only:
// the stored detail stays intact.
const ERROR_CLAMP_CHARS = 280;

function FailedErrorDetail(p: { errorDetail: string | null }) {
  const [expanded, setExpanded] = createSignal(false);
  const detail = () =>
    p.errorDetail ??
    t3({
      en: "Generation failed",
      fr: "Échec de la génération",
      pt: "Falha na geração",
    });
  const isLong = () => detail().length > ERROR_CLAMP_CHARS;
  return (
    <div class="ui-spy-sm text-danger text-sm">
      <div class="whitespace-pre-wrap">
        {expanded() || !isLong()
          ? detail()
          : `${detail().slice(0, ERROR_CLAMP_CHARS)}…`}
      </div>
      <Show when={isLong()}>
        <Button
          size="sm"
          outline
          intent="danger"
          onClick={() => setExpanded(!expanded())}
        >
          {expanded()
            ? t3({ en: "Show less", fr: "Afficher moins", pt: "Mostrar menos" })
            : t3({ en: "Show more", fr: "Afficher plus", pt: "Mostrar mais" })}
        </Button>
      </Show>
    </div>
  );
}

// A failed run's started modules: script, log and the partial workspace's
// files (a failed run has no manifest, so files come from the listing route
// via the ViewFiles editor rather than the T2 detail).
function FailedModuleViewerButtons(p: {
  moduleId: string;
  openViewer: OpenViewer;
}) {
  return (
    <>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewScript, p.moduleId)}
        >
          {t3({ en: "Script", fr: "Script", pt: "Script" })}
        </Button>
      </Show>
      <Show when={canViewPackageLogs()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewLogs, p.moduleId)}
        >
          {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
        </Button>
      </Show>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewFiles, p.moduleId)}
        >
          {t3({ en: "Files", fr: "Fichiers", pt: "Ficheiros" })}
        </Button>
      </Show>
    </>
  );
}
