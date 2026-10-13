import {
  type AIChatConfig,
  type AIChatInstance,
  AIChatProvider,
  type AnyAITool,
  Button,
  createAIChat,
  HeadingBar,
  validateAIChatConfig,
} from "panther";
import {
  buildDateBlock,
  COPILOT_APPROVAL_EXEMPT,
  isoDateToday,
  type ResolvedPackageScope,
  type RunAuthoringContext,
  t3,
} from "lib";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { clerk } from "~/state/_infra/clerk";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { setShowAi, SHOW_SENT_CONTEXT } from "~/state/t4_ui";
import { copilotViewController, packageViewContext } from "./ai_views";
import {
  createCopilotSDKClient,
  DEFAULT_BUILTIN_TOOLS,
} from "./ai_configs/mod.ts";
import { useAIDocuments } from "./ai_documents/mod.ts";
import {
  buildCopilotPackageBlock,
  buildSystemPromptForContext,
} from "./build_system_prompt";
import { ConsolidatedChatPane } from "./chat_pane";
import { createTabOwner } from "./tab_owner";

// The one chat beside the shell: the panel the shell's FrameRightResizable
// holds, mounted once the user is approved. Threads and settings are the
// user's (`copilot:<Clerk user id>`), so the current thread follows the user
// through every view and tab; the chat is keyed on that scope, so a user
// switch without a reload stops the previous user's turn and opens the next
// user's threads. One browser tab owns the chat (tab_owner.ts); the others
// show the notice in its place.

// The Clerk user id, live: Clerk reports a cross-tab user switch through its
// listener. Under VITE_BYPASS_AUTH there is no Clerk user (ruling 13).
function createThreadScope(): Accessor<string> {
  const [userId, setUserId] = createSignal(clerk.user?.id);
  onCleanup(clerk.addListener((event) => setUserId(event.user?.id)));
  return () => `copilot:${userId() ?? "dev"}`;
}

type ViewPackage = {
  scope: ResolvedPackageScope;
  authoringContext: RunAuthoringContext;
};

// The package the current view shows with its T2 authoring context, for the
// package block: undefined in a view with no package, or while the context
// loads (a cache hit for any package a product on it has opened). The pair is
// held steady while its ids and definition hash are unchanged, so a rename
// or a slide write does not refetch.
function createViewPackage(): Accessor<ViewPackage | undefined> {
  const pair = createMemo<ResolvedPackageScope | undefined>((prev) => {
    const context = packageViewContext(copilotViewController.current());
    if (context === undefined) return undefined;
    let next: ResolvedPackageScope;
    try {
      next = context.getScope();
    } catch {
      return undefined;
    }
    return prev !== undefined && prev.runId === next.runId &&
        prev.scopeId === next.scopeId &&
        prev.definitionHash === next.definitionHash
      ? prev
      : next;
  });
  const [loaded, setLoaded] = createSignal<ViewPackage | undefined>();
  createEffect(() => {
    const scope = pair();
    setLoaded(undefined);
    if (scope === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(scope);
      if (controller.signal.aborted || !res.success) return;
      setLoaded({ scope, authoringContext: res.data });
    })();
  });
  return loaded;
}

export function CopilotPanel(p: { tools: AnyAITool[] }) {
  const scope = createThreadScope();
  return (
    <Show when={scope()} keyed>
      {(scope) => <CopilotChat scope={scope} tools={p.tools} />}
    </Show>
  );
}

function CopilotChat(p: { scope: string; tools: AnyAITool[] }) {
  const sdkClient = createCopilotSDKClient();
  const aiDocs = useAIDocuments();
  const viewPackage = createViewPackage();

  // Instance level: only an instance input (name, country, admin-area
  // labels, structure counts, data sources, ai_context) changes it. The date
  // and the package in view are the consumer blocks below, per-view text
  // rides each view's instructions and state (ai_views.ts), and the tools
  // ride the request, so one conversation keeps one prompt.
  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(instanceState)
  );

  // The blocks a message carries beside the view's sections: the date, and
  // the package the current view shows with its scope and grounding. Under
  // append-only turns each rides when its text is new to the conversation,
  // so the date rides once a day and the package block once per package,
  // scope and scope edit, on the message where the move happened. A view
  // with no package, or whose context is still loading, sends no package
  // block; every package read still opens with its Source line.
  const getEphemeralContext = (): string[] => {
    const pkg = viewPackage();
    return pkg === undefined ? [buildDateBlock(isoDateToday())] : [
      buildDateBlock(isoDateToday()),
      buildCopilotPackageBlock(
        instanceState,
        pkg.scope,
        pkg.authoringContext,
      ),
    ];
  };

  const config: AIChatConfig = {
    sdkClient,
    tools: p.tools,
    builtInTools: DEFAULT_BUILTIN_TOOLS,
    // The settings (model, max tokens) default to the thread scope: both are
    // the user's.
    scope: p.scope,
    system: systemPrompt,
    getEphemeralContext,
    showSentContext: SHOW_SENT_CONTEXT,
    getDocumentRefs: aiDocs.getDocumentRefs,
    viewController: copilotViewController,
    // Every write asks before it applies unless the catalogue exempts it:
    // the direct editor writes to what the user is looking at. delete_slides
    // and the staged report edits declare their own approval.
    approvalPolicy: {
      requireForKind: "write",
      requireKind: true,
      exempt: COPILOT_APPROVAL_EXEMPT,
    },
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  // The instance the owner mounted, kept after it unmounts: the hand-over
  // and the panel's own cleanup stop its turn and await its save before the
  // lock is released, and Solid cleans the chat before this panel.
  let live: AIChatInstance | undefined;
  const ownership = createTabOwner(p.scope, async () => {
    live?.stopGeneration();
    await live?.whenIdle();
  });

  return (
    <Show
      when={ownership.owner()}
      fallback={<OtherTabNotice onUseHere={ownership.takeOver} />}
    >
      <AIChatProvider config={config}>
        <OwnedChat aiDocs={aiDocs} onChat={(chat) => (live = chat)} />
      </AIChatProvider>
    </Show>
  );
}

// Inside the provider: one engine instance, shared by the pane and the chat
// it mounts (E2), created when the lock is granted.
function OwnedChat(p: {
  aiDocs: ReturnType<typeof useAIDocuments>;
  onChat: (chat: AIChatInstance) => void;
}) {
  const chat = createAIChat();
  p.onChat(chat);

  // The controller is a module singleton whose interaction log outlives a
  // mount. The manager activates a conversation on every mount, which starts
  // its digest at the log's end, so actions retained from before (the
  // previous user's on a cross-tab user switch, this tab's while another tab
  // owned the chat) never ride this chat's digest. The clear drops them, and
  // with them the echo marks and any open AI-navigation window the previous
  // user's chat left, which would otherwise drop or misattribute this user's
  // first actions within their TTLs. The producers are the editors
  // (interactions.ts).
  onMount(() => {
    copilotViewController.clearInteractionLog();
  });

  return <ConsolidatedChatPane chat={chat} aiDocs={p.aiDocs} />;
}

function OtherTabNotice(p: { onUseHere: () => void }) {
  return (
    <div class="flex h-full w-full flex-col">
      <HeadingBar tonal heading={t3({ en: "AI", fr: "IA", pt: "IA" })}>
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
      </HeadingBar>
      <div class="ui-pad ui-gap flex flex-1 flex-col items-center justify-center text-center">
        <div>
          {t3({
            en: "The AI chat is open in another tab.",
            fr: "Le chat IA est ouvert dans un autre onglet.",
            pt: "O chat de IA está aberto noutro separador.",
          })}
        </div>
        <Button intent="primary" onClick={p.onUseHere}>
          {t3({ en: "Use it here", fr: "L'utiliser ici", pt: "Usar aqui" })}
        </Button>
      </div>
    </div>
  );
}
