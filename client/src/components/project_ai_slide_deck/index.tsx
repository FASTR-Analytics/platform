import { type InstanceDetail, type ProjectDetail, type Slide } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  getEditorWrapper,
} from "panther";
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getToolsForSlides } from "../ai_tools/ai_tool_definitions";
import { useProjectDirtyStates, useOptimisticSetLastUpdated } from "../project_runner/mod";
import { SlideList } from "./slide_list";
import { DEFAULT_MODEL_CONFIG, DEFAULT_BUILTIN_TOOLS, createProjectSDKClient } from "~/components/ai_configs/defaults";
import { getSlideDeckSystemPrompt } from "~/components/ai_prompts/slide_deck";
import { SlideEditor } from "./slide_editor";
import { _SLIDE_CACHE } from "~/state/caches/slides";

type Props = {
  instanceDetail: InstanceDetail;
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
  const [selectedSlideIds, setSelectedSlideIds] = createSignal<string[]>([]);

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

  const tools = createMemo(() =>
    getToolsForSlides(
      projectId,
      p.deckId,
      slideIds,
      optimisticSetLastUpdated,
      p.projectDetail.projectModules,
      p.projectDetail.metrics
    )
  );

  const systemPrompt = createMemo(() =>
    getSlideDeckSystemPrompt(
      p.instanceDetail,
      p.projectDetail,
      slideIds().length,
      selectedSlideIds()
    )
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools(),
        builtInTools: DEFAULT_BUILTIN_TOOLS,
        conversationId: `ai-slide-deck-${p.deckId}`,
        system: systemPrompt,
      }}
    >
      <ProjectAiSlideDeckInner
        projectDetail={p.projectDetail}
        deckId={p.deckId}
        reportLabel={p.reportLabel}
        slideIds={slideIds()}
        isLoading={isLoading()}
        setSelectedSlideIds={setSelectedSlideIds}
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
  setSelectedSlideIds: (ids: string[]) => void;
  backToProject: (withUpdate: boolean) => Promise<void>;
}) {
  const { clearConversation, isLoading: aiLoading } = createAIChat();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Editor state
  const [editingSlideId, setEditingSlideId] = createSignal<string | undefined>();

  async function handleEditSlide(slideId: string) {
    const cached = await _SLIDE_CACHE.get({ projectId: p.projectDetail.id, slideId });
    let slide: Slide;
    let lastUpdated: string;

    if (!cached.data) {
      const res = await serverActions.getSlide({ projectId: p.projectDetail.id, slide_id: slideId });
      if (!res.success) return;
      slide = res.data.slide;
      lastUpdated = res.data.lastUpdated;
    } else {
      slide = cached.data.slide;
      lastUpdated = cached.data.lastUpdated;
    }

    setEditingSlideId(slideId);

    const saved = await openEditor({
      element: SlideEditor,
      props: {
        projectId: p.projectDetail.id,
        deckId: p.deckId,
        slideId: slideId,
        slide: slide,
        lastUpdated: lastUpdated,
      },
    });

    setEditingSlideId(undefined);

    if (saved) {
      optimisticSetLastUpdated("slides", slideId, Date.now().toString());
    }
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={p.reportLabel}
            french={false}
            leftChildren={
              <Button iconName="chevronLeft" onClick={() => p.backToProject(true)} />
            }
          >
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          minWidth={300}
          startingWidth={600}
          maxWidth={1200}
          panelChildren={<div class="border-base-300 h-full w-full border-r flex flex-col">
            <div class="flex items-center border-b border-base-300 ui-pad">
              <div class="flex-1 font-700 text-lg">AI chat</div>
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
            <div class="w-full h-0 flex-1">
              <AIChat />
            </div>
          </div>

          }>
          <SlideList
            projectDetail={p.projectDetail}
            deckId={p.deckId}
            slideIds={p.slideIds}
            isLoading={p.isLoading}
            setSelectedSlideIds={p.setSelectedSlideIds}
            onEditSlide={handleEditSlide}
          />
        </FrameLeftResizable>
      </FrameTop>
    </EditorWrapper>
  );
}
