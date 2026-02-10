import { AIChatProvider, type AIChatConfig, FrameRightResizable, useConversations } from "panther";
import { createMemo, onCleanup, onMount, type ParentProps } from "solid-js";
import type { InstanceDetail } from "lib";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "./ai_configs/defaults";
import { AIProjectContextProvider, useAIProjectContext } from "./context";
import { ConsolidatedChatPane } from "./chat_pane";
import { buildToolsForContext } from "./build_tools";
import { buildSystemPromptForContext } from "./build_system_prompt";
import { useProjectDetail, useLastUpdatedListener } from "~/components/project_runner/mod";
import { showAi, setShowAi } from "~/state/ui";
import { useAIDocuments } from "./ai_documents";

export { useAIProjectContext } from "./context";

type AIProjectWrapperProps = ParentProps<{
  instanceDetail: InstanceDetail;
}>;

export function AIProjectWrapper(props: AIProjectWrapperProps) {
  return (
    <AIProjectContextProvider instanceDetail={props.instanceDetail}>
      <AIProjectWrapperInner instanceDetail={props.instanceDetail}>
        {props.children}
      </AIProjectWrapperInner>
    </AIProjectContextProvider>
  );
}

function AIProjectWrapperInner(props: AIProjectWrapperProps) {
  const { aiContext, notifyAI } = useAIProjectContext();
  const projectDetail = useProjectDetail();
  const addListener = useLastUpdatedListener();
  const projectId = projectDetail.id;

  const sdkClient = createProjectSDKClient(projectId);

  const aiDocs = useAIDocuments({ projectId });

  const tools = createMemo(() => {
    // console.log("[WRAPPER] tools memo recomputing, aiContext mode:", aiContext().mode);
    // Touch all properties used by tools (bespoke reader pattern)
    projectDetail.projectModules.forEach(m => {
      const _v = m.id + m.label + m.configType + m.dateInstalled + m.lastRun + m.dirty;
    });
    projectDetail.metrics.forEach(m => {
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
      m.disaggregationOptions.forEach(d => { const _d = d.value + d.label + d.isRequired; });
      m.periodOptions.forEach(p => { const _po = p; });
    });

    // Visualizations
    projectDetail.visualizations.forEach(v => {
      const _v = v.id + v.label;
    });

    // Slide decks
    projectDetail.slideDecks.forEach(d => {
      const _v = d.id + d.label;
    });

    // Reports
    projectDetail.reports.forEach(r => {
      const _v = r.id + r.label;
    });

    return buildToolsForContext({
      projectId,
      modules: projectDetail.projectModules,
      metrics: projectDetail.metrics,
      visualizations: projectDetail.visualizations,
      slideDecks: projectDetail.slideDecks,
      aiContext: aiContext,
    });
  });

  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(
      aiContext(),
      props.instanceDetail,
      projectDetail
    )
  );

  // Subscribe to SSE changes - track ALL changes, filter later in reducer
  onMount(() => {
    const cleanup = addListener((tableName, ids, timestamp) => {
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
          const viz = projectDetail.visualizations.find(v => v.id === id);
          if (viz) {
            notifyAI({
              type: "custom",
              message: `Visualization "${viz.label}" updated`
            });
          }
        });
        return;
      }

      // Slide decks - always notify
      if (tableName === "slide_decks") {
        ids.forEach(id => {
          const deck = projectDetail.slideDecks.find(d => d.id === id);
          if (deck) {
            notifyAI({
              type: "custom",
              message: `Slide deck "${deck.label}" updated`
            });
          }
        });
        return;
      }

      // Reports - always notify
      if (tableName === "reports") {
        ids.forEach(id => {
          const report = projectDetail.reports.find(r => r.id === id);
          if (report) {
            notifyAI({
              type: "custom",
              message: `Report "${report.label}" updated`
            });
          }
        });
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
      }}
    >
      <FrameRightResizable
        minWidth={300}
        startingWidth={600}
        maxWidth={1200}
        isShown={showAi()}
        onToggleShow={() => setShowAi(false)}
        panelChildren={<ConsolidatedChatPane aiDocs={aiDocs} getSystemPrompt={systemPrompt} />}>
        {props.children}
      </FrameRightResizable>
    </AIChatProvider>
  );
}
