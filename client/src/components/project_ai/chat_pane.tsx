import { AIChat, Button, createAIChat } from "panther";
import { Show } from "solid-js";
import { t } from "lib";
import { useAIProjectContext } from "./context";
import { DraftPreview } from "./draft_preview";

export function ConsolidatedChatPane() {
  const { aiContext, draftContent, getPendingInteractionsMessage, clearPendingInteractions } = useAIProjectContext();
  const { clearConversation, isLoading } = createAIChat();

  const handleBeforeSubmit = (userMessage: string): string => {
    const interactionsMessage = getPendingInteractionsMessage();
    if (interactionsMessage) {
      clearPendingInteractions();
      return `${interactionsMessage}\n\n${userMessage}`;
    }
    return userMessage;
  };

  const placeholder = () => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "deck":
        return t("Ask about this slide deck...");
      case "viz-editor":
        return t("Ask about this visualization...");
      case "report":
        return t("Ask about this report...");
      default:
        return t("Explore your data...");
    }
  };

  const title = () => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "deck":
        return `Deck: ${ctx.deckLabel}`;
      case "viz-editor":
        return `Viz: ${ctx.vizLabel}`;
      case "report":
        return `Report: ${ctx.reportLabel}`;
      default:
        return t("AI Assistant");
    }
  };

  return (
    <div class="flex h-full w-80 flex-col border-l">
      <div class="ui-pad flex items-center justify-between border-b bg-base-200">
        <h3 class="truncate text-sm font-700">{title()}</h3>
        <Button
          onClick={clearConversation}
          disabled={isLoading()}
          outline
          iconName="trash"
          size="sm"
        />
      </div>

      <Show when={draftContent()}>
        <DraftPreview />
      </Show>

      <div class="flex-1 overflow-hidden">
        <AIChat placeholder={placeholder()} onBeforeSubmit={handleBeforeSubmit} />
      </div>
    </div>
  );
}
