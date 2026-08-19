import {
  AIChatProvider,
  type AIChatConfig,
  FrameRightResizable,
  buildToolCatalog,
  validateAIChatConfig,
} from "panther";
import { createMemo, onCleanup, onMount, type ParentProps } from "solid-js";
import { DEFAULT_BUILTIN_TOOLS, createCopilotSDKClient } from "./ai_configs/defaults";
import { copilotViewController } from "./ai_views";
import { mountCopilotAuthoringContext } from "./authoring_context";
import { instanceState, productById } from "~/state/instance/t1_store";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import { ConsolidatedChatPane } from "./chat_pane";
import { buildCopilotTools } from "./build_tools";
import { buildSystemPromptForContext } from "./build_system_prompt";
import { showAi, setShowAi } from "~/state/t4_ui";
import { useAIDocuments } from "./ai_documents";

// ONE mount for the whole copilot (D15): it wraps the Products page AND both
// editor overlays, because panther registers tools once per mount and the
// `returnToContext` stack and the tours all rely on ONE controller. ONE
// conversation scope, "copilot".
export function CopilotWrapper(p: ParentProps) {
  const sdkClient = createCopilotSDKClient();

  const aiDocs = useAIDocuments();

  // Binds the copilot's (package, scope) pair and the authoring context behind
  // it, reconciled IN PLACE so the tools built below stay live across a
  // package switch (authoring_context.ts states the invariant).
  mountCopilotAuthoringContext();

  // Tools are registered into panther's ToolRegistry ONCE at chat-pane mount;
  // this array is not re-read on change. Freshness is intentional aliasing:
  // every handler closes over the authoring-context store, which is updated in
  // place via reconcile, and reads the current pair through
  // requireCopilotScope() at call time. (Anything a handler needs at BUILD
  // time — e.g. a completionMessage counting metrics — is frozen at mount;
  // keep such reads out of tool construction.) Build once.
  const tools = buildCopilotTools();

  // CACHE RULE: no currentView here — the no-view catalog is byte-stable;
  // view-grouped ordering would bust the system-prompt cache breakpoint on
  // every navigation.
  const toolCatalog = buildToolCatalog(tools);

  // No mode/view argument: per-view instructions ride each view's instructions
  // (ai_views.ts) as a per-turn ephemeral section instead of being baked into
  // this string. Stable across navigation within one package.
  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(instanceState, toolCatalog),
  );

  // The sanctioned imperative entity-change side-channel (S3): notify on ALL
  // changes; the interaction registry (interactions.ts) filters per view at
  // drain, and echo keys drop the AI's own persisted writes (markAIEdit in the
  // write tools). Two carriers on the instance channel — the per-row
  // `products_upserted` summary and the `last_updated` message for slides.
  onMount(() => {
    // The controller is a module singleton and its log is scope-local data.
    // This mount IS the scope root (one copilot, one conversation scope), and
    // it remounts on a Clerk cross-tab user switch — without the clear, the
    // previous user's retained actions would arrive in the next user's first
    // digest as fake activity.
    copilotViewController.clearInteractionLog();

    const cleanup = addLastUpdatedListener((tableName, ids) => {
      if (tableName === "slides") {
        for (const id of ids) {
          copilotViewController.notify("edited_slide", { slideId: id });
        }
        return;
      }
      for (const id of ids) {
        const product = productById(id);
        // A deletion has no summary to name; `products_deleted` carries no
        // stamp and never reaches this listener.
        if (!product) continue;
        copilotViewController.notify("product_updated", {
          productId: id,
          type: product.type,
          label: product.label,
        });
      }
    });

    onCleanup(cleanup);
  });

  const config: AIChatConfig = {
    sdkClient,
    tools: tools as AIChatConfig["tools"],
    builtInTools: DEFAULT_BUILTIN_TOOLS,
    scope: "copilot",
    system: systemPrompt,
    getDocumentRefs: aiDocs.getDocumentRefs,
    viewController: copilotViewController,
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  return (
    <AIChatProvider config={config}>
      <FrameRightResizable
        minWidth={300}
        startingWidth={600}
        maxWidth={1200}
        isShown={showAi()}
        onToggleShow={() => setShowAi(false)}
        panelChildren={
          <ConsolidatedChatPane
            aiDocs={aiDocs}
            getSystemPrompt={systemPrompt}
          />
        }
      >
        {p.children}
      </FrameRightResizable>
    </AIChatProvider>
  );
}
