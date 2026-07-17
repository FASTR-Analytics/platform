import {
 type FigureBlock,
 type ImageBlock,
 type PresentationObjectConfig,
 type ProjectState,
 type ResultsValue,
 t3,
} from"lib";
import {
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
} from"panther";
import {
 createEffect,
 createMemo,
 createSignal,
 type JSX,
 on,
 onCleanup,
 onMount,
 Show,
} from"solid-js";
import { serverActions, _SERVER_HOST } from"~/server_actions";
import { projectState } from"~/state/project/t1_store";
import { setShowAi, showAi } from"~/state/t4_ui";
import {
 makeFigureBundleFromFetchedData,
} from"~/generate_visualization/mod";
import { getPresentationObjectItemsFromCacheOrFetch } from"~/state/project/t2_presentation_objects";
import { useAIProjectContext } from"../project_ai/context";
import type { AIContext, ReportEditProposal } from"../project_ai/types";
import { SelectVisualizationForSlide } from"../slide_deck/select_visualization_for_slide";
import { resolveFigureAndGeoFromVisualization } from"~/generate_visualization/mod";
import { VisualizationEditor } from"../visualization";
import { AddVisualization } from"../project/add_visualization";
import { snapshotForVizEditor } from"../_editor_snapshot";
import {
 EDITOR_PANE_MAX_REM,
 ReportEditor,
 type ReportEditorApi,
} from"./report_editor";
import { REPORT_MARKDOWN_STYLE } from"./report_markdown_style";
import {
 ReportEmbedEditor,
 type SelectedReportEmbed,
} from"./ReportEmbedEditor";
import { ReportImagePicker } from"./report_image_picker";
import { ReportMarkdownDiff } from"./ReportMarkdownDiff";
import { ReportFigureEmbed } from"./ReportFigureEmbed";
import { DownloadReport } from"./download_report";
import { lineToPreviewTop, previewTopToLine } from"./scroll_sync";

type EmbedKind ="figure"|"image";
type EmbedSelection = { kind: EmbedKind; id: string };
type ReportMode ="edit"|"view"|"split";

type Props = EditorComponentProps<
  {
 projectState: ProjectState;
 reportId: string;
 reportLabel: string;
 returnToContext?: AIContext;
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
    .replace(/[[\]\n\r]/g,"")
    .replace(/\s+/g,"")
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
 if (m[1] ==="figure") figures.add(m[2]);
 else images.add(m[2]);
  }
 return { figures, images };
}

export function ProjectReport(p: Props) {
 const projectId = p.projectState.id;
 const { setAIContext, notifyAI } = useAIProjectContext();
 const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
 getEditorWrapper();

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
  // Autosave indicator."unsaved"= an edit is pending in the debounce window.
 const [saveStatus, setSaveStatus] = createSignal<
"saved"|"unsaved"|"saving"|"error"
  >("saved");
 const [lastSavedAt, setLastSavedAt] = createSignal<string>("");
  // The embed whose editor is shown in the ever-present left panel.
 const [selectedEmbed, setSelectedEmbed] = createSignal<
 EmbedSelection | undefined
  >();
  // Edit (CodeMirror) vs View (read-only HTML preview). AI is mode-agnostic:
  // the editor stays mounted in both modes (PLAN_REPORT_PREVIEW_TOGGLE.md §2).
 const [mode, setMode] = createSignal<ReportMode>("split");

  // The figure-editor sidebar only exists in Edit, so clear the selection in
  // View/Split. The CM editor is visible in Edit & Split — re-measure it when it
  // (re)appears (e.g. coming back from View where it was hidden). Also align the
  // newly revealed pane to targetLine (§8 scroll-sync): when the editor reappears
  // after View, scroll it to targetLine; when the preview mounts after Edit,
  // scroll it to targetLine and arm figure-settle. One effect (not two) so refresh
  // runs before scrollToLine and they can't race.
 createEffect(
 on(mode, (m, prev) => {
 if (m ==="view") setSelectedEmbed(undefined);
 if (m !=="view") editorApi?.refresh();
 if (prev === undefined) return; // initial render sits at the top

 const editorRevealed = prev ==="view"&& m !=="view";
 const previewMounted = prev ==="edit"&& m !=="edit";
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
        >
          <ReportFigureEmbed figure={fb} onMeasured={() => armFigureSettle()} />
        </div>
      ) : (
        <div class="text-danger text-xs"data-line={line}>
          {t3({
 en:"Missing visualization:",
 fr:"Visualisation manquante :",
 pt:"Visualização em falta:",
          })}{""}
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
        />
      ) : (
        <div class="text-danger text-xs"data-line={line}>
          {t3({ en:"Missing image:", fr:"Image manquante :", pt:"Imagem em falta:"})} {img[1]}
        </div>
      );
    }
 return undefined;
  }

 let editorApi: ReportEditorApi | undefined;
 let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // Suppresses the"user edited"AI notification while we apply an AI-accepted
  // edit through the editor (setBody also fires the CM change listener).
 let applyingProgrammaticEdit = false;

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

  // Scrollable AND at the end (a non-scrollable pane isn't"at bottom").
 function isElAtBottom(el: HTMLElement) {
 return el.scrollHeight > el.clientHeight + 1 &&
 el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
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
 if (mode() ==="split"&& previewEl) {
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
 if (mode() ==="split") {
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
 return`${_SERVER_HOST}/${imgFile}`;
  }

  // Never rewind lastUpdated when out-of-order save responses resolve (M3).
 function bumpLastUpdated(ts: string) {
 setLastUpdated((prev) => (ts > prev ? ts : prev));
  }

 const saveIndicator = createMemo(() => {
 switch (saveStatus()) {
 case"saving":
 return {
 text: t3({ en:"Saving…", fr:"Enregistrement…", pt:"A guardar…"}),
 dot:"bg-warning",
        };
 case"unsaved":
 return {
 text: t3({
 en:"Unsaved changes",
 fr:"Modifications non enregistrées",
 pt:"Alterações não guardadas",
          }),
 dot:"bg-base-300",
        };
 case"error":
 return {
 text: t3({ en:"Save failed", fr:"Échec de l'enregistrement", pt:"Falha ao guardar"}),
 dot:"bg-danger",
        };
 case"saved":
 default:
 return {
 text: lastSavedAt()
            ? t3({
 en:`Saved ${lastSavedAt()}`,
 fr:`Enregistré ${lastSavedAt()}`,
 pt:`Guardado ${lastSavedAt()}`,
              })
            : t3({ en:"Saved", fr:"Enregistré", pt:"Guardado"}),
 dot:"bg-success",
        };
    }
  });

  // Caption for an embed = the markdown alt text in its token.
 function captionForId(kind: EmbedKind, id: string): string {
 const re = new RegExp(
`!\\[([^\\]]*)\\]\\(${kind}:${id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\)`,
    );
 return re.exec(body())?.[1] ??"";
  }

 const selectedEmbedDetail = createMemo<SelectedReportEmbed | undefined>(
    () => {
 const sel = selectedEmbed();
 if (!sel) return undefined;
 if (sel.kind ==="figure") {
 const fb = figures()[sel.id];
 if (!fb) return undefined;
 return {
 kind:"figure",
 id: sel.id,
 caption: captionForId("figure", sel.id),
 figureBlock: fb,
        };
      }
 const ib = images()[sel.id];
 if (!ib) return undefined;
 return {
 kind:"image",
 id: sel.id,
 caption: captionForId("image", sel.id),
 imageBlock: ib,
      };
    },
  );

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
    }
 setIsLoading(false);

 setAIContext({
 mode:"editing_report",
 reportId: p.reportId,
 reportLabel: label(),
 getBody: () => body(),
 getFigures: () => figures(),
 getImages: () => images(),
 getSelection: () => editorApi?.getSelection(),
 proposeEdit: async (proposal) => {
 if (proposal.newBody === body()) {
 throw new Error(
"The proposed body is IDENTICAL to the current body — nothing to review, so no accept/reject dialog was shown. Re-read with get_report_editor and propose an actual change.",
          );
        }
        // Shown as a locking modal (openComponent backdrop) so the user can't do
        // other work without first acting on the proposal. Resolves true/false.
 const accepted = await openComponent({
 element: ReportMarkdownDiff,
 props: {
 oldText: body(),
 newText: proposal.newBody,
 summary: proposal.summary,
          },
        });
 if (!accepted) return { accepted: false };
 await applyProposal(proposal);
 return { accepted: true };
      },
 applyFigureUpdate: (figureId, block) => updateFigure(figureId, block),
    });
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

  // First line (0-based) where the two bodies differ — accept scrolls there.
 function firstChangedLine(a: string, b: string): number {
 const al = a.split("\n");
 const bl = b.split("\n");
 const n = Math.min(al.length, bl.length);
 for (let i = 0; i < n; i++) {
 if (al[i] !== bl[i]) return i;
    }
 return n;
  }

  // Apply an accepted AI proposal to the editor and persist it.
 async function applyProposal(prop: ReportEditProposal) {
 if (prop.addFigures) {
 const prev = figures();
 const next = { ...prev, ...prop.addFigures };
 setFigures(next);
 if (!(await persistFigures(next))) {
        // Don't apply a body whose tokens reference figures the server never
        // got — that would surface as"Missing visualization"after reload.
 setFigures(prev);
 throw new Error(
"The user ACCEPTED the edit, but saving its figure(s) to the server FAILED, so the edit was NOT applied. Tell the user to check their connection and try again.",
        );
      }
    }
 const changedLine = firstChangedLine(body(), prop.newBody);
 applyingProgrammaticEdit = true;
 editorApi?.setBody(prop.newBody);
 applyingProgrammaticEdit = false;
 if (saveTimer) {
 clearTimeout(saveTimer);
 saveTimer = undefined;
    }
 await persistBody(prop.newBody);
 editorApi?.refresh();
    // Align both panes to the change so the accepted edit lands on screen
    // (same defer pattern as the mode-switch effect: let layout settle first).
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

 onCleanup(() => {
 void flushBodySave();
 setAIContext(p.returnToContext ?? { mode:"viewing_reports"});
  });

  // ── persistence ────────────────────────────────────────────────────────────

  // Stamp a successful save for the autosave indicator (local clock time).
 function markSaved() {
 setLastSavedAt(
 new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit"}),
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
 setSaveStatus("unsaved");
    // Let the AI know the user touched the body (skip AI-applied edits).
 if (!applyingProgrammaticEdit) notifyAI({ type:"edited_report_locally"});
 if (saveTimer) clearTimeout(saveTimer);
 saveTimer = setTimeout(() => void persistBody(nextBody), AUTOSAVE_MS);
  }

 async function persistFigures(
 next: Record<string, FigureBlock>,
  ): Promise<boolean> {
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
 id:"",
 projectId,
 lastUpdated:"",
 label:"Ephemeral",
 resultsValue,
 config,
 isDefault: false,
 folderId: null,
      },
 config,
    );
 if (!itemsRes.success || itemsRes.data.ih.status !=="ok") {
 return {
 ok: false,
 err: t3({
 en:"Failed to generate visualization",
 fr:"Échec de la génération de la visualisation",
 pt:"Falha ao gerar a visualização",
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
 return { ok: true, figureBlock: { type:"figure"as const, bundle } };
  }

  // ── toolbar / embed-editor actions ───────────────────────────────────────────

 async function insertFigure() {
 const sel = await openInnerEditor({
 element: SelectVisualizationForSlide,
 props: { projectState },
    });
 if (!sel) return;
 let figureBlock: FigureBlock;
 try {
      ({ figureBlock } = await resolveFigureAndGeoFromVisualization(projectId, {
 type:"from_visualization",
 visualizationId: sel.visualizationId,
 replicant: sel.replicant,
      }));
    } catch (err) {
 await openAlert({
 text:
 err instanceof Error
            ? err.message
            : t3({
 en:"Failed to add visualization",
 fr:"Échec de l'ajout de la visualisation",
 pt:"Falha ao adicionar a visualização",
              }),
 intent:"danger",
      });
 return;
    }
 const id = crypto.randomUUID();
 await updateFigure(id, figureBlock);
 const vizLabel =
 projectState.visualizations.find((v) => v.id === sel.visualizationId)
        ?.label ??"";
 editorApi?.insertEmbedOnNewLine(
`![${sanitizeCaption(vizLabel)}](figure:${id})`,
    );
 setSelectedEmbed({ kind:"figure", id });
  }

 async function insertImage() {
 const picked = await openComponent({
 element: ReportImagePicker,
 props: {},
    });
 if (!picked) return;
 const id = crypto.randomUUID();
 const block: ImageBlock = { type:"image", imgFile: picked.imgFile };
 const next = { ...images(), [id]: block };
 setImages(next);
 await persistImages(next);
 editorApi?.insertEmbedOnNewLine(
`![${sanitizeCaption(picked.alt)}](image:${id})`,
    );
 setSelectedEmbed({ kind:"image", id });
  }

 function handleUpdateCaption(id: string, caption: string) {
 const sel = selectedEmbed();
 if (!sel) return;
 editorApi?.setEmbedCaption(sel.kind, id, caption);
  }

 async function handleSwitch() {
 const sel = selectedEmbed();
 if (!sel || sel.kind !=="figure") return;
 const chosen = await openInnerEditor({
 element: SelectVisualizationForSlide,
 props: { projectState },
    });
 if (!chosen) return;
 try {
 const { figureBlock } = await resolveFigureAndGeoFromVisualization(
 projectId,
        {
 type:"from_visualization",
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
 en:"Failed to switch visualization",
 fr:"Échec du changement de visualisation",
 pt:"Falha ao trocar a visualização",
              }),
 intent:"danger",
      });
    }
  }

 async function handleEdit() {
 const sel = selectedEmbed();
 if (!sel || sel.kind !=="figure") return;
 const bundle = figures()[sel.id]?.bundle;
 if (!bundle) return;
 const resultsValue = projectState.metrics.find(
      (m) => m.id === bundle.metricId,
    );
 if (!resultsValue) {
 await openAlert({
 text: t3({
 en:"Metric not found in project",
 fr:"Indicateur introuvable dans le projet",
 pt:"Métrica não encontrada no projeto",
        }),
 intent:"danger",
      });
 return;
    }
 const result = await openInnerEditor({
 element: VisualizationEditor,
 props: {
 mode:"ephemeral"as const,
 label: resultsValue.label,
 projectId,
        ...snapshotForVizEditor({
 projectState,
 resultsValue,
 config: bundle.config,
        }),
      },
    });
 if (!result?.updated) return;
 const built = await buildFigureBlock(resultsValue, result.updated.config);
 if (!built.ok) {
 await openAlert({ text: built.err, intent:"danger"});
 return;
    }
 await updateFigure(sel.id, built.figureBlock);
  }

 async function handleCreate() {
 const sel = selectedEmbed();
 if (!sel || sel.kind !=="figure") return;
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
 await openAlert({ text: built.err, intent:"danger"});
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
    // Ctrl+Z restores a working embed (not"Missing visualization"). Orphaned
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
 classList={{"border-l": mode() ==="split"}}
 ref={(el) => (previewEl = el)}
      >
        <div
 class="bg-base-100 mx-auto min-h-full w-full max-w-4xl rounded px-6 py-10 shadow-floating"
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
      <Show when={showConflictBanner()}>
        <div class="bg-base-200 text-base-content ui-pad flex items-center gap-2 text-xs">
          <span class="flex-1">
            {t3({
 en:"Someone else may be editing this report — your changes were saved over theirs.",
 fr:"Quelqu'un d'autre modifie peut-être ce rapport — vos modifications ont été enregistrées par-dessus les siennes.",
 pt:"Outra pessoa poderá estar a editar este relatório — as suas alterações foram guardadas por cima das dela.",
            })}
          </span>
          <Button
 size="sm"
 outline
 onBackground="base-200"
 onClick={() => setShowConflictBanner(false)}
          >
            {t3({ en:"Dismiss", fr:"Ignorer", pt:"Dispensar"})}
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
 classList={{ hidden: mode() ==="view"}}
 style={mode() ==="split"
              ? {"max-width":`${EDITOR_PANE_MAX_REM}rem`}
              : undefined}
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
 centered={() => mode() ==="edit"}
              // In Edit, reserve the sidebar's width on the right so the centered
              // column lands at the window centre — same placement as the View
              // preview (where the sidebar is collapsed). Scrollbar stays at the
              // pane edge (padding is inside the scroller).
 centerPadRight={() => SIDEBAR_WIDTH_PX}
 ref={(api) => (editorApi = api)}
            />
          </div>
          {/* HTML preview — visible in View & Split. Unmounts in Edit, so its
 scroll/resize listeners are (re)established per mount (§7). */}
          <Show when={mode() !=="edit"}>
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
          <HeadingBar
 heading={label()}
 class=""
 leftChildren={
              <Button
 iconName="chevronLeft"
 onClick={() => p.close(undefined)}
              />
            }
 centerChildren={
              <ButtonGroup<ReportMode>
 items={[
                  { id:"edit", label: t3({ en:"Edit", fr:"Édition", pt:"Editar"}) },
                  { id:"split", label: t3({ en:"Split", fr:"Divisé", pt:"Dividido"}) },
                  { id:"view", label: t3({ en:"View", fr:"Aperçu", pt:"Ver"}) },
                ]}
 value={mode()}
 onChange={(v) => v && setMode(v)}
              />
            }
          >
            <div class="ui-gap-sm flex items-center">
              <div class="ui-text-caption mr-2 flex items-center gap-1.5">
                <div
 class="h-1.5 w-1.5 flex-none rounded-full"
 classList={{
                    [saveIndicator().dot]: true,
"animate-pulse": saveStatus() ==="saving",
                  }}
                />
                <span>{saveIndicator().text}</span>
              </div>
              <Button outline iconName="download"onClick={download}>
                {t3({ en:"Download", fr:"Télécharger", pt:"Transferir"})}
              </Button>
              <Show when={!showAi()}>
                <Button
 outline
 iconName="chevronLeft"
 onClick={() => setShowAi(true)}
                >
                  {t3({ en:"AI", fr:"IA", pt:"IA"})}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        {/* One always-mounted frame: the sidebar collapses (isShown=false) in
 View only — it's available in Edit & Split (both show the CM editor,
 where embeds are selected). MainArea stays mounted across the toggle —
 the CM editor and figure widgets never remount (no re-hydration
 flicker; undo and scroll preserved). */}
        <FrameLeft
 panelChildren={
 mode() !=="view"? (
              <div
 class="flex h-full flex-col border-r"
 style={{ width:`${SIDEBAR_WIDTH_PX}px`}}
              >
                <ReportEmbedEditor
 embed={selectedEmbedDetail()}
 canConfigure={canConfigure() && mode() !=="view"}
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
    </InnerEditorWrapper>
  );
}
