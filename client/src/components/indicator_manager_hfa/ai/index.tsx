import {
  AIChatProvider,
  type AIChatConfig,
  FrameRightResizable,
  validateAIChatConfig,
} from "panther";
import type { Accessor, ParentProps } from "solid-js";
import { createHfaIndicatorAiSDKClient, HFA_AI_MODEL_CONFIG } from "./sdk_client";
import { buildHfaIndicatorTools } from "./tools";
import { buildHfaIndicatorSystemPrompt } from "./system_prompt";
import { HfaIndicatorChatPane } from "./chat_pane";

export { buildHfaIndicatorSystemPrompt } from "./system_prompt";

type Props = ParentProps & {
  show: Accessor<boolean>;
  onClose: () => void;
};

// Self-contained AI layer for the HFA Indicator Manager. Uses the same panther
// chat engine as the project assistant, but with its own conversation register
// (scope: "hfa-indicators"), its own instance-scoped SDK client, and its own
// indicator-authoring tool set — fully isolated from project_ai.
export function HfaIndicatorAiWrapper(props: Props) {
  const sdkClient = createHfaIndicatorAiSDKClient();
  const system: Accessor<string> = () => buildHfaIndicatorSystemPrompt();

  const config: AIChatConfig = {
    sdkClient,
    modelConfig: HFA_AI_MODEL_CONFIG,
    tools: buildHfaIndicatorTools() as AIChatConfig["tools"],
    scope: "hfa-indicators",
    system,
    approvalPolicy: { requireForKind: "write", requireKind: true },
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  return (
    <AIChatProvider config={config}>
      <FrameRightResizable
        minWidth={300}
        startingWidth={560}
        maxWidth={1200}
        hoverOffset="offset-for-border-1-on-right"
        isShown={props.show()}
        onToggleShow={props.onClose}
        panelChildren={
          <HfaIndicatorChatPane getSystemPrompt={system} onClose={props.onClose} />
        }
      >
        {props.children}
      </FrameRightResizable>
    </AIChatProvider>
  );
}
