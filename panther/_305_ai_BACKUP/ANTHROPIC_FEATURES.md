# Anthropic-Specific Features

This document covers all Anthropic Messages API specific features supported by
the `_305_ai` module.

> ⚠️ **IMPORTANT - Verify Current Information**: This documentation was
> generated based on information available in early 2025. Anthropic frequently
> updates models, pricing, and features. **Always verify current information
> at:**
>
> - **Pricing**: [anthropic.com/pricing](https://www.anthropic.com/pricing)
> - **Models**: [docs.anthropic.com](https://docs.anthropic.com/)
> - **API Docs**: [docs.anthropic.com/en/api](https://docs.anthropic.com/en/api)
>
> The module accepts any model ID as a string, so it will work with future
> models. Just update the pricing in `cost_utils.ts` if you need accurate cost
> estimation.

## Overview

The module is designed to maximize Anthropic's API capabilities:

- ✅ **Streaming responses** - Real-time text generation with SSE
- ✅ **Prompt caching** - Reduce costs with ephemeral caching
- ✅ **Full model configuration** - All Anthropic parameters exposed
- ✅ **Token tracking** - Detailed usage statistics including cache metrics
- ✅ **Cost estimation** - Built-in cost calculator for all models

## Streaming Support

### Enable Streaming

```tsx
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    modelConfig: {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
    },
    enableStreaming: true, // Enable streaming
  }}
>
  <AIChat />
</AIChatProvider>;
```

### How It Works

1. Client makes streaming request with `stream: true`
2. Server proxies to Anthropic with SSE
3. Component receives `StreamEvent` objects in real-time
4. Text accumulates character-by-character
5. Shows cursor animation while streaming

### Stream Events

The module handles these Anthropic stream event types:

- `message_start` - Initial message metadata
- `content_block_start` - New content block begins
- `content_block_delta` - Incremental text/JSON
- `content_block_stop` - Block complete
- `message_delta` - Final message metadata
- `message_stop` - Stream complete
- `ping` - Keep-alive
- `error` - Error occurred

### Custom Stream Handling

```tsx
const apiConfig = {
  endpoint: "/api/ai",
  transform StreamResponse: (response: Response) => {
    // Custom SSE parsing logic
    return customParseSSE(response);
  },
};
```

## Prompt Caching

Reduce costs by caching large contexts with `cache_control`.

### Basic Usage

```tsx
const config = {
  system: [
    {
      type: "text",
      text: largeDocumentation,
      cache_control: { type: "ephemeral" }, // Cache this
    },
    {
      type: "text",
      text: "You are a helpful assistant.",
    },
  ],
  modelConfig: {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
  },
};
```

### Message-Level Caching

```tsx
const messageWithCache: MessageParam = {
  role: "user",
  content: largeContext,
  cache_control: { type: "ephemeral" },
};
```

### Cost Savings

Cached tokens cost **90% less** to read than regular input tokens:

| Model      | Regular Input | Cache Read | Savings |
| ---------- | ------------- | ---------- | ------- |
| Sonnet 3.5 | $3.00/1M      | $0.30/1M   | 90%     |
| Opus 3     | $15.00/1M     | $1.50/1M   | 90%     |
| Haiku 3    | $0.25/1M      | $0.03/1M   | 88%     |

### View Cache Statistics

```tsx
const { usage } = useAIChat();

// Usage includes cache metrics
usage().cache_creation_input_tokens; // Tokens written to cache
usage().cache_read_input_tokens; // Tokens read from cache
```

## Model Configuration

### All Anthropic Parameters

```tsx
const modelConfig: AnthropicModelConfig = {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 4096,
  temperature: 0.7, // 0-1, creativity control
  top_p: 0.9, // Nucleus sampling
  top_k: 40, // Top-k sampling
  stop_sequences: ["\n\n"], // Custom stop sequences
  metadata: {
    user_id: "user-123", // Track usage per user
  },
};
```

### Available Models

```typescript
type AnthropicModel =
  | "claude-3-5-sonnet-20241022" // Latest Sonnet (recommended)
  | "claude-3-5-sonnet-20240620" // Previous Sonnet
  | "claude-3-opus-20240229" // Most capable
  | "claude-3-sonnet-20240229" // Balanced
  | "claude-3-haiku-20240307" // Fastest, cheapest
  | string; // Future models
```

### Model Selection Guide

**Use Sonnet 3.5** (default) for:

- Most applications
- Best balance of speed, cost, and capability
- Supports all features including prompt caching

**Use Opus 3** for:

- Complex reasoning tasks
- Maximum accuracy requirements
- When cost is secondary to quality

**Use Haiku 3** for:

- High-volume, simple tasks
- Cost-sensitive applications
- Fast response requirements

## Token Tracking & Cost Estimation

### Usage Display Component

```tsx
import { UsageDisplay } from "@timroberton/panther";

<UsageDisplay
  usage={usage()}
  model="claude-3-5-sonnet-20241022"
  showCost={true}
  compact={false}
/>;
```

### Built-in UI Display

```tsx
<AIChat
  showUsage={true}
  showCost={true}
  model="claude-3-5-sonnet-20241022"
/>;
```

Shows compact usage bar at bottom of chat:

```
2.5K in / 1.2K out • $0.0123
```

### Programmatic Access

```tsx
const { usage, usageHistory } = useAIChat();

// Current message usage
const current = usage();
console.log(current.input_tokens);
console.log(current.output_tokens);
console.log(current.cache_creation_input_tokens);
console.log(current.cache_read_input_tokens);

// All messages in conversation
const history = usageHistory();
const totalUsage = aggregateUsage(history);
```

### Cost Calculation

```tsx
import { calculateCost, formatCost } from "@timroberton/panther";

const cost = calculateCost(usage(), "claude-3-5-sonnet-20241022");

console.log(cost.inputCost); // Regular input cost
console.log(cost.outputCost); // Output cost
console.log(cost.cacheCost); // Cache write cost
console.log(cost.cacheReadCost); // Cache read cost
console.log(cost.totalCost); // Total cost in USD

console.log(formatCost(cost.totalCost)); // "$0.0123"
```

### Pricing (as of 2024)

| Model      | Input    | Output   | Cache Write | Cache Read |
| ---------- | -------- | -------- | ----------- | ---------- |
| Sonnet 3.5 | $3/1M    | $15/1M   | $3.75/1M    | $0.30/1M   |
| Opus 3     | $15/1M   | $75/1M   | $18.75/1M   | $1.50/1M   |
| Haiku 3    | $0.25/1M | $1.25/1M | $0.30/1M    | $0.03/1M   |

_Prices are per million tokens_

## System Prompts

### String System Prompt

```tsx
const config = {
  system: "You are a helpful coding assistant specialized in TypeScript.",
  modelConfig: {/* ... */},
};
```

### Multi-Block System Prompt

```tsx
const config = {
  system: [
    {
      type: "text",
      text: "You are a helpful assistant.",
    },
    {
      type: "text",
      text: largeCodebase,
      cache_control: { type: "ephemeral" }, // Cache large context
    },
  ],
  modelConfig: {/* ... */},
};
```

## Complete Configuration Example

```tsx
import { AIChat, AIChatProvider } from "@timroberton/panther";

const tools = [/* tool definitions */];

<AIChatProvider
  config={{
    // API Configuration
    apiConfig: {
      endpoint: "/api/ai/chat",
      transformRequest: async (payload) => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      }),
    },

    // Model Configuration (required)
    modelConfig: {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
      metadata: {
        user_id: "user-123",
      },
    },

    // System Prompt with Caching
    system: [
      {
        type: "text",
        text: documentation,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "You are a helpful assistant.",
      },
    ],

    // Tools
    tools,

    // Streaming
    enableStreaming: true,

    // Conversation
    conversationId: "project-123",

    // Display
    displayExtractors: [customExtractor],
  }}
>
  <AIChat
    showUsage={true}
    showCost={true}
    model="claude-3-5-sonnet-20241022"
  />
</AIChatProvider>;
```

## Server Implementation

Your server endpoint must support the Anthropic Messages API format.

### Minimal Server (Node.js + Anthropic SDK)

```typescript
import Anthropic from "@anthropic-ai/sdk";

app.post("/api/ai/chat", async (req, res) => {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const { messages, tools, system, stream, ...modelConfig } = req.body;

  if (stream) {
    // Streaming response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await anthropic.messages.create({
      ...modelConfig,
      messages,
      system,
      tools,
      stream: true,
    });

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } else {
    // Blocking response
    const response = await anthropic.messages.create({
      ...modelConfig,
      messages,
      system,
      tools,
      stream: false,
    });

    res.json(response);
  }
});
```

### With Prompt Caching

The Anthropic SDK automatically handles prompt caching when you include
`cache_control` in your messages or system prompts. No additional server code
needed.

### Security Considerations

1. **Never expose API key to client** - Always proxy through your server
2. **Validate requests** - Check user permissions before forwarding
3. **Rate limiting** - Implement per-user rate limits
4. **Cost tracking** - Monitor usage per user/conversation
5. **Content filtering** - Apply safety filters if needed

## Performance Optimization

### 1. Use Streaming for Better UX

Streaming makes responses feel instant even with longer generations:

```tsx
enableStreaming: true; // Much better perceived performance
```

### 2. Leverage Prompt Caching

Cache large, repeated contexts:

```tsx
system: [
  {
    type: "text",
    text: largeDocumentation, // Cache this
    cache_control: { type: "ephemeral" },
  },
];
```

Cache savings compound:

- First request: Pays to write cache
- Next ~10 requests: 90% cheaper reads
- Saves money and improves latency

### 3. Choose Right Model

- **Haiku**: 3-5x faster than Sonnet, 10x cheaper
- **Sonnet**: Best balance
- **Opus**: Use only when necessary

### 4. Optimize max_tokens

Lower `max_tokens` = faster responses and lower cost:

```tsx
modelConfig: {
  max_tokens: 1024,  // Instead of 4096 if you don't need long responses
}
```

### 5. Use stop_sequences

Stop generation early when pattern detected:

````tsx
modelConfig: {
  stop_sequences: ["\n\n", "```"],  // Stop at double newline or code fence
}
````

## Migration from Basic Config

### Before (No Anthropic Features)

```tsx
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    tools,
    conversationId: "user-123",
  }}
>
  <AIChat />
</AIChatProvider>;
```

### After (With Anthropic Features)

```tsx
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    modelConfig: { // Now required
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
    },
    system: largeContext, // Optional
    enableStreaming: true, // Optional
    tools,
    conversationId: "user-123",
  }}
>
  <AIChat
    showUsage={true}
    showCost={true}
    model="claude-3-5-sonnet-20241022"
  />
</AIChatProvider>;
```

**Breaking Change**: `modelConfig` is now required. Update all configurations to
include it.

## Best Practices

1. **Always use streaming** - Better UX, no downside
2. **Cache large contexts** - 90% cost savings
3. **Track usage** - Monitor costs per user/conversation
4. **Start with Sonnet** - Best default choice
5. **Use system prompts** - More efficient than user messages
6. **Set reasonable max_tokens** - Don't overpay for unused capacity
7. **Implement rate limiting** - Protect against abuse
8. **Monitor cache hit rates** - Optimize cache strategy

## Troubleshooting

### Streaming not working

- Check server returns `Content-Type: text/event-stream`
- Verify SSE format: `data: {json}\n\n`
- Check browser console for parsing errors

### Cache not saving money

- Ensure `cache_control` is set correctly
- Cache only works for messages >1024 tokens
- Cache TTL is ~5 minutes, must reuse quickly

### High costs

- Check `showUsage` and `showCost` to see breakdown
- Verify prompt caching is working (check `cache_read_input_tokens`)
- Consider switching to Haiku for simple tasks
- Lower `max_tokens` if generating too much

### Slow responses

- Enable streaming for perceived performance
- Use Haiku for speed-critical paths
- Check if caching reduces latency
- Optimize prompt length

## Future Anthropic Features

Planned additions:

- Vision support (image inputs)
- Tool choice control (`auto`, `any`, `tool`)
- Extended thinking blocks display
- Computer use integration
- Message editing and regeneration

See [GitHub issues](https://github.com/anthropics/claude-code/issues) for
requests and updates.
