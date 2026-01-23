import { SimpleSlide, MixedSlide, DEFAULT_ANTHROPIC_MODEL, type InstanceDetail, type ProjectDetail } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  createSDKClient,
  createTextEditorHandler,
  FrameThreeColumnResizable,
  FrameTop,
  getEditorWrapper,
  HeadingBar,
  Slider,
  TextEditor,
  type TextEditorSelection,
} from "panther";
import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { getSlideDeckSystemPrompt } from "../ai_prompts/slide_deck";
import { getToolsForSlides } from "../ai_tools/ai_tool_definitions";
import { AIToolsDebug } from "../ai_tools/AIDebugComponent";
import { SlideDeckPreview } from "./slide_deck_preview";
import { SlideEditor, type SlideEditorInnerProps } from "./slide_editor";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  reportId: string;
  initialConfig: { plan?: string; slides: MixedSlide[] };
  reportLabel: string;
  backToProject: (withUpdate: boolean) => Promise<void>;
};

export function ProjectAiSlideDeck(p: Props) {
  const projectId = p.projectDetail.id;

  const sdkClient = createSDKClient({
    baseURL: `${_SERVER_HOST}/ai`,
    defaultHeaders: { "Project-Id": projectId },
  });

  const systemPrompt = createMemo(() =>
    getSlideDeckSystemPrompt(p.instanceDetail, p.projectDetail)
  );

  // Single source of truth: store
  const [content, setContent] = createStore({
    plan: p.initialConfig.plan ?? "",
    slides: p.initialConfig.slides ?? []
  });

  // Derive JSON for AI text editor
  const jsonContentForAI = () => JSON.stringify(content, null, 2);

  const [jsonError, setJsonError] = createSignal<string | undefined>(undefined);

  // Save state
  const [isSaving, setIsSaving] = createSignal(false);
  const [lastSaved, setLastSaved] = createSignal<string | undefined>(undefined);
  const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);

  // Debounced save
  const DEBOUNCE_MS = 2000;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  async function saveContent() {
    setIsSaving(true);
    try {
      const res = await serverActions.updateAiSlideDeckContent({
        projectId,
        report_id: p.reportId,
        plan: content.plan,
        slides: content.slides,
      });
      if (res.success) {
        setLastSaved(new Date().toLocaleTimeString());
        setHasUnsavedChanges(false);
      } else {
        console.error("Save failed:", res);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setIsSaving(false);
    }
  }

  function debouncedSave() {
    setHasUnsavedChanges(true);
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveContent();
    }, DEBOUNCE_MS);
  }

  // Handle content change with JSON validation (from AI)
  function handleContentChange(newJsonString: string) {
    const cleanJson = newJsonString.replace(/^\/\/ ERROR:.*\n/, "");

    try {
      const parsed = JSON.parse(cleanJson);
      if (typeof parsed === 'object' && parsed !== null &&
        typeof parsed.plan === 'string' &&
        Array.isArray(parsed.slides)) {
        setContent(parsed);
        setJsonError(undefined);
        debouncedSave();
      } else {
        setJsonError("Must be an object with 'plan' (string) and 'slides' (array)");
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  // Cleanup on unmount - save any pending changes
  onCleanup(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      if (hasUnsavedChanges() && !jsonError()) {
        saveContent();
      }
    }
  });

  // Track text selection for AI
  const [currentSelection, setCurrentSelection] = createSignal<TextEditorSelection>(null);

  const textEditorHandler = createTextEditorHandler(
    jsonContentForAI,
    handleContentChange,
    () => currentSelection(),
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 4096,
        },
        tools: getToolsForSlides(projectId, () => currentSelection()),
        builtInTools: { webSearch: true, textEditor: true },
        textEditorHandler,
        conversationId: `ai-slide-deck-${p.reportId}`,
        enableStreaming: true,
        system: systemPrompt,
      }}
    >
      <ProjectAiSlideDeckInner
        projectDetail={p.projectDetail}
        reportId={p.reportId}
        reportLabel={p.reportLabel}
        plan={content.plan}
        slides={content.slides}
        onPlanChange={(newPlan) => {
          setContent("plan", newPlan);
          debouncedSave();
        }}
        onSlidesReorder={(newSlides) => {
          setContent("slides", newSlides);
          debouncedSave();
        }}
        jsonError={jsonError()}
        backToProject={p.backToProject}
        isSaving={isSaving()}
        lastSaved={lastSaved()}
        hasUnsavedChanges={hasUnsavedChanges()}
      />
    </AIChatProvider>
  );
}

const MARKDOWN_STYLE = {
  text: {
    base: {
      font: {
        fontFamily: "Roboto Mono",
      },
      lineHeight: 1.3,
    },
  },
};

function ProjectAiSlideDeckInner(p: {
  projectDetail: ProjectDetail;
  reportId: string;
  reportLabel: string;
  plan: string;
  slides: MixedSlide[];
  onPlanChange: (plan: string) => void;
  onSlidesReorder: (slides: MixedSlide[]) => void;
  jsonError: string | undefined;
  backToProject: (withUpdate: boolean) => Promise<void>;
  isSaving: boolean;
  lastSaved: string | undefined;
  hasUnsavedChanges: boolean;
}) {
  const { clearConversation, isLoading } = createAIChat();
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [slideSize, setSlideSize] = createSignal(400);
  const [showDebug, setShowDebug] = createSignal(false);
  const [showLeftPane, setShowLeftPane] = createSignal(true);
  const [showCenterPane, setShowCenterPane] = createSignal(true);
  const [showRightPane, setShowRightPane] = createSignal(true);
  const [selectedSlideIndices, setSelectedSlideIndices] = createSignal<number[]>([]);

  // Debug selection changes
  createEffect(() => {
    console.log("selectedSlideIndices changed:", selectedSlideIndices());
  });

  // Handler for updating a slide after editing
  async function updateSlideAtIndex(index: number, updatedSlide: MixedSlide) {
    const newSlides = [...p.slides];
    newSlides[index] = updatedSlide;
    p.onSlidesReorder(newSlides);
  }

  // Open editor for selected slide (if exactly one)
  async function openEditorForSelected() {
    const indices = selectedSlideIndices();
    console.log("openEditorForSelected called, indices:", indices);
    if (indices.length !== 1) {
      console.log("Not exactly 1 slide selected, aborting");
      return;
    }
    const index = indices[0];
    console.log("Opening editor for slide", index);
    try {
      const result = await openEditor({
        element: SlideEditor,
        props: {
          projectDetail: p.projectDetail,
          reportId: p.reportId,
          slide: p.slides[index],
          slideIndex: index,
          totalSlides: p.slides.length,
        },
      });
      console.log("Editor closed, result:", result);
      if (result !== undefined) {
        // User saved - update slide
        await updateSlideAtIndex(index, result);
      }
      // Otherwise user cancelled - do nothing
    } catch (e) {
      console.error("Error opening editor:", e);
    }
  }

  // Add new slide
  function addNewSlide() {
    const indices = selectedSlideIndices();
    const afterIndex = indices.length > 0 ? Math.max(...indices) : p.slides.length - 1;

    const newSlide: SimpleSlide = {
      type: "content",
      heading: "New slide",
      blocks: [],
    };

    const newSlides = [...p.slides];
    newSlides.splice(afterIndex + 1, 0, newSlide);
    p.onSlidesReorder(newSlides);
  }

  console.log("Rendering 1", "slideSize:", slideSize(), "showDebug:", showDebug())

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={p.reportLabel}
            french={false}
            leftChildren={
              <Button iconName="chevronLeft" onClick={() => p.backToProject(true)}>
              </Button>
            }
          >
            <div class="ui-gap-sm flex w-full items-center">
              <Show when={p.isSaving}>
                <span class="text-sm text-success">Saving...</span>
              </Show>
              <Show when={!p.isSaving && p.hasUnsavedChanges}>
                <span class="text-sm text-neutral">Unsaved changes</span>
              </Show>
              <Show when={!p.isSaving && !p.hasUnsavedChanges}>
                <span class="text-sm text-neutral">Saved</span>
              </Show>
              <Show when={p.jsonError}>
                <span class="text-sm text-error">JSON Error</span>
              </Show>
              {/* <Button
              onClick={() => setShowDebug(!showDebug())}
              outline
              iconName="code"
            >
              Debug
            </Button> */}
            </div>
          </HeadingBar>
        }
      >
        <FrameThreeColumnResizable
          startingWidths={[600, 400, 800]}
          minWidths={[300, 300, 300]}
          maxWidths={[1600, 1600, 2000]}
          leftLabel="AI Chat"
          onLeftExpand={() => setShowLeftPane(true)}
          leftChild={showLeftPane() ? <div class="border-base-300 h-full border-r flex flex-col">

            <div class="flex items-center border-b border-base-300 ui-pad">
              <div class="flex-1 font-700">AI assistant</div>
              <div class="flex ui-gap-sm">
                <Button
                  onClick={clearConversation}
                  disabled={isLoading()}
                  outline
                  iconName="trash"
                  size="sm"
                >
                  Clear chat
                </Button>
                <Button iconName="x"
                  size="sm" outline onClick={() => setShowLeftPane(false)} />
              </div>
            </div>
            <div class="w-full h-0 flex-1">
              <AIChat markdownStyle={MARKDOWN_STYLE} />
            </div>
          </div> : undefined}
          centerLabel="Plan"
          onCenterExpand={() => setShowCenterPane(true)}
          centerChild={showCenterPane() ? <div class="border-base-300 bg-base-200 h-full border-r flex flex-col">
            <div class="flex items-center border-b border-base-300 ui-pad">
              <div class="flex-1 font-700">Plan</div>
              <div class="flex ui-gap-sm">
                <Button iconName="x" size="sm" outline onClick={() => setShowCenterPane(false)} />
              </div>
            </div>
            <div class="w-full h-0 flex-1">
              <TextEditor
                value={p.plan}
                onChange={p.onPlanChange}
                fullHeight
                lineWrapping
                language="markdown"
              /></div>
          </div> : undefined}
          rightLabel="Slides"
          onRightExpand={() => setShowRightPane(true)}
          rightChild={showRightPane() ? <div class="h-full flex flex-col">
            <div class="flex items-center border-b border-base-300 ui-pad">
              <div class="flex-1 font-700">Slide deck</div>
              <div class="flex ui-gap-sm">
                {/* <Button
                  iconName="pencil"
                  size="sm"
                  onClick={() => {
                    openEditorForSelected();
                  }}
                  disabled={selectedSlideIndices().length !== 1}
                >
                  Edit
                </Button> */}
                <Button
                  iconName="plus"
                  size="sm"
                  onClick={(e) => {
                  }}
                >
                  Turn this into a "plan"
                </Button>
                <Button
                  iconName="plus"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log("ADD BUTTON CLICKED!");
                    addNewSlide();
                  }}
                >
                  Add slide
                </Button>
                <div class="flex items-center gap-2" style={{ width: "200px" }}>
                  <Slider
                    min={150}
                    max={1200}
                    step={50}
                    value={slideSize()}
                    onChange={setSlideSize}
                  />
                </div>
                <Button iconName="x" size="sm" outline onClick={() => setShowRightPane(false)} />
              </div>
            </div>
            <div class="w-full h-0 flex-1">
              {/* <Show when={!showDebug()}> */}
              <SlideDeckPreview
                projectDetail={p.projectDetail}
                reportId={p.reportId}
                slides={p.slides}
                deckLabel={p.reportLabel}
                slideSize={slideSize()}
                onReorder={p.onSlidesReorder}
                openEditor={openEditor}
                onSlideUpdate={updateSlideAtIndex}
                onSelectionChange={setSelectedSlideIndices}
              />
              {/* </Show>
            <Show when={showDebug()}>
              <AIToolsDebug projectId={p.projectId} />
            </Show> */}
            </div>
          </div> : undefined}
        />
      </FrameTop>
    </EditorWrapper>
  );
}
