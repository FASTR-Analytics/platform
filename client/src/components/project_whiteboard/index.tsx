import type { InstanceDetail, ProjectDetail, AiContentSlideInput, VisualizationFolder, MetricWithStatus } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  FrameLeftResizable,
  FrameTop,
  openComponent,
  type AIChatConfig,
} from "panther";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { getToolsForWhiteboard, type WhiteboardContent } from "../ai_tools/ai_tool_definitions";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";
import { getWhiteboardSystemPrompt } from "~/components/ai_prompts/whiteboard";
import { convertWhiteboardInputToPageInputs } from "./convert_whiteboard_input";
import { WhiteboardCanvas } from "./whiteboard_canvas";
import { loadWhiteboard, clearWhiteboard as clearWhiteboardStore } from "./whiteboard_store";
import { SaveToDeckModal } from "./save_to_deck_modal";
import { SaveToVisualizationModal } from "./save_to_visualization_modal";
import { useAIDocuments, AIDocumentButton, AIDocumentList } from "../ai_documents";

type SaveToDeckModalProps = {
  projectId: string;
  input: AiContentSlideInput;
  metrics: MetricWithStatus[];
};

type SaveToDeckModalReturn = { deckId: string } | undefined;

type SaveToVizModalProps = {
  projectId: string;
  input: AiContentSlideInput;
  folders: VisualizationFolder[];
  metrics: MetricWithStatus[];
};

type SaveToVizModalReturn = { visualizationId: string } | undefined;

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
};

export function ProjectWhiteboard(p: Props) {
  const projectId = p.projectDetail.id;
  const conversationId = `whiteboard-${projectId}`;

  const [content, setContent] = createSignal<WhiteboardContent | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  const aiDocs = useAIDocuments({ projectId, conversationId });

  onMount(async () => {
    const saved = await loadWhiteboard(conversationId);
    if (saved?.input) {
      const pageInputs = await convertWhiteboardInputToPageInputs(projectId, saved.input, p.projectDetail.metrics);
      setContent({ input: saved.input, pageInputs });
    }
    setIsLoading(false);
  });

  const sdkClient = createProjectSDKClient(projectId);

  const tools = createMemo(() =>
    getToolsForWhiteboard(projectId, conversationId, setContent, p.projectDetail.projectModules, p.projectDetail.metrics)
  );

  const systemPrompt = createMemo(() =>
    getWhiteboardSystemPrompt(p.instanceDetail, p.projectDetail)
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools() as AIChatConfig["tools"],
        conversationId,
        system: systemPrompt,
        getDocumentRefs: aiDocs.getDocumentRefs,
      }}
    >
      <ProjectWhiteboardInner
        projectId={projectId}
        conversationId={conversationId}
        content={content()}
        isLoading={isLoading()}
        setContent={setContent}
        folders={p.projectDetail.visualizationFolders}
        metrics={p.projectDetail.metrics}
        aiDocs={aiDocs}
      />
    </AIChatProvider>
  );
}

function ProjectWhiteboardInner(p: {
  projectId: string;
  conversationId: string;
  content: WhiteboardContent | null;
  isLoading: boolean;
  setContent: (c: WhiteboardContent | null) => void;
  folders: VisualizationFolder[];
  metrics: MetricWithStatus[];
  aiDocs: ReturnType<typeof useAIDocuments>;
}) {
  const { clearConversation, isLoading: aiLoading } = createAIChat();

  async function handleClear() {
    clearConversation();
    p.setContent(null);
    await clearWhiteboardStore(p.conversationId);
  }

  async function handleSaveToDeck() {
    if (!p.content) return;
    await openComponent<SaveToDeckModalProps, SaveToDeckModalReturn>({
      element: SaveToDeckModal,
      props: {
        projectId: p.projectId,
        input: p.content.input,
        metrics: p.metrics,
      },
    });
  }

  async function handleSaveToVisualization() {
    if (!p.content) return;
    await openComponent<SaveToVizModalProps, SaveToVizModalReturn>({
      element: SaveToVisualizationModal,
      props: {
        projectId: p.projectId,
        input: p.content.input,
        folders: p.folders,
        metrics: p.metrics,
      },
    });
  }

  return (
    <FrameLeftResizable
      minWidth={300}
      startingWidth={500}
      maxWidth={800}
      panelChildren={
        <div class="border-base-300 h-full w-full border-r flex flex-col">
          <div class="flex items-center gap-2 border-b border-base-300 ui-pad">
            <div class="flex-1 font-700 text-lg">AI chat</div>

            <AIDocumentButton
              documents={p.aiDocs.documents()}
              onOpenSelector={p.aiDocs.openSelector}
              onRemoveDocument={p.aiDocs.removeDocument}
            />

            <Button
              onClick={handleClear}
              disabled={aiLoading()}
              outline
              iconName="trash"
              size="sm"
            >
              Clear chat
            </Button>
          </div>
          <AIDocumentList
            documents={p.aiDocs.documents()}
            onRemove={p.aiDocs.removeDocument}
          />
          <div class="w-full h-0 flex-1">
            <AIChat />
          </div>
        </div>
      }
    >

      <FrameTop panelChildren={<div class="flex items-center border-b border-base-300 ui-pad">
        <div class="flex-1 font-700 text-lg">Whiteboard</div>
        <div class="flex items-center gap-4">
          <Show when={p.content}>
            <Button
              onClick={handleSaveToVisualization}
              disabled={aiLoading()}
              outline
              iconName="chart"
              size="sm"
            >
              Save as visualization
            </Button>
            <Button
              onClick={handleSaveToDeck}
              disabled={aiLoading()}
              outline
              iconName="plus"
              size="sm"
            >
              Save as slide deck
            </Button>
          </Show>
        </div>
      </div>}>
        <WhiteboardCanvas
          pageInputs={p.content?.pageInputs ?? null}
          isLoading={p.isLoading}
        /></FrameTop>
    </FrameLeftResizable>
  );
}
