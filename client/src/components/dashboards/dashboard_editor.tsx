import {
  DashboardDetail,
  DashboardItem,
  DashboardItemGroup,
  FigureBlock,
  PresentationObjectConfig,
  PublicDashboardEntry,
  ResultsValue,
  getReplicateByProp,
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
} from "~/state/project/t2_presentation_objects";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { serverActions } from "~/server_actions";
import { SelectVisualizationForSlide } from "~/components/slide_deck/select_visualization_for_slide";
import { VisualizationEditor } from "~/components/visualization";
import { AddVisualization } from "~/components/project/add_visualization";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";
import {
  getFigureInputsFromPresentationObject,
  stripFigureInputsForStorage,
} from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { AddDashboardItemConfirmModal } from "./add_dashboard_item_modal";
import { resolveReplicantStructure } from "./resolve_replicant_structure";
import { resolveMembersWithProgress } from "./resolve_members_with_progress";
import { ReshapeConfirmModal } from "./reshape_confirm_modal";
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

// Order-insensitive equality of two replicant option sets (by value).
function sameReplicantValueSet(
  a: { value: string }[],
  b: { value: string }[],
): boolean {
  if (a.length !== b.length) return false;
  const av = new Set(a.map((x) => x.value));
  return b.every((x) => av.has(x.value));
}

// A reshape mode's worker: resolves figures (reporting progress) then persists,
// returning a plain success/err the confirm modal can surface.
type ReshapeRun = (
  report: (frac: number, msg: string) => void,
) => Promise<{ success: true } | { success: false; err: string }>;

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

    const config: PresentationObjectConfig = structuredClone(poRes.data.config);
    if (selResult.replicant) {
      config.d.selectedReplicantValue = selResult.replicant;
    }

    let replicateBy: string | undefined;
    let allReplicants: { value: string; label: string }[] = [];
    try {
      const structure = await resolveReplicantStructure(
        p.projectId,
        poRes.data.resultsValue,
        config,
      );
      if (structure) {
        replicateBy = structure.replicateBy;
        allReplicants = structure.replicants;
      }
    } catch (err) {
      await openAlert({
        text: err instanceof Error ? err.message : String(err),
        intent: "danger",
      });
      return;
    }

    await openComponent({
      element: AddDashboardItemConfirmModal,
      props: {
        projectId: p.projectId,
        dashboardId: p.dashboardId,
        visualizationId: selResult.visualizationId,
        visualizationLabel,
        selectedReplicant: selResult.replicant,
        replicateBy,
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
    const poRes = await getPODetailFromCacheorFetch(
      p.projectId,
      sel.visualizationId,
    );
    if (!poRes.success) {
      await openAlert({ text: poRes.err, intent: "danger" });
      return;
    }
    const after = structuredClone(poRes.data.config);
    if (sel.replicant) {
      after.d.selectedReplicantValue = sel.replicant;
    }
    const oldSource = it.figureBlock.source;
    const oldConfig =
      oldSource?.type === "from_data" ? oldSource.config : undefined;
    // The switch modal forces a single replicant pick for replicant vizes, so a
    // switch never expands an item — it stays a single item showing the picked
    // replicant. Treat an explicit pick like an existing replicant dimension.
    await reconcileItemStructure(
      it,
      poRes.data.resultsValue,
      after,
      oldConfig?.d.selectedReplicantValue,
      !!sel.replicant || (!!oldConfig && !!getReplicateByProp(oldConfig)),
    );
  }

  // Confirm + progress for a structural change. The modal is only ever shown for
  // a replace (expand / collapse / rebuild), so a confirmed run always gives the
  // entry a fresh id → drop the now-stale selection.
  async function openReshape(opts: { message: string; run: ReshapeRun }) {
    const res = await openComponent({
      element: ReshapeConfirmModal,
      props: opts,
    });
    if (res?.ok) selection.clear();
  }

  // Resolve every replicant into a group and replace the old entry in place.
  function groupRun(args: {
    oldEntry:
      | { kind: "item"; itemId: string }
      | { kind: "group"; groupId: string };
    label: string;
    resultsValue: ResultsValue;
    after: PresentationObjectConfig;
    structure: {
      replicateBy: string;
      replicants: { value: string; label: string }[];
    };
    defaultReplicantValue: string;
  }): ReshapeRun {
    return async (report) => {
      let resolved;
      try {
        resolved = await resolveMembersWithProgress(
          args.structure.replicants,
          async (replicantValue) => {
            const config = structuredClone(args.after);
            config.d.selectedReplicantValue = replicantValue;
            const built = await buildFigureBlock(args.resultsValue, config);
            if (!built.ok) throw new Error(built.err);
            return { figureBlock: built.figureBlock, geoData: built.geoData };
          },
          report,
        );
      } catch (err) {
        return {
          success: false as const,
          err: err instanceof Error ? err.message : String(err),
        };
      }
      report(0.95, "Saving group...");
      const res = await serverActions.replaceDashboardEntry({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        oldEntry: args.oldEntry,
        newEntry: {
          kind: "group",
          label: args.label,
          replicateBy: args.structure.replicateBy,
          defaultReplicantValue: args.defaultReplicantValue,
          replicants: args.structure.replicants,
          geoData: resolved.sharedGeoData,
          members: resolved.members,
        },
      });
      return res.success
        ? { success: true as const }
        : { success: false as const, err: res.err };
    };
  }

  // Re-resolve a group's existing members from a tweaked config and update them
  // in place (unchanged dimension + set → no structure change, no dialog).
  async function updateGroupInPlace(
    g: DashboardItemGroup,
    resultsValue: ResultsValue,
    after: PresentationObjectConfig,
  ) {
    try {
      const { members, sharedGeoData } = await resolveMembersWithProgress(
        g.replicants,
        async (replicantValue) => {
          const config = structuredClone(after);
          config.d.selectedReplicantValue = replicantValue;
          const built = await buildFigureBlock(resultsValue, config);
          if (!built.ok) throw new Error(built.err);
          return { figureBlock: built.figureBlock, geoData: built.geoData };
        },
        () => {},
      );
      const res = await serverActions.updateDashboardItemGroup({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        group_id: g.id,
        geoData: sharedGeoData,
        members: members.map((m) => ({
          replicantValue: m.replicantValue,
          figureBlock: m.figureBlock,
        })),
      });
      if (!res.success) await openAlert({ text: res.err, intent: "danger" });
    } catch (err) {
      await openAlert({
        text: err instanceof Error ? err.message : String(err),
        intent: "danger",
      });
    }
  }

  // Build one figure for the previewed replicant; collapse a group into a single
  // item, replacing it in place.
  function collapseRun(
    groupId: string,
    label: string,
    resultsValue: ResultsValue,
    after: PresentationObjectConfig,
  ): ReshapeRun {
    return async (report) => {
      report(0.3, "Resolving figure...");
      const built = await buildFigureBlock(resultsValue, after);
      if (!built.ok) return { success: false as const, err: built.err };
      report(0.95, "Saving...");
      const res = await serverActions.replaceDashboardEntry({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        oldEntry: { kind: "group", groupId },
        newEntry: {
          kind: "item",
          label,
          figureBlock: built.figureBlock,
          geoData: built.geoData,
        },
      });
      return res.success
        ? { success: true as const }
        : { success: false as const, err: res.err };
    };
  }

  // Reconciliation for a standalone ITEM (shared by edit + switch). The entry
  // expands into a group only when it *gains* a replicant dimension (a plain item
  // you add a replicant to). An item that already showed a single replicant — or
  // never had one — stays a single item, refreshed in place (so an Add "single"
  // item survives editing). `oldSelectedReplicantValue` is the prior pick, the
  // group default fallback; `oldHadReplicant` is whether the stored config already
  // had a replicant dimension.
  async function reconcileItemStructure(
    it: DashboardItem,
    resultsValue: ResultsValue,
    after: PresentationObjectConfig,
    oldSelectedReplicantValue: string | undefined,
    oldHadReplicant: boolean,
  ) {
    async function refreshInPlace() {
      // If an edit cleared the replicant pick (e.g. re-toggling the disaggregator),
      // keep showing the previously-picked replicant rather than silently falling
      // through to the fetch layer's auto-pick (the first option).
      if (
        oldSelectedReplicantValue &&
        getReplicateByProp(after) &&
        !after.d.selectedReplicantValue
      ) {
        after.d.selectedReplicantValue = oldSelectedReplicantValue;
      }
      const built = await buildFigureBlock(resultsValue, after);
      if (!built.ok) {
        await openAlert({ text: built.err, intent: "danger" });
        return;
      }
      await persistFigureBlock(it.id, built.figureBlock, built.geoData);
    }

    const gainedReplicant = !!getReplicateByProp(after) && !oldHadReplicant;
    if (!gainedReplicant) {
      await refreshInPlace();
      return;
    }

    let structure;
    try {
      structure = await resolveReplicantStructure(
        p.projectId,
        resultsValue,
        after,
      );
    } catch (err) {
      await openAlert({
        text: err instanceof Error ? err.message : String(err),
        intent: "danger",
      });
      return;
    }
    // No options resolved → plain item refresh (don't make an empty group).
    if (!structure || structure.replicants.length === 0) {
      await refreshInPlace();
      return;
    }

    const set = new Set(structure.replicants.map((r) => r.value));
    const defaultReplicantValue =
      oldSelectedReplicantValue && set.has(oldSelectedReplicantValue)
        ? oldSelectedReplicantValue
        : structure.replicants[0].value;

    await openReshape({
      message: t3({
        en: `This will expand "${it.label}" into ${structure.replicants.length} replicant figures.`,
        fr: `Cela créera ${structure.replicants.length} figures de réplicants à partir de « ${it.label} ».`,
      }),
      run: groupRun({
        oldEntry: { kind: "item", itemId: it.id },
        label: it.label,
        resultsValue,
        after,
        structure,
        defaultReplicantValue,
      }),
    });
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
      await openAlert({ text: "Metric not found in project", intent: "danger" });
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
    await reconcileItemStructure(
      it,
      resultsValue,
      result.updated.config,
      source.config.d.selectedReplicantValue,
      !!getReplicateByProp(source.config),
    );
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

  async function handleGroupSwitch() {
    const g = selectedGroup();
    if (!g) return;
    const sel = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
    if (!sel) return;
    const poRes = await getPODetailFromCacheorFetch(
      p.projectId,
      sel.visualizationId,
    );
    if (!poRes.success) {
      await openAlert({ text: poRes.err, intent: "danger" });
      return;
    }
    const after = structuredClone(poRes.data.config);
    if (sel.replicant) {
      after.d.selectedReplicantValue = sel.replicant;
    }
    await reconcileGroupStructure(g, poRes.data.resultsValue, after);
  }

  // Reconciliation for a replicant GROUP (shared by edit + switch). No replicant
  // dimension → confirm + collapse to a single item. Same dimension + set → update
  // members in place (no dialog). Different dimension or set → confirm + rebuild.
  async function reconcileGroupStructure(
    g: DashboardItemGroup,
    resultsValue: ResultsValue,
    after: PresentationObjectConfig,
  ) {
    async function confirmCollapse() {
      await openReshape({
        message: t3({
          en: `This will collapse "${g.label}" into a single figure.`,
          fr: `Cela regroupera « ${g.label} » en une seule figure.`,
        }),
        run: collapseRun(g.id, g.label, resultsValue, after),
      });
    }

    if (!getReplicateByProp(after)) {
      await confirmCollapse();
      return;
    }

    let structure;
    try {
      structure = await resolveReplicantStructure(
        p.projectId,
        resultsValue,
        after,
      );
    } catch (err) {
      await openAlert({
        text: err instanceof Error ? err.message : String(err),
        intent: "danger",
      });
      return;
    }
    if (!structure || structure.replicants.length === 0) {
      await confirmCollapse();
      return;
    }

    // Same dimension + same option set → in-place member update (no dialog).
    if (
      structure.replicateBy === g.replicateBy &&
      sameReplicantValueSet(structure.replicants, g.replicants)
    ) {
      await updateGroupInPlace(g, resultsValue, after);
      return;
    }

    // Different dimension or changed set → rebuild the group (replace in place).
    const defaultReplicantValue =
      g.defaultReplicantValue &&
      structure.replicants.some((r) => r.value === g.defaultReplicantValue)
        ? g.defaultReplicantValue
        : structure.replicants[0].value;

    await openReshape({
      message: t3({
        en: `This will rebuild "${g.label}" as ${structure.replicants.length} replicant figures.`,
        fr: `Cela reconstruira « ${g.label} » en ${structure.replicants.length} figures de réplicants.`,
      }),
      run: groupRun({
        oldEntry: { kind: "group", groupId: g.id },
        label: g.label,
        resultsValue,
        after,
        structure,
        defaultReplicantValue,
      }),
    });
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
      await openAlert({ text: "Metric not found in project", intent: "danger" });
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
    await reconcileGroupStructure(g, resultsValue, result.updated.config);
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
