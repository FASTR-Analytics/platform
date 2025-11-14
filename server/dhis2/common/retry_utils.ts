/**
 * Retry utility for DHIS2 API calls
 * Provides configurable retry logic with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
  shouldRetry: (error: Error) => {
    // Don't retry 4xx errors except 429 (rate limit)
    const message = error.message;
    if (
      message.includes("API Error (4") ||
      message.includes("download failed: 4")
    ) {
      return message.includes("429");
    }
    // Retry network errors and 5xx errors
    return true;
  },
  onRetry: (attempt: number, error: Error, delayMs: number) => {
    console.log(
      `DHIS2 request failed (attempt ${attempt}): ${error.message}. ` +
        `Retrying in ${Math.round(delayMs / 1000)}s...`
    );
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Last attempt, throw the error
      if (attempt === opts.maxAttempts) {
        throw new Error(
          `Failed after ${opts.maxAttempts} attempts. Last error: ${lastError.message}`
        );
      }

      // Calculate delay with exponential backoff
      const baseDelay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      // Add jitter (±jitterFactor randomization)
      const jitter = baseDelay * opts.jitterFactor;
      const delay = baseDelay + (Math.random() * 2 - 1) * jitter;

      // Notify about retry
      opts.onRetry(attempt, lastError, delay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached due to the throw in the loop
  throw lastError || new Error("Unexpected error in retry logic");
}
