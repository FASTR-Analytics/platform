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
  findNodeMap,
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
  APIResponseWithData,
  Button,
  getQueryStateFromApiResponse,
  PageHolder,
  PageInputs,
  buildHitRegions,
  StateHolder,
  applyDividerDragUpdate,
  findHitTarget,
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
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
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
import { ConflictResolutionModal } from "./conflict_resolution_modal";
import { buildLayoutContextMenu } from "./build_context_menu";
import { InsertFigureModal } from "~/components/products/_shared/mod.ts";
import {
  copilotViewController,
  restoreCopilotView,
  type CopilotViewState,
} from "~/components/products/copilot/mod.ts";
import { VisualizationEditor } from "~/components/_shared/figure_editor/mod.ts";
import type { VizFigureCollabBinding } from "~/components/_shared/figure_editor/mod.ts";
import {
  findStaleFiguresInLayout,
  resolveFigureBundleInteractively,
} from "~/generate_visualization/mod";
import {
  UpdateAllFiguresButton,
  updateFigureToScope,
} from "~/components/_shared/figure_editor/mod.ts";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/products/t2_slides";
import {
  collabSocketOpen,
  docSaveFailing,
  openSlideSession,
  otherPeers,
  reconnectForStaleEditAuth,
  setCollabView,
  type SlideSession,
} from "~/state/instance/collab";
import { SlideEditorCursors } from "./slide_cursors";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import { canEditProduct } from "~/state/instance/product_access";
import { createIdGeneratorForLayout } from "~/components/products/_shared/mod.ts";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { convertBlockType } from "../slide_transforms/mod.ts";
import { convertSlideType } from "../slide_transforms/mod.ts";
import { updateBlockInLayout } from "../slide_transforms/mod.ts";
import { SlideToolbar } from "./slide_toolbar";
import { SLIDE_TEXT_FIELDS, slideTextField } from "./slide_fields";
import { MarkdownSourceModal } from "./markdown_source_modal";
import {
  InlineTextEditor,
  type InlineEditTarget,
  type InlineTextApi,
} from "./inline_text_editor";

// The title primitives panther draws, and the slide field each one shows.
const INLINE_TITLE_FIELDS: Record<string, { field: string; slideType: SlideType }> =
  Object.fromEntries(SLIDE_TEXT_FIELDS.map((f) => [f.primitiveId, f]));

type SlideEditorInnerProps = {
  productId: string;
  deckLabel: string;
  slideId: string;
  slide: Slide;
  lastUpdated: string;
  deckConfigSnapshot: SlideDeckConfig;
  // The product's live (package, scope) pair and that package's authoring
  // context, passed down by the deck editor: what every figure on this slide
  // resolves under and what staleness is measured against (D4).
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
  returnToContext?: CopilotViewState;
  // Where the deck wants the slide's toolbar: the toolbar row under the
  // deck's heading bar, spanning the rail and the slide (Google Slides). The
  // toolbar is rendered there through a portal; it stays this editor's.
  toolbarHost?: HTMLElement;
  menuRowHost?: HTMLElement;
  // Where the deck wants the slide's live/save dot: its header, beside the
  // deck's own actions (the report header's save status, for slides).
  statusHost?: HTMLElement;
  // The deck the slide sits in, read live: the copilot's slide view carries
  // the deck's tools too, since the deck's rail is always beside the slide.
  deckContext: {
    getDeckConfig: () => SlideDeckConfig;
    getSlideIds: () => string[];
    getSelectedSlideIds: () => string[];
  };
  // What the deck may ask of the mounted editor: `flush` settles an unsaved
  // draft before the deck swaps the slide out (false = the user chose to keep
  // editing, so the swap is off).
  onApi?: (api: SlideEditorApi | undefined) => void;
};

export type SlideEditorApi = { flush: () => Promise<boolean> };

// Mounted beside the deck's slide rail (slide_list.tsx), one instance per
// open slide: the rail swaps it out by key, so a mount is "open" and a
// cleanup is "close" — there is no back button and no Save.
type Props = SlideEditorInnerProps;

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
  const [measuredPage, setMeasuredPage] = createSignal<MeasuredPage>();

  // ── Typing on the canvas ────────────────────────────────────────────────────
  // Double-click a text block or title (or press Enter with one selected) to
  // type straight onto the slide: see inline_text_editor.tsx. A fresh object
  // per session remounts the editor for each one.
  const [inlineEdit, setInlineEdit] = createSignal<
    | {
      target: InlineEditTarget;
      point?: { x: number; y: number };
      selectAll?: boolean;
    }
    | undefined
  >();
  // The open inline editor's commands, for the toolbar's formatting buttons.
  const [inlineApi, setInlineApi] = createSignal<InlineTextApi>();

  function textOfTarget(t: InlineEditTarget): string | undefined {
    if (t.kind === "block") {
      if (tempSlide.type !== "content") return undefined;
      const hit = findById(tempSlide.layout, t.id);
      const data = hit?.node.type === "item" ? hit.node.data : undefined;
      return data?.type === "text" ? data.markdown : undefined;
    }
    if (INLINE_TITLE_FIELDS[t.primitiveId]?.slideType !== tempSlide.type) {
      return undefined;
    }
    return ((tempSlide as unknown as Record<string, unknown>)[t.field] as
      | string
      | undefined) ?? "";
  }

  function startInlineEdit(
    target: InlineEditTarget,
    point?: { x: number; y: number },
    selectAll?: boolean,
  ) {
    if (!canEdit() || textOfTarget(target) === undefined) return;
    if (target.kind === "block") {
      selectBlock(target.id);
    } else {
      selectTextTarget(target.primitiveId);
    }
    setInlineEdit({ target, point, selectAll });
  }

  // Text menu → an absent title field: seed it with its name (an empty field
  // draws nothing to click) and start typing over it.
  function addTitleField(primitiveId: string) {
    const f = slideTextField(primitiveId);
    const target = titleTarget(primitiveId);
    if (!f || !target || tempSlide.type !== f.slideType) return;
    manuallyUpdateTempSlide(
      produce((draft) => {
        (draft as unknown as Record<string, unknown>)[f.field] = f.label();
      }),
    );
    // Opened after the seeded text reaches the canvas, so the editor binds to
    // it with the placeholder selected.
    setInlineEdit(undefined);
    queueMicrotask(() => startInlineEdit(target, undefined, true));
  }

  function inlineTargetAt(x: number, y: number): InlineEditTarget | undefined {
    const m = measuredPage();
    if (!m) return undefined;
    const hit = findHitTarget(buildHitRegions(m), x, y);
    if (!hit) return undefined;
    if (hit.type === "layoutItem") {
      return { kind: "block", id: hit.node.id };
    }
    return titleTarget(hit.type);
  }

  function titleTarget(primitiveId: string): InlineEditTarget | undefined {
    const f = INLINE_TITLE_FIELDS[primitiveId];
    if (!f) return undefined;
    // A deck-wide footer overrides the slide's own: not this slide's text.
    if (
      primitiveId === "footerText" &&
      p.deckConfigSnapshot.globalFooterText !== undefined
    ) {
      return undefined;
    }
    return { kind: "title", field: f.field, primitiveId };
  }

  // A click on nothing (the slide's empty ground, or the grey around it)
  // deselects, so the toolbar returns to the slide's own row. PageHolder
  // reports hits on its own click handler, which runs before this one
  // bubbles; a drag that ends here is not a click.
  let canvasHit = false;
  let canvasPress: { x: number; y: number } | undefined;
  function handleCanvasPointerDown(e: PointerEvent) {
    canvasPress = { x: e.clientX, y: e.clientY };
  }
  function handleCanvasClick(e: MouseEvent) {
    const press = canvasPress;
    canvasPress = undefined;
    const hit = canvasHit;
    canvasHit = false;
    if (hit) return;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) return;
    if (inlineEdit()) return;
    selectBlock(undefined);
    selectTextTarget(undefined);
  }

  function handleCanvasDblClick(e: MouseEvent) {
    if (inlineEdit()) return;
    const r = document
      .getElementById("SLIDE_EDITOR_CANVAS")
      ?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const s = r.width / PAGE_WIDTH_DU;
    const point = { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
    const target = inlineTargetAt(point.x, point.y);
    if (!target) return;
    e.preventDefault();
    startInlineEdit(target, point);
  }

  function applyInlineText(target: InlineEditTarget, text: string) {
    if (textOfTarget(target) === text) return;
    if (target.kind === "block") {
      manuallyUpdateTempSlide(
        produce((draft) => {
          if (draft.type !== "content") return;
          const node = findNodeInDraft(draft.layout, target.id);
          if (node?.type === "item" && node.data?.type === "text") {
            node.data.markdown = text;
          }
        }),
      );
    } else {
      // An emptied optional field is removed, as the old side panel did.
      const optional = slideTextField(target.primitiveId)?.optional ?? false;
      manuallyUpdateTempSlide(
        produce((draft) => {
          (draft as unknown as Record<string, unknown>)[target.field] =
            text === "" && optional ? undefined : text;
        }),
      );
    }
  }

  // ── Block edits from the toolbar ──────────────────────────────────────────

  function updateBlock(
    blockId: string,
    updater: (block: ContentBlock) => ContentBlock,
  ) {
    if (tempSlide.type !== "content") return;
    // Path set, as setFigureBlockBundle below: a fresh reference on the path.
    const layout = updateBlockInLayout(tempSlide.layout, blockId, updater);
    (manuallyUpdateTempSlide as SetStoreFunction<ContentSlide>)("layout", layout);
  }

  // Switching a block's type keeps what it held under the old type, so
  // switching back restores it.
  const blockTypeCache = new Map<string, ContentBlock>();
  function handleBlockTypeChange(
    blockId: string,
    newType: "text" | "figure" | "image",
  ) {
    if (tempSlide.type !== "content") return;
    const hit = findById(tempSlide.layout, blockId);
    const current = hit?.node.type === "item" ? hit.node.data : undefined;
    if (!current || current.type === newType) return;
    blockTypeCache.set(`${blockId}_${current.type}`, unwrap(current));
    const cached = blockTypeCache.get(`${blockId}_${newType}`);
    if (cached) {
      updateBlock(blockId, () => cached);
    } else {
      manuallyUpdateTempSlide(
        reconcile({
          ...unwrap(tempSlide),
          layout: convertBlockType(
            unwrap(tempSlide as ContentSlide).layout,
            blockId,
            newType,
          ),
        }),
      );
    }
  }

  // A text block's markdown source, for what typing on the canvas can't
  // reach (code blocks, link targets) or anyone who prefers it.
  function openMarkdownSource(blockId: string) {
    setInlineEdit(undefined);
    const s = session();
    const yText = collabReady() && s
      ? (findNodeMap(s.doc, blockId)?.get("markdown") as Y.Text | undefined)
      : undefined;
    const initial = textOfTarget({ kind: "block", id: blockId }) ?? "";
    void withCanvasCovered(
      openComponent({
        element: MarkdownSourceModal,
        props: {
          productId: p.productId,
          yText,
          awareness: s?.awareness,
          undoManager: s?.undoManager,
          initial,
          onText: (md: string) =>
            applyInlineText({ kind: "block", id: blockId }, md),
        },
      }),
    );
  }

  // The block or field went away under the editor (deleted, retyped, a slide
  // type switch, a peer's structural edit): stop editing it.
  createEffect(() => {
    const ie = inlineEdit();
    if (ie && textOfTarget(ie.target) === undefined) setInlineEdit(undefined);
  });

  // Live co-editing (Milestone 3). The editor keeps mutating `tempSlide`; a
  // bridge syncs it to a shared CRDT doc. Degrades gracefully: if the collab
  // socket/room is unavailable, the session never becomes ready, pushLocal is a
  // no-op, and editing behaves exactly as before (tempSlide + explicit Save).
  const [collabReady, setCollabReady] = createSignal(false);
  // Signal (not a bare let) so the panel reactively picks up the session once it
  // opens: needed to bind the CodeMirror text editor to the block's Y.Text.
  const [session, setSession] = createSignal<SlideSession | null>(null);
  let removeLastUpdatedListener: (() => void) | null = null;
  // Count of sub-editors/modals (e.g. the visualization editor) currently open
  // over the slide canvas. While > 0 the peer-selection overlay is suppressed so
  // its body-portaled boxes don't float on top of that modal.
  const [subEditorOpen, setSubEditorOpen] = createSignal(0);
  // The layout-block id whose figure editor modal is currently open (co-editing
  // its config live in the shared doc). While set, the host's full-slide push
  // must NOT sync that figure's config (the modal owns it: its tempSlide copy
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
  let onLineageReset: (() => void) | undefined;
  const canEdit = () => canEditProduct(p.productId);
  const canUndoRedo = () => !!session() && collabReady() && canEdit();

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
    if (
      e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey &&
      !inlineEdit() && subEditorOpen() === 0
    ) {
      const el = e.target as HTMLElement | null;
      const typing = el?.closest(
        ".cm-editor, input, textarea, select, button, [contenteditable='true'], [role='dialog']",
      );
      const block = selectedBlockId();
      const title = selectedTextTarget();
      const target: InlineEditTarget | undefined = block
        ? { kind: "block", id: block }
        : title
        ? titleTarget(title)
        : undefined;
      if (!typing && target && textOfTarget(target) !== undefined) {
        e.preventDefault();
        startInlineEdit(target);
        return;
      }
    }
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

  // Live cursors: surface glue lives in slide_cursors.tsx
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
    // tempSlide pushes back a NO-OP here (syncSlideToDoc is idempotent: the doc
    // already matches, so no update is emitted and nothing echoes); a genuine
    // local edit emits an update. We deliberately do NOT gate this on a
    // "was this remote?" flag: that flag (skipNextPush) could get stuck true
    // when a remote reconcile made no tracked change, silently swallowing the
    // NEXT local edit: the cause of visualization edits not saving/syncing.
    setNeedsSave(true);
    const skipId = editingFigureBlockId();
    session()?.pushLocal(
      unwrap(tempSlide),
      skipId ? { skipFigureConfigForBlockIds: new Set([skipId]) } : undefined,
    );

    // Re-render the preview for both local and remote changes. Typing on the
    // canvas redraws at once: the canvas IS the text being typed.
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = null;
    }
    if (untrack(inlineEdit)) {
      void attemptGetPageInputs(unwrap(tempSlide));
      return;
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
        // The deck editor's live pair, the one the copilot mount is keyed on
        // (D15).
        getScope: () => p.scope,
        getTempSlide: () => tempSlide,
        setTempSlide,
        getDeckConfig: () => p.deckContext.getDeckConfig(),
        getSlideIds: () => p.deckContext.getSlideIds(),
        getSelectedSlideIds: () => p.deckContext.getSelectedSlideIds(),
      },
    );
    p.onApi?.({ flush });

    // Bind this slide to a shared CRDT document for live co-editing.
    const s = openSlideSession(
      p.productId,
      p.slideId,
      () => {
        const docSlide = materializeSlide(s.doc) as Slide;
        if (!collabReady()) {
          setCollabReady(true);
          // Local edits raced the first sync. Push them onto the shared doc
          // only while the doc still matches the slide this editor loaded:
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
        // idempotent, so no pre-comparison is needed (a full JSON compare
        // here serialized multi-MB figure bundles twice per remote keystroke).
        setTempSlide(reconcile(docSlide));
      },
      (errMsg, fatal) => {
        console.warn("Slide collab error:", errMsg);
        // The server discards rooms when the slide row is deleted or replaced
        // (delete, version restore): further edits here would silently go
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
        // connect): reconnect to re-derive auth; the resync then pushes the
        // rejected local ops. Otherwise the user really is read-only: say so
        // once instead of letting them type into a void.
        if (!fatal && errMsg === COLLAB_NO_EDIT_PERMISSION) {
          if (canEdit()) {
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
      () => onLineageReset?.(),
    );
    setSession(s);

    // Undo/redo mutate the shared doc DIRECTLY (not tempSlide), so pull the
    // result back into the store: the same adopt path a remote change takes.
    // The push the tracking effect then fires is idempotent (the doc already
    // matches), so nothing echoes back.
    const onUndoPop = () => {
      manuallyUpdateTempSlide(reconcile(materializeSlide(s.doc) as Slide));
    };
    const bindUndo = () => {
      undoMgr = s.undoManager;
      s.undoManager.on("stack-item-popped", onUndoPop);
      detachUndoPop = () => s.undoManager.off("stack-item-popped", onUndoPop);
    };
    bindUndo();
    // The room re-seeded and the session swapped its doc for the server's
    // lineage (collab.ts resetSlideLineage): the undo manager is new, an
    // inline editor still open is bound to the old doc, and the store adopts
    // the doc as it now stands.
    onLineageReset = () => {
      detachUndoPop?.();
      bindUndo();
      setInlineEdit(undefined);
      manuallyUpdateTempSlide(reconcile(materializeSlide(s.doc) as Slide));
    };
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
    p.onApi?.(undefined);
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    // Detach the undo hooks BEFORE the session closes (the session destroys
    // its manager and doc on close): a late Ctrl+Z must not drive a
    // destroyed doc.
    document.removeEventListener("keydown", handleEditorKeyDown);
    detachUndoPop?.();
    detachUndoPop = undefined;
    undoMgr = undefined;
    if (p.returnToContext) {
      restoreCopilotView(p.returnToContext);
    }
    // Last-chance flush for exits that bypass the back button (route change,
    // deck switch): if collab isn't persisting and edits are pending, save
    // best-effort. Fire-and-forget with no conflict modal: at teardown there
    // is no UI to ask; a conflicting concurrent save simply wins.
    if (needsSave() && !(session()?.isLive() ?? false)) {
      void serverActions.updateSlide({
        product_id: p.productId,
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
      product_id: p.productId,
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
          product_id: p.productId,
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

    const promise = serverActions.getSlide({
      product_id: p.productId,
      slide_id: p.slideId,
    });
    await _SLIDE_CACHE.setPromise(
      promise,
      { productId: p.productId, slideId: p.slideId },
      updateRes.data.lastUpdated,
    );
    await promise;

    setNeedsSave(false);
    setLastKnownServerTimestamp(updateRes.data.lastUpdated);

    return { success: true, data: { lastUpdated: updateRes.data.lastUpdated } };
  }

  // Before the deck swaps this slide out. Edits autosave via the collab
  // checkpoint; flush explicitly when collab isn't actually persisting RIGHT
  // NOW: never synced, or synced but the socket has since dropped (isLive,
  // not the latched collabReady: edits made while disconnected sit only in
  // the local doc and die with it on close).
  async function flush(): Promise<boolean> {
    if (needsSave() && !(session()?.isLive() ?? false)) {
      const res = await saveFunc();
      if (
        res.success &&
        res.data.conflictResolutionDecision === "user_chose_cancel"
      ) {
        // The user chose to keep editing rather than resolve the conflict:
        // the swap is off (it would discard the draft they chose to keep).
        return false;
      }
      // Every other outcome resolved the draft (saved, saved-as-new, or
      // explicitly discarded in favor of theirs): clear the dirty flag so the
      // onCleanup last-chance flush doesn't re-save a resolved/discarded draft.
      setNeedsSave(false);
    }
    return true;
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
      onCreateVisualization: async (blockId: string) => {
        setSelectedBlockId(blockId);
        await handleCreateVisualization();
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
      // The metric comes from the product package's authoring context; a
      // figure carried over from another package edits under this one (D4).
      const metric = p.authoringContext.metrics.find((m) => m.id === metricId);
      if (!metric) {
        await openAlert({
          text: t3({
            en: "This visualization's metric is not in the product's package",
            fr: "L'indicateur de cette visualisation n'est pas dans le paquet du produit",
            pt: "A métrica desta visualização não está no pacote do produto",
          }),
          intent: "danger",
        });
        return;
      }

      const applyFigureBundle = (bundle: FigureBundle) =>
        setFigureBlockBundle(blockId, bundle);

      // Live co-editing: bind the modal to this figure's config IN the shared
      // slide doc. Only when the session is live; otherwise the modal keeps its
      // classic Apply/Cancel flow (graceful degradation: WS down / not ready).
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
              canEdit,
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
              configSnapshot: structuredClone(unwrap(bundleConfig)),
              authoringContext: p.authoringContext,
              collabBinding,
            },
          }),
        );

        // On close, rebuild once from the final config (fresh items) under
        // the product's CURRENT pair, so applying an edit to a stale figure
        // also brings it up to date.
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

  // The ONE figure-authoring path (D3): the product package's presets and
  // the metric wizard, resolved under the product's pair. Inserting into an
  // empty block and replacing an existing figure are the same action.
  async function handleCreateVisualization() {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const result = await withCanvasCovered(
      openComponent({
        element: InsertFigureModal,
        props: {
          scope: p.scope,
          context: p.authoringContext,
          preselectedMetricId: null,
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

  // Path set, not reconcile: updateBlockInLayout returns a fresh reference on
  // the path so the CRDT sync always writes it (see its comment).
  function setFigureBlockBundle(blockId: string, bundle: FigureBundle) {
    if (tempSlide.type !== "content") return;
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
  }

  // ── Stale figures on this slide (D4) ────────────────────────────────────────
  // Compared against the product's live pair, so a reattach while the slide
  // editor is open lights the count without a remount.
  const staleContext = () => ({
    scope: p.scope,
    authoringContext: p.authoringContext,
  });
  const staleFigures = () =>
    tempSlide.type === "content"
      ? findStaleFiguresInLayout(tempSlide.layout, p.scope)
      : [];
  const [updatingFigures, setUpdatingFigures] = createSignal(false);

  // Re-resolve every stale figure on this slide. Failures are per figure:
  // the ones that cannot move keep their old bundle and report why.
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
      await openAlert({ text: failures.join("\n"), intent: "danger" });
    }
  }

  // The selected block's bundle, but only when it is stale: the block panel
  // renders the badge off this.
  const selectedStaleBundle = (): FigureBundle | undefined => {
    const blockId = selectedBlockId();
    if (!blockId) return undefined;
    return staleFigures().find((s) => s.blockId === blockId)?.bundle;
  };

  const toolbarJsx = () => (
    <div class="h-full w-full">
      <Show when={canEdit()}>
        <SlideToolbar
          tempSlide={tempSlide}
          setTempSlide={manuallyUpdateTempSlide}
          showCoverLogosByDefault={p.deckConfigSnapshot.logos.cover.showByDefault}
          showHeaderLogosByDefault={p.deckConfigSnapshot.logos.header.showByDefault}
          showFooterLogosByDefault={p.deckConfigSnapshot.logos.footer.showByDefault}
          hasGlobalFooterText={p.deckConfigSnapshot.globalFooterText !== undefined}
          canEdit={canEdit()}
          canUndoRedo={canUndoRedo()}
          onUndo={undo}
          onRedo={redo}
          onTypeChange={handleTypeChange}
          selectedBlockId={selectedBlockId()}
          selectedTextTarget={selectedTextTarget()}
          editing={inlineEdit()?.target}
          inlineApi={inlineApi()}
          onEditText={(target) => startInlineEdit(target)}
          onAddField={addTitleField}
          onEditMarkdown={openMarkdownSource}
          onShowLayoutMenu={handleShowLayoutMenu}
          menuRowHost={p.menuRowHost}
          onBlockTypeChange={handleBlockTypeChange}
          updateBlock={updateBlock}
          staleFigureBundle={selectedStaleBundle()}
          staleContext={staleContext()}
          onFigureUpdated={(bundle) => {
            const blockId = selectedBlockId();
            if (blockId) setFigureBlockBundle(blockId, bundle);
          }}
          onEditVisualization={handleEditVisualization}
          onCreateVisualization={handleCreateVisualization}
        />
      </Show>
    </div>
  );

  // The open slide's connection and save state, in the deck's header: the
  // report's save indicator, for slides. Collab supersedes the REST save
  // path, so "Live" means edits are streaming to the room AND the room is
  // checkpointing them.
  const saveIndicator = createMemo(() => {
    if (collabReady() && collabSocketOpen()) {
      if (docSaveFailing("slide", p.slideId)) {
        return {
          text: t3({
            en: "Not saving — retrying…",
            fr: "Non enregistré — nouvel essai…",
            pt: "Não está a guardar — a tentar novamente…",
          }),
          dot: "bg-danger",
        };
      }
      return {
        text: t3({ en: "Live", fr: "En direct", pt: "Em direto" }),
        dot: "bg-success",
      };
    }
    if (collabReady()) {
      return {
        text: t3({
          en: "Offline — reconnecting…",
          fr: "Hors ligne — reconnexion…",
          pt: "Offline — a reconectar…",
        }),
        dot: "bg-warning",
      };
    }
    return needsSave()
      ? {
        text: t3({
          en: "Unsaved changes",
          fr: "Modifications non enregistrées",
          pt: "Alterações não guardadas",
        }),
        dot: "bg-base-300",
      }
      : {
        text: t3({ en: "Connecting…", fr: "Connexion…", pt: "A ligar…" }),
        dot: "bg-base-300",
      };
  });

  const statusJsx = () => (
    <div
      class="ui-text-caption flex items-center gap-1.5 whitespace-nowrap"
      data-tour="slide-save-status"
    >
      <div
        class="h-1.5 w-1.5 flex-none rounded-full"
        classList={{ [saveIndicator().dot]: true }}
      />
      <span>{saveIndicator().text}</span>
    </div>
  );

  return (
    <EditorWrapper>
      <div class="flex h-full w-full flex-col">
        <Show when={p.toolbarHost} fallback={<div data-cursor-zone="header">{toolbarJsx()}</div>}>
          {(host) => <Portal mount={host()}>{toolbarJsx()}</Portal>}
        </Show>
        <Show when={p.statusHost}>
          {(host) => <Portal mount={host()}>{statusJsx()}</Portal>}
        </Show>
        {/* Room checkpoint health, for a slide editor with nowhere to put the
            dot: edits relay live between peers, but the server can't persist
            them right now. */}
        <Show
          when={
            !p.statusHost &&
            collabReady() &&
            collabSocketOpen() &&
            docSaveFailing("slide", p.slideId)
          }
        >
          <div class="ui-text-caption border-b flex items-center gap-1.5 px-3 py-1">
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
        <div class="min-h-0 flex-1">
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
            {/* Not keyed: PageHolder redraws in place on new inputs, which
                typing on the canvas relies on (a remount per keystroke
                blanks the canvas and loses its measured page). */}
            <Show
              when={
                pageInputs().status === "ready"
                  ? (pageInputs() as { status: "ready"; data: PageInputs }).data
                  : undefined
              }
            >
              {(readyPageInputs) => (
                <div
                  class="ui-pad-lg bg-base-200 h-full w-full overflow-auto"
                  onPointerDown={handleCanvasPointerDown}
                  onClick={handleCanvasClick}
                  onDblClick={handleCanvasDblClick}
                >
                  <PageHolder
                    pageInputs={readyPageInputs()}
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
                      canvasHit = true;
                      if (target.type === "layoutItem") {
                        selectBlock(target.node.id);
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
                    self={inlineEdit()
                      ? { blockId: undefined, textTarget: undefined }
                      : { blockId: selectedBlockId(), textTarget: selectedTextTarget() }}
                  />
                </div>
              )}
            </Show>
            <Show when={inlineEdit()} keyed>
              {(ie) => (
                <InlineTextEditor
                  target={ie.target}
                  measured={measuredPage()}
                  canvasId="SLIDE_EDITOR_CANVAS"
                  session={session()}
                  collabReady={collabReady()}
                  initialText={untrack(() => textOfTarget(ie.target)) ?? ""}
                  initialPoint={ie.point}
                  onText={(text) => applyInlineText(ie.target, text)}
                  onExit={() => setInlineEdit(undefined)}
                  covered={subEditorOpen() > 0}
                  selectAll={ie.selectAll}
                  onApi={setInlineApi}
                />
              )}
            </Show>
            {/* Figma-style live cursors. Outside the <Show> above (which
                unmounts while a render errors) so the sprites, and their
                transform transitions, survive re-renders. */}
            <SlideEditorCursors
              slideId={p.slideId}
              awareness={() => session()?.awareness}
              enabled={slideCursorsEnabled}
              covered={() => subEditorOpen() > 0}
            />
          </div>
        </div>
      </div>
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
// slide currently being edited, and around this user's OWN selection in the
// canvas's hover blue (the outline they saw while hovering stays once they
// click, without the hover fill), so what a click selected is never in doubt.
// It goes while the element is being typed into. A DOM overlay is required
// because panther's canvas (PageHolder) is unmodifiable and exposes no
// highlight-by-id API. The boxes are positioned in viewport coordinates
// inside a Portal so a transformed modal ancestor cannot offset them, and
// recompute on resize/scroll.
const OWN_SELECTION_COLOR = "rgba(0, 112, 243, 0.8)";

function PeerSelectionOverlay(p: {
  measured: MeasuredPage | undefined;
  slideId: string;
  suppressed: boolean;
  // This user's selection on the slide (a body block, or a title field);
  // neither while it is being typed into.
  self: { blockId: string | undefined; textTarget: string | undefined };
}) {
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);

  // The covering backstop below only re-runs when something bumps, and a
  // modal or editor opening over the canvas (the deck's settings, a modal in
  // <body>) is a DOM change, not a resize or scroll: it left the frame
  // showing until the next click. So DOM changes bump too, coalesced to one
  // per frame (typing on the canvas mutates the DOM constantly).
  let bodyObserver: MutationObserver | undefined;
  let bumpFrame: number | undefined;
  const bumpSoon = () => {
    if (bumpFrame !== undefined) return;
    bumpFrame = requestAnimationFrame(() => {
      bumpFrame = undefined;
      bump();
    });
  };
  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    bodyObserver = new MutationObserver(bumpSoon);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  });
  onCleanup(() => {
    window.removeEventListener("resize", bump);
    window.removeEventListener("scroll", bump, true);
    bodyObserver?.disconnect();
    if (bumpFrame !== undefined) cancelAnimationFrame(bumpFrame);
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
    const own = p.self.blockId || p.self.textTarget ? p.self : undefined;
    if (peers.length === 0 && !own) return [];
    const canvas = document.getElementById("SLIDE_EDITOR_CANVAS");
    if (!canvas) return [];
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [];
    // Backstop for any other covering modal: if the slide canvas isn't the
    // topmost element at its own center, something is over it: suppress.
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
      // The outer frame's colour: this user's own when the element is theirs.
      color: string;
      editors: { name: string; color: string; editingFigure: boolean }[];
    }[] = [];
    const byTarget = new Map<string, (typeof out)[number]>();
    const entryFor = (
      blockId: string | undefined,
      textTarget: string | undefined,
      color: string,
    ) => {
      const targetKey = blockId ? `block:${blockId}` : `text:${textTarget}`;
      const rcd = blockId ? blockRects.get(blockId) : textRects.get(textTarget!);
      if (!rcd) return undefined;
      let entry = byTarget.get(targetKey);
      if (!entry) {
        // A 2px border centred on the element's edge, where the canvas
        // strokes its hover outline: one px out, one px in.
        entry = {
          key: targetKey,
          left: r.left + rcd.x * sx - 1,
          top: r.top + rcd.y * sy - 1,
          width: rcd.w * sx + 2,
          height: rcd.h * sy + 2,
          color,
          editors: [],
        };
        byTarget.set(targetKey, entry);
        out.push(entry);
      }
      return entry;
    };
    // This user's own frame first, so its colour is the outer border and a
    // collaborator on the same element takes the inset ring.
    if (own) entryFor(own.blockId, own.textTarget, OWN_SELECTION_COLOR);
    for (const peer of peers) {
      const entry = entryFor(
        peer.selectedBlockId || undefined,
        peer.selectedTextTarget || undefined,
        peer.color,
      );
      if (!entry) continue;
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
                border: `2px solid ${b.color}`,
              }}
            >
              {/* Co-editors get concentric inset borders so every editor's
                  colour stays visible on the shared element. */}
              <For each={b.editors.filter((e) => e.color !== b.color)}>
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
                      class="font-700 rounded px-1 text-xs whitespace-nowrap"
                      style={{ "background-color": e.color, color: "#ffffff" }}
                    >
                      {e.name}
                      {e.editingFigure
                        ? " " +
                          t3({ en: "✎ visualization", fr: "✎ visualisation", pt: "✎ visualização" })
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
