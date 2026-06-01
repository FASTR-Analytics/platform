import {
  AIChat,
  AIChatConversationSelector,
  AIChatSettingsPanel,
  type AIChatSettingsPanelProps,
  type AIChatSettingsValues,
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
import { createEffect, createSignal, on, onMount, Show, type Accessor } from "solid-js";
import { useAIProjectContext } from "./context";
import { setShowAi } from "~/state/t4_ui";
import { serverActions } from "~/server_actions";
import { useAIDocuments, AIDocumentList } from "./ai_documents";
import { usePromptLibrary } from "./ai_prompt_library";
import { SaveableUserTextRenderer } from "./ai_prompt_library/SaveableUserTextRenderer";
import { AIDebugPanel, type AIDebugPanelProps } from "./ai_debug_panel";
import { projectState } from "~/state/project/t1_store";

const RESET_RE = /will reset at ([^".}]+)/i;

function RateLimitErrorBox(props: { item: { errorDetails: string } }) {
  const isWeekly = () => /weekly|country/i.test(props.item.errorDetails);
  const resetTime = () => props.item.errorDetails.match(RESET_RE)?.[1] ?? null;
  return (
    <div class="border-base-300 bg-base-100 my-1 max-w-sm rounded border p-3">
      <div class="text-warning text-sm font-medium">
        {isWeekly()
          ? t3({ en: "Country AI usage limit reached", fr: "Limite IA du pays atteinte" })
          : t3({ en: "Daily AI usage limit reached", fr: "Limite IA journalière atteinte" })}
      </div>
      <Show when={resetTime()}>
        {(time) => (
          <div class="text-neutral mt-1 text-xs">
            {t3({ en: "Usage will reset at", fr: "L'utilisation se réinitialisera à" })} {time()}
          </div>
        )}
      </Show>
    </div>
  );
}

function ToolErrorRenderer(props: { item: { errorMessage: string; errorDetails: string } }) {
  const isRateLimit = () => /daily AI token limit|weekly AI token limit/i.test(props.item.errorDetails);
  const [expanded, setExpanded] = createSignal(false);
  return (
    <Show when={isRateLimit()} fallback={
      <div class="my-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          class="text-neutral/80 hover:text-neutral flex w-full cursor-pointer items-start gap-1 text-left text-xs"
        >
          <span class="mt-0.5">{expanded() ? "▾" : "▸"}</span>
          <span class="font-medium">{props.item.errorMessage}</span>
        </button>
        <Show when={expanded()}>
          <div class="ml-4 mt-1 text-xs">{props.item.errorDetails}</div>
        </Show>
      </div>
    }>
      <RateLimitErrorBox item={props.item} />
    </Show>
  );
}

const customChatRenderers = { toolError: ToolErrorRenderer, userText: SaveableUserTextRenderer } as Parameters<typeof AIChat>[0]["customRenderers"];

type ConsolidatedChatPaneProps = {
  aiDocs: ReturnType<typeof useAIDocuments>;
  getSystemPrompt: Accessor<string>;
};

export function ConsolidatedChatPane(p: ConsolidatedChatPaneProps) {
  const { aiContext } = useAIProjectContext();
  const { updateConfig, getConfig, conversationId, isLoading, sendMessage } =
    createAIChat();
  const conversations = useConversations();

  let scrollToBottom: ((force?: boolean) => void) | null = null;

  const openConversationSelector = async () => {
    await openComponent({
      element: AIChatConversationSelector,
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

  const openSettings = async () => {
    const current = getConfig();
    const result = await openComponent<
      AIChatSettingsPanelProps,
      AIChatSettingsValues
    >({
      element: AIChatSettingsPanel,
      props: {
        initialValues: current,
        allowedModels: [
          "claude-opus-4-6",
          "claude-sonnet-4-6",
          "claude-haiku-4-5-20251001",
        ],
      },
    });
    if (result) {
      updateConfig(result);
    }
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
    {
      type: "divider",
    },
    {
      label: t3({ en: "Prompt library", fr: "Bibliothèque de prompts" }),
      icon: "sparkles",
      onClick: openPromptLibrary,
      disabled: isLoading(),
    },
    {
      label: t3({ en: "Include file", fr: "Inclure un fichier" }),
      icon: "document",
      onClick: p.aiDocs.openSelector,
      disabled: isLoading(),
    },
    {
      type: "divider",
    },
    {
      label: t3({ en: "AI settings", fr: "Paramètres IA" }),
      icon: "settings",
      onClick: openSettings,
    },
    {
      label: t3({ en: "View system prompt", fr: "Voir le prompt système" }),
      icon: "code",
      onClick: () =>
        openComponent<AIChatSystemPromptPanelProps, void>({
          element: AIChatSystemPromptPanel,
          props: { systemPrompt: p.getSystemPrompt() },
        }),
    },
    {
      label: t3({
        en: "View AI tool output",
        fr: "Voir la sortie des outils IA",
      }),
      icon: "search",
      onClick: () =>
        openComponent<AIDebugPanelProps, void>({
          element: AIDebugPanel,
          props: {
            metrics: projectState.metrics,
            icehIndicators: projectState.icehIndicators,
            visualizations: projectState.visualizations,
          },
        }),
    },
    {
      type: "divider",
    },
    {
      label: t3({ en: "Delete conversation", fr: "Supprimer la conversation" }),
      icon: "trash",
      intent: "danger",
      onClick: handleDeleteConversation,
      disabled: isLoading(),
    },
  ];

  const placeholder = () => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "editing_slide_deck":
        return t3({
          en: "Ask about this slide deck...",
          fr: "Posez une question sur cette présentation...",
        });
      case "editing_slide":
        return t3({
          en: "Ask about this slide...",
          fr: "Posez une question sur cette diapositive...",
        });
      case "editing_visualization":
        return t3({
          en: "Ask about this visualization...",
          fr: "Posez une question sur cette visualisation...",
        });
      case "editing_report":
        return t3({ en: "Ask about this report...", fr: "Posez une question sur ce rapport..." });
      case "viewing_visualizations":
      case "viewing_slide_decks":
      case "viewing_reports":
      case "viewing_data":
      case "viewing_metrics":
      case "viewing_modules":
      case "viewing_settings":
        return t3({
          en: "Explore your data...",
          fr: "Explorez vos données...",
        });
      default: {
        const _exhaustive: never = ctx;
        return _exhaustive;
      }
    }
  };

  const titleSubtext = () => {
    const ctx = aiContext();
    switch (ctx.mode) {
      case "editing_slide_deck":
        return ctx.deckLabel;
      case "editing_slide":
        return ctx.slideLabel;
      case "editing_visualization":
        return ctx.vizLabel;
      case "editing_report":
        return ctx.reportLabel;
      case "viewing_visualizations":
        return t3({ en: "Visualizations", fr: "Visualisations" });
      case "viewing_slide_decks":
        return t3({ en: "Slide Decks", fr: "Présentations" });
      case "viewing_reports":
        return t3({ en: "Reports", fr: "Rapports" });
      case "viewing_data":
        return t3({ en: "Data", fr: "Données" });
      case "viewing_metrics":
        return t3({ en: "Metrics", fr: "Métriques" });
      case "viewing_modules":
        return t3({ en: "Modules", fr: "Modules" });
      case "viewing_settings":
        return t3(TC.settings);
      default: {
        const _exhaustive: never = ctx;
        return _exhaustive;
      }
    }
  };

  type AiUsageData = { tokensUsedToday: number; dailyTokenLimit: number | null; isUnlimited: boolean; tokensUsedThisWeek: number; weeklyTokenLimit: number | null };
  const [aiUsage, setAiUsage] = createSignal<AiUsageData | null>(null);

  async function refreshAiUsage() {
    try {
      const res = await serverActions.getAiUsage({});
      if (res.success) setAiUsage(res.data);
    } catch { /* ignore */ }
  }

  onMount(refreshAiUsage);

  createEffect(on(isLoading, (loading) => {
    if (!loading) refreshAiUsage();
  }, { defer: true }));

  const usagePct = () => {
    const u = aiUsage();
    if (!u || u.isUnlimited || u.dailyTokenLimit === null) return null;
    return Math.min(100, Math.round((u.tokensUsedToday / u.dailyTokenLimit) * 100));
  };

  const usageTooltip = () => {
    const pct = usagePct();
    if (pct === null) return "";
    const resetAt = new Date();
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);
    resetAt.setUTCHours(0, 0, 0, 0);
    return `${pct}% of daily AI limit used · Resets ${resetAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  };

  return (
    <div class="flex h-full w-full flex-col border-l">
      <div class="ui-pad ui-gap border-base-content bg-primary flex items-center justify-between border-b text-white">
        <h3 class="flex items-baseline gap-2 truncate text-base">
          <span class="font-700">{t3({ en: "AI", fr: "IA" })}</span>
          <span class="font-400 text-sm opacity-70">{titleSubtext()}</span>
        </h3>
        <div class="ui-gap-sm flex items-center">
          <MenuTriggerWrapper items={menuItems} position="bottom-end">
            <Button
              outline
              intent="base-100"
              iconName="moreVertical"
              ariaLabel="Menu"
            />
          </MenuTriggerWrapper>
          <Button
            onClick={() => setShowAi(false)}
            outline
            intent="base-100"
            iconName="chevronRight"
            ariaLabel="Hide AI panel"
          />
        </div>
      </div>

      <AIDocumentList
        documents={p.aiDocs.documents()}
        onRemove={p.aiDocs.removeDocument}
      />

      <div class="flex-1 overflow-hidden">
        <AIChat
          placeholder={placeholder()}
          onScrollReady={(fn) => (scrollToBottom = fn)}
          customRenderers={customChatRenderers}
        />
      </div>

      <Show when={usagePct() !== null}>
        <div class="border-base-200 flex items-center gap-2 border-t px-3 py-1.5" title={usageTooltip()}>
          <svg width="18" height="18" viewBox="0 0 20 20" class="shrink-0 cursor-default">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="3" class="text-base-300" />
            <circle
              cx="10" cy="10" r="7"
              fill="none"
              stroke={usagePct()! >= 100 ? "#ef4444" : usagePct()! >= 80 ? "#f59e0b" : "currentColor"}
              stroke-width="3"
              stroke-dasharray="43.98"
              stroke-dashoffset={43.98 * (1 - usagePct()! / 100)}
              transform="rotate(-90 10 10)"
              stroke-linecap="round"
              class={usagePct()! >= 80 ? "" : "text-primary"}
            />
          </svg>
          <span class="text-neutral text-xs">{usagePct()}% of daily AI limit used</span>
        </div>
      </Show>
    </div>
  );
}
