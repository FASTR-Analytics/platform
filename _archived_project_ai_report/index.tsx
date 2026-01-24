import { isFrench, type InstanceDetail, type ProjectDetail } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  ButtonGroup,
  createAIChat,
  createTextEditorHandler,
  downloadPdf,
  downloadWord,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  MarkdownTextEditor,
  markdownToPdfBrowser,
  markdownToWordBrowser,
  type TextEditorSelection,
} from "panther";
import { createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import fontMap from "~/font-map.json";
import { serverActions } from "~/server_actions";
import { longFormEditorState } from "~/state/long_form_editor";
import { AIToolsDebug } from "../ai_tools/AIDebugComponent";
import { getToolsForReport } from "../ai_tools/ai_tool_definitions";
import { getReportSystemPrompt } from "../ai_prompts/report";
import { buildFigureMapForExport } from "./build_figure_map";
import { extractFiguresFromMarkdown } from "./extract_figure_ids";
import { createFigureRenderer } from "./markdown_figure_renderer";
import { createUndoRedo } from "./use_undo_redo";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  reportId: string;
  initialMarkdown: string;
  reportLabel: string;
  backToProject: (withUpdate: boolean) => Promise<void>;
};

export function ProjectAiReport(p: Props) {
  const projectId = p.projectDetail.id;
  const sdkClient = createProjectSDKClient(projectId);
  const systemPrompt = createMemo(() => getReportSystemPrompt(p.instanceDetail, p.projectDetail));

  // Use stable UI state from module-level store
  const { textEditorMode, setTextEditorMode, rightPanelMode, setRightPanelMode } = longFormEditorState;

  // Document content with undo/redo
  const undoRedo = createUndoRedo(p.initialMarkdown);

  // Save state
  const [isSaving, setIsSaving] = createSignal(false);
  const [lastSaved, setLastSaved] = createSignal<string | undefined>(undefined);
  const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);

  // Debounced save
  const DEBOUNCE_MS = 2000;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  async function saveContent(markdown: string) {
    setIsSaving(true);
    try {
      const res = await serverActions.updateLongFormContent({
        projectId,
        report_id: p.reportId,
        markdown,
      });
      if (res.success) {
        setLastSaved(new Date().toLocaleTimeString());
        setHasUnsavedChanges(false);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function debouncedSave(markdown: string) {
    setHasUnsavedChanges(true);
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveContent(markdown);
    }, DEBOUNCE_MS);
  }

  // For manual edits - debounced undo stack push
  function handleContentChange(newContent: string) {
    undoRedo.pushChange(newContent);
    debouncedSave(newContent);
  }

  // For AI edits - immediate undo stack push
  function handleContentChangeImmediate(newContent: string) {
    undoRedo.pushChangeImmediate(newContent);
    debouncedSave(newContent);
  }

  function handleUndo() {
    const prev = undoRedo.undo();
    if (prev !== undefined) {
      debouncedSave(prev);
    }
  }

  function handleRedo() {
    const next = undoRedo.redo();
    if (next !== undefined) {
      debouncedSave(next);
    }
  }

  // Cleanup on unmount - save any pending changes
  onCleanup(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      if (hasUnsavedChanges()) {
        saveContent(undoRedo.current());
      }
    }
  });

  // Track text selection for AI
  const [currentSelection, setCurrentSelection] = createSignal<TextEditorSelection>(null);

  const textEditorHandler = createTextEditorHandler(
    undoRedo.current,
    handleContentChangeImmediate,
    () => currentSelection(),
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: getToolsForReport(projectId, () => currentSelection()),
        builtInTools: { webSearch: true, textEditor: true },
        textEditorHandler,
        conversationId: `ai-report-${p.reportId}`,
        enableStreaming: true,
        system: systemPrompt,
      }}
    >
      <ProjectAiReportInner
        projectId={projectId}
        reportLabel={p.reportLabel}
        documentContent={undoRedo.current()}
        setDocumentContent={handleContentChange}
        onSelectionChange={setCurrentSelection}
        textEditorMode={textEditorMode()}
        setTextEditorMode={setTextEditorMode}
        rightPanelMode={rightPanelMode()}
        setRightPanelMode={setRightPanelMode}
        isSaving={isSaving()}
        lastSaved={lastSaved()}
        hasUnsavedChanges={hasUnsavedChanges()}
        backToProject={p.backToProject}
        canUndo={undoRedo.canUndo()}
        canRedo={undoRedo.canRedo()}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </AIChatProvider>
  );
}

type TextEditorMode = "editable_text" | "presentation";
type RightPanelMode = "text_editor" | "debug";

function ProjectAiReportInner(p: {
  projectId: string;
  reportLabel: string;
  documentContent: string;
  setDocumentContent: (content: string) => void;
  onSelectionChange: (selection: TextEditorSelection) => void;
  textEditorMode: TextEditorMode;
  setTextEditorMode: (mode: TextEditorMode) => void;
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (mode: RightPanelMode) => void;
  isSaving: boolean;
  lastSaved: string | undefined;
  hasUnsavedChanges: boolean;
  backToProject: (withUpdate: boolean) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { clearConversation, isLoading } = createAIChat();
  const [isExporting, setIsExporting] = createSignal(false);

  async function handleDownloadPdf() {
    if (!p.documentContent.trim()) return;
    setIsExporting(true);
    try {
      const extractedFigures = extractFiguresFromMarkdown(p.documentContent);
      const figures = await buildFigureMapForExport(p.projectId, extractedFigures);

      const pdf = await markdownToPdfBrowser(p.documentContent, {
        pageWidth: 1000,
        pageHeight: (1000 * 11) / 8,
        pageBreakRules: {
          h1AlwaysNewPage: true,
          preventOrphanHeadings: true,
        },
        fontPaths: {
          basePath: "/fonts",
          fontMap: fontMap.ttf,
        },
        figures,
      });
      downloadPdf(pdf, "ai-report.pdf");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDownloadWord() {
    if (!p.documentContent.trim()) return;
    setIsExporting(true);
    try {
      const extractedFigures = extractFiguresFromMarkdown(p.documentContent);
      const figures = await buildFigureMapForExport(p.projectId, extractedFigures);

      const doc = await markdownToWordBrowser(p.documentContent, { figures });
      await downloadWord(doc, "ai-report.docx");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={p.reportLabel} french={isFrench()}
          leftChildren={<Button
            iconName="chevronLeft"
            onClick={() => p.backToProject(true)}
          // outline
          >
            {/* Back */}
          </Button>}
        >
          <div class="flex ui-gap-sm items-center w-full">

            <Show when={p.isSaving}>
              <span class="text-sm text-success">Saving...</span>
            </Show>
            <Show when={!p.isSaving && p.hasUnsavedChanges}>
              <span class="text-sm text-neutral">Unsaved changes</span>
            </Show>
            <Show when={!p.isSaving && !p.hasUnsavedChanges}>
              <span class="text-sm text-neutral">Saved</span>
            </Show>
            <Button
              onClick={p.onUndo}
              disabled={!p.canUndo}
              outline
              iconName="undo"
            >
              Undo
            </Button>
            <Button
              onClick={p.onRedo}
              disabled={!p.canRedo}
              outline
              iconName="redo"
            >
              Redo
            </Button>
            <Show when={p.rightPanelMode === "text_editor"}>
              <ButtonGroup
                options={[
                  { value: "editable_text", label: "Edit" },
                  { value: "presentation", label: "Preview" },
                ]}
                value={p.textEditorMode}
                onChange={(v) => p.setTextEditorMode(v as TextEditorMode)}
              />
            </Show>
            <ButtonGroup
              options={[
                { value: "text_editor", label: "Text" },
                { value: "debug", label: "Debug" },
              ]}
              value={p.rightPanelMode}
              onChange={(v) => p.setRightPanelMode(v as RightPanelMode)}
            />
            <Button
              onClick={clearConversation}
              disabled={isLoading()}
              outline
              iconName="trash"
            >
              Clear conversation
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={isExporting() || !p.documentContent.trim()}
              outline
              iconName="download"
            >
              PDF
            </Button>
            <Button
              onClick={handleDownloadWord}
              disabled={isExporting() || !p.documentContent.trim()}
              outline
              iconName="download"
            >
              Word
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <FrameLeftResizable
        startingWidth={800}
        minWidth={400}
        maxWidth={1600}
        panelChildren={
          <div class="border-r border-base-300 h-full">

            <AIChat
              markdownStyle={{
                text: {
                  base: {
                    font: {
                      fontFamily: "Roboto Mono",
                    },
                    lineHeight: 1.3,
                  },
                },
              }}

            />   </div>}>

        <Switch>
          <Match when={p.rightPanelMode === "text_editor"}>
            <MarkdownTextEditor
              value={p.documentContent}
              onChange={p.setDocumentContent}
              onSelectionChange={p.onSelectionChange}
              mode={p.textEditorMode}
              style={{
                text: {
                  base: {
                    lineHeight: 1.4,
                    fontSize: 12,
                  }
                }
              }}
              renderImage={createFigureRenderer(p.projectId)}
            />
          </Match>
          <Match when={p.rightPanelMode === "debug"}>
            <AIToolsDebug projectId={p.projectId} />
          </Match>
        </Switch>
      </FrameLeftResizable>
    </FrameTop>
  );
}
