import { AIChat, Button, createAIChat } from "panther";
import { Show } from "solid-js";
import { t } from "lib";
import { useAIProjectContext } from "./context";
import { DraftPreview } from "./draft_preview";
import { setShowAi } from "~/state/ui";
import { useAIDocuments, AIDocumentButton, AIDocumentList } from "~/components/ai_documents";

type ConsolidatedChatPaneProps = {
  aiDocs: ReturnType<typeof useAIDocuments>;
};

export function ConsolidatedChatPane(p: ConsolidatedChatPaneProps) {
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
    <div class="flex h-full w-full flex-col border-l">
      <div class="ui-pad ui-gap flex items-center justify-between border-b border-base-content bg-primary text-white">
        <h3 class="truncate text-base font-700">{title()}</h3>
        <div class="flex ui-gap-sm">
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
        <AIChat placeholder={placeholder()} onBeforeSubmit={handleBeforeSubmit} />
      </div>
    </div>
  );
}
