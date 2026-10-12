import {
  ActionMenuButton,
  AIChat,
  AIChatConversationSelector,
  type AIChatInstance,
  AIChatSettingsPanel,
  type AIChatSettingsPanelProps,
  type AIChatSettingsValues,
  AIChatSystemPromptPanel,
  type AIChatSystemPromptPanelProps,
  Button,
  HeadingBar,
  Icon,
  type MenuItem,
  openComponent,
  openConfirm,
  useConversations,
} from "panther";
import { t3, TC } from "lib";
import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { copilotViewController, packageViewContext } from "./ai_views";
import { setTurnRunning } from "./turn_guard";
import type { EditingReportContext } from "./ai_views";
import { setShowAi } from "~/state/t4_ui";
import { serverActions } from "~/server_actions";
import { AIDocumentList, useAIDocuments } from "./ai_documents/mod.ts";
import { usePromptLibrary } from "./ai_prompt_library/mod.ts";
import { SaveableUserTextRenderer } from "./ai_prompt_library/mod.ts";
import { AIDebugPanel, type AIDebugPanelProps } from "./ai_debug_panel";
import type {
  CopilotViewId,
  ResolvedPackageScope,
  TranslatableString,
} from "lib";

const ASK_ANYTHING: TranslatableString = {
  en: "Ask anything...",
  fr: "Posez une question...",
  pt: "Faça uma pergunta...",
};
const ASK_DECK: TranslatableString = {
  en: "Ask about this slide deck...",
  fr: "Posez une question sur cette présentation...",
  pt: "Faça uma pergunta sobre esta apresentação...",
};
const ASK_REPORT: TranslatableString = {
  en: "Ask about this report...",
  fr: "Posez une question sur ce rapport...",
  pt: "Faça uma pergunta sobre este relatório...",
};
const ASK_FIGURE: TranslatableString = {
  en: "Ask about this visualization...",
  fr: "Posez une question sur cette visualisation...",
  pt: "Faça uma pergunta sobre esta visualização...",
};
const ASK_PACKAGE: TranslatableString = {
  en: "Ask about this results package...",
  fr: "Posez une question sur ce paquet de résultats...",
  pt: "Faça uma pergunta sobre este pacote de resultados...",
};
const ASK_DATA: TranslatableString = {
  en: "Ask about this data...",
  fr: "Posez une question sur ces données...",
  pt: "Faça uma pergunta sobre estes dados...",
};
const ASK_HFA: TranslatableString = {
  en: "Ask about HFA indicators...",
  fr: "Posez une question sur les indicateurs HFA...",
  pt: "Faça uma pergunta sobre os indicadores HFA...",
};

// The composer's placeholder per view: a new view fails here until it has
// one.
const PLACEHOLDERS: Record<CopilotViewId, TranslatableString> = {
  products: ASK_ANYTHING,
  opening_product: { en: "Opening...", fr: "Ouverture...", pt: "A abrir..." },
  editing_slide_deck: ASK_DECK,
  editing_slide: {
    en: "Ask about this slide...",
    fr: "Posez une question sur cette diapositive...",
    pt: "Faça uma pergunta sobre este diapositivo...",
  },
  editing_slide_figure: ASK_FIGURE,
  deck_settings: ASK_DECK,
  deck_history: ASK_DECK,
  report_history: ASK_REPORT,
  editing_report: ASK_REPORT,
  editing_report_figure: ASK_FIGURE,
  results_file: ASK_PACKAGE,
  explore: ASK_DATA,
  results_packages: ASK_ANYTHING,
  package: ASK_PACKAGE,
  viewing_package_figure: ASK_FIGURE,
  module_defaults: ASK_ANYTHING,
  scopes: ASK_ANYTHING,
  data: ASK_DATA,
  data_page: ASK_DATA,
  hfa_indicators: ASK_HFA,
  hfa_indicator_editor: ASK_HFA,
  hfa_indicator_import: ASK_HFA,
  assets: ASK_ANYTHING,
  users: ASK_ANYTHING,
  user: ASK_ANYTHING,
  shell: ASK_ANYTHING,
};

const RESET_RE = /will reset at ([^".}]+)/i;

function RateLimitErrorBox(p: { item: { errorDetails: string } }) {
  const isWeekly = () => /weekly|country/i.test(p.item.errorDetails);
  const resetTime = () => p.item.errorDetails.match(RESET_RE)?.[1] ?? null;
  return (
    <div class="bg-base-100 my-1 max-w-sm rounded border p-3">
      <div class="text-warning text-sm">
        {isWeekly()
          ? t3({
            en: "Country AI usage limit reached",
            fr: "Limite IA du pays atteinte",
            pt: "Limite de utilização da IA do país atingido",
          })
          : t3({
            en: "Daily AI usage limit reached",
            fr: "Limite IA journalière atteinte",
            pt: "Limite diário de utilização da IA atingido",
          })}
      </div>
      <Show when={resetTime()}>
        {(time) => (
          <div class="ui-text-caption mt-1">
            {t3({
              en: "Usage will reset at",
              fr: "L'utilisation se réinitialisera à",
              pt: "A utilização será reposta às",
            })} {time()}
          </div>
        )}
      </Show>
    </div>
  );
}

function ToolErrorRenderer(p: {
  item: { errorMessage: string; errorDetails: string };
}) {
  const isRateLimit = () =>
    /daily AI token limit|weekly AI token limit/i.test(p.item.errorDetails);
  const [expanded, setExpanded] = createSignal(false);
  return (
    <Show
      when={isRateLimit()}
      fallback={
        <div class="my-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            class="text-base-content-muted hover:text-base-content flex w-full cursor-pointer items-start gap-1 text-left text-xs"
          >
            <div class="mt-0.5">
              {expanded()
                ? <Icon iconName="chevronDown" class="h-3 w-3" />
                : <Icon iconName="chevronRight" class="h-3 w-3" />}
            </div>
            <span>{p.item.errorMessage}</span>
          </button>
          <Show when={expanded()}>
            <div class="mt-1 ml-4 text-xs">{p.item.errorDetails}</div>
          </Show>
        </div>
      }
    >
      <RateLimitErrorBox item={p.item} />
    </Show>
  );
}

// Non-error turn outcomes (refusal, truncation, context-window exceeded,
// continuation caps) arrive as system_notice items. Match the collapsible
// look of ToolErrorRenderer so they read like the rest of the chat.
function SystemNoticeRenderer(p: {
  item: { message: string; details: string };
}) {
  const [expanded, setExpanded] = createSignal(false);
  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        class="text-base-content-muted hover:text-base-content flex w-full cursor-pointer items-start gap-1 text-left text-xs"
      >
        <div class="mt-0.5">
          {expanded()
            ? <Icon iconName="chevronDown" class="h-3 w-3" />
            : <Icon iconName="chevronRight" class="h-3 w-3" />}
        </div>
        <span>{p.item.message}</span>
      </button>
      <Show when={expanded()}>
        <div class="mt-1 ml-4 text-xs">{p.item.details}</div>
      </Show>
    </div>
  );
}

const customChatRenderers = {
  toolError: ToolErrorRenderer,
  systemNotice: SystemNoticeRenderer,
  userText: SaveableUserTextRenderer,
} as Parameters<typeof AIChat>[0]["customRenderers"];

type ConsolidatedChatPaneProps = {
  // The panel's engine instance, which the pane also hands to AIChat (E2):
  // one registry, one settings copy, one queue drain.
  chat: AIChatInstance;
  aiDocs: ReturnType<typeof useAIDocuments>;
};

export function ConsolidatedChatPane(p: ConsolidatedChatPaneProps) {
  const {
    updateConfig,
    getConfig,
    conversationId,
    isLoading,
    sendMessage,
    messages,
    getNextTurnPreview,
  } = p.chat;
  const conversations = useConversations();

  p.aiDocs.bind(conversationId, messages);

  // The reload guards (turn_guard.ts) read whether a turn runs here; a
  // hand-over or a user switch unmounts the pane, so the flag clears with it.
  createEffect(() => setTurnRunning(isLoading()));
  onCleanup(() => setTurnRunning(false));

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
        // max_tokens is exposed so the truncation notice's "increase max
        // tokens in the AI settings" advice is actionable. The model list is
        // panther's MODEL_OPTIONS: curated there, not per app.
        adjustable: ["model", "max_tokens"],
      },
    });
    if (result) {
      updateConfig(result);
    }
  };

  const handleDeleteConversation = async () => {
    const confirmed = await openConfirm({
      title: t3({
        en: "Delete conversation",
        fr: "Supprimer la conversation",
        pt: "Eliminar conversa",
      }),
      text: t3({
        en:
          "Are you sure you want to delete this conversation? This action cannot be undone.",
        fr:
          "Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action est irréversible.",
        pt:
          "Tem a certeza de que pretende eliminar esta conversa? Esta ação não pode ser anulada.",
      }),
      intent: "danger",
      confirmButtonLabel: t3(TC.delete),
    });
    if (confirmed) {
      await conversations.deleteConversation(conversationId());
    }
  };

  // The pane is view-agnostic; its one view-specific item is the action the
  // report view supplies (ai_views.ts: getSaveStyleAction), so the pane
  // imports nothing from components/products/.
  function saveStyleAction(): (() => Promise<void>) | undefined {
    const v = copilotViewController.current();
    if (v.id !== "editing_report") return undefined;
    return (v.context as EditingReportContext).getSaveStyleAction();
  }

  // The pair the current view shows, for View AI tool output; undefined in a
  // view with no package, where the item is hidden.
  function viewPair(): ResolvedPackageScope | undefined {
    const context = packageViewContext(copilotViewController.current());
    if (context === undefined) return undefined;
    try {
      return context.getScope();
    } catch {
      return undefined;
    }
  }

  const menuItems = (): MenuItem[] => {
    const saveStyle = saveStyleAction();
    const pair = viewPair();
    return [
      {
        label: t3({
          en: "New conversation",
          fr: "Nouvelle conversation",
          pt: "Nova conversa",
        }),
        icon: "plus",
        onClick: () => conversations.createConversation(),
        disabled: isLoading(),
      },
      {
        label: t3({
          en: "Switch conversation",
          fr: "Changer de conversation",
          pt: "Mudar de conversa",
        }),
        icon: "versions",
        onClick: openConversationSelector,
        disabled: isLoading(),
      },
      {
        type: "divider",
      },
      {
        label: t3({
          en: "Prompt library",
          fr: "Bibliothèque de prompts",
          pt: "Biblioteca de prompts",
        }),
        icon: "sparkles",
        onClick: openPromptLibrary,
        disabled: isLoading(),
      },
      {
        label: t3({
          en: "Include file",
          fr: "Inclure un fichier",
          pt: "Incluir ficheiro",
        }),
        icon: "document",
        onClick: p.aiDocs.openSelector,
        disabled: isLoading(),
      },
      ...(saveStyle === undefined ? [] : [
        {
          label: t3({
            en: "Save this report's style…",
            fr: "Enregistrer le style de ce rapport…",
            pt: "Guardar o estilo deste relatório…",
          }),
          icon: "save",
          onClick: saveStyle,
          disabled: isLoading(),
        } satisfies MenuItem,
      ]),
      {
        type: "divider",
      },
      {
        label: t3({
          en: "AI settings",
          fr: "Paramètres IA",
          pt: "Definições da IA",
        }),
        icon: "settings",
        onClick: openSettings,
      },
      {
        label: t3({
          en: "View system prompt",
          fr: "Voir le prompt système",
          pt: "Ver prompt do sistema",
        }),
        icon: "code",
        onClick: () => {
          // What the next message would carry (the view line, its state and
          // instructions, the digest, the date and package blocks), selected
          // as the send would select them, then the instance-level system
          // prompt: "is the brief actually reaching the model?" is answerable
          // by eye.
          const preview = getNextTurnPreview();
          const blocks = preview.sections.length === 0
            ? "(the next message carries no blocks)"
            : preview.sections
              .map((section) => `[${section.kind}]\n${section.text}`)
              .join("\n\n");
          openComponent<AIChatSystemPromptPanelProps, void>({
            element: AIChatSystemPromptPanel,
            props: {
              systemPrompt: [
                {
                  type: "text" as const,
                  text:
                    `# NEXT MESSAGE'S BLOCKS (attached to your next message; not part of the system prompt below)\n\n${blocks}`,
                },
                { type: "text" as const, text: preview.system },
              ],
            },
          });
        },
      },
      ...(pair === undefined ? [] : [
        {
          label: t3({
            en: "View AI tool output",
            fr: "Voir la sortie des outils IA",
            pt: "Ver resultado das ferramentas de IA",
          }),
          icon: "search",
          onClick: () =>
            openComponent<AIDebugPanelProps, void>({
              element: AIDebugPanel,
              props: { scope: pair },
            }),
        } satisfies MenuItem,
      ]),
      {
        type: "divider",
      },
      {
        label: t3({
          en: "Delete conversation",
          fr: "Supprimer la conversation",
          pt: "Eliminar conversa",
        }),
        icon: "trash",
        intent: "danger",
        onClick: handleDeleteConversation,
        disabled: isLoading(),
      },
    ];
  };

  const placeholder = () =>
    t3(PLACEHOLDERS[copilotViewController.current().id]);

  type AiUsageData = {
    tokensUsedToday: number;
    dailyTokenLimit: number | null;
    isUnlimited: boolean;
    tokensUsedThisWeek: number;
    weeklyTokenLimit: number | null;
  };
  const [aiUsage, setAiUsage] = createSignal<AiUsageData | null>(null);

  async function refreshAiUsage() {
    try {
      const res = await serverActions.getAiUsage({});
      if (res.success) setAiUsage(res.data);
    } catch {
      /* ignore */
    }
  }

  onMount(refreshAiUsage);

  createEffect(
    on(
      isLoading,
      (loading) => {
        if (!loading) refreshAiUsage();
      },
      { defer: true },
    ),
  );

  const usagePct = () => {
    const u = aiUsage();
    if (!u || u.isUnlimited || u.dailyTokenLimit === null) return null;
    return Math.min(
      100,
      Math.round((u.tokensUsedToday / u.dailyTokenLimit) * 100),
    );
  };

  const usageTooltip = () => {
    const pct = usagePct();
    if (pct === null) return "";
    const resetAt = new Date();
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);
    resetAt.setUTCHours(0, 0, 0, 0);
    const resetText = resetAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return t3({
      en: `${pct}% of daily AI limit used · Resets ${resetText}`,
      fr:
        `${pct} % de la limite IA journalière utilisée · Réinitialisation ${resetText}`,
      pt: `${pct}% do limite diário de IA utilizado · Reinicia ${resetText}`,
    });
  };

  return (
    <div class="flex h-full w-full flex-col">
      <HeadingBar tonal heading={t3({ en: "AI", fr: "IA", pt: "IA" })}>
        <div class="ui-gap-sm flex items-center">
          <ActionMenuButton items={menuItems} intent="base-300" />
          <Button
            onClick={() => setShowAi(false)}
            intent="base-300"
            iconName="chevronRight"
            ariaLabel={t3({
              en: "Hide AI panel",
              fr: "Masquer le panneau IA",
              pt: "Ocultar o painel de IA",
            })}
          />
        </div>
      </HeadingBar>

      <AIDocumentList
        sent={p.aiDocs.sentDocs()}
        pending={p.aiDocs.pending()}
        onRemovePending={p.aiDocs.removePendingAttachment}
      />

      <div class="flex-1 overflow-hidden">
        <AIChat
          chat={p.chat}
          placeholder={placeholder()}
          onScrollReady={(fn) => (scrollToBottom = fn)}
          customRenderers={customChatRenderers}
        />
      </div>

      <Show when={usagePct() !== null}>
        <div
          class="border-base-200 flex items-center gap-2 border-t px-3 py-1.5"
          title={usageTooltip()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            class="shrink-0 cursor-default"
          >
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              class="text-base-300"
            />
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke={usagePct()! >= 100
                ? "#ef4444"
                : usagePct()! >= 80
                ? "#f59e0b"
                : "currentColor"}
              stroke-width="3"
              stroke-dasharray="43.98"
              stroke-dashoffset={43.98 * (1 - usagePct()! / 100)}
              transform="rotate(-90 10 10)"
              stroke-linecap="round"
              class={usagePct()! >= 80 ? "" : "text-primary"}
            />
          </svg>
          <span class="ui-text-caption">
            {t3({
              en: `${usagePct()}% of daily AI limit used`,
              fr: `${usagePct()} % de la limite IA journalière utilisée`,
              pt: `${usagePct()}% do limite diário de IA utilizado`,
            })}
          </span>
        </div>
      </Show>
    </div>
  );
}
