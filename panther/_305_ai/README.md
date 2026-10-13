# AI Module

Minimal API for building AI applications with Claude.

All AI chat responses use streaming for better UX with real-time text updates,
server tool labels, and live feedback during tool execution.

Architecture and contract reference (turn model, wire format, views, gating,
interactions, approval, navigation): see the repo-root **DOC_AI_CHAT.md**. This
README is the quickstart.

## Chat Applications

```typescript
import { AIChat, AIChatProvider, createSDKClient } from "@timroberton/panther";

const anthropic = createSDKClient({ baseURL: "/api/ai" });

function App() {
  return (
    <AIChatProvider
      config={{
        sdkClient: anthropic,
        modelConfig: {
          model: "claude-sonnet-5",
          max_tokens: 2048,
        },
      }}
    >
      <AIChat />
    </AIChatProvider>
  );
}
```

A pane that calls `updateConfig`, `getConfig` or `sendMessage` itself builds the
instance under the provider and hands it to `AIChat`, so the pane and the chat
run one engine instance (one registry, one settings copy, one queue drain)
instead of two:

```typescript
import {
  AIChat,
  type AIChatInstance,
  createAIChat,
} from "@timroberton/panther";

function ChatPane() {
  const chat: AIChatInstance = createAIChat();
  return (
    <>
      <SettingsButton onSave={(values) => chat.updateConfig(values)} />
      <AIChat chat={chat} />
    </>
  );
}
```

`whenIdle()` resolves once the active conversation has no turn in flight and its
record is written, so a pane that hands the conversation to another tab waits on
it first:

```typescript
async function handOver(chat: AIChatInstance, channel: BroadcastChannel) {
  await chat.whenIdle();
  channel.postMessage({ type: "take-over", id: chat.conversationId() });
}
```

## One-Shot Requests

```typescript
import { callAI, createSDKClient } from "@timroberton/panther";

const anthropic = createSDKClient({
  baseURL: "https://api.anthropic.com/v1",
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const result = await callAI(
  {
    sdkClient: anthropic,
    modelConfig: {
      model: "claude-sonnet-5",
      max_tokens: 1024,
    },
  },
  [{ role: "user", content: "Hello!" }],
);
```

## Custom Tools

```typescript
import { createAITool } from "@timroberton/panther";
import { z } from "zod";

const weatherTool = createAITool({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
  handler: async (input) => `Weather in ${input.location}: Sunny`,

  // Optional - customize labels shown to users:
  successMessage: (input) => `Weather retrieved for ${input.location}`,  // Default: "Tool success: get_weather"
  errorMessage: "Weather service unavailable",  // Default: "Tool feedback: get_weather"
});

// Use in chat
<AIChatProvider config={{ ..., tools: [weatherTool] }}>

// Use in one-shot
const result = await callAI({ ..., tools: [weatherTool] }, messages);
```

**Signaling failure from a handler:** throw `AIToolFailure` for any anticipated
failure — model-correctable input problems (bad input, missing referent,
precondition not met) AND anticipated operational failures (a failed server
call). The model receives `is_error: true` with your message, while the UI shows
a clean failure row without a stack trace. Do NOT return an error-shaped string
— that renders as success and tells the model nothing failed. Any other throw —
including assertion-style "should never happen" checks — is treated as a genuine
bug and keeps the full stack-trace display. Full contract: DOC_AI_CHAT.md
"Failure channel".

```typescript
import { AIToolFailure, createAITool } from "@timroberton/panther";

const tool = createAITool({
  name: "set_temperature",
  description: "Set the thermostat",
  inputSchema: z.object({ zone: z.string(), celsius: z.number() }),
  handler: (input) => {
    if (!zones.has(input.zone)) {
      throw new AIToolFailure(`Unknown zone "${input.zone}"`);
    }
    // ...
    return "Done";
  },
});
```

Malformed tool input (failing the zod schema) is converted to `AIToolFailure`
automatically, with a prettified per-field message.

## Views, Interactions, Approval, Navigation

The engine's organizing concept for "where the user is" and everything built on
it. Full contracts in DOC_AI_CHAT.md; the shapes:

```typescript
import {
  AIChatProvider,
  buildToolCatalog,
  createAITool,
  createAIViewController,
  createNavigationTool,
  defineAIInteractions,
  defineAIViews,
  interaction,
  view,
} from "@timroberton/panther";

// 1. Views: declare once, sync from your navigation, get a per-turn
//    [Current view: …] section + typed tools.
const views = defineAIViews({
  home: view({ label: "Home" }),
  editing_slide: view<{ slideId: string }, SlideEditorContext>({
    label: (p, ctx) => `Editing slide ${p.slideId} of ${ctx.deckName}`,
    params: z.object({ slideId: z.string() }),
    // What the view shows: a view-limited call made after the user moved to
    // another slide is refused until they write again.
    identity: (p, ctx) => ({ deckId: ctx.deckId, slideId: p.slideId }),
    // What changes without a navigation, a line or two on every message.
    state: (_p, ctx) => `Selected elements: ${ctx.selectedIds().join(", ")}`,
  }),
});

// 2. Interactions: "user actions since last message" digest, with echo
//    suppression for the AI's own edits (markAIEdit in mutating handlers).
//    relevantIn scopes an interaction to views, checked when notify records
//    the entry, and the line names that view:
//    `User edited slide s3. (in "Editing slide s3 of Deck A")`.
const interactions = defineAIInteractions({
  edited_slide: interaction<{ slideId: string }>({
    relevantIn: ["editing_slide"],
    coalesce: "count",
    format: (p, n) => n > 1 ? `User edited slide ${p.slideId} (×${n}).` : `User edited slide ${p.slideId}.`,
    echoKey: (p) => `slide:${p.slideId}`,
  }),
});

const vc = createAIViewController(views, {
  fallback: "home",
  interactions,
});
vc.setView("editing_slide", { slideId: "s3" }, editorContext); // from your nav sync sites
vc.notify("edited_slide", { slideId: "s3" });                  // from your UI events

// 3. Gated + view-typed tools: pass the (inert) registry and the handler
//    receives the live view state, narrowed to availableIn. The engine
//    injects it at execution — the tool closes over no controller.
const updateSlide = createAITool({
  name: "update_slide",
  description: "…",
  inputSchema: zUpdateSlide,
  viewRegistry: views,
  availableIn: ["editing_slide"],
  kind: "write",
  handler: (input, view) => view.context.setTempSlide(input), // typed
});

// 4. Approval (confirm-before-apply): declare `approval` instead of
//    `handler` — commit only runs after the user accepts.
const deleteSlide = createAITool({
  name: "delete_slide",
  description: "…",
  inputSchema: zDeleteSlide,
  viewRegistry: views,
  availableIn: ["editing_slide"],
  kind: "write",
  approval: {
    propose: (input, view) => ({
      preview: { title: `Delete slide ${input.slideId}?`, intent: "danger" },
      commit: () => view.context.deleteSlide(input.slideId),
    }),
  },
});

// 5. Built-in navigation tool: the model asks to move, YOUR callback routes;
//    the resulting setView events are attributed to the AI (never reported
//    as "User navigated" in the digest).
const navTool = createNavigationTool({
  viewRegistry: views,
  destinations: ["home", "editing_slide"],
  onAiNavigation: (target) => router.go(target),
});

// 6. Derived tool catalog for your system prompt (omit currentView there —
//    cache rule, see DOC_AI_CHAT.md).
const system = () => `${basePrompt}\n\n${buildToolCatalog(allTools)}`;

// 7. Every message keeps its sections on the wire, so the prompt cache and
//    preserved thinking stay valid and a view's instructions ride once per
//    text. Keep `system` fixed for the whole conversation (per-view text goes
//    in instructions and state).
<AIChatProvider config={{ ..., tools: [updateSlide, deleteSlide, navTool], viewController: vc }}>
```

Run `validateAIChatConfig(config)` in a committed smoke test — it performs all
construction-time validation (duplicate names, availableIn ids, approval policy)
without mounting anything.

A headless template shared with a server (an MCP surface) binds to the view per
call with `bindAIToolToView`: `resolve` receives the view snapshot the engine
read for the call's gate and returns the inner tool for it, and `availableIn`
gates a template that declares none.

```typescript
import { AIToolFailure, bindAIToolToView } from "@timroberton/panther";

const readSlide = bindAIToolToView(
  views,
  readSlideTemplate, // headless: true, no availableIn
  (view) => {
    if (view.id !== "editing_slide") {
      throw new AIToolFailure("Open a slide first.");
    }
    return makeReadSlide(view.params.slideId);
  },
  { availableIn: ["editing_slide"] },
);
```

## Tool Results Display

Tool executions now show their results to users (collapsible):

**Success:**

- Shows success message (e.g., "Weather retrieved")
- Click to expand and see actual result data
- Useful for understanding what tools returned

**Errors:**

- Shows error message
- Click "stack trace" to see full error details (unexpected throws only —
  `AIToolFailure` renders without a stack section)
- Helps debug tool issues

**Custom cards:** a tool's `displayComponent` receives `{ input, view }`, where
`view` is the id and identity of the view the call ran in (`AIViewSnapshot`),
stored with the card; absent on cards stored before the view declared one.

## Built-in Tools

Enable Anthropic's built-in tools with a simple boolean or config object:

```typescript
<AIChatProvider
  config={{
    sdkClient: anthropic,
    modelConfig: { ... },
    builtInTools: {
      webSearch: true,                    // Enable with defaults
      webFetch: { max_uses: 3 },          // Enable with config
      bash: true,                         // Enable bash execution
      textEditor: true,                   // Enable file editing
    },
  }}
>
```

### Web Search Options

```typescript
builtInTools: {
  webSearch: {
    max_uses: 5,                          // Limit searches per request
    allowed_domains: ["example.com"],     // Only search these domains
    blocked_domains: ["spam.com"],        // Never search these domains
    user_location: {
      type: "approximate",
      country: "US",
    },
  },
}
```

### Web Fetch Options

```typescript
builtInTools: {
  webFetch: {
    max_uses: 3,
    allowed_domains: ["docs.example.com"],
    citations: { enabled: true },
    max_content_tokens: 10000,
  },
}
```

## API

**Components:**

- `AIChat` - Complete chat UI
- `AIChatProvider` - Config provider

**Functions:**

- `createSDKClient()` - Configure SDK
- `createAIChat()` - One engine instance; pass it to `AIChat` as `chat` when the
  pane needs it too
- `createAITool()` - Define custom tools; add `viewRegistry` for view-typed
  tools (compile-checked `availableIn`, narrowed handler view state)
- `aiToolFactory(registry)` - Binds one registry once; the recommended form for
  an app with a single view registry
- `bindAIToolToView(registry, template, resolve, options?)` - Resolves a tool's
  inner implementation per call from the view the call runs in
- `callAI()` - One-shot requests
- `view()` / `defineAIViews()` / `createAIViewController()` - View system
- `interaction()` / `defineAIInteractions()` - Interaction log; each action is
  reported against the view it happened in
- `createNavigationTool()` - Built-in "the model asks to move" tool
- `buildToolCatalog()` - Derived tool list for prompt composition
- `validateAIChatConfig()` - Construction-time validation without mounting

**Types:**

- `AIChatConfig`
- `AIChatInstance` - what `createAIChat()` returns; `AIChat`'s `chat` prop; its
  `getNextTurnPreview()` gives the system text and the sections the next message
  would carry, for a prompt panel, and its `whenIdle()` resolves once the active
  conversation has no turn in flight and its record is written
- `AnthropicModelConfig`
- `BuiltInToolsConfig`
- `CallAIConfig`
- `CallAIResult`
- `WebSearchToolConfig`
- `WebFetchToolConfig`
