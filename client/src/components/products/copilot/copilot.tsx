import {
  type AIChatConfig,
  AIChatProvider,
  type EditorComponentProps,
  FrameRightResizable,
  LoadingIndicator,
  validateAIChatConfig,
} from "panther";
import {
  buildDateBlock,
  type HfaTaxonomyForAI,
  hfaTimePointsForAI,
  isoDateToday,
  type PackageScope,
  packageScopesEqual,
  productScope,
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
  buildCopilotPackageBlock,
  buildSystemPromptForContext,
  ConsolidatedChatPane,
  copilotViewController,
  createCopilotAIToolEnv,
  createCopilotSDKClient,
  DEFAULT_BUILTIN_TOOLS,
  useAIDocuments,
} from "~/components/instance/copilot/mod.ts";
import {
  createResolvedScope,
  instanceState,
  productById,
} from "~/state/instance/t1_store";
import { productLevel } from "~/state/instance/product_access";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { buildCopilotTools } from "./build_tools";
import { setShowAi, showAi } from "~/state/t4_ui";
import type { ProductEditorComponent } from "~/components/products/mod.ts";

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

  // Immutable per (runId, definition hash), so the T2 cache answers instantly
  // on every revisit. It re-reads when the pair or the scope's definition
  // changes, and at no other change to the scopes list.
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();
  const resolvedScope = createResolvedScope(scope);
  createEffect(() => {
    const resolved = resolvedScope();
    setAuthoringContext(undefined);
    if (resolved === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(resolved);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  const binding = createMemo<CopilotBinding | undefined>(() => {
    const s = scope();
    const resolved = resolvedScope();
    const ctx = authoringContext();
    return s !== undefined && resolved !== undefined && ctx !== undefined &&
        ctx.runId === resolved.runId &&
        ctx.scopeToken === resolved.definitionHash
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
        <Show when={binding()} keyed fallback={<LoadingIndicator pad="md" />}>
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
    timePoints: hfaTimePointsForAI(instanceState.hfaTimePoints),
  };

  // Read once, like the rest of the catalogue: a level change reaches the
  // copilot the next time the product is opened.
  const level = productLevel(p.productId);

  const tools = buildCopilotTools(
    env,
    p.scope,
    p.authoringContext,
    hfaTaxonomy,
    level,
  );

  // Instance level: only an instance input (name, country, admin-area
  // labels, structure counts, data sources, ai_context) changes it. The date
  // and the package in view are the consumer blocks below, per-view text
  // rides each view's instructions and state (ai_views.ts), and the tools
  // ride the request, so one conversation keeps one prompt.
  const systemPrompt = createMemo(() =>
    buildSystemPromptForContext(instanceState)
  );

  // The blocks a message carries beside the view's sections: the date, and
  // the package the chat runs against with its scope and grounding. Under
  // append-only turns each rides when its text is new to the conversation,
  // so the date rides once a day and the package block once per package,
  // scope and scope edit, on the message where the change happened.
  const getEphemeralContext = (): string[] => [
    buildDateBlock(isoDateToday()),
    buildCopilotPackageBlock(instanceState, p.scope, p.authoringContext),
  ];

  // The controller is a module singleton whose interaction log outlives a
  // mount, so the chat empties it when it mounts: actions retained from
  // before (the previous product, or on a Clerk cross-tab user switch the
  // previous user) would otherwise ride this chat's first digest as fake
  // activity; with digestAcrossViews, activation already starts each
  // conversation's digest at the log's end. The producers are the editors
  // (interactions.ts).
  onMount(() => {
    copilotViewController.clearInteractionLog();
  });

  const config: AIChatConfig = {
    sdkClient,
    tools: tools as AIChatConfig["tools"],
    builtInTools: DEFAULT_BUILTIN_TOOLS,
    scope: `copilot:${p.productId}`,
    settingsScope: "copilot",
    system: systemPrompt,
    getEphemeralContext,
    getDocumentRefs: aiDocs.getDocumentRefs,
    viewController: copilotViewController,
    appendOnlyTurns: true,
  };

  if (import.meta.env.DEV) {
    validateAIChatConfig(config);
  }

  return (
    <AIChatProvider config={config}>
      <ConsolidatedChatPane
        aiDocs={aiDocs}
        authoringContext={p.authoringContext}
        hfaTaxonomy={hfaTaxonomy}
      />
    </AIChatProvider>
  );
}
