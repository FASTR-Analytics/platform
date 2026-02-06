import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Loading,
  type ConversationMetadata,
  type ConversationsContextValue,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { t } from "lib";

type Props = {
  conversations: ConversationsContextValue;
};

type ReturnType = undefined;

export function ConversationSelectorModal(
  p: AlertComponentProps<Props, ReturnType>
) {
  const conversations = p.conversations;
  const [deleting, setDeleting] = createSignal<string | null>(null);

  const handleSelect = (convId: string) => {
    conversations.switchTo(convId);
    p.close(undefined);
  };

  const handleNew = async () => {
    await conversations.createConversation();
    p.close(undefined);
  };

  const handleDelete = async (convId: string, e: MouseEvent) => {
    e.stopPropagation();
    const current = conversations.activeConversationId();
    if (convId === current) return; // Can't delete active
    setDeleting(convId);
    await conversations.deleteConversation(convId);
    setDeleting(null);
  };

  const sortedConversations = () => {
    return [...conversations.conversations()].sort((a, b) => {
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  };

  return (
    <AlertFormHolder
      formId="conversation-selector"
      header={t("Conversations")}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="mb-4">
        <Button intent="primary" onClick={handleNew} fullWidth>
          {t("+ New conversation")}
        </Button>
      </div>

      <Show
        when={sortedConversations().length > 0}
        fallback={
          <div class="py-4 text-center text-base-content/60">
            {t("No conversations")}
          </div>
        }
      >
        <div class="max-h-[400px] space-y-2 overflow-y-auto">
          <For each={sortedConversations()}>
            {(conv) => (
              <div
                class={`flex cursor-pointer items-center justify-between rounded border p-3 transition-colors hover:bg-base-200 ${
                  conv.id === conversations.activeConversationId()
                    ? "border-primary bg-primary/10"
                    : "border-base-300"
                }`}
                onClick={() => handleSelect(conv.id)}
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{conv.title}</div>
                  <div class="text-sm text-base-content/60">
                    {new Date(conv.lastMessageAt).toLocaleDateString()} {" "}
                    {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Show when={conv.id !== conversations.activeConversationId()}>
                  <Button
                    size="sm"
                    intent="danger"
                    outline
                    iconName="trash"
                    onClick={(e) => handleDelete(conv.id, e)}
                    disabled={deleting() === conv.id}
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
