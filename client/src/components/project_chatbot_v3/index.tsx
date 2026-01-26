import {
  Button,
  FrameTop,
  HeadingBar,
  AIChatProvider,
  AIChat,
  createAIChat,
  type OpenEditorProps,
  type AIChatConfig,
} from "panther";
import { isFrench, type ProjectDetail, type InstanceDetail } from "lib";
import { createMemo, createSignal, Show } from "solid-js";
import { WelcomeMessage } from "./WelcomeMessage";
import { getToolsForChatbot } from "../ai_tools/ai_tool_definitions";
import { AIToolsDebug } from "../ai_tools/AIDebugComponent";
import { getChatbotSystemPrompt } from "../ai_prompts/chatbot";
import { DEFAULT_MODEL_CONFIG, createProjectSDKClient } from "~/components/ai_configs/defaults";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectChatbotV3(p: Props) {
  const projectId = p.projectDetail.id;
  const [showDebug, setShowDebug] = createSignal(false);

  const tools = createMemo(() => getToolsForChatbot(projectId));
  const systemPrompt = createMemo(() => getChatbotSystemPrompt(p.instanceDetail, p.projectDetail));
  const sdkClient = createProjectSDKClient(projectId);

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: DEFAULT_MODEL_CONFIG,
        tools: tools() as AIChatConfig["tools"],
        conversationId: projectId,
        system: systemPrompt,
      }}
    >
      <div class="flex h-full">
        <div class={showDebug() ? "w-1/2 border-r" : "w-full"}>
          <FrameTop
            panelChildren={
              <HeadingBar heading="AI Assistant" french={isFrench()}>
                <ProjectChatbotActions
                  showDebug={showDebug()}
                  onToggleDebug={() => setShowDebug(!showDebug())}
                />
              </HeadingBar>
            }
          >
            <AIChat fallbackContent={WelcomeMessage} />
          </FrameTop>
        </div>
        <Show when={showDebug()}>
          <div class="w-1/2 overflow-auto">
            <AIToolsDebug projectId={projectId} />
          </div>
        </Show>
      </div>
    </AIChatProvider>
  );
}

type ProjectChatbotActionsProps = {
  showDebug: boolean;
  onToggleDebug: () => void;
};

function ProjectChatbotActions(p: ProjectChatbotActionsProps) {
  const { clearConversation, isLoading } = createAIChat();

  return (
    <div class="ui-gap-sm flex">
      <Button onClick={p.onToggleDebug} outline iconName="code">
        {p.showDebug ? "Hide Debug" : "Debug Tools"}
      </Button>
      <Button
        onClick={clearConversation}
        disabled={isLoading()}
        outline
        iconName="trash"
      >
        Clear conversation
      </Button>
    </div>
  );
}
