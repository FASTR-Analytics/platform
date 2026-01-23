import {
  DEFAULT_ANTHROPIC_MODEL,
  type ProjectDetail,
  type DeckSummary,
  type SlideWithMeta,
} from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  createSDKClient,
  FrameTop,
  HeadingBar,
} from "panther";
import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { getToolsForSlides } from "../ai_tools/ai_tool_definitions";
import { useProjectDirtyStates } from "../project_runner/mod";
import { SlideList } from "./slide_list";
import { createAiIdScope } from "./utils/ai_id_scope";

type Props = {
  projectDetail: ProjectDetail;
  deckId: string;
  reportLabel: string;
  backToProject: (withUpdate: boolean) => Promise<void>;
};

export function ProjectAiSlideDeck(p: Props) {
  const projectId = p.projectDetail.id;
  const pds = useProjectDirtyStates();

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

  // Deck summary for AI context - fetch from server
  const getDeckSummary = async (): Promise<DeckSummary> => {
    const res = await serverActions.getDeckSummary({ projectId, deck_id: p.deckId });
    if (!res.success) throw new Error(res.err);
    return res.data;
  };

  // Tool callbacks - update slideIds array
  const onSlideCreated = (newSlide: SlideWithMeta) => {
    setSlideIds((prev) => {
      const updated = [...prev];
      updated.splice(newSlide.index, 0, newSlide.id);
      return updated;
    });
  };

  const onSlideUpdated = (updatedSlide: SlideWithMeta) => {
    // No change to slideIds array, just cache updated
  };

  const onSlidesDeleted = (deletedIds: string[]) => {
    const idsSet = new Set(deletedIds);
    setSlideIds((prev) => prev.filter((id) => !idsSet.has(id)));
  };

  const onSlidesReordered = (reorderedSlides: SlideWithMeta[]) => {
    setSlideIds(reorderedSlides.map((s) => s.id));
  };

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
  const sdkClient = createSDKClient({
    baseURL: `${_SERVER_HOST}/ai`,
    defaultHeaders: { "Project-Id": projectId },
  });

  // Create ID scope once per session - persists for conversation lifetime
  const aiIdScope = createAiIdScope(p.deckId);

  const tools = createMemo(() =>
    getToolsForSlides(
      projectId,
      p.deckId,
      aiIdScope,
      getDeckSummary,
      onSlideCreated,
      onSlideUpdated,
      onSlidesDeleted,
      onSlidesReordered
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
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 4096,
        },
        tools: tools(),
        builtInTools: { webSearch: true },
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
