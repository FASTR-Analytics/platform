import {
  DashboardDetail,
  DashboardItem,
  DashboardItemGroup,
  FigureBlock,
  PresentationObjectConfig,
  PublicDashboardEntry,
  ResultsValue,
  getReplicateByProp,
  getFetchConfigFromPresentationObjectConfig,
  t3,
} from "lib";
import {
  Button,
  CopyToClipboardButton,
  EditorComponentProps,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  MenuItem,
  StateHolder,
  StateHolderWrapper,
  createSelectionController,
  getEditorWrapper,
  openAlert,
  openComponent,
  showMenu,
  timActionDelete,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import { setShowAi, showAi } from "~/state/t4_ui";
import { getDashboardDetailFromCacheOrFetch } from "~/state/project/t2_dashboards";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { serverActions } from "~/server_actions";
import { SelectVisualizationForSlide } from "~/components/slide_deck/select_visualization_for_slide";
import { resolveFigureAndGeoFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import { VisualizationEditor } from "~/components/visualization";
import { AddVisualization } from "~/components/project/add_visualization";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";
import {
  getFigureInputsFromPresentationObject,
  stripFigureInputsForStorage,
} from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { AddDashboardItemConfirmModal } from "./add_dashboard_item_modal";
import {
  DashboardSettings,
  type DashboardSettingsProps,
} from "./dashboard_settings";
import {
  DashboardItemGrid,
  type DashboardGridEntry,
} from "./dashboard_item_grid";
import { DashboardItemEditor } from "./dashboard_item_editor";
import { DashboardGroupEditor } from "./dashboard_group_editor";
import { buildDashboardBundle } from "./build_dashboard_bundle";

type Props = EditorComponentProps<
  {
    projectId: string;
    dashboardId: string;
    title: string;
  },
  undefined
>;

type ItemMovePosition = { toStart: true } | { after: string };

// Detect the single item that moved between two orderings (the grid drags one
// card at a time — no multiDrag). The moved item is the one whose removal makes
// the two orderings identical; its target is "after the element now preceding
// it" (or toStart). Robust where a first-index diff heuristic is not — e.g.
// dragging the first item to the end.
function computeSingleItemMove(
  oldIds: string[],
  newIds: string[],
): { id: string; position: ItemMovePosition } | undefined {
  if (oldIds.length !== newIds.length) return undefined;
  for (let idx = 0; idx < newIds.length; idx++) {
    const id = newIds[idx];
    if (oldIds[idx] === id) continue; // not displaced at this slot
    const withoutOld = oldIds.filter((x) => x !== id);
    const withoutNew = newIds.filter((x) => x !== id);
    if (
      withoutOld.length === withoutNew.length &&
      withoutOld.every((x, i) => x === withoutNew[i])
    ) {
      return {
        id,
        position: idx === 0 ? { toStart: true } : { after: newIds[idx - 1] },
      };
    }
  }
  return undefined;
}

export function DashboardEditor(p: Props) {
  const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
    getEditorWrapper();
  const {
    openEditor: openSettingsEditor,
    EditorWrapper: SettingsEditorWrapper,
  } = getEditorWrapper();

  // T2 (Variant B — per-entity): SSE pushes a new lastUpdated when this
  // dashboard (or its items) changes, triggering a refetch. Stale data stays
  // visible until fresh data arrives. No manual refresh after mutations.
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

  // Variant B (per-entity T2): the StateHolder itself retains the last ready
  // value across SSE refetches (the effect never resets to loading), so it is
  // the stale-while-revalidate holder — no separate "last ready" memo needed.
  const ready = (): DashboardDetail | undefined => {
    const d = data();
    return d.status === "ready" ? d.data : undefined;
  };

  const items = (): DashboardItem[] => ready()?.items ?? [];

  const canConfigure = () =>
    projectState.thisUserPermissions.can_configure_slide_decks &&
    !projectState.isLocked;

  // Entries collapse a replicant group's N members into one unit (standalone
  // item | group). The grid, selection and reorder all operate on entries.
  const entries = createMemo<PublicDashboardEntry[]>(() => {
    const d = ready();
    return d ? buildDashboardBundle(d).entries : [];
  });

  const gridEntries = createMemo<DashboardGridEntry[]>(() =>
    entries().map((e) => {
      if (e.kind === "item") {
        return {
          id: e.item.id,
          kind: "item" as const,
          label: e.item.label,
          thumbnail: e.item,
          count: 1,
        };
      }
      const def =
        e.members.find(
          (m) => m.replicantValue === e.group.defaultReplicantValue,
        ) ?? e.members[0];
      return {
        id: e.group.id,
        kind: "group" as const,
        label: e.group.label,
        thumbnail: def,
        count: e.members.length,
      };
    }),
  );

  // entry id → the underlying item ids it covers (a group → all member ids).
  const entryMemberIds = createMemo<Map<string, string[]>>(() => {
    const m = new Map<string, string[]>();
    for (const e of entries()) {
      if (e.kind === "item") m.set(e.item.id, [e.item.id]);
      else
        m.set(
          e.group.id,
          e.members.map((x) => x.id),
        );
    }
    return m;
  });

  // Selection — same mechanism as the dashboard list and slide grid: multi
  // select (click / shift-range / cmd-toggle / circle), keyed by ENTRY id.
  const selection = createSelectionController<string>({
    ids: () => gridEntries().map((e) => e.id),
    mode: "multi",
  });

  const selectedEntryId = () =>
    selection.selectedCount() === 1 ? selection.selectedId() : undefined;

  const selectedItem = createMemo<DashboardItem | undefined>(() =>
    items().find((i) => i.id === selectedEntryId()),
  );

  const selectedGroup = createMemo<DashboardItemGroup | undefined>(() =>
    (ready()?.groups ?? []).find((g) => g.id === selectedEntryId()),
  );

  function publicUrl(slug: string) {
    return `${window.location.origin}/d/${slug}`;
  }

  // Regenerate a FigureBlock (+ geojson) from a results value + config — shared
  // by Edit and Create.
  async function buildFigureBlock(
    resultsValue: ResultsValue,
    config: PresentationObjectConfig,
  ): Promise<
    | { ok: true; figureBlock: FigureBlock; geoData: unknown }
    | { ok: false; err: string }
  > {
    const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
      p.projectId,
      {
        id: "",
        projectId: p.projectId,
        lastUpdated: "",
        label: "Ephemeral",
        resultsValue,
        config,
        isDefault: false,
        folderId: null,
      },
      config,
    );
    if (!itemsRes.success || itemsRes.data.ih.status !== "ok") {
      return { ok: false, err: "Failed to generate visualization" };
    }
    const ih = itemsRes.data.ih;
    let geoJson;
    const mapLevel = getAdminAreaLevelFromMapConfig(config);
    if (mapLevel) geoJson = getGeoJsonSync(mapLevel);
    const fi = getFigureInputsFromPresentationObject(
      resultsValue,
      ih,
      config,
      geoJson,
    );
    if (fi.status !== "ready") {
      return {
        ok: false,
        err: fi.status === "error" ? fi.err : "Failed to generate figure",
      };
    }
    return {
      ok: true,
      figureBlock: {
        type: "figure",
        figureInputs: structuredClone(stripFigureInputsForStorage(fi.data)),
        source: {
          type: "from_data",
          metricId: resultsValue.id,
          config,
          snapshotAt: new Date().toISOString(),
          indicatorMetadata: ih.indicatorMetadata,
        },
      },
      geoData: geoJson,
    };
  }

  async function persistFigureBlock(
    itemId: string,
    figureBlock: FigureBlock,
    geoData: unknown,
  ) {
    const res = await serverActions.updateDashboardItem({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      item_id: itemId,
      figureBlock,
      geoData,
    });
    if (!res.success) await openAlert({ text: res.err, intent: "danger" });
  }

  async function attemptAddItem() {
    const selResult = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
    if (!selResult) return;

    const poRes = await getPODetailFromCacheorFetch(
      p.projectId,
      selResult.visualizationId,
    );
    if (!poRes.success) {
      await openAlert({ text: poRes.err, intent: "danger" });
      return;
    }

    const vizSummary = projectState.visualizations.find(
      (v) => v.id === selResult.visualizationId,
    );
    const visualizationLabel = vizSummary?.label ?? "Visualization";

    const replicateBy = getReplicateByProp(poRes.data.config);
    let allReplicants: { value: string; label: string }[] = [];

    if (replicateBy) {
      const config: PresentationObjectConfig = structuredClone(
        poRes.data.config,
      );
      if (selResult.replicant) {
        config.d.selectedReplicantValue = selResult.replicant;
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
      if (optRes.success && optRes.data.status === "ok") {
        allReplicants = optRes.data.possibleValues.map((pv) => ({
          value: pv.id,
          label: pv.label,
        }));
      }
    }

    await openComponent({
      element: AddDashboardItemConfirmModal,
      props: {
        projectId: p.projectId,
        dashboardId: p.dashboardId,
        visualizationId: selResult.visualizationId,
        visualizationLabel,
        selectedReplicant: selResult.replicant,
        replicateBy: replicateBy ?? undefined,
        allReplicants,
      },
    });
  }

  // Delete one or more ENTRIES — dispatched by kind (a group entry id is not a
  // row id, so it must go through deleteDashboardItemGroup, which cascades).
  async function deleteEntries(entryIds: string[]) {
    if (entryIds.length === 0) return;
    const all = gridEntries();
    const kindOf = new Map(all.map((e) => [e.id, e.kind]));
    const labelOf = new Map(all.map((e) => [e.id, e.label]));
    const confirmText =
      entryIds.length > 1
        ? t3({
            en: `Delete ${entryIds.length} items?`,
            fr: `Supprimer ${entryIds.length} éléments ?`,
          })
        : t3({
            en: `Delete "${labelOf.get(entryIds[0]) ?? ""}"?`,
            fr: `Supprimer « ${labelOf.get(entryIds[0]) ?? ""} » ?`,
          });
    const deleteAction = timActionDelete(
      confirmText,
      async () => {
        const results = await Promise.all(
          entryIds.map((id) =>
            kindOf.get(id) === "group"
              ? serverActions.deleteDashboardItemGroup({
                  projectId: p.projectId,
                  dashboard_id: p.dashboardId,
                  group_id: id,
                })
              : serverActions.deleteDashboardItem({
                  projectId: p.projectId,
                  dashboard_id: p.dashboardId,
                  item_id: id,
                }),
          ),
        );
        return results.find((r) => !r.success) ?? results[0];
      },
      () => selection.clear(),
    );
    await deleteAction.click();
  }

  // Reorder operates on ENTRIES. The moved entry's member ids move as a block,
  // anchored after the previous entry's LAST member (or to the start).
  async function handleReorder(orderedEntryIds: string[]) {
    const oldEntryIds = gridEntries().map((e) => e.id);
    const move = computeSingleItemMove(oldEntryIds, orderedEntryIds);
    if (!move) return;
    const memberMap = entryMemberIds();
    const movedIds = memberMap.get(move.id) ?? [];
    if (movedIds.length === 0) return;
    let position: { toStart: true } | { after: string };
    if ("after" in move.position) {
      const anchorMembers = memberMap.get(move.position.after) ?? [];
      const last = anchorMembers[anchorMembers.length - 1];
      if (!last) return;
      position = { after: last };
    } else {
      position = { toStart: true };
    }
    const res = await serverActions.moveDashboardItems({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      itemIds: movedIds,
      position,
    });
    if (!res.success) await openAlert({ text: res.err, intent: "danger" });
  }

  async function handleUpdateLabel(itemId: string, label: string) {
    const res = await serverActions.updateDashboardItem({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      item_id: itemId,
      label,
    });
    if (!res.success) await openAlert({ text: res.err, intent: "danger" });
  }

  async function handleSwitch() {
    const it = selectedItem();
    if (!it) return;
    const sel = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
    if (!sel) return;
    try {
      const { figureBlock, geoData } =
        await resolveFigureAndGeoFromVisualization(p.projectId, {
          type: "from_visualization",
          visualizationId: sel.visualizationId,
          replicant: sel.replicant,
        });
      await persistFigureBlock(it.id, figureBlock, geoData);
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to switch visualization",
        intent: "danger",
      });
    }
  }

  async function handleEdit() {
    const it = selectedItem();
    if (!it) return;
    const source = it.figureBlock.source;
    if (!source || source.type !== "from_data") return;
    const resultsValue = projectState.metrics.find(
      (m) => m.id === source.metricId,
    );
    if (!resultsValue) {
      await openAlert({
        text: "Metric not found in project",
        intent: "danger",
      });
      return;
    }
    const result = await openInnerEditor({
      element: VisualizationEditor,
      props: {
        mode: "ephemeral" as const,
        label: resultsValue.label,
        projectId: p.projectId,
        ...snapshotForVizEditor({
          projectState,
          resultsValue,
          config: source.config,
        }),
      },
    });
    if (!result?.updated) return;
    const built = await buildFigureBlock(resultsValue, result.updated.config);
    if (!built.ok) {
      await openAlert({ text: built.err, intent: "danger" });
      return;
    }
    await persistFigureBlock(it.id, built.figureBlock, built.geoData);
  }

  async function handleCreate() {
    const it = selectedItem();
    if (!it) return;
    const result = await openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectId,
        metrics: projectState.metrics,
        modules: projectState.projectModules,
      },
    });
    if (!result) return;
    const built = await buildFigureBlock(result.resultsValue, result.config);
    if (!built.ok) {
      await openAlert({ text: built.err, intent: "danger" });
      return;
    }
    await persistFigureBlock(it.id, built.figureBlock, built.geoData);
  }

  // ── Group handlers (the selected entry is a replicant group) ───────────────

  async function handleGroupRename(label: string) {
    const g = selectedGroup();
    if (!g) return;
    const res = await serverActions.updateDashboardItemGroup({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      group_id: g.id,
      label,
    });
    if (!res.success) await openAlert({ text: res.err, intent: "danger" });
  }

  async function handleGroupSetDefault(value: string) {
    const g = selectedGroup();
    if (!g) return;
    const res = await serverActions.updateDashboardItemGroup({
      projectId: p.projectId,
      dashboard_id: p.dashboardId,
      group_id: g.id,
      defaultReplicantValue: value,
    });
    if (!res.success) await openAlert({ text: res.err, intent: "danger" });
  }

  // Re-resolve every member of the group from a new visualization (Switch) or a
  // tweaked config (Edit), then persist in one transaction.
  async function persistGroupMembers(
    g: DashboardItemGroup,
    resolveOne: (
      replicantValue: string,
    ) => Promise<{ figureBlock: FigureBlock; geoData?: unknown }>,
  ) {
    try {
      const members: { replicantValue: string; figureBlock: FigureBlock }[] =
        [];
      let sharedGeoData: unknown = undefined;
      for (const r of g.replicants) {
        const { figureBlock, geoData } = await resolveOne(r.value);
        members.push({ replicantValue: r.value, figureBlock });
        if (sharedGeoData === undefined && geoData !== undefined) {
          sharedGeoData = geoData;
        }
      }
      const res = await serverActions.updateDashboardItemGroup({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        group_id: g.id,
        geoData: sharedGeoData,
        members,
      });
      if (!res.success) await openAlert({ text: res.err, intent: "danger" });
    } catch (err) {
      await openAlert({
        text: err instanceof Error ? err.message : "Failed to update group",
        intent: "danger",
      });
    }
  }

  async function handleGroupSwitch() {
    const g = selectedGroup();
    if (!g) return;
    const sel = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
    if (!sel) return;
    await persistGroupMembers(g, (replicantValue) =>
      resolveFigureAndGeoFromVisualization(p.projectId, {
        type: "from_visualization",
        visualizationId: sel.visualizationId,
        replicant: replicantValue,
      }),
    );
  }

  async function handleGroupEdit() {
    const g = selectedGroup();
    if (!g) return;
    const member = items().find((i) => i.replicantGroupId === g.id);
    const source = member?.figureBlock.source;
    if (!source || source.type !== "from_data") return;
    const resultsValue = projectState.metrics.find(
      (m) => m.id === source.metricId,
    );
    if (!resultsValue) {
      await openAlert({
        text: "Metric not found in project",
        intent: "danger",
      });
      return;
    }
    const result = await openInnerEditor({
      element: VisualizationEditor,
      props: {
        mode: "ephemeral" as const,
        label: resultsValue.label,
        projectId: p.projectId,
        ...snapshotForVizEditor({
          projectState,
          resultsValue,
          config: source.config,
        }),
      },
    });
    if (!result?.updated) return;
    const baseConfig = result.updated.config;
    await persistGroupMembers(g, async (replicantValue) => {
      const config: PresentationObjectConfig = structuredClone(baseConfig);
      if (getReplicateByProp(config)) {
        config.d.selectedReplicantValue = replicantValue;
      }
      const built = await buildFigureBlock(resultsValue, config);
      if (!built.ok) throw new Error(built.err);
      return { figureBlock: built.figureBlock, geoData: built.geoData };
    });
  }

  function handleEntryContextMenu(e: MouseEvent, entryId: string) {
    e.preventDefault();
    if (!canConfigure()) return;
    const ids = selection.getBatchIds(entryId);
    const menuItems: MenuItem[] = [
      {
        label:
          ids.length > 1
            ? t3({
                en: `Delete ${ids.length} items`,
                fr: `Supprimer ${ids.length} éléments`,
              })
            : t3({ en: "Delete", fr: "Supprimer" }),
        icon: "trash",
        intent: "danger",
        onClick: () => deleteEntries(ids),
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: menuItems,
    });
  }

  async function openSettings(dashboard: DashboardDetail) {
    await openSettingsEditor<DashboardSettingsProps, { saved: true }>({
      element: DashboardSettings,
      props: {
        projectId: p.projectId,
        dashboardId: p.dashboardId,
        initialTitle: dashboard.title,
        initialSlug: dashboard.slug,
        initialIsPublic: dashboard.isPublic,
        initialLayout: dashboard.layout,
        initialConfig: dashboard.config,
      },
    });
  }

  return (
    <SettingsEditorWrapper>
      <InnerEditorWrapper>
        <StateHolderWrapper state={data()}>
          {(dashboard) => (
            <FrameTop
              panelChildren={
                <HeadingBar
                  heading={dashboard.title}
                  class="border-base-300"
                  leftChildren={
                    <Button
                      iconName="chevronLeft"
                      onClick={() => p.close(undefined)}
                    />
                  }
                >
                  <div class="ui-gap-sm flex items-center">
                    <Button
                      onClick={() =>
                        window.open(publicUrl(dashboard.slug), "_blank")
                      }
                      iconName="eye"
                      outline
                    >
                      {t3({ en: "Preview", fr: "Aperçu" })}
                    </Button>
                    <CopyToClipboardButton
                      text={publicUrl(dashboard.slug)}
                      outline
                    >
                      {t3({ en: "Copy link", fr: "Copier le lien" })}
                    </CopyToClipboardButton>
                    <Show when={canConfigure()}>
                      <Button
                        onClick={() => openSettings(dashboard)}
                        iconName="settings"
                        outline
                      >
                        {t3({ en: "Settings", fr: "Paramètres" })}
                      </Button>
                      <Button onClick={attemptAddItem} iconName="plus">
                        {t3({ en: "Add item", fr: "Ajouter un élément" })}
                      </Button>
                    </Show>
                    <Show when={!showAi()}>
                      <Button
                        onClick={() => setShowAi(true)}
                        iconName="chevronLeft"
                        outline
                      >
                        {t3({ en: "AI", fr: "IA" })}
                      </Button>
                    </Show>
                  </div>
                </HeadingBar>
              }
            >
              <FrameLeftResizable
                startingWidth={300}
                minWidth={240}
                maxWidth={460}
                hoverOffset="offset-for-border-1-on-left"
                panelChildren={
                  <div class="border-base-300 flex h-full w-full flex-col border-r">
                    <Show
                      when={selectedGroup()}
                      fallback={
                        <DashboardItemEditor
                          item={selectedItem()}
                          selectedCount={selection.selectedCount()}
                          canConfigure={canConfigure()}
                          onUpdateLabel={handleUpdateLabel}
                          onEdit={handleEdit}
                          onSwitch={handleSwitch}
                          onCreate={handleCreate}
                          onDelete={() => {
                            const it = selectedItem();
                            if (it) deleteEntries([it.id]);
                          }}
                        />
                      }
                    >
                      {(g) => (
                        <DashboardGroupEditor
                          group={g()}
                          canConfigure={canConfigure()}
                          onUpdateLabel={handleGroupRename}
                          onSetDefaultReplicant={handleGroupSetDefault}
                          onSwitch={handleGroupSwitch}
                          onEdit={handleGroupEdit}
                          onDelete={() => deleteEntries([g().id])}
                        />
                      )}
                    </Show>
                  </div>
                }
              >
                <div class="bg-base-200 h-full w-full">
                  <DashboardItemGrid
                    entries={gridEntries()}
                    selection={selection}
                    canConfigure={canConfigure()}
                    onReorder={handleReorder}
                    onContextMenu={handleEntryContextMenu}
                  />
                </div>
              </FrameLeftResizable>
            </FrameTop>
          )}
        </StateHolderWrapper>
      </InnerEditorWrapper>
    </SettingsEditorWrapper>
  );
}
