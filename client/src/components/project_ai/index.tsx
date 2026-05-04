import { AIChatProvider, type AIChatConfig, FrameRightResizable, useConversations } from "panther";
import { createMemo, onCleanup, onMount, type ParentProps } from "solid-js";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "./ai_configs/defaults";
import { AIProjectContextProvider, useAIProjectContext } from "./context";
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
      <AIProjectWrapperInner>
        {props.children}
      </AIProjectWrapperInner>
    </AIProjectContextProvider>
  );
}

function AIProjectWrapperInner(props: ParentProps) {
  const { aiContext, notifyAI, getPendingInteractionsMessage, clearPendingInteractions } = useAIProjectContext();
  const projectId = projectState.id;

  const sdkClient = createProjectSDKClient(projectId);

  const aiDocs = useAIDocuments({ projectId });

  const tools = createMemo(() => {
    // console.log("[WRAPPER] tools memo recomputing, aiContext mode:", aiContext().mode);
    // Touch all properties used by tools (bespoke reader pattern)
    projectState.projectModules.forEach(m => {
      const _v = m.id + m.label + m.hasParameters + m.presentationDefUpdatedAt + m.lastRunAt + m.dirty;
    });
    projectState.metrics.forEach(m => {
      const _v = m.status + m.moduleId + m.label + m.variantLabel + m.id + m.formatAs;
      m.valueProps.forEach(p => { const _vp = p; });
      if (m.valueLabelReplacements) {
        for (const k in m.valueLabelReplacements) {
          const _vlr = m.valueLabelReplacements[k];
        }
      }
      if (m.aiDescription) {
        const _aids = m.aiDescription.summary;
        const _aidm = m.aiDescription.methodology;
        const _aidi = m.aiDescription.interpretation;
        const _aidt = m.aiDescription.typicalRange;
        const _aidc = m.aiDescription.caveats;
        const _aiddg = m.aiDescription.disaggregationGuidance;
      }
      m.disaggregationOptions.forEach(d => { const _d = d.value + d.isRequired; });
      const _po = m.mostGranularTimePeriodColumnInResultsFile;
    });

    // Visualizations
    projectState.visualizations.forEach(v => {
      const _v = v.id + v.label;
    });

    // Slide decks
    projectState.slideDecks.forEach(d => {
      const _v = d.id + d.label;
    });

    return buildToolsForContext({
      projectId,
      modules: projectState.projectModules,
      metrics: projectState.metrics,
      visualizations: projectState.visualizations,
      slideDecks: projectState.slideDecks,
      aiContext: aiContext,
    });
  });

  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(
      aiContext(),
      instanceState,
      projectState
    )
  );

  // Subscribe to SSE changes - track ALL changes, filter later in reducer
  onMount(() => {
    const cleanup = addLastUpdatedListener((tableName, ids, timestamp) => {
      // Slides - always notify (reducer filters by deck)
      if (tableName === "slides") {
        ids.forEach(id => {
          notifyAI({ type: "edited_slide", slideId: id });
        });
        return;
      }

      // Presentation objects (visualizations) - always notify
      if (tableName === "presentation_objects") {
        ids.forEach(id => {
          const viz = projectState.visualizations.find(v => v.id === id);
          if (viz) {
            notifyAI({
              type: "custom",
              message: `Visualization "${viz.label}" updated`
            });
          }
        });
        return;
      }

      if (tableName === "slide_decks") {
        notifyAI({ type: "deck_structure_changed" });
        return;
      }
    });

    onCleanup(cleanup);
  });

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools() as AIChatConfig["tools"],
        scope: projectId,
        system: systemPrompt,
        getDocumentRefs: aiDocs.getDocumentRefs,
        getEphemeralContext: () => {
          const ctx = aiContext();
          let modeStr = `[Current mode: ${ctx.mode}`;
          if (ctx.mode === "editing_visualization") {
            modeStr += ` | vizId: ${ctx.vizId ?? "unsaved"}`;
          } else if (ctx.mode === "editing_slide_deck") {
            modeStr += ` | deckId: ${ctx.deckId}`;
            const selected = ctx.getSelectedSlideIds();
            if (selected.length > 0) {
              modeStr += ` | selectedSlideIds: ${selected.join(", ")}`;
            }
          } else if (ctx.mode === "editing_slide") {
            modeStr += ` | slideId: ${ctx.slideId} | deckId: ${ctx.deckId}`;
          }
          modeStr += "]";
          const parts: string[] = [modeStr];
          const msg = getPendingInteractionsMessage();
          if (msg) {
            clearPendingInteractions();
            parts.push(msg);
          }
          return parts.join("\n\n");
        },
      }}
    >
      <FrameRightResizable
        minWidth={300}
        startingWidth={600}
        maxWidth={1200}
        hoverOffset="offset-for-border-1-on-right"
        isShown={showAi()}
        onToggleShow={() => setShowAi(false)}
        panelChildren={<ConsolidatedChatPane aiDocs={aiDocs} getSystemPrompt={systemPrompt} />}>
        {props.children}
      </FrameRightResizable>
    </AIChatProvider>
  );
}
