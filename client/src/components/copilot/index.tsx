import {
  AIChatProvider,
  type AIChatConfig,
  type EditorComponentProps,
  FrameRightResizable,
  LoadingIndicator,
  buildToolCatalog,
  validateAIChatConfig,
} from "panther";
import {
  packageScopesEqual,
  productScope,
  type HfaTaxonomyForAI,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  DEFAULT_BUILTIN_TOOLS,
  createCopilotSDKClient,
} from "./ai_configs/defaults";
import { copilotViewController } from "./ai_views";
import { instanceState, productById } from "~/state/instance/t1_store";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { ConsolidatedChatPane } from "./chat_pane";
import { buildCopilotTools } from "./build_tools";
import { buildSystemPromptForContext } from "./build_system_prompt";
import { createCopilotAIToolEnv } from "./ai_tools/client_env";
import { showAi, setShowAi } from "~/state/t4_ui";
import { useAIDocuments } from "./ai_documents";
import type { ProductEditorComponent } from "~/components/products/product_types";

type HostProps = EditorComponentProps<
  { productId: string; editor: ProductEditorComponent },
  undefined
>;

type CopilotBinding = {
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
};

// The copilot host (PLAN_PRODUCTS_RESTRUCTURE D15): the product opener renders
// it around whichever editor it opens, so there is one mount site and one
// copilot per open product. The editor itself is never remounted from here
// (it handles a reattach live, D16); the chat beside it is keyed on the
// product's (package, scope) pair and remounts when that pair changes, which
// is what keeps the env, the tools and the system prompt fixed for the life
// of one chat instance.
export function ProductCopilotHost(p: HostProps) {
  // Referentially stable while the pair is unchanged, so a rename or a slide
  // write (which bump the T1 row) does not remount the chat.
  const scope = createMemo<PackageScope | undefined>((prev) => {
    const row = productById(p.productId);
    if (row === undefined) return undefined;
    const next = productScope(row);
    return prev !== undefined && packageScopesEqual(prev, next) ? prev : next;
  });

  // Immutable per runId, so the T2 cache answers instantly on every revisit.
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();
  createEffect(() => {
    const runId = scope()?.runId;
    setAuthoringContext(undefined);
    if (runId === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(runId);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  const binding = createMemo<CopilotBinding | undefined>(() => {
    const s = scope();
    const ctx = authoringContext();
    return s !== undefined && ctx !== undefined && ctx.runId === s.runId
      ? { scope: s, authoringContext: ctx }
      : undefined;
  });

  return (
    <FrameRightResizable
      minWidth={300}
      startingWidth={600}
      maxWidth={1200}
      isShown={showAi()}
      onToggleShow={() => setShowAi(false)}
      panelChildren={
        <Show when={binding()} keyed fallback={<LoadingIndicator />}>
          {(bound) => (
            <ProductCopilot
              productId={p.productId}
              scope={bound.scope}
              authoringContext={bound.authoringContext}
            />
          )}
        </Show>
      }
    >
      <Dynamic component={p.editor} productId={p.productId} close={p.close} />
    </FrameRightResizable>
  );
}

// One chat instance over one fixed (package, scope) pair. Conversations are
// per product (scope `copilot:<productId>`) while the persisted chat settings
// (model, max tokens) are shared under `settingsScope: "copilot"`.
function ProductCopilot(p: {
  productId: string;
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
}) {
  const sdkClient = createCopilotSDKClient();
  const aiDocs = useAIDocuments();
  const env = createCopilotAIToolEnv(p.scope);

  // HFA survey rounds are instance-wide T1, not part of the per-run payload
  // (`RunAuthoringContext`'s seam). Read once here: the tools array below is
  // registered once at chat construction and is not re-read, so a round
  // imported mid-session reaches the copilot on its next mount.
  const hfaTaxonomy: HfaTaxonomyForAI = {
    ...p.authoringContext.hfaTaxonomy,
    timePoints: instanceState.hfaTimePoints.map((tp) => ({
      id: tp.label,
      label: tp.label,
      periodId: tp.periodId,
    })),
  };

  const tools = buildCopilotTools(
    env,
    p.scope,
    p.authoringContext,
    hfaTaxonomy,
  );

  // CACHE RULE: no currentView here: the no-view catalog is byte-stable;
  // view-grouped ordering would bust the system-prompt cache breakpoint on
  // every navigation.
  const toolCatalog = buildToolCatalog(tools);

  // Per-view instructions ride each view's instructions (ai_views.ts) as a
  // per-turn ephemeral section, so this string only changes with the instance
  // AI context.
  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(
      instanceState,
      p.scope,
      p.authoringContext,
      toolCatalog,
    ),
  );

  // The sanctioned imperative entity-change side-channel (S3): notify on
  // changes to the OPEN product; the interaction registry (interactions.ts)
  // filters per view at drain, and echo keys drop the AI's own persisted
  // writes (markAIEdit in the write tools). Two carriers on the instance
  // channel: the per-row `products_upserted` summary and the `last_updated`
  // message for slides.
  onMount(() => {
    // The controller is a module singleton and its log is scope-local data.
    // Each mount is a new conversation scope; without the clear, the previous
    // product's retained actions would arrive in this product's first digest
    // as fake activity.
    copilotViewController.clearInteractionLog();

    const cleanup = addLastUpdatedListener((tableName, ids) => {
      if (tableName === "slides") {
        for (const id of ids) {
          copilotViewController.notify("edited_slide", { slideId: id });
        }
        return;
      }
      if (!ids.includes(p.productId)) return;
      const product = productById(p.productId);
      // A deletion has no summary to name; `products_deleted` carries no
      // stamp and never reaches this listener.
      if (!product) return;
      copilotViewController.notify("product_updated", {
        productId: p.productId,
        type: product.type,
        label: product.label,
      });
    });

    onCleanup(cleanup);
  });

  const config: AIChatConfig = {
    sdkClient,
    tools: tools as AIChatConfig["tools"],
    builtInTools: DEFAULT_BUILTIN_TOOLS,
    scope: `copilot:${p.productId}`,
    settingsScope: "copilot",
    system: systemPrompt,
    getDocumentRefs: aiDocs.getDocumentRefs,
    viewController: copilotViewController,
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  return (
    <AIChatProvider config={config}>
      <ConsolidatedChatPane
        aiDocs={aiDocs}
        getSystemPrompt={systemPrompt}
        authoringContext={p.authoringContext}
        hfaTaxonomy={hfaTaxonomy}
      />
    </AIChatProvider>
  );
}
