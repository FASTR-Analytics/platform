import {
  Button,
  FrameTop,
  HeadingBar,
  AIChatProvider,
  AIChat,
  useAIChat,
  type OpenEditorProps,
} from "panther";
import { isFrench, DEFAULT_ANTHROPIC_MODEL, type ProjectDetail } from "lib";
import { createMemo } from "solid-js";
import { _SERVER_HOST } from "~/server_actions/config";
import { createProjectTools } from "./tools.tsx";
import { WelcomeMessage } from "./WelcomeMessage";
import { MarkdownTextRenderer } from "./MarkdownTextRenderer";
import type { MessagePayload, AnthropicResponse } from "panther";

type Props = {
  projectDetail: ProjectDetail;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectChatbotV2(p: Props) {
  const projectId = p.projectDetail.id;

  const tools = createMemo(() => createProjectTools(projectId));

  return (
    <AIChatProvider
      config={{
        apiConfig: {
          endpoint: `${_SERVER_HOST}/chatbot`,
          transformRequest: async (payload: MessagePayload) => ({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Project-Id": projectId,
            },
            credentials: "include",
            body: JSON.stringify(payload),
          }),
          transformResponse: async (response: Response): Promise<AnthropicResponse> => {
            const data = await response.json();
            if (!data.success) {
              throw new Error(data.err);
            }
            return data.data;
          },
        },
        modelConfig: {
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 4096,
        },
        tools: tools(),
        conversationId: projectId,
        enableStreaming: false,
      }}
    >
      <FrameTop
        panelChildren={
          <HeadingBar heading="AI Assistant" french={isFrench()}>
            <ProjectChatbotActions />
          </HeadingBar>
        }
      >
        <AIChat
          customRenderers={{
            text: MarkdownTextRenderer,
          }}
          fallbackContent={WelcomeMessage}
        />
      </FrameTop>
    </AIChatProvider>
  );
}

function ProjectChatbotActions() {
  const { clearConversation, isLoading } = useAIChat();

  return (
    <Button
      onClick={clearConversation}
      disabled={isLoading()}
      outline
      iconName="trash"
    >
      Clear conversation
    </Button>
  );
}
