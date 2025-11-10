import { createSignal } from "solid-js";
import { getToolActionLabel } from "lib";
import { serverActions } from "~/server_actions";
import { getDisplayItemsFromMessage } from "./display_items";
import { getToolHandlers } from "./tool_handlers";
import type { ContentBlock, DisplayItem, MessageParam } from "./types";

// Store conversation state and loading state outside component
const conversationStores = new Map<
  string,
  {
    messages: ReturnType<typeof createSignal<MessageParam[]>>;
    displayItems: ReturnType<typeof createSignal<DisplayItem[]>>;
    isLoading: ReturnType<typeof createSignal<boolean>>;
  }
>();

export function getOrCreateConversationStore(projectId: string) {
  if (!conversationStores.has(projectId)) {
    conversationStores.set(projectId, {
      messages: createSignal<MessageParam[]>([]),
      displayItems: createSignal<DisplayItem[]>([]),
      isLoading: createSignal(false),
    });
  }
  return conversationStores.get(projectId)!;
}

async function processToolUses(
  content: ContentBlock[],
  toolHandlers: Record<string, (input: unknown) => Promise<string>>,
) {
  const toolPromises = content
    .filter(
      (block): block is ContentBlock & { name: string; id: string } =>
        block.type === "tool_use" && !!block.name && !!block.id,
    )
    .map(async (block) => {
      const handler = toolHandlers[block.name];
      if (!handler) {
        console.error(`Unknown tool: ${block.name}`);
        return null;
      }

      try {
        // DEBUG: Artificial delay to see loading state
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const result = await handler(block.input);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        };
      }
    });

  const results = await Promise.all(toolPromises);
  return results.filter(
    (
      r,
    ): r is {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    } => r !== null,
  );
}

export async function sendMessageToServer(
  projectId: string,
  userMessage: string,
): Promise<void> {
  const store = getOrCreateConversationStore(projectId);
  const [messagesVal, setMessages] = store.messages;
  const [displayItemsVal, setDisplayItems] = store.displayItems;

  const addDisplayItems = (items: DisplayItem[]) => {
    setDisplayItems([...displayItemsVal(), ...items]);
  };

  const processMessageForDisplay = (message: MessageParam) => {
    const items = getDisplayItemsFromMessage(message);
    addDisplayItems(items);
  };

  const toolHandlers = getToolHandlers(projectId);

  const userMsg: MessageParam = {
    role: "user",
    content: userMessage,
  };

  const newMessages = [...messagesVal(), userMsg];
  setMessages(newMessages);

  if (userMessage.trim()) {
    processMessageForDisplay(userMsg);
  }

  const response = await serverActions.chatbot({
    messages: newMessages,
    projectId,
  });

  if (!response.success) {
    throw new Error(response.err);
  }

  const res = response.data as {
    content: ContentBlock[];
    stop_reason: string;
  };

  const assistantMsg: MessageParam = {
    role: "assistant",
    content: res.content,
  };

  setMessages([...messagesVal(), assistantMsg]);
  processMessageForDisplay(assistantMsg);

  if (res.stop_reason === "tool_use") {
    const toolInProgressItems: DisplayItem[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use" && block.name) {
        toolInProgressItems.push({
          type: "tool_in_progress",
          toolInProgressActionLabel:
            getToolActionLabel(block.name) ?? "Performing action...",
          toolName: block.name,
          toolInput: block.input,
        });
      }
    }
    addDisplayItems(toolInProgressItems);

    const toolResults = await processToolUses(res.content, toolHandlers);

    setDisplayItems(
      displayItemsVal().filter((item) => item.type !== "tool_in_progress"),
    );

    const errorItems: DisplayItem[] = [];
    for (const result of toolResults) {
      if (result.is_error) {
        const toolBlock = res.content.find(
          (block) =>
            block.type === "tool_use" && block.id === result.tool_use_id,
        );
        errorItems.push({
          type: "tool_error",
          toolName: (toolBlock as { name?: string })?.name ?? "unknown tool",
          errorMessage: result.content,
        });
      }
    }
    if (errorItems.length > 0) {
      addDisplayItems(errorItems);
    }

    if (toolResults.length > 0) {
      setMessages([...messagesVal(), { role: "user", content: toolResults }]);
      return sendMessageToServer(projectId, "");
    }
  }
}
