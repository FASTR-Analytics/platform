import { AIChatProvider, type AIChatConfig } from "panther";
import { createMemo, type ParentProps } from "solid-js";
import type { InstanceDetail, ProjectDetail } from "lib";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";
import { AIProjectContextProvider, useAIProjectContext } from "./context";
import { ConsolidatedChatPane } from "./chat_pane";
import { buildToolsForContext } from "./build_tools";
import { buildSystemPromptForContext } from "./build_system_prompt";

type AIProjectWrapperProps = ParentProps<{
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
}>;

export function AIProjectWrapper(props: AIProjectWrapperProps) {
  return (
    <AIProjectContextProvider
      instanceDetail={props.instanceDetail}
      projectDetail={props.projectDetail}
    >
      <AIProjectWrapperInner
        instanceDetail={props.instanceDetail}
        projectDetail={props.projectDetail}
      >
        {props.children}
      </AIProjectWrapperInner>
    </AIProjectContextProvider>
  );
}

function AIProjectWrapperInner(props: AIProjectWrapperProps) {
  const { aiContext, setDraftContent } = useAIProjectContext();
  const projectId = props.projectDetail.id;

  const sdkClient = createProjectSDKClient(projectId);

  const conversationId = createMemo(() => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "deck":
        return `deck-${ctx.deckId}`;
      case "viz-editor":
        return `viz-${ctx.vizId}`;
      case "report":
        return `report-${ctx.reportId}`;
      default:
        return `project-${projectId}`;
    }
  });

  const tools = createMemo(() =>
    buildToolsForContext({
      projectId,
      modules: props.projectDetail.projectModules,
      metrics: props.projectDetail.metrics,
      aiContext: aiContext(),
      setDraftContent,
    })
  );

  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(
      aiContext(),
      props.instanceDetail,
      props.projectDetail
    )
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools() as AIChatConfig["tools"],
        conversationId: conversationId(),
        system: systemPrompt,
      }}
    >
      <div class="flex h-full w-full">
        <div class="flex-1 overflow-hidden">
          {props.children}
        </div>
        <ConsolidatedChatPane />
      </div>
    </AIChatProvider>
  );
}
