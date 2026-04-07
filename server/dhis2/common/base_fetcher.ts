/**
 * Base fetcher for DHIS2 API calls
 * Provides common functionality for all DHIS2 API interactions
 */

import { RetryOptions, withRetry } from "./retry_utils.ts";
import { type Dhis2Credentials } from "lib";

export interface FetchOptions extends RequestInit {
  retryOptions?: RetryOptions;
  timeout?: number;
  logRequest?: boolean;
  logResponse?: boolean;
  dhis2Credentials: Dhis2Credentials;
}

export interface DHIS2FetchError extends Error {
  status?: number;
  statusText?: string;
  url?: string;
  responseBody?: string;
}

/**
 * Create basic auth header for DHIS2
 */
export function createAuthHeader(credentials: {
  username: string;
  password: string;
}): string {
  const username = credentials.username;
  const password = credentials.password;
  return `Basic ${btoa(`${username}:${password}`)}`;
}

/**
 * Build a full DHIS2 API URL
 */
export function buildUrl(
  endpoint: string,
  customUrl: string,
  params?: URLSearchParams | Record<string, string>
): string {
  const baseUrl = customUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}${endpoint}`);

  if (params) {
    const searchParams =
      params instanceof URLSearchParams ? params : new URLSearchParams(params);

    searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  return url.toString();
}

/**
 * Base fetch function with retry logic
 */
export async function fetchFromDHIS2<T = any>(
  endpoint: string,
  options: FetchOptions
): Promise<T> {
  const {
    retryOptions,
    timeout = 120000, // 2 minutes default
    logRequest = false,
    logResponse = false,
    dhis2Credentials,
    ...fetchOptions
  } = options;

  const url = endpoint.startsWith("http")
    ? endpoint
    : buildUrl(endpoint, dhis2Credentials.url);

  const fetchFn = async () => {
    const startTime = Date.now();

    // Add auth and default headers
    const headers = new Headers(fetchOptions.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", createAuthHeader(dhis2Credentials));
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    // Prevents DHIS2 v2.28+ from returning 302 redirects instead of 401
    if (!headers.has("X-Requested-With")) {
      headers.set("X-Requested-With", "XMLHttpRequest");
    }

    if (logRequest) {
      console.log(`[DHIS2] Request: ${fetchOptions.method || "GET"} ${url}`);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      if (logResponse) {
        console.log(`[DHIS2] Response: ${response.status} in ${duration}ms`);
      }

      if (!response.ok) {
        const error = await createDHIS2Error(response, url);
        throw error;
      }

      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`DHIS2 request timeout after ${timeout}ms: ${url}`);
      }

      throw error;
    }
  };

  return withRetry(fetchFn, retryOptions);
}

/**
 * Create a detailed error from DHIS2 response
 */
async function createDHIS2Error(
  response: Response,
  url: string
): Promise<DHIS2FetchError> {
  let errorDetails = "";
  let responseBody = "";

  try {
    responseBody = await response.text();

    // Try to parse as JSON for structured error
    try {
      const errorJson = JSON.parse(responseBody);
      errorDetails = errorJson.message || errorJson.error || "";
    } catch {
      // Not JSON, use text as-is
      errorDetails = responseBody.substring(0, 500);
    }
  } catch {
    errorDetails = "Could not read error response body";
  }

  const error = new Error(
    `DHIS2 API Error (${response.status}): ${response.statusText}. ${errorDetails}`
  ) as DHIS2FetchError;

  error.status = response.status;
  error.statusText = response.statusText;
  error.url = url;
  error.responseBody = responseBody;

  return error;
}

export type Dhis2ValidationResult =
  | { valid: true }
  | { valid: false; reason: "dhis2_unavailable"; message: string }
  | { valid: false; reason: "invalid_url"; message: string }
  | { valid: false; reason: "bad_credentials"; message: string }
  | { valid: false; reason: "server_error"; message: string };

const VALIDATION_TIMEOUT = 10000;

export async function validateDhis2Connection(
  credentials: Dhis2Credentials,
): Promise<Dhis2ValidationResult> {
  // Phase 1 — Verify this is a real DHIS2 instance (unauthenticated, follow redirects)
  const phase1Url = buildUrl("/api/system/info.json", credentials.url);
  const phase1Controller = new AbortController();
  const phase1Timeout = setTimeout(
    () => phase1Controller.abort(),
    VALIDATION_TIMEOUT,
  );
  try {
    const response = await fetch(phase1Url, {
      signal: phase1Controller.signal,
    });
    const text = await response.text();

    // Check if response is DHIS2 JSON (some instances allow unauthenticated system info)
    let isDhis2 = false;
    try {
      const json = JSON.parse(text);
      if (json.version) {
        isDhis2 = true;
      }
    } catch {
      // Not JSON — check if HTML contains DHIS2 markers (login page redirect)
      if (text.includes("DHIS") || text.includes("dhis2")) {
        isDhis2 = true;
      }
    }

    if (!isDhis2) {
      return {
        valid: false,
        reason: "invalid_url",
        message:
          "This URL does not point to a valid DHIS2 instance. Please check the base URL (e.g. https://dhis2.example.org).",
      };
    }
  } catch {
    return {
      valid: false,
      reason: "dhis2_unavailable",
      message:
        "Could not connect to a DHIS2 server at this URL. Check that the URL is correct and that the DHIS2 instance is running.",
    };
  } finally {
    clearTimeout(phase1Timeout);
  }

  // Phase 2 — Auth check (authenticated)
  const phase2Url = buildUrl("/api/me.json", credentials.url);
  const phase2Controller = new AbortController();
  const phase2Timeout = setTimeout(
    () => phase2Controller.abort(),
    VALIDATION_TIMEOUT,
  );
  try {
    const response = await fetch(phase2Url, {
      headers: {
        Authorization: createAuthHeader(credentials),
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: phase2Controller.signal,
      redirect: "manual",
    });
    if (response.status === 401 || response.status === 403 || response.status === 302) {
      return {
        valid: false,
        reason: "bad_credentials",
        message:
          "A DHIS2 server was found and is online, but authentication failed. Check your username and password, and verify that the URL is correct.",
      };
    }
    if (!response.ok) {
      return {
        valid: false,
        reason: "server_error",
        message: `The DHIS2 server was reached but returned an unexpected error (status ${response.status}). Please try again.`,
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      reason: "server_error",
      message:
        "Connection to DHIS2 failed during authentication. Please try again.",
    };
  } finally {
    clearTimeout(phase2Timeout);
  }
}

/**
 * Convenience method for GET requests
 */
export async function getDHIS2<T = any>(
  endpoint: string,
  options: FetchOptions,
  params?: URLSearchParams | Record<string, string>
): Promise<T> {
  const url = buildUrl(endpoint, options.dhis2Credentials.url, params);
  return fetchFromDHIS2<T>(url, {
    ...options,
    method: "GET",
  });
}

