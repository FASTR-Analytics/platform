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
  openComponent,
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
import { DownloadSlideDeck } from "./download_slide_deck";
import { useAIDocuments, AIDocumentButton, AIDocumentList } from "../ai_documents";
import { EditLabelForm } from "../forms_editors/edit_label";
import { trackSlideChange, getPendingChangesMessage, clearPendingChanges } from "./pending_changes_store";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  deckId: string;
  reportLabel: string;
  isGlobalAdmin: boolean;
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

  const aiDocs = useAIDocuments({
    projectId,
    conversationId: `ai-slide-deck-${p.deckId}`
  });

  const [deckLabel, setDeckLabel] = createSignal(p.reportLabel);

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
      // Deck metadata changed - refetch deck details
      serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId }).then((res) => {
        if (res.success) {
          setSlideIds(res.data.slideIds);
          setDeckLabel(res.data.label);
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
        getDocumentRefs: aiDocs.getDocumentRefs,
      }}
    >
      <ProjectAiSlideDeckInner
        projectDetail={p.projectDetail}
        instanceDetail={p.instanceDetail}
        isGlobalAdmin={p.isGlobalAdmin}
        deckId={p.deckId}
        deckLabel={deckLabel()}
        optimisticSetLastUpdated={optimisticSetLastUpdated}
        slideIds={slideIds()}
        isLoading={isLoading()}
        setSelectedSlideIds={setSelectedSlideIds}
        backToProject={p.backToProject}
        aiDocs={aiDocs}
      />
    </AIChatProvider>
  );
}

function ProjectAiSlideDeckInner(p: {
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  deckId: string;
  deckLabel: string;
  optimisticSetLastUpdated: ReturnType<typeof useOptimisticSetLastUpdated>;
  slideIds: string[];
  isLoading: boolean;
  setSelectedSlideIds: (ids: string[]) => void;
  backToProject: (withUpdate: boolean) => Promise<void>;
  aiDocs: ReturnType<typeof useAIDocuments>;
}) {
  const { clearConversation, isLoading: aiLoading } = createAIChat();
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Consolidate pending changes into user message
  const handleBeforeSubmit = (userMessage: string): string => {
    const changesMessage = getPendingChangesMessage();
    if (changesMessage) {
      clearPendingChanges();
      return `${changesMessage}\n\n${userMessage}`;
    }
    return userMessage;
  };

  // Editor state
  const [editingSlideId, setEditingSlideId] = createSignal<string | undefined>();

  async function handleEditLabel() {
    await openComponent({
      element: EditLabelForm,
      props: {
        headerText: "Edit slide deck name",
        existingLabel: p.deckLabel,
        mutateFunc: async (newLabel) => {
          const res = await serverActions.updateSlideDeckLabel({
            projectId: p.projectDetail.id,
            deck_id: p.deckId,
            label: newLabel,
          });
          if (res.success) {
            p.optimisticSetLastUpdated("slide_decks", p.deckId, res.data.lastUpdated);
          }
          return res;
        },
      },
    });
  }

  async function download() {
    const _res = await openComponent({
      element: DownloadSlideDeck,
      props: {
        projectId: p.projectDetail.id,
        deckId: p.deckId,
      },
    });
  }

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
        instanceDetail: p.instanceDetail,
        projectDetail: p.projectDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });

    setEditingSlideId(undefined);

    if (saved) {
      p.optimisticSetLastUpdated("slides", slideId, Date.now().toString());
      trackSlideChange("edited", slideId);
    }
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={p.deckLabel}
            french={false}
            leftChildren={
              <Button iconName="chevronLeft" onClick={() => p.backToProject(true)} />
            }
          >
            <div class="flex items-center ui-gap-sm">

              <Button onClick={handleEditLabel} iconName="pencil" outline>
                Rename
              </Button>
              <Button onClick={download} iconName="download">
                Download
              </Button>
            </div>
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          minWidth={300}
          startingWidth={600}
          maxWidth={1200}
          panelChildren={<div class="border-base-300 h-full w-full border-r flex flex-col">
            <div class="flex items-center gap-2 border-b border-base-300 ui-pad">
              <div class="flex-1 font-700 text-lg">AI chat</div>

              <AIDocumentButton
                documents={p.aiDocs.documents()}
                onOpenSelector={p.aiDocs.openSelector}
                onRemoveDocument={p.aiDocs.removeDocument}
              />

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
            <AIDocumentList
              documents={p.aiDocs.documents()}
              onRemove={p.aiDocs.removeDocument}
            />
            <div class="w-full h-0 flex-1">
              <AIChat onBeforeSubmit={handleBeforeSubmit} />
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
