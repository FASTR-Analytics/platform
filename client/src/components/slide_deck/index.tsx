import { type InstanceDetail, type ProjectDetail, type Slide } from "lib";
import {
  createAIChat,
  EditorComponentProps,
  getEditorWrapper,
  openComponent
} from "panther";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { useOptimisticSetLastUpdated, useProjectDirtyStates } from "../project_runner/mod";
import { DownloadSlideDeck } from "./download_slide_deck";
import { SlideEditor } from "./slide_editor";
import { SlideList } from "./slide_list";
import { EditLabelForm } from "../forms_editors/edit_label";
import { useAIProjectContext } from "../project_ai/context";
import type { AIContext } from "../project_ai/types";

type SlideDeckModalReturn = undefined;

type Props = EditorComponentProps<
  {
    instanceDetail: InstanceDetail;
    projectDetail: ProjectDetail;
    deckId: string;
    reportLabel: string;
    isGlobalAdmin: boolean;
    returnToContext?: AIContext;
  },
  SlideDeckModalReturn
>;

export function ProjectAiSlideDeck(p: Props) {
  const projectId = p.projectDetail.id;
  const pds = useProjectDirtyStates();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const { setAIContext } = useAIProjectContext();

  async function handleClose() {
    p.close(undefined);
  }

  // State - just track slide IDs, not full slide data
  const [slideIds, setSlideIds] = createSignal<string[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedSlideIds, setSelectedSlideIds] = createSignal<string[]>([]);

  // const aiDocs = useAIDocuments({
  //   projectId,
  //   conversationId: `ai-slide-deck-${p.deckId}`
  // });

  const [deckLabel, setDeckLabel] = createSignal(p.reportLabel);

  // Load deck metadata and set AI context on mount
  onMount(async () => {
    const deckRes = await serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId });

    if (deckRes.success) {
      setSlideIds(deckRes.data.slideIds);
      setDeckLabel(deckRes.data.label);
    }
    setIsLoading(false);

    // Set AI context now that deck data is loaded
    setAIContext({
      mode: "editing_slide_deck",
      deckId: p.deckId,
      deckLabel: deckLabel(),
      getSlideIds: () => slideIds(),
      getSelectedSlideIds: () => selectedSlideIds(),
      optimisticSetLastUpdated,
    });
  });

  onCleanup(() => {
    setAIContext(p.returnToContext ?? { mode: "viewing_slide_decks" });
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

  return (
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
      handleClose={handleClose}
    />
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
  handleClose: () => Promise<void>;
  // aiDocs: ReturnType<typeof useAIDocuments>;
}) {
  const { openEditor, EditorWrapper } = getEditorWrapper();


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
    }
  }

  return (
    <EditorWrapper>
      <SlideList
        projectDetail={p.projectDetail}
        deckId={p.deckId}
        slideIds={p.slideIds}
        isLoading={p.isLoading}
        setSelectedSlideIds={p.setSelectedSlideIds}
        onEditSlide={handleEditSlide}
        deckLabel={p.deckLabel}
        handleClose={p.handleClose}
        handleEditLabel={handleEditLabel}
        download={download}
      />
    </EditorWrapper >
  );
}
