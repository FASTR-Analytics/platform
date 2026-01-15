import { AiSlideDeckSlide, DEFAULT_ANTHROPIC_MODEL, type ProjectDetail } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  ButtonGroup,
  createAIChat,
  createSDKClient,
  createTextEditorHandler,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
} from "panther";
import { createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { createVisualizationTools } from "../ai_tools/tools/visualization_tools";
import { getAiSlideDeckSystemPrompt } from "./ai_system_prompt";
import { SlideDeckPreview } from "./slide_deck_preview";
import { AIToolsDebug } from "../ai_tools/ai_debug_component";

type Props = {
  projectDetail: ProjectDetail;
  reportId: string;
  initialSlides: AiSlideDeckSlide[];
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
    getAiSlideDeckSystemPrompt(p.projectDetail.aiContext)
  );

  // Initialize JSON string from initial slides (just the array, label stored separately)
  const initialJson = JSON.stringify(p.initialSlides ?? [], null, 2);

  // Current JSON string (what the AI edits)
  const [jsonContent, setJsonContent] = createSignal(initialJson);

  // Parsed slides (for preview) - null if invalid JSON
  const [parsedSlides, setParsedSlides] = createSignal<AiSlideDeckSlide[]>(p.initialSlides ?? []);
  const [jsonError, setJsonError] = createSignal<string | undefined>(undefined);

  // Save state
  const [isSaving, setIsSaving] = createSignal(false);
  const [lastSaved, setLastSaved] = createSignal<string | undefined>(undefined);
  const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);

  // Debounced save
  const DEBOUNCE_MS = 2000;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  async function saveContent(slides: AiSlideDeckSlide[]) {
    setIsSaving(true);
    try {
      const res = await serverActions.updateAiSlideDeckContent({
        projectId,
        report_id: p.reportId,
        slides,
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

  function debouncedSave(slides: AiSlideDeckSlide[]) {
    setHasUnsavedChanges(true);
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveContent(slides);
    }, DEBOUNCE_MS);
  }

  // Handle content change with JSON validation
  function handleContentChange(newJsonString: string) {
    // Strip any previous error prefix before parsing
    const cleanJson = newJsonString.replace(/^\/\/ ERROR:.*\n/, "");
    setJsonContent(cleanJson);

    try {
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        setParsedSlides(parsed);
        setJsonError(undefined);
        debouncedSave(parsed);
      } else {
        const errorMsg = "Must be an array of slides, not an object";
        setJsonError(errorMsg);
        // Prepend error so AI can see it
        setJsonContent(`// ERROR: ${errorMsg}\n${cleanJson}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Invalid JSON";
      setJsonError(errorMsg);
      // Prepend error so AI can see it
      setJsonContent(`// ERROR: ${errorMsg}\n${cleanJson}`);
    }
  }

  // Cleanup on unmount - save any pending changes
  onCleanup(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      if (hasUnsavedChanges() && !jsonError()) {
        saveContent(parsedSlides());
      }
    }
  });

  const textEditorHandler = createTextEditorHandler(
    jsonContent,
    handleContentChange,
    () => null,
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 4096,
        },
        tools: createVisualizationTools(projectId),
        builtInTools: { webSearch: true, textEditor: true },
        textEditorHandler,
        conversationId: `ai-slide-deck-${p.reportId}`,
        enableStreaming: true,
        system: systemPrompt(),
      }}
    >
      <ProjectAiSlideDeckInner
        projectId={projectId}
        reportId={p.reportId}
        reportLabel={p.reportLabel}
        jsonContent={jsonContent()}
        setJsonContent={handleContentChange}
        parsedSlides={parsedSlides()}
        jsonError={jsonError()}
        backToProject={p.backToProject}
        isSaving={isSaving()}
        lastSaved={lastSaved()}
        hasUnsavedChanges={hasUnsavedChanges()}
      />
    </AIChatProvider>
  );
}

type RightPanelMode = "slides" | "json" | "debug";

function ProjectAiSlideDeckInner(p: {
  projectId: string;
  reportId: string;
  reportLabel: string;
  jsonContent: string;
  setJsonContent: (content: string) => void;
  parsedSlides: AiSlideDeckSlide[];
  jsonError: string | undefined;
  backToProject: (withUpdate: boolean) => Promise<void>;
  isSaving: boolean;
  lastSaved: string | undefined;
  hasUnsavedChanges: boolean;
}) {
  const { clearConversation, isLoading } = createAIChat();

  const [rightPanelMode, setRightPanelMode] = createSignal<RightPanelMode>("slides");

  return (
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
            <ButtonGroup
              options={[
                { value: "slides", label: "Slides" },
                { value: "json", label: "JSON" },
                { value: "debug", label: "Debug" },
              ]}
              value={rightPanelMode()}
              onChange={(v) => setRightPanelMode(v as RightPanelMode)}
            />
            <Button
              onClick={clearConversation}
              disabled={isLoading()}
              outline
              iconName="trash"
            >
              Clear chat
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
          <div class="border-base-300 h-full border-r">
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
            />
          </div>
        }
      >
        <Switch>
          <Match when={rightPanelMode() === "slides"}>
            <div class="bg-base-200 h-full">
              <SlideDeckPreview
                projectId={p.projectId}
                slides={p.parsedSlides}
                deckLabel={p.reportLabel}
              />
            </div>
          </Match>
          <Match when={rightPanelMode() === "json"}>
            <div class="flex h-full flex-col">
              <Show when={p.jsonError}>
                <div class="bg-error/10 text-error flex-none border-b px-4 py-2 text-sm">
                  {p.jsonError}
                </div>
              </Show>
              <div class="min-h-0 flex-1">
                <textarea
                  class="h-full w-full resize-none bg-transparent p-4 font-mono text-sm focus:outline-none"
                  value={p.jsonContent}
                  onInput={(e) => p.setJsonContent(e.currentTarget.value)}
                  spellcheck={false}
                />
              </div>
            </div>
          </Match>
          <Match when={rightPanelMode() === "debug"}>
            <AIToolsDebug projectId={p.projectId} />
          </Match>
        </Switch>
      </FrameLeftResizable>
    </FrameTop>
  );
}
