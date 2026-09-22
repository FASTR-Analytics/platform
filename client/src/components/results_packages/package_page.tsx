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
  type RunProgress,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  LoadingIndicator,
  StateHolderWrapper,
  TabsNavigation,
  createButtonAction,
  createDeleteAction,
  formatFileSize,
  getEditorWrapper,
  openConfirm,
  type StateHolder,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import {
  About,
  FamilyPane,
  PinnedBadge,
  RunStatusBadge,
  type OpenEditor,
} from "./package_view/mod.ts";
import {
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getRunDetailFromCacheOrFetch } from "~/state/instance/t2_runs";

type Props = {
  runId: string;
  // Accessors into the catalogue's page-local SSE listeners, which stay
  // mounted under this page: progress patches in place and the R line is
  // keyed by run and module.
  liveProgress: () => RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  close: (v: undefined) => void;
};

type ReadyReads = { detail: RunDetail; ctx: RunAuthoringContext };
type FamilyModules = { family: DatasetType; modules: InstalledModuleSummary[] };
type Tab = "about" | DatasetType;

// One results package, full page, opened from the catalogue list through the
// shell wrapper: the package's one host (SYSTEM_08), so every status renders
// here, as one shape. The heading bar carries the label, the badges, the
// housekeeping (pin/unpin, guarded delete) and the provenance line; the tab
// bar is About, then one tab per family the package ran, each a module list
// beside the selected module's pane. A generating or failed package has
// About only. The page owns the editor wrapper the viewers open into.
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
      <Show when={run()} fallback={<LoadingIndicator />}>
        {(run) => (
          <PackageBody
            run={run()}
            liveProgress={p.liveProgress}
            latestRLine={p.latestRLine}
            openEditor={openEditor}
            close={() => p.close(undefined)}
          />
        )}
      </Show>
    </EditorWrapper>
  );
}

function PackageBody(p: {
  run: RunCatalogItem;
  liveProgress: () => RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  openEditor: OpenEditor;
  close: () => void;
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

  // The ready reads, both T2 and immutable by identity. A run that becomes
  // ready under the open page (the SSE row update) fetches then; the counter
  // is the stale-response guard.
  const [reads, setReads] = createSignal<StateHolder<ReadyReads>>({
    status: "loading",
  });
  let requestCounter = 0;
  createEffect(async () => {
    const runId = p.run.id;
    const ready = p.run.status === "ready";
    if (!ready) return;
    const requestId = ++requestCounter;
    const [detail, ctx] = await Promise.all([
      getRunDetailFromCacheOrFetch(runId),
      getRunAuthoringContextFromCacheOrFetch(runId),
    ]);
    if (requestId !== requestCounter) return;
    setReads(
      !detail.success
        ? { status: "error", err: detail.err }
        : !ctx.success
          ? { status: "error", err: ctx.err }
          : { status: "ready", data: { detail: detail.data, ctx: ctx.data } },
    );
  });
  const readyReads = (): ReadyReads | undefined => {
    const state = reads();
    return p.run.status === "ready" && state.status === "ready"
      ? state.data
      : undefined;
  };

  const modulesByFamily = createMemo((): FamilyModules[] => {
    const ctx = readyReads()?.ctx;
    if (ctx === undefined) return [];
    return MODULE_FAMILY_ORDER.flatMap((family) => {
      const modules = ctx.modules
        .filter((m) => m.family === family)
        .toSorted(compareModules);
      return modules.length === 0 ? [] : [{ family, modules }];
    });
  });

  // Page state, never stored: the active tab, the selected module per
  // family (the primary until chosen) and the page scope every figure on
  // every family tab renders under.
  const [chosenTab, setChosenTab] = createSignal<Tab>("about");
  const activeFamily = createMemo(() => {
    const data = readyReads();
    const family = modulesByFamily().find((f) => f.family === chosenTab());
    return data !== undefined && family !== undefined
      ? { ...data, ...family }
      : undefined;
  });
  const [chosenModule, setChosenModule] = createSignal<
    Partial<Record<DatasetType, string>>
  >({});
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
    runId: p.run.id,
    adminArea2: adminArea2(),
  });

  const heading = (
    <span class="inline-flex items-center gap-2">
      <span class="truncate">{p.run.label}</span>
      <Show when={isPinned()}>
        <PinnedBadge />
      </Show>
      <RunStatusBadge status={p.run.status} />
    </span>
  );

  const housekeeping = (
    <div class="ui-gap-sm flex items-center">
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
    </div>
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          onBack={p.close}
          heading={heading}
          subheading={provenanceLine(p.run)}
        >
          {housekeeping}
        </HeadingBar>
      }
    >
      <FrameTop
        panelChildren={
          <TabsNavigation<Tab>
            items={[
              {
                id: "about",
                label: t3({ en: "About", fr: "À propos", pt: "Sobre" }),
              },
              ...modulesByFamily().map((f) => ({
                id: f.family,
                label: getModuleFamilyLabel(f.family),
              })),
            ]}
            value={activeFamily()?.family ?? "about"}
            onChange={setChosenTab}
            insetRail
          />
        }
      >
        <div class="ui-pad h-full overflow-y-auto">
          <Switch>
            <Match
              when={activeFamily() === undefined && p.run.status === "ready"}
            >
              <StateHolderWrapper state={reads()} noPad>
                {(data: ReadyReads) => (
                  <About
                    run={p.run}
                    progress={progress()}
                    latestRLine={p.latestRLine}
                    ctx={data.ctx}
                    openEditor={p.openEditor}
                  />
                )}
              </StateHolderWrapper>
            </Match>
            <Match
              when={activeFamily() === undefined && p.run.status !== "ready"}
            >
              <About
                run={p.run}
                progress={progress()}
                latestRLine={p.latestRLine}
                ctx={undefined}
                openEditor={p.openEditor}
              />
            </Match>
            <Match when={activeFamily()} keyed>
              {(family) => (
                <FamilyPane
                  runId={p.run.id}
                  modules={family.modules}
                  selectedModuleId={
                    chosenModule()[family.family] ?? family.modules[0].id
                  }
                  onSelectModule={(moduleId) =>
                    setChosenModule((prev) => ({
                      ...prev,
                      [family.family]: moduleId,
                    }))
                  }
                  detail={family.detail}
                  ctx={family.ctx}
                  scope={scope()}
                  selection={selection()}
                  onChangeScope={changeScope}
                  openEditor={p.openEditor}
                />
              )}
            </Match>
          </Switch>
        </div>
      </FrameTop>
    </FrameTop>
  );
}

// When the package was made, by whom, how, and how much disk it holds: read
// off the run's own record, not the viewer's relationship to it.
function provenanceLine(run: RunListingItem): string {
  return [
    new Date(run.createdAt).toLocaleString(),
    run.createdBy,
    run.provenance === "synthetic-backfill"
      ? t3({
          en: "created from pre-existing results",
          fr: "créé à partir de résultats préexistants",
          pt: "criado a partir de resultados preexistentes",
        })
      : null,
    run.summary?.diskSizeBytes != null
      ? formatFileSize(run.summary.diskSizeBytes, 1)
      : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
