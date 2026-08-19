import { trackStore } from "@solid-primitives/deep";
import type {
  ContentBlock,
  ContentSlide,
  CoverSlide,
  PackageScope,
  RunAuthoringContext,
  SectionSlide,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import {
  canonicalJson,
  COLLAB_NO_EDIT_PERMISSION,
  findSlideFigureConfigMap,
  getSlideTitle,
  materializeSlide,
  t3,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
} from "lib";
import type { FigureBundle } from "lib";
import type {
  DividerDragUpdate,
  LayoutItemSwapUpdate,
  LayoutNode,
  MeasuredPage,
} from "panther";
import {
  AlertComponentProps,
  APIResponseWithData,
  Button,
  FrameLeftResizable,
  FrameTop,
  getQueryStateFromApiResponse,
  HeadingBar,
  PageHolder,
  PageInputs,
  buildHitRegions,
  Select,
  StateHolder,
  applyDividerDragUpdate,
  findNodeInDraft,
  createItemNode,
  findById,
  getEditorWrapper,
  openAlert,
  openComponent,
  showMenu,
} from "panther";
import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import type * as Y from "yjs";
import {
  createStore,
  produce,
  reconcile,
  unwrap,
  type SetStoreFunction,
} from "solid-js/store";
import { ConflictResolutionModal } from "~/components/forms_editors/conflict_resolution_modal";
import { buildLayoutContextMenu } from "~/components/layout_editor/build_context_menu";
import { InsertFigureModal } from "~/components/figures/insert_figure";
import {
  copilotViewController,
  restoreCopilotView,
  type CopilotViewState,
} from "~/components/copilot/ai_views";
import { VisualizationEditor } from "~/components/figure_editor";
import type { VizFigureCollabBinding } from "~/components/figure_editor";
import {
  UpdateAllFiguresButton,
  updateFigureToScope,
} from "~/components/figure_editor/stale_figure_badge";
import {
  findStaleFiguresInLayout,
  resolveFigureBundleInteractively,
} from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/products/t2_slides";
import { setShowAi, showAi } from "~/state/t4_ui";
import {
  collabSocketOpen,
  docSaveFailing,
  openSlideSession,
  otherPeers,
  reconnectForStaleEditAuth,
  setCollabView,
  type SlideSession,
} from "~/state/instance/collab";
import { PresenceAvatars } from "~/components/slide_deck/presence_avatars";
import { SlideEditorCursors } from "~/components/_shared/cursors/slide_cursors";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import { canEditProducts } from "~/state/instance/t1_store";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { convertBlockType } from "../slide_transforms/convert_block_type";
import { convertSlideType } from "../slide_transforms/convert_slide_type";
import { SlideEditorPanel } from "./editor_panel";

function updateBlockInLayout(
  layout: LayoutNode<ContentBlock>,
  targetId: string,
  updater: (block: ContentBlock) => ContentBlock,
): LayoutNode<ContentBlock> {
  if (layout.type === "item") {
    if (layout.id === targetId) {
      return { ...layout, data: updater(layout.data) };
    }
    return layout;
  }

  return {
    ...layout,
    children: layout.children.map((child) =>
      updateBlockInLayout(child as LayoutNode<ContentBlock>, targetId, updater),
    ),
  };
}

type SlideEditorInnerProps = {
  /** The deck product this slide belongs to — a product id IS its deck id. */
  productId: string;
  deckLabel: string;
  slideId: string;
  slide: Slide;
  lastUpdated: string;
  /** The product's pair, read LIVE from T1 by the deck editor and threaded
   *  down. Every figure read and every re-resolution resolves under it, so a
   *  reattach mid-edit moves this slide's previews and lights its badges. */
  scope: PackageScope;
  /** The product run's authoring context — the metric catalog the insert
   *  wizard offers and the update actions re-resolve against. */
  authoringContext: RunAuthoringContext;
  deckConfigSnapshot: SlideDeckConfig;
  /** The deck view to hand back to the copilot on close. */
  returnToContext?: CopilotViewState;
};

type Props = AlertComponentProps<SlideEditorInnerProps, boolean>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // No normalization needed - panther operations produce valid output
  const normalizedSlide = p.slide;

  const [needsSave, setNeedsSave] = createSignal(false);
  const [lastKnownServerTimestamp, setLastKnownServerTimestamp] = createSignal(
    p.lastUpdated,
  );
  const [tempSlide, setTempSlide] = createStore<Slide>(
    structuredClone(normalizedSlide),
  );

  const manuallyUpdateTempSlide: SetStoreFunction<Slide> = (...args: any[]) => {
    (setTempSlide as any)(...args);
    copilotViewController.notify("edited_slide_locally");
  };

  // Cache each type's state for restoration when switching back
  const typeCache: {
    cover?: CoverSlide;
    section?: SectionSlide;
    content?: ContentSlide;
  } = {};
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });
  const [selectedBlockId, setSelectedBlockId] = createSignal<
    string | undefined
  >();
  // The root title/header text field this user is editing (a panther text-
  // primitive id, e.g. "coverTitle"). Mutually exclusive with selectedBlockId;
  // broadcast so collaborators get an "editing" highlight on title fields too.
  const [selectedTextTarget, setSelectedTextTarget] = createSignal<
    string | undefined
  >();
  // Selecting a body block and editing a title field are mutually exclusive.
  function selectTextTarget(targetId: string | undefined) {
    if (targetId) setSelectedBlockId(undefined);
    setSelectedTextTarget(targetId);
  }
  function selectBlock(id: string | undefined) {
    if (id) setSelectedTextTarget(undefined);
    setSelectedBlockId(id);
  }
  const [contentTab, setContentTab] = createSignal<"slide" | "block">("slide");
  const [measuredPage, setMeasuredPage] = createSignal<MeasuredPage>();

  // Live co-editing (Milestone 3). The editor keeps mutating `tempSlide`; a
  // bridge syncs it to a shared CRDT doc. Degrades gracefully: if the collab
  // socket/room is unavailable, the session never becomes ready, pushLocal is a
  // no-op, and editing behaves exactly as before (tempSlide + explicit Save).
  const [collabReady, setCollabReady] = createSignal(false);
  // Signal (not a bare let) so the panel reactively picks up the session once it
  // opens — needed to bind the CodeMirror text editor to the block's Y.Text.
  const [session, setSession] = createSignal<SlideSession | null>(null);
  let removeLastUpdatedListener: (() => void) | null = null;
  // Count of sub-editors/modals (e.g. the visualization editor) currently open
  // over the slide canvas. While > 0 the peer-selection overlay is suppressed so
  // its body-portaled boxes don't float on top of that modal.
  const [subEditorOpen, setSubEditorOpen] = createSignal(0);
  // The layout-block id whose figure editor modal is currently open (co-editing
  // its config live in the shared doc). While set, the host's full-slide push
  // must NOT sync that figure's config (the modal owns it — its tempSlide copy
  // lags the modal's live edits); presence advertises it to peers.
  const [editingFigureBlockId, setEditingFigureBlockId] = createSignal<
    string | undefined
  >(undefined);
  async function withCanvasCovered<T>(opening: Promise<T>): Promise<T> {
    setSubEditorOpen((n) => n + 1);
    try {
      return await opening;
    } finally {
      setSubEditorOpen((n) => n - 1);
    }
  }

  // ── Per-user undo/redo ──────────────────────────────────────────────────────
  // One unified per-user stack for the whole slide, owned by the session
  // (see SlideSession.undoManager): structural pushes AND text typed in the
  // CodeMirror textboxes land in the same history, so the toolbar buttons and
  // in-textbox Ctrl+Z pop the same stack. Undoing never reverts a
  // collaborator's edit.
  let undoMgr: Y.UndoManager | undefined;
  let detachUndoPop: (() => void) | undefined;
  // ONE product-edit gate (D2): every approved user is a full editor of every
  // product, so this single function is the whole check — and the one place a
  // later permission model has to replace.
  const canUndoRedo = () =>
    !!session() && collabReady() && canEditProducts();

  function undo() {
    undoMgr?.undo();
  }
  function redo() {
    undoMgr?.redo();
  }

  // Document-level so Ctrl+Z works regardless of what's focused (a wrapper's
  // onKeyDown misses the common case of focus sitting on the canvas or page
  // body). Bails while a sub-editor covers the canvas: the figure modal
  // installs its OWN document handler, and both firing would undo twice, in
  // two different docs. CM textboxes handle Ctrl+Z via their own keymap
  // (popping this same shared stack); native inputs keep native undo.
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (!undoMgr || !canUndoRedo() || subEditorOpen() > 0) return;
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

  // Live cursors: surface glue lives in _shared/cursors/slide_cursors.tsx
  // (mounted in the JSX below). Disabled while a sub-editor modal covers the
  // canvas (the figure modal's own broadcaster takes over the awareness field).
  const slideCursorsEnabled = () =>
    !!session() && collabReady() && subEditorOpen() === 0;

  // Render slide preview (run-id guard: an older in-flight render must not
  // overwrite a newer one that resolved first)
  let renderRunId = 0;
  async function attemptGetPageInputs(slide: Slide) {
    const runId = ++renderRunId;
    try {
      const res = await convertSlideToPageInputs(
        slide,
        undefined,
        p.deckConfigSnapshot,
      );
      if (runId !== renderRunId) return;
      setPageInputs(getQueryStateFromApiResponse(res));
    } catch (err) {
      if (runId !== renderRunId) return;
      // A conversion crash must never FREEZE the canvas at its last good
      // render: the stale canvas keeps offering blocks whose ids no longer
      // exist in tempSlide, so clicking them dead-ends in the "Click a block
      // on the canvas to edit it" panel state. Show the error instead.
      setPageInputs({
        status: "error",
        err: err instanceof Error ? err.message : "Failed to render slide",
      });
    }
  }

  // Debounced re-render on changes (100ms)
  let renderTimeout: ReturnType<typeof setTimeout> | null = null;
  let firstRun = true;

  createEffect(() => {
    trackStore(tempSlide);
    if (firstRun) {
      firstRun = false;
      return;
    }

    // Push every change onto the shared doc. A remote change reconciled into
    // tempSlide pushes back a NO-OP here (syncSlideToDoc is idempotent — the doc
    // already matches, so no update is emitted and nothing echoes); a genuine
    // local edit emits an update. We deliberately do NOT gate this on a
    // "was this remote?" flag: that flag (skipNextPush) could get stuck true
    // when a remote reconcile made no tracked change, silently swallowing the
    // NEXT local edit — the cause of visualization edits not saving/syncing.
    setNeedsSave(true);
    const skipId = editingFigureBlockId();
    session()?.pushLocal(
      unwrap(tempSlide),
      skipId ? { skipFigureConfigForBlockIds: new Set([skipId]) } : undefined,
    );

    // Re-render the preview for both local and remote changes.
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
      attemptGetPageInputs(unwrap(tempSlide));
    }, 100);
  });

  // Collab errors alert at most once per editor instance (reconnect churn
  // could otherwise repeat the same alert).
  let collabErrorShown = false;

  onMount(() => {
    attemptGetPageInputs(unwrap(tempSlide));
    copilotViewController.setView(
      "editing_slide",
      {
        slideId: p.slideId,
        slideLabel: getSlideTitle(normalizedSlide),
        slideType: normalizedSlide.type as SlideType,
        deckId: p.productId,
        deckLabel: p.deckLabel,
      },
      {
        // Accessor, not a baked value: a reattach mid-edit must move the
        // copilot's package with the editor (D15).
        getScope: () => ({
          runId: p.scope.runId,
          adminArea2: p.scope.adminArea2,
        }),
        getTempSlide: () => tempSlide,
        setTempSlide,
      },
    );

    // Bind this slide to a shared CRDT document for live co-editing.
    const s = openSlideSession(
      p.slideId,
      () => {
        const docSlide = materializeSlide(s.doc) as Slide;
        if (!collabReady()) {
          setCollabReady(true);
          // Local edits raced the first sync. Push them onto the shared doc
          // only while the doc still matches the slide this editor loaded —
          // pushing over a diverged doc would force it to equal our draft and
          // DELETE other users' edits (syncSlideToDoc/syncText are 2-way
          // diffs, not merges). If peers got there first, fall through and
          // adopt their state: the few pre-sync local keystrokes lose to the
          // shared content, never the other way around.
          if (
            needsSave() &&
            canonicalJson(docSlide) === canonicalJson(normalizedSlide)
          ) {
            s.pushLocal(unwrap(tempSlide));
            return;
          }
        }
        // Adopt the doc state. reconcile diffs in place (a no-op when nothing
        // changed), and the push it triggers via the tracking effect is
        // idempotent — so no pre-comparison is needed (a full JSON compare
        // here serialized multi-MB figure bundles twice per remote keystroke).
        setTempSlide(reconcile(docSlide));
      },
      (errMsg, fatal) => {
        console.warn("Slide collab error:", errMsg);
        // The server discards rooms when the slide row is deleted or replaced
        // (delete, version restore) — further edits here would silently go
        // nowhere, so tell the user instead of letting them type into a void.
        // Only FATAL errors (room gone) warrant the alert; per-operation
        // rejections (a malformed update) don't.
        if (fatal && !collabErrorShown) {
          collabErrorShown = true;
          void openAlert({ text: errMsg, intent: "danger" });
          return;
        }
        // Edit rejected on the socket's snapshot auth. If the live store says
        // this user CAN edit, the socket is stale (permission granted after
        // connect) — reconnect to re-derive auth; the resync then pushes the
        // rejected local ops. Otherwise the user really is read-only: say so
        // once instead of letting them type into a void.
        if (!fatal && errMsg === COLLAB_NO_EDIT_PERMISSION) {
          if (canEditProducts()) {
            reconnectForStaleEditAuth();
          } else if (!collabErrorShown) {
            collabErrorShown = true;
            void openAlert({
              text: t3({
                en: "You don't have permission to edit slides — your changes are not being saved.",
                fr: "Vous n'avez pas la permission de modifier les diapositives — vos modifications ne sont pas enregistrées.",
                pt: "Não tem permissão para editar diapositivos — as suas alterações não estão a ser guardadas.",
              }),
              intent: "danger",
            });
          }
        }
      },
    );
    setSession(s);

    undoMgr = s.undoManager;
    // Undo/redo mutate the shared doc DIRECTLY (not tempSlide), so pull the
    // result back into the store — the same adopt path a remote change takes.
    // The push the tracking effect then fires is idempotent (the doc already
    // matches), so nothing echoes back.
    const onUndoPop = () => {
      manuallyUpdateTempSlide(reconcile(materializeSlide(s.doc) as Slide));
    };
    s.undoManager.on("stack-item-popped", onUndoPop);
    detachUndoPop = () => s.undoManager.off("stack-item-popped", onUndoPop);
    document.addEventListener("keydown", handleEditorKeyDown);

    // Keep the optimistic-save timestamp fresh as server-side checkpoints (or
    // other users' saves) bump last_updated, so the explicit Save fallback
    // won't raise a spurious conflict while co-editing.
    removeLastUpdatedListener = addLastUpdatedListener((tableName, ids, ts) => {
      if (tableName === "slides" && ids.includes(p.slideId)) {
        setLastKnownServerTimestamp(ts);
      }
    });
  });

  // Advertise which slide/block/title-field this user is editing so
  // collaborators see it. A selected body block takes precedence over a title
  // field (they are set mutually exclusively, but guard here too).
  createEffect(() => {
    const block = selectedBlockId();
    const editingFig = editingFigureBlockId();
    setCollabView({
      deckId: p.productId,
      slideId: p.slideId,
      selectedBlockId: editingFig ?? block,
      selectedTextTarget: block ? undefined : selectedTextTarget(),
      editingFigureId: editingFig,
    });
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    // Detach the undo hooks BEFORE the session closes (the session destroys
    // its manager and doc on close) — a late Ctrl+Z must not drive a
    // destroyed doc.
    document.removeEventListener("keydown", handleEditorKeyDown);
    detachUndoPop?.();
    detachUndoPop = undefined;
    undoMgr = undefined;
    // Hand the copilot back the deck view this editor was opened from — with
    // its LIVE context accessors intact, which is why the whole view state
    // travels rather than being rebuilt from ids here.
    if (p.returnToContext) {
      restoreCopilotView(p.returnToContext);
    }
    // Last-chance flush for exits that bypass the back button (route change,
    // deck switch): if collab isn't persisting and edits are pending, save
    // best-effort. Fire-and-forget with no conflict modal — at teardown there
    // is no UI to ask; a conflicting concurrent save simply wins.
    if (needsSave() && !(session()?.isLive() ?? false)) {
      void serverActions.updateSlide({
        slide_id: p.slideId,
        slide: unwrap(tempSlide),
        expectedLastUpdated: lastKnownServerTimestamp(),
      });
    }
    // Revert presence to deck-level (no slide) when the editor closes.
    setCollabView({ deckId: p.productId });
    // Tear down the collab session for this slide.
    session()?.close();
    setSession(null);
    removeLastUpdatedListener?.();
    removeLastUpdatedListener = null;
  });

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
    if (!needsSave()) {
      return {
        success: true,
        data: { lastUpdated: lastKnownServerTimestamp() },
      };
    }

    const updateRes = await serverActions.updateSlide({
      slide_id: p.slideId,
      slide: unwrap(tempSlide),
      expectedLastUpdated: lastKnownServerTimestamp(),
      overwrite: overwriteIfConflict,
    });

    if (updateRes.success === false && updateRes.err === "CONFLICT") {
      const userChoice = await openComponent({
        element: ConflictResolutionModal,
        props: {
          itemName: "slide",
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
        const createRes = await serverActions.createSlide({
          deck_id: p.productId,
          position: { after: p.slideId },
          slide: unwrap(tempSlide),
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

    if (updateRes.success === false) {
      return updateRes;
    }

    const promise = serverActions.getSlide({ slide_id: p.slideId });
    await _SLIDE_CACHE.setPromise(
      promise,
      { slideId: p.slideId },
      updateRes.data.lastUpdated,
    );
    await promise;

    setNeedsSave(false);
    setLastKnownServerTimestamp(updateRes.data.lastUpdated);

    return { success: true, data: { lastUpdated: updateRes.data.lastUpdated } };
  }

  async function handleCancel() {
    // Edits autosave via the collab checkpoint; flush explicitly when collab
    // isn't actually persisting RIGHT NOW — never synced, or synced but the
    // socket has since dropped (isLive, not the latched collabReady: edits made
    // while disconnected sit only in the local doc and die with it on close).
    if (needsSave() && !(session()?.isLive() ?? false)) {
      const res = await saveFunc();
      if (
        res.success &&
        res.data.conflictResolutionDecision === "user_chose_cancel"
      ) {
        // The user chose to keep editing rather than resolve the conflict —
        // don't close (closing would discard the draft they chose to keep).
        return;
      }
      // Every other outcome resolved the draft (saved, saved-as-new, or
      // explicitly discarded in favor of theirs) — clear the dirty flag so the
      // onCleanup last-chance flush doesn't re-save a resolved/discarded draft.
      setNeedsSave(false);
    }
    p.close(false);
  }

  function handleDividerDrag(update: DividerDragUpdate) {
    if (tempSlide.type !== "content") return;

    const currentSlide = unwrap(tempSlide) as ContentSlide;
    const updatedLayout = applyDividerDragUpdate(currentSlide.layout, update);

    manuallyUpdateTempSlide(
      reconcile({ ...currentSlide, layout: updatedLayout }),
    );
  }

  // Uses produce (not reconcile) because swapping exchanges data references
  // between two nodes. reconcile mutates the first node's data in-place,
  // which corrupts the second node's "new" value since it was the same
  // reference. produce just swaps the pointers without walking into objects.
  function handleLayoutItemSwap(update: LayoutItemSwapUpdate) {
    manuallyUpdateTempSlide(
      produce((draft) => {
        if (draft.type !== "content") return;
        const nodeA = findNodeInDraft(draft.layout, update.sourceNodeId);
        const nodeB = findNodeInDraft(draft.layout, update.targetNodeId);
        if (!nodeA || !nodeB) return;
        if (nodeA.type !== "item" || nodeB.type !== "item") return;
        const tmpData = nodeA.data;
        const tmpStyle = nodeA.style;
        nodeA.data = nodeB.data;
        nodeA.style = nodeB.style;
        nodeB.data = tmpData;
        nodeB.style = tmpStyle;
      }),
    );
  }

  function handleTypeChange(newType: "cover" | "section" | "content") {
    const currentSlide = unwrap(tempSlide);

    // Save current state before switching
    if (currentSlide.type === "cover") {
      typeCache.cover = structuredClone(currentSlide);
    } else if (currentSlide.type === "section") {
      typeCache.section = structuredClone(currentSlide);
    } else if (currentSlide.type === "content") {
      typeCache.content = structuredClone(currentSlide);
    }

    // Check if we have a cached version of the target type
    let converted: Slide;
    if (newType === "cover" && typeCache.cover) {
      converted = typeCache.cover;
    } else if (newType === "section" && typeCache.section) {
      converted = typeCache.section;
    } else if (newType === "content" && typeCache.content) {
      converted = typeCache.content;
    } else {
      // No cache - convert from current slide
      converted = convertSlideType(currentSlide, newType);
    }

    manuallyUpdateTempSlide(reconcile(converted));
    setNeedsSave(true);
  }

  function getLayoutCallbacks() {
    if (tempSlide.type !== "content") return undefined;
    const contentSlide = unwrap(tempSlide) as ContentSlide;
    const idGenerator = createIdGeneratorForLayout(contentSlide.layout);
    return {
      onLayoutChange: (newLayout: LayoutNode<ContentBlock>) => {
        manuallyUpdateTempSlide(
          reconcile({ ...unwrap(tempSlide), layout: newLayout }),
        );
      },
      onSelectionChange: selectBlock,
      createNewBlock: () =>
        createItemNode<ContentBlock>(
          { type: "text", markdown: "" },
          undefined,
          idGenerator,
        ),
      idGenerator,
      getBlockType: (block: ContentBlock) => block.type,
      isFigureWithSource: (block: ContentBlock) =>
        block.type === "figure" && block.bundle !== undefined,
      isEmptyFigure: (block: ContentBlock) =>
        block.type === "figure" && block.bundle === undefined,
      onEditVisualization: async (blockId: string) => {
        setSelectedBlockId(blockId);
        await handleEditVisualization();
      },
      onSelectVisualization: async (blockId: string) => {
        await handleInsertFigure(blockId);
      },
      onReplaceVisualization: async (blockId: string) => {
        await handleInsertFigure(blockId);
      },
      onCreateVisualization: async (blockId: string) => {
        await handleInsertFigure(blockId);
      },
      onRemoveVisualization: (blockId: string) => {
        if (tempSlide.type !== "content") return;
        const updatedLayout = updateBlockInLayout(
          tempSlide.layout,
          blockId,
          () => ({ type: "figure" as const }),
        );
        manuallyUpdateTempSlide(
          reconcile({ ...unwrap(tempSlide), layout: updatedLayout }),
        );
      },
    };
  }

  function handleShowLayoutMenu(x: number, y: number) {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;
    const callbacks = getLayoutCallbacks();
    if (!callbacks) return;
    const items = buildLayoutContextMenu(tempSlide.layout, blockId, callbacks);
    showMenu({ anchor: { x, y, width: 0, height: 0 }, items });
  }

  async function handleEditVisualization() {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const found = findById(tempSlide.layout, blockId);
    if (!found || found.node.type !== "item") return;

    const block = found.node.data;
    if (block.type !== "figure" || !block.bundle) return;

    const { metricId, config: bundleConfig } = block.bundle;

    try {
      // The metric comes from the PRODUCT RUN's authoring context, not from
      // the bundle: editing a figure always authors against the package the
      // product is attached to NOW. A figure whose metric is absent there is
      // exactly the stale case the badge covers — say so rather than opening
      // an editor with no catalog behind it.
      const metric = p.authoringContext.metrics.find((m) => m.id === metricId);

      if (!metric) {
        await openAlert({
          text: t3({
            en: `Metric "${metricId}" is not in this product's results package.`,
            fr: `L'indicateur "${metricId}" n'est pas dans le package de résultats de ce produit.`,
            pt: `A métrica "${metricId}" não está no pacote de resultados deste produto.`,
          }),
          intent: "danger",
        });
        return;
      }

      // Path set (not reconcile): guarantees a FRESH bundle object reference so
      // syncSlideToDoc always writes it. reconcile can merge the new bundle into
      // the old object in place (same ref) for some shapes, which the sync's
      // reference cache then skips — the edit updates locally but never reaches
      // the doc (not synced, not saved). See lib/collab/slide_crdt.ts.
      const applyFigureBundle = (bundle: FigureBundle) => {
        const updatedLayout = updateBlockInLayout(
          tempSlide.layout,
          blockId,
          (b: ContentBlock) =>
            b.type !== "figure" ? b : { type: "figure" as const, bundle },
        );
        (manuallyUpdateTempSlide as SetStoreFunction<ContentSlide>)(
          "layout",
          updatedLayout,
        );
      };

      // Live co-editing: bind the modal to this figure's config IN the shared
      // slide doc. Only when the session is live; otherwise the modal keeps its
      // classic Apply/Cancel flow (graceful degradation — WS down / not ready).
      const s = session();
      const figureOrigin = {}; // per-open origin for the modal's undo tracking
      const collabBinding: VizFigureCollabBinding | undefined =
        s && s.isLive()
          ? {
              figureId: blockId,
              hostDoc: { docType: "slide", docId: p.slideId },
              getConfigMap: () => {
                const ss = session();
                return ss
                  ? findSlideFigureConfigMap(ss.doc, blockId)
                  : undefined;
              },
              awareness: s.awareness,
              isLive: () => session()?.isLive() ?? false,
              canEdit: canEditProducts,
              localOrigin: figureOrigin,
              onCoherentBundle: applyFigureBundle,
            }
          : undefined;

      setEditingFigureBlockId(blockId);
      try {
        const result = await withCanvasCovered(
          openEditor({
            element: VisualizationEditor,
            props: {
              label: metric.label,
              scope: p.scope,
              metric,
              configSnapshot: structuredClone(bundleConfig),
              authoringContext: p.authoringContext,
              collabBinding,
            },
          }),
        );

        // On close, rebuild once from the final config (fresh items) — the final
        // coherent bundle for both the classic path and the live path. Resolved
        // under the product's CURRENT pair, so applying an edit to a stale
        // figure also brings it up to date.
        if (result?.updated) {
          const rebuilt = await resolveFigureBundleInteractively(
            p.scope,
            metric,
            result.updated.config,
          );
          if (!rebuilt.ok) {
            await openAlert({ text: rebuilt.reason, intent: "danger" });
            return;
          }
          applyFigureBundle(rebuilt.bundle);
        }
      } finally {
        setEditingFigureBlockId(undefined);
      }
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to edit visualization",
        intent: "danger",
      });
    }
  }

  // Path set (fresh bundle ref) so the CRDT sync always writes it — see the
  // note in handleEditVisualization.
  function setFigureBlockBundle(blockId: string, bundle: FigureBundle) {
    if (tempSlide.type !== "content") return;
    const updatedLayout = updateBlockInLayout(tempSlide.layout, blockId, () => ({
      type: "figure" as const,
      bundle,
    }));
    (manuallyUpdateTempSlide as SetStoreFunction<ContentSlide>)(
      "layout",
      updatedLayout,
    );
  }

  // Insert (or replace) a figure. The ONE authoring path there is: the product
  // run's presets and the metric wizard (D3) — there is no visualization to
  // pick, because a visualization is not a thing you can point at any more.
  // The wizard hands back `{ metric, config }`; the bundle is resolved HERE,
  // under this product's pair, which is what stamps it for staleness.
  async function handleInsertFigure(blockIdOverride?: string) {
    const blockId = blockIdOverride ?? selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const found = findById(tempSlide.layout, blockId);
    const existing =
      found && found.node.type === "item" && found.node.data.type === "figure"
        ? found.node.data.bundle
        : undefined;

    const result = await withCanvasCovered(
      openComponent({
        element: InsertFigureModal,
        props: {
          scope: p.scope,
          context: p.authoringContext,
          preselectedMetricId: existing?.metricId ?? null,
        },
      }),
    );

    if (!result) return;

    const resolved = await resolveFigureBundleInteractively(
      p.scope,
      result.metric,
      result.config,
    );
    if (!resolved.ok) {
      await openAlert({ text: resolved.reason, intent: "danger" });
      return;
    }
    setFigureBlockBundle(blockId, resolved.bundle);
  }

  // ── Stale figures on THIS slide (D4) ────────────────────────────────────────
  // Compared against the product's live pair, so reattaching while the slide
  // editor is open lights the count without a remount.
  const staleFigures = () =>
    tempSlide.type === "content"
      ? findStaleFiguresInLayout(tempSlide.layout, p.scope)
      : [];

  const [updatingFigures, setUpdatingFigures] = createSignal(false);

  // Re-resolve every stale figure on this slide. Failures are per figure: the
  // ones that cannot move keep their old bundle and report why, and the ones
  // that can still land.
  async function updateAllFiguresOnSlide() {
    const stale = staleFigures();
    if (stale.length === 0) return;
    setUpdatingFigures(true);
    const failures: string[] = [];
    for (const s of stale) {
      const res = await updateFigureToScope(
        p.scope,
        p.authoringContext,
        s.bundle,
      );
      if (res.ok) {
        setFigureBlockBundle(s.blockId, res.bundle);
      } else {
        failures.push(res.reason);
      }
    }
    setUpdatingFigures(false);
    if (failures.length > 0) {
      await openAlert({
        text: failures.join("\n"),
        intent: "danger",
      });
    }
  }

  // The per-figure action behind the selected block's badge.
  async function updateSelectedFigure(): Promise<void> {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;
    const found = findById(tempSlide.layout, blockId);
    if (!found || found.node.type !== "item") return;
    const block = found.node.data;
    if (block.type !== "figure" || !block.bundle) return;
    const res = await updateFigureToScope(
      p.scope,
      p.authoringContext,
      block.bundle,
    );
    if (res.ok) {
      setFigureBlockBundle(blockId, res.bundle);
      return;
    }
    // The reason belongs ON the figure (D4) — the block panel renders it.
    setFigureUpdateError(res.reason);
  }

  const [figureUpdateError, setFigureUpdateError] = createSignal<
    string | undefined
  >();

  // The selected block's bundle, but only when it is stale — the block panel
  // shows the badge off this.
  const selectedStaleBundle = (): FigureBundle | undefined => {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return undefined;
    return staleFigures().find((s) => s.blockId === blockId)?.bundle;
  };

  // A new selection is a new figure: drop the previous failure reason so it
  // never appears against a block it did not come from.
  createEffect(() => {
    void selectedBlockId();
    setFigureUpdateError(undefined);
  });

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div
            class="h-full w-full"
            data-cursor-zone="header"
          >
            <HeadingBar
              data-tour="slide-editor-header"
              heading={t3({
                en: "Edit Slide",
                fr: "Modifier la diapositive",
                pt: "Editar diapositivo",
              })}
              leftChildren={
                <Button
                  id="slide-back-button"
                  iconName="chevronLeft"
                  onClick={handleCancel}
                />
              }
            >
              <div class="ui-gap-sm flex items-center">
                {/* Who else is currently editing THIS slide (live presence). */}
                <PresenceAvatars
                  peers={otherPeers().filter((pe) => pe.slideId === p.slideId)}
                  size="sm"
                />
                {/* Room checkpoint health — edits relay live between peers,
                    but the server can't persist them right now. */}
                <Show
                  when={
                    collabReady() &&
                    collabSocketOpen() &&
                    docSaveFailing("slide", p.slideId)
                  }
                >
                  <div class="ui-text-caption flex items-center gap-1.5">
                    <div class="bg-danger h-1.5 w-1.5 flex-none rounded-full" />
                    <span>
                      {t3({
                        en: "Not saving — retrying…",
                        fr: "Non enregistré — nouvel essai…",
                        pt: "Não está a guardar — a tentar novamente…",
                      })}
                    </span>
                  </div>
                </Show>
                {/* Figures on this slide resolved under a different package or
                    scope than the product now serves from (D4). */}
                <UpdateAllFiguresButton
                  count={staleFigures().length}
                  busy={updatingFigures()}
                  onClick={updateAllFiguresOnSlide}
                />
                {/* Per-user undo/redo of this client's own slide edits. */}
                <Show when={canUndoRedo()}>
                  <Button onClick={undo} iconName="undo" outline />
                  <Button onClick={redo} iconName="redo" outline />
                </Show>
                <Select
                  data-tour="slide-type-select"
                  options={[
                    {
                      value: "cover",
                      label: t3({ en: "Cover", fr: "Couverture", pt: "Capa" }),
                    },
                    {
                      value: "section",
                      label: t3({ en: "Section", fr: "Section", pt: "Secção" }),
                    },
                    {
                      value: "content",
                      label: t3({
                        en: "Content",
                        fr: "Contenu",
                        pt: "Conteúdo",
                      }),
                    },
                  ]}
                  value={tempSlide.type}
                  onChange={(v: string) =>
                    handleTypeChange(v as "cover" | "section" | "content")
                  }
                />
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
            </HeadingBar>
          </div>
        }
      >
        <FrameLeftResizable
          startingWidth={400}
          minWidth={300}
          maxWidth={600}
          panelChildren={
            <div
              class="h-full w-full"
              data-cursor-zone="panel"
              data-tour="slide-panel"
            >
              <SlideEditorPanel
                scope={p.scope}
                authoringContext={p.authoringContext}
                staleFigureBundle={selectedStaleBundle()}
                figureUpdateError={figureUpdateError()}
                onUpdateFigure={updateSelectedFigure}
                tempSlide={tempSlide}
                setTempSlide={manuallyUpdateTempSlide}
                selectedBlockId={selectedBlockId()}
                setSelectedBlockId={setSelectedBlockId}
                session={session()}
                collabReady={collabReady()}
                onSelectTextTarget={selectTextTarget}
                openEditor={openEditor}
                contentTab={contentTab()}
                setContentTab={setContentTab}
                onShowLayoutMenu={handleShowLayoutMenu}
                onEditVisualization={handleEditVisualization}
                onInsertFigure={() => handleInsertFigure()}
                showCoverLogosByDefault={
                  p.deckConfigSnapshot.logos.cover.showByDefault
                }
                showHeaderLogosByDefault={
                  p.deckConfigSnapshot.logos.header.showByDefault
                }
                showFooterLogosByDefault={
                  p.deckConfigSnapshot.logos.footer.showByDefault
                }
                hasGlobalFooterText={
                  p.deckConfigSnapshot.globalFooterText !== undefined
                }
              />
            </div>
          }
        >
          <div
            class="bg-base-200 h-full w-full overflow-auto"
            data-cursor-zone="canvas-area"
            data-tour="slide-canvas"
          >
            <Show when={pageInputs().status === "loading"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-base-content-muted">
                  {t3({
                    en: "Rendering slide...",
                    fr: "Rendu de la diapositive...",
                    pt: "A renderizar diapositivo...",
                  })}
                </div>
              </div>
            </Show>
            <Show when={pageInputs().status === "error"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-danger">
                  Error: {(pageInputs() as any).err}
                </div>
              </div>
            </Show>
            <Show
              when={
                pageInputs().status === "ready"
                  ? (pageInputs() as { status: "ready"; data: PageInputs }).data
                  : undefined
              }
              keyed
            >
              {(keyedPageInputs) => (
                <div class="ui-pad-lg bg-base-200 h-full w-full overflow-auto">
                  <PageHolder
                    pageInputs={keyedPageInputs}
                    canvasElementId="SLIDE_EDITOR_CANVAS"
                    pageWidthDu={PAGE_WIDTH_DU}
                    pageHeightDu={PAGE_HEIGHT_DU}
                    fitWithin={true}
                    onMeasured={(m) => setMeasuredPage(m)}
                    hoverStyle={{
                      fillColor: "rgba(0, 112, 243, 0.1)",
                      strokeColor: "rgba(0, 112, 243, 0.8)",
                      strokeWidth: 2,
                      showLayoutBoundaries: true,
                    }}
                    onClick={(target) => {
                      if (target.type === "layoutItem") {
                        selectBlock(target.node.id);
                        setContentTab("block");
                      } else if (
                        target.type === "headerText" ||
                        target.type === "subHeaderText" ||
                        target.type === "dateText" ||
                        target.type === "footerText" ||
                        target.type === "coverTitle" ||
                        target.type === "coverSubTitle" ||
                        target.type === "coverAuthor" ||
                        target.type === "coverDate" ||
                        target.type === "sectionTitle" ||
                        target.type === "sectionSubTitle"
                      ) {
                        // Clicking a title target on the canvas both switches to
                        // the slide tab and highlights it for collaborators.
                        selectTextTarget(target.type);
                        setContentTab("slide");
                      }
                    }}
                    onDividerDrag={handleDividerDrag}
                    onLayoutItemSwap={handleLayoutItemSwap}
                    onContextMenu={(e, target) => {
                      if (target.type !== "layoutItem") return;
                      const callbacks = getLayoutCallbacks();
                      if (!callbacks) return;
                      const items = buildLayoutContextMenu(
                        (tempSlide as ContentSlide).layout,
                        target.node.id,
                        {
                          ...callbacks,
                          onEditVisualization: async (blockId) => {
                            setSelectedBlockId(blockId);
                            await handleEditVisualization();
                          },
                          onSelectVisualization: async (blockId) => {
                            await handleInsertFigure(blockId);
                          },
                          onReplaceVisualization: async (blockId) => {
                            await handleInsertFigure(blockId);
                          },
                          onConvertToText: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "text",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                          onConvertToFigure: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "figure",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                          onConvertToImage: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "image",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                        },
                      );
                      showMenu({
                        anchor: {
                          x: e.clientX,
                          y: e.clientY,
                          width: 0,
                          height: 0,
                        },
                        items,
                      });
                    }}
                  />
                  <PeerSelectionOverlay
                    measured={measuredPage()}
                    slideId={p.slideId}
                    suppressed={subEditorOpen() > 0}
                  />
                </div>
              )}
            </Show>
            {/* Figma-style live cursors. Outside the keyed <Show> above (which
                recreates on every edit) so the sprites — and their transform
                transitions — survive re-renders. */}
            <SlideEditorCursors
              slideId={p.slideId}
              awareness={() => session()?.awareness}
              enabled={slideCursorsEnabled}
              covered={() => subEditorOpen() > 0}
            />
          </div>
        </FrameLeftResizable>
      </FrameTop>
    </EditorWrapper>
  );
}

type MeasuredNodeLike = {
  type: "item" | "rows" | "cols";
  id: string;
  rpd: { x(): number; y(): number; w(): number; h(): number };
  children?: MeasuredNodeLike[];
};

// Map each block's layout-node id to its rectangle in page (DU) coordinates.
// Mirrors panther's collectItemHitRegions (cols children take the parent column
// height) so highlight boxes line up exactly with the canvas hit regions.
function buildIdRectMap(
  root: MeasuredNodeLike,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number }>();
  function walk(node: MeasuredNodeLike) {
    if (node.type === "item") {
      map.set(node.id, {
        x: node.rpd.x(),
        y: node.rpd.y(),
        w: node.rpd.w(),
        h: node.rpd.h(),
      });
    } else if (node.type === "cols") {
      for (const child of node.children ?? []) {
        if (child.type === "item") {
          map.set(child.id, {
            x: child.rpd.x(),
            y: child.rpd.y(),
            w: child.rpd.w(),
            h: node.rpd.h(),
          });
        } else {
          walk(child);
        }
      }
    } else {
      for (const child of node.children ?? []) walk(child);
    }
  }
  walk(root);
  return map;
}

// Draws a colored border around the block each remote peer has selected on the
// slide currently being edited. A DOM overlay is required because panther's
// canvas (PageHolder) is unmodifiable and exposes no highlight-by-id API. The
// boxes are positioned in viewport coordinates inside a Portal so a transformed
// modal ancestor cannot offset them, and recompute on resize/scroll.
function PeerSelectionOverlay(p: {
  measured: MeasuredPage | undefined;
  slideId: string;
  suppressed: boolean;
}) {
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);

  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
  });
  onCleanup(() => {
    window.removeEventListener("resize", bump);
    window.removeEventListener("scroll", bump, true);
  });

  const boxes = () => {
    tick(); // recompute when the canvas moves (resize/scroll)
    if (p.suppressed) return []; // a sub-editor/modal is open over the canvas
    const m = p.measured;
    if (!m) return [];
    const peers = otherPeers().filter(
      (peer) =>
        peer.slideId === p.slideId &&
        (peer.selectedBlockId || peer.selectedTextTarget),
    );
    if (peers.length === 0) return [];
    const canvas = document.getElementById("SLIDE_EDITOR_CANVAS");
    if (!canvas) return [];
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [];
    // Backstop for any other covering modal: if the slide canvas isn't the
    // topmost element at its own center, something is over it — suppress.
    const topEl = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (topEl && topEl !== canvas && !topEl.contains(canvas)) return [];
    const sx = r.width / PAGE_WIDTH_DU;
    const sy = r.height / PAGE_HEIGHT_DU;
    // Body blocks (freeform layout items) keyed by node id.
    const blockRects =
      m.type === "freeform"
        ? buildIdRectMap(
            (m as unknown as { mLayout: MeasuredNodeLike }).mLayout,
          )
        : new Map<string, { x: number; y: number; w: number; h: number }>();
    // Root title/header text fields keyed by their panther text-primitive id
    // ("coverTitle", "headerText", …). Rects come straight from panther's hit
    // regions so they line up exactly with the rendered text on the canvas.
    const textRects = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();
    for (const region of buildHitRegions(m)) {
      const rcd = region.rcd;
      textRects.set(region.type, {
        x: rcd.x(),
        y: rcd.y(),
        w: rcd.w(),
        h: rcd.h(),
      });
    }
    // One box per TARGET ELEMENT (not per peer): when several people edit the
    // same block/title, their name tags must sit side by side above it, not
    // overlap at the same spot.
    const out: {
      key: string;
      left: number;
      top: number;
      width: number;
      height: number;
      editors: { name: string; color: string; editingFigure: boolean }[];
    }[] = [];
    const byTarget = new Map<string, (typeof out)[number]>();
    for (const peer of peers) {
      const targetKey = peer.selectedBlockId
        ? `block:${peer.selectedBlockId}`
        : `text:${peer.selectedTextTarget}`;
      const rcd = peer.selectedBlockId
        ? blockRects.get(peer.selectedBlockId)
        : textRects.get(peer.selectedTextTarget!);
      if (!rcd) continue;
      let entry = byTarget.get(targetKey);
      if (!entry) {
        entry = {
          key: targetKey,
          left: r.left + rcd.x * sx,
          top: r.top + rcd.y * sy,
          width: rcd.w * sx,
          height: rcd.h * sy,
          editors: [],
        };
        byTarget.set(targetKey, entry);
        out.push(entry);
      }
      // Same user in two tabs = two connections; show their name once.
      if (!entry.editors.some((e) => e.name === peer.name)) {
        entry.editors.push({
          name: peer.name,
          color: peer.color,
          editingFigure:
            peer.editingFigureId === peer.selectedBlockId &&
            !!peer.editingFigureId,
        });
      }
    }
    // Stable label order so tags don't swap places between presence updates.
    for (const entry of out) {
      entry.editors.sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  };

  return (
    <Portal mount={document.body}>
      <div class="pointer-events-none fixed inset-0 z-[80]">
        <For each={boxes()}>
          {(b) => (
            <div
              class="pointer-events-none absolute rounded-sm"
              style={{
                left: `${b.left}px`,
                top: `${b.top}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                border: `2px solid ${b.editors[0].color}`,
              }}
            >
              {/* Additional co-editors get concentric inset borders so every
                  editor's color stays visible on the shared element. */}
              <For each={b.editors.slice(1)}>
                {(e, i) => (
                  <div
                    class="pointer-events-none absolute rounded-sm"
                    style={{
                      inset: `${(i() + 1) * 2}px`,
                      border: `2px solid ${e.color}`,
                    }}
                  />
                )}
              </For>
              <div class="absolute -top-[18px] left-0 flex gap-1">
                <For each={b.editors}>
                  {(e) => (
                    <div
                      class="font-700 rounded px-1 text-[10px] whitespace-nowrap"
                      style={{ "background-color": e.color, color: "#ffffff" }}
                    >
                      {e.name}
                      {e.editingFigure
                        ? " " +
                          t3({ en: "✎ figure", fr: "✎ figure", pt: "✎ figura" })
                        : ""}
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
