import {
  Button,
  FrameTop,
  HeadingBar,
  AIChatProvider,
  AIChat,
  createAIChat,
  createSDKClient,
  type OpenEditorProps,
  type AIChatConfig,
} from "panther";
import { isFrench, DEFAULT_ANTHROPIC_MODEL, type ProjectDetail } from "lib";
import { createMemo, createSignal, Show } from "solid-js";
import { _SERVER_HOST } from "~/server_actions/config";
import { WelcomeMessage } from "./WelcomeMessage";
import { getChatbotTools } from "../ai_tools/ai_tool_definitions";
import { AIToolsDebug } from "../ai_tools/ai_debug_component";
import { getChatbotSystemPrompt } from "../ai_prompts/chatbot";

type Props = {
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

  const tools = createMemo(() => getChatbotTools(projectId));
  const systemPrompt = createMemo(() => getChatbotSystemPrompt(p.projectDetail.aiContext));

  const sdkClient = createSDKClient({
    baseURL: `${_SERVER_HOST}/ai`, // Uses unified /ai/v1/messages endpoint
    defaultHeaders: { "Project-Id": projectId },
  });

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 4096,
        },
        tools: tools() as AIChatConfig["tools"],
        conversationId: projectId,
        enableStreaming: false,
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
