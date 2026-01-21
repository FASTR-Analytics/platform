import { DEFAULT_ANTHROPIC_MODEL, type InstanceDetail, PresentationObjectConfig, ProjectDetail, ResultsValue, t } from "lib";
import {
  AIChat,
  AIChatProvider,
  createSDKClient,
  FigureInputs,
  StateHolder,
} from "panther";
import { createMemo } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { _SERVER_HOST } from "~/server_actions/config";
import { getToolsForVizPane } from "../ai_tools/ai_tool_definitions";
import { getVizChatSystemPrompt } from "../ai_prompts/viz_chat";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  presentationObjectId: string;
  figureInputs: StateHolder<FigureInputs>;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  resultsValue: ResultsValue;
};

export function AiInterpretationPane(p: Props) {
  const sdkClient = createSDKClient({
    baseURL: `${_SERVER_HOST}/ai`, // Uses /ai/v1/messages endpoint
    defaultHeaders: { "Project-Id": p.projectDetail.id },
  });

  const tools = createMemo(() =>
    getToolsForVizPane(
      p.projectDetail.id,
      p.presentationObjectId,
      () => p.tempConfig,
      p.setTempConfig,
      () => p.resultsValue
    )
  );

  const systemPrompt = createMemo(() =>
    getVizChatSystemPrompt(p.instanceDetail, p.projectDetail, p.resultsValue)
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 2048,
        },
        tools: tools(),
        enableStreaming: true,
        conversationId: `viz-chat-${p.presentationObjectId}`,
        system: systemPrompt,
      }}
    >
      <div class="flex h-full flex-col">
        <div class="ui-pad border-b bg-base-200">
          <h3 class="text-lg font-700">{t("AI Assistant")}</h3>
        </div>
        <div class="flex-1 overflow-hidden">
          <AIChat placeholder={t("Ask about this visualization...")} />
        </div>
      </div>
    </AIChatProvider>
  );
}
