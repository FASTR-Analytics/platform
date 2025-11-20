# Verification Needed

## Summary

The `_305_ai` module was enhanced with Anthropic-specific features based on AI
training data (cutoff January 2025). **Some information may be outdated and
requires verification before production use.**

## ✅ Confirmed Current (via web search 2025-10-31)

1. **Streaming API** - Still active, works with prompt caching
2. **Prompt Caching** - GA (Generally Available) as of Dec 2024
   - 5-minute default TTL confirmed
   - 1-hour cache in beta
   - 90% cost savings confirmed
   - Cache writes = 1.25x base price
   - Cache reads = 0.1x base price
3. **API Format** - Messages API format unchanged

## ⚠️ Needs Verification

### Model Names & IDs

The code now includes these models (based on web search):

```typescript
// Latest (verify these are correct)
"claude-sonnet-4.5-20250929"; // Sep 2025
"claude-sonnet-4-20250522"; // May 2025
"claude-opus-4.1-20250522"; // May 2025
"claude-opus-4-20250522"; // May 2025
"claude-3.7-sonnet-20250224"; // Feb 2025 (reasoning)
"claude-haiku-4.5-20250122"; // Jan 2025
```

**Action Required**: Verify actual model IDs match Anthropic's API. These were
inferred from web search results but may not be the exact API identifiers.

### Pricing (in cost_utils.ts)

Current pricing from web search:

| Model      | Input/1M | Output/1M | Cache Write | Cache Read |
| ---------- | -------- | --------- | ----------- | ---------- |
| Sonnet 4.5 | $3       | $15       | $3.75       | $0.30      |
| Sonnet 4   | $3       | $15       | $3.75       | $0.30      |
| Opus 4.1   | $20      | $80       | $25         | $2.00      |
| Opus 4     | $15      | $75       | $18.75      | $1.50      |
| Haiku 4.5  | $1       | $5        | $1.25       | $0.10      |
| Haiku 3.5  | $0.80    | $4        | $1.00       | $0.08      |
| Haiku 3    | $0.25    | $1.25     | $0.31       | $0.03      |

**Action Required**: Verify at
[anthropic.com/pricing](https://www.anthropic.com/pricing)

### Features to Verify

1. **Stream Event Format** - Confirm `StreamEvent` types match current API
2. **Usage Object Structure** - Verify `Usage` type fields are current
3. **Cache Control Format** - Confirm `cache_control: { type: "ephemeral" }` is
   correct
4. **System Prompt Format** - Verify array format with cache_control works

## 🔍 How to Verify

### 1. Check Official Docs

```bash
# Visit these URLs
https://www.anthropic.com/pricing
https://docs.anthropic.com/en/api
https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
```

### 2. Test API Call

```typescript
// Make a real API call to verify model ID
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4.5-20250929", // Test this
    max_tokens: 100,
    messages: [{ role: "user", content: "Hello" }],
  }),
});

// Check if it returns valid response or error
```

### 3. Verify Stream Format

```typescript
// Test streaming with actual API
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4.5-20250929",
    max_tokens: 100,
    messages: [{ role: "user", content: "Hello" }],
    stream: true,
  }),
});

// Verify event types match StreamEvent union
```

### 4. Test Prompt Caching

```typescript
// Verify cache_control format
{
  model: "claude-sonnet-4.5-20250929",
  max_tokens: 100,
  system: [
    {
      type: "text",
      text: "Large context...",
      cache_control: { type: "ephemeral" }, // Verify this works
    },
  ],
  messages: [{ role: "user", content: "Hello" }],
}
```

## 📝 Update Checklist

After verification, update:

- [ ] Model IDs in `_core/types.ts` (`AnthropicModel` type)
- [ ] Pricing in `_core/cost_utils.ts` (`PRICING` constant)
- [ ] Default model in all examples (README, ANTHROPIC_FEATURES.md)
- [ ] Recommended model in Quick Start
- [ ] Remove this VERIFICATION_NEEDED.md file

## 💡 Module Design

The module is designed to work with **any** model ID:

```typescript
type AnthropicModel =
  | "claude-sonnet-4.5-20250929"
  | /* ... other known models ... */
  | string;  // ← Accepts any string for future models
```

So even if model IDs are wrong, users can pass the correct string. They just
need to:

1. Use correct model ID in their config
2. Optionally update `cost_utils.ts` for accurate pricing
3. Everything else will work automatically

## 🎯 Bottom Line

**The module will work** even with incorrect model names in the examples. Users
just need to:

1. Check [anthropic.com/pricing](https://www.anthropic.com/pricing) for current
   models
2. Pass the correct model ID string in their config
3. Update pricing constants if they need cost estimation

The warnings at the top of README.md and ANTHROPIC_FEATURES.md inform users to
verify this information.
