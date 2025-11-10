import { APIResponseNoData, APIResponseWithData } from "lib";
import { clerk } from "~/components/LoggedInWrapper";
import {
  reportNetworkFailure,
  reportNetworkSuccess,
} from "~/utils/connection-monitor";

const _EXTRA_TIME = process.env.NODE_ENV === "development";

export async function tryCatchServer<
  T extends APIResponseNoData | APIResponseWithData<unknown>,
>(input: string | URL | Request, init?: RequestInit | undefined): Promise<T> {
  const maxRetries = 2;
  let retries = 0;
  let lastAuthError = false;

  // Determine if this is a safe method that can be retried
  const method = init?.method || 'GET';
  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

  while (retries <= maxRetries) {
    try {
      if (_EXTRA_TIME && retries === 0) {
        await new Promise((res) => setTimeout(res, 500));
      }

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      // Use longer timeout for DHIS2 staging which can be slow
      const isDhis2Staging =
        typeof input === "string" &&
        input.includes("/structure/step3_dhis2_stage_data");
      const timeout = isDhis2Staging ? 600000 : 300000; // 10 minutes for DHIS2 staging, 5 minutes default
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 - but with retry logic for network issues
      if (res.status === 401) {
        // Try to parse the response to see if it's a real auth error
        try {
          const body = await res.json();
          // If server explicitly says it's an auth error, sign out immediately
          if (
            body.authError === true ||
            body.err?.includes("not authorized") ||
            body.err?.includes("not authenticated")
          ) {
            await clerk.signOut();
            window.location.href = "/";
            return { success: false, err: "Not authenticated" } as T;
          }
        } catch {
          // If we can't parse the body, it might be a network issue
        }

        // For other 401s, retry in case it's a temporary issue (only for safe methods)
        lastAuthError = true;
        if (retries === maxRetries || !isSafeMethod) {
          // Only sign out after multiple failed auth attempts or for unsafe methods
          // await clerk.signOut();
          // window.location.href = "/";
          return {
            success: false,
            err: "401 status error",
          } as T;
        }
        retries++;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }

      // Handle 503 Service Unavailable (server having issues) - only retry safe methods
      if (res.status === 503) {
        if (retries === maxRetries || !isSafeMethod) {
          return {
            success: false,
            err: "Service temporarily unavailable - please try again",
          } as T;
        }
        retries++;
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, retries)));
        continue;
      }

      // Handle other non-OK responses
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          err: text || `Server error: ${res.status}`,
        } as T;
      }

      // Parse JSON response
      try {
        const result = await res.json();
        // Report success if we got a valid response
        reportNetworkSuccess();
        return result;
      } catch (jsonError) {
        return {
          success: false,
          err: "Invalid response format from server",
        } as T;
      }
    } catch (e) {
      // Network/timeout errors - only retry safe methods
      if (e instanceof Error && e.name === "AbortError") {
        reportNetworkFailure();
        if (retries === maxRetries || !isSafeMethod) {
          return {
            success: false,
            err: lastAuthError
              ? "Connection timeout during authentication - please check your connection and try again"
              : "Request timed out - please check your connection",
          } as T;
        }
        retries++;
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, retries)));
        continue;
      }

      if (e instanceof TypeError && e.message.includes("Failed to fetch")) {
        reportNetworkFailure();
        if (retries === maxRetries || !isSafeMethod) {
          return {
            success: false,
            err: lastAuthError
              ? "Network error during authentication - please check your connection"
              : "Network error - please check your connection",
          } as T;
        }
        retries++;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }

      // Unknown errors - only retry safe methods
      if (retries === maxRetries || !isSafeMethod) {
        console.error(e);
        return { success: false, err: "Could not connect to server" } as T;
      }

      // Retry with exponential backoff
      retries++;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
    }
  }

  // This should never be reached, but TypeScript needs it
  return { success: false, err: "Unexpected error" } as T;
}
