import { AIChat, Button, createAIChat, openComponent, useConversations } from "panther";
import { Show } from "solid-js";
import { t } from "lib";
import { useAIProjectContext } from "./context";
import { DraftPreview } from "./draft_preview";
import { setShowAi } from "~/state/ui";
import { useAIDocuments, AIDocumentButton, AIDocumentList } from "./ai_documents";
import { ConversationSelectorModal } from "./ConversationSelectorModal";
import { usePromptLibrary } from "./ai_prompt_library";

type ConsolidatedChatPaneProps = {
  aiDocs: ReturnType<typeof useAIDocuments>;
};

export function ConsolidatedChatPane(p: ConsolidatedChatPaneProps) {
  const { aiContext, draftContent, getPendingInteractionsMessage, clearPendingInteractions } = useAIProjectContext();
  const { clearConversation, isLoading, sendMessage } = createAIChat();
  const conversations = useConversations();

  let scrollToBottom: ((force?: boolean) => void) | null = null;

  const openConversationSelector = async () => {
    await openComponent({
      element: ConversationSelectorModal,
      props: {
        conversations,
      },
    });
  };

  const handlePromptRun = async (promptText: string, startNew: boolean) => {
    if (startNew) {
      await conversations.createConversation();
    }

    setTimeout(() => {
      sendMessage(promptText);
      setTimeout(() => scrollToBottom?.(true), 100);
    }, 200);
  };

  const { openPromptLibrary } = usePromptLibrary({
    onRunPrompt: handlePromptRun,
  });

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
      case "editing_slide_deck":
        return t("Ask about this slide deck...");
      case "editing_visualization":
        return t("Ask about this visualization...");
      case "editing_report":
        return t("Ask about this report...");
      case "viewing_visualizations":
      case "viewing_slide_decks":
      case "viewing_reports":
      case "viewing_data":
      case "viewing_metrics":
      case "viewing_modules":
        return t("Explore your data...");
    }
  };

  const title = () => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "editing_slide_deck":
        return `Deck: ${ctx.deckLabel}`;
      case "editing_visualization":
        return `Viz: ${ctx.vizLabel}`;
      case "editing_report":
        return `Report: ${ctx.reportLabel}`;
      case "viewing_visualizations":
        return "Visualizations";
      case "viewing_slide_decks":
        return "Slide Decks";
      case "viewing_reports":
        return "Reports";
      case "viewing_data":
        return "Data";
      case "viewing_metrics":
        return "Metrics";
      case "viewing_modules":
        return "Modules";
    }
  };

  return (
    <div class="flex h-full w-full flex-col border-l">
      <div class="ui-pad ui-gap flex items-center justify-between border-b border-base-content bg-primary text-white">
        <h3 class="truncate text-base font-700">{title()}</h3>
        <div class="flex ui-gap-sm">
          <Button
            onClick={openConversationSelector}
            disabled={isLoading()}
            outline
            intent="base-100"
            iconName="moreVertical"
            ariaLabel="Switch conversation"
          />
          <Button
            onClick={openPromptLibrary}
            disabled={isLoading()}
            outline
            intent="base-100"
            iconName="sparkles"
            ariaLabel="Prompt library"
          />
          <AIDocumentButton
            documents={p.aiDocs.documents()}
            onOpenSelector={p.aiDocs.openSelector}
            onRemoveDocument={p.aiDocs.removeDocument}
          />
          <Button
            onClick={clearConversation}
            disabled={isLoading()}
            outline
            intent="base-100"
            iconName="trash"
            ariaLabel="Clear conversation"
          />
          <Button
            onClick={() => setShowAi(false)}
            outline
            intent="base-100"
            iconName="chevronRight"
            ariaLabel="Hide AI panel"
          />
        </div>
      </div>

      <Show when={draftContent()}>
        <DraftPreview />
      </Show>

      <AIDocumentList
        documents={p.aiDocs.documents()}
        onRemove={p.aiDocs.removeDocument}
      />

      <div class="flex-1 overflow-hidden">
        <AIChat
          placeholder={placeholder()}
          onBeforeSubmit={handleBeforeSubmit}
          onScrollReady={(fn) => scrollToBottom = fn}
        />
      </div>
    </div>
  );
}
