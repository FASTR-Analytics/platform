import type { InstanceDetail, ProjectDetail, ContentSlide } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  FrameLeftResizable,
  type AIChatConfig,
} from "panther";
import { createMemo, createSignal, onMount } from "solid-js";
import { getToolsForWhiteboard } from "../ai_tools/ai_tool_definitions";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";
import { getWhiteboardSystemPrompt } from "~/components/ai_prompts/whiteboard";
import { WhiteboardCanvas } from "./whiteboard_canvas";
import { loadWhiteboard, clearWhiteboard as clearWhiteboardStore } from "./whiteboard_store";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
};

export function ProjectWhiteboard(p: Props) {
  const projectId = p.projectDetail.id;
  const conversationId = `whiteboard-${projectId}`;

  const [content, setContent] = createSignal<ContentSlide | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  onMount(async () => {
    const saved = await loadWhiteboard(conversationId);
    if (saved?.content) {
      setContent(saved.content);
    }
    setIsLoading(false);
  });

  const sdkClient = createProjectSDKClient(projectId);

  const tools = createMemo(() =>
    getToolsForWhiteboard(projectId, conversationId, setContent)
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
      }}
    >
      <ProjectWhiteboardInner
        projectId={projectId}
        conversationId={conversationId}
        content={content()}
        isLoading={isLoading()}
        setContent={setContent}
      />
    </AIChatProvider>
  );
}

function ProjectWhiteboardInner(p: {
  projectId: string;
  conversationId: string;
  content: ContentSlide | null;
  isLoading: boolean;
  setContent: (c: ContentSlide | null) => void;
}) {
  const { clearConversation, isLoading: aiLoading } = createAIChat();

  async function handleClear() {
    clearConversation();
    p.setContent(null);
    await clearWhiteboardStore(p.conversationId);
  }

  return (
    <FrameLeftResizable
      minWidth={300}
      startingWidth={500}
      maxWidth={800}
      panelChildren={
        <div class="border-base-300 h-full w-full border-r flex flex-col">
          <div class="flex items-center border-b border-base-300 ui-pad">
            <div class="flex-1 font-700 text-lg">AI Whiteboard</div>
            <Button
              onClick={handleClear}
              disabled={aiLoading()}
              outline
              iconName="trash"
              size="sm"
            >
              Clear
            </Button>
          </div>
          <div class="w-full h-0 flex-1">
            <AIChat />
          </div>
        </div>
      }
    >
      <WhiteboardCanvas
        projectId={p.projectId}
        content={p.content}
        isLoading={p.isLoading}
      />
    </FrameLeftResizable>
  );
}
