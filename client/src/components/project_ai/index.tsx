import {
  AIChatProvider,
  type AIChatConfig,
  FrameRightResizable,
  validateAIChatConfig,
} from "panther";
import { createMemo, onCleanup, onMount, type ParentProps } from "solid-js";
import {
  DEFAULT_BUILTIN_TOOLS,
  DEFAULT_MODEL_CONFIG,
  createProjectSDKClient,
} from "./ai_configs/defaults";
import { AIProjectContextProvider, useAIProjectContext } from "./context";
import { projectAIViewController } from "./ai_views";
import { instanceState } from "~/state/instance/t1_store";
import { ConsolidatedChatPane } from "./chat_pane";
import { buildToolsForContext } from "./build_tools";
import { buildSystemPromptForContext } from "./build_system_prompt";
import { projectState } from "~/state/project/t1_store";
import { addLastUpdatedListener } from "~/state/project/t1_sse";
import { showAi, setShowAi } from "~/state/t4_ui";
import { useAIDocuments } from "./ai_documents";

export { useAIProjectContext } from "./context";

export function AIProjectWrapper(props: ParentProps) {
  return (
    <AIProjectContextProvider>
      <AIProjectWrapperInner>{props.children}</AIProjectWrapperInner>
    </AIProjectContextProvider>
  );
}

function AIProjectWrapperInner(props: ParentProps) {
  const projectId = projectState.id;

  const sdkClient = createProjectSDKClient(projectId);

  const aiDocs = useAIDocuments({ projectId });

  // Tools are registered into panther's ToolRegistry ONCE at chat-pane mount;
  // this array is not re-read on change. Freshness is intentional aliasing:
  // every handler closes over the projectState store, which is updated in
  // place via reconcile, so handlers always read current data. (Anything a
  // handler needs at BUILD time — e.g. a completionMessage counting metrics —
  // is frozen at mount; keep such reads out of tool construction.) Build once.
  const tools = buildToolsForContext({
    projectId,
    modules: projectState.projectModules,
    metrics: projectState.metrics,
    icehIndicators: projectState.icehIndicators,
    hfaTaxonomy: projectState.hfaTaxonomy,
    visualizations: projectState.visualizations,
    slideDecks: projectState.slideDecks,
    reports: projectState.reports,
  });

  // Byte-stable across navigation (Rung 3): no longer takes a mode/view
  // argument — per-view instructions now ride each view's instructions
  // (ai_views.ts) as a per-turn ephemeral section instead of being baked into
  // this string.
  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(instanceState, projectState),
  );

  // Subscribe to SSE changes - notify on ALL changes; the interaction
  // registry (interactions.ts) filters per view at drain, and echo keys drop
  // the AI's own persisted writes (markAIEdit in the write tools).
  onMount(() => {
    const cleanup = addLastUpdatedListener((tableName, ids, timestamp) => {
      if (tableName === "slides") {
        ids.forEach((id) => {
          projectAIViewController.notify("edited_slide", { slideId: id });
        });
        return;
      }

      if (tableName === "presentation_objects") {
        ids.forEach((id) => {
          const viz = projectState.visualizations.find((v) => v.id === id);
          if (viz) {
            projectAIViewController.notify("visualization_updated", {
              vizId: id,
              label: viz.label,
            });
          }
        });
        return;
      }

      if (tableName === "slide_decks") {
        ids.forEach((id) => {
          projectAIViewController.notify("deck_structure_changed", {
            deckId: id,
          });
        });
        return;
      }
    });

    onCleanup(cleanup);
  });

  const config: AIChatConfig = {
    sdkClient,
    modelConfig: DEFAULT_MODEL_CONFIG,
    tools: tools as AIChatConfig["tools"],
    builtInTools: DEFAULT_BUILTIN_TOOLS,
    scope: projectId,
    system: systemPrompt,
    getDocumentRefs: aiDocs.getDocumentRefs,
    viewController: projectAIViewController,
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  return (
    <AIChatProvider config={config}>
      <FrameRightResizable
        minWidth={300}
        startingWidth={600}
        maxWidth={1200}
        hoverOffset="offset-for-border-1-on-right"
        isShown={showAi()}
        onToggleShow={() => setShowAi(false)}
        panelChildren={
          <ConsolidatedChatPane
            aiDocs={aiDocs}
            getSystemPrompt={systemPrompt}
          />
        }
      >
        {props.children}
      </FrameRightResizable>
    </AIChatProvider>
  );
}
