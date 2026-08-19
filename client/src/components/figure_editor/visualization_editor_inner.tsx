import { trackStore } from "@solid-primitives/deep";
import {
  FIGURE_EXPORT_WIDTH_PX,
  ItemsHolderPresentationObject,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  RunAuthoringContext,
  getEffectivePOConfig,
  getReplicateByProp,
  getSingleValueDimsFromPossibleValues,
  hasDuplicateDisaggregatorDisplayOptions,
  isSampleNProp,
  materializeFigureConfig,
  normalizePOConfigForStorage,
  SAMPLE_N_PREFIX,
  type PresenceEntry,
  syncFigureConfigToMap,
  t3,
  TC,
} from "lib";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import {
  Button,
  FigureHolder,
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
  untrack,
} from "solid-js";
import {
  createStore,
  reconcile,
  unwrap,
  type SetStoreFunction,
} from "solid-js/store";
import {
  collabSocketOpen,
  collabState,
  docSaveFailing,
  otherPeers,
} from "~/state/instance/collab";
import { VizEditorCursors } from "~/components/_shared/cursors/viz_cursors";
import { ReplicateByOptionsList } from "./replicate_by_options";
import { DownloadPresentationObject } from "~/components/forms_editors/download_presentation_object";
import { ViewResultsObject } from "~/components/forms_editors/view_results_object";
import {
  buildFigureInputs,
  makeFigureBundleFromFetchedData,
} from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getTableExportAoa } from "~/exports/get_table_export_aoa";
import { geoJsonFamilyFor, getGeoJsonSync } from "~/state/instance/t2_geojson";
import type { GeoJSONFeatureCollection } from "panther";
import {
  getPresentationObjectItemsFromCacheOrFetch,
  getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator,
} from "~/state/products/t2_figure_data";
import { setShowAi, showAi } from "~/state/t4_ui";
import type { EphemeralModeReturn, VizFigureCollabBinding } from ".";
import { PresentationObjectEditorPanel } from "./presentation_object_editor_panel";

// Input types with no native undo — they must not swallow the editor's Ctrl+Z.
const NON_TEXT_INPUT_TYPES = new Set([
  "radio",
  "checkbox",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

type InnerProps = {
  /** The product's pair. Passed down LIVE by the host (read from the T1
   *  products row), so a mid-edit reattach moves the preview's data with it. */
  scope: PackageScope;
  label: string;
  metric: ResultsValue;
  configSnapshot: PresentationObjectConfig;
  authoringContext: RunAuthoringContext;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  /** Live co-editing of the figure inside the host doc; absent → Apply/Cancel. */
  collabBinding?: VizFigureCollabBinding;
  onClose: (result: EphemeralModeReturn) => void;
};

export function VisualizationEditorInner(p: InnerProps) {
  const defaultHeight =
    p.configSnapshot.d.type === "table" ? ("ideal" as const) : ("flex" as const);
  const [editorHeight, setEditorHeight] = createSignal<"flex" | "ideal">(
    defaultHeight,
  );

  const {
    openEditor: openEditorForResultsObject,
    EditorWrapper: EditorWrapperForResultsObject,
  } = getEditorWrapper();

  // Temp state

  const [tempConfig, setTempConfig] = createStore<PresentationObjectConfig>(
    structuredClone(p.configSnapshot),
  );

  // The copilot is told about figure edits by the HOST, not here: the editor
  // sits inside `editing_slide` / `editing_report`, and the host's own
  // "edited locally" interaction fires when it applies the coherent bundle.
  // There is no `editing_visualization` view any more (D15).
  const manuallyUpdateTempConfig: SetStoreFunction<PresentationObjectConfig> =
    setTempConfig;

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
  // and not mark an untouched figure dirty.
  let isAutoResolvingReplicant = false;
  async function attemptGetPresentationObjectItems(
    scope: PackageScope,
    config: PresentationObjectConfig,
  ) {
    const runId = ++itemsFetchRunId;
    setItemsHolder({ status: "loading" });
    try {
      const iter = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
        scope,
        p.metric,
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
        // and the applied config match the rendered figure. resolveDefaultReplicant
        // (run inside the fetch) already validated the pick against the current
        // filters — keep-if-still-valid, else fall back to the first option — so we
        // only reflect its result here. Guarded on inequality so it settles in one
        // extra (cache-hit) fetch and never loops. Raw setTempConfig (not the
        // manuallyUpdate wrapper): this is an auto-resolution, not a user edit.
        //
        // This is also the D4 auto-default in action: a replicant value stored
        // under a previous package that no longer exists under the product's
        // current one is silently replaced, never thrown on.
        const resolvedReplicant =
          lastState.data.config.d.selectedReplicantValue;
        if (
          resolvedReplicant !== undefined &&
          resolvedReplicant !== tempConfig.d.selectedReplicantValue
        ) {
          isAutoResolvingReplicant = true;
          setTempConfig("d", "selectedReplicantValue", resolvedReplicant);
        }
        const mapLevel = getAdminAreaLevelFromMapConfig(lastState.data.config);
        if (mapLevel) {
          const geoJson = getGeoJsonSync(
            geoJsonFamilyFor(p.metric.datasetFamily),
            mapLevel,
          );
          setItemsHolder({
            status: "ready",
            data: { ...lastState.data, geoJson },
          });
        }
        // Live co-editing: push a COHERENT bundle (the config being co-edited +
        // its freshly-fetched items) to the host, so canvas peers render config
        // and data in step. Config alone streams live per-keystroke; this closes
        // the config↔items gap whenever a refetch resolves.
        const binding = p.collabBinding;
        if (binding && binding.isLive()) {
          try {
            binding.onCoherentBundle(
              makeFigureBundleFromFetchedData(scope, {
                resultsValue: p.metric,
                ih: lastState.data.ih as Parameters<
                  typeof makeFigureBundleFromFetchedData
                >[1]["ih"],
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
  // One surface only: the host (slide/report editor) passes a collabBinding and
  // the figure's config is co-edited IN the host's shared doc. The standalone
  // PO room is gone with the visualization product (D3) — a figure has no
  // document of its own to open.
  const [hostConfigMap, setHostConfigMap] = createSignal<Y.Map<unknown> | null>(
    null,
  );
  // Reactive readiness (a binding's plain isLive() isn't reactive); drives the
  // caption editors switching from TextArea to CollabMarkdownEditor.
  const [collabReady, setCollabReady] = createSignal(false);
  let undoMgr: Y.UndoManager | undefined;
  let pushEffectPrimed = false;
  let detachConfigObserver: (() => void) | undefined;

  type CollabTarget = {
    configMap: Y.Map<unknown>;
    awareness: Awareness;
    localOrigin: object;
    isLive: () => boolean;
    canEdit: () => boolean;
  };
  /** The active co-editing target, or undefined when not collaborating. */
  const collabTarget = (): CollabTarget | undefined => {
    const m = hostConfigMap();
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

  /** Ready AND live — collab is actually persisting / relaying right now.
   *  collabSocketOpen() mirrors ws.readyState (same value) but is reactive, so
   *  the Live badge / save gating below track a socket drop; isLive() alone
   *  reads the raw socket, which no effect would re-run on. */
  const isCollabLive = () => {
    const t = collabTarget();
    return !!t && collabReady() && collabSocketOpen() && t.isLive();
  };
  /** The room whose checkpoints persist these edits is the HOST slide/report
   *  doc — the host editor's own indicator is covered while this is open. */
  const saveFailing = () => {
    const b = p.collabBinding;
    return (
      b !== undefined && docSaveFailing(b.hostDoc.docType, b.hostDoc.docId)
    );
  };

  /** Diff the working config onto the host's map (transacted with our origin,
   *  so undo tracks it and the remote-reconcile observer skips it). */
  function pushConfig(config: PresentationObjectConfig) {
    const t = collabTarget();
    const doc = t?.configMap.doc;
    if (!t || !doc) return;
    doc.transact(
      () => syncFigureConfigToMap(t.configMap, config),
      t.localOrigin,
    );
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
    return {
      configMap: t.configMap,
      awareness: t.awareness,
      canEdit: t.canEdit,
      undoManager: () => undoMgr,
    };
  };

  // ── Live cursors ─────────────────────────────────────────────────────────────
  // Broadcast this user's pointer over the chart preview (normalized to the
  // preview canvas rect) and the settings panel (x normalized, y in content px
  // so it stays glued to the same control when the viewer scrolls). The scope
  // key isolates this figure from the "slide" pointers riding the same host
  // awareness, and from other figures in the same document.
  const [panelTab, setPanelTab] = createSignal<"data" | "style" | "text">(
    "data", // matches the panel's initial tab
  );
  const pointerScope = () =>
    p.collabBinding ? `fig:${p.collabBinding.figureId}` : undefined;

  // Live cursors: surface glue lives in _shared/cursors/viz_cursors.tsx
  // (mounted in the JSX below).
  const vizCursorsEnabled = () => !!collabTarget() && collabReady();

  // ── "Who is on which tab" ────────────────────────────────────────────────────
  // Each participant stamps its active panel tab into the awareness field
  // "vizTab" (scope-gated like the cursors); the tab bar shows the matching
  // peers' avatars per tab. Cleared on unmount — essential here, where the HOST
  // session's awareness outlives this editor.
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

  /** Peers grouped by their active panel tab (same figure only). */
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
    const selfEmail = (aw.getLocalState()?.user as { email?: string } | undefined)
      ?.email;
    // One avatar per PERSON per tab, keyed on the awareness identity: a user
    // with two tabs on this figure holds two awareness states, and their own
    // tabs must not show up as peers at all (same rule as the live-cursor
    // overlay and otherPeers()).
    const seen = new Set<string>();
    for (const [clientID, state] of aw.getStates()) {
      if (clientID === aw.clientID) continue;
      const user = state.user as
        | { name?: string; color?: string; email?: string }
        | undefined;
      const vizTab = state.vizTab as
        | { scope: string; tab: "data" | "style" | "text" }
        | null
        | undefined;
      if (!user?.name || !user.color || !vizTab || vizTab.scope !== scope) {
        continue;
      }
      if (selfEmail !== undefined && user.email === selfEmail) continue;
      const personKey = `${vizTab.tab}::${user.email ?? user.name}`;
      if (seen.has(personKey)) continue;
      seen.add(personKey);
      // Enrich with the presence entry's avatar image (awareness carries no
      // avatar URL); falls back to initials.
      const match = presencePeers.find((pe) =>
        user.email ? pe.email === user.email : pe.name === user.name
      );
      out[vizTab.tab].push({
        connectionId: String(clientID),
        email: user.email ?? match?.email ?? "",
        name: user.name,
        color: user.color,
        avatarUrl: match?.avatarUrl,
      });
    }
    return out;
  };

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
  // native text inputs keep native undo. Radios/checkboxes are inputs too but
  // have no native undo AND keep focus after a click, so ceding to them would
  // dead-key the shortcut until the user clicked somewhere else.
  function isTextEntryTarget(target: HTMLElement | null): boolean {
    const el = target?.closest(
      ".cm-editor, input, textarea, [contenteditable='true']",
    );
    if (!el) return false;
    if (el instanceof HTMLInputElement) {
      return !NON_TEXT_INPUT_TYPES.has(el.type);
    }
    return true;
  }
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (!undoMgr) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.key.toLowerCase() !== "z") return;
    if (isTextEntryTarget(e.target as HTMLElement | null)) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  onMount(() => {
    attemptGetPresentationObjectItems(
      { runId: p.scope.runId, adminArea2: p.scope.adminArea2 },
      unwrap(tempConfig),
    );

    document.addEventListener("keydown", handleEditorKeyDown);

    const b = p.collabBinding;
    if (b?.isLive()) {
      const map = b.getConfigMap();
      if (map) {
        setHostConfigMap(map);
        adoptFromMap(map); // adopt the live config (a peer may have edited it)
        setCollabReady(true);
        // Per-user undo: track only THIS client's edits (localOrigin). Remote
        // applies and other users' relayed ops are never tracked. Caption CM
        // editors join this same stack (captionCollab hands them the manager),
        // so the undo buttons cover caption typing too.
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
    // untrack: liveness is a per-edit condition here, not a trigger — tracking
    // it would push the whole (possibly diverged) local config on socket
    // reconnect, clobbering peers' offline-window edits (2-way diff, not a
    // merge). Offline edits stay unshipped, same tradeoff as close().
    if (untrack(isCollabLive)) pushConfig(unwrap(tempConfig));
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleEditorKeyDown);
    detachConfigObserver?.();
    undoMgr?.destroy();
  });

  let firstRunConfigChange = true;
  createEffect(() => {
    // Deep-track the DATA config: any change under `d`, however nested —
    // including collab leaf-updates arriving via reconcile — re-fetches the
    // preview. This replaced a hand-maintained dependency list that regressed
    // twice in one day when fields moved between nesting levels; trackStore
    // makes every current and future `d` field fetch-tracked automatically.
    // Fields excluded from the fetch-config hash (e.g. rollupPosition) resolve
    // as instant cache hits that rebuild the figure. `s`/`t` are deliberately
    // NOT tracked here — style/caption edits re-render via the child memo
    // without a refetch. Must be called on the live store proxy: trackStore on
    // an unwrap()ed object silently no-ops (verified by execution 2026-07-28).
    trackStore(tempConfig.d);
    // Tracked pair read: the host passes the product's PackageScope LIVE from
    // T1, so reattaching the product (or changing its scope) mid-edit refetches
    // the preview under the new package. The pair leads the items cache's
    // uniqueness key, so this is a different ENTRY, not an invalidation.
    const scope = { runId: p.scope.runId, adminArea2: p.scope.adminArea2 };
    if (firstRunConfigChange) {
      firstRunConfigChange = false;
      return;
    }
    attemptGetPresentationObjectItems(scope, unwrap(tempConfig));
  });

  // NOTE: there is deliberately no effect clearing the entry roll-up flag when
  // the gate (getEffectiveRollupDimension) closes. Gate closures are often
  // transient while editing (filter chips toggle one value at a time), the
  // fetch-config builder re-derives the flag safely, the checkbox UI hides
  // itself, and the flag is stripped at save time in
  // normalizePOConfigForStorage.
  let firstRunNeedsSave = true;
  createEffect(() => {
    trackStore(tempConfig);

    if (firstRunNeedsSave) {
      firstRunNeedsSave = false;
      return;
    }
    // The replicant auto-resolution commits a value into tempConfig
    // programmatically; that is not a user edit, so it must not mark it dirty.
    if (isAutoResolvingReplicant) {
      isAutoResolvingReplicant = false;
      return;
    }
    setNeedsSave(true);
  });

  // Actions

  function getConfigForSave() {
    return normalizePOConfigForStorage(unwrap(tempConfig), p.metric);
  }

  function moduleIdForMetric(): string {
    return (
      p.authoringContext.metrics.find((m) => m.id === p.metric.id)?.moduleId ??
      ""
    );
  }

  async function download() {
    const ih = itemsHolder();
    if (ih.status !== "ready" || ih.data.ih.status !== "ok") {
      await openAlert({ text: "Could not get figure", intent: "danger" });
      return;
    }
    let figureInputs;
    try {
      const bundle = makeFigureBundleFromFetchedData(p.scope, {
        resultsValue: p.metric,
        ih: ih.data.ih as Parameters<
          typeof makeFigureBundleFromFetchedData
        >[1]["ih"],
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
    const canvas = getFigureAsCanvas(figureInputs, FIGURE_EXPORT_WIDTH_PX);
    const replicateBy = getReplicateByProp(tempConfig);
    const fileStem = p.label.replaceAll(" ", "_").trim();
    const res = await openComponent({
      element: DownloadPresentationObject,
      props: {
        isReplicateBy: !!replicateBy,
        isTable: figureInputs.figureType === "table",
      },
    });
    if (res === undefined) {
      return;
    }
    if (res.format === "data-table-formatted") {
      const fi = figureInputs;
      if (fi.figureType !== "table") {
        return;
      }
      downloadCsv(
        // BOM so accented (FR) headers/labels render correctly when the CSV is
        // opened directly in Excel on Windows.
        stringifyCsv(getTableExportAoa(fi), { bom: true }),
        `${fileStem}_table.csv`,
      );
      return;
    }
    if (res.format === "json-definition") {
      // A figure has no id of its own — it IS `{ metricId, config }` (D3), and
      // that pair plus the pair it resolves under is the whole definition.
      const jsonDef = {
        label: p.label,
        metricId: p.metric.id,
        runId: p.scope.runId,
        adminArea2: p.scope.adminArea2,
        config: unwrap(tempConfig),
      };
      downloadJson(jsonDef, `${fileStem}_definition.json`);
      return;
    }
    if (res.format === "data-results-file") {
      viewResultsObject(p.metric.resultsObjectId);
      return;
    }
    if (res.format === "data-visualization") {
      const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
        p.scope,
        p.metric,
        unwrap(tempConfig),
      );
      if (itemsRes.success === false || itemsRes.data.ih.status !== "ok") {
        return;
      }
      // Sample sizes belong in an underlying-data export, but "__n_value" is
      // an internal wire name — give the column a header a reader can read.
      const csv = Csv.fromObjects(
        itemsRes.data.ih.items.map((item) =>
          Object.fromEntries(
            Object.entries(item).map(([k, v]) =>
              isSampleNProp(k)
                ? [`sample_size_${k.slice(SAMPLE_N_PREFIX.length)}`, v]
                : [k, v],
            ),
          ),
        ),
      ).stringify();
      downloadCsv(csv, `${fileStem}_underlying_data.csv`);
      return;
    }
    if (res.transparent && !res.padding) {
      canvas.toBlob(
        (blob) => {
          saveAs(blob ?? "", `${fileStem}.png`);
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
    saveAs(blob, `${fileStem}.png`);
  }

  async function viewResultsObject(resultsObjectId: string) {
    const _res = await openEditorForResultsObject({
      element: ViewResultsObject,
      props: {
        scope: { runId: p.scope.runId, adminArea2: p.scope.adminArea2 },
        moduleId: moduleIdForMetric(),
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
              <Show
                when={isCollabLive()}
                fallback={
                  <Show
                    when={needsSave()}
                    fallback={
                      <Button
                        iconName="chevronLeft"
                        onClick={() => p.onClose(undefined)}
                      />
                    }
                  >
                    <Button
                      intent="success"
                      onClick={() =>
                        p.onClose({ updated: { config: getConfigForSave() } })}
                      iconName="check"
                    >
                      {t3({ en: "Apply", fr: "Appliquer", pt: "Aplicar" })}
                    </Button>
                    <Button
                      outline
                      onClick={() => p.onClose(undefined)}
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
                    p.onClose({ updated: { config: getConfigForSave() } })}
                />
              </Show>
            </div>
            <div class="font-700 flex flex-1 items-center truncate text-xl">
              <span class="font-400">{p.label}</span>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={isCollabLive()}>
                <Show
                  when={!saveFailing()}
                  fallback={
                    <div class="ui-text-caption mr-1 flex items-center gap-1.5">
                      <div class="bg-danger h-1.5 w-1.5 flex-none rounded-full" />
                      <span>
                        {t3({
                          en: "Not saving — retrying…",
                          fr: "Non enregistré — nouvel essai…",
                          pt: "Não está a guardar — a tentar novamente…",
                        })}
                      </span>
                    </div>
                  }
                >
                  <span
                    class="text-base-content-muted mr-1 text-xs"
                    title={t3({
                      en: "Changes are saved automatically and shared live",
                      fr: "Les modifications sont enregistrées automatiquement et partagées en direct",
                      pt: "As alterações são guardadas automaticamente e partilhadas em direto",
                    })}
                  >
                    {t3({ en: "Live", fr: "En direct", pt: "Em direto" })}
                  </span>
                </Show>
                <Button onClick={undo} iconName="undo" outline />
                <Button onClick={redo} iconName="redo" outline />
              </Show>
              <Button onClick={download} iconName="download">
                {t3(TC.download)}
              </Button>
              <Button
                onClick={() =>
                  setEditorHeight(editorHeight() === "flex" ? "ideal" : "flex")}
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
          panelChildren={
            <PresentationObjectEditorPanel
              metric={p.metric}
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
                  <ReplicateByOptionsList
                    scope={p.scope}
                    replicateBy={keyedReplicateBy}
                    config={tempConfig}
                    metric={p.metric}
                    selectedReplicantValue={tempConfig.d.selectedReplicantValue}
                    setSelectedReplicant={(v) =>
                      manuallyUpdateTempConfig("d", "selectedReplicantValue", v)}
                  />
                );
              }}
            </Show>
            <Show
              when={(() => {
                const { config, effectiveValueProps } = getEffectivePOConfig(
                  tempConfig,
                  {
                    valueProps: p.metric.valueProps,
                    singleValueDims: getSingleValueDimsFromPossibleValues(
                      p.resultsValueInfo.disaggregationPossibleValues,
                    ),
                  },
                );
                return !hasDuplicateDisaggregatorDisplayOptions(
                  p.metric,
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
                                const bundle = makeFigureBundleFromFetchedData(
                                  p.scope,
                                  {
                                    resultsValue: p.metric,
                                    ih: keyedItemsHolder.ih as Parameters<
                                      typeof makeFigureBundleFromFetchedData
                                    >[1]["ih"],
                                    effectiveConfig: keyedItemsHolder.config,
                                  },
                                );
                                return {
                                  status: "ready" as const,
                                  data: buildFigureInputs(bundle),
                                };
                              } catch (e) {
                                return {
                                  status: "error" as const,
                                  err:
                                    e instanceof Error
                                      ? e.message
                                      : "Render error",
                                };
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
                                      <FigureHolder
                                        figureInputs={keyedFigureInputs}
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
