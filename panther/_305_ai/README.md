# AI Module

Minimal API for building AI applications with Claude.

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
});

// Use in chat
<AIChatProvider config={{ ..., tools: [weatherTool] }}>

// Use in one-shot
const result = await callAI({ ..., tools: [weatherTool] }, messages);
```

## Built-in Tools

```typescript
import { createBashTool, createWebSearchTool } from "@timroberton/panther";

// Web search
createWebSearchTool({ max_uses: 3 });

// Bash execution (use with caution)
createBashTool();

// Text editing
createTextEditorTool();
```

## API

**Components:**

- `AIChat` - Complete chat UI
- `AIChatProvider` - Config provider

**Functions:**

- `createSDKClient()` - Configure SDK
- `createAITool()` - Define tools
- `createWebSearchTool()` - Web search
- `createBashTool()` - Bash commands
- `createTextEditorTool()` - File editing
- `callAI()` - One-shot requests

**Types:**

- `AIChatConfig`
- `AnthropicModelConfig`
- `CallAIConfig`
- `CallAIResult`
- `WebSearchToolConfig`
