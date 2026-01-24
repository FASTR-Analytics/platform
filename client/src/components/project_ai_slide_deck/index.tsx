import { type ProjectDetail } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  FrameTop,
  HeadingBar,
} from "panther";
import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { getToolsForSlides } from "../ai_tools/ai_tool_definitions";
import { useProjectDirtyStates, useOptimisticSetLastUpdated } from "../project_runner/mod";
import { SlideList } from "./slide_list";
import { createAiIdScope } from "./utils/ai_id_scope";
import { DEFAULT_MODEL_CONFIG, DEFAULT_BUILTIN_TOOLS, createProjectSDKClient } from "~/components/ai_configs/defaults";

type Props = {
  projectDetail: ProjectDetail;
  deckId: string;
  reportLabel: string;
  backToProject: (withUpdate: boolean) => Promise<void>;
};

export function ProjectAiSlideDeck(p: Props) {
  const projectId = p.projectDetail.id;
  const pds = useProjectDirtyStates();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();

  // State - just track slide IDs, not full slide data
  const [slideIds, setSlideIds] = createSignal<string[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);

  // Load deck metadata on mount (not full slide data)
  onMount(async () => {
    const deckRes = await serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId });

    if (deckRes.success) {
      setSlideIds(deckRes.data.slideIds);
    }
    setIsLoading(false);
  });

  // SSE handling - watch for deck updates
  createEffect(() => {
    const deckUpdate = pds.lastUpdated.slide_decks[p.deckId];
    if (deckUpdate) {
      // Deck metadata changed - refetch slideIds
      serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId }).then((res) => {
        if (res.success) {
          setSlideIds(res.data.slideIds);
        }
      });
    }
  });

  // AI setup
  const sdkClient = createProjectSDKClient(projectId);

  // Create ID scope once per session - persists for conversation lifetime
  const aiIdScope = createAiIdScope(p.deckId);

  const tools = createMemo(() =>
    getToolsForSlides(
      projectId,
      p.deckId,
      aiIdScope,
      slideIds,
      optimisticSetLastUpdated
    )
  );

  const systemPrompt = createMemo(() => {
    return `You are helping create a slide deck presentation.

Current deck: "${p.reportLabel}"
Slide count: ${slideIds().length}

Use get_deck to see the current deck structure before making changes. Slides have short IDs like 's1', 's2', etc. Content blocks within slides have short IDs like 'b1', 'b2', etc. Use these IDs when referencing slides or blocks in tool calls.`;
  });

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools(),
        builtInTools: DEFAULT_BUILTIN_TOOLS,
        conversationId: `ai-slide-deck-${p.deckId}`,
        enableStreaming: true,
        system: systemPrompt,
      }}
    >
      <ProjectAiSlideDeckInner
        projectDetail={p.projectDetail}
        deckId={p.deckId}
        reportLabel={p.reportLabel}
        slideIds={slideIds()}
        isLoading={isLoading()}
        backToProject={p.backToProject}
      />
    </AIChatProvider>
  );
}

function ProjectAiSlideDeckInner(p: {
  projectDetail: ProjectDetail;
  deckId: string;
  reportLabel: string;
  slideIds: string[];
  isLoading: boolean;
  backToProject: (withUpdate: boolean) => Promise<void>;
}) {
  const { clearConversation, isLoading: aiLoading } = createAIChat();

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={p.reportLabel}
          french={false}
          leftChildren={
            <Button iconName="chevronLeft" onClick={() => p.backToProject(true)} />
          }
        >
          <div class="ui-gap-sm flex w-full items-center">
            <Button
              onClick={clearConversation}
              disabled={aiLoading()}
              outline
              iconName="trash"
              size="sm"
            >
              Clear chat
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="flex h-full">
        <div class="border-base-300 h-full w-[600px] border-r flex flex-col">
          <div class="flex items-center border-b border-base-300 ui-pad">
            <div class="flex-1 font-700">AI Chat</div>
          </div>
          <div class="w-full h-0 flex-1">
            <AIChat />
          </div>
        </div>
        <div class="h-full flex-1">
          <div class="flex items-center border-b border-base-300 ui-pad">
            <div class="flex-1 font-700">Slides</div>
          </div>
          <SlideList
            projectDetail={p.projectDetail}
            deckId={p.deckId}
            slideIds={p.slideIds}
            isLoading={p.isLoading}
          />
        </div>
      </div>
    </FrameTop>
  );
}
