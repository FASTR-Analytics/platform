/**
 * SKETCH: Consolidated AI Architecture
 *
 * Key changes from index.tsx:
 * 1. AIProjectWrapper provides context + AIChatProvider (no layout)
 * 2. FrameTop (nav) elevated above ProjectEditorWrapper - always visible
 * 3. ConsolidatedChatPane always on right
 * 4. Report and SlideDeck opened via openProjectEditor() instead of URL params
 * 5. Whiteboard tab removed - replaced by draft tools in default mode
 */

import { useNavigate } from "@solidjs/router";
import { InstanceDetail, ProjectDetail, t } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
  timQuery,
} from "panther";
import { Match, Switch, createSignal } from "solid-js";
import { ProjectRunnerProvider } from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";

// New consolidated AI imports
import { AIProjectWrapper, ConsolidatedChatPane, useAIProjectContext } from "../project_ai";

// Tab components (existing)
import { ProjectDecks } from "./project_decks";
import { ProjectVisualizations } from "./project_visualizations";
import { ProjectMetrics } from "./project_metrics";
// ... other tabs

// Editor components (would need refactoring to use context)
// import { SlideDeckEditor } from "../project_ai_slide_deck/editor";
// import { ReportViewer } from "../report/viewer";
// import { VisualizationEditor } from "../visualization";

type TabOption = "decks" | "visualizations" | "metrics" | "modules" | "data" | "settings";

type Props = {
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
  projectId: string;
};

export default function ProjectV2(p: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<TabOption>("decks");

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  const projectDetail = timQuery(
    () => serverActions.getProjectDetail({ projectId: p.projectId }),
    "Loading...",
  );

  return (
    <ProjectRunnerProvider projectId={p.projectId}>
      <StateHolderWrapper state={p.instanceDetail.state()}>
        {(instanceDetail) => (
          <StateHolderWrapper state={projectDetail.state()}>
            {(projectDetail) => (
              // AIProjectWrapper: provides context + AIChatProvider
              // NO layout here - just providers
              <AIProjectWrapper
                instanceDetail={instanceDetail}
                projectDetail={projectDetail}
              >
                {/* Layout: flex container with main content + chat pane */}
                <div class="flex h-full w-full">
                  {/* Main content area */}
                  <div class="flex-1 overflow-hidden">
                    {/* FrameTop OUTSIDE ProjectEditorWrapper = always visible */}
                    <FrameTop
                      panelChildren={
                        <NavBar
                          projectLabel={projectDetail.label}
                          onBack={() => navigate("/")}
                        />
                      }
                    >
                      {/* ProjectEditorWrapper inside FrameTop */}
                      {/* Modals overlay FrameLeft but not nav bar */}
                      <ProjectEditorWrapper>
                        <FrameLeft
                          panelChildren={
                            <Sidebar
                              tab={tab()}
                              setTab={setTab}
                              isGlobalAdmin={p.isGlobalAdmin}
                            />
                          }
                        >
                          <TabContent
                            tab={tab()}
                            projectDetail={projectDetail}
                            instanceDetail={instanceDetail}
                            isGlobalAdmin={p.isGlobalAdmin}
                            openProjectEditor={openProjectEditor}
                          />
                        </FrameLeft>
                      </ProjectEditorWrapper>
                    </FrameTop>
                  </div>

                  {/* Chat pane: always on right */}
                  <ConsolidatedChatPane />
                </div>
              </AIProjectWrapper>
            )}
          </StateHolderWrapper>
        )}
      </StateHolderWrapper>
    </ProjectRunnerProvider>
  );
}

// --- Sub-components (sketches) ---

function NavBar(p: { projectLabel: string; onBack: () => void }) {
  return (
    <div class="ui-gap ui-pad bg-base-content text-base-100 flex h-full w-full items-center">
      <Button iconName="chevronLeft" onClick={p.onBack} />
      <div class="font-400 flex-1 truncate text-xl">{p.projectLabel}</div>
      {/* ProjectRunStatus would go here */}
    </div>
  );
}

function Sidebar(p: { tab: TabOption; setTab: (t: TabOption) => void; isGlobalAdmin: boolean }) {
  const { notifyAI } = useAIProjectContext();

  const changeTab = (newTab: TabOption) => {
    p.setTab(newTab);
    notifyAI({ type: "navigated_to_tab", tabName: newTab });
  };

  return (
    <div class="font-700 h-full border-r text-sm">
      {/* Whiteboard tab REMOVED - replaced by draft tools */}
      <SidebarItem label="Slide decks" selected={p.tab === "decks"} onClick={() => changeTab("decks")} />
      <SidebarItem label="Visualizations" selected={p.tab === "visualizations"} onClick={() => changeTab("visualizations")} />
      <SidebarItem label="Metrics" selected={p.tab === "metrics"} onClick={() => changeTab("metrics")} />
      {/* ... other tabs */}
    </div>
  );
}

function SidebarItem(p: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent"
      onClick={p.onClick}
      data-selected={p.selected}
    >
      {p.label}
    </div>
  );
}

function TabContent(p: {
  tab: TabOption;
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: any; // simplified
}) {
  return (
    <Switch>
      <Match when={p.tab === "decks"}>
        <ProjectDecksWithAI
          projectDetail={p.projectDetail}
          openProjectEditor={p.openProjectEditor}
        />
      </Match>
      <Match when={p.tab === "visualizations"}>
        {/* Similar pattern for visualizations */}
        <div>Visualizations tab</div>
      </Match>
      {/* ... other tabs */}
    </Switch>
  );
}

/**
 * Example: ProjectDecks with AI integration
 *
 * When user clicks a deck, we:
 * 1. Open SlideDeckEditor via openProjectEditor()
 * 2. SlideDeckEditor calls setAIContext({ mode: "deck", ... }) on mount
 * 3. Chat pane automatically shows deck tools
 * 4. On close, setAIContext({ mode: "default" })
 */
function ProjectDecksWithAI(p: {
  projectDetail: ProjectDetail;
  openProjectEditor: any;
}) {
  const { setAIContext, notifyAI } = useAIProjectContext();

  async function openDeck(deckId: string, deckLabel: string) {
    // Open the editor modal
    const result = await p.openProjectEditor({
      element: SlideDeckEditorSketch,
      props: {
        projectId: p.projectDetail.id,
        deckId,
        deckLabel,
        // Pass context setters so editor can register/unregister
        setAIContext,
        notifyAI,
      },
    });

    // After modal closes, context is reset by the editor's onCleanup
    // Handle any result (saved, deleted, etc.)
  }

  return (
    <div>
      {/* Deck list UI */}
      {p.projectDetail.slideDecks.map((deck) => (
        <div onClick={() => openDeck(deck.id, deck.label)}>
          {deck.label}
        </div>
      ))}
    </div>
  );
}

/**
 * Sketch: SlideDeckEditor as modal component
 *
 * Key difference from current ProjectAiSlideDeck:
 * - No own AIChatProvider (uses parent's via context)
 * - Registers context on mount, unregisters on cleanup
 * - No chat UI (uses ConsolidatedChatPane)
 */
function SlideDeckEditorSketch(p: {
  projectId: string;
  deckId: string;
  deckLabel: string;
  setAIContext: any;
  notifyAI: any;
  // ... other props for editing
}) {
  // State for slide editing
  const [slideIds, setSlideIds] = createSignal<string[]>([]);
  const [selectedSlideIds, setSelectedSlideIds] = createSignal<string[]>([]);

  // Register AI context on mount
  // onMount(() => {
  //   p.setAIContext({
  //     mode: "deck",
  //     deckId: p.deckId,
  //     deckLabel: p.deckLabel,
  //     getSlideIds: slideIds,
  //     getSelectedSlideIds: selectedSlideIds,
  //     optimisticSetLastUpdated: ...,
  //   });
  //   p.notifyAI({ type: "switched_to_deck", deckId: p.deckId, deckLabel: p.deckLabel });
  // });

  // Unregister on cleanup
  // onCleanup(() => {
  //   p.setAIContext({ mode: "default" });
  //   p.notifyAI({ type: "switched_to_default" });
  // });

  return (
    <div class="h-full w-full bg-base-100">
      {/* Slide deck editor UI */}
      {/* NO chat UI here - uses ConsolidatedChatPane on the right */}
      <div class="p-4">
        <h2>{p.deckLabel}</h2>
        {/* Slide list, slide editor, etc. */}
      </div>
    </div>
  );
}
