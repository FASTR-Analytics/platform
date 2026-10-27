import type {
  AIChatInstance,
  AnthropicModelConfig,
  EphemeralSection,
  MessageParam,
} from "panther";
import type { CopilotViewId } from "lib";
import {
  type CopilotRequestRecord,
  copilotRequests,
} from "./ai_configs/mod.ts";
import { copilotViewController } from "./ai_views";

// The copilot's wire, on `window.__copilot`, for a tester or an agent driving
// the browser. Installed only under AI_DEBUG (state/t4_ui.ts) while this tab
// owns the chat. `requests()` is the ground truth: every POST the SDK made to
// the proxy, body as serialised, so what it holds is what the model received.
// The rest reads the engine and the view controller live: the stored
// messages (sections as typed data, before the wire renders them), what the
// next message would carry, the registered tools, the model config and the
// view the user is in.

export type CopilotDebugView = {
  id: CopilotViewId;
  label: string;
  params: unknown;
};

export type CopilotDebugApi = {
  view: () => CopilotDebugView;
  nextTurn: () => { system: string; sections: EphemeralSection[] };
  messages: () => MessageParam[];
  requests: () => CopilotRequestRecord[];
  lastRequest: () => CopilotRequestRecord | undefined;
  tools: () => { name: string; description: string; inputSchema: unknown }[];
  config: () => AnthropicModelConfig;
  conversationId: () => string;
  isLoading: () => boolean;
};

type DebugWindow = Window & { __copilot?: CopilotDebugApi };

export function installCopilotDebugApi(chat: AIChatInstance): () => void {
  const api: CopilotDebugApi = {
    view: () => {
      const current = copilotViewController.current();
      return {
        id: current.id,
        label: copilotViewController.currentLabel(),
        params: current.params,
      };
    },
    nextTurn: () => chat.getNextTurnPreview(),
    messages: () => chat.messages(),
    requests: copilotRequests,
    lastRequest: () => copilotRequests().at(-1),
    tools: () =>
      chat.toolRegistry.getSDKTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema,
      })),
    config: () => chat.getConfig(),
    conversationId: () => chat.conversationId(),
    isLoading: () => chat.isLoading(),
  };
  const w = window as DebugWindow;
  w.__copilot = api;
  return () => {
    if (w.__copilot === api) delete w.__copilot;
  };
}
