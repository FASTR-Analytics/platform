# AI Module

Minimal API for building AI applications with Claude.

All AI chat responses use streaming for better UX with real-time text updates,
server tool labels, and live feedback during tool execution.

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
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 2048,
        },
      }}
    >
      <AIChat />
    </AIChatProvider>
  );
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
      model: "claude-sonnet-4-5-20250929",
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
  errorMessage: "Weather service unavailable",  // Default: "Tool error: get_weather"
});

// Use in chat
<AIChatProvider config={{ ..., tools: [weatherTool] }}>

// Use in one-shot
const result = await callAI({ ..., tools: [weatherTool] }, messages);
```

## Tool Results Display

Tool executions now show their results to users (collapsible):

**Success:**

- Shows success message (e.g., "Weather retrieved")
- Click to expand and see actual result data
- Useful for understanding what tools returned

**Errors:**

- Shows error message
- Click "stack trace" to see full error details
- Helps debug tool issues

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
- `createAITool()` - Define custom tools
- `callAI()` - One-shot requests

**Types:**

- `AIChatConfig`
- `AnthropicModelConfig`
- `BuiltInToolsConfig`
- `CallAIConfig`
- `CallAIResult`
- `WebSearchToolConfig`
- `WebFetchToolConfig`
