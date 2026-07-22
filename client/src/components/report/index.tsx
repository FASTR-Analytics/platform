import {
  canonicalJson,
  type FigureBlock,
  type FigureBundle,
  findReportBodyText,
  findReportFigureConfigMap,
  type ImageBlock,
  materializeReport,
  type PresentationObjectConfig,
  type ProjectState,
  type ReportDocContent,
  type ResultsValue,
  t3,
} from "lib";
import {
  AIToolFailure,
  Button,
  ButtonGroup,
  type EditorComponentProps,
  FrameLeft,
  FrameLeftResizable,
  FrameTop,
  getEditorWrapper,
  HeadingBar,
  MarkdownPresentationJsx,
  openAlert,
  openComponent,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { serverActions, _SERVER_HOST } from "~/server_actions";
import {
  collabSocketOpen,
  docSaveFailing,
  openReportSession,
  otherPeers,
  type ReportSession,
  setCollabView,
} from "~/state/project/collab";
import { PresenceAvatars } from "~/components/slide_deck/presence_avatars";
import { ReportEditorCursors } from "~/components/_shared/cursors/report_cursors";
import { addLastUpdatedListener } from "~/state/project/t1_sse";
import { projectState } from "~/state/project/t1_store";
import { setShowAi, showAi } from "~/state/t4_ui";
import { makeFigureBundleFromFetchedData } from "~/generate_visualization/mod";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { useAIProjectContext } from "../project_ai/context";
import type {
  ReportEditProposalResult,
  ReportEditProposal,
} from "../project_ai/types";
import {
  projectAIViewController,
  restoreProjectAIView,
  type ProjectAIViewState,
} from "../project_ai/ai_views";
import { formatLineRanges, type SkippedRange } from "./rebase_edits";
import { SelectVisualizationForSlide } from "../slide_deck/select_visualization_for_slide";
import { resolveFigureAndGeoFromVisualization } from "~/generate_visualization/mod";
import { VisualizationEditor } from "../visualization";
import type { VizFigureCollabBinding } from "../visualization";
import { AddVisualization } from "../project/add_visualization";
import { snapshotForVizEditor } from "../_editor_snapshot";
import {
  EDITOR_PANE_MAX_REM,
  ReportEditor,
  type ReportEditorApi,
} from "./report_editor";
import { REPORT_MARKDOWN_STYLE } from "./report_markdown_style";
import {
  ReportEmbedEditor,
  type SelectedReportEmbed,
} from "./ReportEmbedEditor";
import { ReportImagePicker } from "./report_image_picker";
import { ReportMarkdownDiff } from "./ReportMarkdownDiff";
import { ReportFigureEmbed } from "./ReportFigureEmbed";
import { DownloadReport } from "./download_report";
import { lineToPreviewTop, previewTopToLine } from "./scroll_sync";
import { VersionHistoryEditor } from "../version_history";

type EmbedKind = "figure" | "image";
type EmbedSelection = { kind: EmbedKind; id: string };
type ReportMode = "edit" | "view" | "split";

type Props = EditorComponentProps<
  {
    projectState: ProjectState;
    reportId: string;
    reportLabel: string;
    returnToContext?: ProjectAIViewState;
  },
  undefined
>;

const AUTOSAVE_MS = 800;

// Left sidebar (embed editor) width — same in Edit & Split. Also the right-side
// pad the editor reserves so its centered column lines up with the View preview.
const SIDEBAR_WIDTH_PX = 240;

// Captions live inside ![caption](src) — strip chars that would break the token.
function sanitizeCaption(s: string): string {
  return s
    .replace(/[[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EMBED_TOKEN_RE = /!\[[^\]]*\]\((figure|image):([^)\s]+)\)/g;
function referencedEmbedIds(body: string): {
  figures: Set<string>;
  images: Set<string>;
} {
  const figures = new Set<string>();
  const images = new Set<string>();
  EMBED_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMBED_TOKEN_RE.exec(body)) !== null) {
    if (m[1] === "figure") figures.add(m[2]);
    else images.add(m[2]);
  }
  return { figures, images };
}

export function ProjectReport(p: Props) {
  const projectId = p.projectState.id;
  const { notifyAI } = useAIProjectContext();
  const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
    getEditorWrapper();
  // Count of sub-editors (figure modal, pickers, version history) currently
  // covering the panes. While > 0 the report cursor broadcaster is off — the
  // figure modal broadcasts fig:-scoped pointers on this SAME session
  // awareness, and two broadcasters must not fight over the "pointer" field.
  const [panesCovered, setPanesCovered] = createSignal(0);
  async function withPanesCovered<T>(opening: Promise<T>): Promise<T> {
    setPanesCovered((n) => n + 1);
    try {
      return await opening;
    } finally {
      setPanesCovered((n) => n - 1);
    }
  }

  const [isLoading, setIsLoading] = createSignal(true);
  const [label, setLabel] = createSignal(p.reportLabel);
  const [body, setBody] = createSignal("");
  const [figures, setFigures] = createSignal<Record<string, FigureBlock>>({});
  const [images, setImages] = createSignal<Record<string, ImageBlock>>({});
  // The lastUpdated we last saw from the server — round-tripped for optimistic
  // concurrency (PLAN_REPORTS.md §4).
  const [lastUpdated, setLastUpdated] = createSignal<string>("");
  const [showConflictBanner, setShowConflictBanner] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>();
  // Autosave indicator. "unsaved" = an edit is pending in the debounce window.
  const [saveStatus, setSaveStatus] = createSignal<
    "saved" | "unsaved" | "saving" | "error"
  >("saved");
  const [lastSavedAt, setLastSavedAt] = createSignal<string>("");
  // The embed whose editor is shown in the ever-present left panel.
  const [selectedEmbed, setSelectedEmbed] = createSignal<
    EmbedSelection | undefined
  >();
  // Three modes — edit (CodeMirror only), split (editor + preview, the
  // default), view (read-only HTML preview only). AI is mode-agnostic: the
  // editor stays mounted in every mode.
  const [mode, setMode] = createSignal<ReportMode>("split");
  // Live collab (Yjs). collabReady LATCHES at the first report_sync: from then
  // on the room's checkpoints own persistence and the REST autosave is off for
  // good — even while disconnected (edits accumulate in the local doc and the
  // reconnect catch-up ships them; a parallel REST save would double-apply).
  const [collabReady, setCollabReady] = createSignal(false);
  // A FATAL collab error (report deleted / room gone): further edits would be
  // silently dropped by the server, so the editor locks read-only and says so.
  const [collabFatal, setCollabFatal] = createSignal<string | undefined>();
  // The figure registry id whose editor modal is open (co-editing its config
  // live in the shared doc). While set, the figure-registry push skips that
  // figure's config (the modal owns it); presence advertises it to peers.
  const [editingFigureId, setEditingFigureId] = createSignal<
    string | undefined
  >(undefined);
  const [session, setSession] = createSignal<ReportSession | null>(null);
  // Content as fetched at mount, for the first-sync merge rule.
  let loadedSnapshot: ReportDocContent | undefined;
  let removeLastUpdatedListener: (() => void) | undefined;

  // The figure-editor sidebar collapses in View, so clear the embed selection
  // when entering View. The CM editor is visible in Edit & Split — re-measure it when it
  // (re)appears (e.g. coming back from View where it was hidden). Also align the
  // newly revealed pane to targetLine (§8 scroll-sync): when the editor reappears
  // after View, scroll it to targetLine; when the preview mounts after Edit,
  // scroll it to targetLine and arm figure-settle. One effect (not two) so refresh
  // runs before scrollToLine and they can't race.
  createEffect(
    on(mode, (m, prev) => {
      if (m === "view") setSelectedEmbed(undefined);
      if (m !== "view") editorApi?.refresh();
      if (prev === undefined) return; // initial render sits at the top

      const editorRevealed = prev === "view" && m !== "view";
      const previewMounted = prev === "edit" && m !== "edit";
      if (!editorRevealed && !previewMounted) return;

      // Defer so the just-shown pane has laid out (CM measure / preview mount).
      queueMicrotask(() =>
        requestAnimationFrame(() => {
          if (mode() !== m) return; // toggled again mid-schedule
          if (editorRevealed) {
            if (targetAtBottom) editorApi?.scrollToBottom();
            else editorApi?.scrollToLine(targetLine);
          }
          if (previewMounted && previewEl) {
            if (targetAtBottom) scrollElToBottom(previewEl);
            else previewEl.scrollTop = lineToPreviewTop(previewEl, targetLine);
            armFigureSettle();
          }
        }),
      );
    }),
  );

  // Resolve an embed token to its live render — same funnel as the CM widget, so
  // a figure/image looks identical in Edit and View. Plain markdown image URLs
  // return undefined → MarkdownPresentationJsx falls back to a plain <img>.
  function renderEmbed(
    src: string,
    alt: string,
    line?: number,
  ): JSX.Element | undefined {
    const fig = /^figure:(.+)$/.exec(src);
    if (fig) {
      const fb = figures()[fig[1]];
      return fb ? (
        <div
          class="ui-pad my-4 rounded border"
          data-line={line}
          data-embed-id={fig[1]}
        >
          <ReportFigureEmbed figure={fb} onMeasured={() => armFigureSettle()} />
        </div>
      ) : (
        <div class="text-danger text-xs" data-line={line}>
          {t3({
            en: "Missing visualization:",
            fr: "Visualisation manquante :",
            pt: "Visualização em falta:",
          })}{" "}
          {fig[1]}
        </div>
      );
    }
    const img = /^image:(.+)$/.exec(src);
    if (img) {
      const ib = images()[img[1]];
      return ib ? (
        <img
          class="w-full"
          src={assetUrl(ib.imgFile)}
          alt={alt}
          data-line={line}
          data-embed-id={img[1]}
        />
      ) : (
        <div class="text-danger text-xs" data-line={line}>
          {t3({
            en: "Missing image:",
            fr: "Image manquante :",
            pt: "Imagem em falta:",
          })}{" "}
          {img[1]}
        </div>
      );
    }
    return undefined;
  }

  let editorApi: ReportEditorApi | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // Suppresses the "user edited" AI notification while we apply an AI-accepted
  // edit through the editor (setBody also fires the CM change listener).
  let applyingProgrammaticEdit = false;
  // stillValid()'s unmount half (see proposeEdit below) — flips false in
  // onCleanup, before the view controller leaves editing_report. Checked ONLY at
  // accept time by panther's approval engine, so a stale accept auto-declines
  // instead of committing against a torn-down editor.
  let mounted = true;

  // ── scroll sync (PLAN_REPORT_SCROLL_SYNC.md) ────────────────────────────────
  // The source line is the canonical coordinate; pixel positions are derived live
  // from the DOM at apply-time. targetLine is fractional, 0-based.
  let targetLine = 0;
  // Edge-snap: when the driving pane is scrolled to its end, the follower snaps
  // to its end too (the top-line coordinate saturates near the bottom, so the
  // last screenful can't be top-aligned). Tracked so mode-switch / figure-settle
  // also pin to the bottom.
  let targetAtBottom = false;
  // Breaks the echo loop: a programmatic scroll on one pane fires that pane's
  // scroll event, which must not re-drive the other. Cleared on the next rAF
  // because programmatic scrollTop writes dispatch their scroll event async.
  let syncing = false;
  // The preview's scroll container — set on preview mount, cleared on unmount.
  let previewEl: HTMLDivElement | undefined;

  // Figure-settle (§7): figures measure their height a few frames after mount, so
  // a one-shot align can land before they settle. While armed (and the user
  // hasn't taken over), re-project targetLine as heights change.
  let settleArmed = false;
  let settleUntouched = true;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let ceilingTimer: ReturnType<typeof setTimeout> | undefined;

  function disarmSettle() {
    settleArmed = false;
    if (quietTimer) clearTimeout(quietTimer);
    if (ceilingTimer) clearTimeout(ceilingTimer);
    quietTimer = undefined;
    ceilingTimer = undefined;
  }

  // Re-arm the quiet window (~250 ms with no further height change → disarm).
  function bumpQuiet() {
    if (!settleArmed) return;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(disarmSettle, 250);
  }

  // Arm the settle window. No-op once the user has taken over this mount, so a
  // late figure measure can't re-enable auto-scroll after a manual scroll.
  function armFigureSettle() {
    if (!settleUntouched) return;
    settleArmed = true;
    if (ceilingTimer) clearTimeout(ceilingTimer);
    ceilingTimer = setTimeout(disarmSettle, 2000); // hard ceiling
    bumpQuiet();
  }

  // The preview's ResizeObserver calls this as figure heights settle.
  function onPreviewResize() {
    if (!settleArmed || !settleUntouched || !previewEl) return;
    bumpQuiet();
    const next = targetAtBottom
      ? previewEl.scrollHeight - previewEl.clientHeight
      : lineToPreviewTop(previewEl, targetLine);
    if (Math.abs(next - previewEl.scrollTop) < 1) return; // skip no-ops
    syncing = true; // §7: must not masquerade as a user scroll
    previewEl.scrollTop = next;
    requestAnimationFrame(() => (syncing = false));
  }

  // First genuine user gesture in the preview ends the settle window (one-shot).
  function onPreviewUserGesture() {
    settleUntouched = false;
    disarmSettle();
  }

  // Scrollable AND at the end (a non-scrollable pane isn't "at bottom").
  function isElAtBottom(el: HTMLElement) {
    return (
      el.scrollHeight > el.clientHeight + 1 &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    );
  }
  function scrollElToBottom(el: HTMLElement) {
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }

  // Editor scrolled (fires in Edit + Split). In Split, drive the preview.
  function onEditorScroll() {
    if (syncing) return;
    const line = editorApi?.getTopLine();
    if (line === undefined) return;
    targetLine = line;
    targetAtBottom = editorApi?.isAtBottom() ?? false;
    if (mode() === "split" && previewEl) {
      syncing = true;
      if (targetAtBottom) scrollElToBottom(previewEl);
      else previewEl.scrollTop = lineToPreviewTop(previewEl, line);
      requestAnimationFrame(() => (syncing = false));
    }
  }

  // Preview scrolled (fires in View + Split). In Split, drive the editor.
  function onPreviewScroll() {
    if (syncing || !previewEl) return;
    targetLine = previewTopToLine(previewEl);
    targetAtBottom = isElAtBottom(previewEl);
    if (mode() === "split") {
      syncing = true;
      if (targetAtBottom) editorApi?.scrollToBottom();
      else editorApi?.scrollToLine(targetLine);
      requestAnimationFrame(() => (syncing = false));
    }
  }

  const canConfigure = () =>
    projectState.thisUserPermissions.can_configure_reports &&
    !projectState.isLocked;

  function assetUrl(imgFile: string) {
    return `${_SERVER_HOST}/${imgFile}`;
  }

  // Never rewind lastUpdated when out-of-order save responses resolve (M3).
  function bumpLastUpdated(ts: string) {
    setLastUpdated((prev) => (ts > prev ? ts : prev));
  }

  const saveIndicator = createMemo(() => {
    // The report/room is gone (deleted, not found) — nothing persists anymore.
    if (collabFatal()) {
      return {
        text: t3({
          en: "No longer available",
          fr: "N'est plus disponible",
          pt: "Já não está disponível",
        }),
        dot: "bg-danger",
      };
    }
    // Live collab supersedes the REST autosave states: edits stream to the
    // server continuously and the room checkpoints them.
    if (collabReady() && collabSocketOpen()) {
      // Edits relay live, but the room's checkpoint saves are erroring — say
      // so rather than claiming "Live" while nothing persists.
      if (docSaveFailing("report", p.reportId)) {
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
    switch (saveStatus()) {
      case "saving":
        return {
          text: t3({ en: "Saving…", fr: "Enregistrement…", pt: "A guardar…" }),
          dot: "bg-warning",
        };
      case "unsaved":
        return {
          text: t3({
            en: "Unsaved changes",
            fr: "Modifications non enregistrées",
            pt: "Alterações não guardadas",
          }),
          dot: "bg-base-300",
        };
      case "error":
        return {
          text: t3({
            en: "Save failed",
            fr: "Échec de l'enregistrement",
            pt: "Falha ao guardar",
          }),
          dot: "bg-danger",
        };
      case "saved":
      default:
        return {
          text: lastSavedAt()
            ? t3({
                en: `Saved ${lastSavedAt()}`,
                fr: `Enregistré ${lastSavedAt()}`,
                pt: `Guardado ${lastSavedAt()}`,
              })
            : t3({ en: "Saved", fr: "Enregistré", pt: "Guardado" }),
          dot: "bg-success",
        };
    }
  });

  // Caption for an embed = the markdown alt text in its token.
  function captionForId(kind: EmbedKind, id: string): string {
    const re = new RegExp(
      `!\\[([^\\]]*)\\]\\(${kind}:${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
    );
    return re.exec(body())?.[1] ?? "";
  }

  const selectedEmbedDetail = createMemo<SelectedReportEmbed | undefined>(
    () => {
      const sel = selectedEmbed();
      if (!sel) return undefined;
      if (sel.kind === "figure") {
        const fb = figures()[sel.id];
        if (!fb) return undefined;
        return {
          kind: "figure",
          id: sel.id,
          caption: captionForId("figure", sel.id),
          figureBlock: fb,
        };
      }
      const ib = images()[sel.id];
      if (!ib) return undefined;
      return {
        kind: "image",
        id: sel.id,
        caption: captionForId("image", sel.id),
        imageBlock: ib,
      };
    },
  );

  // Advertise which report this user has open, which embed they have
  // selected (peers draw a presence border around it in their preview), and
  // which figure modal they are inside. One reactive effect — imperative
  // setCollabView calls elsewhere would fight it.
  createEffect(() => {
    setCollabView({
      reportId: p.reportId,
      selectedBlockId: selectedEmbed()?.id,
      editingFigureId: editingFigureId(),
    });
  });

  onMount(async () => {
    const res = await serverActions.getReportDetail({
      projectId,
      report_id: p.reportId,
    });
    if (res.success) {
      setLabel(res.data.label);
      setBody(res.data.body);
      setLastUpdated(res.data.lastUpdated);

      // Prune orphan registry entries at load (PLAN_REPORTS.md §11).
      const refs = referencedEmbedIds(res.data.body);
      const prunedFigures = Object.fromEntries(
        Object.entries(res.data.figures).filter(([id]) => refs.figures.has(id)),
      );
      const prunedImages = Object.fromEntries(
        Object.entries(res.data.images).filter(([id]) => refs.images.has(id)),
      );
      setFigures(prunedFigures);
      setImages(prunedImages);
      if (
        Object.keys(prunedFigures).length !==
        Object.keys(res.data.figures).length
      ) {
        void persistFigures(prunedFigures);
      }
      if (
        Object.keys(prunedImages).length !== Object.keys(res.data.images).length
      ) {
        void persistImages(prunedImages);
      }

      // Snapshot the UNPRUNED fetch for the first-sync merge rule (the room
      // seeds from the same DB row, so this is what its doc should equal).
      loadedSnapshot = {
        body: res.data.body,
        figures: res.data.figures,
        images: res.data.images,
      };

      // Bind this report to a shared CRDT document for live co-editing.
      const s = openReportSession(
        p.reportId,
        onRemoteReport,
        (errMsg, fatal) => {
          console.warn("Report collab error:", errMsg);
          // Fatal ⇔ the report/room is gone (deleted, not found): the server
          // silently drops every further update, so lock the editor instead of
          // letting the user type into a void that still says "Live".
          if (fatal) setCollabFatal(errMsg);
        },
      );
      setSession(s);

      // Keep the optimistic-save timestamp fresh as server-side checkpoints
      // bump last_updated, so the offline/fallback flush won't raise a
      // spurious conflict against collab's own autosaves.
      removeLastUpdatedListener = addLastUpdatedListener(
        (tableName, ids, ts) => {
          if (tableName === "reports" && ids.includes(p.reportId)) {
            bumpLastUpdated(ts);
          }
        },
      );
    }
    setIsLoading(false);

    projectAIViewController.setView(
      "editing_report",
      { reportId: p.reportId, reportLabel: label() },
      {
      getBody: () => body(),
      getFigures: () => figures(),
      getImages: () => images(),
      getSelection: () => editorApi?.getSelection(),
      proposeEdit: (proposal): ReportEditProposalResult => {
        // The base the proposal was computed from. Every proposing tool builds
        // newBody from getBody() with only synchronous work before calling
        // proposeEdit (from inside its own approval.propose), so body() here
        // IS that base — captured for the rebase on accept (collaborators may
        // edit while the diff is under review).
        const baseBody = body();
        if (proposal.newBody === baseBody) {
          return {
            skip:
              "The proposed body is IDENTICAL to the current body — nothing to review, so no accept/reject dialog was shown. Re-read with get_report_editor and propose an actual change.",
          };
        }
        return {
          preview: {
            title: proposal.summary,
            diff: { before: baseBody, after: proposal.newBody },
          },
          // Stages the SAME locking modal (openComponent backdrop) as before
          // migration; the signal aborts on an external resolution (Stop) and
          // the modal closes itself (see ReportMarkdownDiff's signal prop) —
          // panther has no dismissal API for an already-open dialog otherwise.
          customProposalUI: (signal) =>
            openComponent({
              element: ReportMarkdownDiff,
              props: {
                oldText: baseBody,
                newText: proposal.newBody,
                summary: proposal.summary,
                signal,
              },
            }).then((accepted) => accepted === true),
          // Guards the dangerous half of the proposeEdit orphan: a decision
          // that resolves "accepted" after this editor unmounted (or the AI
          // context moved on to something else while it was still mounted)
          // must NOT run commit against torn-down editor state. Checked only
          // at accept — panther maps a false return to the standardized
          // stale/auto_declined outcome instead of calling commit.
          stillValid: () =>
            mounted && projectAIViewController.current().id === "editing_report",
          // Runs ONLY after an accepted, still-valid decision — same rebase-
          // over-collaborator-edits + persist logic as before migration.
          commit: async () => {
            const skipped = await applyProposal(proposal, baseBody);
            return { skipped };
          },
        };
      },
      applyFigureUpdate: (figureId, block) => updateFigure(figureId, block),
      },
    );
  });

  // Flush a pending debounced body save immediately (before unmount/accept) so a
  // save in the autosave window is never dropped (H3).
  function flushBodySave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      return persistBody(body());
    }
    return Promise.resolve();
  }

  // Apply an accepted AI proposal to the editor and persist it. The proposal
  // is REBASED over anything that changed while it was under review, so a
  // collaborator's concurrent edits survive; hunks that collide with a
  // concurrent edit are skipped (returned, surfaced to the user + the AI).
  async function applyProposal(
    prop: ReportEditProposal,
    baseBody: string,
  ): Promise<SkippedRange[]> {
    if (prop.addFigures) {
      // Added before the body so an inserted token never dangles. If the
      // token's hunk ends up skipped, the figure is orphaned — harmless (the
      // load-time prune removes unreferenced registry entries).
      const prev = figures();
      const next = { ...prev, ...prop.addFigures };
      setFigures(next);
      if (!(await persistFigures(next))) {
        // Don't apply a body whose tokens reference figures the server never
        // got — that would surface as "Missing visualization" after reload.
        setFigures(prev);
        throw new AIToolFailure(
          "The user ACCEPTED the edit, but saving its figure(s) to the server FAILED, so the edit was NOT applied. Tell the user to check their connection and try again.",
        );
      }
    }
    applyingProgrammaticEdit = true;
    const res = editorApi?.applyRebasedBody(baseBody, prop.newBody) ?? {
      applied: 0,
      skipped: [] as SkippedRange[],
      firstAppliedLine: undefined,
    };
    applyingProgrammaticEdit = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    // Live collab persists via the room checkpoint (a REST save here would
    // double-apply after a reconnect catch-up — same rule as the autosave).
    // Note body(), not prop.newBody: skipped hunks mean the actual text can
    // differ from the proposal.
    if (!collabReady()) {
      await persistBody(body());
    }
    if (res.skipped.length > 0) {
      const lines = formatLineRanges(res.skipped);
      const one = res.skipped.length === 1;
      void openAlert({
        text: t3({
          en: `The AI's change${one ? "" : "s"} on line${
            one && res.skipped[0].fromLine === res.skipped[0].toLine ? "" : "s"
          } ${lines} ${one ? "was" : "were"} not applied because a collaborator is editing that text. Re-run the AI if you still want ${
            one ? "it" : "them"
          }.`,
          fr: `La ou les modifications de l'IA aux lignes ${lines} n'ont pas été appliquées car un collaborateur modifie ce texte. Relancez l'IA si vous les souhaitez toujours.`,
          pt: `A(s) alteração(ões) da IA na(s) linha(s) ${lines} não foi/foram aplicada(s) porque um colaborador está a editar esse texto. Volte a executar a IA se ainda a(s) quiser.`,
        }),
      });
    }
    editorApi?.refresh();
    // Align both panes to the first APPLIED change so the accepted edit lands
    // on screen (same defer pattern as the mode-switch effect: let layout
    // settle first). firstAppliedLine is in current-doc coordinates from the
    // rebase; absent when nothing applied (every hunk skipped) — don't move.
    const changedLine = res.firstAppliedLine;
    if (changedLine !== undefined) {
      targetLine = changedLine;
      targetAtBottom = false;
      queueMicrotask(() =>
        requestAnimationFrame(() => {
          editorApi?.scrollToLine(changedLine);
          if (previewEl) {
            previewEl.scrollTop = lineToPreviewTop(previewEl, changedLine);
            armFigureSettle();
          }
        }),
      );
    }
    return res.skipped;
  }

  onCleanup(() => {
    mounted = false;
    const s = session();
    if (collabFatal()) {
      // The report/room is gone — nothing to flush to.
    } else if (!collabReady()) {
      // Collab never became ready: the REST autosave owns persistence.
      void flushBodySave();
    } else if (s && !s.isLive()) {
      // Collab has edits the server never received (socket down, no reconnect
      // before close): best-effort REST flush of the shared doc's state. If
      // another user's room is still live server-side, the chokepoint merges
      // this instead of clobbering.
      const content = materializeReport(s.doc);
      void serverActions.updateReportBody({
        projectId,
        report_id: p.reportId,
        body: content.body,
        expectedLastUpdated: lastUpdated(),
        overwrite: true,
      });
      void serverActions.updateReportFigures({
        projectId,
        report_id: p.reportId,
        figures: content.figures,
      });
      void serverActions.updateReportImages({
        projectId,
        report_id: p.reportId,
        images: content.images,
      });
    }
    // Live: nothing to flush — the room finalizes/checkpoints server-side.
    s?.close();
    setSession(null);
    removeLastUpdatedListener?.();
    removeLastUpdatedListener = undefined;
    // Clear the "in this report" presence when the editor closes.
    setCollabView({});
    if (p.returnToContext) restoreProjectAIView(p.returnToContext);
    else projectAIViewController.setView("viewing_reports");
  });

  // ── live collab ──────────────────────────────────────────────────────────

  // Applies shared-doc state to the local signals. Fired on report_sync (first
  // sync + reconnects) and on every relayed remote update.
  function onRemoteReport() {
    const s = session();
    if (!s) return;
    const docContent = materializeReport(s.doc);
    if (!collabReady()) {
      // First sync. Push pre-sync local edits onto the shared doc only while
      // it still equals the content this editor loaded — pushing over a
      // diverged doc would force it to our draft and delete another user's
      // edits. If peers got there first, adopt their state.
      const hasPendingLocal =
        saveStatus() !== "saved" || saveTimer !== undefined;
      if (
        hasPendingLocal &&
        loadedSnapshot &&
        canonicalJson(docContent) === canonicalJson(loadedSnapshot)
      ) {
        s.pushLocal({ body: body(), figures: figures(), images: images() });
      } else {
        setBody(docContent.body);
        setFigures(docContent.figures);
        setImages(docContent.images);
      }
      // Collab owns persistence from here: cancel any pending REST autosave.
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
      }
      setCollabReady(true); // flips the editor's collab prop → yCollab rebind
      return;
    }
    // Ongoing remote updates: the body flows straight into the editor via the
    // yCollab binding (and back into the body signal via onBodyChange); only
    // the registries need adopting here. reconcile-free set keeps unchanged
    // block references intact (registry values come out of the doc by ref).
    setFigures(docContent.figures);
    setImages(docContent.images);
  }

  // ── persistence ────────────────────────────────────────────────────────────

  // Stamp a successful save for the autosave indicator (local clock time).
  function markSaved() {
    setLastSavedAt(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    setSaveStatus("saved");
  }

  async function persistBody(nextBody: string) {
    setSaveStatus("saving");
    const res = await serverActions.updateReportBody({
      projectId,
      report_id: p.reportId,
      body: nextBody,
      expectedLastUpdated: lastUpdated(),
      overwrite: true,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      if (res.data.conflicted) setShowConflictBanner(true);
      setSaveError(undefined);
      markSaved();
    } else {
      setSaveError(res.err);
      setSaveStatus("error");
    }
  }

  function handleBodyChange(nextBody: string) {
    setBody(nextBody);
    // Let the AI know the body changed (skip AI-applied edits; while live,
    // remote peer edits land here too — they equally invalidate the AI's read).
    if (!applyingProgrammaticEdit) notifyAI({ type: "edited_report_locally" });
    // Live collab: edits stream into the shared doc via yCollab and the room
    // checkpoints them — the REST autosave stays off (see collabReady note).
    if (collabReady()) return;
    setSaveStatus("unsaved");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistBody(nextBody), AUTOSAVE_MS);
  }

  async function persistFigures(
    next: Record<string, FigureBlock>,
  ): Promise<boolean> {
    // Live collab: the registry change flows through the shared doc (fresh
    // object references — the callers' {...prev, [id]: block} spreads) and the
    // room checkpoint persists it.
    const s = session();
    if (collabReady() && s) {
      // While a figure's editor modal is open, the modal owns that figure's
      // config live in the doc — don't let this registry push revert it.
      const editing = editingFigureId();
      s.pushRegistries(
        next,
        images(),
        editing
          ? { skipFigureConfigForFigureIds: new Set([editing]) }
          : undefined,
      );
      return true;
    }
    setSaveStatus("saving");
    const res = await serverActions.updateReportFigures({
      projectId,
      report_id: p.reportId,
      figures: next,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      markSaved();
      return true;
    }
    setSaveError(res.err);
    setSaveStatus("error");
    return false;
  }

  async function persistImages(next: Record<string, ImageBlock>) {
    // Live collab: see persistFigures.
    const s = session();
    if (collabReady() && s) {
      s.pushRegistries(figures(), next);
      return;
    }
    setSaveStatus("saving");
    const res = await serverActions.updateReportImages({
      projectId,
      report_id: p.reportId,
      images: next,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      markSaved();
    } else {
      setSaveError(res.err);
      setSaveStatus("error");
    }
  }

  async function updateFigure(
    id: string,
    figureBlock: FigureBlock,
  ): Promise<boolean> {
    const next = { ...figures(), [id]: figureBlock };
    setFigures(next);
    return await persistFigures(next);
  }

  // Regenerate a FigureBlock from a results value + config (same as dashboards).
  async function buildFigureBlock(
    resultsValue: ResultsValue,
    config: PresentationObjectConfig,
  ): Promise<
    { ok: true; figureBlock: FigureBlock } | { ok: false; err: string }
  > {
    const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
      projectId,
      {
        id: "",
        projectId,
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
      return {
        ok: false,
        err: t3({
          en: "Failed to generate visualization",
          fr: "Échec de la génération de la visualisation",
          pt: "Falha ao gerar a visualização",
        }),
      };
    }
    const ih = itemsRes.data.ih;
    const effectiveConfig = itemsRes.data.config;
    const bundle = makeFigureBundleFromFetchedData({
      resultsValue,
      ih: ih as Parameters<typeof makeFigureBundleFromFetchedData>[0]["ih"],
      effectiveConfig,
    });
    return { ok: true, figureBlock: { type: "figure" as const, bundle } };
  }

  // ── toolbar / embed-editor actions ───────────────────────────────────────────

  async function insertFigure() {
    const sel = await withPanesCovered(
      openInnerEditor({
        element: SelectVisualizationForSlide,
        props: { projectState },
      }),
    );
    if (!sel) return;
    let figureBlock: FigureBlock;
    try {
      ({ figureBlock } = await resolveFigureAndGeoFromVisualization(projectId, {
        type: "from_visualization",
        visualizationId: sel.visualizationId,
        replicant: sel.replicant,
      }));
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error
            ? err.message
            : t3({
                en: "Failed to add visualization",
                fr: "Échec de l'ajout de la visualisation",
                pt: "Falha ao adicionar a visualização",
              }),
        intent: "danger",
      });
      return;
    }
    const id = crypto.randomUUID();
    await updateFigure(id, figureBlock);
    const vizLabel =
      projectState.visualizations.find((v) => v.id === sel.visualizationId)
        ?.label ?? "";
    editorApi?.insertEmbedOnNewLine(
      `![${sanitizeCaption(vizLabel)}](figure:${id})`,
    );
    setSelectedEmbed({ kind: "figure", id });
  }

  async function insertImage() {
    const picked = await openComponent({
      element: ReportImagePicker,
      props: {},
    });
    if (!picked) return;
    const id = crypto.randomUUID();
    const block: ImageBlock = { type: "image", imgFile: picked.imgFile };
    const next = { ...images(), [id]: block };
    setImages(next);
    await persistImages(next);
    editorApi?.insertEmbedOnNewLine(
      `![${sanitizeCaption(picked.alt)}](image:${id})`,
    );
    setSelectedEmbed({ kind: "image", id });
  }

  function handleUpdateCaption(id: string, caption: string) {
    const sel = selectedEmbed();
    if (!sel) return;
    editorApi?.setEmbedCaption(sel.kind, id, caption);
  }

  async function handleSwitch() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const chosen = await withPanesCovered(
      openInnerEditor({
        element: SelectVisualizationForSlide,
        props: { projectState },
      }),
    );
    if (!chosen) return;
    try {
      const { figureBlock } = await resolveFigureAndGeoFromVisualization(
        projectId,
        {
          type: "from_visualization",
          visualizationId: chosen.visualizationId,
          replicant: chosen.replicant,
        },
      );
      await updateFigure(sel.id, figureBlock);
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error
            ? err.message
            : t3({
                en: "Failed to switch visualization",
                fr: "Échec du changement de visualisation",
                pt: "Falha ao trocar a visualização",
              }),
        intent: "danger",
      });
    }
  }

  async function handleEdit() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const bundle = figures()[sel.id]?.bundle;
    if (!bundle) return;
    const resultsValue = projectState.metrics.find(
      (m) => m.id === bundle.metricId,
    );
    if (!resultsValue) {
      await openAlert({
        text: t3({
          en: "Metric not found in project",
          fr: "Indicateur introuvable dans le projet",
          pt: "Métrica não encontrada no projeto",
        }),
        intent: "danger",
      });
      return;
    }
    // Live co-editing: bind the modal to this figure's config IN the shared
    // report doc. Only when the session is live; else the modal keeps its classic
    // Apply/Cancel flow (graceful degradation).
    const s0 = session();
    const figureOrigin = {}; // per-open origin for the modal's undo tracking
    const collabBinding: VizFigureCollabBinding | undefined =
      s0 && s0.isLive()
        ? {
            figureId: sel.id,
            getConfigMap: () => {
              const ss = session();
              return ss ? findReportFigureConfigMap(ss.doc, sel.id) : undefined;
            },
            awareness: s0.awareness,
            isLive: () => session()?.isLive() ?? false,
            canEdit: () =>
              projectState.thisUserPermissions.can_configure_reports &&
              !projectState.isLocked &&
              !collabFatal(),
            localOrigin: figureOrigin,
            onCoherentBundle: (b: FigureBundle) => {
              void updateFigure(sel.id, { type: "figure", bundle: b });
            },
          }
        : undefined;

    setEditingFigureId(sel.id);
    try {
      const result = await withPanesCovered(
        openInnerEditor({
          element: VisualizationEditor,
          props: {
            mode: "ephemeral" as const,
            label: resultsValue.label,
            projectId,
            collabBinding,
            ...snapshotForVizEditor({
              projectState,
              resultsValue,
              config: bundle.config,
            }),
          },
        }),
      );
      if (!result?.updated) return;
      const built = await buildFigureBlock(resultsValue, result.updated.config);
      if (!built.ok) {
        await openAlert({ text: built.err, intent: "danger" });
        return;
      }
      await updateFigure(sel.id, built.figureBlock);
    } finally {
      setEditingFigureId(undefined);
    }
  }

  async function handleCreate() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const result = await openComponent({
      element: AddVisualization,
      props: {
        projectId,
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
    await updateFigure(sel.id, built.figureBlock);
  }

  async function handleChangeImageFile(id: string, imgFile: string) {
    const ib = images()[id];
    if (!ib) return;
    const next = { ...images(), [id]: { ...ib, imgFile } };
    setImages(next);
    await persistImages(next);
  }

  function handleDelete() {
    const sel = selectedEmbed();
    if (!sel) return;
    // Remove only the body token; keep the registry entry for the session so
    // Ctrl+Z restores a working embed (not "Missing visualization"). Orphaned
    // entries are pruned at next load (see onMount).
    editorApi?.removeEmbedToken(sel.kind, sel.id);
    setSelectedEmbed(undefined);
  }

  async function download() {
    await openComponent({
      element: DownloadReport,
      props: { projectId, reportId: p.reportId },
    });
  }

  async function openVersionHistory() {
    await withPanesCovered(
      openInnerEditor({
        element: VersionHistoryEditor,
        props: {
          projectId,
          kind: "report" as const,
          docId: p.reportId,
          currentLabel: label(),
          getCurrentBody: body,
        },
      }),
    );
  }

  // The HTML preview pane (View & Split). Owns its scroll-sync lifecycle: it
  // registers previewEl, an rAF-throttled scroll listener, a ResizeObserver on
  // the content (figure-settle, §7), and user-gesture latches — all torn down on
  // unmount, since the pane unmounts in Edit.
  const ReportPreviewPane = () => {
    let contentEl: HTMLDivElement | undefined;
    let scrollRAF = 0;
    onMount(() => {
      const el = previewEl;
      if (!el) return;
      settleUntouched = true;
      settleArmed = false;
      const onScroll = () => {
        if (scrollRAF) return;
        scrollRAF = requestAnimationFrame(() => {
          scrollRAF = 0;
          onPreviewScroll();
        });
      };
      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("wheel", onPreviewUserGesture, { passive: true });
      el.addEventListener("pointerdown", onPreviewUserGesture);
      const ro = new ResizeObserver(() => onPreviewResize());
      if (contentEl) ro.observe(contentEl);
      onCleanup(() => {
        if (scrollRAF) cancelAnimationFrame(scrollRAF);
        el.removeEventListener("scroll", onScroll);
        el.removeEventListener("wheel", onPreviewUserGesture);
        el.removeEventListener("pointerdown", onPreviewUserGesture);
        ro.disconnect();
        disarmSettle();
        previewEl = undefined;
      });
    });
    return (
      <div
        class="min-h-0 flex-1 overflow-auto px-8 py-10"
        classList={{ "border-l": mode() === "split" }}
        data-report-cursor="preview-pane"
        ref={(el) => (previewEl = el)}
      >
        <div
          class="bg-base-100 md-dark-adapt mx-auto min-h-full w-full max-w-4xl rounded px-6 py-10 shadow-floating"
          data-report-cursor="preview-content"
          ref={(el) => (contentEl = el)}
        >
          <MarkdownPresentationJsx
            markdown={body()}
            renderImage={renderEmbed}
            style={REPORT_MARKDOWN_STYLE}
          />
        </div>
      </div>
    );
  };

  // The content area (banners + CM editor + preview + diff), shared by both
  // modes. The CM editor stays mounted in View too — AI accept applies via its
  // imperative setBody and body() updates flow through onBodyChange regardless
  // of mode (PLAN_REPORT_PREVIEW_TOGGLE.md §2). Only the left sidebar differs.
  const MainArea = () => (
    <div
      class="bg-base-200 flex h-full w-full flex-col"
      onClick={() => setSelectedEmbed(undefined)}
    >
      <Show when={collabFatal()}>
        <div class="bg-danger/10 text-danger ui-pad flex items-center gap-2 text-xs">
          <span class="flex-1">
            {collabFatal()}
            {" — "}
            {t3({
              en: "editing is disabled. Close this editor.",
              fr: "l'édition est désactivée. Fermez cet éditeur.",
              pt: "a edição está desativada. Feche este editor.",
            })}
          </span>
        </div>
      </Show>
      <Show when={showConflictBanner()}>
        <div class="bg-base-200 text-base-content ui-pad flex items-center gap-2 text-xs">
          <span class="flex-1">
            {t3({
              en: "Someone else may be editing this report — your changes were saved over theirs.",
              fr: "Quelqu'un d'autre modifie peut-être ce rapport — vos modifications ont été enregistrées par-dessus les siennes.",
              pt: "Outra pessoa poderá estar a editar este relatório — as suas alterações foram guardadas por cima das dela.",
            })}
          </span>
          <Button
            size="sm"
            outline
            onBackground="base-200"
            onClick={() => setShowConflictBanner(false)}
          >
            {t3({ en: "Dismiss", fr: "Ignorer", pt: "Dispensar" })}
          </Button>
        </div>
      </Show>
      <Show when={saveError()}>
        <div class="text-danger ui-pad text-xs">{saveError()}</div>
      </Show>
      <Show when={!isLoading()}>
        {/* Editor + preview row. The CM editor stays mounted in every mode (AI
            accept applies via its imperative setBody). In Split, editor (left)
            and preview (right) sit side by side. A staged AI edit is reviewed in
            a locking modal (see proposeEdit), so nothing here is hidden for it. */}
        <div class="flex min-h-0 flex-1">
          {/* In Split, cap the editor pane to the editor's max content width
              (column + gutter) so it doesn't stretch to half — the preview takes
              the leftover. flex-1 still fills it in Edit and shrinks if narrow. */}
          <div
            class="min-h-0 flex-1"
            classList={{ hidden: mode() === "view" }}
            data-report-cursor="code-pane"
            style={
              mode() === "split"
                ? { "max-width": `${EDITOR_PANE_MAX_REM}rem` }
                : undefined
            }
          >
            <ReportEditor
              body={body()}
              figures={figures()}
              images={images()}
              assetUrl={assetUrl}
              onBodyChange={handleBodyChange}
              onSelectEmbed={(kind, id) => setSelectedEmbed({ kind, id })}
              selectedId={() => selectedEmbed()?.id}
              onScroll={onEditorScroll}
              centered={() => mode() === "edit"}
              // In Edit, reserve the sidebar's width on the right so the centered
              // column lands at the window centre — same placement as the View
              // preview (where the sidebar is collapsed). Scrollbar stays at the
              // pane edge (padding is inside the scroller).
              centerPadRight={() => SIDEBAR_WIDTH_PX}
              collab={() => {
                const s = session();
                return collabReady() && s
                  ? { yText: findReportBodyText(s.doc), awareness: s.awareness }
                  : undefined;
              }}
              canEdit={() =>
                projectState.thisUserPermissions.can_configure_reports &&
                !projectState.isLocked &&
                !collabFatal()
              }
              ref={(api) => (editorApi = api)}
            />
          </div>
          {/* HTML preview — visible in View & Split. Unmounts in Edit, so its
              scroll/resize listeners are (re)established per mount (§7). */}
          <Show when={mode() !== "edit"}>
            <ReportPreviewPane />
          </Show>
        </div>
      </Show>
    </div>
  );

  return (
    <InnerEditorWrapper>
      <FrameTop
        panelChildren={
          <div class="h-full w-full" data-cursor-zone="header">
            <HeadingBar
              heading={label()}
              leftChildren={
                <Button
                  iconName="chevronLeft"
                  onClick={() => p.close(undefined)}
                />
              }
              centerChildren={
                <ButtonGroup<ReportMode>
                  items={[
                    {
                      id: "edit",
                      label: t3({ en: "Edit", fr: "Édition", pt: "Editar" }),
                    },
                    {
                      id: "split",
                      label: t3({ en: "Split", fr: "Divisé", pt: "Dividido" }),
                    },
                    {
                      id: "view",
                      label: t3({ en: "View", fr: "Aperçu", pt: "Ver" }),
                    },
                  ]}
                  value={mode()}
                  onChange={(v) => v && setMode(v)}
                />
              }
            >
              <div class="ui-gap-sm flex items-center">
                {/* Who else is currently in THIS report (live presence). */}
                <PresenceAvatars
                  peers={otherPeers().filter((pe) => pe.reportId === p.reportId)}
                  size="sm"
                />
                <div class="ui-text-caption mr-2 flex items-center gap-1.5">
                  <div
                    class="h-1.5 w-1.5 flex-none rounded-full"
                    classList={{
                      [saveIndicator().dot]: true,
                      "animate-pulse": saveStatus() === "saving",
                    }}
                  />
                  <span>{saveIndicator().text}</span>
                </div>
                <Button outline iconName="rotate" onClick={openVersionHistory}>
                  {t3({ en: "History", fr: "Historique", pt: "Histórico" })}
                </Button>
                <Button outline iconName="download" onClick={download}>
                  {t3({ en: "Download", fr: "Télécharger", pt: "Transferir" })}
                </Button>
                <Show when={!showAi()}>
                  <Button
                    outline
                    iconName="chevronLeft"
                    onClick={() => setShowAi(true)}
                  >
                    {t3({ en: "AI", fr: "IA", pt: "IA" })}
                  </Button>
                </Show>
              </div>
            </HeadingBar>
          </div>
        }
      >
        {/* One always-mounted frame: the sidebar collapses (isShown=false) in
            View only — it's available in Edit & Split (both show the CM editor,
            where embeds are selected). MainArea stays mounted across the toggle —
            the CM editor and figure widgets never remount (no re-hydration
            flicker; undo and scroll preserved). */}
        <FrameLeft
          panelChildren={
            mode() !== "view" ? (
              <div
                class="flex h-full flex-col border-r"
                style={{ width: `${SIDEBAR_WIDTH_PX}px` }}
              >
                <ReportEmbedEditor
                  embed={selectedEmbedDetail()}
                  canConfigure={canConfigure() && mode() !== "view"}
                  onUpdateCaption={handleUpdateCaption}
                  onEditFigure={handleEdit}
                  onSwitchFigure={handleSwitch}
                  onCreateFigure={handleCreate}
                  onChangeImageFile={handleChangeImageFile}
                  onDelete={handleDelete}
                  onInsertFigure={insertFigure}
                  onInsertImage={insertImage}
                />
              </div>
            ) : null
          }
        >
          <MainArea />
        </FrameLeft>
      </FrameTop>
      <ReportEditorCursors
        reportId={p.reportId}
        awareness={() => session()?.awareness}
        enabled={() => !!session() && collabReady() && panesCovered() === 0}
        covered={() => panesCovered() > 0}
      />
      <ReportPeerSelectionOverlay
        reportId={p.reportId}
        suppressed={panesCovered() > 0}
      />
    </InnerEditorWrapper>
  );
}

// Presence borders around report embeds — the report counterpart of the
// slide editor's PeerSelectionOverlay: a colored border + name tags around
// the figure/image each peer currently has selected (their embed selection,
// broadcast via presence `selectedBlockId`). DOM-anchored in BOTH panes:
// embeds are located by [data-embed-id] on the CM figure widgets (code pane)
// and on the preview's rendered embeds, each clipped to its own pane's
// visible viewport. The code pane is the primary anchor — it is what users
// see and click in Edit/Split, and it renders a widget for every token line,
// whereas the markdown preview drops embeds that aren't blank-line-separated
// (so a preview-only anchor silently misses them). A pane that is hidden
// (Edit's preview, View's editor) has a zero rect and contributes nothing.
function ReportPeerSelectionOverlay(p: {
  reportId: string;
  suppressed: boolean;
}) {
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);
  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const sweep = setInterval(bump, 1000);
    onCleanup(() => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      clearInterval(sweep);
    });
  });

  const boxes = () => {
    tick();
    if (p.suppressed) return [];
    const peers = otherPeers().filter(
      (peer) => peer.reportId === p.reportId && peer.selectedBlockId,
    );
    if (peers.length === 0) return [];
    const panes = [
      document.querySelector('[data-report-cursor="code-pane"]'),
      document.querySelector('[data-report-cursor="preview-pane"]'),
    ].filter((el): el is Element => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (panes.length === 0) return [];
    const out: {
      key: string;
      left: number;
      top: number;
      width: number;
      height: number;
      editors: { name: string; color: string; editingFigure: boolean }[];
    }[] = [];
    // One box per embed per pane (not per peer): co-selectors share the box,
    // their name tags sit side by side (mirrors the slide editor's overlay).
    // In Split an embed can anchor in both panes — one box in each.
    const byTarget = new Map<string, (typeof out)[number]>();
    for (const [paneIdx, pane] of panes.entries()) {
      const paneRect = pane.getBoundingClientRect();
      for (const peer of peers) {
        const id = peer.selectedBlockId!;
        const key = `${paneIdx}:${id}`;
        let entry = byTarget.get(key);
        if (!entry) {
          const el = pane.querySelector(`[data-embed-id="${id}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Clip to the pane's viewport so a scrolled-away embed's border
          // doesn't float over the header or the neighbouring pane.
          const top = Math.max(r.top, paneRect.top);
          const bottom = Math.min(r.bottom, paneRect.bottom);
          if (bottom - top < 8) continue;
          entry = {
            key,
            left: r.left,
            top,
            width: r.width,
            height: bottom - top,
            editors: [],
          };
          byTarget.set(key, entry);
          out.push(entry);
        }
        // Same user in two tabs = two connections; show their name once.
        if (!entry.editors.some((e) => e.name === peer.name)) {
          entry.editors.push({
            name: peer.name,
            color: peer.color,
            editingFigure: peer.editingFigureId === id,
          });
        }
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
              {/* Additional co-selectors get concentric inset borders so every
                  editor's color stays visible on the shared embed. */}
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
                      class="rounded px-1 text-[10px] font-semibold whitespace-nowrap text-white"
                      style={{ "background-color": e.color }}
                    >
                      {e.name}
                      {e.editingFigure
                        ? " " +
                          t3({
                            en: "\u270e figure",
                            fr: "\u270e figure",
                            pt: "\u270e figura",
                          })
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
