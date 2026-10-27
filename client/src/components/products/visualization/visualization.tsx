import {
  COLLAB_NO_EDIT_PERMISSION,
  type FigureBundle,
  findVisualizationConfigMap,
  materializeVisualization,
  type MetricWithStatus,
  type PackageScope,
  productScope,
  type ProductSummary,
  type RunAuthoringContext,
  t3,
  TC,
} from "lib";
import {
  Button,
  type EditorComponentProps,
  FrameTop,
  getEditorWrapper,
  HeadingBar,
  openAlert,
  openComponent,
  showMenu,
  type StateHolder,
  StateHolderWrapper,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { serverActions } from "~/server_actions";
import {
  openVisualizationSession,
  peersInProduct,
  reconnectForStaleEditAuth,
  setCollabView,
  type VisualizationSession,
} from "~/state/instance/collab";
import { PresenceAvatars } from "~/components/_shared/mod.ts";
import { createResolvedScope, productById } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getVisualizationDetailFromCacheOrFetch } from "~/state/products/t2_visualization_detail";
import { resolveFigureBundleInteractively } from "~/generate_visualization/mod";
import {
  VisualizationEditor,
  type VizFigureCollabBinding,
} from "~/components/_shared/figure_editor/mod.ts";
import {
  DuplicateProductsModal,
  manageAccessLabel,
  PackageScopeChip,
  PackageScopeModal,
  ProductAccessModal,
  ProductTitle,
  ReportFigureEmbed,
} from "~/components/products/_shared/mod.ts";
import { VersionHistoryEditor } from "~/components/products/_shared/version_history/mod.ts";
import { holdCopilotView } from "~/components/instance/copilot/mod.ts";

// The saved visualization's editor: one figure that IS its product, edited
// full-page in the shared figure editor and co-edited live in its own collab
// room. It takes ONE thing, the product id; label, package and scope are read
// LIVE from the T1 products row, and the product id is also the collab
// document id. The editor binds to the room once, at mount, and reads the
// pair once, so it is remounted (keyed) when the pair, the doc's lineage or
// the live mode changes: a remount under a new pair re-fetches, and its first
// coherent bundle brings the stored snapshot up to the new pair.
type Props = EditorComponentProps<{ productId: string }, undefined>;

// How long the editor waits for the room's first sync before it mounts
// without live co-editing (the Apply/Cancel flow, saved over REST).
const LIVE_SYNC_WAIT_MS = 4000;

// How long a restore waits for the room to relay the restored doc before the
// editor remounts anyway.
const RESTORE_UPDATE_WAIT_MS = 3000;

type Mode = "pending" | "live" | "offline";

type EditorInputs = {
  scope: PackageScope;
  context: RunAuthoringContext;
  bundle: FigureBundle;
  metric: MetricWithStatus | undefined;
  session: VisualizationSession | undefined;
};

export function VisualizationProductEditor(p: Props) {
  const product = (): ProductSummary | undefined => productById(p.productId);
  const label = () => product()?.label ?? "";
  const scope = (): PackageScope | undefined => {
    const row = product();
    return row === undefined ? undefined : productScope(row);
  };
  const resolvedScope = createResolvedScope(scope);
  const canEdit = () => canEditProduct(p.productId);

  // The copilot sets no view while this loads: the covered view stays, and
  // the figure editor sets `editing_visualization` once it mounts.
  holdCopilotView();
  // The version history opens over the editor, which stays mounted under it.
  const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
    getEditorWrapper();

  const [loadState, setLoadState] = createSignal<StateHolder<true>>({
    status: "loading",
  });
  const [stored, setStored] = createSignal<FigureBundle | undefined>();
  const [session, setSession] = createSignal<VisualizationSession>();
  const [mode, setMode] = createSignal<Mode>("pending");
  // Bumped when the session swaps its doc for one of the server's lineage:
  // the editor's binding belongs to the discarded doc, so it remounts.
  const [lineage, setLineage] = createSignal(0);
  // A FATAL collab error (deleted, room gone): further edits would be dropped.
  const [fatal, setFatal] = createSignal<string | undefined>();
  let permErrorShown = false;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  // A deleted product closes the editor: its row leaves T1.
  createEffect(() => {
    const row = product();
    const loading = loadState().status === "loading";
    if (row === undefined && !loading) p.close(undefined);
  });

  // The authoring context follows the LIVE pair (see the report editor): a
  // reattach or a scope change swaps the metric catalogue, and clearing it
  // first unmounts the editor until the new one is in.
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();
  createEffect(() => {
    const resolved = resolvedScope();
    setAuthoringContext(undefined);
    if (resolved === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(resolved);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  onMount(async () => {
    const res = await getVisualizationDetailFromCacheOrFetch(p.productId);
    if (!res.success) {
      setLoadState({ status: "error", err: res.err });
      return;
    }
    setStored(res.data.bundle);
    const s = openVisualizationSession(
      p.productId,
      p.productId,
      () => {
        if (mode() === "pending") setMode("live");
      },
      (errMsg, isFatal) => {
        console.warn("Visualization collab error:", errMsg);
        if (isFatal) {
          setFatal(errMsg);
          return;
        }
        // See the report editor: a stale socket auth reconnects, a real
        // viewer is told once.
        if (errMsg === COLLAB_NO_EDIT_PERMISSION) {
          if (canEdit()) {
            reconnectForStaleEditAuth();
          } else if (!permErrorShown) {
            permErrorShown = true;
            void openAlert({
              text: t3({
                en:
                  "You don't have permission to edit this visualization: your changes are not being saved.",
                fr:
                  "Vous n'avez pas la permission de modifier cette visualisation : vos modifications ne sont pas enregistrées.",
                pt:
                  "Não tem permissão para editar esta visualização: as suas alterações não estão a ser guardadas.",
              }),
              intent: "danger",
            });
          }
        }
      },
      () => setLineage((n) => n + 1),
    );
    setSession(s);
    setCollabView({ visualizationId: p.productId });
    syncTimer = setTimeout(() => {
      if (mode() === "pending") setMode("offline");
    }, LIVE_SYNC_WAIT_MS);
    setLoadState({ status: "ready", data: true });
  });

  onCleanup(() => {
    clearTimeout(syncTimer);
    session()?.close();
    setCollabView({});
  });

  // A fatal room error locks the visualization: say so once and leave.
  createEffect(() => {
    const msg = fatal();
    if (msg === undefined) return;
    void (async () => {
      await openAlert({
        text: t3({
          en: "This visualization is no longer available for editing.",
          fr: "Cette visualisation n'est plus disponible pour modification.",
          pt: "Esta visualização já não está disponível para edição.",
        }),
        intent: "danger",
      });
      p.close(undefined);
    })();
  });

  // What the editor mounts on: a fresh object on every pair, lineage or mode
  // change, which is what remounts it. The bundle is read from the live doc
  // at that moment (peers may have edited it since the row was read).
  const editorInputs = createMemo<EditorInputs | undefined>(() => {
    const context = authoringContext();
    const pair = resolvedScope();
    const m = mode();
    lineage();
    const s = session();
    const fallbackBundle = stored();
    if (!context || !pair || m === "pending" || !fallbackBundle) {
      return undefined;
    }
    let bundle = fallbackBundle;
    if (m === "live" && s) {
      try {
        bundle = materializeVisualization(s.doc).bundle;
      } catch {
        // The doc holds no figure yet: the stored row is the content.
      }
    }
    return {
      scope: { runId: pair.runId, scopeId: pair.scopeId },
      context,
      bundle,
      metric: context.metrics.find((x) => x.id === bundle.metricId),
      session: m === "live" ? s : undefined,
    };
  });

  function bindingFor(
    s: VisualizationSession,
  ): VizFigureCollabBinding {
    return {
      figureId: p.productId,
      hostDoc: { docType: "visualization", docId: p.productId },
      getConfigMap: () => findVisualizationConfigMap(s.doc),
      awareness: s.awareness,
      isLive: () => s.isLive(),
      canEdit: () => canEdit() && fatal() === undefined,
      localOrigin: {},
      // Each refetch's coherent bundle carries the data for the co-edited
      // config; only an editor writes it into the room.
      onCoherentBundle: (bundle: FigureBundle) => {
        if (canEdit() && fatal() === undefined) s.pushFigData(bundle);
      },
    };
  }

  // Back: re-resolve the final config under the current pair and keep it,
  // through the room when live, else over REST (the Apply flow). A failed
  // resolve keeps the editor open.
  async function handleClose(
    inputs: EditorInputs,
    result: { updated: { config: FigureBundle["config"] } } | undefined,
  ) {
    if (
      result?.updated && inputs.metric && canEdit() && fatal() === undefined
    ) {
      const rebuilt = await resolveFigureBundleInteractively(
        inputs.scope,
        inputs.metric,
        result.updated.config,
      );
      if (!rebuilt.ok) {
        await openAlert({ text: rebuilt.reason, intent: "danger" });
        return;
      }
      const s = inputs.session;
      if (s && s.isLive()) {
        s.pushBundle(rebuilt.bundle);
      } else {
        const res = await serverActions.updateVisualization({
          product_id: p.productId,
          bundle: rebuilt.bundle,
        });
        if (!res.success) {
          await openAlert({ text: res.err, intent: "danger" });
          return;
        }
      }
    }
    p.close(undefined);
  }

  async function openHistory() {
    await openInnerEditor({
      element: VersionHistoryEditor,
      props: {
        kind: "visualization" as const,
        docId: p.productId,
        currentLabel: label(),
        onRestored: () => void remountOnRestored(),
      },
    });
  }

  // A restore replaced the content under the editor, which read its config
  // at mount, so it remounts on the restored content; its first fetch then
  // brings the restored figure up to the product's pair. Live, the room
  // relays the restore as a doc update that can land after the restore's
  // answer, so the remount waits for it. Offline, the row is read again.
  async function remountOnRestored() {
    const s = session();
    if (mode() === "live" && s) {
      const doc = s.doc;
      const remount = () => {
        doc.off("update", remount);
        clearTimeout(timer);
        setLineage((n) => n + 1);
      };
      const timer = setTimeout(remount, RESTORE_UPDATE_WAIT_MS);
      doc.on("update", remount);
      return;
    }
    const res = await serverActions.getVisualizationDetail({
      product_id: p.productId,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
      return;
    }
    setStored(res.data.bundle);
    setLineage((n) => n + 1);
  }

  async function openPackageScope() {
    const row = product();
    if (!row) return;
    await openComponent({
      element: PackageScopeModal,
      props: { product: row },
    });
  }

  async function openAccess() {
    await openComponent({
      element: ProductAccessModal,
      props: { mode: "product" as const, productId: p.productId },
    });
  }

  async function duplicate() {
    const row = product();
    if (!row) return;
    await openComponent({
      element: DuplicateProductsModal,
      props: { products: [row] },
    });
  }

  function openMenu(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu({
      anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      position: "bottom-end",
      items: [
        {
          label: manageAccessLabel(),
          icon: "users",
          onClick: () => void openAccess(),
        },
        {
          label: t3({
            en: "Make a copy",
            fr: "Faire une copie",
            pt: "Fazer uma cópia",
          }),
          icon: "copy",
          onClick: () => void duplicate(),
        },
      ],
    });
  }

  // The header pieces are built ONCE and passed by reference (see the report
  // editor: FrameTop reads its panel twice, and an inline piece would be
  // built twice).
  // pl-1: the title's rename hover reaches 4px left of its text.
  const chromeTitle = (
    <div class="flex min-w-0 items-center pl-1">
      <ProductTitle productId={p.productId} label={label()} />
    </div>
  );
  const chromeActions = (
    <div class="ui-gap-sm flex items-center">
      <PackageScopeChip
        product={product()}
        onClick={canEdit() ? () => void openPackageScope() : undefined}
      />
      <PresenceAvatars peers={peersInProduct(p.productId)} size="sm" />
      <Button
        id="visualization-history-button"
        outline
        iconName="rotate"
        onClick={() => void openHistory()}
      >
        {t3({ en: "History", fr: "Historique", pt: "Histórico" })}
      </Button>
      <Button iconName="moreVertical" outline onClick={openMenu} />
    </div>
  );
  const chrome = { title: chromeTitle, actions: chromeActions };

  const loadingHeader = (
    <HeadingBar
      tonal
      leftChildren={
        <Button
          iconName="chevronLeft"
          onClick={() => p.close(undefined)}
        />
      }
      heading={<span class="font-400 truncate pl-1">{label()}</span>}
    />
  );

  return (
    <InnerEditorWrapper>
      <Show
        when={editorInputs()}
        keyed
        fallback={
          <FrameTop panelChildren={loadingHeader}>
            <StateHolderWrapper state={loadState()} loadingAndErrorPad="md">
              {() => (
                <div class="ui-pad text-base-content-muted text-sm">
                  {t3(TC.loading)}
                </div>
              )}
            </StateHolderWrapper>
          </FrameTop>
        }
      >
        {(inputs) => (
          <Show
            when={inputs.metric}
            fallback={<MissingMetric inputs={inputs} onBack={p.close} />}
          >
            {(metric) => (
              <VisualizationEditor
                label={label()}
                scope={inputs.scope}
                metric={metric()}
                configSnapshot={structuredClone(inputs.bundle.config)}
                aiView={{
                  id: "editing_visualization" as const,
                  params: { productId: p.productId },
                }}
                authoringContext={inputs.context}
                collabBinding={inputs.session
                  ? bindingFor(inputs.session)
                  : undefined}
                viewOnly={!canEdit()}
                productChrome={chrome}
                close={(result) => void handleClose(inputs, result)}
              />
            )}
          </Show>
        )}
      </Show>
    </InnerEditorWrapper>
  );
}

// The visualization's metric is not in its package's catalogue (the product
// was reattached to a package without that module): nothing can be edited,
// so the stored snapshot is shown as it was saved, with the reason.
function MissingMetric(p: {
  inputs: EditorInputs;
  onBack: (result: undefined) => void;
}) {
  const header = (
    <HeadingBar
      tonal
      leftChildren={
        <Button
          iconName="chevronLeft"
          onClick={() => p.onBack(undefined)}
        />
      }
      heading={
        <span class="font-400 truncate pl-1">
          {t3({
            en: "This visualization's metric is not in its results package",
            fr:
              "L'indicateur de cette visualisation n'est pas dans son paquet de résultats",
            pt:
              "A métrica desta visualização não está no seu pacote de resultados",
          })}
        </span>
      }
    />
  );
  return (
    <FrameTop panelChildren={header}>
      <div class="ui-pad h-full w-full overflow-auto">
        <ReportFigureEmbed
          figure={{ type: "figure", bundle: p.inputs.bundle }}
        />
      </div>
    </FrameTop>
  );
}
