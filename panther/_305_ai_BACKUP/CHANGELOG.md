# Changelog

## v2.0.0 - Anthropic-First Update (2025-01-XX)

### ✨ New Features

#### Streaming Support

- Real-time text generation with Server-Sent Events (SSE)
- Character-by-character display with cursor animation
- Enable with `enableStreaming: true`
- Fully automatic - no additional configuration needed

#### Prompt Caching

- Reduce costs by 90% on repeated contexts
- Support for `cache_control: { type: "ephemeral" }` on messages and system
  prompts
- Multi-block system prompts with per-block caching
- Automatic cache hit tracking in usage statistics

#### Token Tracking & Cost Estimation

- Detailed usage statistics including cache metrics
- Built-in cost calculator for all Anthropic models
- `UsageDisplay` component with compact and full modes
- `showUsage` and `showCost` props on `AIChat` component
- Programmatic access via `usage()` and `usageHistory()`

#### Full Model Configuration

- All Anthropic parameters exposed: `temperature`, `top_p`, `top_k`,
  `stop_sequences`, `metadata`
- Type-safe model selection with `AnthropicModel` type
- Support for all current Claude models (3.5 Sonnet, Opus, Sonnet, Haiku)

### 🔧 Changes

#### Breaking Changes

- **`modelConfig` is now required** in `AIChatConfig`
  - Must specify `model` and `max_tokens`
  - Example:
    `modelConfig: { model: "claude-3-5-sonnet-20241022", max_tokens: 4096 }`
- Server payload format expanded to include model configuration
- `Usage` type extended with cache metrics

#### New Components

- `StreamingTextRenderer` - Displays streaming text with cursor animation
- `UsageDisplay` - Shows token counts and cost estimates

#### New Utilities

- `calculateCost()` - Calculate costs from usage
- `formatCost()` - Format currency values
- `formatTokenCount()` - Format token counts (e.g., "2.5K")
- `aggregateUsage()` - Combine multiple usage objects
- `callAIAPIStreaming()` - Streaming API client

#### Enhanced Types

- `CacheControl` - Prompt caching configuration
- `StreamEvent` - SSE stream event types
- `Usage` - Extended with cache metrics
- `AnthropicModel` - All available models
- `AnthropicModelConfig` - Full model configuration
- `CostEstimate` - Cost breakdown by component

### 📚 Documentation

- Comprehensive [ANTHROPIC_FEATURES.md](./ANTHROPIC_FEATURES.md) guide
- Updated [README.md](./README.md) with all new features
- Breaking changes section with migration guide
- Updated TypeScript types documentation
- Added server implementation examples for streaming

### 🔄 Migration Guide

```tsx
// Before v2.0
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    tools,
  }}
>
  <AIChat />
</AIChatProvider>

// After v2.0 (with all new features)
<AIChatProvider
  config={{
    apiConfig: { endpoint: "/api/ai" },
    modelConfig: {  // Required
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      temperature: 0.7,
    },
    system: [
      {
        type: "text",
        text: largeContext,
        cache_control: { type: "ephemeral" },  // Cache for 90% savings
      },
    ],
    enableStreaming: true,  // Real-time responses
    tools,
  }}
>
  <AIChat
    showUsage={true}  // Show token counts
    showCost={true}   // Show cost estimate
    model="claude-3-5-sonnet-20241022"
  />
</AIChatProvider>
```

### 🐛 Bug Fixes

- Fixed auto-scroll behavior with streaming text
- Improved error handling for stream interruptions
- Better type safety for tool handlers

### ⚡ Performance

- Streaming provides instant perceived performance
- Prompt caching reduces latency for repeated contexts
- Optimized message rendering with streaming state

## v1.0.0 - Initial Release

### Features

- Layered API (low-level hooks + high-level components)
- Tool system with custom handlers and renderers
- Server proxy pattern for API calls
- Customizable display rendering
- Smart auto-scroll
- Conversation persistence
- Full TypeScript support
- SolidJS integration
- Tailwind CSS styling
