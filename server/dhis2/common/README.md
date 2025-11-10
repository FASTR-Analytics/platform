# Common Utilities

Shared utilities used across all DHIS2 integration goals.

## Overview

This folder contains reusable components that provide core functionality for all DHIS2 API interactions:
- Retry logic with exponential backoff
- Base HTTP fetcher with authentication
- Error handling and logging
- URL construction utilities

## Files

### retry_utils.ts
Provides configurable retry logic for handling transient failures.

**Key Features:**
- Exponential backoff with jitter
- Configurable retry policies
- Smart error detection (don't retry client errors)
- Progress callbacks

**Main Functions:**
- `withRetry()` - Wrap any async function with retry logic
- `makeRetryable()` - Create a retryable version of a function

**Retry Policies:**
```typescript
// Default (5 attempts, 1-30 sec delays)
DEFAULT_RETRY_OPTIONS

// For rate-limited APIs (10 attempts, longer delays)
RATE_LIMITED_RETRY_OPTIONS  

// Quick retry (3 attempts, short delays)
QUICK_RETRY_OPTIONS

// No retry
NO_RETRY_OPTIONS
```

**Usage:**
```typescript
import { withRetry } from "./retry_utils.ts";

const result = await withRetry(
  () => fetchSomeData(),
  {
    maxAttempts: 5,
    initialDelayMs: 1000,
    onRetry: (attempt, error, delay) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    }
  }
);
```

### base_fetcher.ts
Base HTTP client for all DHIS2 API calls.

**Key Features:**
- Automatic authentication header injection
- Timeout handling
- Request/response logging
- Error response parsing
- URL building utilities

**Main Functions:**
- `fetchFromDHIS2()` - Base fetch with retry support
- `getDHIS2()` - Convenience GET method
- `postDHIS2()` - Convenience POST method
- `buildUrl()` - Construct DHIS2 API URLs
- `checkUrlLength()` - Warn if URL too long

**Configuration:**
```typescript
interface FetchOptions {
  retryOptions?: RetryOptions;  // Custom retry behavior
  timeout?: number;              // Request timeout (default 2 min)
  logRequest?: boolean;          // Log requests to console
  logResponse?: boolean;         // Log responses to console
}
```

**Usage:**
```typescript
import { getDHIS2 } from "./base_fetcher.ts";

const data = await getDHIS2(
  "/api/organisationUnits.json",
  { fields: "id,name", paging: "false" },
  { timeout: 60000, logRequest: true }
);
```

### Authentication
Both utilities use environment variables for DHIS2 credentials:
- `DHIS2_URL` - Base URL of DHIS2 instance
- `DHIS2_USERNAME` - Username for authentication
- `DHIS2_PASSWORD` - Password for authentication

### Error Handling

**DHIS2FetchError:**
```typescript
interface DHIS2FetchError extends Error {
  status?: number;        // HTTP status code
  statusText?: string;    // HTTP status text
  url?: string;          // Request URL
  responseBody?: string; // Full error response
}
```

Errors include detailed context for debugging:
- Request URL and parameters
- HTTP status codes
- DHIS2 error messages
- Response body (truncated)

## Retry Logic Details

### Default Behavior
- **Max attempts**: 5
- **Initial delay**: 1 second
- **Max delay**: 30 seconds
- **Backoff multiplier**: 2x
- **Jitter**: ±25% randomization

### Smart Retry Detection
- ✅ Retry: Network errors, timeouts, 5xx errors, 429 (rate limit)
- ❌ Don't retry: 4xx client errors (except 429)
- ✅ Retry: Connection failures, DNS errors

### Exponential Backoff
Delays increase exponentially with jitter:
```
Attempt 1: ~1 second
Attempt 2: ~2 seconds
Attempt 3: ~4 seconds
Attempt 4: ~8 seconds
Attempt 5: ~16 seconds (capped at max)
```

## URL Building

The `buildUrl()` function handles:
- Base URL normalization (removes trailing slashes)
- Query parameter encoding
- URLSearchParams or plain objects
- Proper parameter concatenation

Example:
```typescript
buildUrl("/api/analytics.json", {
  dimension: "dx:ABC123",
  filter: "pe:202301"
});
// Returns: https://dhis2.org/api/analytics.json?dimension=dx%3AABC123&filter=pe%3A202301
```

## Examples

The `examples/` folder contains:
- **test_retry_utils.ts** - Test retry logic with various scenarios

Run example:
```bash
cd common/examples
deno run test_retry_utils.ts
```

## Best Practices

1. **Always use retry** for network calls
2. **Configure timeouts** based on expected response times
3. **Log failures** in production for monitoring
4. **Use appropriate retry policy** for your use case
5. **Handle errors gracefully** at the application level

## Integration

These utilities are used by all GOAL modules:
- GOAL 1 uses them for fetching org units
- GOAL 2 will use them for indicators
- GOAL 3 uses them for analytics queries

## Testing

The retry logic has been tested with:
- Successful operations (no retry)
- Transient failures (retry and succeed)
- Permanent failures (don't retry)
- Rate limiting (retry with backoff)
- Network timeouts (retry with timeout)

## Performance

- **Zero overhead** for successful requests
- **Minimal memory usage** - no request queuing
- **Configurable timeouts** prevent hanging requests
- **Jitter prevents thundering herd** problem

## Status

✅ **FULLY IMPLEMENTED** - All utilities are working and tested.