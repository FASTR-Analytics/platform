import {
  DashboardDetail,
  DashboardItem,
  PresentationObjectConfig,
  getReplicateByProp,
  getFetchConfigFromPresentationObjectConfig,
  t3,
} from "lib";
import {
  Button,
  ChartHolder,
  CopyToClipboardButton,
  EditorComponentProps,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  StateHolder,
  StateHolderWrapper,
  getEditorWrapper,
  openAlert,
  openComponent,
  timActionDelete,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import { getDashboardDetailFromCacheOrFetch } from "~/state/project/t2_dashboards";
import {
  getPODetailFromCacheorFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { serverActions } from "~/server_actions";
import { SelectVisualizationForSlide } from "~/components/slide_deck/select_visualization_for_slide";
import { AddDashboardItemConfirmModal } from "./add_dashboard_item_modal";
import { DashboardSettingsModal } from "./dashboard_settings_modal";
import { DashboardItemList } from "./dashboard_item_list";

type Props = EditorComponentProps<
  {
    projectId: string;
    dashboardId: string;
    title: string;
    isGlobalAdmin: boolean;
  },
  undefined
>;

const CANVAS_ID = "DASHBOARD_PREVIEW_CANVAS";

export function DashboardEditor(p: Props) {
  const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
    getEditorWrapper();

  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>(
    undefined,
  );

  // T2 (Variant B — per-entity): see DOC_STATE_MGT_PROJECT.md.
  // createEffect reactively watches the per-entity lastUpdated key. SSE pushes a
  // new value when this dashboard (or its items) changes, triggering a refetch.
  // No setData({ status: "loading" }) inside the effect — stale data stays
  // visible until fresh data arrives. No manual refresh() after mutations —
  // SSE drives invalidation.
  const [data, setData] = createSignal<StateHolder<DashboardDetail>>({
    status: "loading",
  });
  createEffect(async () => {
    const _v = projectState.lastUpdated.dashboards[p.dashboardId]; // reactive
    const res = await getDashboardDetailFromCacheOrFetch(
      p.projectId,
      p.dashboardId,
    );
    if (res.success) {
      setData({ status: "ready", data: res.data });
    } else {
      setData({ status: "error", err: res.err });
    }
  });

  const canConfigure = () =>
    projectState.thisUserPermissions.can_configure_slide_decks &&
    !projectState.isLocked;

  async function attemptAddItem() {
    // Step 1: open the existing visualization selector
    const selection = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
    if (!selection) return;

    // Step 2: look up viz label + check if it has replicants
    const poRes = await getPODetailFromCacheorFetch(
      p.projectId,
      selection.visualizationId,
    );
    if (!poRes.success) {
      await openAlert({ text: poRes.err, intent: "danger" });
      return;
    }

    const vizSummary = projectState.visualizations.find(
      (v) => v.id === selection.visualizationId,
    );
    const visualizationLabel = vizSummary?.label ?? "Visualization";

    const replicateBy = getReplicateByProp(poRes.data.config);
    let allReplicants: string[] = [];

    if (replicateBy) {
      // Fetch the replicant value list so the modal can offer "add all"
      const config: PresentationObjectConfig = structuredClone(
        poRes.data.config,
      );
      if (selection.replicant) {
        config.d.selectedReplicantValue = selection.replicant;
      }
      const resInfo =
        await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
          p.projectId,
          poRes.data.resultsValue.id,
        );
      if (!resInfo.success) {
        await openAlert({ text: resInfo.err, intent: "danger" });
        return;
      }
      const fcRes = getFetchConfigFromPresentationObjectConfig(
        poRes.data.resultsValue,
        config,
      );
      if (!fcRes.success) {
        await openAlert({ text: fcRes.err, intent: "danger" });
        return;
      }
      const optRes = await getReplicantOptionsFromCacheOrFetch(
        p.projectId,
        poRes.data.resultsValue.resultsObjectId,
        replicateBy,
        fcRes.data,
      );
      if (
        optRes.success &&
        optRes.data.status === "ok"
      ) {
        allReplicants = optRes.data.possibleValues;
      }
    }

    // Step 3: confirmation modal (single vs all replicants, plus progress).
    // SSE drives the view update — no manual refresh.
    await openComponent({
      element: AddDashboardItemConfirmModal,
      props: {
        projectId: p.projectId,
        dashboardId: p.dashboardId,
        visualizationId: selection.visualizationId,
        visualizationLabel,
        selectedReplicant: selection.replicant,
        allReplicants,
      },
    });
  }

  async function attemptDeleteItem(item: DashboardItem) {
    const deleteAction = timActionDelete(
      t3({
        en: `Delete "${item.label}"?`,
        fr: `Supprimer « ${item.label} » ?`,
      }),
      async () =>
        serverActions.deleteDashboardItem({
          projectId: p.projectId,
          dashboard_id: p.dashboardId,
          item_id: item.id,
        }),
    );
    await deleteAction.click();
  }

  async function handleReorder(oldIds: string[], newIds: string[]) {
    if (newIds.length !== oldIds.length) return;
    if (newIds.every((id, i) => id === oldIds[i])) return;

    // Identify the moved block and target position (same logic as moveSlides)
    const movedIds: string[] = [];
    let targetPosition:
      | { after: string }
      | { before: string }
      | { toStart: true }
      | { toEnd: true }
      | null = null;

    for (let i = 0; i < newIds.length; i++) {
      const atNew = newIds[i];
      const atOld = oldIds[i];
      if (atNew !== atOld) {
        const oldIndex = oldIds.indexOf(atNew);
        if (oldIndex !== i) {
          let j = i;
          while (j < newIds.length && oldIds.indexOf(newIds[j]) !== j) {
            movedIds.push(newIds[j]);
            j++;
          }
          if (i === 0) {
            targetPosition = { toStart: true };
          } else {
            targetPosition = { after: newIds[i - 1] };
          }
          break;
        }
      }
    }

    if (movedIds.length === 0 || !targetPosition) return;

    const res = await serverActions.moveDashboardItems({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      itemIds: movedIds,
      position: targetPosition,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
    }
    // On success: SSE delivers the updated lastUpdated and the createEffect
    // refetches automatically. No manual refresh needed.
  }

  async function updateLabel(itemId: string, newLabel: string) {
    const res = await serverActions.updateDashboardItem({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      item_id: itemId,
      label: newLabel,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
    }
    // On success: SSE drives the view update.
  }

  function publicUrl(slug: string) {
    return `${window.location.origin}/d/${p.projectId}/${slug}`;
  }

  async function openSettings(dashboard: DashboardDetail) {
    // SSE drives the view update after save — no manual refresh.
    await openComponent({
      element: DashboardSettingsModal,
      props: {
        projectId: p.projectId,
        dashboardId: p.dashboardId,
        initialTitle: dashboard.title,
        initialSlug: dashboard.slug,
        initialIsPublic: dashboard.isPublic,
        initialLayout: dashboard.layout,
      },
    });
  }

  return (
    <InnerEditorWrapper>
    <FrameTop
      panelChildren={
        <StateHolderWrapper state={data()} noPad>
          {(dashboard) => (
            <HeadingBar heading={dashboard.title} class="border-base-300">
              <div class="ui-gap-sm flex items-center">
                <CopyToClipboardButton
                  text={publicUrl(dashboard.slug)}
                  outline
                  size="sm"
                >
                  {t3({ en: "Copy link", fr: "Copier le lien" })}
                </CopyToClipboardButton>
                <Show when={canConfigure()}>
                  <Button onClick={attemptAddItem} iconName="plus">
                    {t3({ en: "Add item", fr: "Ajouter un élément" })}
                  </Button>
                  <Button
                    onClick={() => openSettings(dashboard)}
                    iconName="settings"
                    outline
                  >
                    {t3({ en: "Settings", fr: "Paramètres" })}
                  </Button>
                </Show>
                <Button onClick={() => p.close(undefined)} iconName="x" outline>
                  {t3({ en: "Close", fr: "Fermer" })}
                </Button>
              </div>
            </HeadingBar>
          )}
        </StateHolderWrapper>
      }
    >
      <StateHolderWrapper state={data()}>
        {(dashboard) => (
          <DashboardEditorInner
            dashboard={dashboard}
            selectedItemId={selectedItemId()}
            setSelectedItemId={setSelectedItemId}
            canConfigure={canConfigure()}
            onReorder={handleReorder}
            onUpdateLabel={updateLabel}
            onDelete={attemptDeleteItem}
          />
        )}
      </StateHolderWrapper>
    </FrameTop>
    </InnerEditorWrapper>
  );
}

type InnerProps = {
  dashboard: DashboardDetail;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  canConfigure: boolean;
  onReorder: (oldIds: string[], newIds: string[]) => Promise<void>;
  onUpdateLabel: (itemId: string, label: string) => Promise<void>;
  onDelete: (item: DashboardItem) => Promise<void>;
};

function DashboardEditorInner(p: InnerProps) {
  // Auto-select first item when dashboard loads
  createEffect(() => {
    const items = p.dashboard.items;
    const current = p.selectedItemId;
    if (items.length === 0) {
      p.setSelectedItemId(undefined);
    } else if (!current || !items.find((x) => x.id === current)) {
      p.setSelectedItemId(items[0].id);
    }
  });

  const currentItem = createMemo(() =>
    p.dashboard.items.find((x) => x.id === p.selectedItemId),
  );

  return (
    <FrameLeftResizable
      startingWidth={260}
      minWidth={220}
      maxWidth={400}
      hoverOffset="offset-for-border-1-on-left"
      panelChildren={
        <div class="border-base-300 flex h-full w-full flex-col border-r">
          <div class="border-base-300 ui-pad border-b text-sm font-semibold">
            {p.dashboard.items.length}{" "}
            {p.dashboard.items.length === 1
              ? t3({ en: "item", fr: "élément" })
              : t3({ en: "items", fr: "éléments" })}
          </div>
          <div class="flex-1 overflow-auto p-2">
            <DashboardItemList
              items={p.dashboard.items}
              selectedItemId={p.selectedItemId}
              setSelectedItemId={(id) => p.setSelectedItemId(id)}
              canConfigure={p.canConfigure}
              onReorder={p.onReorder}
              onUpdateLabel={p.onUpdateLabel}
              onDelete={p.onDelete}
            />
          </div>
        </div>
      }
    >
      <div class="h-full w-full p-4">
        <Show
          when={currentItem()}
          keyed
          fallback={
            <div class="text-neutral text-sm">
              {t3({
                en: "Select an item to preview",
                fr: "Sélectionnez un élément pour l'aperçu",
              })}
            </div>
          }
        >
          {(item) => <DashboardItemPreview item={item} />}
        </Show>
      </div>
    </FrameLeftResizable>
  );
}

function DashboardItemPreview(p: { item: DashboardItem }) {
  const validSource = createMemo(() => {
    const source = p.item.figureBlock.source;
    const fi = p.item.figureBlock.figureInputs;
    if (!fi || !source || source.type !== "from_data") return undefined;
    return { source, fi };
  });

  return (
    <Show
      when={validSource()}
      keyed
      fallback={
        <div class="text-neutral text-sm">
          {t3({
            en: "This item has no rendered figure data.",
            fr: "Cet élément ne contient pas de données de figure.",
          })}
        </div>
      }
    >
      {(v) => (
        <ChartHolder
          canvasElementId={`${CANVAS_ID}_${p.item.id}`}
          chartInputs={hydrateFigureInputsForPublicRendering(
            v.fi,
            {
              config: v.source.config,
              metricId: v.source.metricId,
              formatAs: "number",
              indicatorMetadata: v.source.indicatorMetadata,
            },
            p.item.geoData,
          )}
          height={"flex"}
        />
      )}
    </Show>
  );
}
