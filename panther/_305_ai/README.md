# _305_ai - AI Chat Assistant Module

Drop-in AI assistant/chatbot component for SolidJS applications with robust
Anthropic Messages API integration, tool support, and customizable rendering.

> ⚠️ **IMPORTANT**: Model names and pricing in this documentation may be
> outdated. Always verify current models and pricing at
> [anthropic.com/pricing](https://www.anthropic.com/pricing) and
> [docs.anthropic.com](https://docs.anthropic.com/) before deploying to
> production. The module supports any Anthropic model ID as a string.

## Features

- **Streaming Support**: Real-time text generation with SSE ✨
- **Prompt Caching**: 90% cost savings on repeated contexts ✨
- **Token Tracking**: Detailed usage statistics and cost estimation ✨
- **Full Model Config**: All Anthropic parameters exposed ✨
- **Layered API**: Low-level hooks for custom UIs + high-level component for
  quick setup
- **Tool System**: Define tools with handlers and custom result renderers
- **Server Proxy Pattern**: Call your backend endpoint (not direct Anthropic)
- **Customizable Rendering**: Override any display component (text, errors, tool
  results)
- **Smart Auto-scroll**: Tracks user scroll position, auto-scrolls when
  appropriate
- **Conversation Persistence**: Messages persist across component remounts
- **Type-safe**: Full TypeScript support throughout

> 📘 **Anthropic-Specific Features**: See
> [ANTHROPIC_FEATURES.md](./ANTHROPIC_FEATURES.md) for comprehensive guide on
> streaming, caching, token tracking, and cost optimization.

## Quick Start

### High-Level Usage (Recommended)

```tsx
import { AIChat, AIChatProvider } from "@timroberton/panther";

const tools = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
    },
    handler: async (input: { location: string }) => {
      const data = await fetch(`/api/weather?loc=${input.location}`);
      return JSON.stringify(data);
    },
  },
];

function App() {
  return (
    <AIChatProvider
      config={{
        apiConfig: {
          endpoint: "/api/ai/chat",
        },
        modelConfig: {
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
        },
        enableStreaming: true,
        tools,
        conversationId: "user-123",
      }}
    >
      <AIChat
        showUsage={true}
        showCost={true}
        model="claude-3-5-sonnet-20241022"
      />
    </AIChatProvider>
  );
}
```

### Customizing Message Styling

Customize the appearance of user and assistant messages with Tailwind classes:

```tsx
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai/chat" },
    modelConfig: {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
    },
    // Custom message styling
    userMessageClass: "bg-green-100 text-green-900",
    assistantMessageClass: "bg-purple-100 text-purple-900",
  }}
>
  <AIChat />
</AIChatProvider>;
```

**Default classes:**

- User messages: `bg-blue-100 text-blue-900`
- Assistant messages: `bg-primary/10 text-primary`

You can use any Tailwind classes including:

- Semantic colors: `bg-primary/10 text-primary`
- Standard colors: `bg-blue-100 text-blue-900`
- Arbitrary values: `bg-[#f0f0f0] text-[#333]`

### Low-Level Usage (Custom UI)

```tsx
import {
  MessageInput,
  MessageList,
  UsageDisplay,
  useAIChat,
  useAITools,
} from "@timroberton/panther";

function CustomChatUI() {
  const {
    displayItems,
    isLoading,
    isStreaming,
    currentStreamingText,
    usage,
    sendMessage,
    clearConversation,
  } = useAIChat({
    apiConfig: { endpoint: "/api/ai/chat" },
    modelConfig: {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
    },
    enableStreaming: true,
    conversationId: "user-123",
  });

  const { registerTool } = useAITools();

  onMount(() => {
    tools.forEach(registerTool);
  });

  const [input, setInput] = createSignal("");

  const handleSubmit = () => {
    sendMessage(input());
    setInput("");
  };

  return (
    <div class="chat-container">
      <button onClick={clearConversation}>Clear</button>
      <MessageList
        displayItems={displayItems()}
        isLoading={isLoading()}
        isStreaming={isStreaming()}
        currentStreamingText={currentStreamingText()}
      />
      <UsageDisplay
        usage={usage()}
        model="claude-3-5-sonnet-20241022"
        showCost={true}
      />
      <MessageInput
        value={input()}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={isLoading()}
      />
    </div>
  );
}
```

## Anthropic-Specific Features

### Streaming Responses

Enable real-time text generation for better UX:

```tsx
<AIChatProvider
  config={{
    enableStreaming: true, // Enable streaming
    modelConfig: { model: "claude-3-5-sonnet-20241022", max_tokens: 4096 },
    apiConfig: { endpoint: "/api/ai" },
  }}
>
  <AIChat />
</AIChatProvider>;
```

Text appears character-by-character with a cursor animation. No configuration
needed beyond `enableStreaming: true`.

### Prompt Caching (90% Cost Savings)

Cache large contexts to dramatically reduce costs:

```tsx
<AIChatProvider
  config={{
    system: [
      {
        type: "text",
        text: largeDocumentation, // This gets cached
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "You are a helpful assistant.",
      },
    ],
    modelConfig: { model: "claude-3-5-sonnet-20241022", max_tokens: 4096 },
    apiConfig: { endpoint: "/api/ai" },
  }}
>
  <AIChat />
</AIChatProvider>;
```

First request pays to write cache, subsequent requests read at 90% discount.
Cache TTL ~5 minutes.

### Token Tracking & Cost Display

Show usage statistics and cost estimates:

```tsx
<AIChat
  showUsage={true}
  showCost={true}
  model="claude-3-5-sonnet-20241022"
/>;
```

Displays compact usage bar: `2.5K in / 1.2K out • $0.0123`

Programmatic access:

```tsx
const { usage, usageHistory } = useAIChat();

// Current message
console.log(usage().input_tokens);
console.log(usage().output_tokens);
console.log(usage().cache_creation_input_tokens);
console.log(usage().cache_read_input_tokens);

// All messages
const totalUsage = aggregateUsage(usageHistory());
const cost = calculateCost(totalUsage, "claude-3-5-sonnet-20241022");
console.log(formatCost(cost.totalCost)); // "$0.1234"
```

### Full Model Configuration

All Anthropic parameters exposed:

```tsx
modelConfig: {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 4096,
  temperature: 0.7,        // 0-1, creativity control
  top_p: 0.9,              // Nucleus sampling
  top_k: 40,               // Top-k sampling
  stop_sequences: ["\n"],  // Stop generation early
  metadata: {
    user_id: "user-123",   // Track per-user usage
  },
}
```

Available models:

- `claude-3-5-sonnet-20241022` (recommended - best balance)
- `claude-3-opus-20240229` (most capable)
- `claude-3-sonnet-20240229` (previous sonnet)
- `claude-3-haiku-20240307` (fastest, cheapest)

> 📘 **Detailed Documentation**: See
> [ANTHROPIC_FEATURES.md](./ANTHROPIC_FEATURES.md) for comprehensive guide on
> all Anthropic features including pricing, optimization tips, and server
> implementation.

## API Configuration

### Server Proxy Endpoint

Your server must accept this payload:

```typescript
{
  // Model configuration
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 4096,
  temperature?: 0.7,
  top_p?: 0.9,
  top_k?: 40,
  stop_sequences?: string[],
  metadata?: { user_id?: string },

  // Messages and context
  messages: MessageParam[],
  system?: string | Array<{ type: "text"; text: string; cache_control?: CacheControl }>,
  tools?: ToolDefinition[],

  // Streaming
  stream?: boolean,

  // Custom fields
  conversationId?: string,
}
```

For **blocking** responses, return:

```typescript
{
  content: ContentBlock[],
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use",
  id?: string,
  model?: string,
  usage?: {
    input_tokens: number,
    output_tokens: number,
    cache_creation_input_tokens?: number,
    cache_read_input_tokens?: number,
  }
}
```

For **streaming** responses, return SSE format:

```http
Content-Type: text/event-stream

data: {"type":"message_start","message":{...}}

data: {"type":"content_block_start","index":0,"content_block":{...}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

data: {"type":"content_block_stop","index":0}

data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{...}}

data: {"type":"message_stop"}

data: [DONE]
```

### Custom Request/Response Transforms

```tsx
const apiConfig = {
  endpoint: "/api/ai/chat",

  // Add auth headers, modify payload
  transformRequest: async (payload) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      ...payload,
      customField: "value",
    }),
  }),

  // Extract data from your API response format
  transformResponse: async (response) => {
    const data = await response.json();
    return data.anthropicResponse; // Your nested response
  },
};
```

### Netlify Functions Setup

For Netlify deployments, use the provided serverless function template:

#### Quick Setup

1. **Install dependencies:**
   ```bash
   npm install --save-dev @netlify/functions netlify-cli
   ```

2. **Create `netlify.toml`:**
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

3. **Update `package.json`:**
   ```json
   {
     "scripts": {
       "dev": "netlify dev",
       "dev-vite": "vite",
       "build": "vite build"
     }
   }
   ```

4. **Create `.env` with your API key:**
   ```bash
   ANTHROPIC_API_KEY=your_api_key_here
   ```

5. **Copy the template function:**

   See
   [`_examples/netlify_function_template.ts`](./_examples/netlify_function_template.ts)
   for a complete, production-ready Netlify function with:
   - Streaming and non-streaming support
   - Prompt caching headers
   - Error handling
   - Customization points for auth, logging, rate limiting, etc.

   Copy to `netlify/functions/ai.ts` in your project and customize as needed.

6. **Configure your app:**
   ```tsx
   <AIChatProvider
     config={{
       apiConfig: {
         endpoint: "/api/ai", // Netlify function automatically available here
       },
       // ... rest of config
     }}
   />;
   ```

#### Local Development

Run `npm run dev` to start Netlify Dev, which:

- Runs your frontend dev server (Vite)
- Runs serverless functions locally at `/api/*`
- Loads environment variables from `.env`

The AI chat will work exactly the same in development and production.

## Tool System

### Basic Tool Definition

```tsx
const tool = {
  name: "search_documents",
  description: "Search through user documents",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results" },
    },
    required: ["query"],
  },
  handler: async (input: { query: string; limit?: number }) => {
    const results = await searchAPI(input.query, input.limit);
    return JSON.stringify(results);
  },
};
```

### Tool with Display Component

For tools that need to show something to the user (visualizations, previews,
etc.):

```tsx
const ChartDisplay: Component<{ input: { chartId: string } }> = (props) => {
  return (
    <div class="chart-container">
      <ChartRenderer chartId={props.input.chartId} />
    </div>
  );
};

const tool = {
  name: "show_chart",
  description: "Display a chart to the user",
  input_schema: {
    type: "object",
    properties: {
      chartId: { type: "string" },
    },
    required: ["chartId"],
  },
  handler: async (input: { chartId: string }) => {
    return "Chart displayed to user"; // Confirmation to AI
  },
  displayComponent: ChartDisplay, // Renders when tool is called
  inProgressLabel: "Loading chart...", // Or function: (input) => `Loading ${input.chartId}...`
};
```

**Key points:**

- `displayComponent` receives the tool's `input` parameter
- `handler` still executes (for logging, side effects, etc.)
- `handler` return value goes to AI as confirmation, not displayed to user
- Only tools with `displayComponent` render UI to the user

### Data-Fetching Tools (No Display)

Tools that return data but shouldn't show anything to the user:

```tsx
const tool = {
  name: "search_documents",
  description: "Search documents and return results as JSON",
  input_schema: {/* ... */},
  handler: async (input) => {
    const results = await searchAPI(input.query);
    return JSON.stringify(results); // Goes to AI for processing
  },
  // No displayComponent = won't display anything to user
};
```

## Custom Display Rendering

### Override Built-in Renderers

```tsx
const CustomTextRenderer: Component<{ item: DisplayItem }> = (props) => {
  return (
    <div class={`message ${props.item.role}`}>
      <Markdown text={props.item.text} />
    </div>
  );
};

<AIChat
  customRenderers={{
    text: CustomTextRenderer,
    toolError: CustomErrorDisplay,
    toolLoading: CustomLoadingSpinner,
  }}
/>;
```

### Display Components in Tools

Display components are defined directly on tools for clean co-location:

```tsx
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    modelConfig: { model: "claude-sonnet-4.5-20250929", max_tokens: 4096 },
    tools: [
      {
        name: "show_visualization",
        description: "Display a visualization to the user",
        input_schema: {
          type: "object",
          properties: {
            ids: { type: "array", items: { type: "string" } },
          },
          required: ["ids"],
        },
        handler: async (input) => {
          return "Visualizations displayed";
        },
        displayComponent: (props) => (
          <div class="viz-grid">
            <For each={props.input.ids}>
              {(id) => <VisualizationPreview id={id} />}
            </For>
          </div>
        ),
      },
      {
        name: "create_slide",
        handler: async (input) => "Slide created",
        displayComponent: (props) => <SlidePreview data={props.input} />,
      },
    ],
  }}
>
  <AIChat />
</AIChatProvider>;
```

## Conversation Management

### Multiple Conversations

```tsx
// Conversation 1
<AIChatProvider config={{ conversationId: "project-123", ... }}>
  <AIChat />
</AIChatProvider>

// Conversation 2 (separate state)
<AIChatProvider config={{ conversationId: "project-456", ... }}>
  <AIChat />
</AIChatProvider>
```

### Clear Conversation

```tsx
const { clearConversation } = useAIChat();

<button onClick={clearConversation}>Clear Chat</button>;
```

### Programmatic Control

```tsx
import {
  clearConversationStore,
  deleteConversationStore,
  getConversationState,
} from "@timroberton/panther";

// Get current state
const state = getConversationState("conversation-id");
console.log(state.messages, state.displayItems);

// Clear messages but keep store
clearConversationStore("conversation-id");

// Remove store entirely
deleteConversationStore("conversation-id");
```

## Component Customization

### AIChat Props

```tsx
<AIChat
  // Display customization
  customRenderers={displayRegistry} // Override renderers
  fallbackContent={WelcomeMessage} // Show when no messages
  headerContent={<CustomHeader />} // Header above messages
  footerContent={<CustomFooter />} // Footer below messages
  // Input customization
  placeholder="Ask me anything..." // Input placeholder
  submitLabel="Send" // Submit button text
  inputHeight="120px" // Input textarea height
  // Styling
  containerClass="custom-container" // Container classes
  messagesClass="custom-messages" // Messages area classes
  inputClass="custom-input" // Input area classes
  // Behavior
  autoScroll={true} // Enable auto-scroll (default: true)
  // Anthropic features ✨
  showUsage={true} // Show token counts
  showCost={true} // Show cost estimate
  model="claude-3-5-sonnet-20241022" // For cost calculation
/>;
```

### Custom Fallback Content

```tsx
const WelcomeMessage: Component = () => (
  <div class="welcome">
    <h2>Welcome to AI Assistant</h2>
    <ul>
      <li>Ask about your data</li>
      <li>Generate reports</li>
      <li>Analyze trends</li>
    </ul>
  </div>
);

<AIChat fallbackContent={WelcomeMessage} />;
```

## Styling

The module uses Tailwind CSS utility classes and Panther's CSS variables:

- `ui-pad`, `ui-pad-sm` - Padding
- `ui-gap`, `ui-gap-sm` - Gap spacing
- `bg-primary`, `text-primary` - Theme colors
- `bg-base-100`, `bg-base-200` - Background colors

### Custom Styling

Override with your own classes or wrap with styled containers:

```tsx
<div class="my-custom-chat-wrapper">
  <AIChat
    containerClass="h-screen flex flex-col"
    messagesClass="flex-1 overflow-auto p-4 bg-gray-50"
    inputClass="border-t p-4 bg-white"
  />
</div>;
```

## Architecture

### Message Flow

1. User types message → `sendMessage()` called
2. Message added to conversation store
3. API request sent to your server endpoint
4. Server proxies to Anthropic Messages API
5. Response processed:
   - Text content → Displayed as message
   - Tool use → Execute tool handlers
   - Tool results → Send back to API
6. Display items updated, UI re-renders

### Display Items vs Messages

- **Messages**: Raw API format (MessageParam[]), stored for API calls
- **Display Items**: UI-friendly format (DisplayItem[]), used for rendering

This separation allows:

- Tools to run without cluttering chat UI
- Custom display logic without modifying message history
- Efficient rendering of complex tool results

### Tool Execution

1. AI response includes `tool_use` content blocks
2. Show "in progress" indicators
3. Execute all tool handlers in parallel
4. Remove "in progress" indicators
5. Show errors if any tools failed
6. Send tool results back to API
7. Recursively process next response

## Breaking Changes

### v2.0 - Anthropic-First Update

**`modelConfig` is now required** in `AIChatConfig`:

```tsx
// ❌ Before (no longer works)
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    tools,
  }}
>
  <AIChat />
</AIChatProvider>

// ✅ After (required)
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    modelConfig: {  // Now required
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
    },
    tools,
  }}
>
  <AIChat />
</AIChatProvider>
```

**Migration Steps:**

1. Add `modelConfig` to all `AIChatConfig` objects
2. Choose a model (recommend `claude-3-5-sonnet-20241022`)
3. Set `max_tokens` (typically `4096` or `8192`)
4. Optionally add `enableStreaming: true`
5. Update server to handle new payload format (see API Configuration)

## TypeScript Types

### Core Types

```typescript
type MessageParam = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  cache_control?: CacheControl; // For prompt caching
};

type AnthropicModelConfig = {
  model: AnthropicModel;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: { user_id?: string };
};

type AITool<TInput = unknown, TOutput = string> = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: TInput) => Promise<TOutput>;
  displayComponent?: Component<{ input: TInput }>;
  inProgressLabel?: string | ((input: TInput) => string);
};

type DisplayItem =
  | { type: "text"; role: "user" | "assistant"; text: string }
  | {
    type: "tool_in_progress";
    toolName: string;
    toolInput: unknown;
    label?: string;
  }
  | { type: "tool_error"; toolName: string; errorMessage: string }
  | { type: "tool_display"; toolName: string; input: unknown };

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number; // Tokens written to cache
  cache_read_input_tokens?: number; // Tokens read from cache
};

type APIConfig = {
  endpoint: string | ((conversationId?: string) => string);
  transformRequest?: (payload: MessagePayload) => Promise<RequestInit>;
  transformResponse?: (response: Response) => Promise<AnthropicResponse>;
  transformStreamResponse?: (response: Response) => ReadableStream<StreamEvent>;
};
```

## Examples

### Complete Example: Document Assistant

```tsx
import { AIChat, AIChatProvider, type AITool } from "@timroberton/panther";

const DocumentPreview: Component<{ result: Document; input: { id: string } }> =
  (props) => (
    <div class="doc-preview">
      <h3>{props.result.title}</h3>
      <p>{props.result.excerpt}</p>
    </div>
  );

const tools: AITool[] = [
  {
    name: "search_documents",
    description: "Search user's documents",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    handler: async (input: { query: string }) => {
      const results = await fetch(`/api/search?q=${input.query}`).then((r) =>
        r.json()
      );
      return JSON.stringify(results);
    },
  },
  {
    name: "show_document",
    description: "Display a document to the user",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
    handler: async (input: { id: string }) => {
      return "Document displayed";
    },
    displayComponent: DocumentPreview,
    inProgressLabel: (input) => `Loading document ${input.id}...`,
  },
];

function App() {
  return (
    <AIChatProvider
      config={{
        apiConfig: {
          endpoint: "/api/ai/chat",
          transformRequest: async (payload) => ({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify(payload),
          }),
        },
        tools,
        conversationId: "user-session-123",
      }}
    >
      <div class="h-screen">
        <AIChat
          placeholder="Ask about your documents..."
          fallbackContent={() => (
            <div>
              <h2>Document Assistant</h2>
              <p>I can help you search and analyze your documents.</p>
            </div>
          )}
        />
      </div>
    </AIChatProvider>
  );
}
```

## Troubleshooting

### Tools not executing

- Check tool handler returns a Promise
- Verify tool name matches between definition and AI response
- Check console for handler errors

### Messages not persisting

- Ensure `conversationId` is stable (not regenerating on each render)
- Check if store is being cleared unexpectedly

### Auto-scroll not working

- Verify container has `overflow-y-auto` or similar
- Check `autoScroll` prop is not set to `false`
- User scrolling up will disable auto-scroll (by design)

### API errors

- Check `transformRequest` returns valid RequestInit
- Verify server endpoint returns correct response format
- Use `transformResponse` to adapt non-standard API formats

## Dependencies

- `solid-js` (peer dependency)
- Tailwind CSS v4 with Panther theme variables

## License

Part of the `timroberton-panther` library.
