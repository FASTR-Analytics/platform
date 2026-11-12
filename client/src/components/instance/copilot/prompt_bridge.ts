import { createSignal } from "solid-js";
import { setShowAi } from "~/state/t4_ui";

// How a screen outside the chat starts a copilot turn, and offers an action
// in the chat's menu. The chat pane is the only consumer: it sends a pending
// prompt once it is mounted, owns the tab's chat and is idle
// (chat_pane.tsx), so a request made while the panel was hidden runs when it
// opens. One request is held at a time; a newer one replaces it.

export type CopilotPromptRequest = {
  id: number;
  text: string;
  newConversation: boolean;
};

let nextId = 1;
const [pending, setPending] = createSignal<CopilotPromptRequest | undefined>();

export function requestCopilotPrompt(
  text: string,
  opts: { newConversation: boolean },
): void {
  setPending({ id: nextId++, text, newConversation: opts.newConversation });
  setShowAi(true);
}

export function pendingCopilotPrompt(): CopilotPromptRequest | undefined {
  return pending();
}

// Clears the request once it is sent; a newer one made meanwhile stays.
export function takeCopilotPrompt(id: number): void {
  if (pending()?.id === id) setPending(undefined);
}

// An action the open screen offers in the chat's menu (the deck's "Apply a
// blueprint…"). The screen registers it while mounted and the returned
// function removes it.
export type CopilotMenuAction = {
  label: string;
  icon: "sparkles" | "document" | "plus";
  run: () => void;
};

const [menuAction, setMenuAction] = createSignal<
  CopilotMenuAction | undefined
>();

export function registerCopilotMenuAction(
  action: CopilotMenuAction,
): () => void {
  setMenuAction(action);
  return () => {
    if (menuAction() === action) setMenuAction(undefined);
  };
}

export function copilotMenuAction(): CopilotMenuAction | undefined {
  return menuAction();
}
