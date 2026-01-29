import { type InstanceDetail, PresentationObjectConfig, ProjectDetail, ResultsValue, t } from "lib";
import {
  AIChat,
  AIChatProvider,
  Button,
  createAIChat,
  FigureInputs,
  StateHolder,
} from "panther";
import { createMemo } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { getToolsForVizPane } from "../ai_tools/ai_tool_definitions";
import { getVizChatSystemPrompt } from "../ai_prompts/viz_chat";
import { VIZ_CHAT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  presentationObjectId: string;
  conversationId: string;
  figureInputs: StateHolder<FigureInputs>;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  resultsValue: ResultsValue;
};

export function AiInterpretationPane(p: Props) {
  const sdkClient = createProjectSDKClient(p.projectDetail.id);

  const tools = createMemo(() => {
    return getToolsForVizPane(
      p.projectDetail.id,
      () => p.presentationObjectId,
      () => p.tempConfig,
      p.setTempConfig,
      () => p.resultsValue
    )
  });

  const systemPrompt = createMemo(() =>
    getVizChatSystemPrompt(p.instanceDetail, p.projectDetail, p.resultsValue)
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: VIZ_CHAT_MODEL_CONFIG,
        tools: tools(),
        conversationId: p.conversationId,
        system: systemPrompt,
      }}
    >
      <AiInterpretationPaneInner />
    </AIChatProvider>
  );
}

function AiInterpretationPaneInner() {
  const { clearConversation, isLoading } = createAIChat();

  return (
    <div class="flex h-full flex-col">
      <div class="ui-pad border-b bg-base-200 flex items-center justify-between">
        <h3 class="text-lg font-700">{t("AI Assistant")}</h3>
        <Button
          onClick={clearConversation}
          disabled={isLoading()}
          outline
          iconName="trash"
          size="sm"
        >
          {t("Clear chat")}
        </Button>
      </div>
      <div class="flex-1 overflow-hidden">
        <AIChat placeholder={t("Ask about this visualization...")} />
      </div>
    </div>
  );
}
