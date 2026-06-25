import {
  AIChat,
  AIChatConversationSelector,
  AIChatSystemPromptPanel,
  type AIChatSystemPromptPanelProps,
  Button,
  createAIChat,
  MenuTriggerWrapper,
  openComponent,
  openConfirm,
  useConversations,
  type MenuItem,
} from "panther";
import { t3, TC } from "lib";
import type { Accessor } from "solid-js";

type Props = {
  getSystemPrompt: Accessor<string>;
  onClose: () => void;
};

export function HfaIndicatorChatPane(p: Props) {
  const { conversationId, isLoading } = createAIChat();
  const conversations = useConversations();

  const openConversationSelector = async () => {
    await openComponent({
      element: AIChatConversationSelector,
      props: { conversations },
    });
  };

  const handleDeleteConversation = async () => {
    const confirmed = await openConfirm({
      title: t3({ en: "Delete conversation", fr: "Supprimer la conversation" }),
      text: t3({
        en: "Are you sure you want to delete this conversation? This action cannot be undone.",
        fr: "Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action est irréversible.",
      }),
      intent: "danger",
      confirmButtonLabel: t3(TC.delete),
    });
    if (confirmed) {
      await conversations.deleteConversation(conversationId());
    }
  };

  const menuItems = (): MenuItem[] => [
    {
      label: t3({ en: "New conversation", fr: "Nouvelle conversation" }),
      icon: "plus",
      onClick: () => conversations.createConversation(),
      disabled: isLoading(),
    },
    {
      label: t3({ en: "Switch conversation", fr: "Changer de conversation" }),
      icon: "versions",
      onClick: openConversationSelector,
      disabled: isLoading(),
    },
    { type: "divider" },
    {
      label: t3({ en: "View system prompt", fr: "Voir le prompt système" }),
      icon: "code",
      onClick: () =>
        openComponent<AIChatSystemPromptPanelProps, void>({
          element: AIChatSystemPromptPanel,
          props: { systemPrompt: p.getSystemPrompt() },
        }),
    },
    { type: "divider" },
    {
      label: t3({ en: "Delete conversation", fr: "Supprimer la conversation" }),
      icon: "trash",
      intent: "danger",
      onClick: handleDeleteConversation,
      disabled: isLoading(),
    },
  ];

  return (
    <div class="flex h-full w-full flex-col border-l">
      <div class="ui-pad ui-gap border-base-content bg-primary flex items-center justify-between border-b text-white">
        <h3 class="flex items-baseline gap-2 truncate text-base">
          <span class="font-700">
            {t3({ en: "Indicator AI", fr: "IA Indicateurs" })}
          </span>
        </h3>
        <div class="ui-gap-sm flex items-center">
          <MenuTriggerWrapper items={menuItems} position="bottom-end">
            <Button outline intent="base-100" iconName="moreVertical" ariaLabel="Menu" />
          </MenuTriggerWrapper>
          <Button
            onClick={p.onClose}
            outline
            intent="base-100"
            iconName="chevronRight"
            ariaLabel="Hide AI panel"
          />
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <AIChat
          placeholder={t3({
            en: "Ask me to clean up labels or organise indicators...",
            fr: "Demandez-moi d'améliorer les libellés ou d'organiser les indicateurs...",
          })}
        />
      </div>
    </div>
  );
}
