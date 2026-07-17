import { trackStore } from "@solid-primitives/deep";
import {
  getModuleIdForResultsObject,
  moduleDataVersionKey,
  projectState,
} from "~/state/project/t1_store";
import {
  FIGURE_EXPORT_WIDTH_PX,
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectState,
  ResultsValueInfoForPresentationObject,
  canonicalJson,
  getEffectivePOConfig,
  getReplicateByProp,
  hasDuplicateDisaggregatorDisplayOptions,
  materializeFigureConfig,
  normalizePOConfigForStorage,
  periodFilterHasBounds,
  type PresenceEntry,
  syncFigureConfigToMap,
  t3,
  TC,
} from "lib";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import {
  APIResponseWithData,
  Button,
  ChartHolder,
  Csv,
  FigureInputs,
  FrameLeftResizable,
  FrameTop,
  StateHolder,
  StateHolderWrapper,
  downloadCsv,
  downloadJson,
  getEditorWrapper,
  getFigureAsCanvas,
  openAlert,
  openComponent,
  saveAs,
  stringifyCsv,
  createButtonAction,
  createDeleteAction,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  createStore,
  reconcile,
  unwrap,
  type SetStoreFunction,
} from "solid-js/store";
import {
  collabState,
  openPoSession,
  otherPeers,
  type PoSession,
  setCollabView,
} from "~/state/project/collab";
import { PresenceAvatars } from "~/components/slide_deck/presence_avatars";
import { VizEditorCursors } from "~/components/_shared/cursors/viz_cursors";
import { ReplicateByOptionsPresentationObject } from "~/components/ReplicateByOptions";
import { ConflictResolutionModal } from "~/components/forms_editors/conflict_resolution_modal";
import { DownloadPresentationObject } from "~/components/forms_editors/download_presentation_object";
import { ViewResultsObject } from "~/components/forms_editors/view_results_object";
import { buildFigureInputs, makeFigureBundleFromFetchedData } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getTableExportAoa } from "~/exports/get_table_export_aoa";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import type { GeoJSONFeatureCollection } from "panther";
import { serverActions } from "~/server_actions";
import {
  getPresentationObjectItemsFromCacheOrFetch,
  getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator,
} from "~/state/project/t2_presentation_objects";
import { setShowAi, showAi } from "~/state/t4_ui";
import type {
  CreateModeReturn,
  EditModeReturn,
  EphemeralModeReturn,
  VizFigureCollabBinding,
} from ".";
import { DuplicateVisualization } from "./duplicate_visualization";
import { PresentationObjectEditorPanel } from "./presentation_object_editor_panel";
import { SaveAsNewVisualizationModal } from "./save_as_new_visualization_modal";
import { VisualizationSettings } from "./visualization_settings";
import { useAIProjectContext } from "../project_ai/context";
import type { AIContext } from "../project_ai/types";
import { adaptFigureStyleForDarkMode } from "~/components/_shared/dark_mode_figures";

type InnerProps = {
  mode: "edit" | "create" | "ephemeral";
  projectStateSnapshot: ProjectState;
  poDetail: PresentationObjectDetail;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  returnToContext?: AIContext;
  /** Ephemeral mode only: live co-editing of the figure inside the host doc. */
  collabBinding?: VizFigureCollabBinding;
  onClose:
    | ((result: EditModeReturn) => void)
    | ((result: CreateModeReturn) => void)
    | ((result: EphemeralModeReturn) => void);
};

export function VisualizationEditorInner(p: InnerProps) {
  const defaultHeight =
    p.poDetail.config.d.type === "table"
      ? ("ideal" as const)
      : ("flex" as const);
  const [editorHeight, setEditorHeight] = createSignal<"flex" | "ideal">(
    defaultHeight,
  );
  const { setAIContext, notifyAI } = useAIProjectContext();

  const [lastKnownServerTimestamp, setLastKnownServerTimestamp] = createSignal(
    p.poDetail.lastUpdated,
  );

  // Extract static values from stores to prevent external reactivity
  const projectId = p.projectStateSnapshot.id;
  // const visualizationFolders = structuredClone(p.projectStateSnapshot.visualizationFolders);
  // const isLocked = p.projectStateSnapshot.isLocked;

  const {
    openEditor: openEditorForResultsObject,
    EditorWrapper: EditorWrapperForResultsObject,
  } = getEditorWrapper();

  // Temp state

  const [tempConfig, setTempConfig] = createStore<PresentationObjectConfig>(
    structuredClone(p.poDetail.config),
  );

  const manuallyUpdateTempConfig: SetStoreFunction<PresentationObjectConfig> = (
    ...args: any[]
  ) => {
    (setTempConfig as any)(...args);
    notifyAI({ type: "edited_viz_locally" });
  };

  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<{
      ih: ItemsHolderPresentationObject;
      config: PresentationObjectConfig;
      geoJson?: GeoJSONFeatureCollection;
    }>
  >({
    status: "loading",
    msg: t3({
      en: "Fetching data to be visualized...",
      fr: "Récupération des données à visualiser...",
      pt: "A obter dados para visualizar...",
    }),
  });

  // Sub-state updater

  // Monotonic run id: a superseded fetch must not write its (stale) items —
  // they'd be paired with the CURRENT config, which can disagree visibly
  // (e.g. a roll-up sentinel row rendering raw when the flag was re-toggled
  // off before the slower roll-up query resolved).
  let itemsFetchRunId = 0;
  // Set true only around the replicant auto-resolution commit-back below, so the
  // needsSave effect can tell that programmatic write apart from a real user edit
  // and not mark an untouched viz dirty (which would otherwise block
  // download/duplicate/rename and surface a spurious save prompt).
  let isAutoResolvingReplicant = false;
  async function attemptGetPresentationObjectItems(
    config: PresentationObjectConfig,
  ) {
    const runId = ++itemsFetchRunId;
    setItemsHolder({ status: "loading" });
    try {
      const iter = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
        projectId,
        p.poDetail,
        config,
      );
      let lastState: typeof itemsHolder extends () => infer T ? T : never = {
        status: "loading",
      };
      for await (const state of iter) {
        if (runId !== itemsFetchRunId) {
          return;
        }
        lastState = state;
        setItemsHolder(state);
      }
      if (runId !== itemsFetchRunId) {
        return;
      }
      if (lastState.status === "ready") {
        // Commit the auto-resolved replicant back into the draft so the selector
        // and the saved config match the rendered figure. resolveDefaultReplicant
        // (run inside the fetch) already validated the pick against the current
        // filters — keep-if-still-valid, else fall back to the first option — so we
        // only reflect its result here. Guarded on inequality so it settles in one
        // extra (cache-hit) fetch and never loops. Raw setTempConfig (not the
        // manuallyUpdate wrapper): this is an auto-resolution, not a user edit.
        const resolvedReplicant = lastState.data.config.d.selectedReplicantValue;
        if (
          resolvedReplicant !== undefined &&
          resolvedReplicant !== tempConfig.d.selectedReplicantValue
        ) {
          isAutoResolvingReplicant = true;
          setTempConfig("d", "selectedReplicantValue", resolvedReplicant);
        }
        const mapLevel = getAdminAreaLevelFromMapConfig(lastState.data.config);
        if (mapLevel) {
          const geoJson = getGeoJsonSync(mapLevel);
          setItemsHolder({
            status: "ready",
            data: { ...lastState.data, geoJson },
          });
        }
        // Ephemeral live co-editing: push a COHERENT bundle (the config being
        // co-edited + its freshly-fetched items) to the host, so canvas peers
        // render config and data in step. Config alone streams live per-keystroke;
        // this closes the config↔items gap whenever a refetch resolves.
        const binding = p.collabBinding;
        if (binding && binding.isLive()) {
          try {
            binding.onCoherentBundle(
              makeFigureBundleFromFetchedData({
                resultsValue: p.poDetail.resultsValue,
                ih: lastState.data.ih as Parameters<
                  typeof makeFigureBundleFromFetchedData
                >[0]["ih"],
                effectiveConfig: lastState.data.config,
              }),
            );
          } catch {
            // Transient (e.g. mid-edit shape mismatch); the next refetch re-coheres.
          }
        }
      }
    } catch (err) {
      if (runId !== itemsFetchRunId) {
        return;
      }
      console.error("attemptGetPresentationObjectItems error:", err);
      setItemsHolder({
        status: "error",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  // ── Live collaboration ──────────────────────────────────────────────────────
  // Two surfaces share one path:
  //  • Standalone edit mode: this editor opens its OWN PO room (openPoSession)
  //    over the project WebSocket and autosaves the visualization.
  //  • Ephemeral (embedded figure): the host (slide/report editor) passes a
  //    collabBinding to co-edit the figure's config IN the host's shared doc.
  // Both expose a config Y.Map + awareness + a per-user origin; push/reconcile/
  // undo/captions run off whichever is active. Create mode and users without
  // configure permission keep the classic non-collab flow (no target).
  const collabEnabled = p.mode === "edit" && !p.poDetail.isDefault &&
    projectState.thisUserPermissions.can_configure_visualizations &&
    !projectState.isLocked;

  const [poSession, setPoSession] = createSignal<PoSession | null>(null);
  const [ephemeralMap, setEphemeralMap] = createSignal<Y.Map<unknown> | null>(null);
  // Reactive readiness (a session's plain ready field isn't reactive); drives the
  // caption editors switching from TextArea to CollabMarkdownEditor.
  const [collabReady, setCollabReady] = createSignal(false);
  let undoMgr: Y.UndoManager | undefined;
  let firstSyncDone = false;
  let pushEffectPrimed = false;
  let detachConfigObserver: (() => void) | undefined;

  type CollabTarget = {
    configMap: Y.Map<unknown>;
    awareness: Awareness;
    localOrigin: object;
    isLive: () => boolean;
    canEdit: boolean;
  };
  /** The active co-editing target, or undefined when not collaborating. */
  const collabTarget = (): CollabTarget | undefined => {
    const s = poSession();
    if (s) {
      return {
        configMap: s.configMap,
        awareness: s.awareness,
        localOrigin: s.localOrigin,
        isLive: s.isLive,
        canEdit: true,
      };
    }
    const m = ephemeralMap();
    const b = p.collabBinding;
    if (m && b) {
      return {
        configMap: m,
        awareness: b.awareness,
        localOrigin: b.localOrigin,
        isLive: b.isLive,
        canEdit: b.canEdit,
      };
    }
    return undefined;
  };

  /** Ready AND live — collab is actually persisting / relaying right now. */
  const isCollabLive = () => {
    const t = collabTarget();
    return !!t && collabReady() && t.isLive();
  };
  /** A "must save first" guard only applies when NOT live-autosaving. */
  const blockedByUnsaved = () => needsSave() && !isCollabLive();

  // Standalone: other editors inside THIS visualization, for header avatars.
  // Ephemeral presence (editingFigureId) is owned by the host (its canvas shows
  // who is in the figure), so the modal renders no avatars there.
  const poPeers = () => {
    void collabState.peers; // track
    if (p.mode === "edit") {
      return otherPeers().filter((peer) => peer.poId === p.poDetail.id);
    }
    return [];
  };

  /** Diff the working config onto the active target's map (transacted with our
   *  origin, so undo tracks it and the remote-reconcile observer skips it). */
  function pushConfig(config: PresentationObjectConfig) {
    const t = collabTarget();
    const doc = t?.configMap.doc;
    if (!t || !doc) return;
    doc.transact(() => syncFigureConfigToMap(t.configMap, config), t.localOrigin);
  }

  function adoptFromMap(map: Y.Map<unknown>) {
    // reconcile so the preview-refetch effect (tracking tempConfig) re-runs;
    // the subsequent push effect is a no-op (config already matches the map).
    setTempConfig(reconcile(materializeFigureConfig(map)));
  }

  // The caption Y.Texts + awareness for binding CodeMirror caption editors,
  // once the target is ready.
  const captionCollab = () => {
    const t = collabTarget();
    if (!t || !collabReady()) return undefined;
    return { configMap: t.configMap, awareness: t.awareness, canEdit: t.canEdit };
  };

  // ── Live cursors ─────────────────────────────────────────────────────────────
  // Broadcast this user's pointer over the chart preview (normalized to the
  // preview canvas rect) and the settings panel (x normalized, y in content px
  // so it stays glued to the same control when the viewer scrolls). Scope keys
  // isolate visualizations from each other — and from "slide" pointers riding
  // the same host awareness in ephemeral mode.
  const [panelTab, setPanelTab] = createSignal<"data" | "style" | "text">(
    "data", // matches the panel's initial tab
  );
  const pointerScope = () =>
    poSession()
      ? `po:${p.poDetail.id}`
      : p.collabBinding
      ? `fig:${p.collabBinding.figureId}`
      : undefined;

  // Live cursors: surface glue lives in _shared/cursors/viz_cursors.tsx
  // (mounted in the JSX below).
  const vizCursorsEnabled = () => !!collabTarget() && collabReady();

  // ── "Who is on which tab" ────────────────────────────────────────────────────
  // Each participant stamps its active panel tab into the awareness field
  // "vizTab" (scope-gated like the cursors); the tab bar shows the matching
  // peers' avatars per tab. Cleared on unmount — essential in ephemeral mode,
  // where the HOST session's awareness outlives this modal.
  createEffect(() => {
    const aw = collabTarget()?.awareness;
    const scope = pointerScope();
    if (!aw) return;
    aw.setLocalStateField(
      "vizTab",
      collabReady() && scope ? { scope, tab: panelTab() } : null,
    );
  });
  onCleanup(() => {
    // Safe after awareness destroy (no-op); vital for the shared host awareness.
    collabTarget()?.awareness.setLocalStateField("vizTab", null);
  });

  // Reactive view of peers' awareness states for the tab map.
  const [awTick, setAwTick] = createSignal(0);
  createEffect(() => {
    const aw = collabTarget()?.awareness;
    if (!aw) return;
    const bump = () => setAwTick((t) => t + 1);
    aw.on("change", bump);
    onCleanup(() => aw.off("change", bump));
  });

  /** Peers grouped by their active panel tab (same visualization only). */
  const tabPeers = (): Record<"data" | "style" | "text", PresenceEntry[]> => {
    awTick();
    void collabState.peers; // track: presence enriches avatars below
    const out: Record<"data" | "style" | "text", PresenceEntry[]> = {
      data: [],
      style: [],
      text: [],
    };
    const aw = collabTarget()?.awareness;
    const scope = pointerScope();
    if (!aw || !scope) return out;
    const presencePeers = otherPeers();
    for (const [clientID, state] of aw.getStates()) {
      if (clientID === aw.clientID) continue;
      const user = state.user as { name?: string; color?: string } | undefined;
      const vizTab = state.vizTab as
        | { scope: string; tab: "data" | "style" | "text" }
        | null
        | undefined;
      if (!user?.name || !user.color || !vizTab || vizTab.scope !== scope) {
        continue;
      }
      // Enrich with the presence entry's avatar image when we can match one
      // (awareness carries only name/color); falls back to initials.
      const match = presencePeers.find(
        (pe) => pe.name === user.name && pe.color === user.color,
      );
      out[vizTab.tab].push({
        connectionId: String(clientID),
        email: match?.email ?? "",
        name: user.name,
        color: user.color,
        avatarUrl: match?.avatarUrl,
      });
    }
    return out;
  };

  // Standalone: driven by the PO session's onRemote.
  function handlePoRemote() {
    const s = poSession();
    if (!s) return;
    setCollabReady(true);
    if (!firstSyncDone) {
      firstSyncDone = true;
      // First sync: if the server doc still equals the config we loaded, push our
      // pre-sync local edits; otherwise the doc already diverged (a peer wrote
      // first), so adopt it rather than clobber.
      const docConfig = materializeFigureConfig(s.configMap);
      if (canonicalJson(docConfig) === canonicalJson(p.poDetail.config)) {
        pushConfig(unwrap(tempConfig));
      } else {
        adoptFromMap(s.configMap);
      }
      return;
    }
    adoptFromMap(s.configMap);
  }

  function handlePoError(message: string) {
    // Room discarded (e.g. the visualization was deleted elsewhere). Drop the
    // session so isCollabLive() is false and the classic save UI returns.
    poSession()?.close();
    setPoSession(null);
    setCollabReady(false);
    void openAlert({ text: message });
  }

  function undo() {
    undoMgr?.undo();
  }
  function redo() {
    undoMgr?.redo();
  }
  // Document-level so Ctrl+Z works regardless of what's focused (a wrapper's
  // onKeyDown only fires for keydowns bubbling from a focused descendant — it
  // misses the common case where focus is on the chart preview / page body,
  // which is why the button worked but the shortcut didn't). Leaves text-editing
  // contexts to their own undo: CodeMirror captions have a per-user undo keymap;
  // native inputs keep native undo.
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (!undoMgr) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.key.toLowerCase() !== "z") return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(".cm-editor, input, textarea, [contenteditable='true']")
    ) {
      return;
    }
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  onMount(() => {
    const unwrappedTempConfig = unwrap(tempConfig);
    attemptGetPresentationObjectItems(unwrappedTempConfig);

    document.addEventListener("keydown", handleEditorKeyDown);

    setAIContext({
      mode: "editing_visualization",
      vizId: p.mode === "edit" ? p.poDetail.id : null,
      vizLabel: p.poDetail.label,
      resultsValue: p.poDetail.resultsValue,
      getTempConfig: () => tempConfig,
      setTempConfig,
    });

    if (collabEnabled) {
      const session = openPoSession(
        p.poDetail.id,
        () => handlePoRemote(),
        (message) => handlePoError(message),
      );
      setPoSession(session);
      // Per-user undo: track only THIS client's edits (localOrigin). Remote
      // applies and other users' relayed ops are never tracked. Caption edits go
      // through yCollab (a different origin) so they aren't captured here — they
      // keep their own in-editor undo.
      undoMgr = new Y.UndoManager(session.configMap, {
        trackedOrigins: new Set([session.localOrigin]),
        captureTimeout: 500,
      });
      // Undo/redo mutate the config map DIRECTLY (not via tempConfig), so
      // reconcile those local changes back into the store — otherwise this
      // screen wouldn't reflect its own undo (peers would, via the relayed
      // update). Remote edits are handled by handlePoRemote; local pushes carry
      // session.localOrigin and need no reconcile (tempConfig is their source).
      const um = undoMgr;
      const onLocalUndo = (_events: unknown, txn: Y.Transaction) => {
        if (txn.origin === um) adoptFromMap(session.configMap);
      };
      session.configMap.observeDeep(onLocalUndo);
      detachConfigObserver = () => session.configMap.unobserveDeep(onLocalUndo);
      setCollabView({ poId: p.poDetail.id });
    } else if (p.mode === "ephemeral" && p.collabBinding?.isLive()) {
      const b = p.collabBinding;
      const map = b.getConfigMap();
      if (map) {
        setEphemeralMap(map);
        adoptFromMap(map); // adopt the live config (a peer may have edited it)
        setCollabReady(true);
        undoMgr = new Y.UndoManager(map, {
          trackedOrigins: new Set([b.localOrigin]),
          captureTimeout: 500,
        });
        // Reconcile on remote (non-self) changes to the figure's config subtree.
        const fn = (_events: unknown, txn: Y.Transaction) => {
          if (txn.origin === b.localOrigin) return; // our own edit
          adoptFromMap(map);
        };
        map.observeDeep(fn);
        detachConfigObserver = () => map.unobserveDeep(fn);
      }
    }
  });

  // Stream local edits into the shared doc/map while live (mirrors the slide
  // editor). Idempotent: pushing a config that already matches emits no update,
  // so a just-adopted remote state doesn't echo back.
  createEffect(() => {
    trackStore(tempConfig);
    if (!pushEffectPrimed) {
      pushEffectPrimed = true;
      return;
    }
    if (isCollabLive()) pushConfig(unwrap(tempConfig));
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleEditorKeyDown);
    setAIContext(p.returnToContext ?? { mode: "viewing_visualizations" });
    const s = poSession();
    if (s) {
      // The server finalizes (checkpoints) the room when the last editor leaves;
      // closing unsubscribes. Un-shipped edits made while offline would be lost,
      // same tradeoff as the slide/report editors.
      s.close();
      setCollabView({});
    }
    detachConfigObserver?.();
    undoMgr?.destroy();
  });

  let firstRunConfigChange = true;
  createEffect(() => {
    // These are the items that could potentially require a re-fetch
    // All other items should be accessed below in the createMemo on the child element
    for (const k in tempConfig.d) {
      //@ts-ignore
      const _v = tempConfig.d[k];
    }
    for (const dis of tempConfig.d.disaggregateBy) {
      const _v = dis.disOpt + "-" + dis.disDisplayOpt;
    }
    for (const fil of tempConfig.d.filterBy) {
      const _v = fil.disOpt + "-" + fil.values.join("-");
    }
    // CRITICAL: Explicit reads below subscribe to nested fields on tempConfig.d.
    // The for-loop above only reliably tracks top-level key changes; nested-field
    // updates within objects like `periodFilter` won't trigger this effect unless
    // read explicitly here. If you add a new nested filter field, add a read here
    // too — otherwise changes to it won't re-fetch the preview.
    const _periodFilterFilterType = tempConfig.d.periodFilter?.filterType;
    const _periodFilterNMonths =
      tempConfig.d.periodFilter?.filterType === "last_n_months"
        ? tempConfig.d.periodFilter.nMonths
        : undefined;
    const _periodFilterNYears =
      tempConfig.d.periodFilter?.filterType === "last_n_calendar_years"
        ? tempConfig.d.periodFilter.nYears
        : undefined;
    const _periodFilterNQuarters =
      tempConfig.d.periodFilter?.filterType === "last_n_calendar_quarters"
        ? tempConfig.d.periodFilter.nQuarters
        : undefined;
    const _periodFilterBounded =
      tempConfig.d.periodFilter &&
      periodFilterHasBounds(tempConfig.d.periodFilter)
        ? tempConfig.d.periodFilter
        : undefined;
    const _periodFilterMin = _periodFilterBounded?.min;
    const _periodFilterMax = _periodFilterBounded?.max;
    const _valuesFilter = tempConfig.d.valuesFilter?.join("-");
    // Tracked version-key read so the preview refetches when module output or
    // dataset integration changes mid-edit (cache-internal reads are untracked).
    moduleDataVersionKey(
      projectState,
      getModuleIdForResultsObject(p.poDetail.resultsValue.resultsObjectId),
    );
    if (firstRunConfigChange) {
      firstRunConfigChange = false;
      return;
    }
    const unwrappedTempConfig = unwrap(tempConfig);
    attemptGetPresentationObjectItems(unwrappedTempConfig);
  });

  // NOTE: there is deliberately no effect clearing includeAdminAreaRollup when the
  // gate (getEffectiveRollupLevel) closes. Gate closures are often transient while
  // editing (filter chips toggle one value at a time), the fetch-config builder
  // re-derives the flag safely, the checkbox UI hides itself, and the flag is
  // stripped at save time in normalizePOConfigForStorage.
  let firstRunNeedsSave = true;
  createEffect(() => {
    trackStore(tempConfig);

    if (firstRunNeedsSave) {
      firstRunNeedsSave = false;
      return;
    }
    // The replicant auto-resolution commits a value into tempConfig
    // programmatically; that is not a user edit, so it must not mark the viz dirty.
    if (isAutoResolvingReplicant) {
      isAutoResolvingReplicant = false;
      return;
    }
    setNeedsSave(true);
  });

  // Actions

  function getConfigForSave() {
    return normalizePOConfigForStorage(
      unwrap(tempConfig),
      p.poDetail.resultsValue,
    );
  }

  // Create mode: open modal to get name and folder, then create
  async function saveAsNewVisualization() {
    const unwrappedTempConfig = getConfigForSave();
    const modalRes = await openComponent({
      element: SaveAsNewVisualizationModal,
      props: {
        projectId: projectId,
        existingLabel: p.poDetail.label,
        resultsValue: p.poDetail.resultsValue,
        config: unwrappedTempConfig,
        folders: p.projectStateSnapshot.visualizationFolders,
      },
    });
    if (modalRes) {
      (p.onClose as (result: CreateModeReturn) => void)({
        created: {
          presentationObjectId: modalRes.newPresentationObjectId,
          folderId: modalRes.folderId,
        },
      });
    }
  }

  type SaveFuncData = {
    lastUpdated: string;
    conflictResolutionDecision?:
      | "user_chose_view_theirs"
      | "user_chose_cancel"
      | "user_chose_save_as_new";
  };

  async function saveFunc(
    overwriteIfConflict?: boolean,
  ): Promise<APIResponseWithData<SaveFuncData>> {
    const unwrappedTempConfig = getConfigForSave();

    const res = await serverActions.updatePresentationObjectConfig({
      projectId: projectId,
      po_id: p.poDetail.id,
      config: unwrappedTempConfig,
      expectedLastUpdated: lastKnownServerTimestamp(),
      overwrite: overwriteIfConflict,
    });

    if (res.success === false && res.err === "CONFLICT") {
      const userChoice = await openComponent({
        element: ConflictResolutionModal,
        props: {
          itemName: "visualization",
        },
      });

      if (userChoice === "view_theirs") {
        return {
          success: true,
          data: {
            lastUpdated: lastKnownServerTimestamp(),
            conflictResolutionDecision: "user_chose_view_theirs",
          },
        };
      }

      if (userChoice === "overwrite") {
        return saveFunc(true);
      }

      if (userChoice === "save_as_new") {
        const createRes = await serverActions.createPresentationObject({
          projectId: projectId,
          label: `${p.poDetail.label} (copy)`,
          resultsValue: p.poDetail.resultsValue,
          config: unwrappedTempConfig,
          makeDefault: false,
          folderId: p.poDetail.folderId,
        });

        if (createRes.success === false) {
          return createRes;
        }

        return {
          success: true,
          data: {
            lastUpdated: createRes.data.lastUpdated,
            conflictResolutionDecision: "user_chose_save_as_new",
          },
        };
      }

      return {
        success: true,
        data: {
          lastUpdated: lastKnownServerTimestamp(),
          conflictResolutionDecision: "user_chose_cancel",
        },
      };
    }

    if (res.success === false) {
      return res;
    }

    setNeedsSave(false);
    setLastKnownServerTimestamp(res.data.lastUpdated);

    return { success: true, data: { lastUpdated: res.data.lastUpdated } };
  }

  const saveAndClose = createButtonAction(
    () => saveFunc(),
    (data) => {
      if (data.conflictResolutionDecision === "user_chose_cancel") return;
      (p.onClose as (result: EditModeReturn) => void)(
        data.conflictResolutionDecision === "user_chose_view_theirs"
          ? undefined
          : { saved: true },
      );
    },
  );

  const save = createButtonAction(
    () => saveFunc(),
    (data) => {
      if (data.conflictResolutionDecision === "user_chose_view_theirs") {
        (p.onClose as (result: EditModeReturn) => void)(undefined);
      }
    },
  );

  async function attemptUpdateLabel() {
    if (blockedByUnsaved()) {
      await openAlert({
        text: t3({
          en: "You must save before editing the visualization name",
          fr: "Vous devez sauvegarder avant de modifier le nom de la visualisation",
          pt: "Tem de guardar antes de editar o nome da visualização",
        }),
      });
      return;
    }
    await openComponent({
      element: VisualizationSettings,
      props: {
        projectId: projectId,
        presentationObjectId: p.poDetail.id,
        resultsObjectId: p.poDetail.resultsValue.resultsObjectId,
        metricId: p.poDetail.resultsValue.id,
        moduleId:
          p.projectStateSnapshot.metrics.find(
            (m) => m.id === p.poDetail.resultsValue.id,
          )?.moduleId ?? "",
        isDefault: p.poDetail.isDefault,
        existingLabel: p.poDetail.label,
        currentFolderId: p.poDetail.folderId,
        folders: p.projectStateSnapshot.visualizationFolders,
        mutateFunc: async (newLabel) =>
          serverActions.updatePresentationObjectLabel({
            projectId: projectId,
            po_id: p.poDetail.id,
            label: newLabel,
          }),
      },
    });
  }

  async function duplicate() {
    if (blockedByUnsaved() && !p.poDetail.isDefault) {
      await openAlert({
        text: t3({
          en: "In order to be duplicated, visualizations cannot have any unsaved changes",
          fr: "Pour être dupliquées, les visualisations ne doivent pas avoir de modifications non sauvegardées",
          pt: "Para serem duplicadas, as visualizações não podem ter alterações por guardar",
        }),
      });
      return;
    }
    const res = await openComponent({
      element: DuplicateVisualization,
      props: {
        projectId: projectId,
        poDetails: [
          {
            id: p.poDetail.id,
            label: p.poDetail.label,
            folderId: p.poDetail.folderId,
          },
        ],
        folders: p.projectStateSnapshot.visualizationFolders,
      },
    });
    if (res === undefined) {
      return;
    }

    (p.onClose as (result: EditModeReturn) => void)({ saved: true });

    await openAlert({
      text: t3({
        en: "Visualization duplicated. Opening new visualization...",
        fr: "Visualisation dupliquée. Ouverture de la nouvelle visualisation...",
        pt: "Visualização duplicada. A abrir a nova visualização...",
      }),
      intent: "success",
    });
  }

  async function download() {
    if (blockedByUnsaved()) {
      await openAlert({
        text: t3({
          en: "You must save before downloading figures",
          fr: "Sauvegarde nécessaire avant téléchargement des figures",
          pt: "Tem de guardar antes de transferir figuras",
        }),
      });
      return;
    }
    const ih = itemsHolder();
    if (ih.status !== "ready" || ih.data.ih.status !== "ok") {
      await openAlert({ text: "Could not get figure", intent: "danger" });
      return;
    }
    let figureInputs;
    try {
      const bundle = makeFigureBundleFromFetchedData({
        resultsValue: p.poDetail.resultsValue,
        ih: ih.data.ih as Parameters<typeof makeFigureBundleFromFetchedData>[0]["ih"],
        effectiveConfig: ih.data.config,
      });
      figureInputs = buildFigureInputs(bundle);
    } catch {
      await openAlert({ text: "Could not get figure", intent: "danger" });
      return;
    }
    // Render the figure at the canonical 1000-DU frame, supersampled to a fixed
    // export resolution — not the on-screen (reflow) canvas, which is only
    // container width. (getFigureAsCanvas fills white, so the "transparent"
    // download option yields white until panther offers a transparent flag.)
    const canvas = getFigureAsCanvas(
      figureInputs,
      FIGURE_EXPORT_WIDTH_PX,
    );
    const replicateBy = getReplicateByProp(tempConfig);
    const res = await openComponent({
      element: DownloadPresentationObject,
      props: {
        isReplicateBy: !!replicateBy,
        isTable: "tableData" in figureInputs,
        poDetail: p.poDetail,
      },
    });
    if (res === undefined) {
      return;
    }
    if (res.format === "data-table-formatted") {
      const fi = figureInputs;
      if (!("tableData" in fi)) {
        return;
      }
      downloadCsv(
        // BOM so accented (FR) headers/labels render correctly when the CSV is
        // opened directly in Excel on Windows.
        stringifyCsv(getTableExportAoa(fi), { bom: true }),
        `${p.poDetail.label.replaceAll(" ", "_").trim()}_table.csv`,
      );
      return;
    }
    if (res.format === "json-definition") {
      const jsonDef = {
        id: p.poDetail.id,
        label: p.poDetail.label,
        metricId: p.poDetail.resultsValue.id,
        config: p.poDetail.config,
      };
      downloadJson(
        jsonDef,
        `${p.poDetail.label.replaceAll(" ", "_").trim()}_definition.json`,
      );
      return;
    }
    if (res.format === "data-results-file") {
      viewResultsObject(p.poDetail.resultsValue.resultsObjectId);
      return;
    }
    if (res.format === "data-visualization") {
      const res = await getPresentationObjectItemsFromCacheOrFetch(
        projectId,
        p.poDetail,
        tempConfig,
      );
      if (res.success === false || res.data.ih.status !== "ok") {
        return;
      }
      const csv = Csv.fromObjects(res.data.ih.items).stringify();
      downloadCsv(
        csv,
        `${p.poDetail.label.replaceAll(" ", "_").trim()}_underlying_data.csv`,
      );
      return;
    }
    if (res.transparent && !res.padding) {
      canvas.toBlob(
        (blob) => {
          saveAs(
            blob ?? "",
            `${p.poDetail.label.replaceAll(" ", "_").trim()}.png`,
          );
        },
        "png",
        1,
      );
      return;
    }
    const _PX = res.padding ? 100 : 0;
    const _PY = res.padding ? 100 : 0;
    const newW = canvas.width + 2 * _PX;
    const newH = canvas.height + 2 * _PY;
    // Multi-replicant export is parked: the download modal hardcodes
    // allReplicants=false (download_presentation_object.tsx), so no branch
    // exists here — reinstate both sides together if the feature returns.
    const backCanvas = new OffscreenCanvas(newW, newH);
    const backCanvasCtx = backCanvas.getContext("2d")!;
    if (!res.transparent) {
      backCanvasCtx.fillStyle = "#ffffff";
      backCanvasCtx.fillRect(0, 0, newW, newH);
    }
    backCanvasCtx.drawImage(canvas, _PX, _PY);
    const blob = await backCanvas.convertToBlob({ type: "png", quality: 1 });
    saveAs(blob, `${p.poDetail.label.replaceAll(" ", "_").trim()}.png`);
  }

  async function attemptDeletePresentationObjectDetail() {
    if (p.poDetail.isDefault) {
      return;
    }
    const deleteAction = createDeleteAction(
      t3({
        en: "Are you sure you want to delete this visualization?",
        fr: "Êtes-vous sûr de vouloir supprimer cette visualisation ?",
        pt: "Tem a certeza de que pretende eliminar esta visualização?",
      }),
      () =>
        serverActions.deletePresentationObject({
          projectId: projectId,
          po_id: p.poDetail.id,
        }),
      () => (p.onClose as (result: EditModeReturn) => void)({ deleted: true }),
    );

    await deleteAction.click();
  }

  async function viewResultsObject(resultsObjectId: string) {
    const _res = await openEditorForResultsObject({
      element: ViewResultsObject,
      props: {
        projectId: projectId,
        moduleId:
          p.projectStateSnapshot.metrics.find(
            (m) => m.id === p.poDetail.resultsValue.id,
          )?.moduleId ?? "",
        resultsObjectId,
      },
    });
  }

  return (
    <EditorWrapperForResultsObject>
      <FrameTop
        panelChildren={
          <div
            class="ui-pad ui-gap flex items-center border-b"
            data-cursor-zone="header"
          >
            <div class="ui-gap-sm flex items-center">
              <Switch>
                <Match when={p.mode === "ephemeral"}>
                  <Show
                    when={isCollabLive()}
                    fallback={
                      <Show
                        when={needsSave()}
                        fallback={
                          <Button
                            iconName="chevronLeft"
                            onClick={() => (p.onClose as any)(undefined)}
                          />
                        }
                      >
                        <Button
                          intent="success"
                          onClick={() =>
                            (p.onClose as (result: EphemeralModeReturn) => void)({
                              updated: { config: getConfigForSave() },
                            })
                          }
                          iconName="check"
                        >
                          {t3({ en: "Apply", fr: "Appliquer", pt: "Aplicar" })}
                        </Button>
                        <Button
                          outline
                          onClick={() => (p.onClose as any)(undefined)}
                          iconName="x"
                        >
                          {t3(TC.cancel)}
                        </Button>
                      </Show>
                    }
                  >
                    {/* Live co-editing: edits already streamed into the host doc.
                        Back commits and lets the host do a final coherent rebuild
                        (fresh items for the final config). No Cancel — streamed
                        edits can't be discarded (use per-user undo). */}
                    <Button
                      iconName="chevronLeft"
                      onClick={() =>
                        (p.onClose as (result: EphemeralModeReturn) => void)({
                          updated: { config: getConfigForSave() },
                        })
                      }
                    />
                  </Show>
                </Match>
                <Match
                  when={
                    (needsSave() || p.mode === "create") &&
                    !p.projectStateSnapshot.isLocked &&
                    !p.poDetail.isDefault &&
                    !isCollabLive()
                  }
                >
                  <Switch>
                    <Match when={p.mode === "create"}>
                      <Button
                        intent="success"
                        onClick={saveAsNewVisualization}
                        iconName="save"
                      >
                        {t3({
                          en: "Save as new visualization",
                          fr: "Sauver comme nouvelle viz.",
                          pt: "Guardar como nova visualização",
                        })}
                      </Button>
                    </Match>
                    <Match when={true}>
                      <>
                        <Button
                          intent="success"
                          onClick={saveAndClose.click}
                          state={saveAndClose.state()}
                          iconName="save"
                        >
                          {t3({
                            en: "Save and close",
                            fr: "Sauvegarder et quitter",
                            pt: "Guardar e fechar",
                          })}
                        </Button>
                        <Button
                          intent="success"
                          onClick={save.click}
                          state={save.state()}
                          iconName="save"
                        >
                          {t3(TC.save)}
                        </Button>
                        <Button
                          outline
                          onClick={saveAsNewVisualization}
                          iconName="copy"
                        >
                          {t3({
                            en: "Save as new",
                            fr: "Enregistrer comme nouveau",
                            pt: "Guardar como novo",
                          })}
                        </Button>
                      </>
                    </Match>
                  </Switch>
                  <Button
                    outline
                    onClick={() => (p.onClose as any)(undefined)}
                    iconName="x"
                  >
                    {t3(TC.cancel)}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    iconName="chevronLeft"
                    onClick={() => (p.onClose as any)(undefined)}
                  />
                </Match>
              </Switch>
            </div>
            <div class="font-700 flex flex-1 items-center truncate text-xl">
              <span class="font-400">{p.poDetail.label}</span>
              <Show when={p.poDetail.isDefault}>
                <span class="border-primary bg-base-100 font-400 text-primary ml-4 truncate rounded border px-2 py-1 text-xs">
                  {t3({ en: "Default", fr: "Par défaut", pt: "Predefinição" })}
                </span>
              </Show>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={isCollabLive()}>
                <PresenceAvatars peers={poPeers()} size="sm" />
                <span
                  class="text-base-content/60 mr-1 text-xs"
                  title={t3({
                    en: "Changes are saved automatically and shared live",
                    fr: "Les modifications sont enregistrées automatiquement et partagées en direct",
                    pt: "As alterações são guardadas automaticamente e partilhadas em direto",
                  })}
                >
                  {t3({ en: "Live", fr: "En direct", pt: "Em direto" })}
                </span>
                <Button onClick={undo} iconName="undo" outline />
                <Button onClick={redo} iconName="redo" outline />
              </Show>
              <Show
                when={!p.projectStateSnapshot.isLocked && p.mode === "edit"}
              >
                <Button
                  onClick={attemptUpdateLabel}
                  iconName="settings"
                  outline
                ></Button>
                <Button onClick={duplicate} iconName="copy" outline></Button>
                <Show when={!p.poDetail.isDefault}>
                  <Button
                    onClick={attemptDeletePresentationObjectDetail}
                    iconName="trash"
                    outline
                  ></Button>
                </Show>
              </Show>
              <Button onClick={download} iconName="download">
                {t3(TC.download)}
              </Button>
              <Button
                onClick={() =>
                  setEditorHeight(editorHeight() === "flex" ? "ideal" : "flex")
                }
                iconName={editorHeight() === "flex" ? "maximize" : "minimize"}
                outline
              ></Button>
              <Show when={!showAi()}>
                <Button
                  onClick={() => setShowAi(true)}
                  iconName="chevronLeft"
                  outline
                >
                  {t3({ en: "AI", fr: "IA", pt: "IA" })}
                </Button>
              </Show>
            </div>
          </div>
        }
      >
        <FrameLeftResizable
          startingWidth={384}
          minWidth={300}
          maxWidth={600}
          hoverOffset="offset-for-border-1-on-left"
          panelChildren={
            <PresentationObjectEditorPanel
              projectStateSnapshot={p.projectStateSnapshot}
              poDetail={p.poDetail}
              resultsValueInfo={p.resultsValueInfo}
              tempConfig={tempConfig}
              setTempConfig={manuallyUpdateTempConfig}
              viewResultsObject={viewResultsObject}
              captionCollab={captionCollab()}
              onTabChange={setPanelTab}
              tabPeers={tabPeers()}
            />
          }
        >
          <div class="flex h-full w-full">
            <Show when={getReplicateByProp(tempConfig)} keyed>
              {(keyedReplicateBy) => {
                return (
                  <ReplicateByOptionsPresentationObject
                    replicateBy={keyedReplicateBy}
                    config={tempConfig}
                    poDetail={p.poDetail}
                    selectedReplicantValue={tempConfig.d.selectedReplicantValue}
                    setSelectedReplicant={(v) =>
                      manuallyUpdateTempConfig("d", "selectedReplicantValue", v)
                    }
                  />
                );
              }}
            </Show>
            <Show
              when={(() => {
                const { config, effectiveValueProps } = getEffectivePOConfig(
                  tempConfig,
                  {
                    valueProps: p.poDetail.resultsValue.valueProps,
                  },
                );
                return !hasDuplicateDisaggregatorDisplayOptions(
                  p.poDetail.resultsValue,
                  config,
                  effectiveValueProps,
                );
              })()}
              fallback={
                <div class="ui-pad">
                  {t3({
                    en: "You have two disaggregators with the same display option",
                    fr: "Vous disposez de deux désagrégateurs avec la même option d'affichage",
                    pt: "Tem dois desagregadores com a mesma opção de apresentação",
                  })}
                </div>
              }
            >
              <Show
                when={
                  !getReplicateByProp(tempConfig) ||
                  tempConfig.d.selectedReplicantValue
                }
                fallback={
                  <div class="ui-pad">
                    {t3({
                      en: "You must select a replicant",
                      fr: "Un réplicant doit être sélectionné",
                      pt: "Tem de selecionar um replicante",
                    })}
                  </div>
                }
              >
                <StateHolderWrapper state={itemsHolder()}>
                  {(keyedItemsHolder) => {
                    return (
                      <Switch>
                        <Match
                          when={keyedItemsHolder.ih.status === "too_many_items"}
                        >
                          <div class="ui-pad">
                            {t3({
                              en: "Too many data points selected. Please add filters or reduce disaggregation options to view fewer than 20,000 data points.",
                              fr: "Trop de points de données sélectionnés. Veuillez ajouter des filtres ou réduire les options de désagrégation pour afficher moins de 20 000 points de données.",
                              pt: "Demasiados pontos de dados selecionados. Adicione filtros ou reduza as opções de desagregação para ver menos de 20.000 pontos de dados.",
                            })}
                          </div>
                        </Match>
                        <Match
                          when={
                            keyedItemsHolder.ih.status === "no_data_available"
                          }
                        >
                          <div class="ui-pad">
                            {t3({
                              en: "No data available with current filter selection.",
                              fr: "Aucune donnée disponible avec la sélection de filtre actuelle.",
                              pt: "Não há dados disponíveis com a seleção de filtros atual.",
                            })}
                          </div>
                        </Match>
                        <Match when={keyedItemsHolder.ih.status === "ok"}>
                          {(() => {
                            const figureInputs = createMemo<
                              StateHolder<FigureInputs>
                            >(() => {
                              // Check for empty items array (shouldn't happen with new discriminated union, but keeping for safety)
                              if (
                                keyedItemsHolder.ih.status === "ok" &&
                                keyedItemsHolder.ih.items.length === 0
                              ) {
                                return {
                                  status: "error",
                                  err: t3({
                                    en: "No rows returned from database for this filter configuration",
                                    fr: "Aucune ligne retournée de la base de données pour cette configuration de filtre",
                                    pt: "Nenhuma linha devolvida da base de dados para esta configuração de filtro",
                                  }),
                                };
                              }
                              // Reactive dependency read — re-render on type change.
                              const _type = tempConfig.d.type;
                              // Deep-track s and t so this render re-runs on ANY
                              // nested change — including a collaborator's edit
                              // reconciled IN PLACE into a nested array (e.g. a
                              // conditional-formatting threshold bucket's color:
                              // reconcile fires only the leaf `s.cfThresholdBuckets
                              // [i].color`, which a shallow top-level read misses).
                              // JSON.stringify recursively reads every nested
                              // property, subscribing to all of them.
                              void JSON.stringify(tempConfig.s);
                              void JSON.stringify(tempConfig.t);
                              if (
                                _type === "timeseries" &&
                                keyedItemsHolder.ih.status === "ok" &&
                                keyedItemsHolder.ih.items.length > 0
                              ) {
                                if (!tempConfig.d.timeseriesGrouping) {
                                  throw new Error(
                                    "Timeseries config missing timeseriesGrouping",
                                  );
                                }
                                const periodProp =
                                  tempConfig.d.timeseriesGrouping;
                                if (
                                  !(periodProp in keyedItemsHolder.ih.items[0])
                                ) {
                                  return {
                                    status: "loading",
                                    msg: t3({
                                      en: "Re-fetching data...",
                                      fr: "Récupération des données...",
                                      pt: "A obter dados novamente...",
                                    }),
                                  };
                                }
                              }
                              try {
                                const bundle = makeFigureBundleFromFetchedData({
                                  resultsValue: p.poDetail.resultsValue,
                                  ih: keyedItemsHolder.ih as Parameters<typeof makeFigureBundleFromFetchedData>[0]["ih"],
                                  effectiveConfig: keyedItemsHolder.config,
                                });
                                return { status: "ready" as const, data: buildFigureInputs(bundle) };
                              } catch (e) {
                                return { status: "error" as const, err: e instanceof Error ? e.message : "Render error" };
                              }
                            });

                            return (
                              <div
                                class="ui-pad h-full w-full overflow-auto"
                                data-cursor-zone="preview-area"
                              >
                                <StateHolderWrapper state={figureInputs()}>
                                  {(keyedFigureInputs) => {
                                    return (
                                      <ChartHolder
                                        chartInputs={adaptFigureStyleForDarkMode(keyedFigureInputs)}
                                        height={editorHeight()}
                                        canvasElementId="VIZ_PREVIEW_CANVAS"
                                      />
                                    );
                                  }}
                                </StateHolderWrapper>
                              </div>
                            );
                          })()}
                        </Match>
                      </Switch>
                    );
                  }}
                </StateHolderWrapper>
              </Show>
            </Show>
          </div>
        </FrameLeftResizable>
      </FrameTop>
      <VizEditorCursors
        scope={pointerScope}
        awareness={() => collabTarget()?.awareness}
        enabled={vizCursorsEnabled}
        panelTab={panelTab}
      />
    </EditorWrapperForResultsObject>
  );
}
