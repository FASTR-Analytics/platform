import {
  type FigureBlock,
  type ImageBlock,
  type PresentationObjectConfig,
  type ProjectState,
  type ResultsValue,
  t3,
} from "lib";
import {
  Button,
  ButtonGroup,
  type EditorComponentProps,
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
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { serverActions, _SERVER_HOST } from "~/server_actions";
import { projectState } from "~/state/project/t1_store";
import { setShowAi, showAi } from "~/state/t4_ui";
import {
  getFigureInputsFromPresentationObject,
  stripFigureInputsForStorage,
} from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { useAIProjectContext } from "../project_ai/context";
import type { AIContext, ReportEditProposal } from "../project_ai/types";
import { SelectVisualizationForSlide } from "../slide_deck/select_visualization_for_slide";
import { resolveFigureAndGeoFromVisualization } from "../slide_deck/slide_ai/resolve_figure_from_visualization";
import { VisualizationEditor } from "../visualization";
import { AddVisualization } from "../project/add_visualization";
import { snapshotForVizEditor } from "../_editor_snapshot";
import { ReportEditor, type ReportEditorApi } from "./report_editor";
import { REPORT_MARKDOWN_STYLE } from "./report_markdown_style";
import {
  ReportEmbedEditor,
  type SelectedReportEmbed,
} from "./ReportEmbedEditor";
import { ReportImagePicker } from "./report_image_picker";
import { ReportMarkdownDiff } from "./ReportMarkdownDiff";
import { ReportFigureEmbed } from "./ReportFigureEmbed";
import { DownloadReport } from "./download_report";

type EmbedKind = "figure" | "image";
type EmbedSelection = { kind: EmbedKind; id: string };
type ReportMode = "edit" | "view";

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
  // Autosave indicator. "unsaved" = an edit is pending in the debounce window.
  const [saveStatus, setSaveStatus] = createSignal<
    "saved" | "unsaved" | "saving" | "error"
  >("saved");
  const [lastSavedAt, setLastSavedAt] = createSignal<string>("");
  // A staged AI edit awaiting the user's accept/reject (PLAN_REPORTS.md §4).
  const [pendingProposal, setPendingProposal] = createSignal<
    ReportEditProposal | undefined
  >();
  // The embed whose editor is shown in the ever-present left panel.
  const [selectedEmbed, setSelectedEmbed] = createSignal<
    EmbedSelection | undefined
  >();
  // Edit (CodeMirror) vs View (read-only HTML preview). AI is mode-agnostic:
  // the editor stays mounted in both modes (PLAN_REPORT_PREVIEW_TOGGLE.md §2).
  const [mode, setMode] = createSignal<ReportMode>("edit");

  // Leaving Edit clears the selection (the preview isn't clickable, so the left
  // panel resets to its empty state); re-entering Edit re-measures the CM that
  // was hidden in View.
  createEffect(() => {
    if (mode() === "view") setSelectedEmbed(undefined);
    else editorApi?.refresh();
  });

  // Resolve an embed token to its live render — same funnel as the CM widget, so
  // a figure/image looks identical in Edit and View. Plain markdown image URLs
  // return undefined → MarkdownPresentationJsx falls back to a plain <img>.
  function renderEmbed(src: string, alt: string): JSX.Element | undefined {
    const fig = /^figure:(.+)$/.exec(src);
    if (fig) {
      const fb = figures()[fig[1]];
      return fb ? (
        <div class="border-base-300 ui-pad my-4 rounded border">
          <ReportFigureEmbed figure={fb} />
        </div>
      ) : (
        <div class="text-danger text-xs">Missing figure: {fig[1]}</div>
      );
    }
    const img = /^image:(.+)$/.exec(src);
    if (img) {
      const ib = images()[img[1]];
      return ib ? (
        <img class="w-full" src={assetUrl(ib.imgFile)} alt={alt} />
      ) : (
        <div class="text-danger text-xs">Missing image: {img[1]}</div>
      );
    }
    return undefined;
  }

  let editorApi: ReportEditorApi | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // Resolver for the in-flight AI proposal — settled when the user accepts or
  // rejects, so the proposing tool call learns the outcome (see proposeEdit).
  let proposalResolve: ((r: { accepted: boolean }) => void) | undefined;
  // Suppresses the "user edited" AI notification while we apply an AI-accepted
  // edit through the editor (setBody also fires the CM change listener).
  let applyingProgrammaticEdit = false;

  // Settle any in-flight proposal (used when one is superseded or the editor
  // closes), so an awaiting AI tool never hangs.
  function settleProposal(accepted: boolean) {
    proposalResolve?.({ accepted });
    proposalResolve = undefined;
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
    switch (saveStatus()) {
      case "saving":
        return {
          text: t3({ en: "Saving…", fr: "Enregistrement…" }),
          dot: "bg-warning",
        };
      case "unsaved":
        return {
          text: t3({
            en: "Unsaved changes",
            fr: "Modifications non enregistrées",
          }),
          dot: "bg-base-300",
        };
      case "error":
        return {
          text: t3({ en: "Save failed", fr: "Échec de l'enregistrement" }),
          dot: "bg-danger",
        };
      case "saved":
      default:
        return {
          text: lastSavedAt()
            ? t3({
                en: `Saved ${lastSavedAt()}`,
                fr: `Enregistré ${lastSavedAt()}`,
              })
            : t3({ en: "Saved", fr: "Enregistré" }),
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
      mode: "editing_report",
      reportId: p.reportId,
      reportLabel: label(),
      getBody: () => body(),
      getFigures: () => figures(),
      getImages: () => images(),
      getSelection: () => editorApi?.getSelection(),
      proposeEdit: (proposal) => {
        // Supersede any unresolved proposal (treat as rejected) before staging.
        settleProposal(false);
        setPendingProposal(proposal);
        return new Promise<{ accepted: boolean }>((resolve) => {
          proposalResolve = resolve;
        });
      },
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

  async function acceptProposal() {
    const prop = pendingProposal();
    if (!prop) return;
    if (prop.addFigures) {
      const next = { ...figures(), ...prop.addFigures };
      setFigures(next);
      await persistFigures(next);
    }
    applyingProgrammaticEdit = true;
    editorApi?.setBody(prop.newBody);
    applyingProgrammaticEdit = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    await persistBody(prop.newBody);
    setPendingProposal(undefined);
    settleProposal(true);
    editorApi?.refresh();
  }

  function rejectProposal() {
    setPendingProposal(undefined);
    settleProposal(false);
    editorApi?.refresh();
  }

  onCleanup(() => {
    void flushBodySave();
    settleProposal(false);
    setAIContext(p.returnToContext ?? { mode: "viewing_reports" });
  });

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
    setSaveStatus("unsaved");
    // Let the AI know the user touched the body (skip AI-applied edits).
    if (!applyingProgrammaticEdit) notifyAI({ type: "edited_report_locally" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistBody(nextBody), AUTOSAVE_MS);
  }

  async function persistFigures(next: Record<string, FigureBlock>) {
    setSaveStatus("saving");
    const res = await serverActions.updateReportFigures({
      projectId,
      report_id: p.reportId,
      figures: next,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      markSaved();
    } else {
      setSaveError(res.err);
      setSaveStatus("error");
    }
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

  async function updateFigure(id: string, figureBlock: FigureBlock) {
    const next = { ...figures(), [id]: figureBlock };
    setFigures(next);
    await persistFigures(next);
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
    };
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
        type: "from_visualization",
        visualizationId: sel.visualizationId,
        replicant: sel.replicant,
      }));
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to add visualization",
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
    const chosen = await openInnerEditor({
      element: SelectVisualizationForSlide,
      props: { projectState },
    });
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
          err instanceof Error ? err.message : "Failed to switch visualization",
        intent: "danger",
      });
    }
  }

  async function handleEdit() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const source = figures()[sel.id]?.source;
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
        projectId,
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
    await updateFigure(sel.id, built.figureBlock);
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

  async function handleDelete() {
    const sel = selectedEmbed();
    if (!sel) return;
    editorApi?.removeEmbedToken(sel.kind, sel.id);
    if (sel.kind === "figure") {
      const next = { ...figures() };
      delete next[sel.id];
      setFigures(next);
      await persistFigures(next);
    } else {
      const next = { ...images() };
      delete next[sel.id];
      setImages(next);
      await persistImages(next);
    }
    setSelectedEmbed(undefined);
  }

  async function download() {
    await openComponent({
      element: DownloadReport,
      props: { projectId, reportId: p.reportId },
    });
  }

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
              en: "Someone else may be editing this report — your changes were saved over theirs.",
              fr: "Quelqu'un d'autre modifie peut-être ce rapport — vos modifications ont été enregistrées par-dessus les siennes.",
            })}
          </span>
          <Button
            size="sm"
            outline
            onClick={() => setShowConflictBanner(false)}
          >
            {t3({ en: "Dismiss", fr: "Ignorer" })}
          </Button>
        </div>
      </Show>
      <Show when={saveError()}>
        <div class="text-danger ui-pad text-xs">{saveError()}</div>
      </Show>
      <Show when={!isLoading()}>
        <div
          class="ui-pad-lg min-h-0 flex-1"
          classList={{ hidden: mode() !== "edit" || !!pendingProposal() }}
        >
          <ReportEditor
            body={body()}
            figures={figures()}
            images={images()}
            assetUrl={assetUrl}
            onBodyChange={handleBodyChange}
            onSelectEmbed={(kind, id) => setSelectedEmbed({ kind, id })}
            selectedId={() => selectedEmbed()?.id}
            ref={(api) => (editorApi = api)}
          />
        </div>
        {/* Read-only HTML preview — View mode, not during a proposal. */}
        <Show when={mode() === "view" && !pendingProposal()}>
          <div class="ui-pad-lg min-h-0 flex-1 overflow-auto">
            <div class="bg-base-100 mx-auto w-full max-w-4xl rounded border px-6 py-10">
              <MarkdownPresentationJsx
                markdown={body()}
                renderImage={renderEmbed}
                style={REPORT_MARKDOWN_STYLE}
              />
            </div>
          </div>
        </Show>
        {/* keyed so a *new* proposal rebuilds the diff (M1). */}
        <Show when={pendingProposal()} keyed>
          {(prop) => (
            <div class="bg-base-100 min-h-0 flex-1">
              <ReportMarkdownDiff
                oldText={body()}
                newText={prop.newBody}
                summary={prop.summary}
                onAccept={acceptProposal}
                onReject={rejectProposal}
              />
            </div>
          )}
        </Show>
      </Show>
    </div>
  );

  return (
    <InnerEditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={label()}
            class="border-base-300"
            leftChildren={
              <Button
                iconName="chevronLeft"
                onClick={() => p.close(undefined)}
              />
            }
            centerChildren={
              <ButtonGroup<ReportMode>
                items={[
                  { id: "edit", label: t3({ en: "Edit", fr: "Édition" }) },
                  { id: "view", label: t3({ en: "View", fr: "Aperçu" }) },
                ]}
                value={mode()}
                onChange={(v) => v && setMode(v)}
              />
            }
          >
            <div class="ui-gap-sm flex items-center">
              <div class="text-neutral mr-2 flex items-center gap-1.5 text-xs">
                <div
                  class="h-1.5 w-1.5 flex-none rounded-full"
                  classList={{
                    [saveIndicator().dot]: true,
                    "animate-pulse": saveStatus() === "saving",
                  }}
                />
                <span>{saveIndicator().text}</span>
              </div>
              <Button outline iconName="download" onClick={download}>
                {t3({ en: "Download", fr: "Télécharger" })}
              </Button>
              <Show when={!showAi()}>
                <Button
                  outline
                  iconName="chevronLeft"
                  onClick={() => setShowAi(true)}
                >
                  {t3({ en: "AI", fr: "IA" })}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        {/* One always-mounted frame: the sidebar collapses (isShown=false) in
            View, but MainArea stays mounted across the toggle — the CM editor
            and figure widgets never remount (no re-hydration flicker; undo and
            scroll preserved). */}
        <FrameLeftResizable
          startingWidth={300}
          minWidth={240}
          maxWidth={460}
          hoverOffset="offset-for-border-1-on-left"
          isShown={mode() === "edit"}
          panelChildren={
            <div class="border-base-300 flex h-full w-full flex-col border-r">
              <ReportEmbedEditor
                embed={selectedEmbedDetail()}
                canConfigure={canConfigure() && mode() === "edit"}
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
          }
        >
          <MainArea />
        </FrameLeftResizable>
      </FrameTop>
    </InnerEditorWrapper>
  );
}
