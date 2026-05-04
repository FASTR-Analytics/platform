import { type ProjectState, type Slide, type SlideDeckConfig, getStartingConfigForSlideDeck, t3 } from "lib";
import { instanceState } from "~/state/instance/t1_store";
import {
  createAIChat,
  EditorComponentProps,
  getEditorWrapper,
  openComponent
} from "panther";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/project/t2_slides";
import { projectState } from "~/state/project/t1_store";
import { DownloadSlideDeck } from "./download_slide_deck";
import { ShareSlideDeck } from "./share_slide_deck";
import { SlideEditor } from "./slide_editor";
import { SlideList } from "./slide_list";
import { SlideDeckSettings, type SlideDeckSettingsProps } from "./slide_deck_settings";
import { useAIProjectContext } from "../project_ai/context";
import type { AIContext } from "../project_ai/types";
import { snapshotForSlideEditor } from "~/components/_editor_snapshot";

type SlideDeckModalReturn = undefined;

type Props = EditorComponentProps<
  {
    projectState: ProjectState;
    deckId: string;
    reportLabel: string;
    isGlobalAdmin: boolean;
    returnToContext?: AIContext;
  },
  SlideDeckModalReturn
>;

export function ProjectAiSlideDeck(p: Props) {
  const projectId = p.projectState.id;
  const { aiContext, setAIContext } = useAIProjectContext();

  async function handleClose() {
    p.close(undefined);
  }

  // State - just track slide IDs, not full slide data
  const [slideIds, setSlideIds] = createSignal<string[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedSlideIds, setSelectedSlideIds] = createSignal<string[]>([]);
  const [deckLabel, setDeckLabel] = createSignal(p.reportLabel);
  const [deckConfig, setDeckConfig] = createSignal<SlideDeckConfig>(getStartingConfigForSlideDeck(p.reportLabel));

  // Load deck metadata and set AI context on mount
  onMount(async () => {
    const deckRes = await serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId });

    if (deckRes.success) {
      setSlideIds(deckRes.data.slideIds);
      setDeckLabel(deckRes.data.label);
      setDeckConfig(deckRes.data.config);
    }
    setIsLoading(false);

    // Set AI context now that deck data is loaded
    setAIContext({
      mode: "editing_slide_deck",
      deckId: p.deckId,
      deckLabel: deckLabel(),
      getDeckConfig: () => deckConfig(),
      getSlideIds: () => slideIds(),
      getSelectedSlideIds: () => selectedSlideIds(),
    });
  });

  onCleanup(() => {
    setAIContext(p.returnToContext ?? { mode: "viewing_slide_decks" });
  });

  // SSE handling - watch for deck updates
  createEffect(() => {
    const deckUpdate = projectState.lastUpdated.slide_decks[p.deckId];
    if (deckUpdate) {
      // Deck metadata changed - refetch deck details
      serverActions.getSlideDeckDetail({ projectId, deck_id: p.deckId }).then((res) => {
        if (res.success) {
          setSlideIds(res.data.slideIds);
          setDeckLabel(res.data.label);
          setDeckConfig(res.data.config);
        }
      });
    }
  });

  return (
    <ProjectAiSlideDeckInner
      projectState={p.projectState}
      isGlobalAdmin={p.isGlobalAdmin}
      deckId={p.deckId}
      deckLabel={deckLabel()}
      deckConfig={deckConfig()}
      slideIds={slideIds()}
      isLoading={isLoading()}
      setSelectedSlideIds={setSelectedSlideIds}
      handleClose={handleClose}
    />
  );
}

function ProjectAiSlideDeckInner(p: {
  projectState: ProjectState;
  isGlobalAdmin: boolean;
  deckId: string;
  deckLabel: string;
  deckConfig: SlideDeckConfig;
  slideIds: string[];
  isLoading: boolean;
  setSelectedSlideIds: (ids: string[]) => void;
  handleClose: () => Promise<void>;
}) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const { openEditor: openSettingsEditor, EditorWrapper: SettingsEditorWrapper } = getEditorWrapper();
  const { aiContext } = useAIProjectContext();

  // Editor state
  const [editingSlideId, setEditingSlideId] = createSignal<string | undefined>();

  async function handleOpenSettings() {
    await openSettingsEditor<SlideDeckSettingsProps, "AFTER_DELETE">({
      element: SlideDeckSettings,
      props: {
        projectId: p.projectState.id,
        config: p.deckConfig,
        heading: t3({ en: "Slide deck settings", fr: "Paramètres de la présentation" }),
        nameLabel: t3({ en: "Slide deck name", fr: "Nom de la présentation" }),
        showPageNumbersSuffix: t3({ en: "(except on cover and section slides)", fr: "(sauf sur les diapositives de couverture et de section)" }),
        saveConfig: (config) =>
          serverActions.updateSlideDeckConfig({
            projectId: p.projectState.id,
            deck_id: p.deckId,
            config,
          }),
        onSaved: async () => {},
      },
    });
  }

  async function download() {
    const _res = await openComponent({
      element: DownloadSlideDeck,
      props: {
        projectId: p.projectState.id,
        deckId: p.deckId,
      },
    });
  }

  async function share() {
    await openComponent({
      element: ShareSlideDeck,
      props: {
        projectId: p.projectState.id,
        deckId: p.deckId,
        deckLabel: p.deckLabel,
        userEmails: instanceState.users.map((u) => u.email),
      },
    });
  }

  async function handleEditSlide(slideId: string) {
    const cached = await _SLIDE_CACHE.get({ projectId: p.projectState.id, slideId });
    let slide: Slide;
    let lastUpdated: string;

    if (!cached.data) {
      const res = await serverActions.getSlide({ projectId: p.projectState.id, slide_id: slideId });
      if (!res.success) return;
      slide = res.data.slide;
      lastUpdated = res.data.lastUpdated;
    } else {
      slide = cached.data.slide;
      lastUpdated = cached.data.lastUpdated;
    }

    setEditingSlideId(slideId);

    await openEditor({
      element: SlideEditor,
      props: {
        projectId: p.projectState.id,
        deckId: p.deckId,
        deckLabel: p.deckLabel,
        slideId: slideId,
        lastUpdated: lastUpdated,
        isGlobalAdmin: p.isGlobalAdmin,
        slide,
        returnToContext: aiContext(),
        ...snapshotForSlideEditor({
          projectState: p.projectState,
          deckConfig: p.deckConfig,
        }),
      },
    });

    setEditingSlideId(undefined);
  }

  return (
    <SettingsEditorWrapper>
      <EditorWrapper>
        <SlideList
          projectState={p.projectState}
          deckId={p.deckId}
          slideIds={p.slideIds}
          isLoading={p.isLoading}
          setSelectedSlideIds={p.setSelectedSlideIds}
          onEditSlide={handleEditSlide}
          deckLabel={p.deckLabel}
          handleClose={p.handleClose}
          handleOpenSettings={handleOpenSettings}
          download={download}
          share={share}
          deckConfig={p.deckConfig}
        />
      </EditorWrapper>
    </SettingsEditorWrapper>
  );
}
