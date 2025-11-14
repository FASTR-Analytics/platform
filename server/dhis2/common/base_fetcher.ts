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

